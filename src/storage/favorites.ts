// ============================================================
// storage/favorites.ts —— 本地知识库（IndexedDB，idb 封装）
// stores: entries / tags / practice
// ============================================================

import { openDB, type IDBPDatabase } from 'idb';
import type { BackupFile, Entry, PracticeSession, TagRow } from '../shared/types';
import type { ArticlePayload } from '../shared/messages';
import { textKey } from '../ai/hash';

/** 译文记忆：翻过的段落文本 → 译文（跨页面/跨模式复用，省 token） */
export interface MemoRow {
  hash: string;
  text: string;
  natural: string;
  updatedAt: number;
}

/** 整文翻译的 URL 级缓存（全量 URL 匹配，内容变化用指纹检测） */
export interface ArticleCacheRow {
  url: string;
  fingerprint: string;
  title: string;
  blocks: { id: number; text: string }[];
  translations: Record<number, string>;
  updatedAt: number;
}

const DB_NAME = 'lingualens';
const DB_VERSION = 2;
const STORE_ENTRIES = 'entries';
const STORE_TAGS = 'tags';
const STORE_PRACTICE = 'practice';
const STORE_MEMO = 'memo';
const STORE_ARTICLES = 'articles';
const STORE_HANDLES = 'fsHandles';

interface LLDatabases {
  [STORE_ENTRIES]: Entry;
  [STORE_TAGS]: TagRow;
  [STORE_PRACTICE]: PracticeSession;
  [STORE_MEMO]: MemoRow;
  [STORE_ARTICLES]: ArticleCacheRow;
  [STORE_HANDLES]: unknown;
}

let dbPromise: Promise<IDBPDatabase<LLDatabases>> | null = null;

function db(): Promise<IDBPDatabase<LLDatabases>> {
  if (!dbPromise) {
    dbPromise = openDB<LLDatabases>(DB_NAME, DB_VERSION, {
      upgrade(d, _oldVersion, _oldVn, tx) {
        if (!d.objectStoreNames.contains(STORE_ENTRIES)) {
          d.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains(STORE_TAGS)) {
          d.createObjectStore(STORE_TAGS, { keyPath: 'name' });
        }
        if (!d.objectStoreNames.contains(STORE_PRACTICE)) {
          d.createObjectStore(STORE_PRACTICE, { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains(STORE_MEMO)) {
          d.createObjectStore(STORE_MEMO, { keyPath: 'hash' });
        }
        if (!d.objectStoreNames.contains(STORE_ARTICLES)) {
          d.createObjectStore(STORE_ARTICLES, { keyPath: 'url' });
        }
        if (!d.objectStoreNames.contains(STORE_HANDLES)) {
          d.createObjectStore(STORE_HANDLES, { keyPath: 'name' });
        }
        void tx;
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

/** 清空本地知识库（不含 chrome.storage 设置与密钥；保留译文记忆与缓存） */
export async function clearLibrary(): Promise<void> {
  const d = await db();
  const tx = d.transaction([STORE_ENTRIES, STORE_TAGS, STORE_PRACTICE], 'readwrite');
  await tx.objectStore(STORE_ENTRIES).clear();
  await tx.objectStore(STORE_TAGS).clear();
  await tx.objectStore(STORE_PRACTICE).clear();
  await tx.done;
}

// ---------- 译文记忆（memo） ----------

/** 批量查询段落记忆：返回 textKey → 译文 */
export async function memoLookup(texts: string[]): Promise<Map<string, string>> {
  const d = await db();
  const keys = texts.map((t) => textKey(t));
  const out = new Map<string, string>();
  const tx = d.transaction(STORE_MEMO, 'readonly');
  for (const [i, key] of keys.entries()) {
    const row = await tx.store.get(key);
    const text = texts[i];
    if (row && text) out.set(key, row.natural);
  }
  await tx.done;
  return out;
}

export async function memoSave(items: { text: string; natural: string }[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE_MEMO, 'readwrite');
  const now = Date.now();
  for (const it of items) {
    await tx.store.put({ hash: textKey(it.text), text: it.text, natural: it.natural, updatedAt: now } satisfies MemoRow);
  }
  await tx.done;
}

// ---------- 整文翻译 URL 缓存 ----------

export async function articleCacheGet(url: string): Promise<ArticleCacheRow | undefined> {
  const d = await db();
  return d.get(STORE_ARTICLES, url);
}

export async function articleCachePut(row: ArticleCacheRow): Promise<void> {
  const d = await db();
  await d.put(STORE_ARTICLES, row);
  // 简单 LRU：超过 100 条删最旧
  const all = await d.getAll(STORE_ARTICLES);
  if (all.length > 100) {
    const sorted = all.sort((a, b) => a.updatedAt - b.updatedAt);
    for (const old of sorted.slice(0, all.length - 100)) {
      await d.delete(STORE_ARTICLES, old.url);
    }
  }
}

/** 由提取结果构造可缓存的行 */
export function buildArticleCacheRow(payload: ArticlePayload, fingerprint: string, translations: Record<number, string>): ArticleCacheRow {
  return {
    url: payload.url,
    fingerprint,
    title: payload.title,
    blocks: payload.blocks,
    translations,
    updatedAt: Date.now(),
  };
}

// ---------- 备份目录句柄（File System Access，自定义存储位置） ----------

export async function saveDirHandle(name: string, handle: unknown): Promise<void> {
  const d = await db();
  await d.put(STORE_HANDLES, { name, handle });
}

export async function getDirHandle(name: string): Promise<{ name: string; handle: unknown } | undefined> {
  const d = await db();
  return d.get(STORE_HANDLES, name);
}

export async function clearDirHandle(name: string): Promise<void> {
  const d = await db();
  await d.delete(STORE_HANDLES, name);
}
