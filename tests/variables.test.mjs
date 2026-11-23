import test from 'node:test'
import assert from 'node:assert/strict'
import { groupVariables, summarizeCollections } from '../src/editor/variables.ts'

const vars = new Map([
  ['v1', { id: 'v1', name: 'Gap Small', type: 'FLOAT' }],
  ['v2', { id: 'v2', name: 'Brand Blue', type: 'COLOR' }],
  ['v3', { id: 'v3', name: 'gap large', type: 'FLOAT' }],
  ['v4', { id: 'v4', name: 'Orphan', type: 'FLOAT' }],
])
const lookup = (id) => vars.get(id)
const collections = [
  { id: 'c1', name: 'Spacing', variableIds: ['v1', 'v3', 'missing'] },
  { id: 'c2', name: 'Colors', variableIds: ['v2'] },
  { id: 'c3', name: 'Empty', variableIds: [] },
]

test('groupVariables keeps only the requested types, grouped by collection', () => {
  const groups = groupVariables(collections, lookup, '', ['FLOAT'])
  assert.deepEqual(
    groups.map((g) => [g.collectionId, g.variables.map((v) => v.id)]),
    [['c1', ['v1', 'v3']]],
  )
})

test('groupVariables filters by case-insensitive name and drops empty groups', () => {
  const groups = groupVariables(collections, lookup, '  GAP ', ['FLOAT', 'COLOR'])
  assert.deepEqual(groups.map((g) => g.name), ['Spacing'])
  assert.deepEqual(groups[0].variables.map((v) => v.name), ['Gap Small', 'gap large'])
  assert.deepEqual(groupVariables(collections, lookup, 'nothing', ['FLOAT']), [])
})

test('groupVariables lists colour variables for a colour picker', () => {
  const groups = groupVariables(collections, lookup, '', ['COLOR'])
  assert.deepEqual(groups.map((g) => [g.name, g.variables.map((v) => v.name)]), [['Colors', ['Brand Blue']]])
})

test('summarizeCollections counts only variables that resolve', () => {
  assert.deepEqual(summarizeCollections(collections, lookup), [
    { id: 'c1', name: 'Spacing', count: 2 },
    { id: 'c2', name: 'Colors', count: 1 },
    { id: 'c3', name: 'Empty', count: 0 },
  ])
})
