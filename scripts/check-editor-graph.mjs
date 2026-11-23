// Fails the build when the editor's static import graph has a cycle, since a cycle cannot load from blob URLs
// in order (src/android/blob-graph.ts). Uses the same reader as the runtime, bundled with esbuild.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { build } from 'esbuild'

let graphModule
async function graphApi() {
  if (!graphModule) {
    const out = await build({ entryPoints: ['src/android/blob-graph.ts'], bundle: true, format: 'esm', write: false, platform: 'neutral', logLevel: 'silent' })
    graphModule = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString('base64')}`)
  }
  return graphModule
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/** Throws if the chunks in `root` import each other in a cycle. Resolves to the number of chunks checked. */
export async function checkEditorGraph(root) {
  const { readImports, dependencyOrder } = await graphApi()
  const jsFiles = walk(root).filter((f) => f.endsWith('.js'))
  const known = new Set(jsFiles.map((f) => relative(root, f).split('\\').join('/')))
  const staticDeps = new Map()
  for (const f of jsFiles) {
    const path = relative(root, f).split('\\').join('/')
    staticDeps.set(path, readImports(readFileSync(f, 'utf8'), path).static.filter((p) => known.has(p)))
  }
  dependencyOrder(staticDeps)
  return staticDeps.size
}

// Run directly: check the built editor.
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const n = await checkEditorGraph(process.argv[2] ?? 'build/editor')
  console.log(`editor import graph: ${n} chunks, no cycles`)
}
