// ============================================================
// sidepanel/views/ArticleView.tsx —— 整文翻译视图（双语逐段对照）
// ============================================================

import { useStore } from '../store';
import { Btn, ErrorBox, Spinner } from '../components/bits';

export function ArticleView() {
  const st = useStore();
  const art = st.article;

  if (!art.payload) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-xs text-ink-400">按 Alt+L（或自定义快捷键）即可智能提取本文正文并逐段翻译。</p>
      </div>
    );
  }

  const p = art.payload;
  const translated = Object.keys(art.results).length;
  const pct = p.blocks.length > 0 ? Math.round((translated / p.blocks.length) * 100) : 0;
  const host = (() => {
    try {
      return new URL(p.url).hostname;
    } catch {
      return '';
    }
  })();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-200 px-3 pb-2.5 pt-3 dark:border-ink-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-semibold leading-snug">{p.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400 dark:text-ink-500">
              <span className="rounded bg-emerald-100 px-1.5 py-px font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                整文翻译
              </span>
              {host && <span className="max-w-[180px] truncate">{host}</span>}
              {p.byline && <span className="max-w-[140px] truncate">{p.byline}</span>}
              {p.truncated && <span className="text-amber-600 dark:text-amber-400">正文过长，已取前部</span>}
            </div>
          </div>
          <div className="flex shrink-0 gap-0.5">
            {art.phase === 'running' ? (
              <Btn variant="danger" onClick={st.cancelArticleAct}>
                停止
              </Btn>
            ) : (
              <Btn onClick={() => void st.retryArticle()} title="重新翻译全文">
                ↻
              </Btn>
            )}
            <Btn onClick={() => st.setView('analysis')} title="返回精读">
              ✕
            </Btn>
          </div>
        </div>
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
            <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink-400 dark:text-ink-500">
            <span>
              {art.phase === 'running' ? '翻译中…' : art.phase === 'error' ? '已停止/出错' : '翻译完成'} ·{' '}
              {translated}/{p.blocks.length} 段
            </span>
            {art.phase === 'running' && <Spinner label="" />}
          </div>
          {art.phase === 'done' && art.cacheInfo?.cached && (
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              这个页面之前翻过且内容没变，已直接使用缓存（0 token）
            </p>
          )}
          {art.phase === 'done' && art.cacheInfo && !art.cacheInfo.cached && art.cacheInfo.reused > 0 && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              页面内容有变化：复用了 {art.cacheInfo.reused} 段旧译文，新译 {art.cacheInfo.fresh} 段
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {art.phase === 'error' && art.errorCode !== 'aborted' && (
          <ErrorBox code={art.errorCode} message={art.errorMessage} onRetry={() => void st.retryArticle()} />
        )}
        {art.phase === 'error' && art.errorCode === 'aborted' && (
          <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            已停止翻译。
            <Btn onClick={() => void st.retryArticle()} className="ml-1 underline">
              重新翻译
            </Btn>
          </div>
        )}
        {p.blocks.map((b) => {
          const t = art.results[b.id];
          return (
            <div
              key={b.id}
              className="rounded-lg border border-ink-200 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-900"
            >
              <details>
                <summary className="cursor-pointer text-[11.5px] leading-relaxed text-ink-500 dark:text-ink-400 select-text">
                  {b.text}
                </summary>
              </details>
              <p className="mt-1.5 select-text text-[13px] leading-relaxed">
                {t ??
                  (art.phase === 'running' ? (
                    <span className="text-ink-300 dark:text-ink-600">…</span>
                  ) : (
                    <span className="text-ink-300 dark:text-ink-600">（未翻译）</span>
                  ))}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
