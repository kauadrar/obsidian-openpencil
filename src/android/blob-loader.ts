// Option B runtime: loads the editor's files as blob URLs, in dependency order, and installs the shims that map
// the editor's op-blob URLs back to them. Nothing here imports from the Capacitor file URL: the caller reads
// the files through the vault adapter and passes them in.
import { dependencyOrder, readImports, rewriteChunk } from './blob-graph'

/** One file of the editor folder: `text` for a .js chunk, `bytes` for anything else (wasm, fonts). */
export interface EditorFile {
  path: string
  text?: string
  bytes?: Uint8Array
}

export interface LoadedEditor {
  /** The blob URL of editor.js, to import. */
  entryUrl: string
  /** Revokes every blob URL and restores the globals the shims replaced. */
  dispose(): void
}

const MIME: Record<string, string> = {
  js: 'text/javascript',
  wasm: 'application/wasm',
  ttf: 'font/ttf',
  woff2: 'font/woff2',
  json: 'application/json',
}

/**
 * The shims, as one self-contained function: it is also serialised into each worker, so it must not refer to
 * anything outside its own body. `map` holds the blob URL of every file, by path.
 */
export function installBlobShim(map: Record<string, string>): void {
  const SCHEME = 'op-blob:'
  const isOp = (u: string) => u.startsWith(SCHEME + '/')
  const blobOf = (u: string) => {
    const path = u.slice(SCHEME.length + 1)
    const url = map[path]
    if (!url) throw new Error(`Missing editor file: ${path}`)
    return url
  }
  const g = globalThis as unknown as Record<string, unknown>
  g.__opMap = map
  g.__opImport = (spec: string) => import(/* @vite-ignore */ (isOp(spec) ? blobOf(spec) : spec) as string)
  g.__opMetaResolve = (self: string, spec: string) => {
    if (spec.startsWith('./') || spec.startsWith('../')) return new URL(spec, self).href
    throw new TypeError(`Cannot resolve module specifier "${spec}" in the editor`)
  }
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    return realFetch(isOp(u) ? blobOf(u) : input, init)
  }) as typeof fetch
  const RealWorker = globalThis.Worker
  if (RealWorker) {
    globalThis.Worker = class extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        const s = String(url)
        // The worker's own realm needs the shims too: a bootstrap module installs them, then runs the chunk.
        const bootUrl = isOp(s)
          ? URL.createObjectURL(new Blob([`(${installBlobShim.toString()})(${JSON.stringify(map)});await import(${JSON.stringify(blobOf(s))});`], { type: 'text/javascript' }))
          : url
        super(bootUrl, options)
      }
    } as unknown as typeof Worker
  }
}

/**
 * Creates a blob for every file (chunks in dependency order, so each one's static imports already have URLs),
 * installs the shims, and returns the URL of editor.js. Throws on an import cycle, or a chunk whose static import
 * is missing from `files`.
 */
export function loadEditorBlobs(files: readonly EditorFile[], entry = 'editor.js'): LoadedEditor {
  const chunks = new Map(files.filter((f) => f.text !== undefined).map((f) => [f.path, f.text as string]))
  const staticDeps = new Map<string, string[]>()
  for (const [path, text] of chunks) staticDeps.set(path, readImports(text, path).static)
  const order = dependencyOrder(staticDeps)

  const blobs = new Map<string, string>()
  const made: string[] = []
  const blobUrlOf = (path: string): string => {
    const url = blobs.get(path)
    if (!url) throw new Error(`Editor chunk ${path} is needed before it is loaded`)
    return url
  }
  const mint = (path: string, body: BlobPart) => {
    const ext = path.slice(path.lastIndexOf('.') + 1)
    const url = URL.createObjectURL(new Blob([body], { type: MIME[ext] ?? 'application/octet-stream' }))
    blobs.set(path, url)
    made.push(url)
  }

  for (const f of files) if (f.text === undefined && f.bytes) mint(f.path, f.bytes as BlobPart)
  for (const path of order) mint(path, rewriteChunk(chunks.get(path) as string, path, { blobUrlOf }))

  const map: Record<string, string> = Object.fromEntries(blobs)
  const realFetch = globalThis.fetch
  const realWorker = globalThis.Worker
  installBlobShim(map)

  if (!blobs.has(entry)) throw new Error(`Editor entry ${entry} is missing`)
  return {
    entryUrl: blobs.get(entry) as string,
    dispose() {
      for (const url of made) URL.revokeObjectURL(url)
      globalThis.fetch = realFetch
      globalThis.Worker = realWorker
    },
  }
}
