import test from 'node:test'
import assert from 'node:assert/strict'
import { isEmojiSet, setPrefixOf } from '../src/editor/icon-sets.ts'

test('a set in Iconify\'s Emoji category is an emoji set; design and flag sets are not', () => {
  assert.equal(isEmojiSet('twemoji', 'Emoji'), true)
  assert.equal(isEmojiSet('whatever', 'emoji'), true)
  assert.equal(isEmojiSet('mdi', 'UI 24px'), false)
  assert.equal(isEmojiSet('flagpack', 'Flags'), false)
})

test('without a category, known emoji prefixes are still emoji sets', () => {
  assert.equal(isEmojiSet('noto'), true)
  assert.equal(isEmojiSet('openmoji', null), true)
  assert.equal(isEmojiSet('fluent-emoji-flat', undefined), true)
  assert.equal(isEmojiSet('lucide'), false)
})

test('setPrefixOf reads the set part of an icon name', () => {
  assert.equal(setPrefixOf('ic:baseline-star'), 'ic')
  assert.equal(setPrefixOf('twemoji:star'), 'twemoji')
})
