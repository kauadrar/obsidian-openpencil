import type { Editor } from '@open-pencil/core'
import { useTypography } from '@open-pencil/vue/controls/typography'
import { editorCommandShortcuts, useEditorCommands, type EditorCommandId } from '@open-pencil/vue/editor/commands'
import { hasDocumentTextSelection, type EditorShortcut } from '@open-pencil/vue/editor/keyboard'
import { copySelection, cutSelection, pasteProperties, pasteSelection } from './clipboard'

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

/**
 * App-side keyboard shortcuts that the SDK leaves to native menus (align, booleans, flatten,
 * frame selection, clipboard copy/cut/paste, properties, text B/I/U, rulers, snap-to-pixel).
 * Excludes Obsidian-reserved keys (Mod+P, Mod+O, Mod+,), Shift+C (comments), and Mod+R (by default).
 */
export function createAppShortcuts(editor: Editor, onSave: () => void): EditorShortcut[] {
  const { runCommand } = useEditorCommands()
  const typography = useTypography()

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
        void copySelection(editor)
      },
      preventDefault: () => !hasDocumentTextSelection() && editor.state.selectedIds.size > 0,
    },
    {
      id: 'cut-selection',
      keys: 'Mod+X',
      run: () => {
        if (hasDocumentTextSelection() || editor.state.selectedIds.size === 0) return false
        void cutSelection(editor)
      },
      preventDefault: () => !hasDocumentTextSelection() && editor.state.selectedIds.size > 0,
    },
    {
      id: 'paste-selection',
      keys: 'Mod+V',
      run: () => {
        if (hasDocumentTextSelection()) return false
        void pasteSelection(editor)
      },
      preventDefault: () => !hasDocumentTextSelection(),
    },
    { id: 'copy-properties', keys: 'Mod+Alt+C', run: () => void copySelection(editor, true) },
    { id: 'paste-properties', keys: 'Mod+Alt+V', run: () => void pasteProperties(editor) },
    {
      id: 'paste-to-replace',
      keys: 'Mod+Shift+R',
      run: () => {
        if (editor.state.selectedIds.size === 0) return
        void pasteSelection(editor, undefined, true)
      },
    },
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
