// ============================================================
// sidepanel/views/AnalysisView.tsx —— 分析主视图
// 原文区 + 模式标签 + 七 Tab + 底部追问与收藏
// ============================================================

import { useMemo, useState } from 'react';
import { MODE_LABELS } from '../../shared/constants';
import type { SessionView } from '../../shared/messages';
import type { AnalysisResult } from '../../shared/types';
import { useStore, type TabKey } from '../store';
import { Btn, CopyBtn, ErrorBox, Spinner } from '../components/bits';
import {
  ChatPanel,
  ChunksSection,
  CollocationsSection,
  ExpressionSection,
  GrammarSection,
  OverviewSection,
  StructureSection,
  VocabSection,
} from '../components/sections';

export function AnalysisView() {
  const st = useStore();

  // 可用 Tab 计算（full 只在完整分析结果时存在）
  const full = st.session?.result && 'detected_type' in st.session.result ? (st.session.result as AnalysisResult) : undefined;
  const tabs = useMemo<TabKey[]>(() => {
    const out: TabKey[] = ['overview'];
    const has = (arr?: unknown[]) => !!arr && arr.length > 0;
    if (has(full?.chunks) || has(full?.structure)) out.push('structure');
    if (has(full?.grammar_points)) out.push('grammar');
    if (full?.word_info || has(full?.vocabulary)) out.push('vocab');
    if (has(full?.collocations)) out.push('collocations');
    if (has(full?.expression)) out.push('expression');
    out.push('chat');
    return out;
  }, [full]);

  const activeTab = tabs.includes(st.tab) ? st.tab : 'overview';

  if (st.status === 'idle' && !st.session) {
    return <IdleState restricted={st.restrictedHint} />;
  }

  return (
    <div className="flex h-full flex-col">
      <OriginalHeader session={st.session} onReanalyze={() => void st.reAnalyze()} running={st.status === 'running' || st.status === 'streaming'} />
      <div className="border-b border-ink-200 px-3 dark:border-ink-800">
        <TabBar tabs={tabs} active={activeTab} onChange={st.setTab} session={st.session} />
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {activeTab === 'overview' && (
          <>
            {st.degraded && (
              <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                模型输出未能结构化解析，已展示简化视图。
                <Btn onClick={() => void st.reAnalyze()} className="ml-1 underline">
                  重新分析
                </Btn>
              </div>
            )}
            {st.status === 'error' && !st.session?.result && (
              <ErrorBox code={st.errorCode} message={st.errorMessage} onRetry={() => void st.reAnalyze()} />
            )}
            <OverviewSection session={st.session} partial={st.partial} streaming={st.status === 'streaming'} />
          </>
        )}
        {activeTab === 'structure' && (
          <>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">意群拆解</h3>
            <ChunksSection chunks={full?.chunks} />
            <h3 className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">句子结构</h3>
            <StructureSection structure={full?.structure} />
          </>
        )}
        {activeTab === 'grammar' && <GrammarSection points={full?.grammar_points} />}
        {activeTab === 'vocab' && <VocabSection session={st.session} />}
        {activeTab === 'collocations' && <CollocationsSection session={st.session} />}
        {activeTab === 'expression' && <ExpressionSection session={st.session} />}
        {activeTab === 'chat' && (
          <ChatPanel
            chat={st.session?.chat ?? []}
            streaming={st.chatStreaming}
            onSend={st.followUp}
            onCancel={st.cancelFollowUp}
            originalText={st.session?.text ?? ''}
          />
        )}
      </div>
      <FooterActions />
    </div>
  );
}

function OriginalHeader({
  session,
  onReanalyze,
  running,
}: {
  session: SessionView | null;
  onReanalyze: () => void;
  running: boolean;
}) {
  if (!session) return null;
  const modeLabel = session.result && 'detected_type' in session.result ? MODE_LABELS[session.result.detected_type] : MODE_LABELS[session.guess];
  return (
    <div className="border-b border-ink-200 px-3 pb-2 pt-3 dark:border-ink-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="select-text text-[13.5px] font-medium leading-snug">{session.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400 dark:text-ink-500">
            <span className="rounded bg-accent-100 px-1.5 py-px font-medium text-accent-700 dark:bg-accent-700/30 dark:text-accent-200">
              {modeLabel ?? '分析'}
              {session.kind === 'light' ? ' · 轻模式' : ''}
            </span>
            {session.sourceTitle && <span className="max-w-[200px] truncate">{session.sourceTitle}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {running && <Spinner label="" />}
          <Btn onClick={onReanalyze} title="重新分析">
            ↻
          </Btn>
        </div>
      </div>
    </div>
  );
}

const TAB_LABELS: Record<TabKey, string> = {
  overview: '概览',
  structure: '结构',
  grammar: '语法',
  vocab: '词汇',
  collocations: '搭配',
  expression: '表达',
  chat: '对话',
};

function TabBar({
  tabs,
  active,
  onChange,
  session,
}: {
  tabs: TabKey[];
  active: TabKey;
  onChange: (t: TabKey) => void;
  session: SessionView | null;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto py-1.5">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            t === active
              ? 'bg-accent-600 text-white'
              : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800'
          }`}
        >
          {TAB_LABELS[t]}
          {t === 'chat' && (session?.chat.length ?? 0) > 0 && (
            <span className="ml-0.5 opacity-70">({session?.chat.filter((c) => c.role === 'user').length})</span>
          )}
        </button>
      ))}
    </div>
  );
}

function FooterActions() {
  const st = useStore();
  const [favTip, setFavTip] = useState(false);
  const session = st.session;
  const copyAll = useMemo(() => {
    if (!session) return '';
    const r = session.result;
    if (!r) return session.text;
    const lines: string[] = [session.text, ''];
    if (r.summary) lines.push(`【理解】${r.summary}`);
    if ('translation' in r && r.translation) {
      if (r.translation.literal) lines.push(`【直译】${r.translation.literal}`);
      if (r.translation.natural) lines.push(`【意译】${r.translation.natural}`);
      if (r.translation.intent) lines.push(`【言外之意】${r.translation.intent}`);
    }
    if ('grammar_points' in r && r.grammar_points) {
      for (const g of r.grammar_points) lines.push(`【语法】${g.title}：${g.explanation}`);
    }
    if ('vocabulary' in r && r.vocabulary) {
      for (const v of r.vocabulary) lines.push(`【词汇】${v.word}：${v.context_meaning}`);
    }
    if ('collocations' in r && r.collocations) {
      for (const c of r.collocations) lines.push(`【搭配】${c.phrase}：${c.meaning}`);
    }
    if ('expression' in r && r.expression) {
      for (const e of r.expression) lines.push(`【表达】${e.title}：${e.en_side} / ${e.cn_side}`);
    }
    return lines.join('\n');
  }, [session]);

  return (
    <div className="border-t border-ink-200 px-3 py-2 dark:border-ink-800">
      <div className="flex items-center gap-1">
        <Btn
          variant="primary"
          disabled={!session || !session.result}
          onClick={() => {
            void st.favoriteCurrent();
            setFavTip(true);
            setTimeout(() => setFavTip(false), 1500);
          }}
        >
          ☆ 收藏
        </Btn>
        <CopyBtn text={copyAll} label="复制全文" />
        <div className="flex-1" />
        {favTip && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">已收藏 ✓</span>}
        <Btn onClick={() => st.setView('library')} title="打开知识库">
          知识库
        </Btn>
      </div>
    </div>
  );
}

function IdleState({ restricted }: { restricted: boolean }) {
  const st = useStore();
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {restricted && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-ink-700 dark:bg-ink-900 dark:text-amber-200">
          当前页面是浏览器内部页面，无法直接读取选区。可以把英文粘贴到下面的输入框来分析。
        </div>
      )}
      <div className="rounded-xl border border-dashed border-ink-300 p-4 text-center dark:border-ink-700">
        <div className="text-2xl">🔍</div>
        <h2 className="mt-2 text-sm font-semibold">选中网页上的英文开始精读</h2>
        <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-ink-400 dark:text-ink-500">
          在任意网页选中单词、短语或句子，点击浮动栏「AI 精读」。不止翻译——讲透它为什么这样表达。
        </p>
      </div>
      <ManualInput autoFocus={!restricted} />
      <div className="mt-4 space-y-1 text-[11px] text-ink-400 dark:text-ink-500">
        <p>· 也可以点击浏览器工具栏的 LinguaLens 图标，自动读取当前页选中内容</p>
        <p>· 分析结果可收藏进知识库，之后可以用来生成练习</p>
      </div>
      <div className="flex-1" />
      <Btn onClick={() => st.setView('library')}>查看知识库</Btn>
    </div>
  );
}

// 底部留空标记：ManualInput 由 IdleState 与头部手动入口共用

export function ManualInput({ autoFocus }: { autoFocus?: boolean }) {
  const st = useStore();
  return (
    <div className="mt-3">
      <textarea
        autoFocus={autoFocus}
        value={st.manualText}
        onChange={(e) => st.setManualText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void st.analyzeManualText();
          }
        }}
        rows={3}
        placeholder="或在此粘贴英文（⌘/Ctrl + Enter 分析）"
        className="w-full resize-none rounded-lg border border-ink-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-accent-400 dark:border-ink-700 dark:bg-ink-900"
      />
      <div className="mt-1.5 flex justify-end">
        <Btn variant="primary" disabled={!st.manualText.trim()} onClick={() => void st.analyzeManualText()}>
          精读分析
        </Btn>
      </div>
    </div>
  );
}
