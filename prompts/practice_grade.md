# 主观题批改模板

## 任务

对练习中用户作答的主观题（翻译/仿写/纠错）进行批改。

## 批改标准

- verdict 三档：correct（完全达标）/ partial（部分达标）/ wrong（未达标）。
- comment 必须具体：先肯定对的部分，再指出问题（语法/搭配/表达习惯），最后给一个改进版本句。
- 翻译题以"准确 + 自然"为标准：意思对但生硬给 partial；仿写题看是否真正沿用了原句结构；纠错题看是否找到并改正全部错误。
- 语气鼓励但不放水；comment 用简体中文，英文例句保留英文。

## 输出

只输出 JSON，contract 见附后 schema。gradings 必须覆盖每一道主观题。

## 输入

<QUESTIONS>{{QUESTIONS}}</QUESTIONS>
<ANSWERS>{{ANSWERS}}</ANSWERS>
