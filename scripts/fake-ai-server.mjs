// ============================================================
// scripts/fake-ai-server.mjs —— 假 OpenAI 兼容服务器（E2E 用）
// 按 prompt 内容分流返回：分析 JSON / 整文批次 / 全文批次（items+highlights）
// 统计请求数（验证缓存复用 0 请求），支持 --fail-json 模拟 json_object 400
// ============================================================

import { createServer } from 'node:http';

let requestCount = 0;
const failJson = process.argv.includes('--fail-json');

function analysisResult(text) {
  return {
    detected_type: 'sentence',
    original_text: text,
    summary: '【假服务器】作者想表达：这句话讲的uu是内容摘要。',
    translation: {
      literal: '【直译】这是一个结构直译的假译文。',
      natural: '【意译】这是一条自然流畅的假译文。',
    },
    chunks: [{ text: text.slice(0, 20), meaning: '假意群含义', role: '主句' }],
    structure: [{ component: '主语', text: 'the system', explanation: '假结构说明' }],
    grammar_points: [
      { title: '假语法点', quote: 'likely', explanation: '这里是副词修饰动词（假解释）', kind: 'rule' },
    ],
    vocabulary: [
      {
        word: 'likely',
        pos: 'adv.',
        context_meaning: '很可能',
        morphology: 'like + -ly',
        collocations: ['most likely'],
      },
    ],
    collocations: [
      {
        phrase: 'on steroids',
        meaning: '增强版（假习语解释）',
        usage_note: '不可逐词翻译',
        examples: ['A computer on steroids.'],
        kind: 'habit',
      },
    ],
    expression: [
      {
        title: '中英差异（假）',
        en_side: 'English puts weight first.',
        cn_side: '中文习惯后置展开。',
        kind: 'habit',
      },
    ],
  };
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requestCount++;
      const reqObj = JSON.parse(body);
      if (failJson && reqObj.response_format) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'response_format is not supported (fake)' } }));
        return;
      }
      const userMsg = reqObj.messages.find((m) => m.role === 'user')?.content ?? '';
      let content;
      if (userMsg.includes('翻译失败')) {
        content = JSON.stringify({ items: [] }); // 诊断诱饵：不该被任何路径命中
      } else if (userMsg.includes('"items"') && userMsg.includes('natural')) {
        console.log(
          '[fake] 翻译批 blocks:',
          (userMsg.match(/<PARAGRAPHS>([\s\S]*?)<\/PARAGRAPHS>/) ??
            userMsg.match(/<UNITS_JSON>([\s\S]*?)<\/UNITS_JSON>/) ?? ['', ''])?.[1]?.slice(0, 60),
        );
        // 翻译批次（整文/全文）：从输入里抽真实 id 回填
        // 精准抽取段落 JSON：标记内首个 '[' 起做括号配平（防 schema 契约的 ']' 干扰）
        const src = userMsg.includes('<UNITS>')
          ? userMsg.split('<UNITS>')[1]
          : userMsg.split('<PARAGRAPHS>')[1];
        let blocks = [];
        if (src) {
          const start = src.indexOf('[');
          if (start >= 0) {
            let depth = 0;
            let inStr = false;
            let esc = false;
            for (let i = start; i < src.length; i++) {
              const ch = src[i];
              if (inStr) {
                if (esc) esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === '"') inStr = false;
              } else if (ch === '"') inStr = true;
              else if (ch === '[') depth++;
              else if (ch === ']') {
                depth--;
                if (depth === 0) {
                  try {
                    blocks = JSON.parse(src.slice(start, i + 1));
                  } catch {
                    blocks = [];
                  }
                  break;
                }
              }
            }
          }
        }
        const ids = blocks.map((b) => b.id);
        const wantsHighlights = userMsg.includes('expr');
        const payload = {
          items: ids.map((id) => ({ id, natural: `【假译文】第 ${id} 段的中文内容，用于端到端验证。` })),
        };
        payload.terms = [{ en: 'steroids', zh: '强化剂（假术语）' }];
        if (wantsHighlights) {
          // 模拟真实模型：挑一个文本里真的含 'the' 的单元
          const blocks = (() => {
            try {
              return JSON.parse(m?.[0] ?? '[]');
            } catch {
              return [];
            }
          })();
          const hit = blocks.find((b) => typeof b.text === 'string' && b.text.includes('the'));
          if (hit) {
            payload.highlights = [{ id: hit.id, expr: 'the', why: '【假讲解】定冠词，特指前文提到的事物。' }];
          }
        }
        content = JSON.stringify(payload);
      } else if (userMsg.includes('detected_type') || userMsg.includes('word_info')) {
        // 分析模式（四 schema 共用）：尽量回填真实原文
        const textMatch = userMsg.match(/<SELECTION>([\s\S]*?)<\/SELECTION>/);
        const original = textMatch?.[1]?.trim() || 'test';
        content = JSON.stringify({ ...analysisResult(original), original_text: original });
      } else if (userMsg.includes('literal') && userMsg.includes('natural')) {
        content = JSON.stringify({
          translation: { literal: '假直译', natural: '假意译' },
          summary: '假取舍',
        });
      } else {
        content = JSON.stringify({
          summary: '假解释内容',
          expression: [{ title: '假表达点', en_side: 'en', cn_side: 'cn' }],
        });
      }

      if (reqObj.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunks = content.match(/[\s\S]{1,80}/g) ?? [];
        for (const c of chunks) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }
    });
    return;
  }
  if (req.url === '/count') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: requestCount }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(18734, () => console.log('fake-ai-server on :18734'));

// 请求数查询（E2E 断言缓存复用用）
process.on('SIGUSR2', () => {
  console.log(`REQUEST_COUNT=${requestCount}`);
  process.exit(0);
});
setInterval(() => console.log(`[fake] requests so far: ${requestCount}`), 5000);
