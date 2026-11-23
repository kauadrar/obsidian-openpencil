<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Color } from '@open-pencil/scene-graph/primitives'
import {
  ColorAreaArea,
  ColorAreaRoot,
  ColorAreaThumb,
  ColorSliderRoot,
  ColorSliderThumb,
  ColorSliderTrack,
  parseColor,
} from 'reka-ui'
import { useEditor } from '@open-pencil/vue'
import {
  cancelEyedropperSample,
  offersEyedropper,
  pressAnswersEyedropper,
  requestEyedropperSample,
} from '@open-pencil/vue/canvas/eyedropper'
import { useColorModel, type ColorFieldFormat, type OkHCLControls } from '@open-pencil/vue/controls/color-model'
import { ChannelSliderRoot, ChannelSliderThumb, ChannelSliderTrack } from '@open-pencil/vue/primitives/ChannelSlider'
import { ColorPickerRoot } from '@open-pencil/vue/primitives/ColorPicker'
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
const canEyedropper = computed(() => offersEyedropper(editor))
const picking = ref(false)
const localFormat = ref<ColorFieldFormat>('rgb')

const combinedColor = computed<Color>(() => ({ ...props.color, a: props.opacity }))

function emitCombined(next: Color) {
  if (next.r !== props.color.r || next.g !== props.color.g || next.b !== props.color.b) {
    emit('color', { r: next.r, g: next.g, b: next.b, a: props.color.a })
  }
  if (Math.abs(next.a - props.opacity) > 1e-4) {
    emit('opacity', Math.min(1, Math.max(0, next.a)))
  }
}

const activeFormat = computed<ColorFieldFormat>(() => {
  const f = props.okhcl ? props.okhcl.fieldFormat : localFormat.value
  return f === 'hex' ? 'rgb' : f
})

const model = useColorModel({
  color: combinedColor,
  okhcl: () => props.okhcl?.okhcl ?? null,
  format: activeFormat,
  defaultFormat: 'rgb',
  onUpdate: emitCombined,
  onUpdateOkHCL: (patch) => props.okhcl?.updateOkHCL(patch),
  onFormatChange: (next) => {
    if (props.okhcl) props.okhcl.setFieldFormat(next)
    else localFormat.value = next
  },
})

const formatOptions = computed(() => {
  const base: { value: ColorFieldFormat; label: string }[] = [
    { value: 'rgb', label: 'RGB' },
    { value: 'hsl', label: 'HSL' },
    { value: 'hsb', label: 'HSB' },
  ]
  if (props.okhcl) base.push({ value: 'okhcl', label: 'OkHCL' })
  return base
})

function onRekaUpdate(next: string | Parameters<typeof model.updateFromReka>[0]) {
  model.updateFromReka(typeof next === 'string' ? parseColor(next) : next)
}

function keepOpen(event: PointerEvent): boolean {
  return pressAnswersEyedropper(editor, event)
}

function onEyedropperEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !picking.value) return
  e.preventDefault()
  e.stopPropagation()
  cancelEyedropperSample(editor)
  picking.value = false
}

function stopEyedropper() {
  window.removeEventListener('keydown', onEyedropperEsc, true)
  if (picking.value) {
    cancelEyedropperSample(editor)
    picking.value = false
  }
}

onBeforeUnmount(stopEyedropper)

function onOpenChange(open: boolean) {
  if (!open) stopEyedropper()
}

async function toggleEyedropper() {
  if (picking.value) {
    stopEyedropper()
    return
  }
  picking.value = true
  window.addEventListener('keydown', onEyedropperEsc, true)
  try {
    const sampled = await requestEyedropperSample(editor)
    if (sampled) emitCombined({ ...sampled, a: props.opacity })
  } finally {
    window.removeEventListener('keydown', onEyedropperEsc, true)
    picking.value = false
  }
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

const okhclHueGradient =
  'linear-gradient(to right, oklch(0.7 0.2 0), oklch(0.7 0.2 60), oklch(0.7 0.2 120), oklch(0.7 0.2 180), oklch(0.7 0.2 240), oklch(0.7 0.2 300), oklch(0.7 0.2 360))'
const hueGradient =
  'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
const svAreaBackground = computed(
  () => `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${Math.round(model.hsb.value.h)}, 100%, 50%))`,
)
const alphaGradient = computed(() => {
  const r = Math.round(props.color.r * 255)
  const g = Math.round(props.color.g * 255)
  const b = Math.round(props.color.b * 255)
  return `linear-gradient(to right, transparent, rgb(${r}, ${g}, ${b}))`
})
const gamutLabel = computed(() => (props.okhcl?.previewColorSpace === 'display-p3' ? 'P3' : 'sRGB'))
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

      <div class="op-cp" @keydown.stop>
        <template v-if="model.format.value !== 'okhcl'">
          <ColorAreaRoot
            :model-value="model.hsb.value"
            color-space="hsb"
            x-channel="saturation"
            y-channel="brightness"
            class="op-cp-area"
            @update:model-value="onRekaUpdate"
          >
            <ColorAreaArea class="op-cp-area-bg" :style="{ background: svAreaBackground }">
              <ColorAreaThumb class="op-cp-thumb" />
            </ColorAreaArea>
          </ColorAreaRoot>

          <div class="op-cp-controls">
            <button
              v-if="canEyedropper"
              type="button"
              class="op-icon-btn op-cp-eyedropper"
              :class="{ 'is-on': picking }"
              title="Pick a color from the canvas (I)"
              aria-label="Pick a color from the canvas"
              @click="toggleEyedropper"
            >
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13.5 2.5a1.8 1.8 0 0 0-2.5 0L8.8 4.7 7.6 3.5 6.4 4.7l1.2 1.2-4.8 4.8-.6 2.7 2.7-.6 4.8-4.8 1.2 1.2 1.2-1.2-1.2-1.2 2.2-2.2a1.8 1.8 0 0 0 0-2.5Z" />
              </svg>
            </button>
            <div class="op-cp-sliders">
              <ColorSliderRoot
                :model-value="model.hsb.value"
                color-space="hsb"
                channel="hue"
                class="op-cp-slider"
                @update:model-value="onRekaUpdate"
              >
                <ColorSliderTrack class="op-cp-track" :style="{ background: hueGradient }">
                  <ColorSliderThumb class="op-cp-thumb" />
                </ColorSliderTrack>
              </ColorSliderRoot>
              <ColorSliderRoot
                :model-value="model.hsb.value"
                color-space="hsb"
                channel="alpha"
                class="op-cp-slider op-cp-alpha"
                @update:model-value="onRekaUpdate"
              >
                <ColorSliderTrack class="op-cp-track" :style="{ background: alphaGradient }">
                  <ColorSliderThumb class="op-cp-thumb" />
                </ColorSliderTrack>
              </ColorSliderRoot>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="op-cp-okhcl-sliders">
            <ChannelSliderRoot
              :model-value="model.okhcl.value.h"
              label="Hue"
              :min="0"
              :max="360"
              :step="1"
              class="op-cp-slider"
              @update:model-value="(v) => model.updateOkHCLChannel('h', v)"
            >
              <ChannelSliderTrack class="op-cp-track" :style="{ background: okhclHueGradient }">
                <ChannelSliderThumb class="op-cp-thumb" />
              </ChannelSliderTrack>
            </ChannelSliderRoot>

            <ChannelSliderRoot
              :model-value="model.okhcl.value.c"
              label="Chroma"
              :min="0"
              :max="0.4"
              :step="0.002"
              class="op-cp-slider"
              @update:model-value="(v) => model.updateOkHCLChannel('c', v)"
            >
              <ChannelSliderTrack class="op-cp-track" :style="{ background: model.okhclSliderGradient.value.okhclChroma }">
                <ChannelSliderThumb class="op-cp-thumb" />
              </ChannelSliderTrack>
            </ChannelSliderRoot>

            <ChannelSliderRoot
              :model-value="model.okhcl.value.l"
              label="Lightness"
              :min="0"
              :max="1"
              :step="0.005"
              class="op-cp-slider"
              @update:model-value="(v) => model.updateOkHCLChannel('l', v)"
            >
              <ChannelSliderTrack class="op-cp-track" :style="{ background: model.okhclSliderGradient.value.okhclLightness }">
                <ChannelSliderThumb class="op-cp-thumb" />
              </ChannelSliderTrack>
            </ChannelSliderRoot>

            <div class="op-cp-controls">
              <button
                v-if="canEyedropper"
                type="button"
                class="op-icon-btn op-cp-eyedropper"
                :class="{ 'is-on': picking }"
                title="Pick a color from the canvas (I)"
                aria-label="Pick a color from the canvas"
                @click="toggleEyedropper"
              >
                <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13.5 2.5a1.8 1.8 0 0 0-2.5 0L8.8 4.7 7.6 3.5 6.4 4.7l1.2 1.2-4.8 4.8-.6 2.7 2.7-.6 4.8-4.8 1.2 1.2 1.2-1.2-1.2-1.2 2.2-2.2a1.8 1.8 0 0 0 0-2.5Z" />
                </svg>
              </button>
              <div class="op-cp-sliders">
                <ColorSliderRoot
                  :model-value="model.hsb.value"
                  color-space="hsb"
                  channel="alpha"
                  class="op-cp-slider op-cp-alpha"
                  @update:model-value="onRekaUpdate"
                >
                  <ColorSliderTrack class="op-cp-track" :style="{ background: alphaGradient }">
                    <ColorSliderThumb class="op-cp-thumb" />
                  </ColorSliderTrack>
                </ColorSliderRoot>
              </div>
            </div>
          </div>

          <div v-if="okhcl?.clipped" class="op-cp-warning">Clipped to {{ gamutLabel }} gamut</div>
        </template>

        <div class="op-cp-model-row">
          <select
            class="op-cp-select"
            :value="model.format.value"
            aria-label="Color model"
            @change="(e) => model.setFormat((e.target as HTMLSelectElement).value as ColorFieldFormat)"
          >
            <option v-for="opt in formatOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <span v-if="model.format.value === 'okhcl' && okhcl?.previewColorSpace" class="op-cp-gamut">{{ gamutLabel }}</span>
        </div>

        <div class="op-cp-channels">
          <template v-if="model.format.value === 'rgb'">
            <NumField label="R" :min="0" :max="255" :digits="0" :value="Math.round(model.rgb.value.r)" @commit="(v) => model.updateRGBChannel('r', v)" />
            <NumField label="G" :min="0" :max="255" :digits="0" :value="Math.round(model.rgb.value.g)" @commit="(v) => model.updateRGBChannel('g', v)" />
            <NumField label="B" :min="0" :max="255" :digits="0" :value="Math.round(model.rgb.value.b)" @commit="(v) => model.updateRGBChannel('b', v)" />
          </template>
          <template v-else-if="model.format.value === 'hsl'">
            <NumField label="H" :min="0" :max="360" :digits="0" :value="Math.round(model.hsl.value.h)" @commit="(v) => model.updateHSLChannel('h', v)" />
            <NumField label="S" :min="0" :max="100" :digits="0" :value="Math.round(model.hsl.value.s)" @commit="(v) => model.updateHSLChannel('s', v)" />
            <NumField label="L" :min="0" :max="100" :digits="0" :value="Math.round(model.hsl.value.l)" @commit="(v) => model.updateHSLChannel('l', v)" />
          </template>
          <template v-else-if="model.format.value === 'hsb'">
            <NumField label="H" :min="0" :max="360" :digits="0" :value="Math.round(model.hsb.value.h)" @commit="(v) => model.updateHSBChannel('h', v)" />
            <NumField label="S" :min="0" :max="100" :digits="0" :value="Math.round(model.hsb.value.s)" @commit="(v) => model.updateHSBChannel('s', v)" />
            <NumField label="B" :min="0" :max="100" :digits="0" :value="Math.round(model.hsb.value.b)" @commit="(v) => model.updateHSBChannel('b', v)" />
          </template>
          <template v-else>
            <NumField label="H" :min="0" :max="360" :digits="0" :value="Math.round(model.okhcl.value.h)" @commit="(v) => model.updateOkHCLChannel('h', v)" />
            <NumField label="C" :min="0" :max="0.4" :step="0.005" :digits="3" :value="model.okhcl.value.c" @commit="(v) => model.updateOkHCLChannel('c', v)" />
            <NumField label="L" :min="0" :max="1" :step="0.01" :digits="2" :value="model.okhcl.value.l" @commit="(v) => model.updateOkHCLChannel('l', v)" />
          </template>
          <NumField
            label="A"
            suffix="%"
            :min="0"
            :max="100"
            :digits="0"
            :value="Math.round(opacity * 100)"
            @commit="(v) => model.updateAlpha(v / 100)"
          />
        </div>
      </div>
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
