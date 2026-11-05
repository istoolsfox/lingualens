# TECH_STACK —— 技术选型与理由

> 版本 v0.1（2026-11-05，阶段 1 产出，待确认）
> 原则：不为技术而技术。每一项依赖都要能回答"没有它会怎样"。

## 1. 选型总表

| 层 | 选型 | 替代方案 | 选择理由 |
|----|------|----------|----------|
| 语言 | TypeScript（strict） | JavaScript | 分析结果结构复杂、消息协议多端共享，类型即契约；strict 模式零错误是工程验收标准 |
| UI 框架 | React 18 | Svelte/Vue/原生 | 生态成熟，流式渐进渲染与条件渲染表达直接；团队协作心智一致 |
| 构建 | Vite 手写双配置（主构建 MPA+SW / 独立 IIFE 构建 content script） | @crxjs/vite-plugin | 2026-11-05 定案跳过 crxjs（beta 版本波动风险），直接采用其文档中声明的回退方案；SW 走 ESM module，content script 走单文件 IIFE，业务代码结构不变 |
| 样式 | Tailwind CSS | CSS Modules/原生 | 侧边栏窄容器适配场景多，utility 组合直观；主题切换用 CSS 变量 + dark class |
| 状态管理 | Zustand | Redux/Context | 轻量（1KB），分析会话/对话/库三块状态足够；Zustand vanilla 版可在 SW 侧复用同一心智 |
| 本地收藏库 | IndexedDB + `idb` 封装 | chrome.storage | 收藏条目含完整分析快照，体量超出 storage 合理范围；idb 是 Promise 化薄封装（~1KB），不用自造轮子 |
| 设置存储 | chrome.storage.local | localStorage | SW/CS/Panel 三端可访问，MV3 下 localStorage 不可用于 SW |
| AI 接口 | OpenAI 兼容 chat/completions（用户可配 baseUrl） | 各家 SDK | 一个客户端兼容 DeepSeek/OpenAI/硅基流动/本地 Ollama 等；SDK 会锁死 provider 且体积大 |
| 流式 | SSE（fetch ReadableStream 手动解析） | WebSocket | OpenAI 兼容接口事实标准即 SSE；MV3 SW 中 fetch 流式可靠 |
| Markdown 渲染 | marked + DOMPurify | react-markdown 全家桶 | 输出以结构化 JSON 为主，markdown 仅是字段级内容与降级兜底，两个小库够用；DOMPurify 保证净化 |
| 单元测试 | Vitest | Jest | 与 Vite 同源零配置；fake-indexeddb 支持 storage 层测试 |
| E2E | Playwright（--load-extension） | Selenium | Chromium 扩展加载官方支持；mock AI 端点用本地 fixture server |
| 包管理 | pnpm | npm/yarn | 磁盘占用与安装速度 |

## 2. 明确不引入的依赖（第一版）

| 不引入 | 理由 |
|--------|------|
| 独立后端（FastAPI） | V1 浏览器直连满足需求；服务端代理仅作为公开发布前的可选演进（配置项预留 `api.baseUrl` 天然支持指向代理） |
| 路由库（react-router） | 侧边栏只有三个视图，Zustand 状态切换足够 |
| 组件库（MUI/antd） | 界面小而克制，Tailwind 手写组件保持视觉统一可控 |
| 离线词典数据 | 音标/词性由 AI 返回，避免打包 MB 级词典与更新负担 |
| i18n 框架 | 界面面向中文用户，文案集中一个常量文件即可 |
| WebSocket / EventSource 库 | fetch 手动读流即可，少一层抽象 |
| 状态持久化中间件 | 收藏走 IndexedDB、设置走 storage，各归其位 |

## 3. AI 接口契约

```ts
// 请求（SW 内）
POST {baseUrl}/chat/completions
{
  model, temperature, max_tokens, stream: true,
  messages: [ { role: 'system', ...公共纪律+模式模板 }, { role: 'user', ...原文+上下文 } ],
  response_format: { type: 'json_schema', ... }  // strictJson=true 且端点支持时启用
}
```

兼容性策略：

1. `strictJson` 默认关闭——部分 OpenAI 兼容端点不支持 `response_format.json_schema`，强行开启会整请求 400。默认用 prompt 内嵌 JSON 契约（模板中写明输出 schema），客户端做四级降级解析（见 ARCHITECTURE 第 2 节）。设置页提供开关，开启前发一次探测请求验证端点支持。
2. 模型请求超时默认 60s，可配；单次失败自动重试 1 次（指数退避 2s 起）。
3. 密钥只在 SW 读取 storage.local，设置页输入时不回显明文。

## 4. 关键技术风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| @crxjs/vite-plugin 维护状态波动 | 构建链升级受阻 | 封装层薄：manifest.ts 与入口结构按 Vite 原生多入口可平移；出问题退回手写配置，业务代码不动 |
| MV3 Service Worker 会被浏览器休眠 | 长流式响应中断、内存缓存丢失 | 流式期间 SW 活跃（有未决 fetch）；分析结果落 storage.sessionCache 而非纯内存；会话恢复逻辑纳入测试 |
| 兼容端点 JSON 输出不稳定 | 解析失败 | 四级降级链 + fixtures 覆盖真实脏样本（尾随逗号/代码围栏包裹/前导文本） |
| 全站 content script 注入性能顾虑 | 页面加载变慢 | 脚本极小（仅选区监听+浮动栏），run_at: document_idle，lazy 渲染 Shadow DOM；浮动栏可全局关闭 |
| `<all_urls>` 权限引发上架审核阻力 | Chrome Web Store 上架难 | 用户说清这是选词类工具标准做法；若未来上架受阻，退路是 `optional_host_permissions` 按站点申请（交互降级为"点图标激活本页"） |
| AI 幻觉（编造词源/语法） | 产品信誉核心风险 | prompt 硬约束（不确定必须标注、区分规则/习惯/风格）+ 验收案例卡点 + 英语水平注入控制解释深度 |
| Side Panel API 兼容面（Chrome ≥114） | 老版本浏览器不可用 | 明确最低版本 Chrome 114，README 声明 |

## 5. 版本与工程约束

- TypeScript `strict: true`；`noUncheckedIndexedAccess` 开启。
- ESLint + Prettier（配置随仓库）。
- 消息协议、AnalysisResult 类型在 `shared/` 单源定义，禁止各端自定义重复类型。
- API Key 及任何含密钥文件列入 `.gitignore`；仓库内无密钥明文。
- 每阶段完成后跑：`tsc --noEmit` + `vitest run` + 构建产物加载冒烟。
