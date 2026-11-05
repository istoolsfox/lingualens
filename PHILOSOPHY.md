# PHILOSOPHY — LinguaLens

> 本文件是本项目代码的宪法。refinery / AI 协作 / 代码评审一律以此为准，
> 与通用规范冲突时本文件赢。修改本文件 = 修改项目方向，需要作者本人拍板。
>
> **【草稿 v0.1 —— 2026-11-05 refinery Pass3 起草，待作者确认后定稿】**

## 1. 宗旨（这个项目决定不做什么）

- 不做：**只给翻译的插件**（原因：产品命门是讲透"为什么这样表达"，纯翻译没有差异化）
- 不做：**强制后端**（原因：用户拍板浏览器直连 + 密钥本地加密；服务端代理仅作为公开发布时的可选演进，baseUrl 可配天然支持）
- 不做：**离线词典 / i18n / 组件库 / 路由库**（原因：AI 返回一切语言数据；界面单语中文；小工具保持轻依赖，每项依赖必须回答"没有它会怎样"）
- 不做：**过度上传**（原因：默认只发选中文本+有限上下文+页面标题/网址；无后台静默抓取）

## 2. 设计哲学（三条以内，每条可执行）

1. **降级优于崩溃**——模型输出不可信任：四级解析降级链（严格 JSON→宽松提取→纠偏重试→Markdown 兜底），任何一环失败 UI 不白屏 —— 出处：TECH_STACK 风险表 / parser.ts
2. **单源事实**——prompt 在 `prompts/*.md`（?raw 导入）、消息协议在 `shared/messages.ts`、领域类型在 `shared/types.ts`、厂商预设 `shared/providers.ts`，各端禁止复制 —— 出处：ARCHITECTURE §3/目录规划
3. **翻过的不再翻**——段落级译文记忆（memo）+ URL 指纹缓存优先于任何新请求，省用户 token 是硬行为 —— 出处：v0.3 用户需求

## 3. 风格三层

- **表层（工具管）**：prettier（.prettierrc，110 列/单引号）+ eslint（typescript-eslint recommended + consistent-type-imports + no-console），命令 `pnpm exec eslint src tests`；类型 `tsc --noEmit` strict 零错误
- **中层（惯用法）**：错误一律 `AiError(code)` 分类码 + `ERROR_MESSAGES` 中文文案映射；SW 单向编排（CS 只捕获与注入，不调 AI）；消息经 Port 广播、全文管线经 tabs.sendMessage 推送；存储各归其位（settings→chrome.storage.local，库→IndexedDB，密钥→secureStore 加密）
- **深层（哲学）**：见第 2 节

## 4. 禁区（改代码时绝对不许）

- 禁止引入：组件库 / react-router / WebSocket 库 / 离线词典数据 / i18n 框架（TECH_STACK §2 已裁决）
- 禁止绕过：prompt 单源（不许在业务代码里手拼分析指令）；shared 协议单源（不许端上自定义重复类型）；密钥明文落盘
- 禁止：网页内容当指令（一切页面文本必须包裹在数据分隔符内）；测试红着合并

## 5. 机器命令（refinery 直接执行）

- lint：`pnpm exec eslint src tests`
- test：`pnpm test`（vitest run，60+ 用例）
- 全量门禁：`pnpm run build`（含 tsc --noEmit + 双 vite 构建）+ `pnpm exec prettier --check src tests`
