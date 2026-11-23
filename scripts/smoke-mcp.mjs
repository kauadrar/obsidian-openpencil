#!/usr/bin/env node
// Smoke test against a live Obsidian instance running the in-plugin MCP server.
// Usage: MCP_TOKEN=<token> [MCP_URL=http://127.0.0.1:3978/mcp] node scripts/smoke-mcp.mjs
import assert from 'node:assert/strict'

const url = process.env.MCP_URL ?? 'http://127.0.0.1:3978/mcp'
const token = process.env.MCP_TOKEN
if (!token) {
  console.error('Missing MCP_TOKEN env var')
  process.exit(1)
}

let sessionId = null
let nextId = 1

async function rpc(method, params = {}) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  })
  assert.equal(res.status, 200, `${method} returned HTTP ${res.status}`)
  const sid = res.headers.get('mcp-session-id')
  if (sid) sessionId = sid
  const text = await res.text()
  const jsonLine = text
    .split('\n')
    .find((l) => l.startsWith('data: '))
    ?.slice(6)
  return JSON.parse(jsonLine ?? text)
}

const init = await rpc('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'smoke-mcp', version: '1' },
})
assert.ok(init.result?.serverInfo, 'initialize missing serverInfo')
console.log('PASS initialize')

const list = await rpc('tools/list', {})
const names = new Set((list.result?.tools ?? []).map((t) => t.name))
for (const req of [
  'list_documents',
  'save_document',
  'open_document',
  'list_recent_documents',
  'create_document',
  'close_document',
  'activate_document',
  'undo',
  'redo',
  'get_settings',
  'update_settings',
  'get_codegen_prompt',
]) {
  assert.ok(names.has(req), `tools/list missing ${req}`)
}
console.log(`PASS tools/list (${names.size} tools)`)

let failures = 0
for (const [name, args] of [
  ['list_documents', {}],
  ['list_recent_documents', {}],
  ['get_settings', {}],
  ['update_settings', { settings: { zoomSpeed: 1 } }],
  ['get_codegen_prompt', {}],
  ['create_document', { path: '__smoke_mcp__.fig' }],
  ['activate_document', { document_id: '__smoke_mcp__.fig' }],
  ['get_page_tree', {}],
  ['create_shape', { type: 'RECTANGLE', x: 10, y: 10, width: 50, height: 50 }],
  ['undo', {}],
  ['redo', {}],
  ['save_document', { document_id: '__smoke_mcp__.fig' }],
  ['close_document', { document_id: '__smoke_mcp__.fig' }],
  ['open_document', { path: '__smoke_mcp__.fig' }],
  ['close_document', { document_id: '__smoke_mcp__.fig' }],
]) {
  try {
    const res = await rpc('tools/call', { name, arguments: args })
    if (res.result?.isError) {
      failures++
      console.error(`FAIL ${name}: ${JSON.stringify(res.result)}`)
    } else {
      console.log(`PASS ${name}`)
    }
  } catch (err) {
    failures++
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} step(s) failed`)
  process.exit(1)
}
console.log('\nAll MCP smoke steps passed')
