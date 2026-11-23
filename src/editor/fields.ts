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

export { default as ColorField } from './ColorField.vue'
