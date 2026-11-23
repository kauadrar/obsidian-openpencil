import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkEditorGraph } from '../scripts/check-editor-graph.mjs'

function folder(files) {
  const root = mkdtempSync(join(tmpdir(), 'editor-graph-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

test('an acyclic editor folder passes the check', async () => {
  const root = folder({
    'editor.js': 'import{a}from"./chunks/a.js";',
    'chunks/a.js': 'import{b}from"./b.js";export const a=b;',
    'chunks/b.js': 'export const b=1;',
  })
  assert.equal(await checkEditorGraph(root), 3)
})

test('a cycle between chunks fails the check, naming the chunks', async () => {
  const root = folder({
    'editor.js': 'import"./chunks/a.js";',
    'chunks/a.js': 'import{y}from"./b.js";export const x=1;',
    'chunks/b.js': 'import{x}from"./a.js";export const y=2;',
  })
  await assert.rejects(checkEditorGraph(root), /Import cycle between editor chunks: chunks\/[ab]\.js → chunks\/[ab]\.js/)
})
