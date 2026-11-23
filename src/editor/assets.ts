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
