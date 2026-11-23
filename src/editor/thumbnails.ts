// Real thumbnails for Assets rows. Each component is rendered with the same PNG export that Copy as PNG
// uses (pngFormat.exportContent on a node target), scaled to the row size, and kept as an object URL.
// A cache per editor is reused while the component's render signature is unchanged.
import type { Editor } from '@open-pencil/core'
import { getCanvasKit } from '@open-pencil/core/canvaskit'
import { pngFormat } from '@open-pencil/core/io'
import { subtreeSignature, thumbnailScale, type RenderableNodeLike } from './assets'

/** Longer side in CSS pixels of a row thumbnail. Rendered at 2x for sharpness. */
export const THUMB_SIDE = 56

interface Entry {
  signature: string
  url: string | null
}

const caches = new WeakMap<Editor, Map<string, Entry>>()
const inflight = new WeakMap<Editor, Map<string, string>>()

function cacheOf(editor: Editor): Map<string, Entry> {
  let cache = caches.get(editor)
  if (!cache) {
    cache = new Map()
    caches.set(editor, cache)
  }
  return cache
}

function inflightOf(editor: Editor): Map<string, string> {
  let map = inflight.get(editor)
  if (!map) {
    map = new Map()
    inflight.set(editor, map)
  }
  return map
}

/** The cached thumbnail URL for a component, or null when none is rendered (yet or at all). */
export function cachedThumbnail(editor: Editor, componentId: string): string | null {
  return cacheOf(editor).get(componentId)?.url ?? null
}

function lookupFor(editor: Editor) {
  return (id: string) => editor.graph.getNode(id) as unknown as RenderableNodeLike | undefined
}

/**
 * Renders a component's thumbnail if its cached one is missing or out of date. Calls `onReady` when a
 * new one is stored, so the list can show it. A component that fails to render keeps no URL, and the
 * row falls back to its schematic.
 */
export async function requestThumbnail(editor: Editor, componentId: string, onReady: () => void): Promise<void> {
  const signature = subtreeSignature(componentId, lookupFor(editor))
  const cache = cacheOf(editor)
  const current = cache.get(componentId)
  if (current?.signature === signature) return
  const pending = inflightOf(editor)
  if (pending.get(componentId) === signature) return
  pending.set(componentId, signature)

  let url: string | null = null
  try {
    const node = editor.graph.getNode(componentId)
    if (node) {
      const scale = thumbnailScale(node.width, node.height, THUMB_SIDE) * 2
      const result = await pngFormat.exportContent!(
        { graph: editor.graph, target: { scope: 'node', nodeId: componentId } },
        { scale },
        { canvasKit: await getCanvasKit(), renderer: editor.renderer ?? undefined },
      )
      const bytes = typeof result.data === 'string' ? new TextEncoder().encode(result.data) : result.data
      if (bytes.byteLength > 0) url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }))
    }
  } catch (e) {
    console.warn('[openpencil] thumbnail render failed', componentId, e)
  } finally {
    if (pending.get(componentId) === signature) pending.delete(componentId)
  }

  // The component may have changed while it rendered; a stale result is dropped.
  const latest = subtreeSignature(componentId, lookupFor(editor))
  if (latest !== signature) {
    if (url) URL.revokeObjectURL(url)
    return
  }
  const previous = cache.get(componentId)?.url
  if (previous) URL.revokeObjectURL(previous)
  cache.set(componentId, { signature, url })
  onReady()
}
