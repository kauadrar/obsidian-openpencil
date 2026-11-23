import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FRAME_PRESET_CATEGORIES,
  FRAME_PRESETS,
  FRAME_RESIZE_PRESET_CATEGORIES,
  FRAME_RESIZE_PRESETS,
  findFrameResizePreset,
} from '../src/editor/frame-presets.ts'

test('the nine categories are listed in desktop order, starting with Phone', () => {
  assert.deepEqual(
    FRAME_PRESET_CATEGORIES.map((c) => c.label),
    ['Phone', 'Tablet', 'Desktop', 'Presentation', 'Watch', 'Paper', 'Social media', 'Figma Community', 'Archive'],
  )
  assert.equal(FRAME_PRESETS.length, FRAME_PRESET_CATEGORIES.reduce((n, c) => n + c.presets.length, 0))
})

test('the resize select drops presets whose W×H repeats an earlier one', () => {
  const sizes = FRAME_RESIZE_PRESETS.map((p) => `${p.width}x${p.height}`)
  assert.equal(new Set(sizes).size, sizes.length)
  // iPhone 17 (402×874) comes first, so "iPhone 16 & 17 Pro" with the same size is dropped.
  assert.ok(FRAME_RESIZE_PRESETS.some((p) => p.name === 'iPhone 17'))
  assert.ok(!FRAME_RESIZE_PRESETS.some((p) => p.name === 'iPhone 16 & 17 Pro'))
  assert.ok(FRAME_RESIZE_PRESET_CATEGORIES.every((c) => c.presets.length > 0))
})

test('a frame of a preset size shows that preset, by name when several share the size', () => {
  // Desktop and Wireframe share 1440×1024; Wireframe is de-duplicated out of the resize list, so Desktop shows.
  assert.equal(findFrameResizePreset(1440, 1024, 'Wireframe')?.name, 'Desktop')
  assert.equal(findFrameResizePreset(1920, 1080, 'Slide 16:9')?.name, 'Slide 16:9')
  assert.equal(findFrameResizePreset(1920, 1080, 'Unrelated')?.name, 'Slide 16:9')
})

test('a frame whose size matches no preset is Custom', () => {
  assert.equal(findFrameResizePreset(123, 456, 'Frame'), undefined)
})

test('A4 is 595 × 842 and the Phone category opens with iPhone 17', () => {
  assert.deepEqual(
    FRAME_PRESETS.find((p) => p.name === 'A4'),
    { id: 'a4', name: 'A4', width: 595, height: 842 },
  )
  assert.equal(FRAME_PRESET_CATEGORIES[0].presets[0].name, 'iPhone 17')
})
