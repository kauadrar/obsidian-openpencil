// Pure helpers for the Effects section: the effect types this plugin offers, the blend modes a shadow
// can use, and the default for a drop shadow's "Show behind transparent areas". No imports, so the
// node test runner can load this file directly.

/** The effect types offered: Glass, Noise, Texture, Foreground blur and Progressive blur are cut. */
export const SUPPORTED_EFFECT_TYPES = ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'] as const

export type SupportedEffectType = (typeof SUPPORTED_EFFECT_TYPES)[number]

/** Keeps only the supported types from the SDK's option list, in the list's order. */
export function supportedEffectOptions<O extends { value: string }>(options: readonly O[]): O[] {
  const supported = new Set<string>(SUPPORTED_EFFECT_TYPES)
  return options.filter((o) => supported.has(o.value))
}

/** The blend modes a shadow offers, in the same order as the layer blend select. */
export const SHADOW_BLEND_MODES: readonly { value: string; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'DARKEN', label: 'Darken' },
  { value: 'MULTIPLY', label: 'Multiply' },
  { value: 'LINEAR_BURN', label: 'Plus darker' },
  { value: 'COLOR_BURN', label: 'Color burn' },
  { value: 'LIGHTEN', label: 'Lighten' },
  { value: 'SCREEN', label: 'Screen' },
  { value: 'LINEAR_DODGE', label: 'Plus lighter' },
  { value: 'COLOR_DODGE', label: 'Color dodge' },
  { value: 'OVERLAY', label: 'Overlay' },
  { value: 'SOFT_LIGHT', label: 'Soft light' },
  { value: 'HARD_LIGHT', label: 'Hard light' },
  { value: 'DIFFERENCE', label: 'Difference' },
  { value: 'EXCLUSION', label: 'Exclusion' },
  { value: 'HUE', label: 'Hue' },
  { value: 'SATURATION', label: 'Saturation' },
  { value: 'COLOR', label: 'Color' },
  { value: 'LUMINOSITY', label: 'Luminosity' },
]

/**
 * Whether a drop shadow shows behind transparent areas. Unset means on, as in Figma, so a file that
 * never set it still shows the shadow behind them.
 */
export function showsBehindTransparent(effect: { showShadowBehindNode?: boolean }): boolean {
  return effect.showShadowBehindNode !== false
}

/**
 * The type a row's select shows. A layer blur is stored as FOREGROUND_BLUR in a .fig file (Figma's
 * name for it), so a reopened layer blur would otherwise match no option and show blank.
 */
export function displayEffectType(type: string): string {
  return type === 'FOREGROUND_BLUR' ? 'LAYER_BLUR' : type
}
