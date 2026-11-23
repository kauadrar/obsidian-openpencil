// What the user is told when the editor cannot load. On Android the editor's files are blocked by the WebView
// (see the README, "Known limitations"), so the message says so plainly instead of showing a raw module error.
// The raw error still goes to the developer console. No imports, so the node test runner can load this file.

export const ANDROID_LIMITATION =
  "can't open designs on Android in this version. Android's WebView blocks the editor's files. It works on desktop and iOS."

/** The notice or in-view text for a failed editor load. */
export function editorFailureText(error: unknown, version: string, isAndroid: boolean): string {
  if (isAndroid) return `OpenPencil v${version}: OpenPencil ${ANDROID_LIMITATION}`
  const detail = error instanceof Error ? error.message : String(error)
  return `OpenPencil v${version}: failed to load editor assets — ${detail}`
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
