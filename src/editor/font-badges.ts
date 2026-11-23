// Source badges for the font picker: BUNDLED (shipped with the plugin) and system (installed on this computer).
// Web font catalogues (Google, Fontsource) are not listed, so they have no badge. No imports, so the node test
// runner can load this file.

/** The badge a font family shows, from the source the picker gives it. */
export function fontSourceBadge(source: string): string {
  switch (source) {
    case 'bundled':
      return 'BUNDLED'
    case 'local':
      return 'system'
    default:
      return source.toUpperCase()
  }
}
