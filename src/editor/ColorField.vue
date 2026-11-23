<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Color } from '@open-pencil/scene-graph/primitives'
import { useEditor } from '@open-pencil/vue'
import { pressAnswersEyedropper } from '@open-pencil/vue/canvas/eyedropper'
import type { OkHCLControls } from '@open-pencil/vue/controls/color-model'
import { ColorPickerRoot } from '@open-pencil/vue/primitives/ColorPicker'
import ColorPickerBody from './ColorPickerBody.vue'
import { colorToHex, hexToColor, NumField } from './fields'

const props = withDefaults(
  defineProps<{
    color: Color
    opacity: number
    mixed?: boolean
    okhcl?: OkHCLControls | null
    escapeReverts?: boolean
  }>(),
  { mixed: false, okhcl: null, escapeReverts: false },
)

const emit = defineEmits<{
  color: [c: Color]
  opacity: [o: number]
}>()

const editor = useEditor()
const bodyRef = ref<InstanceType<typeof ColorPickerBody> | null>(null)
const combinedColor = computed<Color>(() => ({ ...props.color, a: props.opacity }))

function emitCombined(next: Color) {
  if (next.r !== props.color.r || next.g !== props.color.g || next.b !== props.color.b) {
    emit('color', { r: next.r, g: next.g, b: next.b, a: props.color.a })
  }
  if (Math.abs(next.a - props.opacity) > 1e-4) {
    emit('opacity', Math.min(1, Math.max(0, next.a)))
  }
}

function keepOpen(event: PointerEvent): boolean {
  return pressAnswersEyedropper(editor, event)
}

function onOpenChange(open: boolean) {
  if (!open) bodyRef.value?.stopEyedropper()
}

// Inline hex + opacity in the row
const hexFocused = ref(false)
const hexText = ref(props.mixed ? 'Mixed' : colorToHex(props.color))
watch(
  [() => props.color, () => props.mixed],
  ([c, mixed]) => {
    if (!hexFocused.value) hexText.value = mixed ? 'Mixed' : colorToHex(c)
  },
  { deep: true },
)

function commitHex() {
  hexFocused.value = false
  const next = hexToColor(hexText.value, props.color.a)
  if (next && (props.mixed || colorToHex(next) !== colorToHex(props.color))) {
    emit('color', next)
  } else {
    hexText.value = props.mixed ? 'Mixed' : colorToHex(props.color)
  }
}
</script>

<template>
  <div class="op-color">
    <ColorPickerRoot
      :color="combinedColor"
      :keep-open="keepOpen"
      :escape-reverts="escapeReverts"
      :ui="{ content: 'op-cp-popover' }"
      @update="emitCombined"
      @open-change="onOpenChange"
    >
      <template #trigger="{ style }">
        <button
          type="button"
          class="op-swatch"
          :style="{ '--swatch': `#${colorToHex(color)}`, '--swatch-a': opacity, background: style.background }"
          aria-label="Open colour picker"
        />
      </template>

      <ColorPickerBody ref="bodyRef" :color="color" :opacity="opacity" :okhcl="okhcl" @update="emitCombined" />
    </ColorPickerRoot>

    <input
      class="op-hex"
      :value="hexText"
      spellcheck="false"
      @focus="(e) => { hexFocused = true; if (mixed) hexText = colorToHex(color); (e.target as HTMLInputElement).select() }"
      @input="(e) => (hexText = (e.target as HTMLInputElement).value)"
      @blur="commitHex"
      @keydown.stop="(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        else if (e.key === 'Escape') { hexText = mixed ? 'Mixed' : colorToHex(color); (e.target as HTMLInputElement).blur() }
      }"
    />

    <NumField
      class="op-color-opacity"
      suffix="%"
      :min="0"
      :max="100"
      :digits="0"
      :value="Math.round(opacity * 100)"
      @commit="(v) => emit('opacity', v / 100)"
    />
  </div>
</template>
