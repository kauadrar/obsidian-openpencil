import test from 'node:test'
import assert from 'node:assert/strict'
import { SHADOW_BLEND_MODES, showsBehindTransparent, supportedEffectOptions } from '../src/editor/effects.ts'

const sdkOptions = ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR', 'FOREGROUND_BLUR', 'NOISE', 'TEXTURE', 'GLASS']
  .map((value) => ({ value, label: value }))

test('the effect type select offers only drop shadow, inner shadow, layer blur and background blur', () => {
  assert.deepEqual(
    supportedEffectOptions(sdkOptions).map((o) => o.value),
    ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'],
  )
})

test('shadow blend modes include Normal and Multiply and no pass-through', () => {
  const values = SHADOW_BLEND_MODES.map((m) => m.value)
  assert.equal(values[0], 'NORMAL')
  assert.ok(values.includes('MULTIPLY'))
  assert.ok(!values.includes('PASS_THROUGH'))
})

test('"Show behind transparent areas" defaults to on, and is off only when set to false', () => {
  assert.equal(showsBehindTransparent({}), true)
  assert.equal(showsBehindTransparent({ showShadowBehindNode: true }), true)
  assert.equal(showsBehindTransparent({ showShadowBehindNode: false }), false)
})

import { displayEffectType } from '../src/editor/effects.ts'

test('a reopened layer blur (stored as FOREGROUND_BLUR) shows as Layer blur', () => {
  assert.equal(displayEffectType('FOREGROUND_BLUR'), 'LAYER_BLUR')
  assert.equal(displayEffectType('LAYER_BLUR'), 'LAYER_BLUR')
  assert.equal(displayEffectType('DROP_SHADOW'), 'DROP_SHADOW')
})
