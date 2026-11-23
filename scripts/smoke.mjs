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

    // Spec 05: missing keyboard shortcuts, focus guards, and excluded keys.
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press('i')
    check('I key arms Eyedropper', await page.evaluate(() => window.smokeEditor.state.activeTool) === 'EYEDROPPER')
    await page.keyboard.press('Escape')

    await page.keyboard.press('Shift+C')
    check('Shift+C does not arm Comment', await page.evaluate(() => window.smokeEditor.state.activeTool) === 'SELECT')

    const rulersBefore = await page.evaluate(() => window.smokeEditor.state.showRulers)
    await page.keyboard.press('Shift+R')
    const rulersAfter = await page.evaluate(() => window.smokeEditor.state.showRulers)
    await page.keyboard.press('Shift+R')
    check('Shift+R toggles rulers', rulersBefore === true && rulersAfter === false)

    const gridBefore = await page.evaluate(() => window.smokeEditor.state.showPixelGrid)
    await page.keyboard.press("Shift+'")
    const gridAfter = await page.evaluate(() => window.smokeEditor.state.showPixelGrid)
    await page.keyboard.press("Shift+'")
    check("Shift+' toggles pixel grid", gridAfter !== gridBefore)

    const snapBefore = await page.evaluate(() => window.smokeEditor.state.snappingPreferences.pixelGrid)
    await page.keyboard.press(`${mod}+Shift+'`)
    const snapAfter = await page.evaluate(() => window.smokeEditor.state.snappingPreferences.pixelGrid)
    await page.keyboard.press(`${mod}+Shift+'`)
    check("Mod+Shift+' toggles snap to pixel grid", snapAfter === !snapBefore)

    // Align, frame selection, boolean union, flatten, copy/paste properties, paste to replace, text underline.
    const setupIds = await page.evaluate(() => {
      const ed = window.smokeEditor
      const pageId = ed.state.currentPageId
      const a = ed.graph.createNode('RECTANGLE', pageId, {
        name: 'KB A', x: 20, y: 30, width: 40, height: 40,
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
      })
      const b = ed.graph.createNode('RECTANGLE', pageId, {
        name: 'KB B', x: 100, y: 90, width: 60, height: 60,
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
      })
      const txt = ed.graph.createNode('TEXT', pageId, { name: 'KB Text', x: 200, y: 200, width: 80, height: 24, text: 'Hello' })
      ed.select([a.id, b.id])
      return { a: a.id, b: b.id, txt: txt.id }
    })

    await page.keyboard.press('Alt+a')
    check('Alt+A aligns left', await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.x === 20, setupIds.b))
    await page.keyboard.press(`${mod}+z`)
    check('Undo reverts Alt+A', await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.x === 100, setupIds.b))

    await page.keyboard.press('Alt+Shift+u')
    check('Alt+Shift+U creates boolean union', await page.evaluate(() => window.smokeEditor.getSelectedNode()?.type === 'BOOLEAN_OPERATION'))
    await page.keyboard.press(`${mod}+z`)

    await page.evaluate((id) => window.smokeEditor.select([id]), setupIds.a)
    await page.keyboard.press(`${mod}+Alt+g`)
    check('Mod+Alt+G frames selection', await page.evaluate((id) => {
      const ed = window.smokeEditor
      return ed.graph.getNode(ed.graph.getNode(id)?.parentId ?? '')?.type === 'FRAME'
    }, setupIds.a))
    await page.keyboard.press(`${mod}+z`)

    await page.evaluate((id) => window.smokeEditor.select([id]), setupIds.a)
    await page.keyboard.press(`${mod}+Alt+c`)
    await page.evaluate((id) => window.smokeEditor.select([id]), setupIds.b)
    await page.keyboard.press(`${mod}+Alt+v`)
    await page.waitForTimeout(50)
    check('Mod+Alt+C / Mod+Alt+V copies and pastes properties', await page.evaluate((id) => {
      const fill = window.smokeEditor.graph.getNode(id)?.fills?.[0]?.color
      return fill ? fill.r === 1 && fill.b === 0 : false
    }, setupIds.b))
    await page.keyboard.press(`${mod}+z`)

    await page.evaluate((id) => window.smokeEditor.select([id]), setupIds.a)
    await page.keyboard.press(`${mod}+c`)
    await page.evaluate((id) => window.smokeEditor.select([id]), setupIds.b)
    await page.keyboard.press(`${mod}+Shift+r`)
    await page.waitForTimeout(50)
    check('Mod+Shift+R pastes to replace', await page.evaluate((ids) => {
      const ed = window.smokeEditor
      return ed.graph.getNode(ids.b) == null && ed.getSelectedNode()?.name === 'KB A'
    }, setupIds))
    await page.keyboard.press(`${mod}+z`)

    await page.evaluate((id) => window.smokeEditor.select([id]), setupIds.txt)
    await page.keyboard.press(`${mod}+u`)
    check('Mod+U toggles underline on selected text layer', await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.textDecoration === 'UNDERLINE', setupIds.txt))
    await page.keyboard.press(`${mod}+r`)
    check('Mod+R is unbound by default', await page.evaluate(() => document.querySelector('.op-rename') === null))

    // Focus guard: panel input blocks canvas shortcuts.
    await page.focus('.op-design input')
    await page.keyboard.press('i')
    check('Panel input focus blocks canvas shortcuts', await page.evaluate(() => window.smokeEditor.state.activeTool === 'SELECT'))
    await page.evaluate(() => (document.activeElement)?.blur?.())

    // Spec 06: canvas & layer context menu.
    await page.evaluate(() => window.smokeEditor.clearSelection())
    await page.click('.op-layer', { button: 'right' })
    const layerMenu = await page.evaluate(() => {
      const m = window.smokeLastMenu?.entries ?? []
      const labels = m.filter((e) => !e.separator).map((e) => e.label)
      return {
        selected: window.smokeEditor.state.selectedIds.size,
        labels,
        copyDisabled: m.find((e) => e.label === 'Copy')?.disabled,
      }
    })
    check('Right-click on layer row selects it and opens menu', layerMenu.selected === 1 && layerMenu.labels.includes('Copy') && layerMenu.labels.includes('Duplicate') && !layerMenu.copyDisabled)

    // Right-click on empty canvas clears selection and disables selection-only items.
    await page.click('.op-surface', { button: 'right', position: { x: 5, y: 5 } })
    const emptyMenu = await page.evaluate(() => {
      const m = window.smokeLastMenu?.entries ?? []
      return {
        selected: window.smokeEditor.state.selectedIds.size,
        copyDisabled: m.find((e) => e.label === 'Copy')?.disabled,
        pasteDisabled: m.find((e) => e.label === 'Paste')?.disabled,
        duplicateDisabled: m.find((e) => e.label === 'Duplicate')?.disabled,
      }
    })
    check('Right-click on empty canvas disables selection-only items', emptyMenu.selected === 0 && emptyMenu.copyDisabled === true && emptyMenu.duplicateDisabled === true && !emptyMenu.pasteDisabled)

    // Hide/Show, Lock/Unlock, Move to page, Auto arrange.
    await page.evaluate((ids) => {
      const ed = window.smokeEditor
      const page1 = ed.state.currentPageId
      ed.addPage('Page 2')
      ed.switchPage(page1)
      ed.updateNode(ids.a, { visible: false, locked: true })
      ed.select([ids.a])
    }, setupIds)
    await page.locator('.op-layer', { hasText: 'KB A' }).click({ button: 'right' })
    const single = await page.evaluate(() => {
      const m = window.smokeLastMenu?.entries ?? []
      const labels = m.filter((e) => !e.separator).map((e) => e.label)
      const move = m.find((e) => e.label === 'Move to page')
      return {
        hasShow: labels.includes('Show'),
        hasUnlock: labels.includes('Unlock'),
        movePages: move?.sub?.map((s) => s.label) ?? [],
        hasAutoArrange: labels.includes('Auto arrange'),
      }
    })
    check('Hide/Show and Lock/Unlock labels follow selection state', single.hasShow && single.hasUnlock)
    check('Move to page lists only other pages', single.movePages.length === 1 && single.movePages[0] === 'Page 2')
    check('Auto arrange hidden for single selection', !single.hasAutoArrange)

    await page.evaluate((ids) => window.smokeEditor.select([ids.a, ids.b]), setupIds)
    await page.locator('.op-layer', { hasText: 'KB A' }).click({ button: 'right' })
    const multi = await page.evaluate(() => (window.smokeLastMenu?.entries ?? []).some((e) => e.label === 'Auto arrange'))
    check('Auto arrange shown for 2+ selected layers', multi)

    // Toggle visibility via menu action and immediately re-open menu on same selection: label must flip.
    await page.evaluate((ids) => window.smokeEditor.select([ids.a]), setupIds)
    await page.locator('.op-layer', { hasText: 'KB A' }).click({ button: 'right' })
    await page.evaluate(() => window.smokeLastMenu?.entries.find((e) => e.label === 'Show')?.action?.())
    await page.locator('.op-layer', { hasText: 'KB A' }).click({ button: 'right' })
    const flippedLabel = await page.evaluate(() => (window.smokeLastMenu?.entries ?? []).some((e) => e.label === 'Hide'))
    check('Hide/Show label updates immediately on same selection', flippedLabel)

    // Cut menu action removes layer and Undo restores it.
    await page.evaluate((ids) => {
      window.smokeEditor.updateNode(ids.a, { locked: false, visible: true })
      window.smokeEditor.select([ids.a])
    }, setupIds)
    await page.locator('.op-layer', { hasText: 'KB A' }).click({ button: 'right' })
    await page.evaluate(() => window.smokeLastMenu?.entries.find((e) => e.label === 'Cut')?.action?.())
    await page.waitForTimeout(50)
    const afterCut = await page.evaluate((id) => window.smokeEditor.graph.getNode(id) == null, setupIds.a)
    check('Cut menu action removes selected layer', afterCut)
    await page.keyboard.press(`${mod}+z`)
    const afterUndoCut = await page.evaluate((id) => window.smokeEditor.graph.getNode(id) != null, setupIds.a)
    check('Undo restores Cut layer', afterUndoCut)

    // Spec 07: pages rename, delete, reorder, dividers.
    await page.locator('.op-page', { hasText: 'Page 2' }).click()
    await page.locator('.op-page', { hasText: 'Page 2' }).click()
    await page.waitForSelector('.op-page .op-rename')
    await page.fill('.op-page .op-rename', 'Renamed')
    await page.keyboard.press('Enter')
    check('Click selected page renames inline and Enter commits', await page.evaluate(() => window.smokeEditor.graph.getPages().some((p) => p.name === 'Renamed')))

    // Escape cancels rename; empty name keeps old name.
    await page.locator('.op-page', { hasText: 'Renamed' }).dblclick()
    await page.fill('.op-page .op-rename', 'Discarded')
    await page.keyboard.press('Escape')
    check('Escape cancels page rename', await page.evaluate(() => window.smokeEditor.graph.getPages().some((p) => p.name === 'Renamed')))

    await page.locator('.op-page', { hasText: 'Renamed' }).dblclick()
    await page.fill('.op-page .op-rename', '   ')
    await page.keyboard.press('Enter')
    check('Empty page rename keeps old name', await page.evaluate(() => window.smokeEditor.graph.getPages().some((p) => p.name === 'Renamed')))

    // Dash-named page renders as divider.
    await page.evaluate(() => window.smokeEditor.addPage('---'))
    check('Dash-named page renders as divider', await page.locator('.op-page.is-divider .op-page-divider').count() === 1)

    // Drag-to-reorder pages.
    await page.locator('.op-page', { hasText: 'Renamed' }).dragTo(page.locator('.op-page').first(), { targetPosition: { x: 20, y: 2 } })
    const orderAfterDrag = await page.evaluate(() => window.smokeEditor.graph.getPages().map((p) => p.name))
    check('Drag reorders pages', orderAfterDrag[0] === 'Renamed')

    // Right-click Delete removes page and Undo restores it; disabled on last page.
    await page.locator('.op-page', { hasText: 'Renamed' }).click({ button: 'right' })
    await page.evaluate(() => window.smokeLastMenu?.entries.find((e) => e.label === 'Delete')?.action?.())
    check('Page context menu Delete removes page', await page.evaluate(() => !window.smokeEditor.graph.getPages().some((p) => p.name === 'Renamed')))
    await page.keyboard.press(`${mod}+z`)
    check('Undo restores deleted page', await page.evaluate(() => window.smokeEditor.graph.getPages().some((p) => p.name === 'Renamed')))

    // Delete all extra pages until 1 remains, then verify Delete is disabled.
    while (await page.evaluate(() => window.smokeEditor.graph.getPages().length > 1)) {
      await page.locator('.op-page').last().click({ button: 'right' })
      await page.evaluate(() => window.smokeLastMenu?.entries.find((e) => e.label === 'Delete')?.action?.())
    }
    await page.locator('.op-page').first().click({ button: 'right' })
    check('Page Delete is disabled when only 1 page remains', await page.evaluate(() => window.smokeLastMenu?.entries.find((e) => e.label === 'Delete')?.disabled === true))
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
