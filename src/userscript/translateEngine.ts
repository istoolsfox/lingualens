// ============================================================
// userscript/translateEngine.ts —— 油猴版页面翻译引擎
// 扩展 startFullPageTranslate 的页内移植：缓存→记忆复用→分批→GM 直连。
// 产物经 pushToContent 回灌 content/fullpage 的消息处理器（注入/占位/pill）。
// 复用：splitBlocksIntoBatches / planWithMemo / buildFullPageBatchPrompt /
//       mergeTerms / pageFingerprint / textKey / chatCompletionWithRetry
// ============================================================

import { chatCompletionWithRetry, type EndpointConfig } from '../ai/client';
import { extractJsonObject } from '../ai/parser';
import { mergeTerms, planWithMemo, splitBlocksIntoBatches } from '../ai/article';
import { pageFingerprint, textKey } from '../ai/hash';
import { buildFullPageBatchPrompt } from '../ai/promptBuilder';
import { mergeSettings, type Settings } from '../shared/settings';
import type { FullPageHighlight, FullPagePayload } from '../shared/messages';
import { loadApiKey } from '../background/secureStore';
import { gmStorageLike, gmStore } from './gm';
import { gmGetValueRaw } from './gmRaw';
import { pushToContent } from './chromeShim';

const CACHE_SLOT = 'll_pagecache';
const MEMO_SLOT = 'll_memo';
const CACHE_LIMIT = 30;
const MEMO_LIMIT = 500;

interface CacheRow {
  url: string;
  fingerprint: string;
  title: string;
  blocks: { id: number; text: string }[];
  translations: Record<string, string>;
  highlights?: FullPageHighlight[];
  terms?: { en: string; zh: string }[];
  updatedAt: number;
}

async function resolveConfig(): Promise<{ cfg: EndpointConfig; settings: Settings } | null> {
  const settings = mergeSettings(gmGetValueRaw('ll_settings'));
  const apiKey = await loadApiKey(gmStorageLike);
  if (!settings.api.baseUrl || !settings.api.model || !apiKey) return null;
  return {
    settings,
    cfg: {
      baseUrl: settings.api.baseUrl,
      apiKey,
      model: settings.api.model,
      temperature: settings.api.temperature,
      maxTokens: settings.api.maxTokens,
      timeoutMs: settings.api.timeoutMs,
    },
  };
}

function readCache(): Record<string, CacheRow> {
  return gmStore.get<Record<string, CacheRow>>(CACHE_SLOT, {});
}
function writeCache(c: Record<string, CacheRow>): void {
  // LRU：按 updatedAt 留最近 CACHE_LIMIT 条
  const entries = Object.entries(c)
    .sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0))
    .slice(0, CACHE_LIMIT);
  gmStore.set(CACHE_SLOT, Object.fromEntries(entries));
}
function readMemo(): Map<string, string> {
  const raw = gmStore.get<Record<string, { natural: string }>>(MEMO_SLOT, {});
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) if (v?.natural) m.set(k, v.natural);
  return m;
}
function memoSave(pairs: { text: string; natural: string }[]): void {
  const raw = gmStore.get<Record<string, { natural: string; at: number }>>(MEMO_SLOT, {});
  const now = Date.now();
  for (const p of pairs) if (p.text && p.natural) raw[textKey(p.text)] = { natural: p.natural, at: now };
  const entries = Object.entries(raw)
    .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
    .slice(0, MEMO_LIMIT);
  gmStore.set(MEMO_SLOT, Object.fromEntries(entries));
}

let aborted = false;
export function cancelEngine(): void {
  aborted = true;
}

export async function handlePageTranslate(payload: unknown): Promise<void> {
  const p = payload as FullPagePayload;
  aborted = false;
  const push = async (msg: unknown): Promise<void> => {
    if (!aborted) pushToContent(msg);
  };

  const resolved = await resolveConfig();
  if (!resolved) {
    await push({ type: 'FULLPAGE_ERROR', errorCode: 'not_configured' });
    return;
  }
  const { cfg, settings } = resolved;
  if (!p.units || p.units.length === 0) {
    await push({ type: 'FULLPAGE_ERROR', errorCode: 'fullpage_empty' });
    return;
  }

  const useJsonMode = settings.api.strictJson;
  const cacheKey = `${p.url}#${p.mode ?? 'full'}`;
  const fingerprint = pageFingerprint(p.units.map((u) => u.text));

  // ① URL+mode 缓存命中 → 秒出（0 token）
  const cache = readCache();
  const hit = cache[cacheKey];
  if (hit && hit.fingerprint === fingerprint) {
    const items = hit.blocks
      .map((b) => ({ id: b.id, natural: hit.translations[String(b.id)] ?? hit.translations[b.id] ?? '' }))
      .filter((i) => i.natural);
    if (items.length > 0) {
      await push({ type: 'FULLPAGE_BATCH', index: 1, total: 1, items, highlights: hit.highlights ?? [] });
    }
    await push({
      type: 'FULLPAGE_DONE',
      translated: items.length,
      highlights: hit.highlights?.length ?? 0,
      reused: items.length,
      failed: 0,
      truncated: p.truncated,
    });
    return;
  }

  // ② 译文记忆复用
  const memo = readMemo();
  const { reused, pending } = planWithMemo(p.units, memo);
  if (reused.length > 0) {
    await push({ type: 'FULLPAGE_BATCH', index: 0, total: 0, items: reused, highlights: [] });
  }

  const batches = splitBlocksIntoBatches(pending);
  await push({ type: 'FULLPAGE_START', total: batches.length, reused: reused.length });
  if (pending.length === 0) {
    await push({
      type: 'FULLPAGE_DONE',
      translated: reused.length,
      highlights: 0,
      reused: reused.length,
      failed: 0,
      truncated: p.truncated,
    });
    return;
  }

  const termsAcc: { en: string; zh: string }[] = hit?.terms ? [...hit.terms] : [];
  const rollingRows: { src: string; nat: string }[] = [];
  for (const r of reused) {
    const src = p.units.find((u) => u.id === r.id)?.text ?? '';
    rollingRows.push({ src, nat: r.natural });
  }

  let highlightCount = 0;
  let failedUnits = 0;
  const collected = new Map<number, string>();
  const collectedHighlights: FullPageHighlight[] = [];

  try {
    for (const batch of batches) {
      if (aborted) return;
      await push({
        type: 'LL_PILL',
        state: 'run',
        text: `全文翻译中… 第 ${batch.index + 1}/${batches.length} 批`,
      });
      const prompt = buildFullPageBatchPrompt(p.title, batch.blocks, rollingRows.slice(-8), termsAcc);
      const acc = await chatCompletionWithRetry(cfg, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        stream: false,
        jsonObject: useJsonMode,
      });
      let obj = extractJsonObject(acc) as
        | {
            items?: { id?: unknown; natural?: unknown }[];
            highlights?: { id?: unknown; expr?: unknown; why?: unknown }[];
            terms?: { en?: unknown; zh?: unknown }[];
          }
        | undefined;
      let items = (Array.isArray(obj?.items) ? obj.items : []).filter(
        (it): it is { id: number; natural: string } =>
          typeof it?.id === 'number' && typeof it?.natural === 'string' && it.natural.length > 0,
      );
      if (items.length === 0) {
        // 去 JSON 模式重试一次；仍失败则标记该批并继续（不整体中止）
        const retryAcc = await chatCompletionWithRetry(cfg, {
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: `${prompt.user}\n\n注意：只输出 JSON 对象，不要任何其他文字。` },
          ],
          stream: false,
          jsonObject: false,
        });
        obj = extractJsonObject(retryAcc) as typeof obj;
        items = (Array.isArray(obj?.items) ? obj.items : []).filter(
          (it): it is { id: number; natural: string } =>
            typeof it?.id === 'number' && typeof it?.natural === 'string' && it.natural.length > 0,
        );
      }
      if (items.length === 0) {
        failedUnits += batch.blocks.length;
        await push({ type: 'FULLPAGE_BATCH_FAILED', ids: batch.blocks.map((b) => b.id) });
        continue;
      }
      const gotIds = new Set(items.map((i) => i.id));
      const missing = batch.blocks.filter((b) => !gotIds.has(b.id)).map((b) => b.id);
      if (missing.length > 0) {
        failedUnits += missing.length;
        await push({ type: 'FULLPAGE_BATCH_FAILED', ids: missing });
      }
      const textById = new Map(batch.blocks.map((b) => [b.id, b.text]));
      const highlights = (Array.isArray(obj?.highlights) ? obj.highlights : [])
        .filter((h): h is FullPageHighlight => {
          if (typeof h?.id !== 'number' || typeof h?.expr !== 'string' || typeof h?.why !== 'string')
            return false;
          if (h.expr.length < 2 || h.expr.length > 60 || h.why.length < 2) return false;
          const unitText = textById.get(h.id);
          return !!unitText && unitText.includes(h.expr);
        })
        .slice(0, 4);
      highlightCount += highlights.length;
      collectedHighlights.push(...highlights);
      mergeTerms(termsAcc, Array.isArray(obj?.terms) ? (obj.terms as { en: string; zh: string }[]) : []);
      for (const it of items) collected.set(it.id, it.natural);
      for (const b of batch.blocks) {
        const nat = collected.get(b.id);
        if (nat) rollingRows.push({ src: b.text, nat });
      }
      await push({ type: 'FULLPAGE_BATCH', index: batch.index + 1, total: batches.length, items, highlights });
      memoSave(
        items.map((it) => ({
          text: batch.blocks.find((b) => b.id === it.id)?.text ?? '',
          natural: it.natural,
        })),
      );
    }
    // 落缓存（同页同模式秒出）
    cache[cacheKey] = {
      url: cacheKey,
      fingerprint,
      title: p.title,
      blocks: p.units,
      translations: Object.fromEntries(
        p.units.map((u) => [String(u.id), collected.get(u.id) ?? '']).filter(([, v]) => v),
      ),
      highlights: collectedHighlights,
      terms: termsAcc.length > 0 ? termsAcc : undefined,
      updatedAt: Date.now(),
    };
    writeCache(cache);
    await push({
      type: 'FULLPAGE_DONE',
      translated: reused.length + pending.length - failedUnits,
      highlights: highlightCount,
      reused: reused.length,
      failed: failedUnits,
      truncated: p.truncated,
    });
  } catch (err) {
    const code =
      err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
    await push({ type: 'FULLPAGE_ERROR', errorCode: code });
  }
}

/** 设置面板测试连接用：拿当前完整配置（未配置返回 null） */
export async function resolveEndpointOrNull(): Promise<EndpointConfig | null> {
  const r = await resolveConfig();
  return r ? r.cfg : null;
}
