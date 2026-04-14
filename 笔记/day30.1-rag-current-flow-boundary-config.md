# Day 30.1｜2026-04-14｜补充

## 今日补充目标

- 把 Day 30 里的“先画清当前流程”落到当前代码实现
- 明确上传链路和问答链路现在各自经过哪些层
- 先把本周会反复改动的配置位收拢出来
- 先固定一组回归测试题，后面每天都复用

这份文档不是讲“理想架构”，而是先讲“当前项目真实怎么跑”。

## 当前真实主链路总览

### 上传链路

```text
frontend upload
  -> frontend/src/api/documents.js
  -> routes/documents.js
  -> uploadService.uploadDocument
  -> documentRepository.createDocument(status=processing)
  -> uploadService.processDocument(async)
  -> ingestionService.ingestDocument
  -> parseDocument
  -> chunkDocument
  -> ollama.generateEmbedding
  -> chroma.addDocument
  -> documentRepository.updateDocumentStatus(ready/failed)
```

### 问答链路

```text
frontend ask
  -> frontend/src/api/qa.js
  -> routes/qa.js
  -> answerService.getAnswerStreamPayload
  -> questionRouterService.routeQuestion
  -> direct | retrieval | summarize

retrieval path
  -> buildRetrievalQuery
  -> retrievalService.retrieve
  -> ollama.generateEmbedding(question)
  -> chroma.query(topK, where)
  -> answerService.buildRetrievalPrompt
  -> ollama.generateCompletionStream
  -> routes/qa.js SSE(start/citations/delta/done)

summary path
  -> chroma.getDocumentsByDocumentId
  -> answerService.buildSummaryContext
  -> answerService.buildSummaryPrompt
  -> ollama.generateCompletionStream
  -> routes/qa.js SSE(start/citations/delta/done)
```

## 逐层拆清当前职责

### 1. `documents/upload` 路由层

当前文件：`src/routes/documents.js`

它现在负责：

- 接收 `/api/documents/upload`
- 用 `multer` 把文件写入 `uploads/`
- 做文件名乱码修正
- 调 `uploadService.uploadDocument`
- 提供状态查询 `/api/documents/:id/status`
- 提供文档列表 `/api/documents`

这一层现在基本还算薄，但有两个点后面会继续抽：

- 上传大小、允许类型、上传目录这些配置现在散在前后端和路由里
- 文件名格式化逻辑已经在多个地方重复出现，后面适合变成公共 util

### 2. `ingestionService` 入库层

当前文件：`src/services/ingestionService.js`

它现在实际是一个“大入库服务”，里面同时做了：

- `parseDocument(filePath)`：解析 `txt/pdf`
- `cleanText(text)`：文本清洗
- `chunkDocument(pages, documentId, fileName)`：按固定字符长度切块
- `ingestChunks(chunks)`：逐块生成 embedding 并写入 Chroma

这层已经是当前链路里最明显的“后面一定要拆”的位置，因为它同时承担了：

- parser
- cleaner
- chunker
- embedder 调用
- vector store writer

也就是说，Day 30 里提到的 `parserService / chunkerService`，当前其实都还塞在 `ingestionService` 里面。

### 3. `retrievalService` 检索层

当前文件：`src/services/retrievalService.js`

它现在只做一件事：

- 用问题生成 embedding
- 调 `chroma.query`
- 返回统一格式的结果 `id / content / metadata / score`

这一层当前还是“纯向量召回”，还没有：

- BM25
- hybrid merge
- rerank
- parent recall
- final context builder

所以后面这一层更准确的名字会更像 `recallService` 或“检索入口层”，而不只是单一路径 vector retrieve。

### 4. `answerService` 回答构建层

当前文件：`src/services/answerService.js`

它现在实际上是一个“问答编排 + prompt 构建 + 引用整理”的混合层，里面同时做了：

- 调 `questionRouterService.routeQuestion`
- direct / retrieval / summarize 三种分支编排
- 构建 direct prompt
- 构建 retrieval prompt
- 构建 summary prompt
- 构建 summary context
- 格式化 citations
- 兜底文本流 `singleTextStream`

这说明当前的 `answerService` 已经不只是 answer builder，而是半个 orchestrator。

这层后面最值得拆出的两个角色是：

- `contextBuilderService`
- `answerBuilderService`

否则 BM25、rerank、parent recall、structured output 最后都会继续往这个文件里堆。

### 5. `qa route` SSE 输出层

当前文件：`src/routes/qa.js`

它现在负责：

- 接收 `/api/qa/ask`
- 校验问题是否为空
- 调 `answerService.getAnswerStreamPayload`
- 设置 SSE 响应头
- 依次输出 `start / citations / delta / done`

这一层现在是对的，应该尽量保持薄。  
后面不建议把 rerank、structured output 解析、引用后处理继续塞回路由层。

## 当前边界判断：哪些层还混在一起

### 已经比较清楚的边界

- 路由层和 service 层已经分开
- 上传处理和问答处理已经分成两条主链路
- 检索层至少已经抽成独立 `retrievalService`
- 问题路由至少已经抽成独立 `questionRouterService`

### 还明显混在一起的边界

- `ingestionService` 同时做解析、清洗、切块、embedding、入库
- `answerService` 同时做路由编排、prompt 构建、总结上下文构建、引用格式化
- 当前“召回结果”和“最终上下文”还是一个概念，还没拆成三段式
- 总结链路直接从 Chroma 拉整篇 chunk，再在 `answerService` 里截断，这说明 `context builder` 还不存在

## 后续更稳的模块边界草图

```text
upload flow
  -> documents route
  -> uploadService
  -> ingestionService
     -> parserService
     -> chunkerService
     -> embeddingService
     -> vectorStoreService

ask flow
  -> qa route
  -> answerService(orchestrator)
     -> questionRouterService
     -> retrievalService(recall entry)
        -> vectorRecall
        -> bm25Recall
        -> hybrid merge
        -> rerankService
        -> contextBuilderService
     -> answerBuilderService
     -> structuredOutputParser
```

这一版最关键的原则只有一句话：

不要把本周新增能力继续直接写进 `answerService` 和 `ingestionService`。

## 当前已经写死的点

目前代码里已经能看到几类硬编码：

- `retrievalService.retrieve(..., 3, ...)`：召回条数写死为 `3`
- `MAX_SUMMARY_CONTEXT_CHARS = 12000`：总结上下文长度写死
- `chunkSize = 200`、`overlap = 30`：切块策略写死
- embedding 模型名写死在 `ollama.generateEmbedding`
- Chroma collection 名写死为 `documents`

Day 30.1 的目标不是今天全改掉，而是先明确“后面统一从哪里读配置”。

## 本周先预留的配置位

建议先新增一个集中配置入口，例如：

- `src/config/rag.js`
- 或 `src/config/rag.config.js`

建议不要把这些配置继续散在路由层里，而是让 service 在入口处读取。

### 配置位清单

| 配置名 | 当前状态 | 应挂载的层 | 作用 |
| --- | --- | --- | --- |
| `topKRecall` | 已存在隐式硬编码，当前值等价于 `3` | `retrievalService` | 控制初始召回候选数 |
| `bm25TopK` | 还未实现 | `retrievalService` | 控制 BM25 召回候选数 |
| `rerankTopN` | 还未实现 | `rerankService` | 控制进入重排或重排后保留的候选数 |
| `finalContextCount` | 还未实现 | `contextBuilderService` | 控制最终进入 prompt 的上下文条数 |
| `enableHybrid` | 还未实现 | `retrievalService` | 是否开启向量 + BM25 双路召回 |
| `enableRerank` | 还未实现 | `answerService` 或 `retrieval pipeline` | 是否开启 rerank 阶段 |
| `enableParentRecall` | 还未实现 | `retrievalService` / `contextBuilderService` | 是否从 chunk 扩展到 parent/page 级上下文 |
| `enableStructuredOutput` | 还未实现 | `answerService` | 是否要求模型输出结构化 schema |

### 建议的配置组织方式

```js
module.exports = {
  retrieval: {
    topKRecall: 6,
    bm25TopK: 8,
    rerankTopN: 6,
    finalContextCount: 4,
    enableHybrid: false,
    enableRerank: false,
    enableParentRecall: false
  },
  answer: {
    enableStructuredOutput: false
  }
}
```

先统一入口，比默认值是否最优更重要。

## 固定测试集 V1

### 执行规则

- 测试前先清空会话，避免历史对话污染单轮结果
- 总结题必须先在前端选中文档
- 追问题必须接在指定上一题后面，保留同一会话
- 每次回归都记录：`route mode`、`citations 数量`、`是否命中目标文档`、`回答是否跑偏`
- 后面就算改成 hybrid、rerank、parent recall，也不要轻易改题面

### 测试集

| 编号 | 类型 | 建议文档范围 | 固定问题 | 预期模式 | 关注点 |
| --- | --- | --- | --- | --- | --- |
| 1 | fact | 单文档：`福建公司配电网一二次协同规划工作交流` | 这份文档主要研究什么问题？ | `retrieval` | 基础召回是否能命中主题描述 |
| 2 | fact | 单文档：`河南电网“十五五”调控专题规划研究` | 这份文档的核心研究对象是什么？ | `retrieval` | 标题语义能否稳定命中正文 |
| 3 | fact | 单文档：`安徽电网分布式光伏直采直控试点应用情境` | 文档里提到哪些试点应用场景？ | `retrieval` | 术语词召回是否稳定 |
| 4 | summary | 单文档：`福建公司配电网一二次协同规划工作交流` | 请总结这份文档的核心结论。 | `summarize` | 总结链路是否稳定，是否带总结型引用 |
| 5 | summary | 单文档：`河南电网“十五五”调控专题规划研究` | 请概括这份文档的关键任务。 | `summarize` | 大段上下文截断后是否仍能给出结构化总结 |
| 6 | compare | 全库 | `安徽电网分布式光伏直采直控试点应用情境` 和 `新形势下配电通信网发展规划研究` 的关注重点有什么不同？ | `retrieval` | 多文档检索是否会串文档 |
| 7 | compare | 全库 | `福建公司配电网一二次协同规划工作交流` 与 `河南电网“十五五”调控专题规划研究` 的研究对象有什么差异？ | `retrieval` | cross-doc 对比能力是否可用 |
| 8 | followup | 接题 4 后继续 | 你刚才提到的第二点展开说一下。 | `summarize` 或 `retrieval` | 多轮历史是否参与 build query |
| 9 | citation | 接题 5 后继续 | 你刚才的说法对应原文哪一页？ | `retrieval` | 页码引用是否稳定 |
| 10 | direct | 不限 | 如果不看知识库，你怎么理解配电网规划和调控规划的区别？ | `direct` | 路由器是否能把非文档问题送去 direct |

### 这组测试集为什么先这样定

- 题型覆盖了 `fact / summary / compare / followup / citation / direct`
- 既能测检索，也能测路由
- 既能测单文档，也能测全库
- 即使当前 compare 还不够强，也应该保留这两题，因为它们正好能检验本周增强是否真的有用

## 今天的最小验收

- 现在已经能说清上传链路和问答链路各自怎么跑
- 已经能指出 `ingestionService` 和 `answerService` 是当前两个主要“大文件边界”
- 已经把本周要反复使用的配置位提前列出来
- 已经有一组后续每天都能复用的固定测试题

## 最后给自己的提醒

Day 30.1 最重要的不是“今天就把架构重写完”，而是先把下面三件事固定住：

1. 当前真实链路长什么样
2. 后续增强能力该挂在哪一层
3. 后面每天用哪组题回归

只要这三件事固定住，Day 31 到 Day 36 的升级就不会越改越乱。
