// The editor bundle. Obsidian's main.js imports this file as an ES module from the plugin
// folder, so OpenPencil's WASM (CanvasKit, Taffy, Zstd) and fonts load relative to it.

// Points Core at CanvasKit's .wasm and the bundled fonts. Vite turns its `?url` imports into
// files under dist/editor/assets, resolved against this module's URL.
import '@open-pencil/core/runtime-assets/install'

import { createApp, defineComponent, h, provide, reactive, ref, type App as VueApp } from 'vue'
import {
  NOTIFY,
  RESOLVE_DROP_FILES,
  SHOW_CONTEXT_MENU,
  WRITE_EXPORT,
  type ContextMenuEntry,
  type Notify,
  type ResolveDropFiles,
  type ShowContextMenu,
  type WriteExport,
} from './context'

export type { ContextMenuEntry, Notify, ResolveDropFiles, ShowContextMenu, WriteExport }
import { createDefaultEditorState, createDocumentGraph, createEditor, type Editor, type Tool } from '@open-pencil/core'
import { PAGE_DEFAULT_BACKGROUNDS } from '@open-pencil/core/constants'
import { setPageBackgrounds } from '@open-pencil/core/figma-api'
import { exportFigFile, parseFigFile, setFigCanvasCompressor } from '@open-pencil/core/io/formats/fig'
import { buildFigKiwi, loadFigDataCompressor } from '@open-pencil/kiwi/fig/container'
import { penFormat } from '@open-pencil/core/io'
import { getCanvasKit } from '@open-pencil/core/canvaskit'
import { SceneGraph } from '@open-pencil/scene-graph'
import { provideEditor } from '@open-pencil/vue'
import type { OpenPencilSettings } from '../settings'

import Shell from './Shell.vue'

// OpenPencil compresses a .fig save in a Web Worker loaded from this bundle's folder. Inside
// Obsidian that folder is served from another origin than the page, so the Worker cannot start
// and every save fails. Compress on the main thread instead, as OpenPencil does without workers.
setFigCanvasCompressor(async (parts) =>
  buildFigKiwi(
    parts.schemaDeflated,
    parts.kiwiData,
    parts.figKiwiVersion,
    await loadFigDataCompressor(parts.compressionLevel),
    parts.kind,
  ),
)

export type DesignExtension = 'fig' | 'pen'

export interface MountOptions {
  data: Uint8Array
  fileName: string
  extension: DesignExtension
  /** Reads a file the document names relative to itself, such as a .pen document's images. */
  readAsset?: (path: string) => Promise<Uint8Array | null>
  /** Called after every recorded edit, undo or redo. */
  onChange: () => void
  /** Called when the person presses Mod+S inside the editor. */
  onSaveRequest: () => void
  /** Writes a file from the Design panel's Export section; resolves to where it went. Without
   *  it, the browser downloads the file. */
  writeExport?: WriteExport
  /** Opens a context menu at viewport coordinates; Obsidian's Menu in the plugin. */
  showContextMenu?: ShowContextMenu
  /** Shows a brief user notice (Obsidian's Notice). */
  notify?: Notify
  /** Resolves vault drags (e.g. from Obsidian's file explorer) into File objects. */
  resolveDropFiles?: ResolveDropFiles
  /** Initial plugin preferences (snapping and zoom speed). */
  initialSettings?: OpenPencilSettings
}

export interface MountedEditor {
  readonly editor: Editor
  /** Whether this editor takes keyboard input; Obsidian can show several editors at once. */
  setActive(active: boolean): void
  /** Applies updated plugin preferences live. */
  applySettings(next: OpenPencilSettings): void
  /** Whether OpenPencil can write this document's own format back; false for .pen today. */
  readonly canWrite: boolean
  /** The document in its own format. Throws when `canWrite` is false. */
  exportNative(documentName?: string): Promise<Uint8Array>
  /** The document as a .fig file. */
  exportFig(documentName?: string): Promise<Uint8Array>
  canRunCommand(id: string): boolean
  runCommand(id: string): void
  placeFiles(files: File[], cx?: number, cy?: number): Promise<boolean>
  destroy(): void
}

async function readGraph(opts: MountOptions): Promise<SceneGraph> {
  if (opts.data.byteLength === 0) return new SceneGraph()
  if (opts.extension === 'fig') {
    // parseFigFile tries a Web Worker first and falls back to the main thread on its own,
    // which is what happens inside Obsidian. populate: 'all' reads every page up front, so the
    // document does not depend on that worker later.
    const buffer = opts.data.buffer.slice(
      opts.data.byteOffset,
      opts.data.byteOffset + opts.data.byteLength,
    ) as ArrayBuffer
    return parseFigFile(buffer, { populate: 'all' })
  }
  const result = await penFormat.readDocument!({
    name: opts.fileName,
    data: opts.data,
    readAsset: opts.readAsset,
  })
  return result.graph
}

type Theme = 'light' | 'dark'

/** Obsidian's interface theme, which the editor follows as OpenPencil follows its own. */
function obsidianTheme(): Theme {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light'
}

const RULER_THEMES = {
  dark: {
    background: { r: 0.14, g: 0.14, b: 0.14, a: 1 },
    tick: { r: 0.4, g: 0.4, b: 0.4, a: 1 },
    text: { r: 0.6, g: 0.6, b: 0.6, a: 1 },
  },
  light: {
    background: { r: 0.98, g: 0.98, b: 0.98, a: 1 },
    tick: { r: 0.75, g: 0.75, b: 0.75, a: 1 },
    text: { r: 0.45, g: 0.45, b: 0.45, a: 1 },
  },
} as const

/**
 * Gives pages that store no background the default for the interface theme, as OpenPencil does
 * for a page made in it. Without this they draw on core's light fallback even in a dark theme.
 */
function fillMissingPageBackgrounds(graph: SceneGraph, theme: Theme) {
  for (const page of graph.getPages()) {
    const raw = page.source?.fig?.rawNodeFields
    if (raw && (raw.backgroundPaints !== undefined || raw.backgroundColor !== undefined)) continue
    try {
      setPageBackgrounds(graph, page, [
        { type: 'SOLID', color: { ...PAGE_DEFAULT_BACKGROUNDS[theme] }, opacity: 1, visible: true, blendMode: 'NORMAL' },
      ])
    } catch (e) {
      console.warn('[openpencil] could not set a page background', e)
    }
  }
}

/** Asked of OpenPencil itself, so the plugin follows it if it learns to write .pen. */
const penWritable = !!penFormat.support.writeDocument && !!penFormat.writeDocument

const DESIGN_TOOLS: Tool[] = [
  'SELECT', 'SCALE', 'FRAME', 'SECTION', 'RECTANGLE', 'LINE', 'ELLIPSE', 'POLYGON', 'STAR',
  'PEN', 'PENCIL', 'TEXT', 'HAND', 'EYEDROPPER',
]

export async function mountEditor(el: HTMLElement, opts: MountOptions): Promise<MountedEditor> {
  const graph = await readGraph(opts)
  const theme = obsidianTheme()
  fillMissingPageBackgrounds(graph, theme)
  const page = graph.getPages()[0]
  if (!page) throw new Error('This document has no pages.')

  const editor = createEditor({
    graph,
    // showRulers is not in the SDK's default state, but its guide input reads it: without it the
    // rulers are drawn and dragging a guide out of them does nothing.
    state: reactive({ ...createDefaultEditorState(page.id), showRulers: true }),
    // The canvas sits between the sidebar and the Design panel, so measure it, not the host.
    getViewportSize: () => {
      const canvas = el.querySelector<HTMLElement>('.op-canvas') ?? el
      return { width: canvas.clientWidth || 800, height: canvas.clientHeight || 600 }
    },
  })

  // A design file offers no board tools (sticky, shape, connector) and no Comment (out of scope):
  // restricting the tool state also drops their keys, not just their toolbar buttons.
  editor.setHostRestrictions({ tools: new Set(DESIGN_TOOLS) })

  const applyTheme = (t: Theme) => {
    editor.state.theme = t
    editor.state.rulerTheme = { ...RULER_THEMES[t] }
  }
  applyTheme(theme)
  const themeObserver = new MutationObserver(() => applyTheme(obsidianTheme()))
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })

  const canWrite = opts.extension === 'fig' || penWritable
  const active = ref(true)
  const zoomSpeed = ref(opts.initialSettings?.zoomSpeed ?? 1)
  if (opts.initialSettings) {
    editor.state.snappingPreferences.geometry = opts.initialSettings.snapToGeometry
    editor.state.snappingPreferences.objects = opts.initialSettings.snapToObjects
    editor.state.snappingPreferences.pixelGrid = opts.initialSettings.snapToPixelGrid
  }
  const offHistory = editor.onEditorEvent('history:changed', (change) => {
    if (change !== 'clear') opts.onChange()
  })

  const shellRef = ref<{
    canRunCommand(id: string): boolean
    runCommand(id: string): void
    placeFiles(files: File[], cx?: number, cy?: number): Promise<boolean>
  } | null>(null)

  // provideEditor must sit in a parent of the components that call useEditor(), since Vue's
  // inject() does not see a component's own provides.
  const Root = defineComponent({
    setup() {
      provideEditor(editor)
      if (opts.writeExport) provide(WRITE_EXPORT, opts.writeExport)
      if (opts.showContextMenu) provide(SHOW_CONTEXT_MENU, opts.showContextMenu)
      if (opts.notify) provide(NOTIFY, opts.notify)
      if (opts.resolveDropFiles) provide(RESOLVE_DROP_FILES, opts.resolveDropFiles)
      return () =>
        h(Shell, {
          ref: shellRef,
          editor,
          active,
          zoomSpeed,
          readOnly: !canWrite,
          fileName: opts.fileName.replace(/\.[^.]+$/, ''),
          onSave: () => opts.onSaveRequest(),
        })
    },
  })
  const app: VueApp = createApp(Root)
  app.mount(el)

  const exportFig = async (documentName?: string) =>
    // CanvasKit is already loaded by the canvas; it draws the file's thumbnail.png.
    exportFigFile(editor.graph, {
      ck: await getCanvasKit(),
      renderer: editor.renderer ?? undefined,
      documentName,
    })

  return {
    editor,
    setActive(next) {
      active.value = next
    },
    applySettings(next) {
      editor.state.snappingPreferences.geometry = next.snapToGeometry
      editor.state.snappingPreferences.objects = next.snapToObjects
      editor.state.snappingPreferences.pixelGrid = next.snapToPixelGrid
      zoomSpeed.value = next.zoomSpeed
    },
    canWrite,
    async exportNative(documentName) {
      if (opts.extension === 'fig') return exportFig(documentName)
      if (!penWritable) throw new Error('OpenPencil cannot write .pen files.')
      const result = await penFormat.writeDocument!(editor.graph, { documentName })
      return typeof result.data === 'string' ? new TextEncoder().encode(result.data) : new Uint8Array(result.data)
    },
    exportFig,
    canRunCommand: (id) => shellRef.value?.canRunCommand(id) ?? false,
    runCommand: (id) => shellRef.value?.runCommand(id),
    placeFiles: (files, cx, cy) => shellRef.value?.placeFiles(files, cx, cy) ?? Promise.resolve(false),
    destroy() {
      offHistory()
      themeObserver.disconnect()
      app.unmount()
      editor.dispose()
    },
  }
}

/** An empty one-page .fig document, for "New OpenPencil design". */
export async function createBlankFig(documentName: string): Promise<Uint8Array> {
  return exportFigFile(createDocumentGraph('design', obsidianTheme()), { documentName })
}
