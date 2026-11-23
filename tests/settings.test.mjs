import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings.ts'

test('Iconify import is on by default and kept when saved as a boolean', () => {
  assert.equal(DEFAULT_SETTINGS.iconifyImport, true)
  assert.equal(sanitizeSettings({}).iconifyImport, true)
  assert.equal(sanitizeSettings({ iconifyImport: false }).iconifyImport, false)
  assert.equal(sanitizeSettings({ iconifyImport: 'no' }).iconifyImport, true)
})
