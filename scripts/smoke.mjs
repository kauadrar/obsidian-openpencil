// Headless smoke test of the built editor bundle (build/editor): loads it in Chromium the way
// main.js loads it in Obsidian, then checks that CanvasKit starts, a .fig saves and re-opens
// with its layers, and a .pen opens. Run after `npm run build`; CI runs it on every change,
// so an OpenPencil update that breaks the plugin fails its pull request.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pen': 'application/json', '.json': 'application/json' }
const root = process.cwd()
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  try {
    const body = await readFile(join(root, path))
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
// Obsidian serves the plugin's files from another origin than the page, so a Worker built from
// the bundle's own URL cannot start there. Refuse Workers the same way, so code that needs one fails here too.
await page.addInitScript(() => {
  window.Worker = class {
    constructor() {
      throw new DOMException("Failed to construct 'Worker': cross-origin script (smoke test, as in Obsidian)", 'SecurityError')
    }
  }
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

let failed = false
function check(name, cond, detail) {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed = true
}

try {
  await page.goto(`${base}/smoke/index.html`)
  await page.waitForFunction(() => window.smokeReady === true, null, { timeout: 30_000 })

  const fig = await page.evaluate(() => window.smoke.blankRoundTrip())
  check('blank .fig opens and the canvas starts', fig.ok, fig.error)
  if (fig.ok) {
    check('saved .fig is not empty', fig.bytes > 0, `${fig.bytes} bytes`)
    check('re-opened .fig keeps every layer', fig.after === fig.before, `${fig.before} → ${fig.after} nodes`)
    check('re-opened .fig contains the drawn shapes',
      fig.names.includes('Smoke rect') && fig.names.includes('Smoke ellipse'))
    // The SDK only lets you drag guides out of the rulers when this flag is set.
    check('rulers accept guides', await page.evaluate(() => window.smokeEditor.state.showRulers === true))
    // The zoom label sits at the canvas bottom-left, not in the Design panel's tab row, and keeps one width.
    const label = async (zoom) => page.evaluate(async (zoom) => {
      window.smokeEditor.state.zoom = zoom
      await new Promise((r) => setTimeout(r, 50))
      const z = document.querySelector('.op-canvas .op-zoom')
      const c = document.querySelector('.op-canvas').getBoundingClientRect()
      const r = z.getBoundingClientRect()
      return { text: z.textContent, w: Math.round(r.width * 10), left: r.left - c.left, bottomGap: c.bottom - r.bottom,
        clipped: z.scrollWidth > z.clientWidth, inTabRow: !!document.querySelector('.op-design-tabs .op-zoom, .op-design-zoom') }
    }, zoom)
    const lo = await label(0.02)
    const hi = await label(10)
    check('zoom label is at the canvas bottom-left, not in the tab row', lo.left < 80 && lo.bottomGap > 0 && !lo.inTabRow, JSON.stringify(lo))
    check('zoom label keeps its width from 2% to 1000%, unclipped', lo.w === hi.w && !lo.clipped && !hi.clipped && hi.text === '1000%')
    // Design files have no Comment tool: neither the key nor the tool state may arm it.
    const tool = await page.evaluate(() => {
      const ed = window.smokeEditor
      ed.setTool('SELECT')
      ed.setTool('COMMENT')
      return ed.state.activeTool
    })
    check('Comment tool cannot be armed', tool === 'SELECT', `active tool: ${tool}`)
    await page.mouse.move(600, 300)
    await page.keyboard.press('c')
    check('C key does not arm Comment', await page.evaluate(() => window.smokeEditor.state.activeTool) === 'SELECT')
  }

  const pen = await page.evaluate(() => window.smoke.openPen('fixtures/pencil_button.pen'))
  check('.pen opens and the canvas starts', pen.ok, pen.error)
  check('.pen has layers', pen.nodes > 1, `${pen.nodes} nodes, pages: ${pen.pages?.join(', ')}`)

  check('no errors in the page', errors.length === 0, errors.join(' | ').slice(0, 500))
} finally {
  await browser.close()
  server.close()
}
process.exit(failed ? 1 : 0)
