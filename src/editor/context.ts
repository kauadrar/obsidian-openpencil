// Values the editor's root provides to the shell's components.
import type { InjectionKey } from 'vue'
import type { MenuEntry } from '@open-pencil/vue/editor/menu-model'

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

export type Notify = (message: string) => void

export const NOTIFY: InjectionKey<Notify> = Symbol('openpencil-notify')

export const DESIGN_NAME: InjectionKey<string> = Symbol('openpencil-design-name')

/** Picks an image file from the host (e.g. Obsidian vault modal) for Image fills. */
export type PickImage = () => Promise<File | null>

export const PICK_IMAGE: InjectionKey<PickImage> = Symbol('openpencil-pick-image')

/** Resolves Obsidian-internal drags (e.g. from the File Explorer) into File objects. */
export type ResolveDropFiles = (dataTransfer: DataTransfer) => Promise<File[] | null>

export const RESOLVE_DROP_FILES: InjectionKey<ResolveDropFiles> = Symbol('openpencil-resolve-drop-files')

export function toContextEntries(entries: readonly MenuEntry[]): ContextMenuEntry[] {
  return entries.map((entry) =>
    entry.separator
      ? { separator: true }
      : {
          label: entry.label,
          shortcut: entry.shortcut,
          disabled: entry.disabled,
          checked: entry.checked,
          action: entry.action,
          sub: entry.sub ? toContextEntries(entry.sub) : undefined,
        },
  )
}
