import type { ClipboardSnapshot, Editor } from '@open-pencil/core'
import type { Vector } from '@open-pencil/scene-graph/primitives'

let lastCopied: ClipboardSnapshot | null = null
let lastProperties: ClipboardSnapshot | null = null

async function writeClipboard(html: string, plainText: string): Promise<void> {
  if (!navigator.clipboard) return
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ])
      return
    }
    await navigator.clipboard.writeText?.(plainText)
  } catch {
    // Clipboard permissions may be restricted; the in-memory snapshot fallback still works.
  }
}

async function readClipboardHTML(): Promise<string | null> {
  if (!navigator.clipboard?.read) return null
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const blob = await item.getType('text/html')
        return await blob.text()
      }
    }
  } catch {
    return null
  }
  return null
}

/** Copies the current selection (or only its style properties) to the system clipboard. */
export async function copySelection(editor: Editor, properties = false): Promise<boolean> {
  if (editor.state.selectedIds.size === 0) return false
  try {
    const payload = await editor.prepareCopy(properties ? { properties: true } : undefined)
    if (!payload.snapshot) return false
    if (properties) lastProperties = payload.snapshot
    else lastCopied = payload.snapshot
    void writeClipboard(payload.html, payload.plainText)
    return true
  } catch {
    return false
  }
}

/** Copies the current selection and deletes it in one undoable step. */
export async function cutSelection(editor: Editor): Promise<void> {
  if (editor.state.selectedIds.size === 0) return
  try {
    const payload = await editor.prepareCopy()
    if (payload.snapshot) {
      lastCopied = payload.snapshot
      void writeClipboard(payload.html, payload.plainText)
    }
  } catch {
    // Still delete the selection even if clipboard encoding fails.
  }
  editor.deleteSelected()
}

/** Pastes layers from the system clipboard (or in-memory fallback), optionally at a canvas point. */
export async function pasteSelection(editor: Editor, cursorPos?: Vector, replaceSelection = false): Promise<void> {
  const html = await readClipboardHTML()
  if (html) {
    await editor.pasteFromHTML(html, cursorPos, replaceSelection ? { replaceSelection: true } : undefined)
    return
  }
  if (lastCopied) {
    await editor.pasteSnapshot(lastCopied, cursorPos, replaceSelection ? { replaceSelection: true } : undefined)
  }
}

/** Pastes style properties onto the current selection. */
export async function pasteProperties(editor: Editor): Promise<void> {
  if (editor.state.selectedIds.size === 0) return
  const html = await readClipboardHTML()
  if (html) {
    const count = await editor.pastePropertiesFromHTML(html)
    if (count > 0) return
  }
  if (lastProperties) await editor.pastePropertiesFromSnapshot(lastProperties)
}
