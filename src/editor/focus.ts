// Focus after a checkbox changes. The editor takes its shortcuts (undo, delete, and so on) as typing while an
// input has focus, so a checkbox left focused after a tick swallows Cmd/Ctrl+Z. No imports, so the node test
// runner can load this file directly.

/** Moves focus off a checkbox once it has changed, so the editor's shortcuts keep working. */
export function releaseCheckboxFocus(event: Event): void {
  const target = event.target as { type?: unknown; blur?: unknown } | null
  if (target && target.type === 'checkbox' && typeof target.blur === 'function') (target.blur as () => void)()
}
