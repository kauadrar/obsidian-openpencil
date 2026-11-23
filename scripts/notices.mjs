// Collects the licenses of the code, WASM and fonts that main.js redistributes into
// build/editor/THIRD-PARTY-NOTICES.md (unpacked next to the editor) and dist/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const sources = [
  ['OpenPencil (@open-pencil/core and related packages)', 'node_modules/@open-pencil/core/LICENSE'],
  ['@open-pencil/mcp', 'node_modules/@open-pencil/mcp/LICENSE'],
  ['@open-pencil/vue', 'node_modules/@open-pencil/vue/LICENSE'],
  ['CanvasKit / Skia (canvaskit.wasm)', 'node_modules/@open-pencil/canvaskit/dist/THIRD-PARTY-NOTICES.md'],
  ['Taffy (taffy.wasm)', 'node_modules/@open-pencil/taffy/dist/THIRD-PARTY-NOTICES.md'],
  ['HarfBuzz (harfbuzzjs)', 'node_modules/harfbuzzjs/LICENSE'],
  ['@hpcc-js/wasm-zstd', 'node_modules/@hpcc-js/wasm-zstd/LICENSE'],
  ['Vue', 'node_modules/vue/LICENSE'],
  ['Inter font', 'node_modules/@open-pencil/core/assets/Inter-OFL.txt'],
  ['Caveat font', 'node_modules/@open-pencil/core/assets/Caveat-OFL.txt'],
  ['Noto Sans Symbols font', 'node_modules/@open-pencil/core/assets/NotoSansSymbols-OFL.txt'],
  ['OpenPencil Emoji Metrics font', 'node_modules/@open-pencil/core/assets/OpenPencilEmojiMetrics-OFL.txt'],
]

let out = '# Third-party notices\n\nThis plugin bundles the following software. Their licenses follow.\n'
for (const [name, file] of sources) {
  if (!existsSync(file)) throw new Error(`Missing license file for ${name}: ${file}`)
  out += `\n---\n\n## ${name}\n\n~~~~\n${readFileSync(file, 'utf8').trim()}\n~~~~\n`
}
mkdirSync('build/editor', { recursive: true })
writeFileSync('build/editor/THIRD-PARTY-NOTICES.md', out)
console.log(`wrote THIRD-PARTY-NOTICES.md (${sources.length} components)`)
