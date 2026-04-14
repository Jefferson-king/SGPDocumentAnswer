# AI Document Answer - 知识库问答系统

基于 RAG（Retrieval-Augmented Generation）的知识库问答系统。

## 项目介绍

- 上传 PDF/TXT 文档到知识库
- 系统自动解析、切分并向量化文档
- 支持基于知识库的智能问答
- 返回答案的同时显示结合来源文档引用

## 技术栈

### 后端
- Node.js + Express
- OpenAI API（LLM）
- Chroma（向量数据库）
- Multer（文件上传）

### 前端
- Vue 3
- Vite（开发构建工具）

## 快速开始

### 前置要求
- Node.js >= 14
- npm 或 yarn
- OpenAI API Key

### 安装步骤

1. 克隆项目并安装依赖：
```bash
npm install
cd frontend && npm install && cd ..
```

2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，填入 OpenAI API Key 等信息
```

3. 启动后端开发服务器
```bash
npm run dev
```

4. 启动前端开发服务器（新终端）
```bash
cd frontend
npm run dev
```

5. 访问 http://localhost:5173

## 项目结构

```
src/
  app.js              # Express 应用配置
  server.js           # 启动入口
  routes/
    documents.js      # 文档相关路由
    qa.js             # 问答相关路由
    health.js         # 健康检查路由
  services/
    uploadService.js  # 上传文件处理
    ingestionService.js  # 文档入库处理
    retrievalService.js  # 向量检索服务
    answerService.js  # 问答生成服务
  repositories/
    documentRepository.js  # 文档数据存储
  lib/
    chroma.js         # Chroma 向量库初始化
    openai.js         # OpenAI API 封装

frontend/src/
  pages/
    UploadPage.vue    # 文档上传页
    AskPage.vue       # 问答页
    DocumentsPage.vue # 文档列表页
  components/
    UploadDropzone.vue  # 拖拽上传组件
    MessageList.vue     # 消息列表组件
    CitationList.vue    # 引用展示组件
    DocumentTable.vue   # 文档表格组件
```

## 开发计划

- Day 23：完成上传页 UI（拖拽、校验、状态）
- Day 24：上传接口和入库状态
- Day 25：问答页和流式回答
- Day 26：引用展示
- Day 27：多轮对话
- Day 28：Beta 打磨
- Day 29：路由决策优化

## 主要接口

### 文档相关
- `POST /api/documents/upload` - 上传文档
- `GET /api/documents/:id/status` - 查询文档处理状态
- `GET /api/documents` - 获取文档列表

### 问答相关
- `POST /api/qa/ask` - 提问并获得答案（支持流式）

### 其他
- `GET /health` - 健康检查

## 许可证

ISC
