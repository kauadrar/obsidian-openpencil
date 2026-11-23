// What the user is told when the editor cannot load: the notice and the in-view text. The raw error also goes to
// the developer console. No imports, so the node test runner can load this file directly.

/** The notice or in-view text for a failed editor load, with the error's detail. */
export function editorFailureText(error: unknown, version: string, isAndroid: boolean): string {
  const detail = error instanceof Error ? error.message : String(error)
  const where = isAndroid ? ' on Android' : ''
  return `OpenPencil v${version}: failed to load editor assets${where} — ${detail}`
}

/** A failure to load the editor itself, kept apart from errors such as a file that cannot be read. */
export class EditorLoadError extends Error {
  readonly original: unknown
  constructor(original: unknown) {
    super('editor failed to load')
    this.name = 'EditorLoadError'
    this.original = original
  }
}
