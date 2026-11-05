// ============================================================
// storage/backup.ts —— 导出/导入文件处理（与 favorites 配合）
// 导出用 Blob + a[download]，不申请 downloads 权限
// ============================================================

import { APP_VERSION } from '../shared/constants';
import type { BackupFile } from '../shared/types';
import { exportBackup, importBackup, type ImportReport } from './favorites';

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
