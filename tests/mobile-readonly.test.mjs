// Spec 25: on mobile the editor is read-only, so no edit can run from a shortcut, a menu or an API call. This mounts
// the built editor the way the plugin does on mobile (previewOnly) and tries each kind of edit. Needs npm run build.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ready = fs.existsSync(path.join(root, 'build/editor/editor.js'))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json' }

test('a mobile (previewOnly) editor refuses every edit from shortcuts, menus and the API', { skip: !ready && 'run npm run build first' }, async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.goto(`http://127.0.0.1:${server.address().port}/smoke/index.html`)
    await page.waitForFunction(() => window.smokeReady === true, null, { timeout: 30000 })
    const out = await page.evaluate(async () => {
      const mod = await import('/build/editor/editor.js')
      const host = document.getElementById('host')
      host.innerHTML = ''
      const data = await mod.createBlankFig('Mobile')
      const m = await mod.mountEditor(host, { data, fileName: 'mobile.fig', extension: 'fig', onChange() {}, onSaveRequest() {}, previewOnly: true })
      const ed = m.editor
      await new Promise((r) => setTimeout(r, 800))
      const page0 = ed.state.currentPageId
      const rect = ed.graph.createNode('RECTANGLE', page0, { name: 'R', x: 10, y: 10, width: 50, height: 50 })
      ed.select([rect.id])
      const snapshot = () => JSON.stringify({ n: [...ed.graph.getAllNodes()].map((x) => [x.id, x.x, x.name]), kids: ed.graph.getNode(page0).childIds })
      const before = snapshot()
      const tryEdit = (fn) => { try { fn() } catch (e) { /* refused */ } }
      tryEdit(() => ed.deleteSelected())
      tryEdit(() => ed.duplicateSelected())
      tryEdit(() => ed.bringToFront())
      tryEdit(() => ed.updateNodeWithUndo(rect.id, { x: 999 }, 'move'))
      tryEdit(() => ed.moveNodes?.([rect.id], { x: 5, y: 5 }))
      // A Delete key press reaches the window; the editor's keyboard is off on mobile and read-only refuses edits.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
      return { readOnly: ed.state.hostRestrictions.readOnly, layerEdits: ed.state.hostRestrictions.layerEdits, pathEdits: ed.state.hostRestrictions.pathEdits, tools: [...ed.state.hostRestrictions.tools ?? []].sort(), unchanged: snapshot() === before, rectStillThere: !!ed.graph.getNode(rect.id) }
    })
    assert.equal(out.readOnly, true)
    assert.equal(out.layerEdits, 'none')
    assert.equal(out.pathEdits, 'handles')
    assert.deepEqual(out.tools, ['HAND', 'SELECT'])
    assert.equal(out.rectStillThere, true)
    assert.equal(out.unchanged, true, 'no edit changed the document')
  } finally {
    await browser.close()
    server.close()
  }
})
