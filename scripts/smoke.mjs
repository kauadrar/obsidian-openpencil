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

    // Spec 08: flips, rotate 90, ignore auto layout, clip content, multi-selection header/booleans/arrange/mixed/selection colors.
    const s8 = await page.evaluate(() => {
      const ed = window.smokeEditor
      const pageId = ed.state.currentPageId
      const frame = ed.graph.createNode('FRAME', pageId, {
        name: 'AL Frame', x: 10, y: 10, width: 200, height: 200, layoutMode: 'VERTICAL', clipsContent: false,
      })
      const child = ed.graph.createNode('RECTANGLE', frame.id, {
        name: 'AL Child', x: 0, y: 0, width: 50, height: 50,
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
      })
      const other = ed.graph.createNode('RECTANGLE', pageId, {
        name: 'Other', x: 300, y: 50, width: 80, height: 80,
        fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
      })
      const txt = ed.graph.createNode('TEXT', pageId, { name: 'S8 Text', x: 400, y: 50, width: 60, height: 20, text: 'Hi' })
      ed.select([frame.id])
      return { frame: frame.id, child: child.id, other: other.id, txt: txt.id }
    })

    // Clip content on frame
    await page.locator('.op-checkbox', { hasText: 'Clip content' }).locator('input').click()
    check('Clip content toggles clipsContent on frame', await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.clipsContent === true, s8.frame))

    // Flip and Rotate 90 on rectangle
    await page.evaluate((id) => window.smokeEditor.select([id]), s8.other)
    await page.click('button[title^="Flip horizontal"]')
    check('Flip horizontal button flips layer', await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.flipX === true, s8.other))
    await page.click('button[title="Rotate 90°"]')
    check('Rotate 90° button rotates layer', await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.rotation === 90, s8.other))
    await page.keyboard.press(`${mod}+z`)
    await page.keyboard.press(`${mod}+z`)
    check('Undo reverts rotate and flip', await page.evaluate((id) => {
      const n = window.smokeEditor.graph.getNode(id)
      return n?.rotation === 0 && n?.flipX === false
    }, s8.other))

    // Ignore auto layout on auto-layout child
    await page.evaluate((id) => window.smokeEditor.select([id]), s8.child)
    const hadIgnoreBtn = await page.locator('.op-ignore-layout').count() === 1
    await page.click('.op-ignore-layout')
    const nowIgnores = await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.layoutPositioning === 'ABSOLUTE', s8.child)
    check('Ignore auto layout toggles child out of flow', hadIgnoreBtn && nowIgnores)

    // Multi-selection: "N selected", Mixed, Boolean ops, Arrange menu, Typography on mixed selection, Selection colors.
    await page.evaluate((ids) => window.smokeEditor.select([ids.other, ids.txt]), s8)
    const multiUi = await page.evaluate(() => ({
      title: document.querySelector('.op-prop-title span')?.textContent,
      wVal: document.querySelector('.op-design label[title=""] input')?.value ?? [...document.querySelectorAll('.op-design .op-field')].find((l) => l.querySelector('.op-field-label')?.textContent === 'W')?.querySelector('input')?.value,
      hasType: [...document.querySelectorAll('.op-design .op-prop-head')].some((h) => h.textContent?.includes('Typography')),
      hasSelColors: [...document.querySelectorAll('.op-design .op-prop-head')].some((h) => h.textContent?.includes('Selection colors')),
    }))
    check('Multi-selection shows N selected, Mixed width, Typography, Selection colors',
      multiUi.title === '2 selected' && multiUi.wVal === 'Mixed' && multiUi.hasType && multiUi.hasSelColors)

    await page.click('button[title="Boolean operations"]')
    check('Boolean ops menu opens with Union and Flatten', await page.evaluate(() => {
      const labels = (window.smokeLastMenu?.entries ?? []).filter((e) => !e.separator).map((e) => e.label)
      return labels.includes('Union selection') && labels.includes('Flatten')
    }))

    await page.click('button[title="Arrange"]')
    check('Arrange menu opens with Tidy up, Distribute, Pack, Auto arrange', await page.evaluate(() => {
      const labels = (window.smokeLastMenu?.entries ?? []).filter((e) => !e.separator).map((e) => e.label)
      return labels.includes('Tidy up') && labels.includes('Auto arrange')
    }))

    // Spec 09: zoom menu.
    await page.click('.op-zoom')
    await page.waitForSelector('.op-zoom-menu')
    const zoomItems = await page.evaluate(() => [...document.querySelectorAll('.op-zoom-menu .op-zoom-item')].map((el) => el.textContent?.trim() ?? ''))
    check('Zoom menu lists presets and toggles without Multiplayer or Comments',
      zoomItems.some((t) => t.includes('Zoom in')) &&
      zoomItems.some((t) => t.includes('Zoom to 50%')) &&
      zoomItems.some((t) => t.includes('Snap to pixel grid')) &&
      zoomItems.some((t) => t.includes('Design issues')) &&
      !zoomItems.some((t) => t.includes('Multiplayer') || t.includes('Comments')))

    await page.fill('.op-zoom-input', '1')
    await page.keyboard.press('Enter')
    check('Zoom input clamps below minimum to 2%', await page.evaluate(() => Math.round(window.smokeEditor.state.zoom * 100) === 2))

    await page.click('.op-zoom')
    await page.locator('.op-zoom-item', { hasText: 'Zoom to 50%' }).click()
    check('Zoom to 50% sets zoom to 50%', await page.evaluate(() => Math.round(window.smokeEditor.state.zoom * 100) === 50))

    await page.click('.op-zoom')
    const snapCheckedBefore = await page.locator('.op-zoom-item', { hasText: 'Snap to pixel grid' }).getAttribute('aria-checked')
    await page.keyboard.press('Escape')
    await page.keyboard.press(`${mod}+Shift+'`)
    await page.click('.op-zoom')
    const snapCheckedAfter = await page.locator('.op-zoom-item', { hasText: 'Snap to pixel grid' }).getAttribute('aria-checked')
    check("Mod+Shift+' toggles Snap to pixel grid checkmark in zoom menu", snapCheckedBefore !== snapCheckedAfter)

    await page.locator('.op-zoom-item', { hasText: 'Rulers' }).click()
    const rulersOff = await page.evaluate(() => window.smokeEditor.state.showRulers === false)
    await page.locator('.op-zoom-item', { hasText: 'Rulers' }).click()
    const rulersOn = await page.evaluate(() => window.smokeEditor.state.showRulers === true)
    check('Rulers toggle in zoom menu flips showRulers off and on', rulersOff && rulersOn)

    await page.locator('.op-zoom-item', { hasText: 'Design issues' }).click()
    const issuesOn = await page.evaluate(() => window.smokeEditor.state.designIssues !== null)
    await page.locator('.op-zoom-item', { hasText: 'Design issues' }).click()
    const issuesOff = await page.evaluate(() => window.smokeEditor.state.designIssues === null)
    check('Design issues toggle sets and clears designIssues', issuesOn && issuesOff)
    await page.keyboard.press('Escape')

    // Spec 10: Copy as SVG / Copy as PNG submenu.
    await page.click('.op-surface', { button: 'right', position: { x: 5, y: 5 } })
    const copyAsEmpty = await page.evaluate(() => {
      const sub = (window.smokeLastMenu?.entries ?? []).find((e) => e.label === 'Copy as')?.sub ?? []
      return sub.map((s) => ({ label: s.label, disabled: s.disabled }))
    })
    check('Copy as SVG and PNG disabled when nothing is selected',
      copyAsEmpty.length === 2 && copyAsEmpty.every((s) => s.disabled === true))

    await page.evaluate((ids) => window.smokeEditor.select([ids.other]), s8)
    await page.locator('.op-layer', { hasText: 'Other' }).click({ button: 'right' })
    const copyAsSel = await page.evaluate(async () => {
      const writes = []
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => writes.push({ kind: 'text', text }),
          write: async (items) => writes.push({ kind: 'items', types: items.flatMap((i) => i.types) }),
        },
      })
      const sub = (window.smokeLastMenu?.entries ?? []).find((e) => e.label === 'Copy as')?.sub ?? []
      await sub.find((s) => s.label === 'Copy as SVG')?.action?.()
      await new Promise((r) => setTimeout(r, 50))
      await sub.find((s) => s.label === 'Copy as PNG')?.action?.()
      await new Promise((r) => setTimeout(r, 150))
      return writes
    })
    check('Copy as SVG writes SVG markup and Copy as PNG writes image/png',
      copyAsSel.some((w) => w.kind === 'text' && w.text.includes('<svg')) &&
      copyAsSel.some((w) => w.kind === 'items' && w.types.includes('image/png')))

    // Spec 11: mounted command palette bridge (canRunCommand / runCommand).
    await page.evaluate(() => window.smokeEditor.clearSelection())
    const noSelCmds = await page.evaluate(() => ({
      dup: window.smokeMounted.canRunCommand('selection.duplicate'),
      svg: window.smokeMounted.canRunCommand('app.copyAsSVG'),
      rulers: window.smokeMounted.canRunCommand('app.toggleRulers'),
    }))
    check('Selection commands disabled with no selection, view commands enabled',
      !noSelCmds.dup && !noSelCmds.svg && noSelCmds.rulers)

    await page.evaluate((ids) => window.smokeEditor.select([ids.other]), s8)
    await page.evaluate(() => window.smokeMounted.runCommand('app.renameSelection'))
    await page.waitForSelector('.op-layer .op-rename')
    await page.fill('.op-layer .op-rename', 'Cmd Renamed')
    await page.keyboard.press('Enter')
    check('app.renameSelection opens layer inline rename and commits',
      await page.evaluate((id) => window.smokeEditor.graph.getNode(id)?.name === 'Cmd Renamed', s8.other))

    // Spec 12: Place / drop SVG, frame targeting, and unsupported file notice.
    const placeRes = await page.evaluate(async (ids) => {
      const ed = window.smokeEditor
      const svgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'], 'badge.svg', { type: 'image/svg+xml' })
      const ok = await window.smokeMounted.placeFiles([svgFile])
      const placedId = [...ed.state.selectedIds][0]
      const frame = ed.graph.getNode(ids.frame)
      const okInFrame = await window.smokeMounted.placeFiles([svgFile], frame.x + 100, frame.y + 100)
      const inFrameNode = ed.getSelectedNode()
      window.smokeLastNotice = null
      const badFile = new File(['hello'], 'notes.txt', { type: 'text/plain' })
      const badOk = await window.smokeMounted.placeFiles([badFile])
      return {
        ok,
        hasPlaced: !!placedId,
        okInFrame,
        parentIsFrame: inFrameNode?.parentId === ids.frame,
        badOk,
        notice: window.smokeLastNotice,
      }
    }, s8)
    check('placeFiles inserts SVG at viewport center and into frame when dropped on frame',
      placeRes.ok && placeRes.hasPlaced && placeRes.okInFrame && placeRes.parentIsFrame)
    check('Unsupported file shows notice and inserts nothing',
      placeRes.badOk === false && String(placeRes.notice).includes('Unsupported file type'))

    // Spec 13: Live settings application (snapping preferences + zoom speed).
    const settingsRes = await page.evaluate(async () => {
      const ed = window.smokeEditor
      const mounted = window.smokeMounted
      const canvas = document.querySelector('canvas')
      if (!ed || !mounted || !canvas) return { missing: true }
      const rect = canvas.getBoundingClientRect()
      const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const wheel = async () => {
        canvas.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -100,
          ctrlKey: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true
        }))
        await nextFrame()
      }

      mounted.applySettings({ snapToGeometry: true, snapToObjects: true, snapToPixelGrid: true, zoomSpeed: 1 })
      ed.state.zoom = 1
      await wheel()
      const deltaAt1 = Math.abs(ed.state.zoom - 1)

      mounted.applySettings({ snapToGeometry: false, snapToObjects: false, snapToPixelGrid: false, zoomSpeed: 2 })
      const prefsOff = { ...ed.state.snappingPreferences }
      ed.state.zoom = 1
      await wheel()
      const deltaAt2 = Math.abs(ed.state.zoom - 1)

      mounted.applySettings({ snapToGeometry: true, snapToObjects: true, snapToPixelGrid: true, zoomSpeed: 1 })
      const prefsOn = { ...ed.state.snappingPreferences }
      return { prefsOff, prefsOn, deltaAt1, deltaAt2 }
    })
    check('applySettings updates snappingPreferences live',
      !settingsRes.missing &&
      settingsRes.prefsOff.geometry === false &&
      settingsRes.prefsOff.objects === false &&
      settingsRes.prefsOff.pixelGrid === false &&
      settingsRes.prefsOn.geometry === true &&
      settingsRes.prefsOn.objects === true &&
      settingsRes.prefsOn.pixelGrid === true)
    check('applySettings updates zoomSpeed live for wheel zoom',
      !settingsRes.missing &&
      settingsRes.deltaAt1 > 0 &&
      settingsRes.deltaAt2 > settingsRes.deltaAt1 * 1.5,
      `Δ@1x=${settingsRes.deltaAt1?.toFixed(4)}, Δ@2x=${settingsRes.deltaAt2?.toFixed(4)}`)

    // Spec 15: Export to vault stable naming (<design> - <layer/page>, sanitized chars, nested collision id).
    const exportRes = await page.evaluate(async (ids) => {
      const ed = window.smokeEditor
      window.smokeExports = []
      const frame = ed.graph.getNode(ids.frame)
      const origName = frame.name
      frame.name = 'Card/Hero:1'
      ed.select([ids.frame])
      await new Promise((r) => setTimeout(r, 50))
      document.querySelector('button[title="Add export setting"]')?.click()
      await new Promise((r) => setTimeout(r, 50))
      document.querySelector('.op-export-btn')?.click()
      for (let i = 0; i < 40 && window.smokeExports.length < 1; i++) {
        await new Promise((r) => setTimeout(r, 50))
      }
      const firstExport = window.smokeExports[0]

      // Nested frame with same name as top-level frame gets id suffix.
      const nested = ed.graph.createNode('FRAME', ids.frame, { name: 'Card/Hero:1', x: 10, y: 10, width: 20, height: 20 })
      ed.select([nested.id])
      await new Promise((r) => setTimeout(r, 50))
      document.querySelector('button[title="Add export setting"]')?.click()
      await new Promise((r) => setTimeout(r, 50))
      document.querySelector('.op-export-btn')?.click()
      for (let i = 0; i < 40 && window.smokeExports.length < 2; i++) {
        await new Promise((r) => setTimeout(r, 50))
      }
      const nestedExport = window.smokeExports[1]
      frame.name = origName
      return { firstExport, nestedExport, nestedId: nested.id }
    }, s8)
    check('Export uses stable <design> - <sanitized frame>.png name',
      exportRes.firstExport?.name === 'Smoke - Card-Hero-1.png' && exportRes.firstExport?.bytes > 0,
      JSON.stringify(exportRes.firstExport))
    check('Nested frame with duplicate name gets layer id suffix',
      exportRes.nestedExport?.name === `Smoke - Card-Hero-1-${exportRes.nestedId.replace(/[\\/:*?"<>|#^[\]]/g, '-')}.png`,
      JSON.stringify(exportRes.nestedExport))

    // Spec 17: Colour picker popover, models (RGB/HSL/HSB/OkHCL), inline hex, and undo.
    await page.evaluate((id) => {
      const ed = window.smokeEditor
      ed.select([id])
    }, s8.other)
    await page.locator('.op-swatch').first().click()
    await page.locator('.op-cp-popover').waitFor({ state: 'visible' })
    const cpInfo = await page.evaluate(() => {
      const pop = document.querySelector('.op-cp-popover')
      const opts = Array.from(pop?.querySelectorAll('.op-cp-select option') ?? []).map((o) => o.value)
      return {
        width: pop ? Math.round(pop.getBoundingClientRect().width) : 0,
        hasArea: !!pop?.querySelector('.op-cp-area'),
        sliders: pop?.querySelectorAll('.op-cp-slider').length ?? 0,
        hasEyedropper: !!pop?.querySelector('.op-cp-eyedropper'),
        opts,
      }
    })
    check('Colour picker popover is 240 px with SV area, hue/alpha sliders, eyedropper, and RGB/HSL/HSB/OkHCL (no HEX)',
      cpInfo.width === 240 && cpInfo.hasArea && cpInfo.sliders === 2 && cpInfo.hasEyedropper &&
      cpInfo.opts.join(',') === 'rgb,hsl,hsb,okhcl',
      JSON.stringify(cpInfo))

    await page.locator('.op-cp-select').selectOption('okhcl')
    const okhclInfo = await page.evaluate(() => {
      const pop = document.querySelector('.op-cp-popover')
      const tracks = Array.from(pop?.querySelectorAll('.op-cp-track') ?? [])
      const trackGradients = tracks.map((t) => getComputedStyle(t).backgroundImage)
      return {
        sliders: pop?.querySelectorAll('.op-cp-slider').length ?? 0,
        hasGamut: !!pop?.querySelector('.op-cp-gamut'),
        allGradients: trackGradients.length === 4 && trackGradients.every((g) => g.includes('linear-gradient')),
      }
    })
    check('OkHCL mode shows Hue/Chroma/Lightness/Alpha sliders with visible gradients and gamut badge',
      okhclInfo.sliders === 4 && okhclInfo.hasGamut && okhclInfo.allGradients,
      JSON.stringify(okhclInfo))

    // Switch back to RGB and verify SV square + Hue + Alpha sliders actually change colour.
    await page.locator('.op-cp-select').selectOption('rgb')
    const initialHex = await page.locator('.op-hex').first().inputValue()
    const areaBox = await page.locator('.op-cp-area').boundingBox()
    await page.mouse.click(areaBox.x + areaBox.width * 0.85, areaBox.y + areaBox.height * 0.25)
    const afterAreaHex = await page.locator('.op-hex').first().inputValue()
    const hueBox = await page.locator('.op-cp-slider').first().boundingBox()
    await page.mouse.click(hueBox.x + hueBox.width * 0.65, hueBox.y + hueBox.height / 2)
    const afterHueHex = await page.locator('.op-hex').first().inputValue()
    const alphaBox = await page.locator('.op-cp-alpha').boundingBox()
    await page.mouse.click(alphaBox.x + alphaBox.width * 0.5, alphaBox.y + alphaBox.height / 2)
    const afterAlpha = await page.locator('.op-color-opacity input').first().inputValue()
    check('SV square, Hue slider, and Alpha slider update colour and opacity live',
      afterAreaHex !== initialHex && afterHueHex !== afterAreaHex && afterAlpha !== '100%',
      `${initialHex} -> ${afterAreaHex} -> ${afterHueHex}, alpha=${afterAlpha}`)

    // Eyedropper button arms EYEDROPPER and Escape cancels it.
    await page.locator('.op-cp-eyedropper').click()
    const toolArmed = await page.evaluate(() => window.smokeEditor.state.activeTool)
    await page.keyboard.press('Escape')
    const toolAfterEsc = await page.evaluate(() => window.smokeEditor.state.activeTool)
    check('Eyedropper arms from picker and Escape cancels it',
      toolArmed === 'EYEDROPPER' && toolAfterEsc === 'SELECT',
      `${toolArmed} -> ${toolAfterEsc}`)

    // Close popover, edit inline hex, and verify undo.
    await page.keyboard.press('Escape')
    const hexInput = page.locator('.op-hex').first()
    await hexInput.click()
    await hexInput.fill('FF5500')
    await hexInput.press('Enter')
    const afterHex = await hexInput.inputValue()
    await page.keyboard.press(`${mod}+z`)
    const undoneHex = await hexInput.inputValue()
    check('Inline hex edits fill color and Undo reverts it',
      afterHex === 'FF5500' && undoneHex === initialHex,
      `${initialHex} -> ${afterHex} -> ${undoneHex}`)

    // Spec 18: Solid / Gradient / Image fill tabs, gradient stops & on-canvas gradientEdit, image controls.
    await page.locator('.op-swatch').first().click()
    await page.locator('.op-fill-tabs').waitFor({ state: 'visible' })
    const tabLabels = await page.locator('.op-fill-tab').allTextContents()
    await page.locator('.op-fill-tab', { hasText: 'Gradient' }).click()
    const gradInfo = await page.evaluate(() => {
      const pop = document.querySelector('.op-cp-popover')
      const subOpts = Array.from(pop?.querySelectorAll('.op-cp-select option') ?? []).map((o) => o.value)
      const stops = pop?.querySelectorAll('.op-grad-stop').length ?? 0
      const removeDisabled = pop?.querySelector('.op-grad-stop button[title="Remove gradient stop"]')?.hasAttribute('disabled') ?? false
      return {
        hasGradientEdit: !!window.smokeEditor.state.gradientEdit,
        subOpts,
        stops,
        removeDisabled,
      }
    })
    await page.locator('button[title="Add gradient stop"]').click()
    const stopsAfterAdd = await page.locator('.op-grad-stop').count()
    await page.locator('.op-fill-tab', { hasText: 'Image' }).click()
    const imgInfo = await page.evaluate(() => {
      const pop = document.querySelector('.op-cp-popover')
      const modes = Array.from(pop?.querySelectorAll('.op-img-actions select option') ?? []).map((o) => o.value)
      const adjustments = pop?.querySelectorAll('.op-img-adj-row').length ?? 0
      return {
        modes,
        adjustments,
        hasRotate: !!pop?.querySelector('button[title="Rotate 90°"]'),
        hasChoose: !!pop?.querySelector('.op-img-actions .op-export-btn'),
      }
    })
    await page.keyboard.press('Escape')
    const gradEditCleared = await page.evaluate(() => window.smokeEditor.state.gradientEdit === null)
    check('Fill picker has Solid, Gradient, Image tabs and Gradient sets on-canvas gradientEdit + min 2 stops',
      tabLabels.map((t) => t.trim()).join(',') === 'Solid,Gradient,Image' &&
      gradInfo.hasGradientEdit &&
      gradInfo.subOpts.join(',') === 'GRADIENT_LINEAR,GRADIENT_RADIAL,GRADIENT_ANGULAR,GRADIENT_DIAMOND' &&
      gradInfo.stops === 2 &&
      gradInfo.removeDisabled &&
      stopsAfterAdd === 3 &&
      gradEditCleared,
      JSON.stringify({ tabLabels, gradInfo, stopsAfterAdd, gradEditCleared }))
    check('Image tab has Fill/Fit/Crop/Tile, Rotate 90°, Choose image, and 7 adjustments',
      imgInfo.modes.join(',') === 'FILL,FIT,CROP,TILE' &&
      imgInfo.adjustments === 7 &&
      imgInfo.hasRotate &&
      imgInfo.hasChoose,
      JSON.stringify(imgInfo))
    await page.keyboard.press(`${mod}+z`)
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
