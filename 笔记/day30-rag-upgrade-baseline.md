# Day 30｜2026-04-13｜4h

## 今日主题

- 先把当前 RAG 主链路拆清楚
- 给后续一周升级留出清晰接口
- 建立一组最小评测样本

验收：

现有链路已经能被明确拆成 `parser / chunker / retriever / answer builder`
并且代码里已经留出 `bm25Service / rerankService / contextBuilderService` 的接入位置。

## 适用范围

- 当前项目技术栈：`Node.js + Express + Vue`
- 当前项目状态：已具备上传、解析、chunk、向量检索、引用、多轮问答主链路
- 当前目标：不是今天就把所有增强能力做完，而是先把“后面该加在哪里”拆清楚

## 今天做完后，你应该达到的结果

- 知道当前项目真实主链路长什么样
- 知道哪些逻辑还写在一起、后面会不好扩展
- 知道 BM25、rerank、context builder、问答控制层该挂在哪一层
- 有一组固定测试问题，后面每天都能拿来回归验证

## 先用一句话理解

今天要做的，不是增强效果，而是先把“当前链路的边界”拆出来，不然后面加功能只会越来越乱。

## 先梳理当前真实链路

你现在项目里的最短主链路，其实是：

1. 前端上传文件
2. 后端解析 PDF/TXT
3. 切分 chunk
4. 生成 embedding
5. 写入 Chroma
6. 用户提问
7. 向量检索取回 chunk
8. 拼 prompt
9. 流式输出答案和引用

一句话版：

“今天的目标，是把这条单路径链路拆成可继续升级的模块化链路。”

## 今天为什么一定先拆链路

因为你后面一周要补的能力都不是单点小修，而是会插到检索链路中间：

- BM25 要插在 retriever 阶段
- rerank 要插在 recall 之后、prompt 之前
- context builder 要接管最终上下文组装
- question router 要接管 prompt 策略
- structured output 要统一 answer response schema

如果今天不先把边界拆出来，后面每多加一个能力，就会多一个耦合点。

## 推荐学习和实战顺序

### 模块 1：先画清当前流程（1h）

今天第一步不是写新代码，而是把已有代码和流程画出来。

你至少要写清这几层：

- `documents/upload` 路由层
- `ingestionService` 入库层
- `retrievalService` 检索层
- `answerService` 回答构建层
- `qa route` SSE 输出层

最好给自己留一份这种结构图：

```text
frontend upload
  -> routes/documents.js
  -> uploadService
  -> ingestionService
  -> chroma

frontend ask
  -> routes/qa.js
  -> answerService
  -> retrievalService
  -> ollama / chroma
```

你今天最重要的不是画得漂亮，而是看清：

- 哪些逻辑已经是独立 service
- 哪些逻辑还混在一个文件里
- 哪些地方后面一定要抽象

### 模块 2：拆模块边界（1.5h）

今天最值得开始拆的是“后面一定会新增能力”的位置。

你最适合先把服务层想成下面这几个角色：

- `parserService`
- `chunkerService`
- `retrievalService`
- `bm25Service`
- `rerankService`
- `contextBuilderService`
- `questionRouterService`
- `answerBuilderService`

今天不一定全部实现，但至少要做到：

- 现在现有逻辑能映射到这些角色
- 明确“后面新增能力不直接写进 answerService 大杂烩里”

比如今天你就可以先确定：

- `ingestionService` 里后面再拆 `parseDocument` 和 `chunkDocument`
- `retrievalService` 后面不只做 vector retrieve，而是变成 recall 入口
- `answerService` 后面不直接兼管所有问答，而是更偏 answer builder / orchestrator

一句话版：

“今天先把职责想清楚，后面才不会把所有增强能力都塞进一个 service。”

### 模块 3：准备评测集（1h）

后面一周如果没有固定问题，你根本看不出优化是否真的有效。

今天至少准备 8 到 10 条问题，按类型分组：

- 事实问答：2 条
- 总结问答：2 条
- 对比问答：2 条
- 追问问答：2 到 4 条

推荐格式：

```md
## 测试集

### fact
1. 这份文档主要研究什么问题？
2. 文档有没有提到某个具体术语？

### summary
3. 请总结这份文档的核心结论。
4. 请概括文档中关于某主题的主要观点。

### compare
5. 文档中两个方案的区别是什么？
6. 文档有没有对不同阶段/对象做对比？

### followup
7. 你刚才提到的第二点展开说一下。
8. 这部分对应原文在哪一页？
```

今天不需要追求题目很多，但一定要固定下来，后面每天都复用这一组。

### 模块 4：先留配置项（30min）

你这一周很多能力都会涉及参数，不要把它们都写死在代码里。

今天至少先列出这些配置位：

- `topKRecall`
- `bm25TopK`
- `rerankTopN`
- `finalContextCount`
- `enableHybrid`
- `enableRerank`
- `enableParentRecall`
- `enableStructuredOutput`

就算今天先只是写在笔记或配置注释里，也比后面反复硬编码强。

## 今天最值得注意的常见坑

### 坑 1：还没拆边界，就急着加 BM25

这样很快就会把检索逻辑写得更乱。

### 坑 2：没有固定测试集

后面每次觉得“好像更准了”，都只是感觉，不是验证。

### 坑 3：把 answerService 当万能入口

短期快，长期一定变成大文件。

### 坑 4：今天只看代码，不看链路

你这一周补的是系统能力，不是单文件技巧。

## 今天的验收标准

- 当前主链路已经画清楚
- 现有逻辑能映射到 parser / chunker / retriever / answer builder
- 后续增强能力的挂载点已经明确
- 评测样本已经整理为固定问题集
- 配置项已经提前列出

## 建议留下的学习产出

今天结束前，至少留下这 5 个东西：

1. 一份当前链路结构图
2. 一份现有模块职责说明
3. 一组固定测试问题
4. 一版服务层拆分草图
5. 一份后续一周升级挂载点清单

## 最后给你的实操建议

今天最重要的不是“已经升级了多少”，而是先把“接下来每种升级该落在哪一层”看清楚。

如果你今天只记住一句话，就记住这个：

“Day 30 的核心，不是做增强，而是把增强能力未来的落点拆清楚。”
