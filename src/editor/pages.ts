import type { Editor } from '@open-pencil/core'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

interface NodeSnapshot {
  node: SceneNode
  children: NodeSnapshot[]
}

function snapshotSubtree(graph: SceneGraph, id: string): NodeSnapshot | null {
  const node = graph.getNode(id)
  if (!node) return null
  const clone = structuredClone(node)
  clone.childIds = []
  return {
    node: clone,
    children: graph.getChildren(id).map((child) => snapshotSubtree(graph, child.id)).filter((s): s is NodeSnapshot => s !== null),
  }
}

function restoreSubtree(graph: SceneGraph, snap: NodeSnapshot, parentId: string | null, index?: number): void {
  graph.createNodeWithId(snap.node.id, snap.node.type, parentId, snap.node)
  if (parentId !== null && index !== undefined) {
    graph.insertChildAt(snap.node.id, parentId, index)
  }
  for (const child of snap.children) {
    restoreSubtree(graph, child, snap.node.id)
  }
}

export function renamePageWithUndo(editor: Editor, pageId: string, name: string): void {
  const prevName = editor.graph.getNode(pageId)?.name
  if (prevName === undefined || prevName === name) return
  editor.renamePage(pageId, name)
  editor.undo.push({
    label: 'Rename page',
    forward: () => editor.renamePage(pageId, name),
    inverse: () => editor.renamePage(pageId, prevName),
  })
}

export function deletePageWithUndo(editor: Editor, pageId: string): void {
  const pages = editor.graph.getPages()
  if (pages.length <= 1) return
  const index = pages.findIndex((p) => p.id === pageId)
  if (index === -1) return
  const snap = snapshotSubtree(editor.graph, pageId)
  if (!snap) return
  const prevCurrentPageId = editor.state.currentPageId
  editor.deletePage(pageId)
  editor.undo.push({
    label: 'Delete page',
    forward: () => editor.deletePage(pageId),
    inverse: () => {
      restoreSubtree(editor.graph, snap, editor.graph.rootId, index)
      editor.switchPage(prevCurrentPageId)
    },
  })
}

export function movePageWithUndo(editor: Editor, pageId: string, toIndex: number): void {
  const pages = editor.graph.getPages()
  const fromIndex = pages.findIndex((p) => p.id === pageId)
  if (fromIndex === -1 || fromIndex === toIndex) return
  editor.movePage(pageId, toIndex)
  editor.undo.push({
    label: 'Reorder pages',
    forward: () => editor.movePage(pageId, toIndex),
    inverse: () => editor.movePage(pageId, fromIndex),
  })
}
