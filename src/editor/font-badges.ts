// Source badges for the font picker: BUNDLED (shipped with the plugin), GOOGLE and FONTSOURCE (web font
// providers), and system (installed on this computer). No imports, so the node test runner can load this file.

/** The badge a font family shows, from the source the picker gives it. */
export function fontSourceBadge(source: string): string {
  switch (source) {
    case 'bundled':
      return 'BUNDLED'
    case 'local':
      return 'system'
    case 'google':
      return 'GOOGLE'
    case 'fontsource':
      return 'FONTSOURCE'
    default:
      return source.toUpperCase()
  }
}
