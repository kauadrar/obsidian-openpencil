// Regression: ticking a boolean override on an instance, then Cmd/Ctrl+Z, must undo the tick. A checkbox that
// keeps focus makes the editor treat the shortcut as typing, so the undo was swallowed. This drives the built
// editor in headless Chromium, so it needs `npm run build` first and is skipped when the bundle is missing.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundleBuilt = fs.existsSync(path.join(root, 'build/editor/editor.js'))

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json' }

test('undo reverts a boolean override tick on an instance', { skip: !bundleBuilt && 'run npm run build first' }, async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.goto(`${base}/smoke/index.html`)
    await page.waitForFunction(() => window.smokeReady === true, null, { timeout: 30000 })
    await page.evaluate(() => window.smoke.blankRoundTrip())
    await page.waitForFunction(() => !!window.smokeEditor, null, { timeout: 30000 })
    await page.evaluate(() => {
      const ed = window.smokeEditor
      const comp = ed.graph.createNode('COMPONENT', ed.state.currentPageId, { name: 'Card', x: 0, y: 0, width: 80, height: 40 })
      ed.createComponentProperty(comp.id, 'Show icon', 'BOOLEAN', 'false')
      const inst = ed.createInstanceFromComponent(comp.id, 200, 200)
      ed.select([inst])
    })
    await page.waitForTimeout(300)
    const checkbox = page.locator('.op-instance-prop input[type="checkbox"]').first()
    const assigned = () => page.evaluate(() => {
      const ed = window.smokeEditor
      const inst = [...ed.graph.getAllNodes()].find((n) => n.type === 'INSTANCE')
      return Object.values(inst.componentPropertyAssignments)[0]
    })
    assert.equal(await checkbox.isChecked(), false)
    await checkbox.click()
    await page.waitForTimeout(150)
    assert.equal(await assigned(), 'true', 'the tick sets the override')
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(150)
    // Undo removes the override, so the instance is back on the property's default (unticked).
    assert.equal(await assigned(), undefined, 'Cmd/Ctrl+Z undoes the tick')
    assert.equal(await checkbox.isChecked(), false)
  } finally {
    await browser.close()
    server.close()
  }
})
