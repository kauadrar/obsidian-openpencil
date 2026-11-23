import { extractFigThumbnailFromReader, type FigRangeReader } from '@open-pencil/fig'
import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view'
import { editorInfoField, editorLivePreviewField, MarkdownRenderChild, TFile, type App, type MarkdownPostProcessorContext } from 'obsidian'

const EMBED_EXTENSIONS = new Set(['fig', 'pen'])

interface CacheEntry {
  mtime: number
  url: string | null
}

/** Manages lazy thumbnail extraction, blob URL caching, and live refresh for .fig/.pen embeds. */
export class DesignEmbedManager {
  private cache = new Map<string, CacheEntry>()
  private inflight = new Map<string, Promise<string | null>>()
  private listeners = new Map<string, Set<() => void>>()
  private observer: IntersectionObserver | null = null
  private visibleCallbacks = new WeakMap<Element, () => void>()

  constructor(private app: App) {
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const cb = this.visibleCallbacks.get(entry.target)
            if (cb) {
              this.observer?.unobserve(entry.target)
              this.visibleCallbacks.delete(entry.target)
              cb()
            }
          }
        },
        { rootMargin: '200px' },
      )
    }
  }

  /** Invalidates cached thumbnail for `path` and refreshes any mounted embeds for it. */
  refreshPath(path: string): void {
    const existing = this.cache.get(path)
    if (existing?.url) URL.revokeObjectURL(existing.url)
    this.cache.delete(path)
    this.inflight.delete(path)
    const set = this.listeners.get(path)
    if (set) {
      for (const fn of set) fn()
    }
  }

  /** Releases all cached blob URLs and observers on plugin unload. */
  destroy(): void {
    this.observer?.disconnect()
    this.observer = null
    for (const entry of this.cache.values()) {
      if (entry.url) URL.revokeObjectURL(entry.url)
    }
    this.cache.clear()
    this.inflight.clear()
    this.listeners.clear()
  }

  /** Attaches a lazy-loaded, click-to-open, modify-aware preview into `container`. */
  mountEmbed(container: HTMLElement, file: TFile): () => void {
    container.empty()
    container.addClass('openpencil-embed')
    container.setAttribute('aria-label', `Open ${file.name} in OpenPencil`)
    container.tabIndex = 0

    let disposed = false
    let loaded = false

    const render = async () => {
      if (disposed) return
      const url = await this.getThumbnailUrl(file)
      if (disposed) return
      container.empty()
      if (url) {
        const img = container.createEl('img', { cls: 'openpencil-embed-img', attr: { src: url, alt: file.basename } })
        img.draggable = false
      } else {
        const box = container.createDiv({ cls: 'openpencil-embed-placeholder' })
        box.createDiv({ cls: 'openpencil-embed-title', text: file.name })
        box.createDiv({ cls: 'openpencil-embed-subtitle', text: 'No preview. Open the file to see it.' })
      }
    }

    const triggerLoad = () => {
      if (disposed) return
      loaded = true
      void render()
    }

    const onModify = () => {
      if (disposed) return
      if (loaded) void render()
    }

    let set = this.listeners.get(file.path)
    if (!set) {
      set = new Set()
      this.listeners.set(file.path, set)
    }
    set.add(onModify)

    const openFile = (e: MouseEvent | KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const newTab = 'metaKey' in e && (e.metaKey || e.ctrlKey)
      void this.app.workspace.getLeaf(newTab).openFile(file)
    }
    container.addEventListener('click', openFile)
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openFile(e)
    })

    if (this.observer) {
      this.visibleCallbacks.set(container, triggerLoad)
      this.observer.observe(container)
    } else {
      triggerLoad()
    }

    return () => {
      disposed = true
      this.observer?.unobserve(container)
      this.visibleCallbacks.delete(container)
      const listeners = this.listeners.get(file.path)
      listeners?.delete(onModify)
      if (listeners?.size === 0) this.listeners.delete(file.path)
    }
  }

  private async getThumbnailUrl(file: TFile): Promise<string | null> {
    if (file.extension.toLowerCase() !== 'fig') return null
    const cached = this.cache.get(file.path)
    if (cached && cached.mtime === file.stat.mtime) return cached.url

    const pending = this.inflight.get(file.path)
    if (pending) return pending

    const task = (async () => {
      try {
        const buf = await this.app.vault.readBinary(file)
        const bytes = new Uint8Array(buf)
        const reader: FigRangeReader = {
          size: bytes.byteLength,
          read: (start, endExclusive) => Promise.resolve(bytes.subarray(start, endExclusive)),
        }
        const png = await extractFigThumbnailFromReader(reader)
        const url = png ? URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })) : null
        const prev = this.cache.get(file.path)
        if (prev?.url && prev.url !== url) URL.revokeObjectURL(prev.url)
        this.cache.set(file.path, { mtime: file.stat.mtime, url })
        return url
      } catch {
        return null
      } finally {
        this.inflight.delete(file.path)
      }
    })()

    this.inflight.set(file.path, task)
    return task
  }
}

/** Resolves an embed `src` (like `design.fig` or `folder/design.fig#Page`) to a `.fig`/`.pen` TFile. */
export function resolveDesignEmbed(app: App, rawSrc: string, sourcePath: string): TFile | null {
  const linkpath = rawSrc.split('#')[0]?.split('|')[0]?.trim()
  if (!linkpath) return null
  const target = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)
  if (!(target instanceof TFile)) return null
  return EMBED_EXTENSIONS.has(target.extension.toLowerCase()) ? target : null
}

/**
 * Replaces an `.internal-embed` element's contents with our `.openpencil-embed` preview and
 * re-applies if Obsidian's async `file-embed` loader overwrites its children afterward.
 */
function enhanceInternalEmbed(
  app: App,
  manager: DesignEmbedManager,
  embedEl: HTMLElement,
  sourcePath: string,
): (() => void) | null {
  const src = embedEl.getAttribute('src')
  if (!src) return null
  const file = resolveDesignEmbed(app, src, sourcePath)
  if (!file) return null

  let unmount: (() => void) | null = null
  let mounting = false

  const apply = () => {
    if (mounting) return
    if (embedEl.querySelector(':scope > .openpencil-embed')) return
    mounting = true
    try {
      unmount?.()
      embedEl.empty()
      const host = embedEl.createDiv()
      unmount = manager.mountEmbed(host, file)
    } finally {
      mounting = false
    }
  }

  apply()

  const mo = new MutationObserver(() => apply())
  mo.observe(embedEl, { childList: true })

  return () => {
    mo.disconnect()
    unmount?.()
    unmount = null
  }
}

/** Reading View markdown post-processor for `![[design.fig]]` and `![[design.pen]]`. */
export function processDesignEmbeds(app: App, manager: DesignEmbedManager, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const embeds = el.matches('.internal-embed') ? [el] : Array.from(el.querySelectorAll<HTMLElement>('.internal-embed'))
  for (const embedEl of embeds) {
    const cleanup = enhanceInternalEmbed(app, manager, embedEl, ctx.sourcePath)
    if (!cleanup) continue
    const child = new MarkdownRenderChild(embedEl)
    child.onunload = cleanup
    ctx.addChild(child)
  }
}

/** CodeMirror 6 Live Preview extension that replaces Obsidian's generic `.internal-embed` cards for `.fig`/`.pen`. */
export function createDesignEmbedExtension(app: App, manager: DesignEmbedManager) {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      private cleanups = new Map<HTMLElement, () => void>()
      private mo: MutationObserver

      constructor(private view: EditorView) {
        this.mo = new MutationObserver(() => this.scan())
        this.mo.observe(this.view.contentDOM, { childList: true, subtree: true })
        this.scan()
      }

      update(): void {
        this.scan()
      }

      private scan(): void {
        const isLivePreview = this.view.state.field(editorLivePreviewField, false)
        if (!isLivePreview) {
          this.clearAll()
          return
        }
        const sourcePath = this.view.state.field(editorInfoField, false)?.file?.path ?? ''
        const active = new Set(this.view.contentDOM.querySelectorAll<HTMLElement>('.internal-embed'))
        for (const [el, cleanup] of this.cleanups) {
          if (!active.has(el)) {
            cleanup()
            this.cleanups.delete(el)
          }
        }
        for (const el of active) {
          if (this.cleanups.has(el)) continue
          const cleanup = enhanceInternalEmbed(app, manager, el, sourcePath)
          if (cleanup) this.cleanups.set(el, cleanup)
        }
      }

      private clearAll(): void {
        for (const cleanup of this.cleanups.values()) cleanup()
        this.cleanups.clear()
      }

      destroy(): void {
        this.mo.disconnect()
        this.clearAll()
      }
    },
  )
}
