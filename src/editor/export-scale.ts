// Export scale for the Export section's free-text field. A value is written as a number with an optional
// "x" ("1.5", "1.5x"); anything else reverts. Numbers outside 0.01–1024 are clamped to that range.
// No imports, so the node test runner can load this file directly.

export const EXPORT_SCALE_MIN = 0.01
export const EXPORT_SCALE_MAX = 1024

/** The presets offered for PNG, JPG and WEBP. */
export const EXPORT_SCALE_PRESETS: readonly number[] = [0.5, 0.75, 1, 1.5, 2, 3, 4]

/** Label for a scale, such as "1.5x". */
export function exportScaleLabel(scale: number): string {
  return `${scale}x`
}

/**
 * The scale a typed value means, or null when it is not a number. Accepts "1.5", "1.5x", "1.5 X" and
 * "1,5" (a decimal comma). Clamped to 0.01–1024.
 */
export function parseExportScale(text: string): number | null {
  const cleaned = text.trim().replace(/\s*[x×X]$/, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  // Zero and anything below the minimum clamp up to 0.01, as the field's range says.
  return Math.min(EXPORT_SCALE_MAX, Math.max(EXPORT_SCALE_MIN, value))
}
