// The editor bundle. Obsidian's main.js imports this file as an ES module from the plugin
// folder, so OpenPencil's WASM (CanvasKit, Taffy, Zstd) and fonts load relative to it.

// Points Core at CanvasKit's .wasm and the bundled fonts. Vite turns its `?url` imports into
// files under dist/editor/assets, resolved against this module's URL.
import '@open-pencil/core/runtime-assets/install'

import { createApp, defineComponent, h, reactive, ref, type App as VueApp } from 'vue'
import { createDefaultEditorState, createEditor, type Editor } from '@open-pencil/core'
import { exportFigFile, parseFigFile } from '@open-pencil/core/io/formats/fig'
import { penFormat } from '@open-pencil/core/io'
import { getCanvasKit } from '@open-pencil/core/canvaskit'
import { SceneGraph } from '@open-pencil/scene-graph'
import { provideEditor } from '@open-pencil/vue'

import Shell from './Shell.vue'

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
}

export interface MountedEditor {
  readonly editor: Editor
  /** Whether this editor takes keyboard input; Obsidian can show several editors at once. */
  setActive(active: boolean): void
  /** Whether OpenPencil can write this document's own format back; false for .pen today. */
  readonly canWrite: boolean
  /** The document in its own format. Throws when `canWrite` is false. */
  exportNative(documentName?: string): Promise<Uint8Array>
  /** The document as a .fig file. */
  exportFig(documentName?: string): Promise<Uint8Array>
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

/** Asked of OpenPencil itself, so the plugin follows it if it learns to write .pen. */
const penWritable = !!penFormat.support.writeDocument && !!penFormat.writeDocument

export async function mountEditor(el: HTMLElement, opts: MountOptions): Promise<MountedEditor> {
  const graph = await readGraph(opts)
  const page = graph.getPages()[0]
  if (!page) throw new Error('This document has no pages.')

  const editor = createEditor({
    graph,
    state: reactive(createDefaultEditorState(page.id)),
    getViewportSize: () => ({ width: el.clientWidth || 800, height: el.clientHeight || 600 }),
  })

  const canWrite = opts.extension === 'fig' || penWritable
  const active = ref(true)
  const offHistory = editor.onEditorEvent('history:changed', (change) => {
    if (change !== 'clear') opts.onChange()
  })

  // provideEditor must sit in a parent of the components that call useEditor(), since Vue's
  // inject() does not see a component's own provides.
  const Root = defineComponent({
    setup() {
      provideEditor(editor)
      return () =>
        h(Shell, {
          editor,
          active,
          readOnly: !canWrite,
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
    canWrite,
    async exportNative(documentName) {
      if (opts.extension === 'fig') return exportFig(documentName)
      if (!penWritable) throw new Error('OpenPencil cannot write .pen files.')
      const result = await penFormat.writeDocument!(editor.graph, { documentName })
      return typeof result.data === 'string' ? new TextEncoder().encode(result.data) : new Uint8Array(result.data)
    },
    exportFig,
    destroy() {
      offHistory()
      app.unmount()
      editor.dispose()
    },
  }
}

/** An empty one-page .fig document, for "New OpenPencil design". */
export async function createBlankFig(documentName: string): Promise<Uint8Array> {
  return exportFigFile(new SceneGraph(), { documentName })
}
