# Changelog

## [0.4.0](https://github.com/kauadrar/obsidian-openpencil/compare/0.3.0...0.4.0) (2026-11-23)


### Features

* **android:** tell Android users the editor can't open designs yet ([750982c](https://github.com/kauadrar/obsidian-openpencil/commit/750982c2e5000c7ef1f967ad734f370c5ad9db1b))


### Bug Fixes

* **fills:** keep the colour picker mounted when a fill changes tab ([3f1c2be](https://github.com/kauadrar/obsidian-openpencil/commit/3f1c2be4be3e45ed64002f126b9b8ba267065bab))

## 0.3.0 highlights

* **iOS (beta):** a read-only preview on iPhone and iPad. Pan with one finger, pinch to zoom, double-tap to fit, and switch pages from the top-left button. It never changes your file. Android is not verified yet.
* **Variables:** bind number and colour fields to variables; the page's Variables section manages them, with modes.
* **Assets tab:** components grouped by page with real thumbnails; drag or insert them with **+**.
* **Layers:** Shift-click to select a range; click a selected layer to rename it.
* **Components:** Properties on main components (Text, Boolean, Instance swap), plus instance overrides and variants. Cmd/Ctrl+Z now undoes a Boolean override tick.
* **Frame presets:** pick a preset for a selected frame, or from the list while the Frame tool is active.
* **Effects:** drop, inner, layer and background blur; blend mode; show-behind; bindable shadow values.
* **Insert icon:** search Iconify icons from the toolbar and detach icons. **Iconify needs a connection**; offline, the search shows no results. Turn it off under **Iconify import**.
* **Export scale:** type any scale, or pick a preset. A scale of 0 clamps to 0.01.
* **Fonts:** the picker shows BUNDLED and system fonts. Google Fonts and Fontsource listings are not available yet.
* **In-plugin MCP server** for desktop Obsidian, loaded only when needed.

Fixes found while testing this release: the colour picker stays open when a fill changes tab.

## [0.3.0](https://github.com/kauadrar/obsidian-openpencil/compare/0.2.0...0.3.0) (2026-11-23)


### Features

* add in-plugin MCP server for desktop Obsidian ([7ce2576](https://github.com/kauadrar/obsidian-openpencil/commit/7ce25760ab50506d67b5520945d8a091ccb6b49e))
* add in-plugin MCP server for desktop Obsidian ([dd5e516](https://github.com/kauadrar/obsidian-openpencil/commit/dd5e516b3fe6fe9b2d7d5812210d1c1e662b68e1))
* add mobile diagnostics Notice and touch layer-tools fallback ([92f9532](https://github.com/kauadrar/obsidian-openpencil/commit/92f953239d61c7f89b548b60c9bdabd23ee04bf4))
* add mobile preview page switcher sheet ([ce86eac](https://github.com/kauadrar/obsidian-openpencil/commit/ce86eac86ac84df065a44b31110deac63482c90c))
* **assets:** add an Assets tab with drag and + insert ([7cabaf3](https://github.com/kauadrar/obsidian-openpencil/commit/7cabaf3ac572dc1c5a14c58fc8a9229e4a179452))
* **assets:** collect and group local components by page ([ca8b26a](https://github.com/kauadrar/obsidian-openpencil/commit/ca8b26a03d86148195ddf4438c0c9daa1f3a0085))
* **assets:** render component thumbnails through the PNG export path ([cc478ad](https://github.com/kauadrar/obsidian-openpencil/commit/cc478adf3192fa94bb338e3ce8ce50774b5d3057))
* **assets:** show real component thumbnails in Assets rows ([ce5b909](https://github.com/kauadrar/obsidian-openpencil/commit/ce5b909e73593550653a8c44dfe86fc8f96edb66))
* **components:** add a properties section to main components and sets ([55b7277](https://github.com/kauadrar/obsidian-openpencil/commit/55b7277a1e040d4af3c0c817736aeb48b083f71f))
* **components:** pure helpers for property authoring and overrides ([c6908d9](https://github.com/kauadrar/obsidian-openpencil/commit/c6908d9439525bc21811c477f1bf4c85c7126dd1))
* **components:** show overrides and variants on component instances ([bb75d9a](https://github.com/kauadrar/obsidian-openpencil/commit/bb75d9a173abc60bd6877cef2f12bddd84155325))
* **design-panel:** bind number and colour fields to variables ([55d4d14](https://github.com/kauadrar/obsidian-openpencil/commit/55d4d1463cbbd9aed185457eec637eb9ffc7d183))
* **effects:** add blend mode, show-behind and bindable shadow values ([8ce7ef7](https://github.com/kauadrar/obsidian-openpencil/commit/8ce7ef76e0b170c5963635dd54c0a6723c46a988))
* **effects:** pure helpers for shadow and blur effect controls ([af77a26](https://github.com/kauadrar/obsidian-openpencil/commit/af77a26d9c6e0b6650ff0b607cb73c017e57a3e6))
* **export:** free-text export scale with presets ([d6a9e1f](https://github.com/kauadrar/obsidian-openpencil/commit/d6a9e1fbe751640015b4a0954b566c2cd3526252))
* **frames:** add a frame preset select for a selected frame ([9642d83](https://github.com/kauadrar/obsidian-openpencil/commit/9642d83f280c6b108ac856a60f35d480e2fcab4d))
* **frames:** add frame preset table and resize matching ([88d6e90](https://github.com/kauadrar/obsidian-openpencil/commit/88d6e90fba5881e433e90afa56dd2be638fd3540))
* **frames:** show a frame presets list while the Frame tool is active ([96f5385](https://github.com/kauadrar/obsidian-openpencil/commit/96f538590c7d6af3fbeb1bfdff4a4b7f4ffe25d5))
* **icons:** add an Insert icon popover and a Detach icon menu entry ([0ba08c9](https://github.com/kauadrar/obsidian-openpencil/commit/0ba08c9ff87fa807303e3e2b68f4fca20c9b6d50))
* **icons:** hide emoji sets from Insert icon results and the set filter ([69242e3](https://github.com/kauadrar/obsidian-openpencil/commit/69242e3872079587aaa6667cfa26fd1698161ec8))
* **layers:** shift-click selects a range; click a selected row to rename ([8f411ca](https://github.com/kauadrar/obsidian-openpencil/commit/8f411ca7d5a6424cf9af21c0bfe61d36a58c9256))
* lazy-load MCP server and enable mobile manifest (Phase 1) ([a57b8e0](https://github.com/kauadrar/obsidian-openpencil/commit/a57b8e0ce8afacecfd32af8be49c56d50be19383))
* mobile read-only preview & lazy-loaded MCP (Phase 1) ([5e0e807](https://github.com/kauadrar/obsidian-openpencil/commit/5e0e807031627b28ce3328f24da93c2ed75857c1))
* mobile read-only preview mode with touch pan/pinch/double-tap ([b5fb7cb](https://github.com/kauadrar/obsidian-openpencil/commit/b5fb7cb9ba9f85acea6aa30ede5ec073e5bdb766))
* **settings:** add an Iconify import setting, on by default ([5235a02](https://github.com/kauadrar/obsidian-openpencil/commit/5235a021a674f84a69db7ae6e323d80196dc96ca))
* **toolbar:** mark the current tool in flyouts and show shortcuts ([03c3add](https://github.com/kauadrar/obsidian-openpencil/commit/03c3add9ceca5dedb9e81bcf4645bdb55eb0ed13))
* **typography:** font picker source badges (BUNDLED, system) ([25ed344](https://github.com/kauadrar/obsidian-openpencil/commit/25ed34406889468645cebf4813ea39fdce9078bc))
* **variables:** group local variables by collection for pickers ([1b1b25b](https://github.com/kauadrar/obsidian-openpencil/commit/1b1b25b820c9523e1d801ce4a517a8f668be876e))


### Bug Fixes

* clear dirty state and autosave timer on close_document discard ([adef99e](https://github.com/kauadrar/obsidian-openpencil/commit/adef99e0df2f5e3f4cd6f25d41a8b9893be7623d))
* collapse grid to 1-column full-bleed canvas in mobile preview and refit on resize ([6573408](https://github.com/kauadrar/obsidian-openpencil/commit/657340821fce23b09bde4b438ee9ef6e37722652))
* **components:** add instance swap properties on the first other component ([bc2cf53](https://github.com/kauadrar/obsidian-openpencil/commit/bc2cf5343c65d3d2830be3dc54ffdbd82b4e7a43))
* **components:** pick a component default for instance swap properties ([3201be6](https://github.com/kauadrar/obsidian-openpencil/commit/3201be6107b421604a941c9b0b75200ba48ba2f1))
* **components:** undo a boolean override tick with Cmd/Ctrl+Z ([122cb37](https://github.com/kauadrar/obsidian-openpencil/commit/122cb37c0d04f2ca6c4bf0b32a86298608568e0f))
* **design-panel:** anchor the Apply variable list to its field ([876339c](https://github.com/kauadrar/obsidian-openpencil/commit/876339c98d711cf7522ceb4edd4e503f3d9c44e6))
* **effects:** show a reopened layer blur as Layer blur ([89a7982](https://github.com/kauadrar/obsidian-openpencil/commit/89a7982f5744169d0800f5bf5da1ccbbf3dbb7e8))
* explicit headless undo error, close_document unsaved guard, and headless write log ([d2bbb1e](https://github.com/kauadrar/obsidian-openpencil/commit/d2bbb1ee3c62ce22a18ba7f4445b8a01cefcaf46))
* **export:** clamp an export scale of 0 to 0.01 ([62908fa](https://github.com/kauadrar/obsidian-openpencil/commit/62908fa93dd72bd19d9836ab42c5fb93b25b4ac0))
* **export:** show the scale presets as a select that applies at once ([981b273](https://github.com/kauadrar/obsidian-openpencil/commit/981b2738294a49b8d14458801bdefe85a8662f5d))
* **icons:** decide Iconify reachability by probing it, not the set list ([fe1d555](https://github.com/kauadrar/obsidian-openpencil/commit/fe1d55556f10b663c758a7e330e5ca082ccd950d))
* **icons:** hide icon results when Iconify is unreachable ([21671ee](https://github.com/kauadrar/obsidian-openpencil/commit/21671eef99352eb1838106501644d92f3ae3654d))
* import MCP registration directly to avoid node:os in editor bundle ([70adae8](https://github.com/kauadrar/obsidian-openpencil/commit/70adae8ce90d4785819358080cdb26869b07e3a0))
* register 3 vault doc tools without mcpRoot and add live MCP smoke script ([0ff4b48](https://github.com/kauadrar/obsidian-openpencil/commit/0ff4b48ff4b64bf848a06718c29dc439f715e901))
* replace mobile page bottom sheet with top-left dropdown popover ([d6faa2e](https://github.com/kauadrar/obsidian-openpencil/commit/d6faa2e587fbc05bf94d82602733675273d8035b))
* resolve B6 undo/redo, B7 http type, B8 guards, and vault doc behaviors ([eb16d17](https://github.com/kauadrar/obsidian-openpencil/commit/eb16d170cb777f4ace38632606d7ecb9f286627f))
* resolve MCP tool dispatch, Buffer shim, and 12 document tools ([a0eb6bc](https://github.com/kauadrar/obsidian-openpencil/commit/a0eb6bc2f0f4ba7c2d2109b5b14d26e8c53801e2))
* **smoke:** pass settings wrapper to update_settings in smoke-mcp.mjs ([bf9d3f2](https://github.com/kauadrar/obsidian-openpencil/commit/bf9d3f27489be95a181e65fec8760eb6b7b8a672))
* **smoke:** run all MCP smoke steps before reporting failures ([c965f8b](https://github.com/kauadrar/obsidian-openpencil/commit/c965f8ba46dddcf004a1843259769692dbea27ab))
* **smoke:** run undo-reverts-edit while document is open ([05ad7a6](https://github.com/kauadrar/obsidian-openpencil/commit/05ad7a6bc82248d66797b99601d6e8685385f10e))
* **typography:** give the font picker its local font access and keep bundled fonts ([6562bcc](https://github.com/kauadrar/obsidian-openpencil/commit/6562bccfe5ce9832faa96db11bb665112535d8c0))
* **typography:** remove GOOGLE and FONTSOURCE font badges ([bf87ec7](https://github.com/kauadrar/obsidian-openpencil/commit/bf87ec7d9446bd66291dd1ae2646076eb828f04d))
* uniform swatch ring and auto-width icon-btn for text labels ([bb79a9c](https://github.com/kauadrar/obsidian-openpencil/commit/bb79a9c07a8818ef21b85c809eec44fd3cd4abf4))

## 0.2.0 highlights

* **Design panel** on the right of the editor: position and size with min/max and aspect lock, constraints, auto layout, fills, strokes, blend mode, corner radii, typography, effects, export.
* **Context menus** on the canvas and layers, and **keyboard shortcuts**, including a zoom menu with presets.
* **Obsidian commands** in the command palette, including **Place…** for images and SVGs from your vault.
* **Drop to place** images, SVGs and `.fig` files on the canvas.
* **Pages** can be renamed, deleted, reordered and divided.
* **Export to vault** with stable filenames; re-exporting overwrites the file.
* **Embeds** show `.fig` thumbnails in Reading view and Live Preview.
* **New design** from a folder's right-click menu, and a **settings tab** for snapping and zoom speed.
* Unchanged: `.pen` is still saved only through **Save as .fig** unless OpenPencil can write `.pen`. Keep backups of Figma files.

## [0.2.0](https://github.com/kauadrar/obsidian-openpencil/compare/0.1.0...0.2.0) (2026-11-23)


### Features

* add a Design panel on the right of the editor ([31f6e27](https://github.com/kauadrar/obsidian-openpencil/commit/31f6e27417a4d8afd3af70e56b6864ccea421b2c))
* add an Auto layout section to the Design panel ([0ff4d14](https://github.com/kauadrar/obsidian-openpencil/commit/0ff4d142358cd09f55e915e4e4a45734c142cbd9))
* add an Effects section to the Design panel ([2a58cd1](https://github.com/kauadrar/obsidian-openpencil/commit/2a58cd114f201efeeff2d56502a821e397384dba))
* add an Export section to the Design panel ([665207b](https://github.com/kauadrar/obsidian-openpencil/commit/665207b447340cd100b83049fa836c49f2bf3cc6))
* **appearance:** add 19-mode blend dropdown and independent corner radii ([7ef5723](https://github.com/kauadrar/obsidian-openpencil/commit/7ef5723f9c8f6b8cafebc7315c56b7cbc2187fbf))
* **color-picker:** add 240px popover with SV, sliders, eyedropper, and RGB/HSL/HSB/OkHCL ([a5b97a5](https://github.com/kauadrar/obsidian-openpencil/commit/a5b97a5f85ca3b28efe17ecdeb767e4a39765885))
* **commands:** register editor and app commands in Obsidian command palette ([6fbff7c](https://github.com/kauadrar/obsidian-openpencil/commit/6fbff7caf194e62637bd8214e7e80c2e6a5056a3))
* **constraints:** add constraints pin diagram and axis selects ([8464a58](https://github.com/kauadrar/obsidian-openpencil/commit/8464a589dd05495d3e45e10b4ea8c2f0ff9b6c7a))
* **constraints:** apply child constraints on panel W/H edits ([975fb5c](https://github.com/kauadrar/obsidian-openpencil/commit/975fb5cffb8a06a300a80e6270285c8b2dc055b0))
* **editor:** add canvas and layer context menu ([cba6b3f](https://github.com/kauadrar/obsidian-openpencil/commit/cba6b3f7a6eaf09724f1a3c41133df8f6d06819f))
* **editor:** add canvas file drop and Place… command ([7725b3f](https://github.com/kauadrar/obsidian-openpencil/commit/7725b3f97c10339e0644bea9d87f1ca7ce296313))
* **editor:** add Copy as SVG and Copy as PNG to context menu ([b434d98](https://github.com/kauadrar/obsidian-openpencil/commit/b434d985b9bf52bc23da92469553d9816241fc7e))
* **editor:** add missing canvas keyboard shortcuts ([006e6f8](https://github.com/kauadrar/obsidian-openpencil/commit/006e6f8cce62c2e9d996ca3aa5f94998c700a23c))
* **editor:** add page rename, delete, reorder, and dividers ([1f90690](https://github.com/kauadrar/obsidian-openpencil/commit/1f90690bb9a4ee48fa433507d8fb23f2b8c3814c))
* **editor:** add zoom menu popover with presets, input, and view toggles ([d594c8c](https://github.com/kauadrar/obsidian-openpencil/commit/d594c8ce51f7432b1247706e742872e8d6325331))
* **embeds:** render .fig thumbnails in reading view and live preview ([c36100f](https://github.com/kauadrar/obsidian-openpencil/commit/c36100fe1278381b9d9e84290aeea15035125f1b))
* **explorer:** add New design to folder context menu ([13e828d](https://github.com/kauadrar/obsidian-openpencil/commit/13e828d17b779f4e8eca58749b9f5aff3d6a72ba))
* **export:** write stable vault filenames and overwrite on re-export ([f260250](https://github.com/kauadrar/obsidian-openpencil/commit/f260250de712ed999a4d70214e93b76ffae22d85))
* **fills:** add Solid, Gradient, and Image fill tabs with canvas handles and adjustments ([214c445](https://github.com/kauadrar/obsidian-openpencil/commit/214c44524e171c1901753df7580e05055cc163c0))
* follow OpenPencil's own write support instead of hardcoding .pen as read-only ([6fa2f5b](https://github.com/kauadrar/obsidian-openpencil/commit/6fa2f5b6922646d81e5e44de7a0897b4a83859fb))
* give the editor shell OpenPencil's layout and look ([0b0cc79](https://github.com/kauadrar/obsidian-openpencil/commit/0b0cc79674066f14d69637526e864e18a087d66c))
* **header,mask:** add editable layer name, type switcher, component/mask actions, and mask section ([0dd9887](https://github.com/kauadrar/obsidian-openpencil/commit/0dd98874f459e7bb1b1306d3151f29e842f1ed89))
* hide the Comment tool from the toolbar ([0bf3ffd](https://github.com/kauadrar/obsidian-openpencil/commit/0bf3ffda90f50f029f5532d2ed6921474cdfb315))
* **layout:** add dimensions, min/max, aspect lock, text resizing, and auto-layout extras ([33cac0f](https://github.com/kauadrar/obsidian-openpencil/commit/33cac0fa222092d2992ad65054d450eeb2413477))
* **panel:** add flips, clip content, booleans, arrange menu, and multi-selection ([f738215](https://github.com/kauadrar/obsidian-openpencil/commit/f738215586f3a047be74ed9becb60ea0bc742cb0))
* **settings:** add PluginSettingTab for snapping and zoom speed ([ab072be](https://github.com/kauadrar/obsidian-openpencil/commit/ab072beb8abd34fcd3f96ba4a3d2dab9faf74a4a))
* **stroke:** support non-solid paints, stroke settings popover, and per-side weights ([b8f4799](https://github.com/kauadrar/obsidian-openpencil/commit/b8f4799e759b55340b2a8828a1f2668d9da292f4))
* **typography:** add searchable font picker, vertical align, B/I/U/S, and text case ([39233d9](https://github.com/kauadrar/obsidian-openpencil/commit/39233d9f7a0338d0d26219b06a76220d3c5b667a))


### Bug Fixes

* **color-picker:** bind OkHCL Chroma and Lightness gradient styles directly ([f14c41a](https://github.com/kauadrar/obsidian-openpencil/commit/f14c41a471932b41d5f42956821ee33ed4213810))
* **color-picker:** fix SV/hue/alpha updates, gradients, Esc eyedropper, OkHCL sync, and layout ([2d1ab3d](https://github.com/kauadrar/obsidian-openpencil/commit/2d1ab3d83bc0e5e46e62adf9703a204f989feba6))
* **constraints:** enlarge pin hit areas for reliable clicking ([ebca1a3](https://github.com/kauadrar/obsidian-openpencil/commit/ebca1a382097a1eee882e7996a2b76eaae3f9113))
* **constraints:** reset obsidian button min-size and z-index on pins ([8973631](https://github.com/kauadrar/obsidian-openpencil/commit/8973631e43abf70e20507925345703907f575051))
* **constraints:** use div role=button for pins to avoid obsidian button styles ([da8ef49](https://github.com/kauadrar/obsidian-openpencil/commit/da8ef498dd1b471727025329ac0a18b3db264b60))
* disable the Comment tool and its C key, not only its toolbar button ([ee082d9](https://github.com/kauadrar/obsidian-openpencil/commit/ee082d9bcd45ad4b1843a1c2209e53371aae80a7))
* **editor:** fix Cut execution, live Hide/Lock labels, and menu shortcut spacing ([7434280](https://github.com/kauadrar/obsidian-openpencil/commit/74342804a17a987065c776ffdf717b420dcf7713))
* **editor:** use selectionLabelMenu for Hide/Show and Lock/Unlock labels ([2f3cd83](https://github.com/kauadrar/obsidian-openpencil/commit/2f3cd8306846275a5d1f5e0a0666074578b33d6c))
* **embeds:** replace async Obsidian file-embed cards in Reading View and Live Preview ([361f979](https://github.com/kauadrar/obsidian-openpencil/commit/361f979675bba91ef30bdaee5d61962a2b820aad))
* **fills:** keep popover open on gradient handle drag and fix stop position/opacity scale ([09028d6](https://github.com/kauadrar/obsidian-openpencil/commit/09028d67d65bff9c72cf25b8aa9f397dfd285e9d))
* **fills:** unwrap PointerDownOutsideEvent in keepOpen for gradient handles ([aa620c2](https://github.com/kauadrar/obsidian-openpencil/commit/aa620c28a37d3a257bed8f8801ee08b7ba28ddb6))
* keep the toolbar inside narrow canvases and the panel header above host overlays ([d083eed](https://github.com/kauadrar/obsidian-openpencil/commit/d083eed6b97024c71f8519412a745aec1cb2a03f))
* keep the zoom pill clear of the vertical ruler ([273ec0a](https://github.com/kauadrar/obsidian-openpencil/commit/273ec0aa1f15fea3d195eec39e7f39fed2a1d5e9))
* let ruler guides be dragged out of the rulers ([09b7ba3](https://github.com/kauadrar/obsidian-openpencil/commit/09b7ba331c9602ce08591074bb5679cbde3252b6))
* move the zoom percentage to the canvas bottom-left, away from other plugins' status overlays ([5899574](https://github.com/kauadrar/obsidian-openpencil/commit/58995747993ddac6b684cf75607c65abb508741b))
* save .fig files inside Obsidian, and stop squashing the page color field ([ed351a2](https://github.com/kauadrar/obsidian-openpencil/commit/ed351a2d317c4dca3c2842f87265b5e8c063d5ae))
* **stroke:** treat Dash 0 as solid stroke ([c9626d9](https://github.com/kauadrar/obsidian-openpencil/commit/c9626d9075169a5d4995c18d1dd5111f9486679c))
* **typography:** only list bundled Inter when local fonts are not loaded ([bcfc32e](https://github.com/kauadrar/obsidian-openpencil/commit/bcfc32e5d38bea300bf0d4fe9909e1363f914794))
