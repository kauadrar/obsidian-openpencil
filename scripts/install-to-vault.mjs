// Usage: npm run install-to-vault -- "/path/to/your/vault"
// Copies dist/ into <vault>/.obsidian/plugins/openpencil-editor (replacing an older copy).
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const vault = process.argv[2]
if (!vault) {
  console.error('Usage: npm run install-to-vault -- "/path/to/your/vault"')
  process.exit(1)
}
if (!existsSync(join(vault, '.obsidian'))) {
  console.error(`${vault} has no .obsidian folder — is it an Obsidian vault?`)
  process.exit(1)
}
if (!existsSync('dist/main.js')) {
  console.error('dist/ is missing: run npm run build first.')
  process.exit(1)
}
const target = resolve(vault, '.obsidian/plugins/openpencil-editor')
rmSync(target, { recursive: true, force: true })
cpSync('dist', target, { recursive: true })
console.log(`Installed to ${target}\nIn Obsidian: Settings → Community plugins → reload, then enable “OpenPencil Editor”.`)
