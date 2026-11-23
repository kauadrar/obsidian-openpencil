// Icon set classification for the Insert icon popover. Emoji sets (Twemoji, Noto, OpenMoji and the rest of
// Iconify's "Emoji" category) are hidden: the popover keeps design icon sets only. No imports, so the node
// test runner can load this file directly.

/** Prefixes of the emoji sets, used when the catalogue (which carries each set's category) is unavailable. */
const EMOJI_PREFIX = /^(twemoji|noto|openmoji|fluent-emoji|emojione|fxemoji|streamline-emojis)/

/** Whether a set is an emoji set: Iconify's "Emoji" category, or a known emoji prefix when no category is known. */
export function isEmojiSet(prefix: string, category?: string | null): boolean {
  if (category != null && category.trim() !== '') return category.trim().toLowerCase() === 'emoji'
  return EMOJI_PREFIX.test(prefix)
}

/** The set prefix of an icon name such as `ic:baseline-star`. */
export function setPrefixOf(name: string): string {
  return name.split(':')[0] ?? ''
}
