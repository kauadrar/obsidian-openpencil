import test from 'node:test'
import assert from 'node:assert/strict'
import { collectComponents, groupAssets } from '../src/editor/assets.ts'

const nodes = new Map([
  ['p1', { id: 'p1', name: 'Page 1', type: 'CANVAS', childIds: ['f1', 'r1', 'c1'] }],
  ['f1', { id: 'f1', name: 'Frame', type: 'FRAME', childIds: ['c2'] }],
  ['c1', { id: 'c1', name: 'Button', type: 'COMPONENT', childIds: [] }],
  ['c2', { id: 'c2', name: 'Card', type: 'COMPONENT', childIds: ['r2'] }],
  ['r2', { id: 'r2', name: 'Button Icon', type: 'COMPONENT', childIds: [] }],
  ['r1', { id: 'r1', name: 'Rect', type: 'RECTANGLE', childIds: [] }],
])
const lookup = (id) => nodes.get(id)

test('collectComponents walks the page tree in document order and keeps only components', () => {
  assert.deepEqual(collectComponents(['f1', 'c1'], lookup), [
    { id: 'c2', name: 'Card' },
    { id: 'r2', name: 'Button Icon' },
    { id: 'c1', name: 'Button' },
  ])
})

test('collectComponents on an empty page returns nothing', () => {
  assert.deepEqual(collectComponents(['r1'], lookup), [])
})

const pages = [
  { id: 'p1', name: 'Page 1', components: [{ id: 'c1', name: 'Button' }, { id: 'c2', name: 'Card' }] },
  { id: 'p2', name: 'Page 2', components: [] },
  { id: 'p3', name: 'Icons', components: [{ id: 'i1', name: 'Button Icon' }] },
]

test('groupAssets lists every page that has components, in page order', () => {
  assert.deepEqual(groupAssets(pages, '').map((g) => [g.pageName, g.components.length]), [
    ['Page 1', 2],
    ['Icons', 1],
  ])
})

test('groupAssets filters by a case-insensitive name search across pages', () => {
  const groups = groupAssets(pages, '  BUTTON ')
  assert.deepEqual(groups.map((g) => [g.pageName, g.components.map((c) => c.name)]), [
    ['Page 1', ['Button']],
    ['Icons', ['Button Icon']],
  ])
})

test('groupAssets returns no groups for an empty result, and all groups again when cleared', () => {
  assert.deepEqual(groupAssets(pages, 'zzz'), [])
  assert.equal(groupAssets(pages, '').length, 2)
})
