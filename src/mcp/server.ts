import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import type { RPCSender } from './adapter'

export interface McpServerStatus {
  running: boolean
  port: number
  address: string | null
  error: string | null
}

export interface McpServerOptions {
  sendRPC: RPCSender
  loadRegisterTools: () => Promise<(mcpServer: McpServer, sendRPC: RPCSender) => void>
  onStatusChange?: (status: McpServerStatus) => void
}

export function generateMcpToken(): string {
  return randomBytes(24).toString('hex')
}

export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false
  const normalized = hostHeader.trim().toLowerCase()
  return normalized === `localhost:${port}` || normalized === `127.0.0.1:${port}`
}

export function isValidBearerToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!authHeader || !expectedToken) return false
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  if (!match) return false
  const provided = Buffer.from(match[1], 'utf8')
  const expected = Buffer.from(expectedToken, 'utf8')
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

function sendJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function toWebRequest(req: IncomingMessage, port: number): Promise<Request> {
  const url = `http://127.0.0.1:${port}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, String(value))
    }
  }
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers })
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
  return new Request(url, { method, headers, body })
}

async function writeWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  webRes.headers.forEach((value, key) => {
    const existing = headers[key]
    if (existing === undefined) {
      headers[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      headers[key] = [existing, value]
    }
  })
  res.writeHead(webRes.status, headers)
  if (!webRes.body) {
    res.end()
    return
  }
  const reader = webRes.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  } finally {
    res.end()
  }
}

export class McpServerController {
  private server: Server | null = null
  private token = ''
  private status: McpServerStatus = {
    running: false,
    port: 3978,
    address: null,
    error: null,
  }
  private sessions = new Map<
    string,
    { server: McpServer; transport: WebStandardStreamableHTTPServerTransport }
  >()

  private readonly options: McpServerOptions

  constructor(options: McpServerOptions) {
    this.options = options
  }

  getStatus(): McpServerStatus {
    return { ...this.status }
  }

  setToken(token: string): void {
    this.token = token
  }

  private setStatus(next: McpServerStatus): void {
    this.status = next
    this.options.onStatusChange?.(this.getStatus())
  }

  private async createSession(): Promise<{
    server: McpServer
    transport: WebStandardStreamableHTTPServerTransport
  }> {
    const mcpServer = new McpServer({
      name: 'openpencil-obsidian',
      version: '0.2.0',
    })
    const register = await this.options.loadRegisterTools()
    register(mcpServer, this.options.sendRPC)

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.sessions.set(sessionId, { server: mcpServer, transport })
      },
      onsessionclosed: (sessionId) => {
        this.sessions.delete(sessionId)
      },
    })
    void mcpServer.connect(transport)
    return { server: mcpServer, transport }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse, port: number): Promise<void> {
    if (!isAllowedHost(req.headers.host, port)) {
      sendJson(res, 403, { error: 'Invalid Host header' })
      return
    }
    if (req.headers.origin !== undefined) {
      sendJson(res, 403, { error: 'Browser Origin header is not allowed' })
      return
    }

    const pathname = (req.url ?? '/').split('?')[0]
    if (pathname !== '/mcp') {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    if (!isValidBearerToken(req.headers.authorization, this.token)) {
      sendJson(res, 401, { error: 'Unauthorized' })
      return
    }

    const sessionIdHeader = req.headers['mcp-session-id']
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader
    let session = sessionId ? this.sessions.get(sessionId) : undefined

    if (!session) {
      if (req.method === 'POST') {
        session = await this.createSession()
      } else {
        sendJson(res, 400, { error: 'Missing or invalid MCP session' })
        return
      }
    }

    const webReq = await toWebRequest(req, port)
    const webRes = await session.transport.handleRequest(webReq)
    await writeWebResponse(res, webRes)
  }

  async start(port: number, token: string): Promise<McpServerStatus> {
    await this.stop()
    this.token = token

    return await new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        void this.handleRequest(req, res, port).catch((err) => {
          if (!res.headersSent) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
          } else {
            res.end()
          }
        })
      })

      server.once('error', (err: NodeJS.ErrnoException) => {
        const reason = err.code === 'EADDRINUSE' ? `port ${port} in use` : err.message
        this.server = null
        const status: McpServerStatus = {
          running: false,
          port,
          address: null,
          error: reason,
        }
        this.setStatus(status)
        resolve(status)
      })

      server.listen(port, '127.0.0.1', () => {
        this.server = server
        const status: McpServerStatus = {
          running: true,
          port,
          address: `http://127.0.0.1:${port}/mcp`,
          error: null,
        }
        this.setStatus(status)
        resolve(status)
      })
    })
  }

  async stop(): Promise<void> {
    for (const { transport, server } of this.sessions.values()) {
      try {
        await transport.close()
        await server.close()
      } catch {
        // Ignore cleanup errors on shutdown
      }
    }
    this.sessions.clear()

    const server = this.server
    this.server = null
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
    this.setStatus({
      running: false,
      port: this.status.port,
      address: null,
      error: null,
    })
  }
}
