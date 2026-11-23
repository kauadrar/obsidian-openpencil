// Option B: load the editor's chunks as blob URLs, so no module import crosses the Android WebView's file
// boundary. This file is the pure part: it reads a module's imports and rewrites them. A chunk's path is
// its path inside the editor folder, such as "chunks/layout-abc.js". No imports, so the node test runner can
// load it directly.

/** The scheme a chunk's own URL uses inside the editor, such as op-blob:/chunks/layout-abc.js. */
export const OP_SCHEME = 'op-blob:'

/** The virtual URL of a chunk. `new URL('../x', opUrl(path))` resolves inside the editor. */
export function opUrl(path: string): string {
  return `${OP_SCHEME}/${path}`
}

/** Resolves a relative specifier against the directory of `fromPath` (both paths relative to the editor folder). */
export function resolveRelative(fromPath: string, specifier: string): string {
  const parts = fromPath.split('/').slice(0, -1)
  for (const seg of specifier.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

export interface ModuleImports {
  /** Relative specifiers of static `import … from` / `export … from` / `import '…'`, resolved to chunk paths. */
  static: string[]
  /** Relative specifiers of dynamic `import(…)` calls, resolved to chunk paths. */
  dynamic: string[]
}

const STATIC_RE = /(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g
const DYNAMIC_RE = /\bimport\(\s*[`"'](\.{1,2}\/[^`"']+)[`"']\s*\)/g
const DYNAMIC_LITERAL_RE = /\bimport\(\s*([`"'])(\.{1,2}\/[^`"']+)\1\s*\)/g

/** Reads a chunk's relative imports. Bare specifiers (packages, node: builtins) are not chunks and are left alone. */
export function readImports(source: string, fromPath: string): ModuleImports {
  const stat = new Set<string>()
  const dyn = new Set<string>()
  for (const m of source.matchAll(STATIC_RE)) stat.add(resolveRelative(fromPath, m[1]!))
  for (const m of source.matchAll(DYNAMIC_RE)) dyn.add(resolveRelative(fromPath, m[1]!))
  return { static: [...stat], dynamic: [...dyn] }
}

/**
 * Orders chunks so each comes after the static imports it needs. `staticDeps` maps a chunk path to its static
 * imports. Throws on a cycle, naming the chunks in it: a cycle cannot be loaded from blob URLs in order.
 */
export function dependencyOrder(staticDeps: ReadonlyMap<string, readonly string[]>): string[] {
  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (path: string) => {
    const s = state.get(path)
    if (s === 'done') return
    if (s === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(path)), path]
      throw new Error(`Import cycle between editor chunks: ${cycle.join(' → ')}`)
    }
    state.set(path, 'visiting')
    stack.push(path)
    for (const dep of staticDeps.get(path) ?? []) if (staticDeps.has(dep)) visit(dep)
    stack.pop()
    state.set(path, 'done')
    order.push(path)
  }
  for (const path of staticDeps.keys()) visit(path)
  return order
}

export interface Rewrite {
  /** URL of a chunk's static import: a blob URL, known because dependencies are created first. */
  blobUrlOf: (path: string) => string
}

/**
 * Rewrites one chunk's source so it runs from a blob URL:
 *  - static imports point at the blob URLs of the chunks they import;
 *  - `import.meta.url` becomes the chunk's own op-blob URL, so `new URL('…', import.meta.url)` resolves inside
 *    the editor and the fetch/Worker shims can map it back;
 *  - `import.meta.resolve(` becomes `__opMetaResolve(` with the chunk's URL, and `import(` becomes `__opImport(`,
 *    both installed by the loader.
 */
export function rewriteChunk(source: string, fromPath: string, rw: Rewrite): string {
  const self = JSON.stringify(opUrl(fromPath))
  let out = source.replace(STATIC_RE, (whole, spec: string) => {
    const target = resolveRelative(fromPath, spec)
    const quote = whole.includes('"') ? '"' : "'"
    const head = whole.slice(0, whole.length - spec.length - 2)
    return `${head}${quote}${rw.blobUrlOf(target)}${quote}`
  })
  out = out.replace(/\bimport\.meta\.url\b/g, self)
  out = out.replace(/\bimport\.meta\.resolve\(/g, `__opMetaResolve(${self}, `)
  // A literal dynamic import names its chunk, which the loader maps to the chunk's blob. Any other import(x)
  // is passed to the loader unchanged, and it maps op-blob URLs itself.
  out = out.replace(DYNAMIC_LITERAL_RE, (_m, _q: string, spec: string) => `__opImport(${JSON.stringify(opUrl(resolveRelative(fromPath, spec)))})`)
  out = out.replace(/(^|[^.\w$])import\(/g, (_m, pre: string) => `${pre}__opImport(`)
  return out
}
