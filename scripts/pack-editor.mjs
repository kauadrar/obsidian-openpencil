// Packs the Vite-built editor (build/editor) into one gzip payload embedded in main.js.
// Obsidian's plugin store installs only main.js, manifest.json and styles.css, so the editor's
// chunks, WASM and fonts travel inside main.js and are unpacked into the plugin folder on first use.
//
// Payload layout before gzip: [u32 LE header length][header JSON: [{ path, size }]][file bytes…]
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { checkEditorGraph } from './check-editor-graph.mjs'

const root = 'build/editor'

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(root).sort()
const header = []
const bodies = []
for (const file of files) {
  const bytes = readFileSync(file)
  header.push({ path: relative(root, file).split(sep).join('/'), size: bytes.length })
  bodies.push(bytes)
}
const headerBytes = Buffer.from(JSON.stringify(header))
const len = Buffer.alloc(4)
len.writeUInt32LE(headerBytes.length)
const raw = Buffer.concat([len, headerBytes, ...bodies])
const gz = gzipSync(raw, { level: 9 })
const id = createHash('sha256').update(raw).digest('hex').slice(0, 16)

mkdirSync('build', { recursive: true })
writeFileSync(
  'build/editor-payload.js',
  `export const PAYLOAD_ID = ${JSON.stringify(id)}\nexport const PAYLOAD = ${JSON.stringify(gz.toString('base64'))}\n`,
)
await checkEditorGraph(root) // throws, failing the build, on an import cycle
console.log(`packed ${files.length} files: ${(raw.length / 1e6).toFixed(1)} MB → ${(gz.length / 1e6).toFixed(1)} MB gzip (id ${id})`)
