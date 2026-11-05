// ============================================================
// sidepanel/views/LibraryView.tsx —— 本地知识库
// 搜索 / 筛选 / 详情 / 笔记 / 标签 / 删除 / 导入导出 / 清空
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { MODE_LABELS } from '../../shared/constants';
import type { Entry } from '../../shared/types';
import { useStore } from '../store';
import { Btn, Chip, Empty, Spinner } from '../components/bits';

const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'word', label: '单词' },
  { key: 'phrase', label: '短语' },
  { key: 'sentence', label: '句子' },
  { key: 'paragraph', label: '段落' },
];

export function LibraryView() {
  const st = useStore();
  const [queryInput, setQueryInput] = useState(st.libQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => st.setLibFilter({ query: queryInput }), 250);
    return () => clearTimeout(debounceRef.current);
  }, [queryInput]);

  useEffect(() => {
    void st.loadLibrary();
  }, []);

  const selected = st.entries.find((e) => e.id === st.libSelectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-ink-200 p-3 dark:border-ink-800">
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="搜索原文 / 笔记 / 标签…"
          className="w-full rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent-400 dark:border-ink-700 dark:bg-ink-900"
        />
        <div className="flex flex-wrap gap-1">
          {TYPE_FILTERS.map((f) => (
            <Chip key={f.key} active={st.libType === f.key} onClick={() => st.setLibFilter({ type: f.key })}>
              {f.label}
            </Chip>
          ))}
        </div>
        {st.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Chip active={st.libTag === 'all'} onClick={() => st.setLibFilter({ tag: 'all' })}>
              全部标签
            </Chip>
            {st.tags.map((t) => (
              <Chip
                key={t.name}
                active={st.libTag === t.name}
                onClick={() => st.setLibFilter({ tag: t.name })}
              >
                {t.name} ({t.count})
              </Chip>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 text-[11px]">
          <Btn onClick={() => void st.exportData()}>导出</Btn>
          <label className="inline-flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800">
            导入
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void st.importData(f);
                e.target.value = '';
              }}
            />
          </label>
          <Btn
            variant="danger"
            onClick={() => {
              if (confirm('确定清空本地知识库？此操作不可恢复。')) void st.clearLibraryData();
            }}
          >
            清空
          </Btn>
          <div className="flex-1" />
          <span className="text-ink-400 dark:text-ink-500">{st.entries.length} 条</span>
        </div>
        {st.importReport && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{st.importReport}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {st.libLoading ? (
          <Spinner />
        ) : st.entries.length === 0 ? (
          <Empty>还没有收藏。在分析视图点「☆ 收藏」即可保存学习内容。</Empty>
        ) : (
          <div className="space-y-2">
            {st.entries.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                expanded={st.libSelectedId === e.id}
                onToggle={() => st.selectEntry(st.libSelectedId === e.id ? null : e.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && <EntryDetail entry={selected} />}
    </div>
  );
}

function EntryCard({ entry, expanded, onToggle }: { entry: Entry; expanded: boolean; onToggle: () => void }) {
  const summary = entry.analysis && 'summary' in entry.analysis ? entry.analysis.summary : '';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
        expanded
          ? 'border-accent-400 bg-accent-50 dark:border-accent-400/60 dark:bg-accent-700/10'
          : 'border-ink-200 bg-white hover:border-accent-300 dark:border-ink-800 dark:bg-ink-900'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-ink-400 dark:text-ink-500">
        <span className="rounded bg-ink-100 px-1.5 py-px dark:bg-ink-800">
          {MODE_LABELS[entry.type] ?? entry.type}
        </span>
        <span className="truncate">
          {new Date(entry.createdAt).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        {entry.tags.length > 0 && <span className="truncate text-accent-500">#{entry.tags.join(' #')}</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug">{entry.text}</p>
      {summary && !expanded && (
        <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-400 dark:text-ink-500">{summary}</p>
      )}
    </button>
  );
}

function EntryDetail({ entry }: { entry: Entry }) {
  const st = useStore();
  const [note, setNote] = useState(entry.note);
  const [tagInput, setTagInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNote(entry.note);
  }, [entry.id, entry.note]);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || entry.tags.includes(t)) return;
    void st.saveEntryTags(entry.id, [...entry.tags, t]);
    setTagInput('');
  };

  return (
    <div className="border-t border-ink-200 p-3 dark:border-ink-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] text-ink-400 dark:text-ink-500">{entry.sourceTitle || '来源未知'}</span>
        <div className="flex gap-1">
          <Btn onClick={() => void st.openEntry(entry.id)}>打开分析</Btn>
          <Btn variant="danger" onClick={() => void st.removeEntry(entry.id)}>
            删除
          </Btn>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {entry.tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-0.5 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] text-accent-700 dark:bg-accent-700/30 dark:text-accent-200"
          >
            #{t}
            <button
              type="button"
              className="opacity-60 hover:opacity-100"
              onClick={() =>
                void st.saveEntryTags(
                  entry.id,
                  entry.tags.filter((x) => x !== t),
                )
              }
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) addTag();
          }}
          placeholder="+ 标签"
          className="w-16 rounded-full border border-dashed border-ink-300 bg-transparent px-2 py-0.5 text-[11px] outline-none dark:border-ink-600"
        />
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="写点自己的笔记…"
        className="mt-2 w-full resize-none rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-accent-400 dark:border-ink-700 dark:bg-ink-900"
      />
      <div className="mt-1 flex items-center justify-end gap-2">
        {saved && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">已保存</span>}
        <Btn
          disabled={note === entry.note}
          onClick={() => {
            void st.saveEntryNote(entry.id, note);
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          保存笔记
        </Btn>
      </div>
    </div>
  );
}
