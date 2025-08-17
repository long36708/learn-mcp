## 使用 cURL 测试

### 初始化会话：

发送一个 initialize 请求。如果你想让你工具看到它，请确保包含 Authorization 头：

```shell
curl -i -X POST http://localhost:7171/mcp \
 -H "Content-Type: application/json"\
 -H "Accept: application/json, text/event-stream"\
 -H "Authorization: Bearer my-secret-token"\
 -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
   "protocolVersion": "2024-11-05",
   "capabilities": { "interactive": true },
   "clientInfo": { "name": "example-client", "version": "1.0.0" }
  }
 }'
```

预期响应（示例）

```text
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
mcp-session-id: 1af945ea-e307-487a-903f-73651b02ff3e
Date: Sun, 17 Aug 2025 09:30:48 GMT
Transfer-Encoding: chunked

event: message
data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"resources":{"listChanged":true},"completions":{},"tools":{"listChanged":true},"prompts":{"listChanged":true}},"serverInfo":{"name":"example-server","version":"1.0.0","capabilities":{"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"listChanged":true}}}},"jsonrpc":"2.0","id":1}
```

注意头信息 mcp-session-id: 1af945ea-e307-487a-903f-73651b02ff3e。你必须精确复制这个值（区分大小写）用于后续调用。

在 "result.capabilities" 中，你看到服务器通告支持工具、资源和提示。

### 调用 calculate-bmi 工具：

使用上面获得的会话 ID：

```text
curl -X POST http://localhost:7171/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: ae1f46e4-164a-46bc-bc18-3797ca4be4cd" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "mcp/callTool",
    "params": {
      "name": "calculate-bmi",
      "arguments": { "weightKg": 70, "heightM": 1.75 }
    }
  }'
```

预期响应：

```text
event: message
data: {
"jsonrpc": "2.0",
"id": 2,
"result": {
    "content": [
      {
        "type": "text",
        "text": "22.857142857142858"
      }
    ]
  }
}
```

## 使用idea自带的 http client 测试

打开入口：工具栏(idea顶上的一行工具里面)->Tools->HTTP Client

```text
POST http://localhost:8888/mcp
Content-Type: application/json
Accept: application/json, text/event-stream
Authorization: Bearer my-secret-token

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "interactive": true },
    "clientInfo": { "name": "example-client", "version": "1.0.0" }
  }
}
```

## 常见问题故障排除

1. 调用工具时出现 "Method not found"

现象： 当你调用 mcp/callTool 时，得到：

```text
{ "jsonrpc":"2.0", "id":2, "error": { "code": -32601, "message": "Method not found" } }
```

可能原因和解决方法：

未声明能力 (Capabilities)： 如果你在 new McpServer(...)中省略了 capabilities，客户端将不知道任何工具存在。务必包含：

```text
const server = new McpServer({
  name: 'example-server',
  version: '1.0.0',
  capabilities: {
    tools:     { listChanged: true },
    resources: { listChanged: true },
    prompts:   { listChanged: true }
  }
});

```

在 server.connect(...) 之后注册工具： 如果你在注册工具之前调用 server.connect(transport)，初始化握手永远不会通告这些工具。确保顺序是：

```text
createMcpServer();    // 注册所有内容
await server.connect(transport);
```

每个请求都创建新的 McpServer 实例： 如果你在每次 POST 时重新创建 new McpServer(...)
（而不是每个会话重用同一个实例），后续调用将没有你的工具。使用会话映射来存储 { server, transport }。

### 缺少或不匹配的 mcp-session-id现象： 400 Bad Request: No valid session ID provided。

解决： 始终包含初始化响应头中返回的精确会话 ID：

```text
-H "mcp-session-id: 550e8400-e29b-41d4-a716-446655440000"
```

## 高级技巧：用于完全 HTTP 访问的低级处理程序

如果你绝对需要在工具内部访问原始的 HTTP 请求（用于 cookie、查询参数等），你可以绕过 server.tool(...)，并为
CallToolRequestSchema 注册一个低级处理程序：

```ts
const {Server} = require('@modelcontextprotocol/sdk/server/index.js');
const {StdioServerTransport} = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
	CallToolRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');

const server = new Server(
	{name: 'low-level-server', version: '1.0.0'},
	{capabilities: {tools: {}}}
);
server.setRequestHandler(CallToolRequestSchema, async (request) => {
// `request` 将包含：
//  • request.params.name, request.params.arguments
//  • request.transportContext （在某些传输实现中可能包含原始 HTTP）
// 你可以手动读取 `request.transportContext.headers`（如果传输层支持它）。
});
const transport = new StdioServerTransport();
await server.connect(transport);
```

然而，截至 2025 年中，MCP 的高级 SDK 不会将原始 HTTP 注入到高级的server.tool(...)回调中。如果你需要完全访问 HTTP，请使用这种低级模式。