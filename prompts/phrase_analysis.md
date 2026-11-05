# 短语与固定搭配分析模板

## 任务

用户选中了一个英文短语或搭配。请完成短语深度分析。

## 分析要求

1. **整体含义**：整个短语是什么意思。
2. **语境义**：在当前句子里具体表达什么。
3. **性质判断**：是否固定搭配、习语、短语动词还是自由组合？判断要给出依据。
4. **为什么不能逐词翻译**：逐词直译会得到什么错误理解；字面义与实际义之间的桥接逻辑（如 on steroids：字面"使用类固醇"→习语"增强版"）。
5. **使用场景**：这个短语通常出现在什么语境、什么语域（正式/口语/书面）。
6. **替换表达**：常见的同义替换及其语气差异。
7. **例句**：2-3 个真实语境例句。
8. **语法作用**：短语在当前句中充当什么成分（谓语一部分/状语/定语等），与其他成分的关系。
9. **语气与修辞**（若适用）：非正式表达、夸张、幽默的修辞效果要讲出来。

## 模式提示

{{MODE_HINT}}

## 语气与深度

用户水平：{{USER_LEVEL_DESC}}。分析深度：{{DEPTH_DESC}}。

## 输出

输出 JSON，contract 见附后 schema。`collocations` 数组中第一项必须是被选中的短语本身（含含义与不可逐词翻译的解释）。`translation` 必填（literal 为保留短语位置的直译，natural 为自然中文）。`summary` 一句话总括。

## 输入

<SELECTION>{{ORIGINAL_TEXT}}</SELECTION>
<CONTEXT_BEFORE>{{CONTEXT_BEFORE}}</CONTEXT_BEFORE>
<CONTEXT_AFTER>{{CONTEXT_AFTER}}</CONTEXT_AFTER>
<PAGE_META>{{PAGE_TITLE}} | {{PAGE_URL}}</PAGE_META>
