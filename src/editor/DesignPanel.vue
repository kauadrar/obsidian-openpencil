<script setup lang="ts">
// The right-hand Design panel, after OpenPencil's: page settings with nothing selected; position,
// appearance, typography, fill and stroke for a selection. Edits go through @open-pencil/vue's
// controls, so they are undoable and follow multi-selection ("Mixed") like the app's panel.
import { computed, ref, watch } from 'vue'
import type { Fill, Stroke } from '@open-pencil/scene-graph'
import type { Color } from '@open-pencil/scene-graph/primitives'
import { PAGE_DEFAULT_BACKGROUNDS } from '@open-pencil/core/constants'
import { setPageBackgrounds } from '@open-pencil/core/figma-api'
import { useEditor } from '@open-pencil/vue'
import { PositionControlsRoot } from '@open-pencil/vue/primitives/PositionControls'
import { TypographyControlsRoot } from '@open-pencil/vue/primitives/TypographyControls'
import { useNodeProps } from '@open-pencil/vue/controls/node-props'
import { useEditorPropertyList } from '@open-pencil/vue/controls/property-list'
import { useFillControls } from '@open-pencil/vue/controls/fill'
import { useStrokeControls } from '@open-pencil/vue/controls/stroke'
import { ColorField, NumField } from './fields'
import { EYE_ICON, EYE_OFF_ICON, LAYER_ICONS } from './icons'

const editor = useEditor()
const { node, nodes, isMulti, merged, updateAllWithUndo } = useNodeProps()
const fills = useEditorPropertyList('fills')
const strokes = useEditorPropertyList('strokes')
const { defaultFill } = useFillControls()
const strokeControls = useStrokeControls()

const hasSelection = computed(() => nodes.value.length > 0)
const isText = computed(() => nodes.value.length > 0 && nodes.value.every((n) => n.type === 'TEXT'))

const TYPE_NAMES: Record<string, string> = {
  FRAME: 'Frame', GROUP: 'Group', SECTION: 'Section', COMPONENT: 'Component', COMPONENT_SET: 'Component set',
  INSTANCE: 'Instance', RECTANGLE: 'Rectangle', ROUNDED_RECTANGLE: 'Rectangle', ELLIPSE: 'Ellipse',
  LINE: 'Line', POLYGON: 'Polygon', STAR: 'Star', TEXT: 'Text', VECTOR: 'Vector',
  BOOLEAN_OPERATION: 'Boolean', IMAGE: 'Image',
}
const heading = computed(() => {
  if (isMulti.value) return `${nodes.value.length} layers`
  const n = node.value
  return n ? (TYPE_NAMES[n.type] ?? n.type) : ''
})
const headingIcon = computed(() => (node.value && !isMulti.value ? LAYER_ICONS[node.value.type] : undefined))

const num = (v: unknown): number | symbol => (typeof v === 'number' ? v : typeof v === 'symbol' ? v : 0)

/** Previews then commits a numeric property, as dragging a field in the app does. */
function setProp(
  a: { updateProp: (k: never, v: never) => void; commitProp: (k: never, v: never, p: never) => void },
  key: string,
  value: number,
  previous: number,
) {
  a.updateProp(key as never, value as never)
  a.commitProp(key as never, value as never, previous as never)
}

// ---- Page (nothing selected)
const page = computed(() => {
  void editor.state.sceneVersion
  return editor.graph.getNode(editor.state.currentPageId) ?? null
})
const pageColor = computed<Color>(() => ({ ...editor.state.pageColor, a: 1 }))
function setPageColor(color: Color, opacity = editor.state.pageColor.a) {
  const target = page.value
  if (!target) return
  editor.recordEdit({ label: 'Change page color' }, () =>
    setPageBackgrounds(editor.graph, target, [
      { type: 'SOLID', color: { ...color, a: 1 }, opacity, visible: true, blendMode: 'NORMAL' },
    ]),
  )
}
const pageIsDefault = computed(() =>
  (['dark', 'light'] as const).some((t) => {
    const d = PAGE_DEFAULT_BACKGROUNDS[t]
    const c = editor.state.pageColor
    return Math.abs(d.r - c.r) + Math.abs(d.g - c.g) + Math.abs(d.b - c.b) < 0.01
  }),
)

// ---- Appearance
const opacity = computed(() => num(merged('opacity')))
const radius = computed(() => num(merged('cornerRadius')))
const hasRadius = computed(() =>
  nodes.value.some((n) => ['RECTANGLE', 'ROUNDED_RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE', 'IMAGE'].includes(n.type)),
)

// ---- Stroke
const strokeWeight = computed(() => num(merged('strokeWeight')))
const strokeAlign = computed(() => strokeControls.currentAlign())

// ---- Fill/stroke rows
const addFill = () => fills.actions.add(structuredClone(defaultFill) as Fill)
const addStroke = () => strokes.actions.add(structuredClone(strokeControls.defaultStroke) as Stroke)
function fillLabel(f: Fill) {
  if (f.type === 'SOLID') return null
  if (f.type.startsWith('GRADIENT')) return f.type.replace('GRADIENT_', '').toLowerCase() + ' gradient'
  return f.type.toLowerCase()
}

// ---- Typography
const fontFamily = ref('')
watch(
  () => (isText.value ? merged('fontFamily') : ''),
  (v) => (fontFamily.value = typeof v === 'string' ? v : ''),
  { immediate: true },
)
const lengthValue = (v: unknown) =>
  v && typeof v === 'object' && 'value' in v ? (v as { value: number }).value : typeof v === 'symbol' ? v : 0
/** A TextLength keeps the unit it has: percent stays percent, pixels stay pixels. */
const lengthUnit = (v: unknown): 'PIXELS' | 'PERCENT' =>
  v && typeof v === 'object' && (v as { unit?: string }).unit === 'PERCENT' ? 'PERCENT' : 'PIXELS'
</script>

<template>
  <aside class="op-design">
    <div class="op-design-tabs">
      <span class="op-design-tab is-active">Design</span>
      <span class="op-design-zoom">{{ Math.round(editor.state.zoom * 100) }}%</span>
    </div>

    <!-- Nothing selected: the page -->
    <template v-if="!hasSelection">
      <section class="op-prop">
        <div class="op-prop-head">Page</div>
        <ColorField
          :color="pageColor"
          :opacity="editor.state.pageColor.a"
          @color="(c: Color) => setPageColor(c)"
          @opacity="(o: number) => setPageColor(pageColor, o)"
        />
        <button v-if="!pageIsDefault" class="op-link" @click="setPageColor({ ...PAGE_DEFAULT_BACKGROUNDS[editor.state.theme ?? 'light'] })">
          Reset to default
        </button>
      </section>
      <section class="op-prop">
        <div class="op-prop-head">Document</div>
        <div class="op-prop-note">{{ editor.graph.getPages().length }} page(s) · {{ page?.childIds.length ?? 0 }} top-level layer(s) on this page</div>
      </section>
    </template>

    <!-- A selection -->
    <template v-else>
      <section class="op-prop op-prop-title">
        <svg v-if="headingIcon" class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" v-html="headingIcon" />
        <span>{{ heading }}</span>
      </section>

      <PositionControlsRoot v-slot="pos">
        <section class="op-prop">
          <div class="op-prop-head">Position</div>
          <div class="op-align-row">
            <button v-for="a in (['min', 'center', 'max'] as const)" :key="'h' + a" class="op-icon-btn" :title="`Align ${a === 'min' ? 'left' : a === 'max' ? 'right' : 'horizontal centers'}`" @click="pos.actions.align('horizontal', a)">
              <svg class="op-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
                <path :d="a === 'min' ? 'M2.5 2v12' : a === 'max' ? 'M13.5 2v12' : 'M8 2v12'" />
                <rect :x="a === 'min' ? 4.5 : a === 'max' ? 5.5 : 4" y="4" :width="a === 'center' ? 8 : 6" height="3" rx=".5" />
                <rect :x="a === 'min' ? 4.5 : a === 'max' ? 3.5 : 5" y="9" :width="a === 'center' ? 6 : 8" height="3" rx=".5" />
              </svg>
            </button>
            <span class="op-sep" />
            <button v-for="a in (['min', 'center', 'max'] as const)" :key="'v' + a" class="op-icon-btn" :title="`Align ${a === 'min' ? 'top' : a === 'max' ? 'bottom' : 'vertical centers'}`" @click="pos.actions.align('vertical', a)">
              <svg class="op-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
                <path :d="a === 'min' ? 'M2 2.5h12' : a === 'max' ? 'M2 13.5h12' : 'M2 8h12'" />
                <rect x="4" :y="a === 'min' ? 4.5 : a === 'max' ? 5.5 : 4" width="3" :height="a === 'center' ? 8 : 6" rx=".5" />
                <rect x="9" :y="a === 'min' ? 4.5 : a === 'max' ? 3.5 : 5" width="3" :height="a === 'center' ? 6 : 8" rx=".5" />
              </svg>
            </button>
          </div>
          <div class="op-grid2">
            <NumField label="X" :value="pos.xValue" @commit="(v: number, p: number) => setProp(pos.actions, 'x', v, p)" />
            <NumField label="Y" :value="pos.yValue" @commit="(v: number, p: number) => setProp(pos.actions, 'y', v, p)" />
            <NumField label="W" :value="pos.wValue" :min="0.01" @commit="(v: number, p: number) => setProp(pos.actions, 'width', v, p)" />
            <NumField label="H" :value="pos.hValue" :min="0.01" @commit="(v: number, p: number) => setProp(pos.actions, 'height', v, p)" />
            <NumField v-if="pos.rotates" label="↻" title="Rotation" suffix="°" :value="pos.rotationValue" @commit="(v: number, p: number) => setProp(pos.actions, 'rotation', v, p)" />
          </div>
        </section>
      </PositionControlsRoot>

      <section class="op-prop">
        <div class="op-prop-head">Appearance</div>
        <div class="op-grid2">
          <NumField label="◐" title="Opacity" suffix="%" :digits="0" :min="0" :max="100"
            :value="typeof opacity === 'number' ? opacity * 100 : opacity"
            @commit="(v: number) => updateAllWithUndo({ opacity: v / 100 }, 'Change opacity')" />
          <NumField v-if="hasRadius" label="◜" title="Corner radius" :min="0"
            :value="radius"
            @commit="(v: number) => updateAllWithUndo({ cornerRadius: v }, 'Change corner radius')" />
        </div>
      </section>

      <TypographyControlsRoot v-if="isText" v-slot="type">
        <section class="op-prop">
          <div class="op-prop-head">Typography</div>
          <label class="op-field op-field-wide">
            <input
              v-model="fontFamily"
              spellcheck="false"
              placeholder="Font family"
              @keydown.stop="(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()"
              @change="type.actions.setFamily(fontFamily.trim())"
            />
          </label>
          <div class="op-grid2">
            <label class="op-field">
              <select
                :value="typeof type.faceName.value === 'string' ? type.faceName.value : ''"
                @change="(e: Event) => type.actions.setFace((e.target as HTMLSelectElement).value)"
              >
                <option v-if="typeof type.faceName.value !== 'string'" value="" disabled>Mixed</option>
                <option v-for="f in type.faces.value" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </label>
            <NumField label="Aa" title="Font size" :min="1"
              :value="num(type.merged('fontSize'))"
              @commit="(v: number, p: number) => setProp(type.actions, 'fontSize', v, p)" />
            <NumField label="↕" title="Line height" :min="0"
              :suffix="lengthUnit(type.merged('lineHeight')) === 'PERCENT' ? '%' : ''"
              :value="lengthValue(type.merged('lineHeight'))"
              @commit="(v: number) => updateAllWithUndo({ lineHeight: { value: v, unit: lengthUnit(type.merged('lineHeight')) } }, 'Change line height')" />
            <NumField label="↔" title="Letter spacing"
              :suffix="lengthUnit(type.merged('letterSpacing')) === 'PERCENT' ? '%' : ''"
              :value="lengthValue(type.merged('letterSpacing'))"
              @commit="(v: number) => updateAllWithUndo({ letterSpacing: { value: v, unit: lengthUnit(type.merged('letterSpacing')) } }, 'Change letter spacing')" />
          </div>
          <div class="op-segmented">
            <button
              v-for="a in (['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'] as const)"
              :key="a"
              :class="{ 'is-active': type.merged('textAlignHorizontal') === a }"
              :title="`Align ${a.toLowerCase()}`"
              @click="type.actions.align(a)"
            >
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
                <path :d="a === 'LEFT' ? 'M2 4h12M2 8h8M2 12h10' : a === 'CENTER' ? 'M2 4h12M4 8h8M3 12h10' : a === 'RIGHT' ? 'M2 4h12M6 8h8M4 12h10' : 'M2 4h12M2 8h12M2 12h12'" />
              </svg>
            </button>
          </div>
          <div v-if="type.hasMissingFonts.value" class="op-prop-note is-warning">Missing font: {{ type.missingFonts.value.join(', ') }}</div>
        </section>
      </TypographyControlsRoot>

      <section class="op-prop">
        <div class="op-prop-head">
          Fill
          <button class="op-icon-btn" title="Add fill" @click="addFill">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
          </button>
        </div>
        <div v-if="fills.isMixed.value" class="op-prop-note">Click + to replace mixed fills</div>
        <div v-for="(fill, i) in fills.items.value" v-else :key="i" class="op-paint" :class="{ 'is-hidden': !fill.visible }">
          <ColorField
            v-if="fill.type === 'SOLID'"
            :color="fill.color"
            :opacity="fill.opacity"
            @color="(c: Color) => fills.actions.patch(i, { color: c })"
            @opacity="(o: number) => fills.actions.patch(i, { opacity: o })"
          />
          <span v-else class="op-paint-label">{{ fillLabel(fill) }}</span>
          <button class="op-icon-btn" :title="fill.visible ? 'Hide fill' : 'Show fill'" @click="fills.actions.toggleVisibility(i)">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" v-html="fill.visible ? EYE_ICON : EYE_OFF_ICON" />
          </button>
          <button class="op-icon-btn" title="Remove fill" @click="fills.actions.remove(i)">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
          </button>
        </div>
      </section>

      <section class="op-prop">
        <div class="op-prop-head">
          Stroke
          <button class="op-icon-btn" title="Add stroke" @click="addStroke">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
          </button>
        </div>
        <div v-if="strokes.isMixed.value" class="op-prop-note">Click + to replace mixed strokes</div>
        <template v-else>
          <div v-for="(stroke, i) in strokes.items.value" :key="i" class="op-paint" :class="{ 'is-hidden': !stroke.visible }">
            <ColorField
              :color="stroke.color"
              :opacity="stroke.opacity"
              @color="(c: Color) => strokes.actions.patch(i, { color: c })"
              @opacity="(o: number) => strokes.actions.patch(i, { opacity: o })"
            />
            <button class="op-icon-btn" :title="stroke.visible ? 'Hide stroke' : 'Show stroke'" @click="strokes.actions.toggleVisibility(i)">
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" v-html="stroke.visible ? EYE_ICON : EYE_OFF_ICON" />
            </button>
            <button class="op-icon-btn" title="Remove stroke" @click="strokes.actions.remove(i)">
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
            </button>
          </div>
          <div v-if="strokes.items.value.length" class="op-grid2">
            <label class="op-field">
              <select
                :value="typeof strokeAlign === 'string' ? strokeAlign : ''"
                @change="(e: Event) => strokeControls.updateAlign((e.target as HTMLSelectElement).value as Stroke['align'])"
              >
                <option v-if="typeof strokeAlign !== 'string'" value="" disabled>Mixed</option>
                <option v-for="o in strokeControls.alignOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
            <NumField label="≡" title="Stroke weight" :min="0" :value="strokeWeight"
              @commit="(v: number) => updateAllWithUndo({ strokeWeight: v }, 'Change stroke weight')" />
          </div>
        </template>
      </section>
    </template>
  </aside>
</template>
