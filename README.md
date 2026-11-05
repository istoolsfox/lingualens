# LinguaLens —— AI 英语深度阅读助手

> 选中即精读的 Chrome 扩展。不止翻译，讲透英语为什么这样表达。

## 状态

- 状态：**v0.1.0 全功能完成（阶段 1-6 全部落地），真实模型验收待用户跑测**
- 最后更新：2026-11-05

## 项目简介

面向中文用户的 AI 英语学习浏览器扩展：在英文网页选中任意内容（单词/短语/句子/段落），AI 返回结构化多维度讲解——双轨翻译（结构直译+自然意译）、意群拆解、句子结构、语法"为什么"解析、重点词汇与构词、固定搭配、表达习惯与中英差异，并支持围绕原文连续追问、本地知识库收藏与基于收藏的练习（含仿写批改）。

核心纪律（写在 `prompts/common_discipline.md`）：不编造词源与语法规则、不确定必须标注、区分语法规则/语言习惯/作者风格三类知识、讲作用不贴标签。

## 安装（加载扩展）

1. 构建：`pnpm install && pnpm build`（或直接用 `output/lingualens-v0.1.0.zip` 解压）
2. Chrome 打开 `chrome://extensions/` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录
3. 工具栏点击 LinguaLens 图标 → 打开侧边栏 → 右上角 ⚙ 进设置页配置 API
4. 在任意英文网页选中文字 → 浮动工具栏 → 「AI 精读」

要求 Chrome 114+（Side Panel API）。

## 配置说明（设置页）

| 项 | 说明 |
|----|------|
| API 地址 | OpenAI 兼容 Base URL（如 `https://api.deepseek.com/v1`，或硅基流动/OpenAI/本地端点） |
| 模型名称 | 任意兼容模型 |
| API 密钥 | **AES-256-GCM 加密**存本机（WebCrypto，安装时生成随机设备密钥） |
| Temperature / 最大 Tokens / 超时 | 默认 0.3 / 4096 / 60s |
| 强制 JSON 模式 | 端点支持 `response_format json_object` 时可开（有探测按钮）；不开也能工作（四级解析降级兜底） |
| 英语水平 / 分析深度 | 注入 prompt 控制解释风格 |
| 上下文长度 | 选区前后各取多少字符（默认 300） |
| 浮动栏 | 全站开启 / 关闭；排除站点清单（每行一个域名） |
| 主题 | 跟随系统 / 亮 / 暗 |

**连接测试**按钮发一次最小请求验证配置。**隐私说明**首次使用会弹出确认卡。

## 交互入口（三路）

1. **浮动栏**：网页选中 → 「AI 精读 / 翻译 / 解释 / 收藏」
2. **图标激活**：点工具栏图标 → 自动读取当前页选区并打开侧边栏（chrome:// 等受限页自动降级为手动输入）
3. **手动输入**：侧边栏输入框直接粘贴英文

## 功能地图

| 模块 | 内容 |
|------|------|
| AI 分析 | 单词/短语/句子/段落四模式自动路由（本地启发式+LLM 校准），七 Tab 渲染（概览/结构/语法/词汇/搭配/表达/对话） |
| 流式 | SSE 流式 → Port 转发 → 概览字段渐进渲染（未完成 JSON 的增量提取） |
| 降级 | 严格 JSON → 宽松提取（截取大括号+修尾随逗号）→ 附纠偏指令重试 → Markdown 简化视图 |
| 对话 | 多轮追问（继承原文+分析摘要+滚动历史），可中断，快捷追问 |
| 知识库 | IndexedDB：收藏（含/不含分析）、搜索、类型/标签筛选、笔记、删除、JSON 导入导出、清空 |
| 练习 | 七种题型（单词/短语/语法选择、翻译、仿写、近义辨析、纠错），选择题本地判分 + 主观题 AI 批改，成绩落库 |
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

1. **iframe 内选区**：浮动栏只在主框架生效（`all_frames: false`，避免全站 iframe 注入开销）；iframe 内文本可复制后用手动输入。
2. **sidePanel.open 手势边界**：浮动栏触发的侧边栏打开若被 Chrome 判定无手势，自动回退为弹窗（功能等价，窗口形态不同）。
3. **受限页面**：chrome://、Chrome 商店等页面无法注入，浮动栏不出现——图标入口可用，侧边栏提示手动输入。
4. **本地加密的保护边界**：AES 加密防"密钥明文泄露"（存储读取/备份/截屏）；设备被完全控制的攻击者无法防御。设置页已如实说明。
5. **流式渲染粒度**：概览字段（直译/意译/最终理解）先行渐进出现；深度语法节在完整解析后一次性渲染。
6. **搜索规模**：V1 为内存过滤（千条量级毫秒级）；万条以上再升级索引。
7. **真实模型验收**：PRD 第 7 节四大验收案例（likely/scammy、get through to、not how glasses work、on steroids）需配真实 API 后人工跑测——测试套件已覆盖解析与路由层，模型语义质量待实机确认。
8. **strictJson 依赖端点**：`response_format json_object` 兼容性参差，默认关闭；开启前用设置页"探测端点"。

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
