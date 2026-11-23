import test from 'node:test'
import assert from 'node:assert/strict'
import { editorFailureText } from '../src/editor-failure.ts'

test('on Android the failure says the editor is blocked, not the raw module error', () => {
  const text = editorFailureText(new TypeError('Failed to fetch dynamically imported module: x.js'), '0.3.1', true)
  assert.match(text, /can't open designs on Android in this version/)
  assert.match(text, /desktop and iOS/)
  assert.doesNotMatch(text, /dynamically imported/)
})

test('elsewhere the failure keeps its detail', () => {
  assert.equal(
    editorFailureText(new Error('boom'), '0.3.1', false),
    'OpenPencil v0.3.1: failed to load editor assets — boom',
  )
})
