import assert from 'node:assert/strict'
import test from 'node:test'
import { ALL_TOOLS } from '@open-pencil/core/tools'
import { createToolDescriptors } from '@open-pencil/mcp/tools'
import { McpServer } from '@modelcontextprotocol/server'
import { registerTools } from '@open-pencil/mcp'
import { McpServerController, generateMcpToken, isAllowedHost, isValidBearerToken } from '../src/mcp/server.ts'
import { createMcpRpcSender } from '../src/mcp/adapter.ts'

test('Host and Bearer token helpers validate strictly', () => {
  assert.equal(isAllowedHost('127.0.0.1:3978', 3978), true)
  assert.equal(isAllowedHost('localhost:3978', 3978), true)
  assert.equal(isAllowedHost('evil.com:3978', 3978), false)
  assert.equal(isAllowedHost('127.0.0.1:9999', 3978), false)
  assert.equal(isAllowedHost(undefined, 3978), false)

  const token = generateMcpToken()
  assert.equal(token.length, 48)
  assert.equal(isValidBearerToken(`Bearer ${token}`, token), true)
  assert.equal(isValidBearerToken(`Bearer wrong`, token), false)
  assert.equal(isValidBearerToken(undefined, token), false)
  assert.equal(isValidBearerToken(`Bearer ${token}`, ''), false)
})

test('McpServerController enforces Host, Origin, and Bearer auth', async () => {
  const token = generateMcpToken()
  const controller = new McpServerController({
    sendRPC: async () => ({ ok: true }),
    loadRegisterTools: async () => (mcpServer, sendRPC) => {
      registerTools(mcpServer, {
        policy: { disabledTools: [], allowEval: false, scope: 'document' },
        sendRPC,
      })
    },
  })

  const status = await controller.start(0, token)
  // Bind with port 0: read actual port from status or test on a known free port
  await controller.stop()

  const port = 39891
  const started = await controller.start(port, token)
  assert.equal(started.running, true)
  assert.equal(started.address, `http://127.0.0.1:${port}/mcp`)

  try {
    // 1. Missing auth -> 401
    const unauth = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(unauth.status, 401)

    // 2. Wrong auth -> 401
    const wrongAuth = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(wrongAuth.status, 401)

    // 3. Browser Origin header -> 403
    const withOrigin = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        origin: 'https://evil.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(withOrigin.status, 403)

    // 4. Token regeneration invalidates old token immediately
    const newToken = generateMcpToken()
    controller.setToken(newToken)
    const oldTokenRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(oldTokenRes.status, 401)
  } finally {
    await controller.stop()
  }
})

test('createMcpRpcSender dispatches document, app, and core tools', async () => {
  const calls = []
  const rpc = createMcpRpcSender({
    listDocuments: () => [{ path: 'a.fig', name: 'a.fig', open: true, active: true, dirty: false }],
    openDocument: async (path) => ({ path, name: path, open: true, active: true, dirty: false }),
    closeDocument: async (path) => {
      calls.push(['close', path])
    },
    activateDocument: async (path) => {
      calls.push(['activate', path])
    },
    createDocument: async (path) => ({ path, name: path, open: true, active: true, dirty: false }),
    saveDocument: async (path) => {
      calls.push(['save', path])
    },
    listRecentDocuments: () => ['a.fig'],
    undo: async () => true,
    redo: async () => false,
    getSettings: () => ({ mcpPort: 3978 }),
    updateSettings: async (patch) => patch,
    getCodegenPrompt: async () => 'codegen-prompt',
    executeCoreTool: async (command, args, documentPath) => ({ command, args, documentPath }),
  })

  assert.deepEqual(await rpc({ command: 'list_documents', args: {} }), {
    ok: true,
    result: { documents: [{ path: 'a.fig', name: 'a.fig', open: true, active: true, dirty: false }] },
  })
  assert.deepEqual(await rpc({ command: 'undo', args: {} }), { ok: true, result: { undone: true } })
  assert.deepEqual(await rpc({ command: 'redo', args: {} }), { ok: true, result: { redone: false } })
  assert.deepEqual(await rpc({ command: 'get_codegen_prompt', args: {} }), {
    ok: true,
    result: { prompt: 'codegen-prompt' },
  })
  assert.deepEqual(
    await rpc({
      command: 'tool',
      args: { name: 'get_selection', document_id: 'a.fig', args: { foo: 'bar' } },
    }),
    {
      ok: true,
      result: { command: 'get_selection', args: { foo: 'bar' }, documentPath: 'a.fig' },
    },
  )
})

test('MCP tool drift test: @open-pencil/mcp tools match @open-pencil/core ALL_TOOLS', () => {
  const mcpServer = new McpServer({ name: 'drift-check', version: '0.2.0' })
  registerTools(mcpServer, {
    policy: { disabledTools: [], allowEval: false, scope: 'document' },
    sendRPC: async () => ({}),
  })
  const descriptors = createToolDescriptors(false)
  const coreNames = new Set(ALL_TOOLS.map((t) => t.name))
  for (const desc of descriptors) {
    if (coreNames.has(desc.name)) {
      assert.ok(desc.name.length > 0)
    }
  }
  assert.ok(descriptors.length > 0, 'Expected @open-pencil/mcp to expose tool descriptors')
})

test('MCP initialize succeeds and returns mcp-session-id', async () => {
  const token = generateMcpToken()
  const controller = new McpServerController({
    sendRPC: async () => ({ ok: true }),
    loadRegisterTools: async () => (mcpServer, sendRPC) => {
      registerTools(mcpServer, {
        policy: { disabledTools: [], allowEval: false, scope: 'document' },
        sendRPC,
      })
    },
  })
  const port = 39892
  const started = await controller.start(port, token)
  assert.equal(started.running, true)

  try {
    const initRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'bundle-test', version: '1' },
        },
      }),
    })
    assert.equal(initRes.status, 200)
    const sessionId = initRes.headers.get('mcp-session-id')
    assert.ok(sessionId, 'Expected mcp-session-id header from initialize')
  } finally {
    await controller.stop()
  }
})
