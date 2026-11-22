// Small input fields for the Design panel, styled by styles.css (.op-field, .op-color).
import { defineComponent, h, ref, watch, type PropType } from 'vue'
import type { Color } from '@open-pencil/scene-graph/primitives'

type Mixed<T> = T | symbol

const round = (n: number, digits = 2) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/**
 * A number input with a short label in front. Typing then Enter or leaving the field commits;
 * Escape restores; ArrowUp/Down step by `step` (×10 with Shift) and commit at once.
 */
export const NumField = defineComponent({
  props: {
    value: { type: [Number, Symbol] as PropType<Mixed<number>>, required: true },
    label: { type: String, default: '' },
    title: { type: String, default: '' },
    suffix: { type: String, default: '' },
    step: { type: Number, default: 1 },
    min: { type: Number, default: -Infinity },
    max: { type: Number, default: Infinity },
    digits: { type: Number, default: 2 },
    disabled: { type: Boolean, default: false },
  },
  emits: { commit: (_value: number, _previous: number) => true },
  setup(props, { emit }) {
    const shown = () => (typeof props.value === 'number' ? `${round(props.value, props.digits)}${props.suffix}` : 'Mixed')
    const text = ref(shown())
    watch(() => props.value, () => (text.value = shown()))
    const clamp = (n: number) => Math.min(props.max, Math.max(props.min, n))
    const previous = () => (typeof props.value === 'number' ? props.value : 0)
    function commit(next: number) {
      const value = clamp(next)
      if (value !== props.value) emit('commit', value, previous())
      text.value = shown()
    }
    function commitText() {
      const n = parseFloat(text.value.replace(',', '.'))
      if (Number.isFinite(n)) commit(n)
      else text.value = shown()
    }
    return () =>
      h('label', { class: ['op-field', { 'is-disabled': props.disabled }], title: props.title }, [
        props.label ? h('span', { class: 'op-field-label' }, props.label) : null,
        h('input', {
          value: text.value,
          disabled: props.disabled,
          spellcheck: false,
          onInput: (e: Event) => (text.value = (e.target as HTMLInputElement).value),
          onFocus: (e: FocusEvent) => (e.target as HTMLInputElement).select(),
          onBlur: commitText,
          onKeydown: (e: KeyboardEvent) => {
            e.stopPropagation() // keep editor shortcuts (R, V, Delete…) out of the field
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            else if (e.key === 'Escape') {
              text.value = shown()
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const delta = (e.key === 'ArrowUp' ? 1 : -1) * props.step * (e.shiftKey ? 10 : 1)
              commit(round(previous() + delta, props.digits))
            }
          },
        }),
      ])
  },
})

export function colorToHex(c: Color): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `${to(c.r)}${to(c.g)}${to(c.b)}`.toUpperCase()
}

export function hexToColor(hex: string, a = 1): Color | null {
  let s = hex.trim().replace(/^#/, '')
  if (s.length === 3) s = [...s].map((ch) => ch + ch).join('')
  if (!/^[0-9a-f]{6}$/i.test(s)) return null
  const n = parseInt(s, 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a }
}

/** A swatch that opens the system color picker, a hex field, and an opacity field. */
export const ColorField = defineComponent({
  props: {
    color: { type: Object as PropType<Color>, required: true },
    opacity: { type: Number, required: true },
  },
  emits: { color: (_c: Color) => true, opacity: (_o: number) => true },
  setup(props, { emit }) {
    const hexText = ref(colorToHex(props.color))
    watch(() => props.color, (c) => (hexText.value = colorToHex(c)), { deep: true })
    function commitHex() {
      const next = hexToColor(hexText.value, props.color.a)
      if (next && colorToHex(next) !== colorToHex(props.color)) emit('color', next)
      else hexText.value = colorToHex(props.color)
    }
    return () =>
      h('div', { class: 'op-color' }, [
        h('label', { class: 'op-swatch', style: { '--swatch': `#${colorToHex(props.color)}`, '--swatch-a': props.opacity } }, [
          h('input', {
            type: 'color',
            value: `#${colorToHex(props.color)}`.toLowerCase(),
            onChange: (e: Event) => {
              const next = hexToColor((e.target as HTMLInputElement).value, props.color.a)
              if (next) emit('color', next)
            },
          }),
        ]),
        h('input', {
          class: 'op-hex',
          value: hexText.value,
          spellcheck: false,
          onInput: (e: Event) => (hexText.value = (e.target as HTMLInputElement).value),
          onBlur: commitHex,
          onKeydown: (e: KeyboardEvent) => {
            e.stopPropagation()
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          },
        }),
        h(NumField, {
          class: 'op-color-opacity',
          value: props.opacity * 100,
          suffix: '%',
          min: 0,
          max: 100,
          digits: 0,
          onCommit: (v: number) => emit('opacity', v / 100),
        }),
      ])
  },
})
