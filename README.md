# OpenPencil Editor for Obsidian

Open and edit `.fig` and `.pen` design files in your vault with the [OpenPencil](https://github.com/open-pencil/open-pencil)
design editor, inside an Obsidian tab, the way the Excalidraw plugin handles `.excalidraw` files.

> **Unofficial.** This is a community plugin. It is not made by or affiliated with the OpenPencil
> project; it embeds OpenPencil's MIT-licensed SDK (`@open-pencil/vue`, `@open-pencil/core`).

## Features

- Click a `.fig` or `.pen` file in your vault and it opens in an OpenPencil tab, with a canvas, page list and toolbar.
- `.fig` edits **autosave** 1.5 s after you stop editing. They also save on **Mod+S**, when you close the tab and when you switch files.
- `.pen` files open and can be edited, but the plugin only does what OpenPencil does, and OpenPencil can't write `.pen` (as of 0.17.0): run **Save as .fig** to keep changes. If OpenPencil gains `.pen` writing, the plugin saves `.pen` too.
- **New design** (command or ribbon icon, or **New design** in a folder's right-click menu in the file explorer) creates `Untitled design.fig` and opens it.
- **Design panel** on the right of the editor: edit layer name and type, position and size (with min/max and aspect lock), constraints (pin diagram), auto layout, fills (solid, gradient, image), strokes (per-side weights), blend mode, corner radii, typography (searchable font picker, B/I/U/S, text case), effects, flips, clip content, booleans, arrange, and export.
- **Context menus** on the canvas and on layers: copy, cut, paste, hide/show, lock/unlock, copy as SVG or PNG, and more.
- **Keyboard shortcuts** for common canvas actions, and a **zoom menu** with presets, a percentage input and view toggles.
- **Obsidian commands** in the command palette, including **Place…**, which puts an image or SVG from your vault onto the canvas.
- **Drop to place:** drag an image, SVG or `.fig` file onto the canvas to place it.
- **Pages:** rename, delete, reorder and add dividers.
- **Export to vault:** write designs out as stable filenames in your vault; re-exporting overwrites the same file.
- **Embed in notes:** `.fig` files show thumbnails in Reading view and Live Preview.
- **Settings tab:** snapping and zoom speed.
- **Insert icon:** search and insert [Iconify](https://iconify.design) icons from the toolbar, at the centre of the view or into the selected frame. **Iconify needs an internet connection.** Offline, the search shows no results and nothing else breaks. Turn it off in the settings tab under **Iconify import**.
- **Variables:** bind number and colour fields to variables, and manage them in the page's Variables section, with modes.
- **Assets tab:** components grouped by page, with real thumbnails; drag one onto the canvas or use **+** to insert it.
- **Layers:** Shift-click to select a range; click a selected layer to rename it.
- **Components:** Properties on main components (Text, Boolean, Instance swap), plus instance overrides and variants.
- **Frame presets:** pick a preset for a selected frame, or from the list shown while the Frame tool is active.
- **Effects:** drop, inner, layer and background blur; blend mode; show-behind; and shadow values you can bind to variables.
- **Export scale:** type any scale, or pick one of the presets.
- **Fonts:** the font picker shows **BUNDLED** and system fonts. Google Fonts and Fontsource listings are not available yet.
- If a file changes on disk (sync, another app) while you have no unsaved edits, the tab reloads it.
- **Desktop:** full editor.
- **iOS (beta):** a read-only preview. Pan with one finger, pinch to zoom, double-tap to fit. Pick another page from the button at the top-left. It never changes your file. Install through BRAT (see below).
- **Android:** not verified yet.

> **Keep backups of Figma files.** OpenPencil warns that saving a complex Figma `.fig` can lose
> fidelity when it is reopened in Figma. Autosave overwrites the file in place.

## Known limitations

- **Android:** this version can't open designs. Android's WebView blocks the editor's files, so the plugin shows a notice instead of opening the file. Desktop and iOS work. A fix is planned for a later release.
- **Iconify icons** need an internet connection; offline, the Insert icon search shows a note instead of results.

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
