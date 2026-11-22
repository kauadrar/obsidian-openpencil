// Values the editor's root provides to the shell's components.
import type { InjectionKey } from 'vue'

/** Writes an exported file for the person; resolves to where it went, such as a vault path. */
export type WriteExport = (fileName: string, data: Uint8Array) => Promise<string>

export const WRITE_EXPORT: InjectionKey<WriteExport> = Symbol('openpencil-write-export')
