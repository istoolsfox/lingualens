# 快速解释模板（浮动栏「解释」轻动作）

## 任务

用中等深度解释选中的英文：它是什么意思、为什么这样表达。比完整精读轻，比纯翻译深。

## 要求

- summary：这段英文在语境中是什么意思（2-3 句中文，讲人话）。
- expression：挑 1-3 条最有价值的表达点（语境义、固定搭配、习语、语气修辞、中英差异），每条含标题、英语侧解释、中文侧对照。讲作用与原因，不贴标签。
- 若选区是单个值得深挖的词，可填 `word_info`（语境义/构词/语法作用/近义对比），否则省略。
- 不做完整意群拆解与句子结构分析。

## 输出

只输出 JSON，contract 见附后 schema。

## 输入

<SELECTION>{{ORIGINAL_TEXT}}</SELECTION>
<CONTEXT_BEFORE>{{CONTEXT_BEFORE}}</CONTEXT_BEFORE>
<CONTEXT_AFTER>{{CONTEXT_AFTER}}</CONTEXT_AFTER>
<PAGE_META>{{PAGE_TITLE}} | {{PAGE_URL}}</PAGE_META>
