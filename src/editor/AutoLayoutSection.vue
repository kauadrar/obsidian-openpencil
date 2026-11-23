<script setup lang="ts">
// The Design panel's Layout / Dimensions & Auto layout section: W/H with Fixed/Hug/Fill sizing,
// min/max constraints, aspect-ratio lock, text resizing, Flow (Freeform/Vertical/Horizontal/Grid),
// Wrap + counter-axis gap, Direction (Auto/LTR/RTL), Gap (number/Auto), and individual padding.
import { computed, ref, watch } from 'vue'
import type { LayoutDirection, LayoutMode, LayoutSizing } from '@open-pencil/scene-graph'
import { useEditor } from '@open-pencil/vue'
import { LayoutControlsRoot } from '@open-pencil/vue/primitives/LayoutControls'
import { useNodeProps } from '@open-pencil/vue/controls/node-props'
import { LAYOUT_CONTAINER_TYPES, useSelectionLayout, type TextResizeMode } from '@open-pencil/vue/controls/selection-layout'
import { NumField } from './fields'

const editor = useEditor()
const { node, nodes, isMulti, merged, updateAllWithUndo } = useNodeProps()
const multi = useSelectionLayout()

const CONTAINERS = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'])
const target = computed(() => (!isMulti.value ? node.value : null))
const isContainer = computed(() => !!target.value && LAYOUT_CONTAINER_TYPES.has(target.value.type))
const mode = computed<LayoutMode>(() => target.value?.layoutMode ?? 'NONE')
const hasLayout = computed(() => mode.value !== 'NONE')
const canAdd = computed(() => nodes.value.length > 0 && !hasLayout.value)

function addAutoLayout() {
  const n = target.value
  if (n && CONTAINERS.has(n.type)) editor.setLayoutMode(n.id, 'VERTICAL')
  else editor.wrapInAutoLayout()
}
function removeAutoLayout() {
  if (target.value) editor.setLayoutMode(target.value.id, 'NONE')
}
function setMode(next: LayoutMode) {
  if (target.value && next !== mode.value) editor.setLayoutMode(target.value.id, next)
}
function toggleWrap() {
  const n = target.value
  if (!n) return
  updateAllWithUndo({ layoutWrap: n.layoutWrap === 'WRAP' ? 'NO_WRAP' : 'WRAP' }, 'Change wrap')
}

// ---- Dimensions (W / H / Aspect-ratio lock / Min & Max)
const num = (v: unknown): number | symbol => (typeof v === 'number' ? v : typeof v === 'symbol' ? v : 0)
const widthValue = computed(() => num(merged('width')))
const heightValue = computed(() => num(merged('height')))

const ASPECT_LOCK_PLUGIN_ID = 'openpencil-obsidian'
const ASPECT_LOCK_KEY = 'aspectRatioLock'
const aspectLocked = computed(() => {
  void editor.state.sceneVersion
  return nodes.value.length > 0 && nodes.value.every((n) => n.pluginData?.some((p) => p.pluginId === ASPECT_LOCK_PLUGIN_ID && p.key === ASPECT_LOCK_KEY && p.value === '1'))
})
function toggleAspectLock() {
  const next = !aspectLocked.value
  editor.undo.runBatch('Toggle aspect ratio lock', () => {
    for (const n of nodes.value) {
      const rest = (n.pluginData ?? []).filter((p) => !(p.pluginId === ASPECT_LOCK_PLUGIN_ID && p.key === ASPECT_LOCK_KEY))
      const pluginData = next ? [...rest, { pluginId: ASPECT_LOCK_PLUGIN_ID, key: ASPECT_LOCK_KEY, value: '1' }] : rest
      editor.updateNodeWithUndo(n.id, { pluginData }, 'Toggle aspect ratio lock')
    }
  })
}
function applyAxisConstraint(
  pos: number,
  size: number,
  oldParent: number,
  newParent: number,
  constraint: string,
): { pos: number; size: number } {
  const delta = newParent - oldParent
  if (delta === 0) return { pos, size }
  switch (constraint) {
    case 'MAX':
      return { pos: pos + delta, size }
    case 'CENTER':
      return { pos: pos + delta / 2, size }
    case 'STRETCH':
      return { pos, size: Math.max(0.01, size + delta) }
    case 'SCALE': {
      const ratio = oldParent > 0 ? newParent / oldParent : 1
      return { pos: pos * ratio, size: Math.max(0.01, size * ratio) }
    }
    default:
      return { pos, size }
  }
}

function resizeNodeWithConstraints(n: (typeof nodes.value)[number], nextW: number, nextH: number, label: string) {
  const oldW = n.width
  const oldH = n.height
  editor.updateNodeWithUndo(n.id, { width: nextW, height: nextH }, label)
  if (n.type !== 'FRAME' && n.type !== 'COMPONENT' && n.type !== 'INSTANCE') return
  for (const cid of n.childIds) {
    const c = editor.graph.getNode(cid)
    if (!c) continue
    if (n.layoutMode !== 'NONE' && c.layoutPositioning !== 'ABSOLUTE') continue
    const h = applyAxisConstraint(c.x, c.width, oldW, nextW, c.horizontalConstraint)
    const v = applyAxisConstraint(c.y, c.height, oldH, nextH, c.verticalConstraint)
    const patch: Partial<typeof c> = {}
    if (h.pos !== c.x) patch.x = h.pos
    if (h.size !== c.width) patch.width = h.size
    if (v.pos !== c.y) patch.y = v.pos
    if (v.size !== c.height) patch.height = v.size
    if (Object.keys(patch).length > 0) {
      editor.updateNodeWithUndo(c.id, patch, label)
    }
  }
}

function commitWidth(v: number) {
  const nextW = Math.max(0.01, v)
  editor.undo.runBatch('Change width', () => {
    for (const n of nodes.value) {
      const nextH = aspectLocked.value
        ? Math.max(0.01, Math.round(nextW * (n.width > 0 ? n.height / n.width : 1) * 100) / 100)
        : n.height
      resizeNodeWithConstraints(n, nextW, nextH, 'Change width')
    }
  })
}
function commitHeight(v: number) {
  const nextH = Math.max(0.01, v)
  editor.undo.runBatch('Change height', () => {
    for (const n of nodes.value) {
      const nextW = aspectLocked.value
        ? Math.max(0.01, Math.round(nextH * (n.height > 0 ? n.width / n.height : 1) * 100) / 100)
        : n.width
      resizeNodeWithConstraints(n, nextW, nextH, 'Change height')
    }
  })
}

type MinMaxKey = 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'
const hasMinW = computed(() => target.value?.minWidth !== null && target.value?.minWidth !== undefined)
const hasMaxW = computed(() => target.value?.maxWidth !== null && target.value?.maxWidth !== undefined)
const hasMinH = computed(() => target.value?.minHeight !== null && target.value?.minHeight !== undefined)
const hasMaxH = computed(() => target.value?.maxHeight !== null && target.value?.maxHeight !== undefined)

function addMinMax(key: MinMaxKey) {
  const n = target.value
  if (!n) return
  const fallback = key.includes('Width') ? n.width : n.height
  updateAllWithUndo({ [key]: Math.max(0, Math.round(fallback)) }, `Add ${key}`)
}
function commitMinMax(key: MinMaxKey, v: number) {
  const n = target.value
  if (!n) return
  const val = Math.max(0, v)
  if (key === 'minWidth') {
    const patch: Record<string, number> = { minWidth: val }
    if (n.maxWidth !== null && val > n.maxWidth) patch.maxWidth = val
    updateAllWithUndo(patch, 'Change min width')
  } else if (key === 'maxWidth') {
    const clamped = n.minWidth !== null && val < n.minWidth ? n.minWidth : val
    updateAllWithUndo({ maxWidth: clamped }, 'Change max width')
  } else if (key === 'minHeight') {
    const patch: Record<string, number> = { minHeight: val }
    if (n.maxHeight !== null && val > n.maxHeight) patch.maxHeight = val
    updateAllWithUndo(patch, 'Change min height')
  } else {
    const clamped = n.minHeight !== null && val < n.minHeight ? n.minHeight : val
    updateAllWithUndo({ maxHeight: clamped }, 'Change max height')
  }
}
function removeMinMax(key: MinMaxKey) {
  updateAllWithUndo({ [key]: null }, `Remove ${key}`)
}

// ---- Individual padding toggle
const individualPadding = ref(false)
watch(
  () => target.value?.id,
  () => {
    const n = target.value
    individualPadding.value = !!n && (n.paddingLeft !== n.paddingRight || n.paddingTop !== n.paddingBottom)
  },
  { immediate: true },
)

const SIZING_LABELS: Record<LayoutSizing, string> = { FIXED: 'Fixed', HUG: 'Hug', FILL: 'Fill' }
</script>

<template>
  <section class="op-prop">
    <div class="op-prop-head">
      Layout
      <button v-if="canAdd" class="op-icon-btn" title="Add auto layout (Shift+A)" @click="addAutoLayout">
        <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
      </button>
      <button v-else-if="hasLayout" class="op-icon-btn" title="Remove auto layout" @click="removeAutoLayout">
        <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
      </button>
    </div>

    <!-- Dimensions: W, H, Aspect-ratio lock, Min/Max -->
    <div class="op-dim-row">
      <NumField label="W" :value="widthValue" :min="0.01" @commit="commitWidth" />
      <NumField label="H" :value="heightValue" :min="0.01" @commit="commitHeight" />
      <button
        type="button"
        class="op-icon-btn"
        :class="{ 'is-on': aspectLocked }"
        title="Lock aspect ratio"
        aria-label="Lock aspect ratio"
        @click="toggleAspectLock"
      >
        <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
          <path v-if="aspectLocked" d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z" />
          <path v-else d="M5 7V5a3 3 0 0 1 5.6-1.5M4 7h8v6H4z" />
        </svg>
      </button>
    </div>

    <div v-if="target" class="op-minmax-add">
      <select
        class="op-cp-select"
        value=""
        aria-label="Add min/max constraint"
        @change="(e: Event) => { const v = (e.target as HTMLSelectElement).value as MinMaxKey; if (v) addMinMax(v); (e.target as HTMLSelectElement).value = '' }"
      >
        <option value="" disabled>Add min/max…</option>
        <option v-if="!hasMinW" value="minWidth">Add min width</option>
        <option v-if="!hasMaxW" value="maxWidth">Add max width</option>
        <option v-if="!hasMinH" value="minHeight">Add min height</option>
        <option v-if="!hasMaxH" value="maxHeight">Add max height</option>
      </select>
    </div>

    <div v-if="target && (hasMinW || hasMaxW || hasMinH || hasMaxH)" class="op-minmax-list">
      <div v-if="hasMinW" class="op-minmax-row">
        <NumField label="Min W" :min="0" :value="target.minWidth!" @commit="(v: number) => commitMinMax('minWidth', v)" />
        <button type="button" class="op-icon-btn" title="Remove min width" @click="removeMinMax('minWidth')">×</button>
      </div>
      <div v-if="hasMaxW" class="op-minmax-row">
        <NumField label="Max W" :min="0" :value="target.maxWidth!" @commit="(v: number) => commitMinMax('maxWidth', v)" />
        <button type="button" class="op-icon-btn" title="Remove max width" @click="removeMinMax('maxWidth')">×</button>
      </div>
      <div v-if="hasMinH" class="op-minmax-row">
        <NumField label="Min H" :min="0" :value="target.minHeight!" @commit="(v: number) => commitMinMax('minHeight', v)" />
        <button type="button" class="op-icon-btn" title="Remove min height" @click="removeMinMax('minHeight')">×</button>
      </div>
      <div v-if="hasMaxH" class="op-minmax-row">
        <NumField label="Max H" :min="0" :value="target.maxHeight!" @commit="(v: number) => commitMinMax('maxHeight', v)" />
        <button type="button" class="op-icon-btn" title="Remove max height" @click="removeMinMax('maxHeight')">×</button>
      </div>
    </div>

    <!-- Text Resizing (single & multi text layers) -->
    <div v-if="multi.textResize.value !== undefined" class="op-segmented" role="group" aria-label="Text resizing">
      <button :class="{ 'is-active': multi.textResize.value === 'AUTO_WIDTH' }" @click="multi.setTextResize('AUTO_WIDTH' as TextResizeMode)">Auto width</button>
      <button :class="{ 'is-active': multi.textResize.value === 'AUTO_HEIGHT' }" @click="multi.setTextResize('AUTO_HEIGHT' as TextResizeMode)">Auto height</button>
      <button :class="{ 'is-active': multi.textResize.value === 'FIXED' }" @click="multi.setTextResize('FIXED' as TextResizeMode)">Fixed</button>
    </div>

    <LayoutControlsRoot v-if="target" v-slot="lay">
      <template v-if="hasLayout">
        <div class="op-layout-row">
          <div class="op-segmented op-layout-dir" role="group" aria-label="Flow">
            <button :class="{ 'is-active': mode === 'NONE' }" title="Freeform" @click="setMode('NONE')">Freeform</button>
            <button :class="{ 'is-active': mode === 'VERTICAL' }" title="Vertical layout" @click="setMode('VERTICAL')">↓</button>
            <button :class="{ 'is-active': mode === 'HORIZONTAL' }" title="Horizontal layout" @click="setMode('HORIZONTAL')">→</button>
            <button :class="{ 'is-active': mode === 'GRID' }" title="Grid" @click="setMode('GRID')">⊞</button>
          </div>
          <button
            v-if="mode === 'HORIZONTAL' || mode === 'VERTICAL'"
            type="button"
            class="op-icon-btn"
            :class="{ 'is-on': target.layoutWrap === 'WRAP' }"
            title="Wrap"
            aria-label="Wrap"
            @click="toggleWrap"
          >
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h9a2.5 2.5 0 010 5h-6M7 7.5l-2 2 2 2M2.5 13h4" /></svg>
          </button>
        </div>

        <div class="op-grid2">
          <label class="op-field" title="Layout direction">
            <span class="op-field-label">Dir</span>
            <select
              :value="target.layoutDirection ?? 'AUTO'"
              aria-label="Layout direction"
              @change="(e: Event) => updateAllWithUndo({ layoutDirection: (e.target as HTMLSelectElement).value as LayoutDirection }, 'Change layout direction')"
            >
              <option value="AUTO">Auto</option>
              <option value="LTR">LTR</option>
              <option value="RTL">RTL</option>
            </select>
          </label>
        </div>
      </template>

      <div v-if="hasLayout || lay.widthSizingOptions.length > 1 || lay.heightSizingOptions.length > 1" class="op-grid2">
        <label class="op-field" title="Width resizing">
          <span class="op-field-label">W</span>
          <select :value="lay.widthSizing" @change="(e: Event) => lay.actions.setAxisSizing('width', (e.target as HTMLSelectElement).value as LayoutSizing)">
            <option v-for="o in lay.widthSizingOptions" :key="o.value" :value="o.value">{{ SIZING_LABELS[o.value] ?? o.label }}</option>
          </select>
        </label>
        <label class="op-field" title="Height resizing">
          <span class="op-field-label">H</span>
          <select :value="lay.heightSizing" @change="(e: Event) => lay.actions.setAxisSizing('height', (e.target as HTMLSelectElement).value as LayoutSizing)">
            <option v-for="o in lay.heightSizingOptions" :key="o.value" :value="o.value">{{ SIZING_LABELS[o.value] ?? o.label }}</option>
          </select>
        </label>
      </div>

      <div v-if="hasLayout && lay.isFlex" class="op-layout-main">
        <div class="op-align-grid" :class="mode === 'VERTICAL' ? 'is-vertical' : 'is-horizontal'" role="radiogroup" aria-label="Alignment">
          <button
            v-for="(cell, i) in lay.alignGrid"
            :key="i"
            role="radio"
            :aria-checked="target.primaryAxisAlign === cell.primary && target.counterAxisAlign === cell.counter"
            :class="{
              'is-active': (lay.gapAuto ? target.counterAxisAlign === cell.counter : target.primaryAxisAlign === cell.primary && target.counterAxisAlign === cell.counter),
            }"
            :title="`Align ${cell.primary.toLowerCase()} / ${cell.counter.toLowerCase()}`"
            @click="lay.actions.setAlignment(lay.gapAuto ? 'SPACE_BETWEEN' : cell.primary, cell.counter)"
          >
            <span />
          </button>
        </div>
        <div class="op-layout-fields">
          <div class="op-gap">
            <NumField
              v-if="!lay.gapAuto"
              :label="mode === 'VERTICAL' ? '↕' : '↔'"
              title="Gap between items"
              :min="0"
              :value="target.itemSpacing"
              @commit="(v: number) => updateAllWithUndo({ itemSpacing: v }, 'Change gap')"
            />
            <div v-else class="op-field is-static"><span class="op-field-label">{{ mode === 'VERTICAL' ? '↕' : '↔' }}</span>Auto</div>
            <select
              class="op-cp-select"
              :value="lay.gapAuto ? 'auto' : 'fixed'"
              aria-label="Gap mode"
              @change="(e: Event) => lay.actions.setGapAuto((e.target as HTMLSelectElement).value === 'auto')"
            >
              <option value="fixed">Fixed</option>
              <option value="auto">Auto</option>
            </select>
          </div>

          <NumField
            v-if="target.layoutWrap === 'WRAP'"
            label="⇵"
            title="Counter-axis gap"
            :min="0"
            :value="target.counterAxisSpacing ?? target.itemSpacing"
            @commit="(v: number) => updateAllWithUndo({ counterAxisSpacing: v }, 'Change counter-axis gap')"
          />

          <div class="op-gap">
            <template v-if="!individualPadding">
              <NumField
                label="⇿"
                title="Horizontal padding"
                :min="0"
                :value="target.paddingLeft === target.paddingRight ? target.paddingLeft : Symbol('mixed')"
                @commit="(v: number) => updateAllWithUndo({ paddingLeft: v, paddingRight: v }, 'Change horizontal padding')"
              />
              <NumField
                label="⇳"
                title="Vertical padding"
                :min="0"
                :value="target.paddingTop === target.paddingBottom ? target.paddingTop : Symbol('mixed')"
                @commit="(v: number) => updateAllWithUndo({ paddingTop: v, paddingBottom: v }, 'Change vertical padding')"
              />
            </template>
            <button
              type="button"
              class="op-icon-btn"
              :class="{ 'is-on': individualPadding }"
              title="Individual padding"
              aria-label="Individual padding"
              @click="individualPadding = !individualPadding"
            >
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
                <rect x="3" y="3" width="10" height="10" rx="1" stroke-dasharray="2 2" />
                <path d="M5 3h6M5 13h6" />
              </svg>
            </button>
          </div>
          <div v-if="individualPadding" class="op-grid2">
            <NumField label="T" title="Top padding" :min="0" :value="target.paddingTop" @commit="(v: number) => updateAllWithUndo({ paddingTop: v }, 'Change top padding')" />
            <NumField label="R" title="Right padding" :min="0" :value="target.paddingRight" @commit="(v: number) => updateAllWithUndo({ paddingRight: v }, 'Change right padding')" />
            <NumField label="B" title="Bottom padding" :min="0" :value="target.paddingBottom" @commit="(v: number) => updateAllWithUndo({ paddingBottom: v }, 'Change bottom padding')" />
            <NumField label="L" title="Left padding" :min="0" :value="target.paddingLeft" @commit="(v: number) => updateAllWithUndo({ paddingLeft: v }, 'Change left padding')" />
          </div>
        </div>
      </div>

      <div v-if="hasLayout && lay.isGrid" class="op-prop-note">Grid tracks: {{ target.gridTemplateColumns?.length ?? 0 }} columns × {{ target.gridTemplateRows?.length ?? 0 }} rows</div>
    </LayoutControlsRoot>

    <template v-else-if="isMulti">
      <div v-if="multi.layoutMode.value !== undefined" class="op-layout-row">
        <div class="op-segmented op-layout-dir">
          <button :class="{ 'is-active': multi.layoutMode.value === 'NONE' }" title="Freeform" @click="multi.setLayoutMode('NONE')">Freeform</button>
          <button :class="{ 'is-active': multi.layoutMode.value === 'VERTICAL' }" title="Vertical layout" @click="multi.setLayoutMode('VERTICAL')">↓</button>
          <button :class="{ 'is-active': multi.layoutMode.value === 'HORIZONTAL' }" title="Horizontal layout" @click="multi.setLayoutMode('HORIZONTAL')">→</button>
        </div>
      </div>
      <NumField
        v-if="multi.spacingAxis.value"
        :label="multi.spacingAxis.value === 'vertical' ? '↕' : '↔'"
        title="Gap between items"
        :min="0"
        :value="multi.spacing.value"
        @commit="(v: number) => { multi.setSpacing(v); multi.flushSpacing() }"
      />
      <label v-if="multi.clipsContent.value !== undefined" class="op-checkbox">
        <input
          type="checkbox"
          :checked="multi.clipsContent.value === true"
          :indeterminate="typeof multi.clipsContent.value === 'symbol'"
          @change="multi.toggleClipsContent()"
        />
        <span>Clip content</span>
      </label>
    </template>

    <label v-if="!isMulti && isContainer && target" class="op-checkbox">
      <input
        type="checkbox"
        :checked="target.clipsContent"
        @change="updateAllWithUndo({ clipsContent: !target.clipsContent }, 'Toggle clip content')"
      />
      <span>Clip content</span>
    </label>
  </section>
</template>
