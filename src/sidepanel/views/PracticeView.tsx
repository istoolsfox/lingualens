// ============================================================
// sidepanel/views/PracticeView.tsx —— 学习训练
// 基于收藏生成测试 / 仿写 / 批改 / 历史记录
// ============================================================

import { useEffect, useState } from 'react';
import { QUESTION_TYPE_LABELS } from '../../shared/constants';
import type { Question, QuestionType } from '../../shared/types';
import { listPracticeSessions } from '../../storage/favorites';
import type { PracticeSession } from '../../shared/types';
import { useStore } from '../store';
import { Btn, Chip, ErrorBox, Spinner } from '../components/bits';

const ALL_TYPES: QuestionType[] = [
  'word_meaning',
  'phrase_meaning',
  'grammar_choice',
  'translation',
  'imitation',
  'synonym',
  'correction',
];

export function PracticeView() {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <PracticeBody />
    </div>
  );
}

function PracticeBody() {
  const st = useStore();
  return (
    <>
      {st.practicePhase === 'config' && <ConfigPanel />}
      {st.practicePhase === 'quiz' && <QuizPanel />}
      {st.practicePhase === 'result' && <ResultPanel />}
      <HistorySection />
    </>
  );
}

function ConfigPanel() {
  const st = useStore();
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-ink-300 p-3 dark:border-ink-700">
        <h2 className="text-sm font-semibold">基于你的收藏生成练习</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-400 dark:text-ink-500">
          用收藏的知识条目出题，把读过的表达变成能写的输出。仿写练习会由 AI 逐句批改。
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-ink-400">题型（可多选）</div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map((t) => (
            <Chip key={t} active={st.practiceTypes.includes(t)} onClick={() => st.togglePracticeType(t)}>
              {QUESTION_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-ink-400">题数</span>
        <div className="flex items-center gap-1">
          <Btn onClick={() => st.setPracticeCount(st.practiceCount - 1)}>−</Btn>
          <span className="w-6 text-center text-xs font-semibold">{st.practiceCount}</span>
          <Btn onClick={() => st.setPracticeCount(st.practiceCount + 1)}>+</Btn>
        </div>
        <span className="text-[11px] text-ink-400">1-10 题</span>
      </div>

      {st.practiceError && <ErrorBox message={st.practiceError} />}
      {st.entries.length === 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">知识库还是空的——先去收藏几条内容，练习才有素材。</p>
      )}

      <Btn
        variant="primary"
        className="w-full py-2"
        disabled={st.practiceBusy === 'generating' || st.entries.length === 0}
        onClick={() => void st.startPractice()}
      >
        {st.practiceBusy === 'generating' ? '正在出题…' : '开始练习'}
      </Btn>
    </div>
  );
}

function QuizPanel() {
  const st = useStore();
  return (
    <div className="space-y-3">
      {st.practiceQuestions.map((q, i) => (
        <QuestionCard key={q.id} q={q} index={i + 1} />
      ))}
      {st.practiceError && <ErrorBox message={st.practiceError} />}
      <div className="flex gap-2">
        <Btn variant="primary" className="flex-1 py-2" disabled={st.practiceBusy === 'grading'} onClick={() => void st.submitPractice()}>
          {st.practiceBusy === 'grading' ? '批改中…' : '交卷'}
        </Btn>
        <Btn onClick={st.resetPractice}>放弃</Btn>
      </div>
    </div>
  );
}

function QuestionCard({ q, index }: { q: Question; index: number }) {
  const st = useStore();
  const answer = st.practiceAnswers[q.id] ?? '';
  const isChoice = !!q.options && q.options.length > 0;
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-[11px] font-semibold text-accent-700 dark:bg-accent-700/30 dark:text-accent-200">
          {index}
        </span>
        <span className="text-[10px] text-ink-400">{QUESTION_TYPE_LABELS[q.type]}</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{q.prompt}</p>
      {isChoice ? (
        <div className="mt-2 space-y-1">
          {(q.options ?? []).map((opt) => (
            <label
              key={opt}
              className={`flex cursor-pointer items-start gap-2 rounded-md border p-1.5 text-xs leading-relaxed ${
                answer === opt
                  ? 'border-accent-400 bg-accent-50 dark:border-accent-400/60 dark:bg-accent-700/10'
                  : 'border-ink-200 dark:border-ink-700'
              }`}
            >
              <input
                type="radio"
                name={q.id}
                checked={answer === opt}
                onChange={() => st.setAnswer(q.id, opt)}
                className="mt-0.5 accent-indigo-600"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ) : (
        <textarea
          value={answer}
          onChange={(e) => st.setAnswer(q.id, e.target.value)}
          rows={3}
          placeholder="写下你的答案…"
          className="mt-2 w-full resize-none rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-accent-400 dark:border-ink-700 dark:bg-ink-900"
        />
      )}
    </div>
  );
}

function ResultPanel() {
  const st = useStore();
  const byId = new Map(st.practiceGradings.map((g) => [g.questionId, g]));
  const verdictStyle: Record<string, string> = {
    correct: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    wrong: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  };
  const verdictLabel: Record<string, string> = { correct: '正确', partial: '部分正确', wrong: '错误' };

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-accent-600 p-4 text-center text-white">
        <div className="text-3xl font-bold">{st.practiceScore ?? 0}</div>
        <div className="text-[11px] opacity-80">本次得分（{st.practiceQuestions.length} 题）</div>
      </div>
      {st.practiceOverall && (
        <div className="rounded-lg border border-ink-200 bg-white p-2.5 text-xs leading-relaxed dark:border-ink-800 dark:bg-ink-900">
          <span className="font-medium">AI 总评：</span>
          {st.practiceOverall}
        </div>
      )}
      {st.practiceQuestions.map((q, i) => {
        const g = byId.get(q.id);
        return (
          <div key={q.id} className="rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${verdictStyle[g?.verdict ?? 'wrong']}`}>{verdictLabel[g?.verdict ?? 'wrong']}</span>
              <span className="text-[10px] text-ink-400">
                第 {i + 1} 题 · {QUESTION_TYPE_LABELS[q.type]}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">{q.prompt}</p>
            <p className="mt-1 text-xs">
              <span className="text-ink-400">你的答案：</span>
              {st.practiceAnswers[q.id] || '（未作答）'}
            </p>
            <p className="mt-1 text-xs">
              <span className="text-ink-400">参考答案：</span>
              {q.answer}
            </p>
            {g?.comment && <p className="mt-1.5 rounded-md bg-ink-50 p-1.5 text-[11.5px] leading-relaxed text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">{g.comment}</p>}
            {!g?.comment && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500 dark:text-ink-400">{q.explanation}</p>}
          </div>
        );
      })}
      <Btn variant="primary" className="w-full py-2" onClick={st.resetPractice}>
        再来一组
      </Btn>
    </div>
  );
}

function HistorySection() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listPracticeSessions(8).then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner label="" />;
  if (sessions.length === 0) return null;
  return (
    <div className="mt-4 border-t border-ink-200 pt-3 dark:border-ink-800">
      <div className="mb-1.5 text-[11px] font-semibold text-ink-400">练习记录</div>
      <div className="space-y-1">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-md bg-ink-100/60 px-2 py-1 text-[11px] dark:bg-ink-800/60">
            <span className="text-ink-400 dark:text-ink-500">{new Date(s.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="flex-1 truncate">{s.types.map((t) => QUESTION_TYPE_LABELS[t]).join('、')}</span>
            <span className="font-semibold text-accent-600 dark:text-accent-300">{s.score ?? '—'}分</span>
          </div>
        ))}
      </div>
    </div>
  );
}
