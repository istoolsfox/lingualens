// ============================================================
// sidepanel/components/bits.tsx —— 基础 UI 原子组件
// ============================================================

import type { ReactNode } from 'react';
import { ERROR_MESSAGES } from '../../shared/constants';

export function Btn({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-accent-600 text-white hover:bg-accent-700',
    ghost: 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
    danger: 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-ink-800',
  };
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className ?? ''}`}>
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-400 dark:text-ink-500 text-xs py-1">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-400 border-t-transparent" />
      {label ?? '加载中…'}
    </div>
  );
}

export function ErrorBox({ code, message, onRetry }: { code?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-ink-700 dark:bg-ink-900 dark:text-red-300">
      <div className="font-medium">{message || ERROR_MESSAGES[code ?? 'unknown'] || ERROR_MESSAGES.unknown}</div>
      {onRetry && (
        <div className="mt-2">
          <Btn onClick={onRetry} variant="danger">
            重试
          </Btn>
        </div>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-xs text-ink-400 dark:text-ink-500">{children}</div>;
}

export function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
        active
          ? 'bg-accent-600 text-white'
          : 'bg-ink-100 text-ink-500 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-400 dark:hover:bg-ink-700'
      }`}
    >
      {children}
    </button>
  );
}

export function SectionCard({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function KindBadge({ kind }: { kind?: 'rule' | 'habit' | 'style' }) {
  if (!kind) return null;
  const map = {
    rule: { label: '规则', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    habit: { label: '习惯', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    style: { label: '作者风格', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  } as const;
  const item = map[kind];
  return <span className={`ml-1 rounded px-1 py-px text-[10px] ${item.cls}`}>{item.label}</span>;
}

export function CopyBtn({ text, label = '复制' }: { text: string; label?: string }) {
  return (
    <Btn
      onClick={() => {
        void navigator.clipboard.writeText(text).catch(() => {
          // 降级：execCommand 兜底
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        });
      }}
      title="复制"
    >
      {label}
    </Btn>
  );
}
