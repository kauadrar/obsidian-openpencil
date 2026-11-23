import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { openPencil } from '@open-pencil/core/node/vite'

// Builds the editor as an ES module (dist/editor/editor.js) plus its WASM/font assets.
// Obsidian's main.js loads it with a dynamic import() from the plugin folder, so every
// `new URL('./x.wasm', import.meta.url)` inside OpenPencil resolves next to the bundle.
export default defineConfig({
  base: './',
  plugins: [vue(), openPencil({ inject: false })],
  resolve: {
    alias: {
      '#mcp': fileURLToPath(new URL('./node_modules/@open-pencil/mcp/src', import.meta.url)),
    },
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'build/editor',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    minify: true,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: {
      input: { editor: 'src/editor/index.ts' },
      preserveEntrySignatures: 'exports-only',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: { format: 'es' },
})
