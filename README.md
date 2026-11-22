# OpenPencil Editor for Obsidian

Open and edit `.fig` and `.pen` design files in your vault with the [OpenPencil](https://github.com/open-pencil/open-pencil)
design editor, inside an Obsidian tab, the way the Excalidraw plugin handles `.excalidraw` files.

> **Unofficial.** This is a community plugin. It is not made by or affiliated with the OpenPencil
> project; it embeds OpenPencil's MIT-licensed SDK (`@open-pencil/vue`, `@open-pencil/core`).

## Features

- Click a `.fig` or `.pen` file in your vault and it opens in an OpenPencil tab, with a canvas, page list and toolbar.
- `.fig` edits **autosave** 1.5 s after you stop editing. They also save on **Mod+S**, when you close the tab and when you switch files.
- `.pen` files open and can be edited, but OpenPencil can't write `.pen` yet: run **Save as .fig** to keep changes.
- **New design** (command or ribbon icon) creates `Untitled design.fig` and opens it.
- If a file changes on disk (sync, another app) while you have no unsaved edits, the tab reloads it.
- Desktop only.

> **Keep backups of Figma files.** OpenPencil warns that saving a complex Figma `.fig` can lose
> fidelity when it is reopened in Figma. Autosave overwrites the file in place.

## Install

**From Obsidian:** *Settings → Community plugins → Browse → "OpenPencil Editor"* (once the plugin is accepted into the directory).

**Before that, with BRAT:** install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, choose
*Add beta plugin* and enter `kauadrar/obsidian-openpencil`.

**By hand:** download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://github.com/kauadrar/obsidian-openpencil/releases/latest) into
`<your vault>/.obsidian/plugins/openpencil-editor/`, then enable the plugin under *Settings → Community plugins*.

The first time you open a design, the plugin unpacks its editor (about 26 MB) into that same folder.

## How it works

Obsidian loads a plugin's `main.js` as CommonJS and installs only `main.js`, `manifest.json` and `styles.css`.
OpenPencil, however, is an ES-module app with WebAssembly (CanvasKit, Taffy, HarfBuzz, Zstd) and fonts that it finds with
`new URL(…, import.meta.url)`, and its layout engine uses top-level `await`. So the build works in two stages:

1. **Vite** builds the editor (`src/editor/`) as ES modules plus its assets into `build/editor/`.
2. `scripts/pack-editor.mjs` gzips that folder into one payload, and **esbuild** bundles it into `dist/main.js`
   together with the Obsidian side (`src/main.ts`).

At run time `src/unpack.ts` writes the payload to `<plugin folder>/editor/` once per version, and `main.ts` loads
`editor/editor.js` with a dynamic `import()` of its resource URL, so every WASM and font file resolves inside the plugin folder.

| Path | Role |
| --- | --- |
| `src/main.ts` | Obsidian plugin: file view for `fig`/`pen`, commands, saving through the vault API |
| `src/unpack.ts` | Unpacks the embedded editor bundle |
| `src/editor/index.ts` | `mountEditor()` / `exportFig()` / `createBlankFig()` on top of the OpenPencil SDK |
| `src/editor/Shell.vue` | The editor UI: page list, canvas, toolbar |
| `scripts/smoke.mjs` | Headless browser test of the built editor (CI runs it on every change) |

## Development

```bash
npm install
```

```bash
npm run build
```

```bash
npm run smoke
```

```bash
npm run install-to-vault -- "/path/to/a/test/vault"
```

`npm run typecheck` runs `vue-tsc`. To try the editor in a browser without Obsidian, serve the repository root
with any static server and open `smoke/index.html`, then call `await smoke.blankRoundTrip()` in the console.

## Commits and releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org): a git hook (husky + commitlint)
checks each message locally, and CI checks every commit in a pull request.

| Commit | Release |
| --- | --- |
| `fix: …`, `fix(deps): …` | patch (0.1.0 → 0.1.1) |
| `feat: …` | minor (0.1.0 → 0.2.0) |
| `feat!: …` or a `BREAKING CHANGE:` footer | major |
| `docs:`, `chore:`, `ci:`, `refactor:`, `test:` | no release |

Releases are automated with [release-please](https://github.com/googleapis/release-please): it keeps a release
pull request open that bumps `package.json` and `manifest.json` and updates `CHANGELOG.md`. Merging that pull request tags
the version (without a `v`, as Obsidian requires), and the release workflow builds the plugin, runs the smoke test,
and attaches `main.js`, `manifest.json` and `styles.css` to the GitHub release. Obsidian picks up new releases on its own.

If a release raises `minAppVersion` in `manifest.json`, add the new version to `versions.json` in the same pull request.

## Staying up to date with OpenPencil

Dependabot checks npm daily for new `@open-pencil/*` releases and opens a single `fix(deps): …` pull request that bumps
them all together. CI builds the plugin and runs the smoke test against the new version, so a release that breaks the plugin
shows up as a failing check. Merging the pull request leads to a patch release through release-please.
The OpenPencil packages are pinned to an exact version because the SDK still changes between releases.

## License

[MIT](LICENSE). The bundled OpenPencil, CanvasKit/Skia, Taffy, HarfBuzz, Zstd and Vue code and the bundled fonts keep their own
licenses. The plugin writes them to `editor/THIRD-PARTY-NOTICES.md` and every build includes them in `dist/THIRD-PARTY-NOTICES.md`.
