<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import type { Fill, ImageFilters } from '@open-pencil/scene-graph'
import type { Color } from '@open-pencil/scene-graph/primitives'
import { editedGradientLayout } from '@open-pencil/core'
import { hitTestGradientHandles } from '@open-pencil/core/geometry'
import { useEditor } from '@open-pencil/vue'
import { pressAnswersEyedropper } from '@open-pencil/vue/canvas/eyedropper'
import type { OkHCLControls } from '@open-pencil/vue/controls/color-model'
import { ColorPickerRoot } from '@open-pencil/vue/primitives/ColorPicker'
import { FillRoot } from '@open-pencil/vue/primitives/Fill'
import { GradientEditorBar, GradientEditorRoot } from '@open-pencil/vue/primitives/GradientEditor'
import ColorPickerBody from './ColorPickerBody.vue'
import { PICK_IMAGE } from './context'
import { ColorField, colorToHex, hexToColor, NumField } from './fields'

const props = withDefaults(
  defineProps<{
    fill: Fill
    index: number
    paint?: 'fills' | 'strokes'
    nodeId?: string | null
    okhcl?: OkHCLControls | null
  }>(),
  { paint: 'fills', nodeId: null, okhcl: null },
)

const emit = defineEmits<{
  update: [fill: Fill]
  color: [c: Color]
  opacity: [o: number]
}>()

const editor = useEditor()
const pickVaultImage = inject(PICK_IMAGE, null)
const bodyRef = ref<InstanceType<typeof ColorPickerBody> | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pickerOpen = ref(false)
const activeStop = ref(0)
const imageFailed = ref(false)

const IMAGE_SCALE_MODES = [
  { value: 'FILL', label: 'Fill' },
  { value: 'FIT', label: 'Fit' },
  { value: 'CROP', label: 'Crop' },
  { value: 'TILE', label: 'Tile' },
] as const

const ADJUSTMENT_FIELDS: { key: keyof ImageFilters; label: string }[] = [
  { key: 'exposure', label: 'Exposure' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'tint', label: 'Tint' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'shadows', label: 'Shadows' },
]

const combinedColor = computed<Color>(() => ({ ...props.fill.color, a: props.fill.opacity }))
const isGradient = computed(() => props.fill.type.startsWith('GRADIENT_'))

function syncGradientEdit(open: boolean) {
  if (open && isGradient.value && props.nodeId) {
    editor.state.gradientEdit = {
      nodeId: props.nodeId,
      paint: props.paint,
      index: props.index,
      stop: activeStop.value,
    }
    editor.requestRepaint()
  } else if (
    editor.state.gradientEdit &&
    editor.state.gradientEdit.nodeId === props.nodeId &&
    editor.state.gradientEdit.index === props.index
  ) {
    editor.state.gradientEdit = null
    editor.requestRepaint()
  }
}

watch([pickerOpen, isGradient, () => props.nodeId, () => props.index, activeStop], ([open]) => {
  syncGradientEdit(open)
})

onBeforeUnmount(() => {
  syncGradientEdit(false)
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value)
})

function onOpenChange(open: boolean) {
  pickerOpen.value = open
  if (!open) bodyRef.value?.stopEyedropper()
}

function keepOpen(event: PointerEvent): boolean {
  const pe = (event as unknown as { detail?: { originalEvent?: PointerEvent } }).detail?.originalEvent ?? event
  if (pressAnswersEyedropper(editor, pe)) return true
  if (!editor.state.gradientEdit) return false
  const canvas = pe.target instanceof HTMLCanvasElement ? pe.target : null
  if (!canvas) return false
  const rect = canvas.getBoundingClientRect()
  const layout = editedGradientLayout(editor.graph, editor.state.gradientEdit, {
    panX: editor.state.panX,
    panY: editor.state.panY,
    zoom: editor.state.zoom,
  })
  if (!layout) return false
  return hitTestGradientHandles(layout, { x: pe.clientX - rect.left, y: pe.clientY - rect.top }) !== null
}

function emitSolidColor(next: Color) {
  if (next.r !== props.fill.color.r || next.g !== props.fill.color.g || next.b !== props.fill.color.b) {
    emit('color', { r: next.r, g: next.g, b: next.b, a: props.fill.color.a })
  }
  if (Math.abs(next.a - props.fill.opacity) > 1e-4) {
    emit('opacity', Math.min(1, Math.max(0, next.a)))
  }
}

// Inline hex for Solid fills
const hexFocused = ref(false)
const hexText = ref(colorToHex(props.fill.color))
watch(
  () => props.fill.color,
  (c) => {
    if (!hexFocused.value) hexText.value = colorToHex(c)
  },
  { deep: true },
)

function commitHex() {
  hexFocused.value = false
  const next = hexToColor(hexText.value, props.fill.color.a)
  if (next && colorToHex(next) !== colorToHex(props.fill.color)) emit('color', next)
  else hexText.value = colorToHex(props.fill.color)
}

function fillLabel(fill: Fill): string {
  switch (fill.type) {
    case 'GRADIENT_LINEAR': return 'Linear'
    case 'GRADIENT_RADIAL': return 'Radial'
    case 'GRADIENT_ANGULAR': return 'Angular'
    case 'GRADIENT_DIAMOND': return 'Diamond'
    case 'IMAGE': return 'Image'
    default: return fill.type.toLowerCase()
  }
}

// Image preview URL from editor.graph.images
const imagePreviewUrl = ref<string | null>(null)
watch(
  () => props.fill.imageHash,
  (hash) => {
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value)
      imagePreviewUrl.value = null
    }
    imageFailed.value = false
    if (!hash) return
    const bytes = editor.graph.images.get(hash)
    if (!bytes || bytes.byteLength === 0) {
      imageFailed.value = true
      return
    }
    try {
      imagePreviewUrl.value = URL.createObjectURL(new Blob([bytes as BlobPart]))
    } catch {
      imageFailed.value = true
    }
  },
  { immediate: true },
)

async function applyImageFile(file: File) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) {
      imageFailed.value = true
      return
    }
    const imageHash = editor.storeImage(bytes)
    imageFailed.value = false
    emit('update', {
      ...props.fill,
      type: 'IMAGE',
      imageHash,
      imageScaleMode: props.fill.imageScaleMode ?? 'FILL',
      visible: true,
    })
  } catch {
    imageFailed.value = true
  }
}

async function chooseImage() {
  if (pickVaultImage) {
    const file = await pickVaultImage()
    if (file) await applyImageFile(file)
    return
  }
  fileInputRef.value?.click()
}

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void applyImageFile(file)
}

function rotateImage90() {
  const next = ((props.fill.imageRotation ?? 0) + 90) % 360
  emit('update', { ...props.fill, imageRotation: next })
}

function setAdjustment(key: keyof ImageFilters, value: number) {
  emit('update', {
    ...props.fill,
    filters: { ...(props.fill.filters ?? {}), [key]: value },
  })
}

function updateStopColor(index: number, c: Color, a: number, updateFill: (f: Fill) => void) {
  const stops = [...(props.fill.gradientStops ?? [])]
  const target = stops[index]
  if (!target) return
  stops[index] = { ...target, color: { r: c.r, g: c.g, b: c.b, a } }
  updateFill({ ...props.fill, gradientStops: stops })
}
</script>

<template>
  <FillRoot :fill="fill" @update="(next) => emit('update', next)">
    <template #default="{ category, swatchBackground, actions }">
      <div class="op-color">
        <ColorPickerRoot
          :color="combinedColor"
          :keep-open="keepOpen"
          :ui="{ content: 'op-cp-popover' }"
          @update="emitSolidColor"
          @open-change="onOpenChange"
        >
          <template #trigger>
            <button
              type="button"
              class="op-swatch"
              :style="
                category === 'IMAGE' && imagePreviewUrl
                  ? { backgroundImage: `url(${imagePreviewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: swatchBackground }
              "
              aria-label="Open fill picker"
            />
          </template>

          <div class="op-fill-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="op-fill-tab"
              :class="{ 'is-active': category === 'SOLID' }"
              :aria-selected="category === 'SOLID'"
              @click="actions.toSolid()"
            >
              Solid
            </button>
            <button
              type="button"
              role="tab"
              class="op-fill-tab"
              :class="{ 'is-active': category === 'GRADIENT' }"
              :aria-selected="category === 'GRADIENT'"
              @click="actions.toGradient()"
            >
              Gradient
            </button>
            <button
              type="button"
              role="tab"
              class="op-fill-tab"
              :class="{ 'is-active': category === 'IMAGE' }"
              :aria-selected="category === 'IMAGE'"
              @click="actions.toImage()"
            >
              Image
            </button>
          </div>

          <ColorPickerBody
            v-if="category === 'SOLID'"
            ref="bodyRef"
            :color="fill.color"
            :opacity="fill.opacity"
            :okhcl="okhcl"
            @update="emitSolidColor"
          />

          <GradientEditorRoot
            v-else-if="category === 'GRADIENT'"
            v-model:active-stop-index="activeStop"
            :fill="fill"
            @update="(next) => emit('update', next)"
          >
            <template #default="g">
              <div class="op-cp" @keydown.stop>
                <div class="op-cp-model-row">
                  <select
                    class="op-cp-select"
                    :value="g.subtype"
                    aria-label="Gradient type"
                    @change="(e) => g.actions.setSubtype((e.target as HTMLSelectElement).value as typeof g.subtype)"
                  >
                    <option v-for="sub in g.subtypes" :key="sub.value" :value="sub.value">{{ sub.label }}</option>
                  </select>
                </div>

                <GradientEditorBar
                  :stops="g.stops"
                  :active-stop-index="g.activeStopIndex"
                  :bar-background="g.barBackground"
                  @select-stop="g.actions.selectStop"
                  @drag-stop="g.actions.dragStop"
                >
                  <template #default="{ stops, activeStopIndex, barBackground, actions: barActions }">
                    <div class="op-grad-bar" :style="{ background: barBackground }">
                      <button
                        v-for="(stop, idx) in stops"
                        :key="idx"
                        type="button"
                        class="op-grad-handle"
                        :class="{ 'is-active': idx === activeStopIndex }"
                        :style="{ left: `${stop.position * 100}%`, background: `#${colorToHex(stop.color)}` }"
                        :aria-label="`Gradient stop ${idx + 1}`"
                        @pointerdown="barActions.stopPointerDown(idx, $event)"
                      />
                    </div>
                  </template>
                </GradientEditorBar>

                <div class="op-prop-head">
                  Stops
                  <button type="button" class="op-icon-btn" title="Add gradient stop" @click="g.actions.addStop()">
                    <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
                  </button>
                </div>

                <div class="op-grad-stops">
                  <div
                    v-for="(stop, idx) in g.stops"
                    :key="idx"
                    class="op-grad-stop"
                    :class="{ 'is-active': idx === g.activeStopIndex }"
                    @click="g.actions.selectStop(idx)"
                  >
                    <NumField
                      class="op-grad-pos"
                      suffix="%"
                      :min="0"
                      :max="100"
                      :digits="0"
                      :value="Math.round(stop.position * 100)"
                      @commit="(v) => g.actions.updateStopPosition(idx, v)"
                    />
                    <ColorField
                      :color="{ ...stop.color, a: 1 }"
                      :opacity="stop.color.a"
                      @color="(c) => updateStopColor(idx, c, stop.color.a, (next) => emit('update', next))"
                      @opacity="(o) => g.actions.updateStopOpacity(idx, o * 100)"
                    />
                    <button
                      type="button"
                      class="op-icon-btn"
                      :disabled="g.stops.length <= 2"
                      title="Remove gradient stop"
                      @click.stop="g.actions.removeStop(idx)"
                    >
                      <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </GradientEditorRoot>

          <div v-else class="op-cp" @keydown.stop>
            <div class="op-img-preview">
              <img
                v-if="imagePreviewUrl && !imageFailed"
                :src="imagePreviewUrl"
                alt="Fill image"
                :style="{ transform: `rotate(${fill.imageRotation ?? 0}deg)` }"
                @error="imageFailed = true"
              />
              <span v-else-if="imageFailed" class="op-prop-note">Image unavailable</span>
              <span v-else class="op-prop-note">No image selected</span>
            </div>

            <div class="op-img-actions">
              <button type="button" class="op-export-btn" @click="chooseImage">
                {{ fill.imageHash ? 'Replace' : 'Choose image' }}
              </button>
              <input ref="fileInputRef" type="file" accept="image/*" hidden @change="onFileInputChange" />
              <select
                class="op-cp-select"
                :value="fill.imageScaleMode ?? 'FILL'"
                aria-label="Image scale mode"
                @change="(e) => emit('update', { ...fill, imageScaleMode: (e.target as HTMLSelectElement).value as Fill['imageScaleMode'] })"
              >
                <option v-for="m in IMAGE_SCALE_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
              <button type="button" class="op-icon-btn" title="Rotate 90°" @click="rotateImage90">
                <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 8a5 5 0 1 1-1.5-3.5L13 6" />
                  <path d="M13 3v3h-3" />
                </svg>
              </button>
            </div>

            <div class="op-img-adjustments">
              <div v-for="adj in ADJUSTMENT_FIELDS" :key="adj.key" class="op-img-adj-row">
                <span class="op-img-adj-label">{{ adj.label }}</span>
                <NumField
                  suffix="%"
                  :min="-100"
                  :max="100"
                  :digits="0"
                  :value="Math.round(((fill.filters?.[adj.key] ?? 0) as number) * 100)"
                  @commit="(v) => setAdjustment(adj.key, v / 100)"
                />
              </div>
            </div>
          </div>
        </ColorPickerRoot>

        <input
          v-if="category === 'SOLID'"
          class="op-hex"
          :value="hexText"
          spellcheck="false"
          @focus="(e) => { hexFocused = true; (e.target as HTMLInputElement).select() }"
          @input="(e) => (hexText = (e.target as HTMLInputElement).value)"
          @blur="commitHex"
          @keydown.stop="(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            else if (e.key === 'Escape') { hexText = colorToHex(fill.color); (e.target as HTMLInputElement).blur() }
          }"
        />
        <span v-else class="op-hex op-fill-kind-label">{{ fillLabel(fill) }}</span>

        <NumField
          class="op-color-opacity"
          suffix="%"
          :min="0"
          :max="100"
          :digits="0"
          :value="Math.round(fill.opacity * 100)"
          @commit="(v) => emit('opacity', v / 100)"
        />
      </div>
    </template>
  </FillRoot>
</template>
