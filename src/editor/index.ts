// The editor bundle. Obsidian's main.js imports this file as an ES module from the plugin
// folder, so OpenPencil's WASM (CanvasKit, Taffy, Zstd) and fonts load relative to it.

// Points Core at CanvasKit's .wasm and the bundled fonts. Vite turns its `?url` imports into
// files under dist/editor/assets, resolved against this module's URL.
import '@open-pencil/core/runtime-assets/install'

import { MOBILE_RESTRICTIONS } from './mobile-policy'
import { createApp, defineComponent, h, provide, reactive, ref, type App as VueApp } from 'vue'
import {
  NOTIFY,
  PICK_IMAGE,
  RESOLVE_DROP_FILES,
  SHOW_CONTEXT_MENU,
  WRITE_EXPORT,
  type ContextMenuEntry,
  type Notify,
  type PickImage,
  type ResolveDropFiles,
  type ShowContextMenu,
  type WriteExport,
} from './context'

export type { ContextMenuEntry, Notify, PickImage, ResolveDropFiles, ShowContextMenu, WriteExport }
import { createDefaultEditorState, createDocumentGraph, createEditor, type Editor, type Tool } from '@open-pencil/core'
import { PAGE_DEFAULT_BACKGROUNDS } from '@open-pencil/core/constants'
import { setPageBackgrounds, FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, CODEGEN_PROMPT, toolStandardJSONSchema, type ToolDef } from '@open-pencil/core/tools'
import type { McpServer } from '@modelcontextprotocol/server'
import { registerTools, type RPCSender } from '../../node_modules/@open-pencil/mcp/src/tool/registration'
import * as v from 'valibot'
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
  /** Opens a vault image picker for Image fills; falls back to browser file input when omitted. */
  pickImage?: PickImage
  /** Initial plugin preferences (snapping and zoom speed). */
  initialSettings?: OpenPencilSettings
  /** Read-only full-bleed preview mode (mobile). */
  previewOnly?: boolean
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
  // On mobile the document is read-only: the core refuses every edit, from menus, shortcuts and API calls alike.
  if (opts.previewOnly) {
    editor.setHostRestrictions(MOBILE_RESTRICTIONS)
    editor.setReadOnly(true)
  }

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
  const iconifyImport = ref(opts.initialSettings?.iconifyImport ?? true)
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
      if (opts.pickImage) provide(PICK_IMAGE, opts.pickImage)
      return () =>
        h(Shell, {
          ref: shellRef,
          editor,
          active,
          zoomSpeed,
          iconifyImport,
          readOnly: !canWrite,
          previewOnly: Boolean(opts.previewOnly),
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
      iconifyImport.value = next.iconifyImport
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

export async function createEmptyDesignBytes(extension: DesignExtension, documentName = 'design'): Promise<Uint8Array> {
  if (extension === 'fig') {
    return await createBlankFig(documentName)
  }
  const graph = createDocumentGraph('design', obsidianTheme())
  if (!penFormat.writeDocument) {
    throw new Error('OpenPencil cannot write .pen files.')
  }
  const result = await penFormat.writeDocument(graph, { documentName })
  return typeof result.data === 'string' ? new TextEncoder().encode(result.data) : new Uint8Array(result.data)
}

const CORE_TOOLS_BY_NAME = new Map<string, ToolDef>(ALL_TOOLS.map((tool) => [tool.name, tool]))

export function getCodegenPrompt(): string {
  return CODEGEN_PROMPT
}

export function registerMcpTools(mcpServer: McpServer, sendRPC: RPCSender): void {
  registerTools(mcpServer, {
    policy: {
      disabledTools: [],
      allowEval: false,
      scope: 'document',
    },
    sendRPC,
  })

  const callDocTool = async (command: string, args: Record<string, unknown>) => {
    const res = (await sendRPC({ command, args })) as { ok?: boolean; result?: unknown; error?: string }
    if (res.ok === false) {
      return { content: [{ type: 'text' as const, text: res.error ?? 'Unknown error' }], isError: true }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.result ?? {}) }] }
  }

  mcpServer.registerTool(
    'open_document',
    {
      description: 'Open a .fig or .pen design file in an Obsidian tab.',
      inputSchema: toolStandardJSONSchema(v.strictObject({ path: v.string() })),
    },
    (args) => callDocTool('open_document', args as Record<string, unknown>),
  )

  mcpServer.registerTool(
    'create_document',
    {
      description: 'Create a new .fig or .pen design file in the Obsidian vault and open it.',
      inputSchema: toolStandardJSONSchema(v.strictObject({ path: v.string() })),
    },
    (args) => callDocTool('create_document', args as Record<string, unknown>),
  )

  mcpServer.registerTool(
    'list_recent_documents',
    {
      description: 'List recently opened .fig and .pen design files in the Obsidian vault.',
      inputSchema: toolStandardJSONSchema(v.strictObject({})),
    },
    () => callDocTool('list_recent_documents', {}),
  )
}

export async function executeEditorTool(
  editor: Editor,
  command: string,
  args: Record<string, unknown>,
): Promise<{ output: unknown; mutates: boolean }> {
  const tool = CORE_TOOLS_BY_NAME.get(command)
  if (!tool) throw new Error(`Unknown MCP tool: ${command}`)
  const figma = new FigmaAPI(editor.graph)
  await tool.loadFonts(figma, args)

  if (!tool.mutates) {
    return { output: await tool.execute(figma, args), mutates: false }
  }

  const pageId = editor.state.currentPageId
  const beforeBytes = await exportFigFile(editor.graph, { documentName: 'undo-snapshot' })
  const output = await tool.execute(figma, args)
  const afterBytes = await exportFigFile(editor.graph, { documentName: 'redo-snapshot' })

  const restoreBytes = async (bytes: Uint8Array) => {
    const restored = await parseFigFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    const targetPage = editor.graph.getNode(pageId)
    const sourcePage = restored.getNode(pageId) ?? restored.getPages()[0]
    if (targetPage && sourcePage) {
      for (const childId of [...targetPage.childIds]) {
        editor.graph.deleteNode(childId)
      }
      for (const childId of sourcePage.childIds) {
        const node = restored.getNode(childId)
        if (node) {
          editor.graph.createNode(node.type, pageId, node)
        }
      }
    }
    editor.requestRender()
  }

  editor.undo.push({
    label: `MCP: ${tool.name}`,
    inverse: () => void restoreBytes(beforeBytes),
    forward: () => void restoreBytes(afterBytes),
  })

  return { output, mutates: true }
}

export async function executeHeadlessTool(
  data: Uint8Array,
  extension: DesignExtension,
  command: string,
  args: Record<string, unknown>,
): Promise<{ output: unknown; updatedBytes?: Uint8Array }> {
  const tool = CORE_TOOLS_BY_NAME.get(command)
  if (!tool) throw new Error(`Unknown MCP tool: ${command}`)
  let graph
  if (extension === 'fig') {
    graph = await parseFigFile(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
  } else {
    if (!penFormat.readDocument) throw new Error('OpenPencil cannot read .pen files.')
    graph = (await penFormat.readDocument({ data })).graph
  }
  const figma = new FigmaAPI(graph)
  const currentPage = graph.getPages()[0]
  const beforeCount = currentPage ? currentPage.childIds.length : 0
  await tool.loadFonts(figma, args)
  const output = await tool.execute(figma, args)
  if (!tool.mutates) {
    return { output }
  }
  const afterCount = currentPage ? currentPage.childIds.length : 0
  if (beforeCount > 0 && afterCount === 0 && !tool.name.includes('delete')) {
    throw new Error(`Refusing to overwrite non-empty page with empty page from ${tool.name}`)
  }
  if (extension === 'fig') {
    return { output, updatedBytes: await exportFigFile(graph, { documentName: 'design' }) }
  }
  if (!penFormat.writeDocument) {
    throw new Error('OpenPencil cannot write .pen files.')
  }
  const written = await penFormat.writeDocument(graph, { documentName: 'design' })
  const updatedBytes =
    typeof written.data === 'string' ? new TextEncoder().encode(written.data) : new Uint8Array(written.data)
  return { output, updatedBytes }
}
