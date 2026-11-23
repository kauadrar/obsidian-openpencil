// Values the editor's root provides to the shell's components.
import type { InjectionKey } from 'vue'

/** Writes an exported file for the person; resolves to where it went, such as a vault path. */
export type WriteExport = (fileName: string, data: Uint8Array) => Promise<string>

export const WRITE_EXPORT: InjectionKey<WriteExport> = Symbol('openpencil-write-export')

export type ContextMenuEntry =
  | { separator: true }
  | {
      separator?: false
      label: string
      shortcut?: string
      disabled?: boolean
      checked?: boolean
      action?: () => void
      sub?: ContextMenuEntry[]
    }

/** Opens a native context menu at viewport coordinates. */
export type ShowContextMenu = (entries: ContextMenuEntry[], pos: { x: number; y: number }) => void

export const SHOW_CONTEXT_MENU: InjectionKey<ShowContextMenu> = Symbol('openpencil-show-context-menu')
