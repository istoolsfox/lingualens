# 段落分析模板

## 任务

用户选中了一个英文段落（可能含多句）。请完成段落级分析。

## 分析要求

### summary（先给段落大意）

- 一句话说清段落大意；若作者表达了观点，单独点明作者的观点与立场。

### translation

- `literal`：整段直译可按关键句直译的浓缩版（保持信息完整），或逐句直译拼接。
- `natural`：整段自然意译（最重要）。
- `intent`：作者的言外之意、讽刺、立场倾向（若有）。

### chunks（句间逻辑，段落模式的核心）

- 把段落拆成若干语义块（按句子或句群），每块说明它讲什么、与前文的逻辑关系（转折/因果/递进/举例/让步/总结）。
- 连接词（however/therefore/for instance/in fact 等）承载的逻辑必须显式点出。

### structure

- 段落内最复杂的 1-2 个句子做结构分析（主干+从句），不必每句都拆。

### grammar_points

- 挑段落中最值得讲的 2-4 个语法点（时态选择、从句嵌套、指代 it/this/they 指的是什么等）。

### vocabulary / collocations

- 挑影响理解与值得积累的词与搭配，不逐词倾倒。

### expression

- 段落层面的组织方式：作者如何展开论述（观点→例证？现象→原因？）、中英文行文差异。

## 模式提示

{{MODE_HINT}}

## 语气与深度

用户水平：{{USER_LEVEL_DESC}}。分析深度：{{DEPTH_DESC}}。

## 输出

输出 JSON，contract 见附后 schema。锚定原文，不编造。

## 输入

<SELECTION>{{ORIGINAL_TEXT}}</SELECTION>
<CONTEXT_BEFORE>{{CONTEXT_BEFORE}}</CONTEXT_BEFORE>
<CONTEXT_AFTER>{{CONTEXT_AFTER}}</CONTEXT_AFTER>
<PAGE_META>{{PAGE_TITLE}} | {{PAGE_URL}}</PAGE_META>
