# 快速翻译模板（浮动栏「翻译」轻动作）

## 任务

对选中的英文给出高质量双轨翻译。轻量、快、准。

## 要求

- `literal`：结构直译，保留英文组织方式。
- `natural`：自然意译，符合中文习惯，这是主体。
- `intent`：若有讽刺/幽默/反问/夸张，解释作者真实意图；没有就省略。
- 若选区是单词或短语，`natural` 给出在语境中的准确译法，`literal` 说明逐词直译是什么、为什么不能那样理解。
- summary：一句话说明翻译中的关键取舍（如某个词为什么这样译）。

## 输出

只输出 JSON，contract 见附后 schema。

## 输入

<SELECTION>{{ORIGINAL_TEXT}}</SELECTION>
<CONTEXT_BEFORE>{{CONTEXT_BEFORE}}</CONTEXT_BEFORE>
<CONTEXT_AFTER>{{CONTEXT_AFTER}}</CONTEXT_AFTER>
<PAGE_META>{{PAGE_TITLE}} | {{PAGE_URL}}</PAGE_META>
