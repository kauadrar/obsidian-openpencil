// Android's WebView refuses the editor's module imports from its file URL, so Android loads the editor's files
// as blob URLs (src/android). This runs the same path in a sandboxed frame, which has an opaque origin ("null")
// and no CORS, and checks that the editor mounts a .fig, renders it and saves it. Needs `npm run build` first.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const editorDir = path.join(root, 'build/editor')
const ready = fs.existsSync(path.join(editorDir, 'editor.js'))

function walk(dir) {
  return fs.readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n)
    return fs.statSync(f).isDirectory() ? walk(f) : [f]
  })
}

test('the editor loads from blob URLs in an opaque-origin frame, renders a .fig and saves it', { skip: !ready && 'run npm run build first' }, async () => {
  const bundle = await build({ entryPoints: [path.join(root, 'src/android/blob-loader.ts')], bundle: true, format: 'esm', write: false, platform: 'browser', logLevel: 'silent' })
  const loader = bundle.outputFiles[0].text
  const files = walk(editorDir).map((f) => {
    const p = path.relative(editorDir, f).split(path.sep).join('/')
    return p.endsWith('.js') ? { path: p, text: fs.readFileSync(f, 'utf8') } : { path: p, b64: fs.readFileSync(f).toString('base64') }
  })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<html><body></body></html>')
    const result = await page.evaluate(({ files, loader }) => new Promise((resolve) => {
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'ready') e.source.postMessage({ type: 'start', files, loader }, '*')
        else if (e.data?.type === 'result') resolve(e.data)
      })
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-scripts')
      frame.srcdoc = `<!doctype html><html><body><div id="host"></div><script>
        // The sandboxed frame has no storage; the editor needs some. Obsidian's page has real storage.
        const mem = new Map()
        const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size } }
        for (const name of ['localStorage', 'sessionStorage']) try { Object.defineProperty(window, name, { value: store, configurable: true }) } catch (e) {}
      </script><script type="module">
        const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        window.addEventListener('message', async (e) => {
          if (e.data.type !== 'start') return
          const out = { type: 'result' }
          try {
            const { loadEditorBlobs } = await import(URL.createObjectURL(new Blob([e.data.loader], { type: 'text/javascript' })))
            const srcs = e.data.files.map((f) => (f.text !== undefined ? f : { path: f.path, bytes: bytes(f.b64) }))
            const loaded = loadEditorBlobs(srcs)
            // The editor's own workers are refused, so the SDK runs their work on the main thread.
            out.workersRefused = (() => { try { new Worker('op-blob:/chunks/x.js'); return false } catch (err) { return true } })()
            const mod = await import(loaded.entryUrl)
            const data = await mod.createBlankFig('Test')
            // The plugin mounts on Android with previewOnly (mobile): the long-press menu must offer no edit action.
            const menus = []
            const m = await mod.mountEditor(document.getElementById('host'), { data, fileName: 'test.fig', extension: 'fig', onChange() {}, onSaveRequest() {}, previewOnly: true, showContextMenu: (entries) => menus.push(entries.map((x) => x.label).filter(Boolean)) })
            const rectNode = m.editor.graph.createNode('RECTANGLE', m.editor.state.currentPageId, { name: 'R', x: 10, y: 10, width: 60, height: 60 })
            m.editor.select([rectNode.id])
            const surface = document.querySelector('.op-surface') || document.querySelector('canvas')
            const box = surface.getBoundingClientRect()
            surface.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: box.left + 40, clientY: box.top + 40 }))
            await new Promise((r) => setTimeout(r, 300))
            out.menus = menus
            await new Promise((r) => setTimeout(r, 2000))
            out.origin = String(location.origin)
            out.layers = [...m.editor.graph.getAllNodes()].length
            out.canvas = !!document.querySelector('canvas')
            out.saved = (await m.exportFig('test')).byteLength
            out.ok = out.canvas && out.layers > 0 && out.saved > 0
          } catch (err) { out.ok = false; out.error = String((err && err.stack) || err).slice(0, 400) }
          parent.postMessage(out, '*')
        })
        parent.postMessage({ type: 'ready' }, '*')
      <\/script></body></html>`
      document.body.appendChild(frame)
    }), { files, loader })
    assert.equal(result.origin, 'null')
    assert.equal(result.workersRefused, true)
    // Spec 25: on mobile, the long-press menu offers no Copy, Cut, Paste, Duplicate, Delete or ordering item.
    assert.deepEqual(result.menus, [], 'no context menu on mobile')
    assert.equal(result.ok, true, result.error)
    assert.ok(result.layers > 0)
    assert.ok(result.saved > 0)
  } finally {
    await browser.close()
  }
})
