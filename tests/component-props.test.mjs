import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADDABLE_PROPERTIES,
  booleanToValue,
  propertyRowsOnly,
  splitOverrideControls,
  valueToBoolean,
} from '../src/editor/component-props.ts'

test('the + menu offers Text, Boolean and Instance swap, in that order', () => {
  assert.deepEqual(ADDABLE_PROPERTIES.map((p) => p.type), ['TEXT', 'BOOLEAN', 'INSTANCE_SWAP'])
  assert.equal(ADDABLE_PROPERTIES[1].defaultValue, 'true')
})

test('boolean values round-trip as "true" and "false"', () => {
  assert.equal(booleanToValue(true), 'true')
  assert.equal(booleanToValue(false), 'false')
  assert.equal(valueToBoolean('true'), true)
  assert.equal(valueToBoolean('false'), false)
  assert.equal(valueToBoolean(''), false)
})

test('propertyRowsOnly drops variant rows', () => {
  const rows = [
    { kind: 'variant', id: 'v1' },
    { kind: 'property', id: 'p1' },
    { kind: 'property', id: 'p2' },
  ]
  assert.deepEqual(propertyRowsOnly(rows).map((r) => r.id), ['p1', 'p2'])
})

test('splitOverrideControls separates variant selects from the property controls', () => {
  const controls = [
    { id: 'a', type: 'TEXT' },
    { id: 'b', type: 'VARIANT' },
    { id: 'c', type: 'BOOLEAN' },
  ]
  const { properties, variants } = splitOverrideControls(controls)
  assert.deepEqual(properties.map((c) => c.id), ['a', 'c'])
  assert.deepEqual(variants.map((c) => c.id), ['b'])
})

import { subtreeIds, swapDefaultFor } from '../src/editor/component-props.ts'

test('subtreeIds includes the root and every descendant', () => {
  const nodes = new Map([
    ['root', { childIds: ['a', 'b'] }],
    ['a', { childIds: ['c'] }],
    ['b', { childIds: [] }],
    ['c', { childIds: [] }],
  ])
  assert.deepEqual([...subtreeIds('root', (id) => nodes.get(id))].sort(), ['a', 'b', 'c', 'root'])
})

test('swapDefaultFor picks a component outside the owner, never the owner or its contents', () => {
  const nodes = [
    { id: 'owner', type: 'COMPONENT' },
    { id: 'inner', type: 'COMPONENT' },
    { id: 'frame', type: 'FRAME' },
    { id: 'other', type: 'COMPONENT' },
  ]
  assert.equal(swapDefaultFor(nodes, new Set(['owner', 'inner'])), 'other')
})

test('swapDefaultFor returns null when the file has no other component', () => {
  const nodes = [{ id: 'owner', type: 'COMPONENT' }, { id: 'f', type: 'FRAME' }]
  assert.equal(swapDefaultFor(nodes, new Set(['owner'])), null)
})
