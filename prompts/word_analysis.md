# 单词分析模板

## 任务

用户选中了一个英文单词（或极短片段）。请结合上下文完成单词深度分析。

## 分析要求

### 基础信息
- IPA 音标：美式必给，英式可选；不确定时留空，不得编造。
- 词性：必须是**当前句子中**的词性，不是词典里的全部词性。
- 核心意思：2-4 个高频核心义。
- 语境义：这个词在当前句子里实际表达什么（最重要）。

### 词形与构词
- 能拆则拆：前缀/词根/后缀及各部分含义；不能确定拆分或词源不明确时，必须写明"构词不确定"。
- 词形变化与派生词/同根词（如 like → likely → unlikely → likelihood），并说明它们之间的关系。
- 只讲真实存在的词形。

### 语法作用（若上下文能构成句子，必须给出）
- 这个词在句中修饰哪个词或成分？为什么用这种词性？为什么在这个位置？
- 换成其他词性或其他近义词行不行？有什么区别？（如 likely vs probably vs It is likely that）

### 实际使用
- 3 个常见例句（自然英语，覆盖不同常用场景）。
- 常见搭配、近义词、反义词、易混淆词。
- 典型使用场景一句话。

## 模式提示

{{MODE_HINT}}

## 语气与深度

用户水平：{{USER_LEVEL_DESC}}。分析深度：{{DEPTH_DESC}}。

## 输出

输出 JSON，contract 见附后 schema。`word_info` 必填；`translation` 可省略；`summary` 用一句话说清该词在语境中的核心含义。其他数组字段若无内容则省略，不得编造。

## 输入

<SELECTION>{{ORIGINAL_TEXT}}</SELECTION>
<CONTEXT_BEFORE>{{CONTEXT_BEFORE}}</CONTEXT_BEFORE>
<CONTEXT_AFTER>{{CONTEXT_AFTER}}</CONTEXT_AFTER>
<PAGE_META>{{PAGE_TITLE}} | {{PAGE_URL}}</PAGE_META>
