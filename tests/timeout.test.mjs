import test from 'node:test'
import assert from 'node:assert/strict'
import { withTimeout } from '../src/timeout.ts'

test('resolves with the promise value when it settles in time', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'late'), 7)
})

test('rejects with the message when the promise does not settle in time', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'the editor did not start'), /the editor did not start/)
})

test('passes through a rejection of the promise itself', async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 1000, 'late'), /boom/)
})
