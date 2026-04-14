# Day 22 项目目录骨架与开发路线

## 目录骨架

- `src/`
  - `app.js`
  - `server.js`
  - `routes/`
    - `documents.js`
    - `qa.js`
    - `health.js`
  - `services/`
    - `uploadService.js`
    - `ingestionService.js`
    - `retrievalService.js`
    - `answerService.js`
  - `repositories/`
    - `documentRepository.js`
  - `lib/`
    - `chroma.js`
    - `openai.js`

- `frontend/src/`
  - `pages/`
    - `UploadPage.vue`
    - `AskPage.vue`
    - `DocumentsPage.vue`
  - `components/`
    - `UploadDropzone.vue`
    - `MessageList.vue`
    - `CitationList.vue`
    - `DocumentTable.vue`

## 开发落点

### Day 23：写上传页 UI

- 设计上传页面的布局和用户体验
- 实现文件拖拽/选择区
- 支持上传校验提示（例如文件类型、大小）
- 显示上传结果和初步处理状态

### Day 24：接上传接口和入库状态

- 集成 `POST /api/documents/upload` 上传接口
- 实现 `GET /api/documents/:id/status` 入库状态查询
- 将上传后文档状态展示到上传页或文档列表页
- 确保前端可以看到文档是否已入库完成

### Day 25：做问答页和流式回答

- 实现问答页面基础结构
- 接入 `POST /api/qa/ask` 问答接口
- 支持流式回答显示，提升交互体验
- 显示用户提问和 AI 回答记录

### Day 26：做引用展示

- 在问答页增加引用展示区
- 关联回答内容和文档来源
- 展示来源文档标题、页码或片段
- 让用户可以回到文档列表确认来源

### Day 27：做多轮

- 支持会话上下文传递
- 让问答页能够保留历史问题和回答
- 处理多轮语境中的引用和来源关联
- 优化状态管理，避免上下文混乱

### Day 28：做 Beta 打磨

- 修正交互细节和视觉展示
- 优化错误提示与加载状态
- 增强整体稳定性与细节体验
- 收集问题并修复核心痛点

### Day 29：做路由决策

- 完成页面间路由结构
- 支持上传页、问答页、文档列表页切换
- 优化路由参数和状态传递
- 让用户可以从任何页面顺畅回到主流程
