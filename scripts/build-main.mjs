// Bundles the Obsidian-facing plugin (src/main.ts) as CommonJS, the format Obsidian requires.
// It imports build/editor-payload.js, the packed editor that scripts/pack-editor.mjs writes.
import { rmSync } from 'node:fs'
import { build } from 'esbuild'
rmSync('dist', { recursive: true, force: true })
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/main.js',
  external: ['obsidian', 'electron', '@codemirror/state', '@codemirror/view'],
  legalComments: 'none',
  logLevel: 'info',
})
