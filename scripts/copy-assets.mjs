import { copyFileSync } from 'node:fs'
copyFileSync('manifest.json', 'dist/manifest.json')
copyFileSync('src/styles.css', 'dist/styles.css')
copyFileSync('build/editor/THIRD-PARTY-NOTICES.md', 'dist/THIRD-PARTY-NOTICES.md')
console.log('copied manifest.json, styles.css, THIRD-PARTY-NOTICES.md → dist/')
