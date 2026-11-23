// Pure helpers for the variable pickers and the page Variables section. No imports, so the node
// test runner can load this file directly.

export interface CollectionLike {
  id: string
  name: string
  variableIds: string[]
}

export interface VariableLike {
  id: string
  name: string
  type: string
}

export interface VariableGroup<V extends VariableLike> {
  collectionId: string
  name: string
  variables: V[]
}

/**
 * Variables of the given types, filtered by a case-insensitive name search, grouped by collection in
 * collection order. Collections with no match are dropped.
 */
export function groupVariables<V extends VariableLike>(
  collections: readonly CollectionLike[],
  lookup: (id: string) => V | undefined,
  search: string,
  types: readonly string[],
): VariableGroup<V>[] {
  const query = search.trim().toLowerCase()
  const groups: VariableGroup<V>[] = []
  for (const collection of collections) {
    const variables: V[] = []
    for (const id of collection.variableIds) {
      const v = lookup(id)
      if (!v || !types.includes(v.type)) continue
      if (query && !v.name.toLowerCase().includes(query)) continue
      variables.push(v)
    }
    if (variables.length) groups.push({ collectionId: collection.id, name: collection.name, variables })
  }
  return groups
}

/** Each collection with the number of variables that still resolve, for the page Variables list. */
export function summarizeCollections(
  collections: readonly CollectionLike[],
  lookup: (id: string) => VariableLike | undefined,
): { id: string; name: string; count: number }[] {
  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    count: c.variableIds.filter((id) => lookup(id) !== undefined).length,
  }))
}
