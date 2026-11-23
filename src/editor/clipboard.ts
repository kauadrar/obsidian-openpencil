import type { ClipboardSnapshot, Editor } from '@open-pencil/core'
import { getCanvasKit } from '@open-pencil/core/canvaskit'
import { pngFormat } from '@open-pencil/core/io'
import { exportBounds, MAX_RASTER_PIXELS, oversizedRaster, rasterSize } from '@open-pencil/core/io/formats/raster'
import type { Vector } from '@open-pencil/scene-graph/primitives'
import type { Notify, WriteExport } from './context'

let lastCopied: ClipboardSnapshot | null = null
let lastProperties: ClipboardSnapshot | null = null

async function writeClipboard(html: string, plainText: string): Promise<void> {
  if (!navigator.clipboard) return
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ])
      return
    }
    await navigator.clipboard.writeText?.(plainText)
  } catch {
    // Clipboard permissions may be restricted; the in-memory snapshot fallback still works.
  }
}

async function readClipboardHTML(): Promise<string | null> {
  if (!navigator.clipboard?.read) return null
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const blob = await item.getType('text/html')
        return await blob.text()
      }
    }
  } catch {
    return null
  }
  return null
}

/** Copies the current selection (or only its style properties) to the system clipboard. */
export async function copySelection(editor: Editor, properties = false): Promise<boolean> {
  if (editor.state.selectedIds.size === 0) return false
  try {
    const payload = await editor.prepareCopy(properties ? { properties: true } : undefined)
    if (!payload.snapshot) return false
    if (properties) lastProperties = payload.snapshot
    else lastCopied = payload.snapshot
    void writeClipboard(payload.html, payload.plainText)
    return true
  } catch {
    return false
  }
}

/** Copies the current selection and deletes it in one undoable step. */
export async function cutSelection(editor: Editor): Promise<void> {
  if (editor.state.selectedIds.size === 0) return
  try {
    const payload = await editor.prepareCopy()
    if (payload.snapshot) {
      lastCopied = payload.snapshot
      void writeClipboard(payload.html, payload.plainText)
    }
  } catch {
    // Still delete the selection even if clipboard encoding fails.
  }
  editor.deleteSelected()
}

/** Pastes layers from the system clipboard (or in-memory fallback), optionally at a canvas point. */
export async function pasteSelection(editor: Editor, cursorPos?: Vector, replaceSelection = false): Promise<void> {
  const html = await readClipboardHTML()
  if (html) {
    await editor.pasteFromHTML(html, cursorPos, replaceSelection ? { replaceSelection: true } : undefined)
    return
  }
  if (lastCopied) {
    await editor.pasteSnapshot(lastCopied, cursorPos, replaceSelection ? { replaceSelection: true } : undefined)
  }
}

/** Pastes style properties onto the current selection. */
export async function pasteProperties(editor: Editor): Promise<void> {
  if (editor.state.selectedIds.size === 0) return
  const html = await readClipboardHTML()
  if (html) {
    const count = await editor.pastePropertiesFromHTML(html)
    if (count > 0) return
  }
  if (lastProperties) await editor.pastePropertiesFromSnapshot(lastProperties)
}

/** Copies the selected layers as SVG markup text to the system clipboard. */
export async function copySelectionAsSVG(editor: Editor, notify?: Notify): Promise<boolean> {
  const ids = [...editor.state.selectedIds]
  if (ids.length === 0) return false
  const svg = await editor.copySelectionAsSVG(ids)
  if (!svg) return false
  if (!navigator.clipboard?.writeText) {
    notify?.('Clipboard unavailable: could not copy SVG.')
    return false
  }
  try {
    await navigator.clipboard.writeText(svg)
    return true
  } catch {
    notify?.('Clipboard permission denied: could not copy SVG.')
    return false
  }
}

/** Copies the selected layers as a 2x PNG image (capped at MAX_RASTER_PIXELS) to the system clipboard. */
export async function copySelectionAsPNG(editor: Editor, notify?: Notify): Promise<boolean> {
  const ids = [...editor.state.selectedIds]
  if (ids.length === 0) return false
  const bounds = exportBounds(editor.graph, ids)
  if (!bounds) return false
  let scale = 2
  let scaledDown = false
  const size = rasterSize(bounds, scale)
  if (oversizedRaster(size.width, size.height)) {
    const area = Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY))
    scale = Math.max(0.01, Math.sqrt(MAX_RASTER_PIXELS / area) * 0.999)
    scaledDown = true
  }
  const target = ids.length === 1 ? { scope: 'node' as const, nodeId: ids[0]! } : { scope: 'selection' as const, nodeIds: ids }
  const result = await pngFormat.exportContent!(
    { graph: editor.graph, target },
    { scale },
    { canvasKit: await getCanvasKit(), renderer: editor.renderer ?? undefined },
  )
  const bytes = typeof result.data === 'string' ? new TextEncoder().encode(result.data) : result.data
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    notify?.('Clipboard unavailable: could not copy PNG.')
    return false
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes as BlobPart], { type: 'image/png' }) })])
    if (scaledDown) notify?.('Selection was scaled down to fit the PNG export limit.')
    return true
  } catch {
    notify?.('Clipboard permission denied: could not copy PNG.')
    return false
  }
}

/** Exports the selected layers as a 1x PNG using the host writer (or browser download). */
export async function exportSelection(editor: Editor, writeExport?: WriteExport | null, notify?: Notify | null): Promise<void> {
  const ids = [...editor.state.selectedIds]
  if (ids.length === 0) return
  const target = ids.length === 1 ? { scope: 'node' as const, nodeId: ids[0]! } : { scope: 'selection' as const, nodeIds: ids }
  const result = await pngFormat.exportContent!(
    { graph: editor.graph, target },
    { scale: 1 },
    { canvasKit: await getCanvasKit(), renderer: editor.renderer ?? undefined },
  )
  const data = typeof result.data === 'string' ? new TextEncoder().encode(result.data) : result.data
  const rawName = ids.length === 1 ? (editor.graph.getNode(ids[0]!)?.name ?? 'Export') : 'Selection'
  const fileName = `${rawName.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || 'Export'}.png`
  if (writeExport) {
    await writeExport(fileName, data)
    return
  }
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: result.mimeType }))
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  notify?.(`Exported ${fileName}`)
}
