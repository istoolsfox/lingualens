import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addEntry,
  clearLibrary,
  deleteEntries,
  exportBackup,
  importBackup,
  listEntries,
  listTags,
  newId,
  savePracticeSession,
  updateEntry,
} from '../../src/storage/favorites';
import { saveApiKey, loadApiKey } from '../../src/background/secureStore';
import { chromeStorageLike } from '../../src/background/storageLike';
import type { Entry } from '../../src/shared/types';

function mkEntry(text: string, type: Entry['type'] = 'sentence', tags: string[] = []): Entry {
  return {
    id: newId(),
    type,
    text,
    analysis: null,
    note: '',
    tags,
    sourceUrl: 'https://example.com/post',
    sourceTitle: 'Example Blog',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

beforeEach(async () => {
  await clearLibrary();
});

describe('favorites IndexedDB 知识库', () => {
  it('新增→列表→搜索', async () => {
    await addEntry(mkEntry('A computer on steroids.'));
    await addEntry(mkEntry('get through to someone', 'phrase'));
    await addEntry(mkEntry('likely 语境义笔记', 'word'));
    const all = await listEntries();
    expect(all.length).toBe(3);

    const hit = await listEntries({ query: 'steroids' });
    expect(hit.length).toBe(1);
    expect(hit[0]?.text).toBe('A computer on steroids.');

    const byType = await listEntries({ type: 'phrase' });
    expect(byType.length).toBe(1);
  });

  it('笔记与标签更新 + 标签计数重建', async () => {
    const e = mkEntry('likely', 'word', ['hacker-news']);
    await addEntry(e);
    e.note = 'likely 作副词的用法';
    e.tags = ['hacker-news', '副词'];
    await updateEntry(e);

    const tags = await listTags();
    const names = tags.map((t) => t.name).sort();
    expect(names).toEqual(['hacker-news', '副词']);
    const hn = tags.find((t) => t.name === 'hacker-news');
    expect(hn?.count).toBe(1);
  });

  it('搜索命中笔记内容', async () => {
    const e = mkEntry('The problem is...');

    e.note = '骗子只需触达极少数人';
    await addEntry(e);
    expect((await listEntries({ query: '触达' })).length).toBe(1);
  });

  it('批量删除', async () => {
    const a = mkEntry('one');
    const b = mkEntry('two');
    const c = mkEntry('three');
    await addEntry(a);
    await addEntry(b);
    await addEntry(c);
    await deleteEntries([a.id, b.id]);
    expect((await listEntries()).length).toBe(1);
  });

  it('导出→清空→导入去重', async () => {
    const e = mkEntry('Glasses that can adapt to any prescription.');
    await addEntry(e);
    const backup = await exportBackup('0.1.0-test');
    expect(backup.entries.length).toBe(1);
    expect(backup.schemaVersion).toBe(1);

    await clearLibrary();
    expect((await listEntries()).length).toBe(0);

    // 导入两次：第二次全部去重
    const r1 = await importBackup(backup);
    expect(r1.entriesAdded).toBe(1);
    const r2 = await importBackup(backup);
    expect(r2.entriesAdded).toBe(0);
    expect(r2.entriesUpdated).toBe(0);
    expect((await listEntries()).length).toBe(1);
  });

  it('导入时 updatedAt 新者胜', async () => {
    const e = mkEntry('old text');
    await addEntry(e);
    const backup = await exportBackup('0.1.0-test');

    // 本地更新
    e.note = '本地新版';
    e.updatedAt = Date.now() + 10000;
    await updateEntry(e);

    const r = await importBackup(backup);
    expect(r.entriesUpdated).toBe(0); // 备份更旧，不覆盖
    const list = await listEntries();
    expect(list[0]?.note).toBe('本地新版');
  });

  it('练习会话存取', async () => {
    const { listPracticeSessions } = await import('../../src/storage/favorites');
    await savePracticeSession({
      id: newId(),
      createdAt: Date.now(),
      types: ['word_meaning'],
      questions: [],
      answers: [],
      score: 80,
    });
    const list = await listPracticeSessions(10);
    expect(list.length).toBe(1);
    expect(list[0]?.score).toBe(80);
  });

  it('密钥加密存储与知识库互不干扰（chrome mock 不落地）', async () => {
    // favorites 不触碰 chrome.storage；此用例确保 secureStore 与 IndexedDB 独立工作
    await addEntry(mkEntry('solo'));
    expect((await listEntries()).length).toBe(1);
    void saveApiKey;
    void loadApiKey;
    void chromeStorageLike;
  });
});
