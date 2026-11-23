// The Obsidian side: registers a view for .fig/.pen files and loads the ES-module editor bundle
// (editor/editor.js) on first use, unpacking it from main.js into the plugin folder if needed.
import {
  App,
  FileView,
  FuzzySuggestModal,
  Menu,
  MenuItem,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  normalizePath,
  type WorkspaceLeaf,
} from 'obsidian'
import type * as EditorModule from './editor/index'
import { PLUGIN_COMMANDS } from './commands'
import { createDesignEmbedExtension, DesignEmbedManager, processDesignEmbeds } from './embeds'
import { DEFAULT_SETTINGS, sanitizeSettings, type OpenPencilSettings } from './settings'
import { ensureEditorUnpacked } from './unpack'
import { EditorLoadError, editorFailureText } from './editor-failure'
import { loadEditorBlobs, type LoadedEditor } from './android/blob-loader'
import { readEditorFiles } from './android/editor-files'
import { withTimeout } from './timeout'
import { createMcpRpcSender, type McpDocumentSummary, type McpHost } from './mcp/adapter'
import type { McpServerController, McpServerStatus } from './mcp/server'

export const VIEW_TYPE = 'openpencil-design'
const EXTENSIONS = ['fig', 'pen'] as const
const MOUNT_TIMEOUT_MS = 20000
const AUTOSAVE_MS = 1500

export default class OpenPencilPlugin extends Plugin {
  private editorModule: Promise<typeof EditorModule> | null = null
  /** Android only: the editor's chunks as blob URLs, revoked on unload. */
  private editorBlobs: LoadedEditor | null = null
  private embedManager: DesignEmbedManager | null = null
  private mcpServer: McpServerController | null = null
  settings: OpenPencilSettings = { ...DEFAULT_SETTINGS }

  async onload() {
    this.settings = sanitizeSettings(await this.loadData())
    this.addSettingTab(new OpenPencilSettingTab(this.app, this))

    this.embedManager = new DesignEmbedManager(this.app)
    this.registerMarkdownPostProcessor((el, ctx) => processDesignEmbeds(this.app, this.embedManager!, el, ctx))
    this.registerEditorExtension(createDesignEmbedExtension(this.app, this.embedManager))
    this.registerEvent(this.app.vault.on('modify', (file) => this.embedManager?.refreshPath(file.path)))
    this.registerEvent(this.app.vault.on('delete', (file) => this.embedManager?.refreshPath(file.path)))
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.embedManager?.refreshPath(oldPath)
      this.embedManager?.refreshPath(file.path)
    }))

    this.registerView(VIEW_TYPE, (leaf) => new DesignView(leaf, this))
    this.registerExtensions([...EXTENSIONS], VIEW_TYPE)

    this.addRibbonIcon('pen-tool', 'New OpenPencil design', () => this.createDesign())
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFolder)) return
        menu.addItem((item) =>
          item
            .setTitle('New design')
            .setIcon('pen-tool')
            .onClick(() => void this.createDesign(file)),
        )
      }),
    )
    this.addCommand({
      id: 'new-design',
      name: 'New design',
      callback: () => this.createDesign(),
    })
    this.addCommand({
      id: 'save-as-fig',
      name: 'Save as .fig',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DesignView)
        if (!view?.file) return false
        if (!checking) void view.saveAsFig()
        return true
      },
    })
    for (const cmd of PLUGIN_COMMANDS) {
      this.addCommand({
        id: cmd.id,
        name: cmd.name,
        checkCallback: (checking) => {
          const view = this.app.workspace.getActiveViewOfType(DesignView)
          if (!view?.isFigActive()) return false
          if (cmd.id === 'app.place') {
            if (!checking) new PlaceFileModal(this.app, (file) => void view.placeVaultFile(file)).open()
            return true
          }
          if (!view.canRunCommand(cmd.id)) return false
          if (!checking) view.runCommand(cmd.id)
          return true
        },
      })
    }

    if (Platform.isDesktopApp) {
      const { generateMcpToken, McpServerController } = await import('./mcp/server')
      if (!this.settings.mcpToken) {
        this.settings = sanitizeSettings({ ...this.settings, mcpToken: generateMcpToken() })
        await this.saveData(this.settings)
      }
      this.mcpServer = new McpServerController({
        sendRPC: createMcpRpcSender(this.createMcpHost()),
        loadRegisterTools: async () => (await this.loadEditor()).registerMcpTools,
      })
      void this.mcpServer.start(this.settings.mcpPort, this.settings.mcpToken)
    }
  }

  onunload() {
    this.editorBlobs?.dispose()
    this.editorBlobs = null
    void this.mcpServer?.stop()
    this.mcpServer = null
    this.embedManager?.destroy()
    this.embedManager = null
  }

  /** Loads the editor bundle once. A dynamic import of the plugin folder's own URL keeps
   *  import.meta.url pointing there, so OpenPencil finds its .wasm and font files. */
  loadEditor(): Promise<typeof EditorModule> {
    if (!this.editorModule) {
      const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`
      const adapter = this.app.vault.adapter
      this.editorModule = ensureEditorUnpacked(adapter, dir).then(async (editorDir) => {
        if (Platform.isAndroidApp) {
          // Android's WebView refuses module imports from the file URL, so the chunks load as blobs (see src/android).
          const files = await readEditorFiles(adapter, editorDir)
          console.info(`[openpencil] android: read ${files.length} editor files from ${editorDir}`)
          const loaded = loadEditorBlobs(files)
          console.info('[openpencil] android: editor chunks loaded as blobs')
          this.editorBlobs = loaded
          return import(/* @vite-ignore */ loaded.entryUrl) as Promise<typeof EditorModule>
        }
        // Obsidian appends ?<mtime> to resource URLs, so an updated bundle is not served from cache.
        const url = adapter.getResourcePath(normalizePath(`${editorDir}/editor.js`))
        return import(/* @vite-ignore */ url) as Promise<typeof EditorModule>
      }).catch((err: unknown) => {
        throw new EditorLoadError(err)
      })
      this.editorModule.catch((err) => {
        this.editorModule = null
        console.error('[openpencil] editor failed to load', err)
        if (Platform.isMobile) new Notice(editorFailureText(err instanceof EditorLoadError ? err.original : err, this.manifest.version, Platform.isAndroidApp), 10000)
      })
    }
    return this.editorModule
  }

  async updateSettings(patch: Partial<OpenPencilSettings>): Promise<void> {
    const prevPort = this.settings.mcpPort
    this.settings = sanitizeSettings({ ...this.settings, ...patch })
    await this.saveData(this.settings)
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof DesignView) leaf.view.applySettings(this.settings)
    }
    if (this.mcpServer && this.settings.mcpPort !== prevPort) {
      await this.mcpServer.start(this.settings.mcpPort, this.settings.mcpToken)
    }
  }

  getMcpStatus(): McpServerStatus {
    return (
      this.mcpServer?.getStatus() ?? {
        running: false,
        port: this.settings.mcpPort,
        address: null,
        error: Platform.isDesktopApp ? null : 'Desktop only',
      }
    )
  }

  async regenerateMcpToken(): Promise<string> {
    if (!Platform.isDesktopApp) return this.settings.mcpToken
    const { generateMcpToken } = await import('./mcp/server')
    const token = generateMcpToken()
    this.settings = sanitizeSettings({ ...this.settings, mcpToken: token })
    await this.saveData(this.settings)
    this.mcpServer?.setToken(token)
    return token
  }

  async restartMcpServer(): Promise<McpServerStatus> {
    if (!this.mcpServer) return this.getMcpStatus()
    return await this.mcpServer.start(this.settings.mcpPort, this.settings.mcpToken)
  }

  private createMcpHost(): McpHost {
    const isDesignFile = (file: TFile): boolean => {
      const ext = file.extension.toLowerCase()
      return ext === 'fig' || ext === 'pen'
    }

    const getOpenViews = (): DesignView[] =>
      this.app.workspace
        .getLeavesOfType(VIEW_TYPE)
        .map((leaf) => leaf.view)
        .filter((view): view is DesignView => view instanceof DesignView)

    const findOpenView = (path: string): DesignView | undefined => {
      const normalized = normalizePath(path)
      return getOpenViews().find((view) => view.file?.path === normalized)
    }

    return {
      listDocuments: (): McpDocumentSummary[] => {
        const activeView = this.app.workspace.getActiveViewOfType(DesignView)
        const openByPath = new Map<string, DesignView>()
        for (const view of getOpenViews()) {
          if (view.file) openByPath.set(view.file.path, view)
        }
        return this.app.vault
          .getFiles()
          .filter(isDesignFile)
          .map((file) => {
            const view = openByPath.get(file.path)
            return {
              path: file.path,
              name: file.name,
              open: Boolean(view),
              active: Boolean(view && activeView === view),
              dirty: view?.isDirty() ?? false,
            }
          })
      },
      openDocument: async (path: string): Promise<McpDocumentSummary> => {
        const normalized = normalizePath(path)
        const file = this.app.vault.getAbstractFileByPath(normalized)
        if (!(file instanceof TFile)) {
          throw new Error(`Design file not found: ${normalized}`)
        }
        const leaf = this.app.workspace.getLeaf('tab')
        await leaf.openFile(file)
        return { path: file.path, name: file.name, open: true, active: true, dirty: false }
      },
      closeDocument: async (path: string, unsaved = 'error'): Promise<void> => {
        const normalized = normalizePath(path)
        let closed = false
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          const view = leaf.view
          if (view instanceof DesignView && view.file?.path === normalized) {
            if (view.isDirty()) {
              if (unsaved === 'save') {
                await view.save()
              } else if (unsaved === 'discard') {
                view.discardChanges()
              } else {
                throw new Error(`Document has unsaved changes: ${normalized}`)
              }
            }
            leaf.detach()
            closed = true
          }
        }
        if (!closed) {
          throw new Error(`Document is not open: ${normalized}`)
        }
      },
      activateDocument: async (path: string): Promise<void> => {
        const normalized = normalizePath(path)
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          const view = leaf.view
          if (view instanceof DesignView && view.file?.path === normalized) {
            this.app.workspace.setActiveLeaf(leaf, { focus: true })
            return
          }
        }
        throw new Error(`Document is not open: ${normalized}`)
      },
      createDocument: async (path: string): Promise<McpDocumentSummary> => {
        const normalized = normalizePath(path.endsWith('.fig') || path.endsWith('.pen') ? path : `${path}.fig`)
        if (this.app.vault.getAbstractFileByPath(normalized)) {
          throw new Error(`File already exists: ${normalized}`)
        }
        const mod = await this.loadEditor()
        const bytes = await mod.createEmptyDesignBytes(normalized.endsWith('.pen') ? 'pen' : 'fig')
        const file = await this.app.vault.createBinary(normalized, bytes.buffer as ArrayBuffer)
        const leaf = this.app.workspace.getLeaf('tab')
        await leaf.openFile(file)
        return { path: file.path, name: file.name, open: true, active: true, dirty: false }
      },
      saveDocument: async (path: string): Promise<void> => {
        const view = findOpenView(path)
        if (view) {
          await view.save()
          return
        }
        const normalized = normalizePath(path)
        if (!this.app.vault.getAbstractFileByPath(normalized)) {
          throw new Error(`Design file not found: ${normalized}`)
        }
      },
      listRecentDocuments: (): string[] => {
        return this.app.workspace
          .getLastOpenFiles()
          .filter(
            (p) =>
              (p.toLowerCase().endsWith('.fig') || p.toLowerCase().endsWith('.pen')) &&
              this.app.vault.getAbstractFileByPath(p) instanceof TFile,
          )
      },
      undo: async (path?: string): Promise<boolean> => {
        const view = path ? findOpenView(path) : this.app.workspace.getActiveViewOfType(DesignView)
        if (!view) {
          throw new Error('Document is not open; undo/redo only works in open tabs')
        }
        if (!view.canRunCommand('edit.undo')) return false
        view.runCommand('edit.undo')
        return true
      },
      redo: async (path?: string): Promise<boolean> => {
        const view = path ? findOpenView(path) : this.app.workspace.getActiveViewOfType(DesignView)
        if (!view) {
          throw new Error('Document is not open; undo/redo only works in open tabs')
        }
        if (!view.canRunCommand('edit.redo')) return false
        view.runCommand('edit.redo')
        return true
      },
      getSettings: (): Record<string, unknown> => ({
        snapToGeometry: this.settings.snapToGeometry,
        snapToObjects: this.settings.snapToObjects,
        snapToPixelGrid: this.settings.snapToPixelGrid,
        zoomSpeed: this.settings.zoomSpeed,
        mcpPort: this.settings.mcpPort,
      }),
      updateSettings: async (patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
        await this.updateSettings(patch as Partial<OpenPencilSettings>)
        return {
          snapToGeometry: this.settings.snapToGeometry,
          snapToObjects: this.settings.snapToObjects,
          snapToPixelGrid: this.settings.snapToPixelGrid,
          zoomSpeed: this.settings.zoomSpeed,
          mcpPort: this.settings.mcpPort,
        }
      },
      getCodegenPrompt: async (): Promise<string> => {
        const mod = await this.loadEditor()
        return mod.getCodegenPrompt()
      },
      executeCoreTool: async (command, args, documentPath) => {
        const targetView = documentPath
          ? findOpenView(documentPath)
          : this.app.workspace.getActiveViewOfType(DesignView)
        if (targetView) {
          return await targetView.executeMcpTool(command, args)
        }
        if (!documentPath) {
          throw new Error('No active design document. Pass document_id/path or open a .fig/.pen file.')
        }
        const normalized = normalizePath(documentPath)
        const file = this.app.vault.getAbstractFileByPath(normalized)
        if (!(file instanceof TFile)) {
          throw new Error(`Design file not found: ${normalized}`)
        }
        const mod = await this.loadEditor()
        const raw = new Uint8Array(await this.app.vault.readBinary(file))
        const ext = file.extension.toLowerCase() === 'pen' ? 'pen' : 'fig'
        const result = await mod.executeHeadlessTool(raw, ext, command, args)
        if (result.updatedBytes) {
          if (findOpenView(normalized)) {
            throw new Error(`Refusing headless write: ${normalized} is open in an Editor tab`)
          }
          console.debug('[OpenPencil MCP] headless write', {
            path: normalized,
            command,
            bytes: result.updatedBytes.byteLength,
            timestamp: new Date().toISOString(),
          })
          await this.app.vault.modifyBinary(file, result.updatedBytes.buffer as ArrayBuffer)
        }
        return result.output
      },
    }
  }

  private async createDesign(folder?: TFolder) {
    try {
      const mod = await this.loadEditor()
      const parent = folder ?? this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? '')
      const targetPath = (fileName: string) =>
        parent.isRoot() ? `${fileName}.fig` : normalizePath(`${parent.path}/${fileName}.fig`)
      let name = 'Untitled design'
      let path = targetPath(name)
      for (let i = 1; this.app.vault.getAbstractFileByPath(path); i++) {
        name = `Untitled design ${i}`
        path = targetPath(name)
      }
      const data = await mod.createBlankFig(name)
      const file = await this.app.vault.createBinary(path, toArrayBuffer(data))
      await this.app.workspace.getLeaf(true).openFile(file)
    } catch (e) {
      reportError('Could not create a design', e)
    }
  }
}

class DesignView extends FileView {
  private mounted: EditorModule.MountedEditor | null = null
  private host: HTMLElement | null = null
  private dirty = false
  private saving: Promise<void> | null = null
  private saveTimer: number | null = null
  /** The last bytes we wrote, so our own modify event does not reload the editor. */
  private lastWritten: number | null = null

  constructor(leaf: WorkspaceLeaf, private plugin: OpenPencilPlugin) {
    super(leaf)
    this.allowNoFile = false
    this.navigation = true
  }

  getViewType() {
    return VIEW_TYPE
  }
  getDisplayText() {
    return this.file?.basename ?? 'OpenPencil'
  }
  getIcon() {
    return 'pen-tool'
  }
  isFigActive(): boolean {
    return this.file?.extension === 'fig' && this.mounted !== null
  }
  canRunCommand(id: string): boolean {
    return this.mounted?.canRunCommand(id) ?? false
  }
  runCommand(id: string): void {
    this.mounted?.runCommand(id)
  }

  isDirty(): boolean {
    return this.dirty
  }

  discardChanges(): void {
    this.dirty = false
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  }

  async executeMcpTool(command: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.mounted) {
      throw new Error('Editor is not mounted yet')
    }
    const mod = await this.plugin.loadEditor()
    const { output, mutates } = await mod.executeEditorTool(this.mounted.editor, command, args)
    if (mutates) {
      this.markDirty()
    }
    return output
  }
  applySettings(next: OpenPencilSettings): void {
    this.mounted?.applySettings(next)
  }
  async placeVaultFile(file: TFile): Promise<void> {
    if (!this.mounted) return
    const bytes = await this.app.vault.readBinary(file)
    await this.mounted.placeFiles([toDroppedFile(file, bytes)])
  }
  private pickVaultImage(): Promise<File | null> {
    return new Promise((resolve) => {
      let chosen = false
      const modal = new PlaceFileModal(
        this.app,
        async (file) => {
          chosen = true
          try {
            const bytes = await this.app.vault.readBinary(file)
            resolve(toDroppedFile(file, bytes))
          } catch (e) {
            reportError('Could not read image', e)
            resolve(null)
          }
        },
        RASTER_EXTENSIONS,
        'Choose image from vault…',
      )
      modal.onClose = () => {
        setTimeout(() => {
          if (!chosen) resolve(null)
        }, 0)
      }
      modal.open()
    })
  }
  private async resolveDropFiles(dt: DataTransfer): Promise<File[] | null> {
    const draggable = (this.app as unknown as { dragManager?: { draggable?: { type?: string; file?: unknown } } }).dragManager?.draggable
    if (draggable?.type === 'file' && draggable.file instanceof TFile) {
      const bytes = await this.app.vault.readBinary(draggable.file)
      return [toDroppedFile(draggable.file, bytes)]
    }
    const raw = dt.getData('text/plain')?.trim()
    if (!raw) return null
    let targetPath: string | null = null
    if (raw.startsWith('obsidian://')) {
      try {
        targetPath = new URL(raw).searchParams.get('file')
      } catch {
        targetPath = null
      }
    } else if (raw.startsWith('[[') && raw.endsWith(']]')) {
      targetPath = raw.slice(2, -2).split('|')[0]?.trim() ?? null
    }
    if (!targetPath) return null
    const abstract = this.app.vault.getAbstractFileByPath(targetPath) ?? this.app.metadataCache.getFirstLinkpathDest(targetPath, '')
    if (!(abstract instanceof TFile)) return null
    const bytes = await this.app.vault.readBinary(abstract)
    return [toDroppedFile(abstract, bytes)]
  }
  canAcceptExtension(extension: string) {
    return (EXTENSIONS as readonly string[]).includes(extension)
  }

  async onOpen() {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => this.mounted?.setActive(leaf === this.leaf)),
    )
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file !== this.file || !(file instanceof TFile)) return
        if (this.lastWritten !== null && file.stat.mtime <= this.lastWritten + 50) return
        if (this.dirty) {
          new Notice(`${file.name} changed on disk while you were editing; your version is kept.`)
          return
        }
        void this.onLoadFile(file) // changed elsewhere (sync, another app): reload
      }),
    )
  }

  async onLoadFile(file: TFile) {
    this.teardown()
    const host = this.contentEl.createDiv({ cls: 'openpencil-host' })
    this.host = host
    const loading = host.createDiv({ cls: 'openpencil-loading', text: `Opening ${file.name}…` })

    try {
      const [mod, data] = await Promise.all([this.plugin.loadEditor(), this.app.vault.readBinary(file)])
      if (this.host !== host) return // another file was opened meanwhile
      loading.remove()
      console.info(`[openpencil] mounting ${file.name}`)
      const mounting = mod.mountEditor(host, {
        data: new Uint8Array(data),
        fileName: file.name,
        extension: file.extension as EditorModule.DesignExtension,
        readAsset: (rel) => this.readSibling(file, rel),
        onChange: () => {
          if (!Platform.isMobile) this.markDirty()
        },
        onSaveRequest: () => {
          if (!Platform.isMobile) void this.save()
        },
        previewOnly: Platform.isMobile,
        writeExport: (name, bytes) => this.writeExport(file, name, bytes),
        showContextMenu: (entries, pos) => this.showContextMenu(entries, pos),
        notify: (msg) => new Notice(msg),
        resolveDropFiles: (dt) => this.resolveDropFiles(dt),
        pickImage: () => this.pickVaultImage(),
        initialSettings: this.plugin.settings,
      })
      // On Android a mount that never settles left the view blank with no error, so it gets a limit there.
      this.mounted = Platform.isAndroidApp
        ? await withTimeout(mounting, MOUNT_TIMEOUT_MS, `the editor did not start within ${MOUNT_TIMEOUT_MS / 1000} seconds`)
        : await mounting
      console.info(`[openpencil] mounted ${file.name}`)
      this.mounted.setActive(this.app.workspace.getActiveViewOfType(DesignView) === this)
    } catch (e) {
      loading.setText('')
      const detail = e instanceof EditorLoadError
        ? editorFailureText(e.original, this.plugin.manifest.version, Platform.isAndroidApp)
        : `OpenPencil v${this.plugin.manifest.version}: ${message(e)}`
      host.createDiv({ cls: 'openpencil-error', text: `OpenPencil could not open ${file.name}: ${detail}` })
      if (Platform.isMobile) new Notice(detail, 10000)
      console.error('[openpencil]', e)
    }
  }

  async onUnloadFile(_file: TFile) {
    await this.flush()
    this.teardown()
  }

  async onClose() {
    await this.flush()
    this.teardown()
  }

  private markDirty() {
    if (Platform.isMobile) return
    if (!this.mounted?.canWrite) return // OpenPencil cannot write this format back
    this.dirty = true
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => void this.save(), AUTOSAVE_MS)
  }

  private async flush() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer)
    this.saveTimer = null
    if (this.dirty) await this.save()
    else await this.saving
  }

  async save(): Promise<void> {
    if (Platform.isMobile) return
    const file = this.file
    const mounted = this.mounted
    if (!file || !mounted) return
    if (!mounted.canWrite) {
      new Notice(`OpenPencil cannot write .${file.extension} files. Use “Save as .fig”.`)
      return
    }
    if (this.saving) return this.saving.then(() => (this.dirty ? this.save() : undefined))
    this.dirty = false
    this.saving = (async () => {
      try {
        const bytes = await mounted.exportNative(file.basename)
        this.lastWritten = Date.now()
        await this.app.vault.modifyBinary(file, toArrayBuffer(bytes))
      } catch (e) {
        this.dirty = true
        reportError(`Could not save ${file.name}`, e)
      } finally {
        this.saving = null
      }
    })()
    return this.saving
  }

  /** Writes an exported image next to the design, overwriting an existing file of the same name. */
  async writeExport(file: TFile, name: string, bytes: Uint8Array): Promise<string> {
    const base = file.parent?.path ?? ''
    const path = base ? normalizePath(`${base}/${name}`) : normalizePath(name)
    const existing = this.app.vault.getAbstractFileByPath(path)
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, toArrayBuffer(bytes))
      new Notice(`Replaced ${existing.path}`)
      return existing.path
    }
    if (existing) {
      throw new Error(`Cannot overwrite non-file at ${path}`)
    }
    const created = await this.app.vault.createBinary(path, toArrayBuffer(bytes))
    new Notice(`Exported ${created.path}`)
    return created.path
  }

  async saveAsFig() {
    const file = this.file
    if (!file || !this.mounted) return
    const base = file.parent?.path ?? ''
    let path = normalizePath(`${base}/${file.basename}.fig`)
    for (let i = 1; this.app.vault.getAbstractFileByPath(path); i++) {
      path = normalizePath(`${base}/${file.basename} ${i}.fig`)
    }
    try {
      const bytes = await this.mounted.exportFig(file.basename)
      const created = await this.app.vault.createBinary(path, toArrayBuffer(bytes))
      new Notice(`Saved ${created.name}`)
      await this.leaf.openFile(created)
    } catch (e) {
      reportError('Could not save as .fig', e)
    }
  }

  private async readSibling(file: TFile, rel: string): Promise<Uint8Array | null> {
    const path = normalizePath(`${file.parent?.path ?? ''}/${rel}`)
    const target = this.app.vault.getAbstractFileByPath(path)
    if (!(target instanceof TFile)) return null
    return new Uint8Array(await this.app.vault.readBinary(target))
  }

  private showContextMenu(entries: EditorModule.ContextMenuEntry[], pos: { x: number; y: number }) {
    const menu = new Menu()
    menu.setNoIcon()
    this.populateMenu(menu, entries, pos)
    menu.showAtPosition(pos)
  }

  private populateMenu(menu: Menu, entries: EditorModule.ContextMenuEntry[], pos: { x: number; y: number }) {
    for (const entry of entries) {
      if (entry.separator) {
        menu.addSeparator()
        continue
      }
      const actionEntry = entry
      menu.addItem((item) => {
        item.setTitle(menuTitle(actionEntry.label, actionEntry.shortcut))
        if (actionEntry.disabled) item.setDisabled(true)
        if (actionEntry.checked) item.setChecked(true)
        if (actionEntry.sub?.length) {
          const setSubmenu = (item as MenuItem & { setSubmenu?: () => Menu }).setSubmenu
          if (typeof setSubmenu === 'function') {
            const subMenu = setSubmenu.call(item)
            subMenu.setNoIcon()
            this.populateMenu(subMenu, actionEntry.sub, pos)
          } else {
            item.onClick(() => this.showContextMenu(actionEntry.sub!, pos))
          }
        } else if (actionEntry.action) {
          item.onClick(() => actionEntry.action!())
        }
      })
    }
  }

  private teardown() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.dirty = false
    try {
      this.mounted?.destroy()
    } catch (e) {
      console.warn('[openpencil] teardown', e)
    }
    this.mounted = null
    this.host = null
    this.contentEl.empty()
  }
}

const RASTER_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'])
const PLACEABLE_EXTENSIONS = new Set([...RASTER_EXTENSIONS, 'svg'])
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

function toDroppedFile(file: TFile, bytes: ArrayBuffer): File {
  return new File([bytes], file.name, { type: MIME_BY_EXT[file.extension.toLowerCase()] ?? 'application/octet-stream' })
}

class OpenPencilSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: OpenPencilPlugin) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName('Snap to geometry')
      .setDesc('Snap layers and vector points to nearby geometry while dragging.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.snapToGeometry).onChange((value) => {
          void this.plugin.updateSettings({ snapToGeometry: value })
        }),
      )

    new Setting(containerEl)
      .setName('Snap to objects')
      .setDesc('Snap moving layers to edges and centres of sibling layers.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.snapToObjects).onChange((value) => {
          void this.plugin.updateSettings({ snapToObjects: value })
        }),
      )

    new Setting(containerEl)
      .setName('Snap to pixel grid')
      .setDesc('Align moved layers, resized edges, and vector points to whole pixels.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.snapToPixelGrid).onChange((value) => {
          void this.plugin.updateSettings({ snapToPixelGrid: value })
        }),
      )

    new Setting(containerEl)
      .setName('Zoom speed')
      .setDesc('Multiplier for mouse wheel and trackpad pinch zoom speed.')
      .addSlider((slider) =>
        slider
          .setLimits(0.25, 3, 0.25)
          .setValue(this.plugin.settings.zoomSpeed)
          .setDynamicTooltip()
          .onChange((value) => {
            void this.plugin.updateSettings({ zoomSpeed: value })
          }),
      )

    new Setting(containerEl)
      .setName('Iconify import')
      .setDesc('Search and insert icons from Iconify. Needs an internet connection; offline, the icon search shows nothing.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.iconifyImport).onChange((value) => {
          void this.plugin.updateSettings({ iconifyImport: value })
        }),
      )

    containerEl.createEl('h3', { text: 'MCP Server' })

    if (!Platform.isDesktopApp) {
      containerEl.createEl('p', {
        text: 'The in-plugin MCP server is only available on desktop Obsidian.',
        cls: 'setting-item-description',
      })
      return
    }

    const status = this.plugin.getMcpStatus()
    const statusText = status.running
      ? `Running — ${status.address}`
      : `Stopped${status.error ? ` (${status.error})` : ''}`

    const statusSetting = new Setting(containerEl).setName('Server status').setDesc(statusText)

    let snippetCodeEl: HTMLElement | null = null
    const buildSnippet = () =>
      JSON.stringify(
        {
          mcpServers: {
            'openpencil-obsidian': {
              type: 'http',
              url: `http://127.0.0.1:${this.plugin.settings.mcpPort}/mcp`,
              headers: {
                Authorization: `Bearer ${this.plugin.settings.mcpToken}`,
              },
            },
          },
        },
        null,
        2,
      )

    new Setting(containerEl)
      .setName('Port')
      .setDesc('Local TCP port on 127.0.0.1 (1024–65535). Changing it restarts the server.')
      .addText((text) =>
        text
          .setPlaceholder('3978')
          .setValue(String(this.plugin.settings.mcpPort))
          .onChange((value) => {
            const parsed = Number.parseInt(value.trim(), 10)
            if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535) {
              void this.plugin.updateSettings({ mcpPort: parsed }).then(() => {
                const next = this.plugin.getMcpStatus()
                statusSetting.setDesc(
                  next.running
                    ? `Running — ${next.address}`
                    : `Stopped${next.error ? ` (${next.error})` : ''}`,
                )
                if (snippetCodeEl) snippetCodeEl.setText(buildSnippet())
              })
            }
          }),
      )

    new Setting(containerEl)
      .setName('Auth token')
      .setDesc(
        'Warning: the token is stored in data.json inside your vault; syncing or publishing the vault will carry it.',
      )
      .addButton((btn) =>
        btn.setButtonText('Regenerate token').onClick(() => {
          void this.plugin.regenerateMcpToken().then(() => {
            if (snippetCodeEl) snippetCodeEl.setText(buildSnippet())
            new Notice('MCP auth token regenerated')
          })
        }),
      )

    const snippetSetting = new Setting(containerEl)
      .setName('Client config snippet')
      .setDesc('Paste into Claude Code or another StreamableHTTP MCP client.')
      .addButton((btn) =>
        btn.setButtonText('Copy').onClick(() => {
          void navigator.clipboard.writeText(buildSnippet()).then(() => {
            btn.setButtonText('Copied')
            window.setTimeout(() => btn.setButtonText('Copy'), 1500)
          })
        }),
      )

    const pre = snippetSetting.settingEl.createEl('pre', { cls: 'openpencil-mcp-snippet' })
    pre.style.userSelect = 'all'
    pre.style.overflowX = 'auto'
    pre.style.marginTop = '8px'
    snippetCodeEl = pre.createEl('code', { text: buildSnippet() })
  }
}

class PlaceFileModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private onPick: (file: TFile) => void,
    private extensions: Set<string> = PLACEABLE_EXTENSIONS,
    placeholder = 'Place image or SVG from vault…',
  ) {
    super(app)
    this.setPlaceholder(placeholder)
  }
  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((f) => this.extensions.has(f.extension.toLowerCase()))
  }
  getItemText(file: TFile): string {
    return file.path
  }
  onChooseItem(file: TFile): void {
    this.onPick(file)
  }
}

function menuTitle(label: string, shortcut?: string): string | DocumentFragment {
  if (!shortcut) return label
  const frag = document.createDocumentFragment()
  const title = document.createElement('span')
  title.className = 'op-menu-label'
  title.textContent = label
  const kbd = document.createElement('span')
  kbd.className = 'op-menu-kbd'
  kbd.textContent = shortcut
  frag.append(title, '  ', kbd)
  return frag
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
function message(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}
function reportError(prefix: string, e: unknown) {
  console.error('[openpencil]', prefix, e)
  new Notice(`${prefix}: ${message(e)}`)
}
