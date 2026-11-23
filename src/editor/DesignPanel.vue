<script setup lang="ts">
// The right-hand Design panel, after OpenPencil's: page settings with nothing selected; position,
// appearance, typography, fill and stroke for a selection. Edits go through @open-pencil/vue's
// controls, so they are undoable and follow multi-selection ("Mixed") like the app's panel.
import { computed, inject, ref, watch } from 'vue'
import type { BlendMode, Fill, Stroke } from '@open-pencil/scene-graph'
import { clearNodeFillOkHCL, clearNodeStrokeOkHCL, getFillOkHCL, getStrokeOkHCL } from '@open-pencil/scene-graph/color'
import type { Color } from '@open-pencil/scene-graph/primitives'
import { PAGE_DEFAULT_BACKGROUNDS } from '@open-pencil/core/constants'
import { setPageBackgrounds } from '@open-pencil/core/figma-api'
import { useEditor } from '@open-pencil/vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { PositionControlsRoot } from '@open-pencil/vue/primitives/PositionControls'
import { useFontPicker } from '@open-pencil/vue/primitives/FontPicker'
import { TypographyControlsRoot } from '@open-pencil/vue/primitives/TypographyControls'
import { useNodeProps } from '@open-pencil/vue/controls/node-props'
import { useEditorPropertyList } from '@open-pencil/vue/controls/property-list'
import { useFillControls } from '@open-pencil/vue/controls/fill'
import { useSelectionColors } from '@open-pencil/vue/controls/selection-colors'
import { useStrokeControls } from '@open-pencil/vue/controls/stroke'
import { useOkHCL } from '@open-pencil/vue/controls/okhcl'
import type { OkHCLControls } from '@open-pencil/vue/controls/color-model'
import { useEditorCommands } from '@open-pencil/vue/editor/commands'
import { AUTO_ARRANGE_GROUPS, type MenuEntry } from '@open-pencil/vue/editor/menu-model'
import { ColorField, NumField } from './fields'
import FillField from './FillField.vue'
import AutoLayoutSection from './AutoLayoutSection.vue'
import EffectsSection from './EffectsSection.vue'
import ExportSection from './ExportSection.vue'
import { SHOW_CONTEXT_MENU, toContextEntries } from './context'
import { EYE_ICON, EYE_OFF_ICON, LAYER_ICONS } from './icons'

const editor = useEditor()
const { node, nodes, isMulti, merged, updateAllWithUndo } = useNodeProps()
const fills = useEditorPropertyList('fills')
const strokes = useEditorPropertyList('strokes')
const { defaultFill } = useFillControls()
const strokeControls = useStrokeControls()
const selectionColors = useSelectionColors()
const okhcl = useOkHCL()
const { menuItem } = useEditorCommands()
const showContextMenu = inject(SHOW_CONTEXT_MENU, null)

const hasSelection = computed(() => nodes.value.length > 0)
const isText = computed(() => nodes.value.length > 0 && nodes.value.some((n) => n.type === 'TEXT'))

const BUNDLED_FAMILIES: string[] = [
  'Inter',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
]

let localFontState: 'unsupported' | 'prompt' | 'granted' | 'denied' =
  typeof window !== 'undefined' && 'queryLocalFonts' in window ? 'prompt' : 'unsupported'

const localFontAccess = {
  state: () => localFontState,
  load: async (): Promise<string[]> => {
    if (typeof window === 'undefined' || !('queryLocalFonts' in window)) {
      localFontState = 'unsupported'
      return []
    }
    try {
      const fonts = await (window as unknown as { queryLocalFonts: () => Promise<Array<{ family: string }>> }).queryLocalFonts()
      localFontState = 'granted'
      const seen = new Set<string>()
      const result: string[] = []
      for (const f of fonts) {
        if (!seen.has(f.family)) {
          seen.add(f.family)
          result.push(f.family)
        }
      }
      return result
    } catch {
      localFontState = 'denied'
      return []
    }
  },
}

async function listFontFamilies(): Promise<string[]> {
  return BUNDLED_FAMILIES
}

const TYPE_NAMES: Record<string, string> = {
  FRAME: 'Frame', GROUP: 'Group', SECTION: 'Section', COMPONENT: 'Component', COMPONENT_SET: 'Component set',
  INSTANCE: 'Instance', RECTANGLE: 'Rectangle', ROUNDED_RECTANGLE: 'Rectangle', ELLIPSE: 'Ellipse',
  LINE: 'Line', POLYGON: 'Polygon', STAR: 'Star', TEXT: 'Text', VECTOR: 'Vector',
  BOOLEAN_OPERATION: 'Boolean', IMAGE: 'Image',
}
const heading = computed(() => {
  if (isMulti.value) return `${nodes.value.length} selected`
  const n = node.value
  return n ? (TYPE_NAMES[n.type] ?? n.type) : ''
})
const headingIcon = computed(() => (node.value && !isMulti.value ? LAYER_ICONS[node.value.type] : undefined))

function openMenuAtButton(entries: MenuEntry[], event: MouseEvent) {
  if (!showContextMenu) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  showContextMenu(toContextEntries(entries), { x: rect.left, y: rect.bottom })
}

function openBooleanMenu(event: MouseEvent) {
  openMenuAtButton(
    [
      menuItem('selection.booleanUnion'),
      menuItem('selection.booleanSubtract'),
      menuItem('selection.booleanIntersect'),
      menuItem('selection.booleanExclude'),
      { separator: true },
      menuItem('selection.flatten'),
    ],
    event,
  )
}

function openArrangeMenu(event: MouseEvent) {
  const autoArrangeSub: MenuEntry[] = AUTO_ARRANGE_GROUPS.flatMap((group, i) => [
    ...(i > 0 ? [{ separator: true } as const] : []),
    ...group.map((id) => menuItem(id)),
  ])
  openMenuAtButton(
    [
      menuItem('selection.tidyUp'),
      menuItem('selection.distributeVertical'),
      menuItem('selection.distributeHorizontal'),
      { separator: true },
      menuItem('selection.packHorizontal'),
      menuItem('selection.packVertical'),
      { separator: true },
      { label: 'Auto arrange', sub: autoArrangeSub },
    ],
    event,
  )
}

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
const BLEND_MODES: { value: BlendMode; label: string; containerOnly?: boolean }[] = [
  { value: 'PASS_THROUGH', label: 'Pass through', containerOnly: true },
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
const canPassThrough = computed(() =>
  nodes.value.length > 0 &&
  nodes.value.every((n) => ['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'].includes(n.type)),
)
const blendModeOptions = computed(() => BLEND_MODES.filter((m) => !m.containerOnly || canPassThrough.value))
const blendMode = computed(() => merged('blendMode'))
const opacity = computed(() => num(merged('opacity')))
const radius = computed(() => num(merged('cornerRadius')))
const independentCorners = computed(() => {
  void editor.state.sceneVersion
  return nodes.value.some((n) => n.independentCorners)
})
const topLeftRadius = computed(() => num(merged('topLeftRadius')))
const topRightRadius = computed(() => num(merged('topRightRadius')))
const bottomLeftRadius = computed(() => num(merged('bottomLeftRadius')))
const bottomRightRadius = computed(() => num(merged('bottomRightRadius')))
const hasRadius = computed(() =>
  nodes.value.some((n) => ['RECTANGLE', 'ROUNDED_RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE', 'IMAGE'].includes(n.type)),
)
const maxCornerRadius = computed(() => {
  const n = node.value
  return n ? Math.max(0, Math.floor(Math.min(n.width, n.height) / 2)) : Infinity
})
function clampRadius(v: number): number {
  return Math.min(maxCornerRadius.value, Math.max(0, v))
}
function toggleIndependentCorners() {
  const next = !independentCorners.value
  editor.undo.runBatch('Toggle independent corners', () => {
    for (const n of nodes.value) {
      if (next) {
        const r = clampRadius(n.cornerRadius)
        editor.updateNodeWithUndo(
          n.id,
          { independentCorners: true, topLeftRadius: r, topRightRadius: r, bottomLeftRadius: r, bottomRightRadius: r },
          'Toggle independent corners',
        )
      } else {
        editor.updateNodeWithUndo(n.id, { independentCorners: false }, 'Toggle independent corners')
      }
    }
  })
}

// ---- Stroke
const strokeWeight = computed(() => num(merged('strokeWeight')))
const strokeAlign = computed(() => strokeControls.currentAlign())
const hasStrokeSides = computed(() =>
  nodes.value.length > 0 &&
  nodes.value.every((n) => ['RECTANGLE', 'ROUNDED_RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type)),
)
const strokeSidesCustom = computed(() => {
  void editor.state.sceneVersion
  return nodes.value.some((n) => n.independentStrokeWeights)
})
const strokeDash = computed(() => {
  void editor.state.sceneVersion
  const s = strokes.items.value[0]
  return s ? strokeControls.dashState(s) : { on: false, dash: 6, gap: 6 }
})
function toggleStrokeSides() {
  strokeControls.selectSide(strokeSidesCustom.value ? 'ALL' : 'CUSTOM')
}

// ---- Fill/stroke rows
const addFill = () => fills.actions.add(structuredClone(defaultFill) as Fill)
const addStroke = () => strokes.actions.add(structuredClone(strokeControls.defaultStroke) as Stroke)
function fillOkHCL(i: number): OkHCLControls | null {
  const n = node.value
  if (!n || isMulti.value) return null
  const info = okhcl.getFillPreviewInfo(n, i)
  return {
    fieldFormat: okhcl.getFieldFormat(n, i, 'fill'),
    fieldOptions: okhcl.fieldOptions,
    okhcl: okhcl.getFillOkHCLColor(n, i),
    previewColorSpace: info.previewColorSpace,
    clipped: info.clipped,
    setFieldFormat: (fmt) => okhcl.setFillFieldFormat(n, i, fmt),
    updateOkHCL: (patch) => okhcl.updateFillOkHCL(n, i, patch),
  }
}
function strokeOkHCL(i: number): OkHCLControls | null {
  const n = node.value
  if (!n || isMulti.value) return null
  const info = okhcl.getStrokePreviewInfo(n, i)
  return {
    fieldFormat: okhcl.getFieldFormat(n, i, 'stroke'),
    fieldOptions: okhcl.fieldOptions,
    okhcl: okhcl.getStrokeOkHCLColor(n, i),
    previewColorSpace: info.previewColorSpace,
    clipped: info.clipped,
    setFieldFormat: (fmt) => okhcl.setStrokeFieldFormat(n, i, fmt),
    updateOkHCL: (patch) => okhcl.updateStrokeOkHCL(n, i, patch),
  }
}
function setFillColor(i: number, c: Color) {
  fills.actions.patch(i, { color: c })
  const n = node.value
  if (n && !isMulti.value && getFillOkHCL(n, i)) {
    editor.updateNodeWithUndo(n.id, clearNodeFillOkHCL(n, i), 'Change fill')
  }
}
function setStrokeColor(i: number, c: Color) {
  strokes.actions.patch(i, { color: c })
  const n = node.value
  if (n && !isMulti.value && getStrokeOkHCL(n, i)) {
    editor.updateNodeWithUndo(n.id, clearNodeStrokeOkHCL(n, i), 'Change stroke')
  }
}
function fillLabel(f: Fill) {
  if (f.type === 'SOLID') return null
  if (f.type.startsWith('GRADIENT')) return f.type.replace('GRADIENT_', '').toLowerCase() + ' gradient'
  return f.type.toLowerCase()
}

// ---- Typography
const fontFamily = ref('')

const {
  searchTerm: fontSearch,
  open: fontPickerOpen,
  filtered: filteredFonts,
  loading: fontsLoading,
  accessState: fontAccessState,
  requestAccess: requestFontAccess,
  select: selectFontFamily,
} = useFontPicker({
  modelValue: fontFamily,
  listFamilies: listFontFamilies,
})
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
      <ExportSection />
    </template>

    <!-- A selection -->
    <template v-else>
      <section class="op-prop op-prop-title">
        <svg v-if="headingIcon" class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" v-html="headingIcon" />
        <span>{{ heading }}</span>
        <button class="op-icon-btn op-title-action" title="Boolean operations" @click="openBooleanMenu">
          <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
            <rect x="2.5" y="2.5" width="7" height="7" rx="1" /><rect x="6.5" y="6.5" width="7" height="7" rx="1" />
          </svg>
        </button>
      </section>

      <PositionControlsRoot v-slot="pos">
        <section class="op-prop">
          <div class="op-prop-head">
            Position
            <button v-if="isMulti" class="op-icon-btn" title="Arrange" @click="openArrangeMenu">⋯</button>
          </div>
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
            <template v-if="!pos.inAutoLayout || pos.ignoresAutoLayout">
              <NumField label="X" :value="pos.xValue" @commit="(v: number, p: number) => setProp(pos.actions, 'x', v, p)" />
              <NumField label="Y" :value="pos.yValue" @commit="(v: number, p: number) => setProp(pos.actions, 'y', v, p)" />
            </template>
            <NumField v-if="pos.rotates" label="↻" title="Rotation" suffix="°" :value="pos.rotationValue" @commit="(v: number) => setProp(pos.actions, 'rotation', v, pos.rotationValue as number)" />
          </div>
          <div class="op-transform-row">
            <button class="op-icon-btn" title="Flip horizontal (Shift+H)" @click="pos.actions.flip('horizontal')">⇄</button>
            <button class="op-icon-btn" title="Flip vertical (Shift+V)" @click="pos.actions.flip('vertical')">⇅</button>
            <button v-if="pos.rotates" class="op-icon-btn" title="Rotate 90°" @click="pos.actions.rotate(90)">↻90°</button>
            <button
              v-if="pos.inAutoLayout"
              class="op-icon-btn op-ignore-layout"
              :class="{ 'is-on': pos.ignoresAutoLayout }"
              title="Ignore auto layout"
              @click="pos.actions.toggleIgnoreAutoLayout()"
            >
              Ignore auto layout
            </button>
          </div>
        </section>
      </PositionControlsRoot>

      <AutoLayoutSection />

      <section class="op-prop">
        <div class="op-prop-head">Appearance</div>
        <div class="op-grid2">
          <label class="op-field">
            <select
              :value="typeof blendMode === 'string' ? blendMode : ''"
              aria-label="Blend mode"
              @change="(e: Event) => updateAllWithUndo({ blendMode: (e.target as HTMLSelectElement).value as BlendMode }, 'Change blend mode')"
            >
              <option v-if="typeof blendMode !== 'string'" value="" disabled>Mixed</option>
              <option v-for="m in blendModeOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </label>
          <NumField label="◐" title="Opacity" suffix="%" :digits="0" :min="0" :max="100"
            :value="typeof opacity === 'number' ? opacity * 100 : opacity"
            @commit="(v: number) => updateAllWithUndo({ opacity: v / 100 }, 'Change opacity')" />
        </div>
        <div v-if="hasRadius" class="op-grid2" style="margin-top: 4px">
          <NumField v-if="!independentCorners" label="◜" title="Corner radius" :min="0" :max="maxCornerRadius"
            :value="radius"
            @commit="(v: number) => updateAllWithUndo({ cornerRadius: clampRadius(v) }, 'Change corner radius')" />
          <span v-else class="op-prop-note">Corners</span>
          <button
            type="button"
            class="op-icon-btn"
            :class="{ 'is-on': independentCorners }"
            title="Independent corner radii"
            aria-label="Independent corner radii"
            @click="toggleIndependentCorners"
          >
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
              <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />
            </svg>
          </button>
        </div>
        <div v-if="hasRadius && independentCorners" class="op-grid2" style="margin-top: 4px">
          <NumField label="TL" title="Top-left radius" :min="0" :max="maxCornerRadius" :value="topLeftRadius"
            @commit="(v: number) => updateAllWithUndo({ topLeftRadius: clampRadius(v) }, 'Change top-left radius')" />
          <NumField label="TR" title="Top-right radius" :min="0" :max="maxCornerRadius" :value="topRightRadius"
            @commit="(v: number) => updateAllWithUndo({ topRightRadius: clampRadius(v) }, 'Change top-right radius')" />
          <NumField label="BL" title="Bottom-left radius" :min="0" :max="maxCornerRadius" :value="bottomLeftRadius"
            @commit="(v: number) => updateAllWithUndo({ bottomLeftRadius: clampRadius(v) }, 'Change bottom-left radius')" />
          <NumField label="BR" title="Bottom-right radius" :min="0" :max="maxCornerRadius" :value="bottomRightRadius"
            @commit="(v: number) => updateAllWithUndo({ bottomRightRadius: clampRadius(v) }, 'Change bottom-right radius')" />
        </div>
      </section>

      <TypographyControlsRoot v-if="isText" v-slot="type">
        <section class="op-prop">
          <div class="op-prop-head">Typography</div>
          <PopoverRoot v-model:open="fontPickerOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                class="op-field op-field-wide op-font-picker-trigger"
                :class="{ 'is-open': fontPickerOpen, 'is-missing': type.hasMissingFonts.value }"
                :title="type.hasMissingFonts.value ? `Missing font: ${type.missingFonts.value.join(', ')}` : 'Font family'"
              >
                <span class="op-font-picker-value" :style="typeof merged('fontFamily') === 'string' ? { fontFamily } : undefined">
                  {{ typeof merged('fontFamily') === 'symbol' ? 'Mixed' : (fontFamily || 'Font family') }}
                </span>
                <span class="op-font-picker-caret">▾</span>
              </button>
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent class="op-font-picker-content" side="left" :side-offset="8" align="start">
                <input
                  v-model="fontSearch"
                  class="op-font-picker-search"
                  placeholder="Search fonts…"
                  spellcheck="false"
                  @keydown.stop
                />
                <div class="op-font-picker-viewport">
                  <div
                    v-for="f in filteredFonts"
                    :key="f.family"
                    class="op-font-picker-row"
                    :class="{ 'is-selected': f.family === fontFamily }"
                    @click="() => { selectFontFamily(f.family); type.actions.setFamily(f.family) }"
                  >
                    <div class="op-font-picker-item">
                      <span class="op-font-picker-name" :style="{ fontFamily: f.family }">{{ f.family }}</span>
                      <span class="op-font-picker-badge">{{ f.source }}</span>
                    </div>
                  </div>
                  <div v-if="filteredFonts.length === 0" class="op-font-picker-empty">
                    No matching fonts
                  </div>
                </div>
                <button
                  v-if="fontAccessState === 'prompt'"
                  type="button"
                  class="op-btn op-btn-sm"
                  :disabled="fontsLoading"
                  @click="requestFontAccess"
                >
                  {{ fontsLoading ? 'Loading…' : 'Load system fonts' }}
                </button>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
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
          <div class="op-segmented">
            <button
              v-for="va in (['TOP', 'CENTER', 'BOTTOM'] as const)"
              :key="va"
              :class="{ 'is-active': type.merged('textAlignVertical') === va }"
              :title="`Vertical align ${va === 'CENTER' ? 'middle' : va.toLowerCase()}`"
              @click="type.actions.setVerticalAlign(va)"
            >
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
                <path :d="va === 'TOP' ? 'M3 3h10M8 5v8M5.5 7.5L8 5l2.5 2.5' : va === 'CENTER' ? 'M3 8h10M8 2v4M8 10v4' : 'M3 13h10M8 3v8M5.5 8.5L8 11l2.5-2.5'" />
              </svg>
            </button>
          </div>
          <div class="op-segmented">
            <button
              :class="{ 'is-active': type.activeFormatting.value.includes('BOLD') }"
              title="Bold"
              @click="type.actions.toggleBold()"
            >
              <strong>B</strong>
            </button>
            <button
              :class="{ 'is-active': type.activeFormatting.value.includes('ITALIC') }"
              title="Italic"
              @click="type.actions.toggleItalic()"
            >
              <em>I</em>
            </button>
            <button
              :class="{ 'is-active': type.activeFormatting.value.includes('UNDERLINE') }"
              title="Underline"
              @click="type.actions.toggleDecoration('UNDERLINE')"
            >
              <u>U</u>
            </button>
            <button
              :class="{ 'is-active': type.activeFormatting.value.includes('STRIKETHROUGH') }"
              title="Strikethrough"
              @click="type.actions.toggleDecoration('STRIKETHROUGH')"
            >
              <s>S</s>
            </button>
          </div>
          <div class="op-segmented">
            <button
              v-for="tc in ([
                { value: 'ORIGINAL', label: 'Ag', title: 'Original case' },
                { value: 'UPPER', label: 'AG', title: 'Uppercase' },
                { value: 'LOWER', label: 'ag', title: 'Lowercase' },
                { value: 'TITLE', label: 'Ab', title: 'Title case' },
              ] as const)"
              :key="tc.value"
              :class="{ 'is-active': type.merged('textCase') === tc.value }"
              :title="tc.title"
              @click="type.actions.setTextCase(tc.value)"
            >
              {{ tc.label }}
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
          <FillField
            v-if="fill.type === 'SOLID' || fill.type.startsWith('GRADIENT_') || fill.type === 'IMAGE'"
            :fill="fill"
            :index="i"
            :node-id="node?.id ?? null"
            :okhcl="fillOkHCL(i)"
            @update="(next: Fill) => fills.actions.update(i, next)"
            @color="(c: Color) => setFillColor(i, c)"
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
            <FillField
              :fill="stroke"
              :index="i"
              paint="strokes"
              :node-id="node?.id ?? null"
              :okhcl="strokeOkHCL(i)"
              @update="(next: Fill) => strokes.actions.update(i, next as Stroke)"
              @color="(c: Color) => setStrokeColor(i, c)"
              @opacity="(o: number) => strokes.actions.patch(i, { opacity: o })"
            />
            <button class="op-icon-btn" :title="stroke.visible ? 'Hide stroke' : 'Show stroke'" @click="strokes.actions.toggleVisibility(i)">
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" v-html="stroke.visible ? EYE_ICON : EYE_OFF_ICON" />
            </button>
            <button class="op-icon-btn" title="Remove stroke" @click="strokes.actions.remove(i)">
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
            </button>
          </div>
          <div v-if="strokes.items.value.length" class="op-stroke-controls">
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
            <button
              v-if="hasStrokeSides"
              type="button"
              class="op-icon-btn"
              :class="{ 'is-on': strokeSidesCustom }"
              title="Individual sides"
              aria-label="Individual sides"
              @click="toggleStrokeSides"
            >
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
                <rect x="3" y="3" width="10" height="10" rx="1" stroke-dasharray="2 2" />
                <path d="M3 3h10" />
              </svg>
            </button>
            <PopoverRoot>
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="op-icon-btn"
                  :class="{ 'is-on': strokeControls.advancedActive.value }"
                  title="Stroke settings"
                  aria-label="Stroke settings"
                >
                  <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="3.5" cy="8" r="1.25" />
                    <circle cx="8" cy="8" r="1.25" />
                    <circle cx="12.5" cy="8" r="1.25" />
                  </svg>
                </button>
              </PopoverTrigger>
              <PopoverPortal>
                <PopoverContent side="left" :side-offset="8" class="op-cp-popover op-stroke-popover" @keydown.stop>
                  <div class="op-cp">
                    <label class="op-stroke-switch">
                      <span>Dashed stroke</span>
                      <input
                        type="checkbox"
                        :checked="strokeDash.on"
                        @change="() => { const s = strokes.items.value[0]; if (s) strokes.actions.patch(0, strokeControls.toggleDash(s)) }"
                      />
                    </label>
                    <div v-if="strokeDash.on" class="op-grid2">
                      <NumField
                        label="Dash"
                        :min="0"
                        :digits="1"
                        :value="strokeDash.dash"
                        @commit="(v: number) => { const s = strokes.items.value[0]; if (s) strokes.actions.patch(0, v <= 0 ? { dashPattern: [] } : strokeControls.setDash(s, v)) }"
                      />
                      <NumField label="Gap" :min="0" :digits="1" :value="strokeDash.gap" @commit="(v: number) => { const s = strokes.items.value[0]; if (s) strokes.actions.patch(0, strokeControls.setGap(s, v)) }" />
                    </div>
                    <div class="op-stroke-row">
                      <span class="op-img-adj-label">Cap</span>
                      <select
                        class="op-cp-select"
                        :value="typeof strokeControls.cap.value === 'string' ? strokeControls.cap.value : ''"
                        aria-label="Stroke cap"
                        @change="(e: Event) => strokeControls.setCap((e.target as HTMLSelectElement).value as Stroke['cap'] & string)"
                      >
                        <option v-if="typeof strokeControls.cap.value !== 'string'" value="" disabled>Mixed</option>
                        <option v-for="o in strokeControls.capOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                    </div>
                    <div class="op-stroke-row">
                      <span class="op-img-adj-label">Join</span>
                      <select
                        class="op-cp-select"
                        :value="typeof strokeControls.join.value === 'string' ? strokeControls.join.value : ''"
                        aria-label="Stroke join"
                        @change="(e: Event) => strokeControls.setJoin((e.target as HTMLSelectElement).value as Stroke['join'] & string)"
                      >
                        <option v-if="typeof strokeControls.join.value !== 'string'" value="" disabled>Mixed</option>
                        <option v-for="o in strokeControls.joinOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                      </select>
                    </div>
                    <div class="op-stroke-row">
                      <span class="op-img-adj-label">Miter limit</span>
                      <NumField
                        :min="1"
                        :digits="2"
                        :value="typeof strokeControls.miterLimit.value === 'number' ? strokeControls.miterLimit.value : strokeControls.miterLimit.value"
                        @commit="(v: number) => { strokeControls.updateMiterLimit(v); strokeControls.commitMiterLimit(v) }"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </PopoverPortal>
            </PopoverRoot>
          </div>
          <div v-if="strokes.items.value.length && hasStrokeSides && strokeSidesCustom" class="op-grid2 op-stroke-sides">
            <NumField label="T" title="Top stroke weight" :min="0" :value="strokeControls.borderWeight('top')" @commit="(v: number) => strokeControls.updateBorderWeight('top', v)" />
            <NumField label="R" title="Right stroke weight" :min="0" :value="strokeControls.borderWeight('right')" @commit="(v: number) => strokeControls.updateBorderWeight('right', v)" />
            <NumField label="B" title="Bottom stroke weight" :min="0" :value="strokeControls.borderWeight('bottom')" @commit="(v: number) => strokeControls.updateBorderWeight('bottom', v)" />
            <NumField label="L" title="Left stroke weight" :min="0" :value="strokeControls.borderWeight('left')" @commit="(v: number) => strokeControls.updateBorderWeight('left', v)" />
          </div>
        </template>
      </section>

      <section v-if="selectionColors.shown.value && selectionColors.colors.value.length > 0" class="op-prop">
        <div class="op-prop-head">Selection colors</div>
        <div v-for="(item, i) in selectionColors.colors.value" :key="i" class="op-paint">
          <ColorField
            :color="item.color"
            :opacity="item.opacity"
            @color="(c: Color) => { selectionColors.begin(); selectionColors.replace(i, { color: c, opacity: item.opacity }); selectionColors.finish() }"
            @opacity="(o: number) => { selectionColors.begin(); selectionColors.replace(i, { color: item.color, opacity: o }); selectionColors.finish() }"
          />
        </div>
      </section>

      <EffectsSection />
      <ExportSection />
    </template>
  </aside>
</template>
