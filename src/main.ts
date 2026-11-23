// The Obsidian side: registers a view for .fig/.pen files and loads the ES-module editor bundle
// (editor/editor.js) on first use, unpacking it from main.js into the plugin folder if needed.
import {
  App,
  FileView,
  FuzzySuggestModal,
  Menu,
  MenuItem,
  Notice,
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

export const VIEW_TYPE = 'openpencil-design'
const EXTENSIONS = ['fig', 'pen'] as const
const AUTOSAVE_MS = 1500

export default class OpenPencilPlugin extends Plugin {
  private editorModule: Promise<typeof EditorModule> | null = null
  private embedManager: DesignEmbedManager | null = null
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
  }

  onunload() {
    this.embedManager?.destroy()
    this.embedManager = null
  }

  /** Loads the editor bundle once. A dynamic import of the plugin folder's own URL keeps
   *  import.meta.url pointing there, so OpenPencil finds its .wasm and font files. */
  loadEditor(): Promise<typeof EditorModule> {
    if (!this.editorModule) {
      const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`
      const adapter = this.app.vault.adapter
      this.editorModule = ensureEditorUnpacked(adapter, dir).then((editorDir) => {
        // Obsidian appends ?<mtime> to resource URLs, so an updated bundle is not served from cache.
        const url = adapter.getResourcePath(normalizePath(`${editorDir}/editor.js`))
        return import(/* @vite-ignore */ url) as Promise<typeof EditorModule>
      })
      this.editorModule.catch(() => (this.editorModule = null))
    }
    return this.editorModule
  }

  async updateSettings(patch: Partial<OpenPencilSettings>): Promise<void> {
    this.settings = sanitizeSettings({ ...this.settings, ...patch })
    await this.saveData(this.settings)
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof DesignView) leaf.view.applySettings(this.settings)
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
  applySettings(next: OpenPencilSettings): void {
    this.mounted?.applySettings(next)
  }
  async placeVaultFile(file: TFile): Promise<void> {
    if (!this.mounted) return
    const bytes = await this.app.vault.readBinary(file)
    await this.mounted.placeFiles([toDroppedFile(file, bytes)])
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
      this.mounted = await mod.mountEditor(host, {
        data: new Uint8Array(data),
        fileName: file.name,
        extension: file.extension as EditorModule.DesignExtension,
        readAsset: (rel) => this.readSibling(file, rel),
        onChange: () => this.markDirty(),
        onSaveRequest: () => void this.save(),
        writeExport: (name, bytes) => this.writeExport(file, name, bytes),
        showContextMenu: (entries, pos) => this.showContextMenu(entries, pos),
        notify: (msg) => new Notice(msg),
        resolveDropFiles: (dt) => this.resolveDropFiles(dt),
        initialSettings: this.plugin.settings,
      })
      this.mounted.setActive(this.app.workspace.getActiveViewOfType(DesignView) === this)
    } catch (e) {
      loading.setText('')
      host.createDiv({ cls: 'openpencil-error', text: `OpenPencil could not open ${file.name}: ${message(e)}` })
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

const PLACEABLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'])
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
  }
}

class PlaceFileModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private onPick: (file: TFile) => void) {
    super(app)
    this.setPlaceholder('Place image or SVG from vault…')
  }
  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((f) => PLACEABLE_EXTENSIONS.has(f.extension.toLowerCase()))
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
