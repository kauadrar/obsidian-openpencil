import test from 'node:test'
import assert from 'node:assert/strict'
import { readEditorFiles } from '../src/android/editor-files.ts'

// A fake of Obsidian's adapter over an in-memory tree; paths are vault-relative, as Obsidian's are.
function fakeAdapter(tree) {
  return {
    async list(dir) {
      const node = tree[dir]
      if (!node) throw new Error(`no folder ${dir}`)
      return { files: node.files ?? [], folders: node.folders ?? [] }
    },
    async read(path) {
      return tree.text[path]
    },
    async readBinary(path) {
      return Uint8Array.from(tree.bin[path]).buffer
    },
  }
}

test('reads every file under the editor folder, chunks as text and the rest as bytes', async () => {
  const adapter = fakeAdapter({
    'p/editor': { files: ['p/editor/editor.js'], folders: ['p/editor/chunks', 'p/editor/assets'] },
    'p/editor/chunks': { files: ['p/editor/chunks/a.js'] },
    'p/editor/assets': { files: ['p/editor/assets/x.wasm'] },
    text: { 'p/editor/editor.js': 'export {}', 'p/editor/chunks/a.js': 'export const a=1' },
    bin: { 'p/editor/assets/x.wasm': [0, 97, 115, 109] },
  })
  const files = await readEditorFiles(adapter, 'p/editor')
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
  assert.equal(byPath['editor.js'].text, 'export {}')
  assert.equal(byPath['chunks/a.js'].text, 'export const a=1')
  assert.deepEqual([...byPath['assets/x.wasm'].bytes], [0, 97, 115, 109])
  assert.equal(files.length, 3)
})
