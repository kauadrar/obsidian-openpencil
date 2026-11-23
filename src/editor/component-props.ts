// Pure helpers for the component property UI. No imports, so the node test runner can load this file.

export type PropertyKind = 'TEXT' | 'BOOLEAN' | 'INSTANCE_SWAP'

/** The types the + button adds on a main component (variant and slot authoring are out of scope). */
export const ADDABLE_PROPERTIES: readonly { type: PropertyKind; label: string; name: string; defaultValue: string }[] = [
  { type: 'TEXT', label: 'Text', name: 'Text', defaultValue: 'Text' },
  { type: 'BOOLEAN', label: 'Boolean', name: 'Boolean', defaultValue: 'true' },
  { type: 'INSTANCE_SWAP', label: 'Instance swap', name: 'Instance', defaultValue: '' },
]

/** Boolean property values are stored as the strings "true" and "false". */
export function booleanToValue(checked: boolean): string {
  return checked ? 'true' : 'false'
}

export function valueToBoolean(value: string): boolean {
  return value === 'true'
}

/** Keeps only the property rows; variant rows belong to variant authoring, which this spec defers. */
export function propertyRowsOnly<R extends { kind: string }>(rows: readonly R[]): (R & { kind: 'property' })[] {
  return rows.filter((r): r is R & { kind: 'property' } => r.kind === 'property')
}

/** Override controls split into the ones shown as "Component properties" and the variant selects. */
export function splitOverrideControls<C extends { type: string }>(controls: readonly C[]): { properties: C[]; variants: C[] } {
  return {
    properties: controls.filter((c) => c.type !== 'VARIANT'),
    variants: controls.filter((c) => c.type === 'VARIANT'),
  }
}
