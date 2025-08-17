/**
 * server.js
 *
 * Express MCP Server (Streamable HTTP, Stateful)
 *
 *  - 声明 MCP 能力（tools/resources/prompts）
 *  - 资源：config://app（静态）、users://{userId}/profile（动态）
 *  - 工具：calculate-bmi
 *  - 提示：review-code
 *  - 会话内持久化 McpServer 实例
 */

const { randomUUID } = require('node:crypto')
const { McpServer, ResourceTemplate } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js')
const express = require('express')
const { z } = require('zod')

const app = express()
app.use(express.json())

// 简单的内存会话表
const sessions = {}

function createMcpServer() {
  const server = new McpServer({
    name: 'example-server',
    version: '1.0.0',
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true },
      prompts: { listChanged: true },
    },
  })

  // 静态资源 config://app
  server.resource(
    'config',
    'config://app',
    async (uri) => {
      return {
        contents: [
          { uri: uri.href, text: 'App configuration here' },
        ],
      }
    },
  )

  // 动态资源 users://{userId}/profile
  server.resource(
    'user-profile',
    new ResourceTemplate('users://{userId}/profile', { list: undefined }),
    async (uri, { userId }) => {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Profile data for user ${userId}`,
          },
        ],
      }
    },
  )

  // 工具 calculate-bmi
  server.tool(
    'calculate-bmi',
    { weightKg: z.number(), heightM: z.number() },
    async ({ weightKg, heightM }) => {
      const bmi = weightKg / (heightM * heightM)
      return {
        content: [
          { type: 'text', text: String(bmi) },
        ],
      }
    },
  )

  // 提示 review-code
  server.prompt(
    'review-code',
    { code: z.string() },
    ({ code }) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please review this code:\n\n${code}`,
            },
          },
        ],
      }
    },
  )

  return server
}

// POST /mcp：初始化或复用会话
app.post('/mcp', async (req, res) => {
  const sessionIdHeader = req.headers['mcp-session-id']
  let sessionEntry = null

  // 情况1：复用已存在的会话
  if (sessionIdHeader && sessions[sessionIdHeader]) {
    sessionEntry = sessions[sessionIdHeader]

    // 情况2：无会话但这是初始化请求 → 建立新会话
  }
  else if (!sessionIdHeader && isInitializeRequest(req.body)) {
    const newSessionId = randomUUID()

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid) => {
        sessions[sid] = { server, transport }
      },
    })

    transport.onclose = () => {
      if (transport.sessionId && sessions[transport.sessionId]) {
        delete sessions[transport.sessionId]
      }
    }

    const server = createMcpServer()
    await server.connect(transport)

    sessions[newSessionId] = { server, transport }
    sessionEntry = sessions[newSessionId]
  }
  else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null,
    })
    return
  }

  // 将请求转交给本会话的 transport
  await sessionEntry.transport.handleRequest(req, res, req.body)
})

// GET/DELETE /mcp：SSE 下行与关闭会话
async function handleSessionRequest(req, res) {
  const sessionIdHeader = req.headers['mcp-session-id']
  if (!sessionIdHeader || !sessions[sessionIdHeader]) {
    res.status(400).send('Invalid or missing session ID')
    return
  }
  const { transport } = sessions[sessionIdHeader]
  await transport.handleRequest(req, res)
}

app.get('/mcp', handleSessionRequest)
app.delete('/mcp', handleSessionRequest)

// 启动
const PORT = 7171
app.listen(PORT, () => {
  console.warn(`MCP Server listening on port ${PORT}`)
})
