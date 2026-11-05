// ============================================================
// storage/backup.ts —— 导出/导入文件处理（与 favorites 配合）
// 导出用 Blob + a[download]，不申请 downloads 权限
// ============================================================

import { APP_VERSION } from '../shared/constants';
import type { BackupFile } from '../shared/types';
import { exportBackup, importBackup, getDirHandle, saveDirHandle, clearDirHandle, type ImportReport } from './favorites';

const DIR_HANDLE_NAME = 'backup';
const BACKUP_FILENAME = 'lingualens-backup.json';
const AUTO_BACKUP_KEY = 'll_auto_backup';
const LAST_BACKUP_KEY = 'll_last_backup';

/** 用户自选文件夹句柄（File System Access，Chrome 支持；默认仍是浏览器本地存储） */
interface DirHandleWithPerms extends FileSystemDirectoryHandle {
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

export async function exportToFile(): Promise<{ filename: string; entries: number }> {
  const backup = await exportBackup(APP_VERSION);
  const filename = `lingualens-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { filename, entries: backup.entries.length };
}

// ---------- 自定义备份目录 ----------

export async function isAutoBackupEnabled(): Promise<boolean> {
  return Boolean((await chrome.storage.local.get(AUTO_BACKUP_KEY))[AUTO_BACKUP_KEY]);
}

export async function setAutoBackupEnabled(v: boolean): Promise<void> {
  await chrome.storage.local.set({ [AUTO_BACKUP_KEY]: v });
}

export async function lastBackupAt(): Promise<number> {
  return Number((await chrome.storage.local.get(LAST_BACKUP_KEY))[LAST_BACKUP_KEY] ?? 0);
}

/** 弹出系统文件夹选择器，把句柄存本地（此后可写入该目录） */
export async function pickBackupDir(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const w = window as unknown as { showDirectoryPicker?: (opts?: { id?: string; mode?: 'readwrite' }) => Promise<DirHandleWithPerms> };
  if (typeof w.showDirectoryPicker !== 'function') {
    return { ok: false, error: '当前浏览器不支持文件夹备份' };
  }
  try {
    const handle = await w.showDirectoryPicker({ id: 'lingualens-backup', mode: 'readwrite' });
    await saveDirHandle(DIR_HANDLE_NAME, handle);
    return { ok: true, name: handle.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === 'AbortError' ? '已取消' : String(err) };
  }
}

async function ensureDirPermission(): Promise<DirHandleWithPerms | null> {
  const saved = await getDirHandle(DIR_HANDLE_NAME);
  if (!saved) return null;
  const h = saved.handle as DirHandleWithPerms;
  try {
    const q = await h.queryPermission({ mode: 'readwrite' });
    if (q === 'granted') return h;
    const r = await h.requestPermission({ mode: 'readwrite' });
    return r === 'granted' ? h : null;
  } catch {
    return null;
  }
}

/** 把完整备份写入用户选定文件夹（覆盖同名文件） */
export async function syncBackupToDir(): Promise<{ ok: boolean; message: string }> {
  const h = await ensureDirPermission();
  if (!h) return { ok: false, message: '还没有选择文件夹，或浏览器需要你重新授权（再点一次选择文件夹）' };
  try {
    const backup = await exportBackup(APP_VERSION);
    const fh = await h.getFileHandle(BACKUP_FILENAME, { create: true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(backup, null, 2));
    await writable.close();
    const now = Date.now();
    await chrome.storage.local.set({ [LAST_BACKUP_KEY]: now });
    return { ok: true, message: `已同步 ${backup.entries.length} 条到「${h.name}/${BACKUP_FILENAME}」` };
  } catch (err) {
    return { ok: false, message: `同步失败：${err instanceof Error ? err.message : String(err)}` };
  }
}

/** 库变更后的静默自动同步（无手势时权限不足则静默跳过） */
export async function autoBackupIfEnabled(): Promise<void> {
  if (!(await isAutoBackupEnabled())) return;
  const saved = await getDirHandle(DIR_HANDLE_NAME);
  if (!saved) return;
  const h = saved.handle as DirHandleWithPerms;
  try {
    if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
    const backup = await exportBackup(APP_VERSION);
    const fh = await h.getFileHandle(BACKUP_FILENAME, { create: true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(backup, null, 2));
    await writable.close();
    await chrome.storage.local.set({ [LAST_BACKUP_KEY]: Date.now() });
  } catch {
    // 静默失败：下次手动同步时用户会看到授权提示
  }
}

export async function removeBackupDir(): Promise<void> {
  await clearDirHandle(DIR_HANDLE_NAME);
  await setAutoBackupEnabled(false);
}

export async function importFromFile(file: File): Promise<ImportReport> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  return importBackup(parsed as BackupFile);
}
