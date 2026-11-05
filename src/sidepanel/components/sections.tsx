// ============================================================
// sidepanel/components/sections.tsx —— 分析结果各节渲染
// 概览 / 意群 / 结构 / 语法 / 词汇 / 搭配 / 表达 / 对话
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { SessionView } from '../../shared/messages';
import type { AnalysisResult, ChatMessage, LightResult, SenseChunk, StructureItem } from '../../shared/types';
import { Markdown } from '../markdown';
import { Btn, Chip, CopyBtn, Empty, KindBadge, SectionCard, Spinner } from './bits';

type AnyResult = AnalysisResult | LightResult;

function isFull(a: AnyResult | undefined): a is AnalysisResult {
  return !!a && 'detected_type' in a;
}

// ---------- 概览 ----------

export function OverviewSection({
  session,
  partial,
  streaming,
}: {
  session: SessionView | null;
  partial: { detectedType?: string; summary?: string; literal?: string; natural?: string };
  streaming: boolean;
}) {
  const result = session?.result as AnyResult | undefined;

  if (session?.degraded && session.raw) {
    return (
      <SectionCard title="分析结果（简化视图）">
        <Markdown text={session.raw} />
      </SectionCard>
    );
  }

  // 流式进行中：渐进展示已到达的概览字段
  if (!result && (streaming || session?.status === 'running')) {
    const hasSomething = partial.literal || partial.natural || partial.summary;
    return (
      <SectionCard title="概览">
        {!hasSomething && <Spinner label="正在分析…" />}
        {partial.literal && (
          <div className="mt-2">
            <div className="text-[11px] text-ink-400">结构直译</div>
            <p className="text-ink-700 dark:text-ink-300">{partial.literal}</p>
          </div>
        )}
        {partial.natural && (
          <div className="mt-2">
            <div className="text-[11px] text-ink-400">自然意译</div>
            <p className="font-medium">{partial.natural}</p>
          </div>
        )}
        {partial.summary && (
          <div className="mt-2 rounded-md bg-accent-50 p-2 text-accent-700 dark:bg-accent-700/20 dark:text-accent-200">
            {partial.summary}
          </div>
        )}
      </SectionCard>
    );
  }

  if (!result) {
    return session?.status === 'error' ? null : (
      <SectionCard title="概览">
        <Empty>暂无内容</Empty>
      </SectionCard>
    );
  }

  const t = 'translation' in result ? result.translation : undefined;
  const light = !isFull(result);

  return (
    <div className="space-y-2.5">
      {t && (t.literal || t.natural) && (
        <SectionCard title="翻译" right={<CopyBtn text={[t.literal, t.natural].filter(Boolean).join('\n')} />}>
          {t.literal && (
            <div className="mb-2">
              <div className="text-[11px] text-ink-400 dark:text-ink-500">结构直译 · 保留英文骨架</div>
              <p className="mt-0.5 leading-relaxed text-ink-600 dark:text-ink-400">{t.literal}</p>
            </div>
          )}
          {t.natural && (
            <div>
              <div className="text-[11px] text-ink-400 dark:text-ink-500">自然意译 · 中文习惯</div>
              <p className="mt-0.5 text-[13.5px] font-medium leading-relaxed">{t.natural}</p>
            </div>
          )}
          {t.intent && (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <span className="font-medium">言外之意：</span>
              {t.intent}
            </div>
          )}
        </SectionCard>
      )}

      {result.summary && (
        <SectionCard title={light ? '解释' : '最终理解'}>
          <p className="leading-relaxed text-[13.5px]">{result.summary}</p>
        </SectionCard>
      )}

      {!t && !result.summary && (
        <SectionCard title="概览">
          <Empty>暂无内容</Empty>
        </SectionCard>
      )}
    </div>
  );
}

// ---------- 意群 ----------

export function ChunksSection({ chunks }: { chunks?: SenseChunk[] }) {
  if (!chunks?.length) return <Empty>本模式不提供意群拆解</Empty>;
  return (
    <div className="space-y-2">
      {chunks.map((c, i) => (
        <div key={i} className="rounded-lg border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[11px] font-semibold text-accent-700 dark:bg-accent-700/30 dark:text-accent-200">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-900 dark:text-ink-100">{c.text}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{c.meaning}</p>
              {c.role && <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">作用：{c.role}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- 句子结构 ----------

const COMPONENT_COLORS: Record<string, string> = {
  主语: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  谓语: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  宾语: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  表语: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  定语: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  状语: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  补语: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  从句: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  插入语: 'bg-ink-200 text-ink-600 dark:bg-ink-700 dark:text-ink-300',
};

export function StructureSection({ structure }: { structure?: StructureItem[] }) {
  if (!structure?.length) return <Empty>本模式不提供句子结构分析</Empty>;
  return (
    <div className="space-y-2">
      {structure.map((s, i) => {
        const colorKey = Object.keys(COMPONENT_COLORS).find((k) => s.component.includes(k));
        const color = colorKey ? COMPONENT_COLORS[colorKey] : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300';
        return (
          <div key={i} className="rounded-lg border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>{s.component}</span>
              <code className="rounded bg-ink-50 px-1.5 py-0.5 text-[12.5px] text-ink-800 dark:bg-ink-800 dark:text-ink-200">{s.text}</code>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{s.explanation}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 语法 ----------

export function GrammarSection({ points }: { points?: { title: string; quote?: string; explanation: string; alternative?: string; kind?: 'rule' | 'habit' | 'style' }[] }) {
  if (!points?.length) return <Empty>本模式不提供语法解析</Empty>;
  return (
    <div className="space-y-2">
      {points.map((g, i) => (
        <div key={i} className="rounded-lg border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center">
            <h4 className="text-[13px] font-semibold">{g.title}</h4>
            <KindBadge kind={g.kind} />
          </div>
          {g.quote && <code className="mt-1 inline-block rounded bg-ink-50 px-1.5 py-0.5 text-[12px] text-accent-700 dark:bg-ink-800 dark:text-accent-200">{g.quote}</code>}
          <p className="mt-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{g.explanation}</p>
          {g.alternative && (
            <p className="mt-1.5 rounded-md bg-ink-50 p-1.5 text-[11px] text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">
              替换推演：{g.alternative}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- 词汇 ----------

export function VocabSection({ session }: { session: SessionView | null }) {
  const result = session?.result as AnyResult | undefined;
  const wordInfo = result && 'word_info' in result ? result.word_info : undefined;
  const vocab = result && 'vocabulary' in result ? result.vocabulary : undefined;

  if (wordInfo) {
    return (
      <div className="space-y-2.5">
        <WordInfoCard w={wordInfo} />
        {vocab?.length ? <VocabList cards={vocab} /> : null}
      </div>
    );
  }
  if (vocab?.length) return <VocabList cards={vocab} />;
  return <Empty>本模式没有重点词汇卡片</Empty>;
}

function VocabList({ cards }: { cards: NonNullable<AnalysisResult['vocabulary']> }) {
  return (
    <div className="space-y-2">
      {cards.map((v, i) => (
        <div key={i} className="rounded-lg border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[13.5px] font-semibold text-accent-700 dark:text-accent-200">{v.word}</span>
            {v.pos && <span className="text-[11px] italic text-ink-400">{v.pos}</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed">{v.context_meaning}</p>
          {v.morphology && (
            <p className="mt-1.5 rounded-md bg-ink-50 p-1.5 text-[11px] text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">构词：{v.morphology}</p>
          )}
          {v.collocations && v.collocations.length > 0 && (
            <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">搭配：{v.collocations.join(' · ')}</p>
          )}
          {v.synonym_diff && (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">近义辨析：{v.synonym_diff}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function WordInfoCard({ w }: { w: NonNullable<LightResult['word_info']> }) {
  const usage = w.usage;
  return (
    <SectionCard
      title="单词解析"
      right={<CopyBtn text={`${w.word} ${w.ipa_us ?? ''} ${w.context_meaning}`} />}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-lg font-bold text-accent-700 dark:text-accent-200">{w.word}</span>
        {w.ipa_us && <span className="font-mono text-xs text-ink-500">US {w.ipa_us}</span>}
        {w.ipa_uk && <span className="font-mono text-xs text-ink-500">UK {w.ipa_uk}</span>}
        {w.pos && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-400">{w.pos}</span>}
      </div>

      {w.core_meanings.length > 0 && (
        <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">核心义：{w.core_meanings.join('；')}</p>
      )}
      <div className="mt-2 rounded-md bg-accent-50 p-2 dark:bg-accent-700/20">
        <div className="text-[11px] text-accent-500 dark:text-accent-300">当前语境义</div>
        <p className="mt-0.5 text-[13px] font-medium">{w.context_meaning}</p>
      </div>

      {w.morphology && (
        <div className="mt-2">
          <div className="text-[11px] text-ink-400 dark:text-ink-500">词根词缀</div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{w.morphology}</p>
        </div>
      )}
      {w.inflections && w.inflections.length > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-400">词形：{w.inflections.join(' · ')}</p>
      )}
      {w.derivatives && w.derivatives.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {w.derivatives.map((d, i) => (
            <span key={i} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] dark:bg-ink-800" title={d.meaning}>
              {d.word}
            </span>
          ))}
        </div>
      )}
      {w.grammar_role && (
        <div className="mt-2">
          <div className="text-[11px] text-ink-400 dark:text-ink-500">句中语法作用</div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{w.grammar_role}</p>
        </div>
      )}
      {w.compare && w.compare.length > 0 && (
        <div className="mt-2 space-y-1">
          {w.compare.map((c, i) => (
            <p key={i} className="text-[11.5px] leading-relaxed">
              <span className="font-medium text-accent-600 dark:text-accent-300">{c.expression}</span>
              <span className="text-ink-500 dark:text-ink-400"> ：{c.difference}</span>
            </p>
          ))}
        </div>
      )}
      {usage && usage.examples.length > 0 && (
        <div className="mt-2 border-t border-ink-100 pt-2 dark:border-ink-800">
          <div className="text-[11px] text-ink-400 dark:text-ink-500">例句</div>
          <ul className="mt-1 space-y-1">
            {usage.examples.map((ex, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                <span className="text-ink-300 dark:text-ink-600">·</span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {usage && usage.collocations.length > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-400">常见搭配：{usage.collocations.join(' · ')}</p>
      )}
      {usage && (usage.synonyms?.length || usage.antonyms?.length || usage.confusables?.length) && (
        <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">
          {usage.synonyms?.length ? `近义 ${usage.synonyms.join('、')}　` : ''}
          {usage.antonyms?.length ? `反义 ${usage.antonyms.join('、')}　` : ''}
          {usage.confusables?.length ? `易混 ${usage.confusables.join('、')}` : ''}
        </p>
      )}
      {usage?.scenarios && <p className="mt-1 text-[11px] text-ink-400">场景：{usage.scenarios}</p>}
    </SectionCard>
  );
}

// ---------- 搭配 ----------

export function CollocationsSection({ session }: { session: SessionView | null }) {
  const result = session?.result as AnyResult | undefined;
  const cols = result && 'collocations' in result ? result.collocations : undefined;
  if (!cols?.length) return <Empty>本模式没有固定搭配或习语</Empty>;
  return (
    <div className="space-y-2">
      {cols.map((c, i) => (
        <div key={i} className="rounded-lg border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center flex-wrap">
            <span className="text-[13px] font-semibold text-accent-700 dark:text-accent-200">{c.phrase}</span>
            <KindBadge kind={c.kind} />
          </div>
          <p className="mt-1 text-xs leading-relaxed">{c.meaning}</p>
          {c.usage_note && <p className="mt-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">{c.usage_note}</p>}
          {c.examples && c.examples.length > 0 && (
            <ul className="mt-1.5 space-y-1 border-t border-ink-100 pt-1.5 dark:border-ink-800">
              {c.examples.map((ex, j) => (
                <li key={j} className="text-[12px] leading-relaxed text-ink-600 dark:text-ink-300">
                  · {ex}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- 表达思维 ----------

export function ExpressionSection({ session }: { session: SessionView | null }) {
  const result = session?.result as AnyResult | undefined;
  const exprs = result && 'expression' in result ? result.expression : undefined;
  if (!exprs?.length) return <Empty>本模式没有表达习惯分析</Empty>;
  return (
    <div className="space-y-2">
      {exprs.map((e, i) => (
        <div key={i} className="rounded-lg border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center">
            <h4 className="text-[13px] font-semibold">{e.title}</h4>
            <KindBadge kind={e.kind} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-700 dark:text-ink-300">
            <span className="font-medium">英语思维：</span>
            {e.en_side}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-700 dark:text-ink-300">
            <span className="font-medium">中文对照：</span>
            {e.cn_side}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------- 对话 ----------

const QUICK_QUESTIONS = [
  '为什么这样表达，而不是更常见的方式？',
  '用更简单的英语解释一遍',
  '给我几个类似的例句',
  '如果我要自己写这样的句子，应该怎么写？',
];

export function ChatPanel({
  chat,
  streaming,
  onSend,
  onCancel,
  originalText,
}: {
  chat: ChatMessage[];
  streaming: boolean;
  onSend: (q: string) => void;
  onCancel: () => void;
  originalText: string;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat]);

  const send = () => {
    const q = input.trim();
    if (!q || streaming) return;
    onSend(q);
    setInput('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={scrollRef} className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
        {chat.length === 0 && (
          <div className="rounded-lg border border-dashed border-ink-300 p-3 dark:border-ink-700">
            <p className="text-xs text-ink-400 dark:text-ink-500">围绕这句「{originalText.slice(0, 40)}{originalText.length > 40 ? '…' : ''}」继续追问：</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map((q) => (
                <Chip key={q} onClick={() => onSend(q)}>
                  {q}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-6 rounded-lg rounded-br-sm bg-accent-600 px-2.5 py-1.5 text-xs text-white">{m.content}</div>
          ) : (
            <div key={i} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 dark:border-ink-800 dark:bg-ink-900">
              {m.content ? <Markdown text={m.content} className="text-xs" /> : streaming && i === chat.length - 1 ? <Spinner label="思考中…" /> : null}
              {m.error && <p className="mt-1 text-[11px] text-red-500">{m.error}</p>}
              {m.content && !m.streaming && (
                <div className="mt-1 flex justify-end">
                  <CopyBtn text={m.content} label="复制回答" />
                </div>
              )}
            </div>
          ),
        )}
      </div>
      <div className="flex items-end gap-1.5">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="追问语法、词汇、表达…（Enter 发送，Shift+Enter 换行）"
          className="flex-1 resize-none rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent-400 dark:border-ink-700 dark:bg-ink-900"
        />
        {streaming ? (
          <Btn variant="danger" onClick={onCancel}>
            停止
          </Btn>
        ) : (
          <Btn variant="primary" onClick={send} disabled={!input.trim()}>
            发送
          </Btn>
        )}
      </div>
    </div>
  );
}
