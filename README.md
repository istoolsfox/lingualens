# LinguaLens —— AI 英语深度阅读助手

> 选中即精读的 Chrome 扩展。不止翻译，讲透英语为什么这样表达。

## 状态

- 状态：**v0.2.0（小白化 + 整文翻译轮完成），真实模型验收待用户跑测**
- 最后更新：2026-11-05

## 项目简介

面向中文小白用户的 AI 英语阅读浏览器扩展：在英文网页选中任意内容（单词/短语/句子/段落），AI 返回结构化多维度讲解——双轨翻译、意群拆解、语法"为什么"解析、重点词汇与构词、表达习惯与中英差异；支持追问、本地知识库与练习（含仿写批改）。**快捷键 Alt+L 一键智能提取文章正文逐段双语翻译**（Readability，只取正文不翻导航评论）。

核心纪律（写在 `prompts/common_discipline.md`）：不编造词源与语法规则、不确定必须标注、区分语法规则/语言习惯/作者风格三类知识、讲作用不贴标签。

## 安装（加载扩展）

1. 构建：`pnpm install && pnpm build`（或直接用 `output/lingualens-v0.1.0.zip` 解压）
2. Chrome 打开 `chrome://extensions/` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录
3. 工具栏点击 LinguaLens 图标 → 打开侧边栏 → 右上角 ⚙ 进设置页配置 API
4. 在任意英文网页选中文字 → 浮动工具栏 → 「AI 精读」

要求 Chrome 114+（Side Panel API）。

## 配置说明（小白三步）

1. **选厂商**：DeepSeek / 硅基流动 / 智谱 / Kimi / 阿里百炼 / OpenAI / Ollama 本机 / 自定义（预设自动填好地址）
2. **贴密钥**：AES-256-GCM 加密存本机；来源提示写在旁边
3. **保存并测试**：一键验证连通性；其余设置改动自动保存

模型从常用列表选或手填；Temperature/Tokens/超时/主题/浮动栏开关/排除站点收进「高级设置」折叠。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + L` | **翻译本文**：Readability 智能提取正文，逐段双语翻译（跳过导航/侧栏/评论） |

在 Chrome 的 `chrome://extensions/shortcuts`（设置页有直达按钮）可改成任意组合键，不会与站内快捷键冲突（Chrome 全局层接管）。

## 交互入口（四路）

1. **浮动栏**：网页选中 → 「AI 精读 / 翻译 / 解释 / 收藏」（长选区自动截断并显示提示，不再静默失效）
2. **图标激活**：点工具栏图标 → 自动读取当前页选区并打开侧边栏（受限页降级为手动输入）
3. **手动输入**：侧边栏输入框直接粘贴英文
4. **快捷键 Alt+L**：整文翻译模式（进度条 + 双语逐段对照 + 可中断）

## 功能地图

| 模块 | 内容 |
|------|------|
| AI 分析 | 单词/短语/句子/段落四模式自动路由（本地启发式+LLM 校准），七 Tab 渲染；长文自动切换精简输出（防 JSON 截断） |
| 整文翻译 | Alt+L 触发 → Readability 提取正文 → 分批顺序翻译（2400 字/批）→ 双语逐段对照 + 进度条 + 可中断 |
| 流式 | SSE 流式 → Port 转发 → 概览字段渐进渲染（未完成 JSON 的增量提取） |
| 降级 | 严格 JSON → 宽松提取（截取大括号+修尾随逗号）→ 附纠偏指令重试 → Markdown 简化视图 |
| 对话 | 多轮追问（继承原文+分析摘要+滚动历史），可中断，快捷追问 |
| 知识库 | IndexedDB：收藏（含/不含分析）、搜索、类型/标签筛选、笔记、删除、JSON 导入导出、清空 |
| 练习 | 七种题型（单词/短语/语法选择、翻译、仿写、近义辨析、纠错），选择题本地判分 + 主观题 AI 批改，成绩落库 |
| 厂商预设 | 8 家预设（DeepSeek/硅基流动/智谱/Kimi/百炼/OpenAI/Ollama/LM Studio）+ 自定义，选完只填 Key |
| 安全 | 网页上下文包裹为纯数据（防 prompt 注入）、输出白名单净化渲染（DOMPurify）、密钥加密落盘、一键清除全部数据 |

## 开发指南

```bash
pnpm install
pnpm build        # 类型检查 + 主构建（SW/Panel/Options）+ content script（IIFE）
pnpm watch:main   # 主构建监听（改代码后到 chrome://extensions 点刷新）
pnpm watch:content
pnpm test         # Vitest 单测（46 个）
pnpm icons        # 重新生成图标
pnpm zip          # 打包 dist → output/lingualens-v0.1.0.zip
```

目录结构详见 `docs/ARCHITECTURE.md` 第 6 节。关键机制：

- **Prompt 单源**：`prompts/*.md` + `prompts/schemas/*.json` 是唯一事实源，业务代码以 `?raw` 导入，不散落。
- **消息协议单源**：`src/shared/messages.ts` 三端共用类型。
- **双构建**：主构建产出 ESM（SW type:module）；content script 单独构建为自包含 IIFE（MV3 内容脚本不支持 ESM）。
- **会话恢复**：分析会话落 `chrome.storage.session`（浏览器关闭即清），SW 被杀后 Panel 可恢复最近 20 条。

## 已知问题（诚实清单）

1. **iframe 内选区**：浮动栏只在主框架生效（`all_frames: false`）；iframe 内文本可复制后用手动输入。
2. **sidePanel.open 手势边界**：浮动栏触发的侧边栏打开若被 Chrome 判定无手势，自动回退为弹窗。
3. **受限页面**：chrome://、Chrome 商店等无法注入——图标入口可用，快捷键在受限页会提示无法提取正文。
4. **本地加密的保护边界**：AES 加密防"密钥明文泄露"；设备被完全控制的攻击者无法防御。设置页已如实说明。
5. **长选区截断**：选区超 12000 字符自动截断（浮动栏显示"长文已截断"提示），不静默失效；全文阅读请用 Alt+L 整文翻译。
6. **整文翻译不持久**：翻译进行中若 SW 被浏览器回收会中断（活动请求期间保持活跃，正常长文不会触发）；重按快捷键即重译。进度不落盘。
7. **正文提取边界**：Readability 对首页/列表页/论坛聚合页可能提取不到正文（提示"没找到正文"）；对懒加载图片无影响，纯文本提取。
8. **快捷键输入冲突**：macOS 下 Alt+L 在某些输入框会打出 ¬；Chrome 快捷键在输入焦点时优先打字，冲突时自行改键即可。
9. **厂商预设模型名会过期**：预设模型随厂商更新可能下线，输入框可手改；预设只是起点。
10. **真实模型验收**：PRD 四大验收案例需配真实 API 后人工跑测。
11. **strictJson 依赖端点**：默认关闭，解析有四级降级兜底。

## 设计文档（docs/）

[PRD](docs/PRD.md) · [FEATURE_LIST](docs/FEATURE_LIST.md) · [USER_FLOW](docs/USER_FLOW.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [TECH_STACK](docs/TECH_STACK.md) · [ROADMAP](docs/ROADMAP.md)

## 目录说明

- `docs/`：设计文档（阶段 1 产出并随实现同步）
- `prompts/`：AI 分析 Prompt 与 JSON Schema（运行时事实源，?raw 导入）
- `src/`：源码（background / ai / content / sidepanel / options / storage / shared）
- `tests/`：单元测试（router / parser / streamExtract / promptBuilder / secureStore / favorites / settings）
- `scripts/`：图标生成、zip 打包
- `output/`：发布 zip
- `notes/`：开发记录（验收记录后续写这里）
