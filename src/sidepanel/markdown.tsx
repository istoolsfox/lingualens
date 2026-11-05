// ============================================================
// sidepanel/markdown.tsx —— 安全 Markdown 渲染
// marked 解析 + DOMPurify 白名单净化，禁 raw HTML 注入
// ============================================================

import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ async: false, gfm: true, breaks: true });

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'span',
  'div',
];

export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text ?? '') as string;
    return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR: ['class'] });
  }, [text]);
  return <div className={`md ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
