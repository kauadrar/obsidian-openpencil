import test from 'node:test'
import assert from 'node:assert/strict'
import { fontSourceBadge } from '../src/editor/font-badges.ts'

test('font sources show the spec badges', () => {
  assert.equal(fontSourceBadge('bundled'), 'BUNDLED')
  assert.equal(fontSourceBadge('local'), 'system')
  assert.equal(fontSourceBadge('google'), 'GOOGLE')
  assert.equal(fontSourceBadge('fontsource'), 'FONTSOURCE')
})

test('an unknown source shows in capitals rather than failing', () => {
  assert.equal(fontSourceBadge('fallback'), 'FALLBACK')
})
