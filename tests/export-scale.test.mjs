import test from 'node:test'
import assert from 'node:assert/strict'
import { exportScaleLabel, parseExportScale } from '../src/editor/export-scale.ts'

test('a typed scale parses with or without the x, and with a decimal comma', () => {
  assert.equal(parseExportScale('1.5x'), 1.5)
  assert.equal(parseExportScale('2'), 2)
  assert.equal(parseExportScale(' 3 X '), 3)
  assert.equal(parseExportScale('1,5'), 1.5)
  assert.equal(parseExportScale('.75'), 0.75)
})

test('out-of-range scales clamp to 0.01–1024', () => {
  assert.equal(parseExportScale('0'), 0.01)
  assert.equal(parseExportScale('0.0'), 0.01)
  assert.equal(parseExportScale('0.001'), 0.01)
  assert.equal(parseExportScale('5000x'), 1024)
})

test('text that is not a scale reverts (null)', () => {
  assert.equal(parseExportScale(''), null)
  assert.equal(parseExportScale('abc'), null)
  assert.equal(parseExportScale('0'), 0.01)
  assert.equal(parseExportScale('-2'), null)
  assert.equal(parseExportScale('1.5px'), null)
})

test('labels read as 1.5x', () => {
  assert.equal(exportScaleLabel(1.5), '1.5x')
})
