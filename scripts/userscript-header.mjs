// ============================================================
// scripts/userscript-header.mjs —— 给构建产物拼 UserScript 元数据头
// 单独走脚本而不放 rollup banner：vite 压缩会把 banner 当注释只留 @license 行
// 版本单一真源 = public/manifest.json（与扩展同步，单测有断言）
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'dist-userscript', 'lingualens-lite.user.js');
const { version } = JSON.parse(readFileSync(join(root, 'public', 'manifest.json'), 'utf8'));

const HEADER = `// ==UserScript==
// @name         LinguaLens Lite — AI 英语深度阅读
// @name:en      LinguaLens Lite — AI English Deep Reader
// @namespace    https://github.com/istoolsfox/lingualens
// @version      ${version}
// @description  选中即精读：划词结构化讲解（构词/语法为什么/意群/中英差异）+ 整页注入对照翻译 + 重点表达虚线讲解卡。AI 直连你自己的密钥（8 家厂商预设），密钥 AES 加密仅存本机，无任何中间服务器。
// @description:en Select-to-deep-read: structured AI explanations (morphology, grammar why, sense chunks, EN/CN differences) + full-page bilingual injection with dashed highlight cards. BYO API key, AES-encrypted locally, no middleman server.
// @author       istoolsfox
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      api.deepseek.com
// @connect      api.siliconflow.cn
// @connect      open.bigmodel.cn
// @connect      api.moonshot.cn
// @connect      dashscope.aliyuncs.com
// @connect      api.openai.com
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// @noframes
// @license      MIT
// @homepageURL  https://github.com/istoolsfox/lingualens
// @supportURL   https://github.com/istoolsfox/lingualens/issues
// ==/UserScript==
`;

let body = readFileSync(target, 'utf8');
// 防重复拼接（重复构建时 vite 可能保留上一次的头）
body = body.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n/, '');
writeFileSync(target, HEADER + body);
console.log(`userscript header applied: v${version} → ${target}`);
