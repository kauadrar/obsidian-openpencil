import test from 'node:test'
import assert from 'node:assert/strict'
import { MOBILE_RESTRICTIONS, MOBILE_TOOLS } from '../src/editor/mobile-policy.ts'

test('mobile offers only select and hand', () => {
  assert.deepEqual([...MOBILE_TOOLS].sort(), ['HAND', 'SELECT'])
})

test('mobile fixes layers in place and edits path handles only', () => {
  assert.equal(MOBILE_RESTRICTIONS.layerEdits, 'none')
  assert.equal(MOBILE_RESTRICTIONS.pathEdits, 'handles')
})

import { isBlockedOnMobile } from '../src/editor/mobile-policy.ts'

test('mobile blocks creating and editing commands, including new design and place', () => {
  for (const id of ['new-design', 'app.place', 'app.copyAsSVG', 'app.copyAsPNG', 'app.copyProperties', 'app.pasteProperties']) {
    assert.equal(isBlockedOnMobile(id), true, id)
  }
})

test('mobile blocks save as .fig, since mobile never writes files', () => {
  assert.equal(isBlockedOnMobile('save-as-fig'), true)
})
