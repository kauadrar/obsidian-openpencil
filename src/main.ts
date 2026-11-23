// The Obsidian side: registers a view for .fig/.pen files and loads the ES-module editor bundle
// (editor/editor.js) on first use, unpacking it from main.js into the plugin folder if needed.
import {
  FileView,
  Menu,
  MenuItem,
  Notice,
  Plugin,
  TFile,
  normalizePath,
  type WorkspaceLeaf,
} from 'obsidian'
import type * as EditorModule from './editor/index'
import { PLUGIN_COMMANDS } from './commands'
import { ensureEditorUnpacked } from './unpack'

export const VIEW_TYPE = 'openpencil-design'
const EXTENSIONS = ['fig', 'pen'] as const
const AUTOSAVE_MS = 1500

export default class OpenPencilPlugin extends Plugin {
  private editorModule: Promise<typeof EditorModule> | null = null

  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new DesignView(leaf, this))
    this.registerExtensions([...EXTENSIONS], VIEW_TYPE)

    this.addRibbonIcon('pen-tool', 'New OpenPencil design', () => this.createDesign())
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
          if (!view?.isFigActive() || !view.canRunCommand(cmd.id)) return false
          if (!checking) view.runCommand(cmd.id)
          return true
        },
      })
    }
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

  private async createDesign() {
    try {
      const mod = await this.loadEditor()
      const parent = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? '')
      let name = 'Untitled design'
      let path = normalizePath(`${parent.path}/${name}.fig`)
      for (let i = 1; this.app.vault.getAbstractFileByPath(path); i++) {
        name = `Untitled design ${i}`
        path = normalizePath(`${parent.path}/${name}.fig`)
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

  /** Writes an exported image next to the design, numbering the name when it is taken. */
  async writeExport(file: TFile, name: string, bytes: Uint8Array): Promise<string> {
    const base = file.parent?.path ?? ''
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let path = normalizePath(`${base}/${name}`)
    for (let i = 1; this.app.vault.getAbstractFileByPath(path); i++) {
      path = normalizePath(`${base}/${stem} ${i}${ext}`)
    }
    const created = await this.app.vault.createBinary(path, toArrayBuffer(bytes))
    new Notice(`Exported ${created.name}`)
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
