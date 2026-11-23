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
  closeDocument(path: string, unsaved?: string): Promise<void>
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

    let result: unknown
    switch (command) {
      case 'list_documents':
        result = { documents: host.listDocuments() }
        break

      case 'open_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        result = await host.openDocument(path)
        break
      }

      case 'close_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        const unsaved = optionalString(args.unsaved)
        await host.closeDocument(path, unsaved)
        result = { closed: true, path }
        break
      }

      case 'activate_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        await host.activateDocument(path)
        result = { activated: true, path }
        break
      }

      case 'create_document': {
        const path = asString(args.path ?? args.name ?? args.file, 'path')
        result = await host.createDocument(path)
        break
      }

      case 'save_document': {
        const path = asString(args.path ?? args.document_id ?? args.file, 'path')
        await host.saveDocument(path)
        result = { saved: true, path }
        break
      }

      case 'list_recent_documents':
        result = { documents: host.listRecentDocuments() }
        break

      case 'undo': {
        const path = optionalString(args.path ?? args.document_id)
        result = { undone: await host.undo(path) }
        break
      }

      case 'redo': {
        const path = optionalString(args.path ?? args.document_id)
        result = { redone: await host.redo(path) }
        break
      }

      case 'get_settings':
        result = host.getSettings()
        break

      case 'update_settings':
        result = await host.updateSettings(args)
        break

      case 'get_codegen_prompt':
        result = { prompt: await host.getCodegenPrompt() }
        break

      case 'tool': {
        const toolName = asString(args.name, 'name')
        const toolArgs =
          args.args && typeof args.args === 'object' && !Array.isArray(args.args)
            ? (args.args as Record<string, unknown>)
            : {}
        const documentPath = optionalString(args.document_id ?? args.path ?? toolArgs.document_id ?? toolArgs.path)
        result = await host.executeCoreTool(toolName, toolArgs, documentPath)
        break
      }

      default: {
        if (!command) {
          throw new Error('Missing MCP command')
        }
        const documentPath = optionalString(args.document_id ?? args.path)
        result = await host.executeCoreTool(command, args, documentPath)
        break
      }
    }
    return { ok: true, result }
  }
}
