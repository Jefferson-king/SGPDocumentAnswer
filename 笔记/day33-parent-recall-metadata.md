# Day 33｜2026-04-16｜4h

## 今日主题

- 保留 chunk 召回，同时加入父块/页级召回
- 补齐 richer metadata
- 让引用和上下文不再过碎

验收：

每个 chunk 已经能关联父块或页级内容，命中 chunk 后可以向上扩展上下文。

## 适用范围

- 当前项目技术栈：`Node.js + Express + Vue`
- 当前状态：已有 chunk 级解析、chunk 级检索、页码引用
- 当前目标：让上下文从“碎片检索”升级为“chunk 命中 + 上下文扩展”

## 今天做完后，你应该达到的结果

- chunk metadata 更完整
- 引用展示更有结构
- 最终上下文不再只是一堆零碎短片段

## 先用一句话理解

今天要做的，是保留细粒度 chunk 命中能力，但不要让最终上下文只停留在碎片层。

## 为什么今天要补父块/页级召回

chunk 检索的好处是精确，但问题也很明显：

- 内容容易太碎
- 单 chunk 信息量不足
- 引用可定位，但解释不完整
- 模型经常拿到半句话、半段话

如果你今天补上：

- 父块召回
- 页级召回
- 相邻 chunk 扩展

那么最终上下文会明显更完整。

一句话版：

“今天的目标，不是放弃 chunk，而是让 chunk 命中后能找回它所在的更大上下文。”

## 推荐学习和实战顺序

### 模块 1：先设计新版 metadata（1h）

今天最先要明确的是，后面要服务哪些能力：

- rerank
- parent recall
- page recall
- 引用展示
- structured output

所以 chunk metadata 至少建议补齐：

- `documentId`
- `documentName`
- `source`
- `page`
- `section`
- `blockType`
- `chunkId`
- `parentId`
- `pageId`
- `chunkIndex`
- `pageChunkIndex`
- `startOffset`
- `endOffset`

今天不一定所有字段都能完美填满，但 schema 先定下来很重要。

### 模块 2：实现父块/页级索引（1.5h）

当 metadata 定完以后，下一步是让入库阶段同时保存：

- chunk 级对象
- parent block 级对象
- page 级对象

你今天可以先选一个稳妥版本：

- `chunk` 是最小检索单元
- `parent block` 是比 chunk 更大的段级单元
- `page block` 是整页文本或整页结构块

也就是说，今天不只是存“我命中了哪个 chunk”，还要能回答：

- 这个 chunk 属于哪个父块？
- 这个父块属于哪一页？

### 模块 3：实现召回扩展逻辑（1.5h）

命中 chunk 以后，今天最适合按下面顺序扩展上下文：

1. 先看相邻 chunk
2. 再看 parent block
3. 最后看 page block

为什么建议这个顺序：

- 相邻 chunk 扩展最轻量
- parent block 最适合补全段内语义
- page block 更适合总结和全局说明

今天这一步最重要的是先把策略写清楚，而不是一次做满所有层级。

## 今天最值得注意的常见坑

### 坑 1：metadata 只补字段，不考虑后续用途

这样很快就会出现“有字段但没人用”。

### 坑 2：命中 chunk 后直接整页都塞进 prompt

上下文会瞬间膨胀。

### 坑 3：父块和页级对象没有稳定 ID

后面映射关系会很难维护。

### 坑 4：今天只改后端，不想前端引用展示

其实 richer metadata 会直接影响引用可解释性。

## 今天的验收标准

- 新版 metadata 结构已经定下来
- chunk 已经能关联 parent/page
- 命中 chunk 后已经能向上扩展上下文
- 引用数据已经更适合前端展示

## 建议的测试方式

- 选一个单 chunk 不够完整的问题
- 看扩展前后 final context 是否更完整
- 看引用里是否能返回更清晰的页码/章节信息
- 看相邻 chunk 或父块是否真的补全了语义

## 建议留下的学习产出

今天结束前，至少留下这 5 个东西：

1. 一版 metadata schema
2. 一版 chunk -> parent -> page 映射说明
3. 一版召回扩展策略文档
4. 一组扩展前后上下文对比样例
5. 一份今天的引用展示升级记录

## 最后给你的实操建议

今天最重要的，不是让上下文越来越大，而是让命中 chunk 之后能有秩序地找回更完整的语义单元。

如果你今天只记住一句话，就记住这个：

“Day 33 的核心，不是多塞上下文，而是把碎片命中升级成结构化扩展。”
