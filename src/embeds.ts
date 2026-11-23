import { extractFigThumbnailFromReader, type FigRangeReader } from '@open-pencil/fig'
import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { editorInfoField, editorLivePreviewField, MarkdownRenderChild, TFile, type App, type MarkdownPostProcessorContext } from 'obsidian'

const EMBED_EXTENSIONS = new Set(['fig', 'pen'])
const EMBED_LINK_RE = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g

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

/** Reading View markdown post-processor for `![[design.fig]]` and `![[design.pen]]`. */
export function processDesignEmbeds(app: App, manager: DesignEmbedManager, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const embeds = el.matches('.internal-embed') ? [el] : Array.from(el.querySelectorAll<HTMLElement>('.internal-embed'))
  for (const embedEl of embeds) {
    const src = embedEl.getAttribute('src')
    if (!src) continue
    const file = resolveDesignEmbed(app, src, ctx.sourcePath)
    if (!file) continue
    const host = embedEl.createDiv()
    embedEl.empty()
    embedEl.appendChild(host)
    const cleanup = manager.mountEmbed(host, file)
    const child = new MarkdownRenderChild(host)
    child.onunload = cleanup
    ctx.addChild(child)
  }
}

class DesignEmbedWidget extends WidgetType {
  private cleanup: (() => void) | null = null

  constructor(
    private file: TFile,
    private manager: DesignEmbedManager,
  ) {
    super()
  }

  override eq(other: DesignEmbedWidget): boolean {
    return this.file.path === other.file.path
  }

  toDOM(): HTMLElement {
    const el = document.createElement('div')
    this.cleanup = this.manager.mountEmbed(el, this.file)
    return el
  }

  override destroy(): void {
    this.cleanup?.()
    this.cleanup = null
  }
}

function buildLivePreviewDecorations(app: App, manager: DesignEmbedManager, state: EditorState): DecorationSet {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none
  const sourcePath = state.field(editorInfoField, false)?.file?.path ?? ''
  const selection = state.selection.main
  const builder = new RangeSetBuilder<Decoration>()
  const text = state.doc.toString()
  EMBED_LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = EMBED_LINK_RE.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (selection.from <= to && selection.to >= from) continue
    const file = resolveDesignEmbed(app, match[1] ?? '', sourcePath)
    if (!file) continue
    builder.add(from, to, Decoration.replace({ widget: new DesignEmbedWidget(file, manager) }))
  }
  return builder.finish()
}

/** CodeMirror 6 Live Preview extension for `.fig`/`.pen` embeds. */
export function createDesignEmbedExtension(app: App, manager: DesignEmbedManager) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLivePreviewDecorations(app, manager, state)
    },
    update(decorations, tr) {
      if (tr.docChanged || tr.selection || tr.reconfigured) {
        return buildLivePreviewDecorations(app, manager, tr.state)
      }
      return decorations
    },
    provide(field) {
      return EditorView.decorations.from(field)
    },
  })
}
