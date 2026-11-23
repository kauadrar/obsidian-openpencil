// The mobile (Android and iOS) read-only policy. Spec 25: on mobile the editor offers no edit action. The editor
// refuses edits at the core for every path (menus, shortcuts, API calls) once it is read-only; these values are
// what the plugin sets, so they can be checked. No imports beyond types, so the node test runner can load this.
import type { Tool } from '@open-pencil/core'

/** The tools a mobile editor offers: moving and panning only. */
export const MOBILE_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['SELECT', 'HAND'])

/** The host restrictions applied on mobile, on top of the editor's read-only mode. */
export const MOBILE_RESTRICTIONS = {
  tools: MOBILE_TOOLS,
  layerEdits: 'none',
  pathEdits: 'handles',
} as const

/** The plugin's commands that stay available on mobile: saving, which writes the file as it is, and nothing else. */
export const MOBILE_ALLOWED_COMMANDS: ReadonlySet<string> = new Set(['save-as-fig'])

/** Whether a plugin command is blocked on mobile: every command but the allowed ones, creating and editing included. */
export function isBlockedOnMobile(commandId: string): boolean {
  return !MOBILE_ALLOWED_COMMANDS.has(commandId)
}
