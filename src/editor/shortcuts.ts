import type { ClipboardSnapshot, Editor } from '@open-pencil/core'
import { useTypography } from '@open-pencil/vue/controls/typography'
import { editorCommandShortcuts, useEditorCommands, type EditorCommandId } from '@open-pencil/vue/editor/commands'
import { hasDocumentTextSelection, type EditorShortcut } from '@open-pencil/vue/editor/keyboard'

const COMMAND_SHORTCUTS: readonly EditorCommandId[] = [
  'selection.booleanUnion',
  'selection.booleanSubtract',
  'selection.booleanIntersect',
  'selection.booleanExclude',
  'selection.flatten',
  'selection.frameSelection',
]

type EditorStateWithRulers = Editor['state'] & { showRulers?: boolean }

const ALIGN_SHORTCUTS: readonly [
  id: string,
  keys: EditorShortcut['keys'],
  axis: 'horizontal' | 'vertical',
  pos: 'min' | 'center' | 'max',
][] = [
  ['align-left', 'Alt+A', 'horizontal', 'min'],
  ['align-center', 'Alt+H', 'horizontal', 'center'],
  ['align-right', 'Alt+D', 'horizontal', 'max'],
  ['align-top', 'Alt+W', 'vertical', 'min'],
  ['align-middle', 'Alt+V', 'vertical', 'center'],
  ['align-bottom', 'Alt+S', 'vertical', 'max'],
]

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

/**
 * App-side keyboard shortcuts that the SDK leaves to native menus (align, booleans, flatten,
 * frame selection, clipboard properties / paste-to-replace, text B/I/U, rulers, snap-to-pixel).
 * Excludes Obsidian-reserved keys (Mod+P, Mod+O, Mod+,), Shift+C (comments), and Mod+R (by default).
 */
export function createAppShortcuts(editor: Editor, onSave: () => void): EditorShortcut[] {
  const { runCommand } = useEditorCommands()
  const typography = useTypography()

  let lastCopied: ClipboardSnapshot | null = null
  let lastProperties: ClipboardSnapshot | null = null

  async function copy(properties: boolean): Promise<void> {
    if (editor.state.selectedIds.size === 0) return
    const payload = await editor.prepareCopy(properties ? { properties: true } : undefined)
    if (!payload.snapshot) return
    if (properties) lastProperties = payload.snapshot
    else lastCopied = payload.snapshot
    await writeClipboard(payload.html, payload.plainText)
  }

  async function pasteProperties(): Promise<void> {
    if (editor.state.selectedIds.size === 0) return
    const html = await readClipboardHTML()
    if (html) {
      const count = await editor.pastePropertiesFromHTML(html)
      if (count > 0) return
    }
    if (lastProperties) await editor.pastePropertiesFromSnapshot(lastProperties)
  }

  async function pasteToReplace(): Promise<void> {
    if (editor.state.selectedIds.size === 0) return
    const html = await readClipboardHTML()
    if (html) {
      await editor.pasteFromHTML(html, undefined, { replaceSelection: true })
      return
    }
    if (lastCopied) await editor.pasteSnapshot(lastCopied, undefined, { replaceSelection: true })
  }

  return [
    { id: 'save', keys: 'Mod+S', run: onSave },
    ...ALIGN_SHORTCUTS.map(([id, keys, axis, pos]): EditorShortcut => ({
      id,
      keys,
      run: () => {
        if (editor.state.selectedIds.size === 0) return
        editor.alignNodes([...editor.state.selectedIds], axis, pos)
      },
    })),
    ...COMMAND_SHORTCUTS.flatMap((id): EditorShortcut[] => {
      const keys = editorCommandShortcuts(id)
      return keys.length > 0 ? [{ id, keys, run: () => runCommand(id) }] : []
    }),
    {
      id: 'copy-selection',
      keys: 'Mod+C',
      run: () => {
        if (hasDocumentTextSelection() || editor.state.selectedIds.size === 0) return false
        void copy(false)
      },
      preventDefault: () => !hasDocumentTextSelection() && editor.state.selectedIds.size > 0,
    },
    { id: 'copy-properties', keys: 'Mod+Alt+C', run: () => void copy(true) },
    { id: 'paste-properties', keys: 'Mod+Alt+V', run: () => void pasteProperties() },
    { id: 'paste-to-replace', keys: 'Mod+Shift+R', run: () => void pasteToReplace() },
    { id: 'text-bold', keys: 'Mod+B', run: () => typography.toggleBold() },
    { id: 'text-italic', keys: 'Mod+I', run: () => typography.toggleItalic() },
    { id: 'text-underline', keys: 'Mod+U', run: () => typography.toggleDecoration('UNDERLINE') },
    {
      id: 'toggle-rulers',
      keys: 'Shift+R',
      run: () => {
        const state = editor.state as EditorStateWithRulers
        state.showRulers = state.showRulers === false
        editor.requestRepaint()
      },
    },
    {
      id: 'toggle-snap-pixel-grid',
      keys: "Mod+Shift+'",
      run: () => {
        editor.state.snappingPreferences.pixelGrid = !editor.state.snappingPreferences.pixelGrid
      },
    },
  ]
}
