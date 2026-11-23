import type { Editor } from '@open-pencil/core'
import { parseFigFile } from '@open-pencil/core/io/formats/fig'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import { IMPORTABLE_RASTER_TYPES, isSVGFile } from '@open-pencil/scene-graph/images'
import type { Notify } from './context'

function isFigFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.fig')
}

export function isSupportedDropFile(file: File): boolean {
  return IMPORTABLE_RASTER_TYPES.has(file.type) || isSVGFile(file) || isFigFile(file)
}

function fitPlacedNodesToViewport(editor: Editor, cx: number, cy: number): void {
  const vp = editor.getViewportSize()
  const maxW = (vp.width / editor.state.zoom) * 0.9
  const maxH = (vp.height / editor.state.zoom) * 0.9
  if (maxW <= 0 || maxH <= 0) return

  for (const node of editor.getSelectedNodes()) {
    if (node.width <= maxW && node.height <= maxH) continue
    const ratio = Math.min(maxW / node.width, maxH / node.height)
    const width = Math.max(1, Math.round(node.width * ratio))
    const height = Math.max(1, Math.round(node.height * ratio))
    const parent = node.parentId ? editor.graph.getNode(node.parentId) : null
    const parentPos = parent && parent.type !== 'CANVAS' ? editor.graph.getAbsolutePosition(parent.id) : { x: 0, y: 0 }
    editor.updateNodeWithUndo(
      node.id,
      {
        width,
        height,
        x: cx - parentPos.x - width / 2,
        y: cy - parentPos.y - height / 2,
      },
      'Fit placed image to viewport',
    )
  }
}

function cloneSubtreeInto(editor: Editor, source: SceneGraph, node: SceneNode, parentId: string): string {
  const clone = structuredClone(node) as Partial<SceneNode>
  delete clone.id
  delete clone.parentId
  delete clone.childIds
  const created = editor.graph.createNode(node.type, parentId, clone)
  for (const child of source.getChildren(node.id)) {
    cloneSubtreeInto(editor, source, child, created.id)
  }
  return created.id
}

async function placeFigFile(editor: Editor, file: File, cx: number, cy: number): Promise<void> {
  const buffer = await file.arrayBuffer()
  const figGraph = await parseFigFile(buffer, { populate: 'all' })
  const firstPage = figGraph.getPages()[0]
  if (!firstPage) return
  const roots = figGraph.getChildren(firstPage.id)
  if (roots.length === 0) return

  for (const [hash, bytes] of figGraph.images) {
    if (!editor.graph.images.has(hash)) editor.graph.images.set(hash, bytes)
  }

  const parent = editor.getSelectedNode()
  const parentId =
    parent && (parent.type === 'FRAME' || parent.type === 'COMPONENT' || parent.type === 'SECTION')
      ? parent.id
      : editor.state.currentPageId
  const parentPos = parentId !== editor.state.currentPageId ? editor.graph.getAbsolutePosition(parentId) : { x: 0, y: 0 }
  const created: string[] = []

  editor.undo.runBatch('Place .fig', () => {
    for (const root of roots) {
      const id = cloneSubtreeInto(editor, figGraph, root, parentId)
      const placed = editor.graph.getNode(id)
      if (placed) {
        editor.updateNodeWithUndo(id, {
          x: cx - parentPos.x - placed.width / 2,
          y: cy - parentPos.y - placed.height / 2,
        })
      }
      created.push(id)
    }
  })

  if (created.length > 0) {
    editor.select(created)
    editor.requestRender()
  }
}

/** Places dropped/picked image, SVG, or .fig files on the canvas at (cx, cy). */
export async function placeDroppedFiles(
  editor: Editor,
  files: File[],
  cx: number,
  cy: number,
  notify?: Notify | null,
): Promise<boolean> {
  if (files.length === 0) return false
  const unsupported = files.find((f) => !isSupportedDropFile(f))
  if (unsupported) {
    notify?.(`Unsupported file type: ${unsupported.name}`)
    return false
  }

  const hit = editor.hitTestAtPoint(cx, cy)
  if (hit) editor.select([hit.id])
  else editor.clearSelection()

  const figFiles = files.filter(isFigFile)
  const mediaFiles = files.filter((f) => !isFigFile(f))

  if (mediaFiles.length > 0) {
    await editor.placeFiles(mediaFiles, cx, cy)
    fitPlacedNodesToViewport(editor, cx, cy)
  }
  for (const fig of figFiles) {
    await placeFigFile(editor, fig, cx, cy)
  }
  return true
}
