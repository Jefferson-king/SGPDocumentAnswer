# 流式返回 / SSE / fetch + ReadableStream 学习计划

## 适用范围

- 当前项目技术栈：`Node.js + Express`
- 当前目标：先理解聊天接口为什么要流式返回，再跑通一个最小 `/api/chat/stream`
- 当前验收方式：浏览器或终端能看到内容一段一段返回，而不是最后一次性整包返回

## 今天学完后，你应该达到的结果

- 说清楚什么是流式返回，什么是 SSE，什么是 `fetch + ReadableStream`
- 能解释“普通 JSON 返回”和“流式返回”的区别
- 能在 `Node.js + Express` 里写一个最小流式接口
- 能先用假数据模拟分片输出，再接本地 Ollama 做真实流式输出
- 能在浏览器或终端里亲眼看到分片输出

## 先用一句话理解

流式返回不是“服务端等全部内容生成完再发给前端”，而是“服务端生成一点就先发一点，前端边收边显示”。

## 为什么聊天产品要流式返回

聊天产品几乎都会优先做流式返回，核心原因有 3 个：

- 用户不想等到整段答案全部生成完才看到第一个字
- 模型生成本来就是逐步吐 token，流式更符合底层生成方式
- 前端可以边显示边交互，体验更像“正在思考和回复”

你可以把它理解成两种体验差异：

- 普通 JSON：像“老师写完整张答卷后一次性交给你”
- 流式返回：像“老师一边写一边把内容念给你听”

## 官方概念先分清

### 1. 普通 HTTP JSON 返回

最常见的方式是：

1. 前端发请求
2. 服务端等结果全部准备好
3. 一次性返回一个完整 JSON
4. 前端再整体渲染

特点：

- 实现简单
- 调试方便
- 适合短响应
- 不适合长文本实时展示

### 2. SSE

`SSE` 全称是 `Server-Sent Events`，意思是“服务端持续向客户端推送文本事件流”。

它的特点是：

- 基于 HTTP
- 连接建立后，服务端可以持续不断地 `write`
- 数据格式是文本协议，常见写法是 `data: ...\n\n`
- 特别适合“服务端单向推送给前端”

你今天先记住一个最关键的格式：

```txt
data: 第一段

data: 第二段

data: [DONE]

```

每个事件之间通常用两个换行分隔。

### 3. `fetch + ReadableStream`

前端不一定非要用 `EventSource` 才能接流。

现在很多聊天产品更常见的是：

- 前端继续使用 `fetch`
- 从 `response.body` 拿到一个 `ReadableStream`
- 用 `reader.read()` 一段一段读
- 每读到一段就立刻拼接到页面上

这套方式的优势是：

- 仍然可以用 `POST`
- 请求体可以带 `messages`、`model`、`temperature`
- 更适合聊天场景

## 先建立最小心智模型

今天你先把整个过程理解成下面这条链路：

1. 浏览器用 `fetch` 发起 `/api/chat/stream`
2. Express 不用 `res.json(...)`，而是设置 SSE 响应头
3. 服务端调用 `res.write(...)` 连续写出多段内容
4. 浏览器通过 `ReadableStream` 持续读取字节流
5. 前端把分片内容不断追加到页面

一句话版：

“前端边读，后端边写，中间连接不断开，直到全部发送完成。”

## 推荐学习顺序

### 模块 1：先懂概念，不急着接模型（1h）

- 理解为什么聊天产品更适合流式返回
- 搞清楚 `普通 JSON`、`SSE`、`ReadableStream` 三者关系
- 先口述一遍从“后端 write”到“前端 read”的流程

你至少要能自己说出这段话：

“普通 JSON 是后端准备完全部内容再一次性返回；流式返回是后端生成一段发一段。SSE 是服务端持续推送文本事件的一种方式，前端可以用 `fetch + ReadableStream` 一边接收一边显示。”

### 模块 2：先做最小假数据流（1.5h）

先不要急着接大模型。

你今天第一阶段应该只做一件事：

- 写一个 `/api/chat/stream`
- 不接真实模型
- 只用假数据模拟 5 到 10 段分片输出

推荐目标：

- 每隔 `300ms` 到 `800ms` 输出一段
- 最后一段输出 `[DONE]`
- 终端里能看到内容逐步出现

最小服务端思路：

```js
router.post('/api/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const chunks = ['你好，', '我正在', '用假数据', '模拟流式', '输出。'];

  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    await delay(500);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});
```

这一阶段你最该学会的是：

- `res.json(...)` 和 `res.write(...)` 的差别
- SSE 必须先设置响应头
- 连接不能太早 `end`

### 模块 3：浏览器用 `fetch + ReadableStream` 接流（30 到 45 分钟）

这一阶段要做的是：

- 用 `fetch` 发 `POST`
- 从 `response.body.getReader()` 获取 reader
- 用 `TextDecoder` 把二进制转成字符串
- 一边读一边显示

最小前端伪代码：

```js
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: '你好'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder('utf-8');

let done = false;

while (!done) {
  const result = await reader.read();
  done = result.done;

  if (done) break;

  const text = decoder.decode(result.value, { stream: true });
  console.log(text);
}
```

你先不用追求一次就把 SSE 文本协议拆得很漂亮，第一步只要能看到“控制台不断打印新片段”就算过关。

### 模块 4：接本地 Ollama 做真实流式（1.5h）

等假数据跑通以后，再接本地 Ollama。

今天的目标不是做复杂封装，而是验证一件事：

- 上游模型一边生成
- 你的 Express 一边转发
- 前端或终端能边收边看

你可以把这一步理解成“把假数据分片，换成真实模型分片”。

如果你使用 Ollama 原生接口，常见思路是：

1. Express 收到前端请求
2. 服务端向 Ollama 发起流式请求
3. 逐段读取 Ollama 返回的数据
4. 再用 `res.write(...)` 转发给浏览器
5. 结束时补一个 `[DONE]`

这一阶段的重点不是“大而全”，而是：

- 先打通一个模型，例如 `qwen:0.5b`
- 先保证输出能连续出现
- 先不要叠加 tool calling、数据库、前端动画

### 模块 5：写今天的笔记（1h）

今天的笔记至少要回答 4 个问题：

1. 什么是 SSE
2. 为什么 `fetch + ReadableStream` 很适合聊天
3. 普通 JSON 返回和流式返回差在哪
4. 自己今天跑通时遇到了什么坑

## 普通 JSON 返回 vs 流式返回

### 普通 JSON 返回

特点：

- 服务端处理完全部内容后再返回
- 前端拿到的是完整结果
- 更容易做接口调试和错误处理

适合：

- 短文本
- 管理后台
- 非实时内容

问题：

- 首字等待时间长
- 用户容易觉得“卡住了”
- 长回答体验差

### 流式返回

特点：

- 服务端生成一点就返回一点
- 前端边接收边渲染
- 首字更快出现

适合：

- AI 聊天
- 长文本生成
- 实时日志
- 实时通知流

问题：

- 实现比 JSON 更复杂
- 前后端都要处理分片
- 需要自己考虑结束标记、异常中断、取消请求

## 结合你当前项目的落地建议

### 第一步：先新增一个最小流式路由

推荐位置：

- `src/routes/chat.js`

可以先加一个新接口：

- `POST /api/chat/stream`

第一版只做假数据分片，不接 OpenAI，不接 Ollama。

### 第二步：先让终端验收

你可以先不用前端页面，直接在终端用下面这种方式验收：

```bash
curl -N -X POST http://localhost:3000/api/chat/stream ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"你好\"}"
```

如果是 PowerShell，也可以用：

```powershell
curl.exe -N -X POST http://localhost:3000/api/chat/stream `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"你好\"}"
```

只要你看到内容不是最后一次性出现，而是逐段出现，说明流式链路已经通了。

### 第三步：再接浏览器

当前端接入时，优先用 `fetch + ReadableStream`，原因是：

- 你的聊天请求通常是 `POST`
- 请求体往往要带 `messages`
- 比 `EventSource` 更灵活

### 第四步：最后再接 Ollama

建议顺序：

1. 假数据分片
2. 终端验收
3. 浏览器接流
4. Ollama 真流式

不要一开始就同时做：

- SSE
- 前端页面
- Ollama
- tool calling

这样很容易一旦出错就不知道问题在哪一层。

## 你今天最该记住的 4 个 API 点

### 1. `res.setHeader(...)`

流式返回前要先设置正确响应头，尤其是：

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

### 2. `res.write(...)`

这是流式返回的核心。

只要连接还开着，你就可以不断往客户端写新片段。

### 3. `response.body.getReader()`

前端通过它拿到流读取器，然后反复 `read()`。

### 4. `TextDecoder`

后端发来的是字节流，前端通常要用 `TextDecoder` 解码成字符串。

## 常见坑

### 坑 1：后端还在用 `res.json(...)`

如果你最后还是 `res.json(...)`，那它就是普通返回，不是流式返回。

### 坑 2：忘了设置 SSE 响应头

没设置好响应头，浏览器和中间层可能不会按事件流处理。

### 坑 3：一次性把所有内容 `write` 出去

如果你没有人为分片，或者上游没有真正流式，用户看到的仍然可能像整包返回。

### 坑 4：前端只 `await response.text()`

这样会等整个响应完成后才拿到内容，等于把流式又用回一次性读取了。

### 坑 5：没有定义结束标记

前端需要知道什么时候读完了，常见做法是最后返回：

```txt
data: [DONE]

```

### 坑 6：把 `EventSource` 和 `fetch` 场景混在一起

`EventSource` 更适合简单 GET 推送。

聊天接口通常更适合：

- `POST`
- 请求体带消息数组
- `fetch + ReadableStream`

## 今天的验收标准

- 能解释为什么聊天产品更适合流式返回
- 能说清楚 SSE 和 `fetch + ReadableStream` 的关系
- 能在 Express 里写出最小 `/api/chat/stream`
- 能先用假数据稳定输出 5 段以上分片
- 能接本地 Ollama，并看到模型输出逐段返回
- 能在终端或浏览器中亲眼看到分片输出

## 建议的学习产出

今天结束前，至少留下这 5 个东西：

1. 一张“前端 read / 后端 write”流程图
2. 一个最小 `/api/chat/stream` 路由
3. 一段前端 `fetch + ReadableStream` 示例
4. 一次 Ollama 流式接入记录
5. 一份“普通 JSON vs 流式返回”的对比笔记

## 推荐查阅的资料方向

- SSE 基础格式：理解 `data: ...\n\n`
- Fetch Streams：理解 `response.body`
- `ReadableStreamDefaultReader`：理解 `reader.read()`
- Ollama 流式接口：重点看返回分片长什么样

## 最后给你的实操建议

今天最稳的顺序是：

1. 先理解为什么要流式
2. 再写假数据分片接口
3. 再用终端验证分片输出
4. 再接浏览器读取流
5. 最后再接本地 Ollama

如果你今天只有 1 个目标，那就定成这个：

“我必须亲眼看到服务端输出的内容，不是最后一次性出现，而是一段一段出现。”
