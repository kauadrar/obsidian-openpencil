import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseCheckboxFocus } from '../src/editor/focus.ts'

test('a changed checkbox loses focus, so editor shortcuts are not taken as typing', () => {
  let blurred = 0
  const checkbox = { type: 'checkbox', blur: () => blurred++ }
  releaseCheckboxFocus({ target: checkbox })
  assert.equal(blurred, 1)
})

test('other controls keep their focus', () => {
  let blurred = 0
  releaseCheckboxFocus({ target: { type: 'text', blur: () => blurred++ } })
  releaseCheckboxFocus({ target: null })
  assert.equal(blurred, 0)
})
