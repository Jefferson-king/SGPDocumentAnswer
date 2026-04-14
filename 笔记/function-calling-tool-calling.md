# Function Calling / Tool Calling 学习计划

## 适用范围

- 当前项目技术栈：`Node.js + Express + openai@6.x`
- 当前调用方式：`client.chat.completions.create(...)`
- 当前目标：先跑通 1 个最小工具，不追求多工具、不追求流式

## 今天学完后，你应该达到的结果

- 说清楚 `tools`、`tool_calls`、`tool output`、`tool loop` 分别是什么
- 能定义一个最小工具 `getCurrentTime`
- 能让模型在 `tool_choice: "auto"` 下自己决定要不要调用工具
- 能在服务端执行工具，并把结果回传给模型
- 能完成一次验收：用户问“现在几点”，模型触发工具并返回最终答案

## 先用一句话理解

`tool calling` 不是“模型自己执行函数”，而是“模型先告诉你它想调用哪个工具、参数是什么，然后由你的后端真正执行工具，再把执行结果发回模型”。

## 官方机制要点

OpenAI 官方文档把 `tool calling` 描述成一个 5 步闭环：

1. 你把可用工具通过 `tools` 传给模型
2. 模型返回一个或多个 `tool_calls`
3. 你的应用执行对应工具
4. 你把工具结果作为 `tool` 消息回传模型
5. 模型基于工具结果生成最终回复，或者继续请求更多工具

你先记住两件事：

- 工具是你定义的，执行权在你的后端，不在模型手里
- 模型返回工具调用时，`assistant` 消息的 `content` 可能是 `null`，这很正常

## 推荐学习顺序

### 模块 1：先懂概念，别急着写代码（30 分钟）

- 读一遍官方 guide，重点看 5 步流程
- 记住 `tool_choice` 的 3 个常用值
- 自己画一张最小流程图

你至少要能口述下面这段话：

“我先把工具列表给模型，模型如果觉得需要，会返回 `tool_calls`；后端执行工具后，再把结果发回模型，模型才给最终自然语言答案。”

### 模块 2：设计一个最小工具（30 到 45 分钟）

先只做 1 个工具：`getCurrentTime`

推荐职责：

- 当用户问“现在几点”“当前时间”“上海现在时间”时使用
- 输入参数尽量少，先只保留 `timezone`
- 输出固定为结构化 JSON，方便模型读取

推荐工具定义：

tools = {
  {
    "type": "function",
    "name": "getCurrentTIME",
    "description":"当用户询问时间时、现在几点或某时使用"，
    "parameters":{
      "type":"object",
      "properties":{
        "timezone":{
          "type":"string",
          "description":"IANA 时区名，例如 Asia/Shanghai、America/New_York"
        }
      },
      additionalProperties: false,
      required: ["timezone"]，
    },
    "strict":true
  }
}
```js
const tools = [
  {
    type: "function",
    function: {
      name: "getCurrentTime",
      description: "当用户询问当前时间、现在几点或某使用",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "IANA 时区名，例如 Asia/Shanghai、America/New_York"
          }
        },
        additionalProperties: false
      }
    }
  }
];
```

这一阶段的重点不是“写很多参数”，而是学会：

- 名字要直观
- 描述要清楚“什么时候用”
- 参数要少而准

### 模块 3：跑通最小闭环（60 到 90 分钟）

你现在项目里最适合下手的位置是：

- `src/services/openaiChat.js`
- `src/routes/chat.js`

建议按这个顺序推进：

1. 在 `src/services/openaiChat.js` 中，让 OpenAI 请求支持 `tools` 和 `tool_choice`
2. 在 `src/routes/chat.js` 中检测 `completion.choices[0].message.tool_calls`
3. 如果模型请求了 `getCurrentTime`，就在服务端本地执行该函数
4. 把工具结果作为 `role: "tool"` 的消息追加回 `messages`
5. 再发起第二次模型请求，拿最终自然语言答案

最小伪代码如下：

```js
const first = await client.chat.completions.create({
  model,
  messages,
  tools,
  tool_choice: "auto"
});

const message = first.choices[0].message;

if (message.tool_calls?.length) {
  messages.push(message);

  for (const call of message.tool_calls) {
    const args = JSON.parse(call.function.arguments || "{}");
    const result = await runTool(call.function.name, args);

    messages.push({
      role: "tool",个时区的当前时间时
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  }

  const second = await client.chat.completions.create({
    model,
    messages,
    tools
  });

  return second.choices[0].message.content;
}

return message.content;
```

### 模块 4：做验收，不要只看“能跑”（30 分钟）

至少做 4 组测试：

1. `现在几点了？`
2. `帮我看一下上海现在时间`
3. `纽约现在是几点？`
4. `请介绍一下 Node.js`

你要观察的不是只有“有结果”，而是：

- 前 3 个问题是否真的触发了 `getCurrentTime`
- 第 4 个问题是否没有乱调工具
- 最终回复是否基于工具结果，而不是模型瞎猜

## 结合你当前项目的落地建议

### 第一步：先补 1 个本地工具文件

推荐新增：

- `src/tools/getCurrentTime.js`

建议输出格式：

```js
{
  timezone: "Asia/Shanghai",
  currentTime: "2026-03-28 11:30:15",
  source: "server"
}
```

这样做的好处是：

- 你能一眼看出结果是不是工具真实返回的
- 后面加日志也更方便

### 第二步：让服务层支持工具参数

你当前的 `src/services/openaiChat.js` 只收：

- `messages`
- `model`
- `temperature`

下一步可以扩成支持：

- `tools`
- `toolChoice`

### 第三步：把 tool loop 放到路由层

对于你当前项目来说，先把“识别工具调用 -> 执行工具 -> 再请求模型”写在 `src/routes/chat.js` 最容易理解。

原因很简单：

- 路由层已经拿到了请求参数
- 这里做日志和错误处理更直观
- 等你 Day 11 再重构到 service 层也不晚

## 你今天最该记住的 3 个 API 点

### 1. `tools`

用来告诉模型“你可以使用哪些工具”。

### 2. `tool_choice`

常用值：

- `none`：不允许调用工具
- `auto`：模型自己决定是否调用工具
- `required`：必须调用至少一个工具

你今天练习时，推荐先用 `auto`，因为这最符合“让模型自己决定什么时候调用工具”的目标。

### 3. `tool_calls`

当模型想调用工具时，会在返回消息里给你 `tool_calls`。这说明它在“发请求”，不是已经执行完了。

## 常见坑

### 坑 1：以为模型会自动执行函数

不会。模型只会返回结构化调用请求，真正执行工具的一定是你的代码。

### 坑 2：工具描述写得太模糊

如果 `description` 没写清楚“什么时候用”，模型就更容易误调用或漏调用。

### 坑 3：忘了处理 `assistant.content === null`

当模型返回的是工具调用而不是自然语言回复时，这个字段可能为空。

### 坑 4：直接信任工具参数

`call.function.arguments` 通常需要 `JSON.parse(...)`。解析前后都要做兜底处理，避免服务挂掉。

### 坑 5：只测“会不会调用”，不测“该不该调用”

真正重要的是：

- 相关问题会调工具
- 不相关问题不乱调工具

## 今天的验收标准

- 能解释完整 tool loop
- 能展示 `getCurrentTime` 的工具定义
- 能展示一次真实的 `tool_calls`
- 能展示服务端执行工具后的结果
- 能展示最终回答里已经用上工具结果

如果你想把验收再做得更像项目实践，可以补 1 个日志：

```txt
[tool] name=getCurrentTime args={"timezone":"Asia/Shanghai"} result={"currentTime":"2026-03-28 11:30:15"}
```

## 建议的学习产出

今天结束前，至少留下这 4 个东西：

1. 一张你自己画的 tool loop 流程图
2. 一个 `getCurrentTime` 工具定义
3. 一段最小闭环代码
4. 一份测试记录，写明“什么问题触发了工具，什么问题没有触发”

## 推荐查阅的官方文档

- Function Calling Guide: https://platform.openai.com/docs/guides/function-calling
- Chat Completions API Reference: https://platform.openai.com/docs/api-reference/chat/create

补充说明：

- 你当前项目已经在用 `Chat Completions`，所以先按这套学最顺手
- 等你把 Day 10 和 Day 11 跑通后，再考虑补学 `Responses API` 版本

## 最后给你的实操建议

今天不要一口气做“多工具 + 流式 + 前端联调”。最稳的顺序是：

1. 只做 1 个工具
2. 只做后端闭环
3. 只验收 4 个问题
4. 跑通后再扩成 Day 11 的“完整 tool loop + 第二个工具”
