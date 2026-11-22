<script setup lang="ts">
// The Design panel's Auto layout section, after OpenPencil's: add or remove auto layout, pick the
// direction and wrap, align children on a 3×3 grid, and set gap, padding and resizing.
// Everything goes through @open-pencil/vue's layout controls, so it is undoable.
import { computed } from 'vue'
import type { LayoutMode, LayoutSizing } from '@open-pencil/scene-graph'
import { useEditor } from '@open-pencil/vue'
import { LayoutControlsRoot } from '@open-pencil/vue/primitives/LayoutControls'
import { useNodeProps } from '@open-pencil/vue/controls/node-props'
import { NumField } from './fields'

const editor = useEditor()
const { node, nodes, isMulti, updateAllWithUndo } = useNodeProps()

/** Layers that can hold an auto layout themselves; anything else gets wrapped in a new frame. */
const CONTAINERS = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'])
const target = computed(() => (!isMulti.value ? node.value : null))
const mode = computed<LayoutMode>(() => target.value?.layoutMode ?? 'NONE')
const hasLayout = computed(() => mode.value !== 'NONE')
const canAdd = computed(() => nodes.value.length > 0 && !hasLayout.value)

function addAutoLayout() {
  const n = target.value
  if (n && CONTAINERS.has(n.type)) editor.setLayoutMode(n.id, 'VERTICAL')
  else editor.wrapInAutoLayout() // a group, shape or multi-selection: wrap it, as Shift+A does
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

const SIZING_LABELS: Record<LayoutSizing, string> = { FIXED: 'Fixed', HUG: 'Hug', FILL: 'Fill' }

</script>

<template>
  <section class="op-prop">
    <div class="op-prop-head">
      Auto layout
      <button v-if="canAdd" class="op-icon-btn" title="Add auto layout (Shift+A)" @click="addAutoLayout">
        <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
      </button>
      <button v-else-if="hasLayout" class="op-icon-btn" title="Remove auto layout" @click="removeAutoLayout">
        <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
      </button>
    </div>

    <LayoutControlsRoot v-if="hasLayout && target" v-slot="lay">
      <div class="op-layout-row">
        <div class="op-segmented op-layout-dir">
          <button :class="{ 'is-active': mode === 'VERTICAL' }" title="Vertical layout" @click="setMode('VERTICAL')">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v11M5 10.5l3 3 3-3" /></svg>
          </button>
          <button :class="{ 'is-active': mode === 'HORIZONTAL' && target.layoutWrap !== 'WRAP' }" title="Horizontal layout" @click="setMode('HORIZONTAL'); target.layoutWrap === 'WRAP' && toggleWrap()">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8h11M10.5 5l3 3-3 3" /></svg>
          </button>
          <button :class="{ 'is-active': mode === 'HORIZONTAL' && target.layoutWrap === 'WRAP' }" title="Wrap" @click="setMode('HORIZONTAL'); target.layoutWrap !== 'WRAP' && toggleWrap()">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h9a2.5 2.5 0 010 5h-6M7 7.5l-2 2 2 2M2.5 13h4" /></svg>
          </button>
          <button :class="{ 'is-active': mode === 'GRID' }" title="Grid" @click="setMode('GRID')">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".5" /><rect x="9" y="2.5" width="4.5" height="4.5" rx=".5" /><rect x="2.5" y="9" width="4.5" height="4.5" rx=".5" /><rect x="9" y="9" width="4.5" height="4.5" rx=".5" /></svg>
          </button>
        </div>
      </div>

      <div class="op-grid2">
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

      <div v-if="lay.isFlex" class="op-layout-main">
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
            <button class="op-icon-btn" :class="{ 'is-on': lay.gapAuto }" :title="lay.gapAuto ? 'Fixed gap' : 'Auto gap (space between)'" @click="lay.actions.setGapAuto(!lay.gapAuto)">
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M2.5 3v10M13.5 3v10M5 8h6M6.5 6.5L5 8l1.5 1.5M9.5 6.5L11 8 9.5 9.5" /></svg>
            </button>
          </div>
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
        </div>
      </div>

      <div v-if="lay.isGrid" class="op-prop-note">Grid tracks: {{ target.gridTemplateColumns?.length ?? 0 }} columns × {{ target.gridTemplateRows?.length ?? 0 }} rows</div>
    </LayoutControlsRoot>

    <div v-else-if="isMulti && !canAdd" class="op-prop-note">Select one layer to edit its auto layout.</div>
  </section>
</template>
