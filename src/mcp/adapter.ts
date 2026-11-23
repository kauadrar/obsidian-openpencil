export type RPCSender = (body: Record<string, unknown>) => Promise<unknown>

export interface McpDocumentSummary {
  path: string
  name: string
  open: boolean
  active: boolean
  dirty: boolean
}

export interface McpHost {
  listDocuments(): McpDocumentSummary[]
  openDocument(path: string): Promise<McpDocumentSummary>
  closeDocument(path: string): Promise<void>
  activateDocument(path: string): Promise<void>
  createDocument(path: string): Promise<McpDocumentSummary>
  saveDocument(path: string): Promise<void>
  listRecentDocuments(): string[]
  undo(path?: string): Promise<boolean>
  redo(path?: string): Promise<boolean>
  getSettings(): Record<string, unknown>
  updateSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>>
  getCodegenPrompt(): Promise<string>
  executeCoreTool(command: string, args: Record<string, unknown>, documentPath?: string): Promise<unknown>
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or invalid "${field}"`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createMcpRpcSender(host: McpHost): RPCSender {
  return async (body: Record<string, unknown>): Promise<unknown> => {
    const command = typeof body.command === 'string' ? body.command : ''
    const args =
      body.args && typeof body.args === 'object' && !Array.isArray(body.args)
        ? (body.args as Record<string, unknown>)
        : {}

    switch (command) {
      case 'list_documents':
        return { documents: host.listDocuments() }

      case 'open_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        return await host.openDocument(path)
      }

      case 'close_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        await host.closeDocument(path)
        return { closed: true, path }
      }

      case 'activate_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        await host.activateDocument(path)
        return { activated: true, path }
      }

      case 'create_document': {
        const path = asString(args.path ?? args.name ?? args.file, 'path')
        return await host.createDocument(path)
      }

      case 'save_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        await host.saveDocument(path)
        return { saved: true, path }
      }

      case 'list_recent_documents':
        return { documents: host.listRecentDocuments() }

      case 'undo': {
        const path = optionalString(args.path ?? args.document_id)
        return { undone: await host.undo(path) }
      }

      case 'redo': {
        const path = optionalString(args.path ?? args.document_id)
        return { redone: await host.redo(path) }
      }

      case 'get_settings':
        return host.getSettings()

      case 'update_settings':
        return await host.updateSettings(args)

      case 'get_codegen_prompt':
        return { prompt: await host.getCodegenPrompt() }

      default: {
        if (!command) {
          throw new Error('Missing MCP command')
        }
        const documentPath = optionalString(args.document_id ?? args.path)
        return await host.executeCoreTool(command, args, documentPath)
      }
    }
  }
}
