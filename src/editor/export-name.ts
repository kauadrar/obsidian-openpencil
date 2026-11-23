import type { Editor } from '@open-pencil/core'

/** Replaces characters not allowed in vault/OS file names with `-`. */
export function sanitizeFilePart(raw: string): string {
  return raw.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim()
}

function hasDuplicateNameOnPage(editor: Editor, sanitizedName: string): boolean {
  const pageId = editor.state.currentPageId
  let matches = 0
  const stack = [...editor.graph.getChildren(pageId)]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (sanitizeFilePart(node.name || 'Export') === sanitizedName) {
      matches++
      if (matches > 1) return true
    }
    for (const child of editor.graph.getChildren(node.id)) {
      stack.push(child)
    }
  }
  return false
}

export interface ExportNameOptions {
  designName: string
  targetName: string
  nodeId?: string
  suffix?: string
  scale?: number
  extension: string
}

/** Builds a stable vault export filename: `<design name> - <layer or page name>[id][suffix][@scale].<ext>`. */
export function buildExportFileName(editor: Editor, opts: ExportNameOptions): string {
  const design = sanitizeFilePart(opts.designName) || 'Design'
  const rawTarget = sanitizeFilePart(opts.targetName) || 'Export'
  let idSuffix = ''
  if (opts.nodeId) {
    const node = editor.graph.getNode(opts.nodeId)
    const isNested = node ? node.parentId !== editor.state.currentPageId : false
    if (isNested && hasDuplicateNameOnPage(editor, rawTarget)) {
      idSuffix = `-${sanitizeFilePart(opts.nodeId)}`
    }
  }
  const scale = opts.scale && opts.scale !== 1 ? `@${opts.scale}x` : ''
  return `${design} - ${rawTarget}${idSuffix}${opts.suffix ?? ''}${scale}.${opts.extension}`
}
