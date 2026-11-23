// Pure helpers for the Assets tab: which local components a page lists, and how they group and
// filter. No imports, so the node test runner can load this file directly.

/** The drag payload a canvas drop reads to place an instance of the dragged component. */
export const COMPONENT_DRAG_TYPE = 'application/x-openpencil-component'

export interface AssetNodeLike {
  id: string
  name: string
  type: string
  childIds?: readonly string[]
}

export interface AssetComponent {
  id: string
  name: string
}

export interface AssetGroup {
  pageId: string
  pageName: string
  components: AssetComponent[]
}

/** Every component under a page's tree, in document order. Component sets and their variants count as components. */
export function collectComponents(
  rootIds: readonly string[],
  lookup: (id: string) => AssetNodeLike | undefined,
): AssetComponent[] {
  const out: AssetComponent[] = []
  const walk = (id: string) => {
    const node = lookup(id)
    if (!node) return
    if (node.type === 'COMPONENT') out.push({ id: node.id, name: node.name })
    for (const child of node.childIds ?? []) walk(child)
  }
  for (const id of rootIds) walk(id)
  return out
}

/**
 * Groups components by page in page order. A case-insensitive name search keeps matching components;
 * pages left empty are dropped, so clearing the search brings every page back.
 */
export function groupAssets(
  pages: readonly { id: string; name: string; components: readonly AssetComponent[] }[],
  search: string,
): AssetGroup[] {
  const query = search.trim().toLowerCase()
  const groups: AssetGroup[] = []
  for (const page of pages) {
    const components = page.components.filter((c) => !query || c.name.toLowerCase().includes(query))
    if (components.length) groups.push({ pageId: page.id, pageName: page.name, components: [...components] })
  }
  return groups
}

/** Scale that fits a node's longer side to `maxSide` pixels. A zero-size node renders at 1x. */
export function thumbnailScale(width: number, height: number, maxSide: number): number {
  const longest = Math.max(width, height)
  return longest > 0 ? maxSide / longest : 1
}

/**
 * A string that changes whenever anything that affects how a component renders changes: its own
 * size, paints and effects, visibility, and its whole subtree. A cached thumbnail is valid while this
 * stays the same.
 */
export function subtreeSignature(
  rootId: string,
  lookup: (id: string) => RenderableNodeLike | undefined,
): string {
  const parts: string[] = []
  const walk = (id: string) => {
    const node = lookup(id)
    if (!node) return
    parts.push(
      JSON.stringify([node.id, node.type, node.width, node.height, node.visible, node.fills, node.strokes, node.effects, node.cornerRadius, node.opacity]),
    )
    for (const child of node.childIds ?? []) walk(child)
  }
  walk(rootId)
  return parts.join('|')
}

/** The node fields that decide how a component is drawn. */
export interface RenderableNodeLike extends AssetNodeLike {
  width?: number
  height?: number
  visible?: boolean
  fills?: unknown
  strokes?: unknown
  effects?: unknown
  cornerRadius?: number
  opacity?: number
}
