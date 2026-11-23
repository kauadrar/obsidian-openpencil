import test from 'node:test'
import assert from 'node:assert/strict'
import { dependencyOrder, opUrl, readImports, resolveRelative, rewriteChunk } from '../src/android/blob-graph.ts'

test('relative specifiers resolve against the importing chunk', () => {
  assert.equal(resolveRelative('chunks/a.js', './b.js'), 'chunks/b.js')
  assert.equal(resolveRelative('chunks/a.js', '../assets/x.wasm'), 'assets/x.wasm')
  assert.equal(resolveRelative('editor.js', './chunks/c.js'), 'chunks/c.js')
})

test('readImports finds static and dynamic relative imports, not bare packages', () => {
  const src = 'import{a as b}from"./sizing.js";import"./side.js";export{x}from"../assets/y.js";' +
    'const m=import("./chunks/lazy.js");import(`./chunks/tmpl.js`);import("node:fs");import("react")'
  const r = readImports(src, 'editor.js')
  assert.deepEqual(r.static.sort(), ['assets/y.js', 'side.js', 'sizing.js'].sort())
  assert.deepEqual(r.dynamic.sort(), ['chunks/lazy.js', 'chunks/tmpl.js'].sort())
})

test('dependencyOrder puts each chunk after its static imports', () => {
  const deps = new Map([
    ['editor.js', ['chunks/a.js', 'chunks/b.js']],
    ['chunks/a.js', ['chunks/c.js']],
    ['chunks/b.js', ['chunks/c.js']],
    ['chunks/c.js', []],
  ])
  const order = dependencyOrder(deps)
  for (const [path, needs] of deps) for (const n of needs) assert.ok(order.indexOf(n) < order.indexOf(path), `${n} before ${path}`)
  assert.equal(order.length, 4)
})

test('dependencyOrder throws on a cycle and names the chunks in it', () => {
  const deps = new Map([['chunks/a.js', ['chunks/b.js']], ['chunks/b.js', ['chunks/a.js']]])
  assert.throws(() => dependencyOrder(deps), /Import cycle between editor chunks: chunks\/[ab]\.js → chunks\/[ab]\.js → chunks\/[ab]\.js/)
})

test('rewriteChunk points static imports at blob URLs and maps import.meta.url to the chunk', () => {
  const rw = { blobUrlOf: (p) => `blob:${p}` }
  const out = rewriteChunk('import{a}from"./dep.js";const u=new URL("../assets/x.wasm",import.meta.url);', 'chunks/main.js', rw)
  assert.match(out, /import\{a\}from"blob:chunks\/dep\.js"/)
  assert.match(out, new RegExp(`new URL\\("\\.\\./assets/x\\.wasm",${JSON.stringify(opUrl('chunks/main.js')).replace(/[/]/g, '\\/')}\\)`))
  assert.doesNotMatch(out, /import\.meta/)
})

test('rewriteChunk maps literal dynamic imports to op-blob URLs and wraps the rest', () => {
  const rw = { blobUrlOf: () => 'blob:x' }
  const out = rewriteChunk('const a=import("./chunks/lazy.js");const b=import(name);const c=import.meta.resolve("pkg");', 'editor.js', rw)
  assert.ok(out.includes(`__opImport(${JSON.stringify(opUrl('chunks/lazy.js'))})`))
  assert.ok(out.includes('__opImport(name)'))
  assert.ok(out.includes('__opMetaResolve("op-blob:/editor.js", "pkg")'))
  assert.doesNotMatch(out, /[^.\w$]import\(/)
})

test('the chunk URL form resolves inside the editor under a custom scheme', () => {
  assert.equal(new URL('../assets/worker.js', opUrl('chunks/layers.js')).href, 'op-blob:/assets/worker.js')
  assert.equal(new URL('./dist.js', opUrl('editor.js')).href, 'op-blob:/dist.js')
})
