import test from 'node:test'
import assert from 'node:assert/strict'
import { editorFailureText } from '../src/editor-failure.ts'

test('on Android the failure notice says so and keeps the error detail', () => {
  assert.equal(
    editorFailureText(new TypeError('Failed to fetch dynamically imported module: x.js'), '0.3.2', true),
    'OpenPencil v0.3.2: failed to load editor assets on Android — Failed to fetch dynamically imported module: x.js',
  )
})

test('elsewhere the failure keeps its detail', () => {
  assert.equal(
    editorFailureText(new Error('boom'), '0.3.2', false),
    'OpenPencil v0.3.2: failed to load editor assets — boom',
  )
})
