// Reads the unpacked editor folder through the vault adapter (never a file URL), for the blob loader. Chunks come
// back as text, everything else (wasm, fonts) as bytes. `type` imports only, so the node test runner can load this.
import type { EditorFile } from './blob-loader'

/** The part of Obsidian's DataAdapter this reads. */
export interface EditorFolderAdapter {
  list(path: string): Promise<{ files: string[]; folders: string[] }>
  read(path: string): Promise<string>
  readBinary(path: string): Promise<ArrayBuffer>
}

/** Every file under `editorDir`, as paths relative to it. */
async function listRecursive(adapter: EditorFolderAdapter, dir: string): Promise<string[]> {
  const { files, folders } = await adapter.list(dir)
  const nested = await Promise.all(folders.map((f) => listRecursive(adapter, f)))
  return [...files, ...nested.flat()]
}

export async function readEditorFiles(adapter: EditorFolderAdapter, editorDir: string): Promise<EditorFile[]> {
  const prefix = editorDir.endsWith('/') ? editorDir : `${editorDir}/`
  const paths = await listRecursive(adapter, editorDir)
  return Promise.all(
    paths.map(async (full) => {
      const path = full.startsWith(prefix) ? full.slice(prefix.length) : full
      if (path.endsWith('.js')) return { path, text: await adapter.read(full) }
      return { path, bytes: new Uint8Array(await adapter.readBinary(full)) }
    }),
  )
}
