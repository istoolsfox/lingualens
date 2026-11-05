// ============================================================
// storage/favorites.ts —— 本地知识库（IndexedDB，idb 封装）
// stores: entries / tags / practice
// ============================================================

import { openDB, type IDBPDatabase } from 'idb';
import type { BackupFile, Entry, PracticeSession, TagRow } from '../shared/types';

const DB_NAME = 'lingualens';
const DB_VERSION = 1;
const STORE_ENTRIES = 'entries';
const STORE_TAGS = 'tags';
const STORE_PRACTICE = 'practice';

interface LLDatabases {
  [STORE_ENTRIES]: Entry;
  [STORE_TAGS]: TagRow;
  [STORE_PRACTICE]: PracticeSession;
}

let dbPromise: Promise<IDBPDatabase<LLDatabases>> | null = null;

function db(): Promise<IDBPDatabase<LLDatabases>> {
  if (!dbPromise) {
    dbPromise = openDB<LLDatabases>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE_ENTRIES)) {
          d.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains(STORE_TAGS)) {
          d.createObjectStore(STORE_TAGS, { keyPath: 'name' });
        }
        if (!d.objectStoreNames.contains(STORE_PRACTICE)) {
          d.createObjectStore(STORE_PRACTICE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ---------- entries ----------

export function newId(): string {
  return crypto.randomUUID();
}

export async function addEntry(entry: Entry): Promise<void> {
  const d = await db();
  await d.put(STORE_ENTRIES, entry);
  await recomputeTags();
}

export async function updateEntry(entry: Entry): Promise<void> {
  entry.updatedAt = Date.now();
  await addEntry(entry);
}

export async function deleteEntry(id: string): Promise<void> {
  const d = await db();
  await d.delete(STORE_ENTRIES, id);
  await recomputeTags();
}

export async function deleteEntries(ids: string[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE_ENTRIES, 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
  await recomputeTags();
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const d = await db();
  return d.get(STORE_ENTRIES, id);
}

export async function listEntriesRaw(): Promise<Entry[]> {
  const d = await db();
  const all = await d.getAll(STORE_ENTRIES);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export interface ListFilter {
  type?: string;
  tag?: string;
  query?: string;
}

/** 列表 + 过滤（V1 内存过滤，千条量级足够；查询走 text/note/tags） */
export async function listEntries(filter: ListFilter = {}): Promise<Entry[]> {
  const all = await listEntriesRaw();
  const q = filter.query?.trim().toLowerCase();
  return all.filter((e) => {
    if (filter.type && e.type !== filter.type) return false;
    if (filter.tag && !e.tags.includes(filter.tag)) return false;
    if (q) {
      const hay = `${e.text}\n${e.note}\n${e.tags.join('\n')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------- tags ----------

export async function listTags(): Promise<TagRow[]> {
  const d = await db();
  const all = await d.getAll(STORE_TAGS);
  return all.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** 以 entries 实况重建 tags 计数（小数据量的诚实做法） */
export async function recomputeTags(): Promise<void> {
  const d = await db();
  const all = await d.getAll(STORE_ENTRIES);
  const counts = new Map<string, number>();
  for (const e of all) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tx = d.transaction(STORE_TAGS, 'readwrite');
  await tx.store.clear();
  for (const [name, count] of counts) await tx.store.put({ name, count } satisfies TagRow);
  await tx.done;
}

// ---------- practice ----------

export async function savePracticeSession(s: PracticeSession): Promise<void> {
  const d = await db();
  await d.put(STORE_PRACTICE, s);
}

export async function listPracticeSessions(limit = 30): Promise<PracticeSession[]> {
  const d = await db();
  const all = await d.getAll(STORE_PRACTICE);
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function deletePracticeSession(id: string): Promise<void> {
  const d = await db();
  await d.delete(STORE_PRACTICE, id);
}

// ---------- 备份 ----------

export async function exportBackup(appVersion: string): Promise<BackupFile> {
  const [entries, tags, practice] = await Promise.all([
    listEntriesRaw(),
    listTags(),
    listPracticeSessions(1000),
  ]);
  return {
    schemaVersion: 1,
    exportedAt: Date.now(),
    appVersion,
    entries,
    tags,
    practiceSessions: practice,
  };
}

export interface ImportReport {
  entriesAdded: number;
  entriesUpdated: number;
  practiceAdded: number;
}

/** 导入合并：按 id 去重，updatedAt 新者胜 */
export async function importBackup(file: BackupFile): Promise<ImportReport> {
  if (file.schemaVersion !== 1) throw new Error('不支持的备份格式版本');
  const d = await db();
  const report: ImportReport = { entriesAdded: 0, entriesUpdated: 0, practiceAdded: 0 };

  const tx = d.transaction([STORE_ENTRIES, STORE_PRACTICE], 'readwrite');
  for (const e of file.entries ?? []) {
    if (!e?.id || !e.text) continue;
    const existing = await tx.objectStore(STORE_ENTRIES).get(e.id);
    if (!existing) {
      await tx.objectStore(STORE_ENTRIES).put(normalizeEntry(e));
      report.entriesAdded++;
    } else if ((e.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      await tx.objectStore(STORE_ENTRIES).put(normalizeEntry(e));
      report.entriesUpdated++;
    }
  }
  for (const p of file.practiceSessions ?? []) {
    if (!p?.id) continue;
    const existing = await tx.objectStore(STORE_PRACTICE).get(p.id);
    if (!existing) {
      await tx.objectStore(STORE_PRACTICE).put(p);
      report.practiceAdded++;
    }
  }
  await tx.done;
  await recomputeTags();
  return report;
}

function normalizeEntry(e: Entry): Entry {
  return {
    ...e,
    type: e.type ?? 'sentence',
    note: e.note ?? '',
    tags: Array.isArray(e.tags) ? e.tags : [],
    createdAt: e.createdAt ?? Date.now(),
    updatedAt: e.updatedAt ?? Date.now(),
  };
}

/** 清空本地知识库（不含 chrome.storage 设置与密钥） */
export async function clearLibrary(): Promise<void> {
  const d = await db();
  const tx = d.transaction([STORE_ENTRIES, STORE_TAGS, STORE_PRACTICE], 'readwrite');
  await tx.objectStore(STORE_ENTRIES).clear();
  await tx.objectStore(STORE_TAGS).clear();
  await tx.objectStore(STORE_PRACTICE).clear();
  await tx.done;
}
