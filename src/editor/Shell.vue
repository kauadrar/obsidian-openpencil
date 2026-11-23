<script setup lang="ts">
// The editor shell, laid out like OpenPencil's own window: a sidebar with pages and layers,
// the canvas with rulers, and a floating icon toolbar. Built from @open-pencil/vue's unstyled
// primitives; the look lives in styles.css under .op-shell.
import { defineComponent, h, ref, type Ref } from 'vue'
import { EDITOR_TOOLS, type Editor, type Tool } from '@open-pencil/core'
import { CanvasRoot, CanvasSurface } from '@open-pencil/vue/canvas'
import { ToolbarRoot } from '@open-pencil/vue/primitives/Toolbar'
import { PageListRoot } from '@open-pencil/vue/primitives/PageList'
import { LayerTreeRoot, LayerTreeItem } from '@open-pencil/vue/primitives/LayerTree'
import { useEditorKeyboard } from '@open-pencil/vue/editor/keyboard'
import DesignPanel from './DesignPanel.vue'
import {
  CHEVRON_DOWN_ICON,
  CHEVRON_ICON,
  EYE_ICON,
  EYE_OFF_ICON,
  LAYER_ICONS,
  LOCK_ICON,
  PAGE_ICON,
  TOOL_ICONS,
} from './icons'

const props = defineProps<{
  editor: Editor
  active: Ref<boolean>
  readOnly: boolean
  fileName: string
}>()
const emit = defineEmits<{ save: [] }>()

useEditorKeyboard({
  active: () => props.active.value,
  shortcuts: [{ id: 'save', keys: 'Mod+S', run: () => emit('save') }],
})

/** An inline 16×16 stroke icon. */
const Icon = defineComponent({
  props: { svg: { type: String, required: true }, size: { type: Number, default: 16 } },
  setup(p) {
    return () =>
      h('svg', {
        class: 'op-icon',
        width: p.size,
        height: p.size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.25,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        innerHTML: p.svg,
      })
  },
})

// A design file's toolbar, as in OpenPencil: FigJam's board tools are left out, and so is Comment (out of scope).
const BOARD_ONLY = new Set<Tool>(['STICKY', 'SHAPE_WITH_TEXT', 'CONNECTOR', 'COMMENT'])
const designTools = EDITOR_TOOLS.filter((t) => !BOARD_ONLY.has(t.key))

const TOOL_NAMES: Partial<Record<Tool, [string, string]>> = {
  SELECT: ['Move', 'V'],
  SCALE: ['Scale', 'K'],
  FRAME: ['Frame', 'F'],
  SECTION: ['Section', 'Shift+S'],
  RECTANGLE: ['Rectangle', 'R'],
  LINE: ['Line', 'L'],
  ELLIPSE: ['Ellipse', 'O'],
  POLYGON: ['Polygon', ''],
  STAR: ['Star', ''],
  PEN: ['Pen', 'P'],
  PENCIL: ['Pencil', 'Shift+P'],
}
const toolName = (t: Tool) => TOOL_NAMES[t]?.[0] ?? t
const toolKey = (t: Tool) => TOOL_NAMES[t]?.[1] ?? ''

const sidebarOpen = ref(true)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const error = ref('')

function onReady() {
  status.value = 'ready'
  props.editor.zoomToFit()
}
function onFailed(e: unknown) {
  status.value = 'failed'
  error.value = e instanceof Error ? e.message : String(e ?? 'CanvasKit could not start.')
  console.error('[openpencil] canvas failed', e)
}

const editingLayer = ref<string | null>(null)
function finishRename(rename: (name: string) => void, e: Event) {
  const value = (e.target as HTMLInputElement).value.trim()
  if (value) rename(value)
  editingLayer.value = null
}
</script>

<template>
  <div class="op-shell" :class="{ 'is-collapsed': !sidebarOpen }">
    <aside v-if="sidebarOpen" class="op-sidebar">
      <header class="op-doc">
        <span class="op-doc-name" :title="fileName">{{ fileName }}</span>
        <button class="op-icon-btn" title="Hide sidebar" @click="sidebarOpen = false">
          <svg class="op-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11" />
          </svg>
        </button>
      </header>

      <section class="op-section op-pages">
        <PageListRoot v-slot="{ pages, currentPageId, actions }">
          <div class="op-section-head">
            <span>Pages</span>
            <button class="op-icon-btn" title="Add page" @click="actions.add()">
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
          </div>
          <div class="op-list">
            <button
              v-for="page in pages"
              :key="page.id"
              class="op-row"
              :class="{ 'is-active': page.id === currentPageId }"
              @click="actions.switch(page.id)"
            >
              <Icon :svg="PAGE_ICON" :size="14" />
              <span class="op-row-label">{{ page.name }}</span>
            </button>
          </div>
        </PageListRoot>
      </section>

      <section class="op-section op-layers">
        <div class="op-section-head"><span>Layers</span></div>
        <LayerTreeRoot v-slot="{ visibleRows, expanded, actions: tree }" :indent-per-level="14">
          <div
            class="op-list op-layer-list"
            tabindex="0"
            @focus="tree.setFocused(true)"
            @blur="tree.setFocused(false)"
          >
            <LayerTreeItem
              v-for="row in visibleRows"
              :key="row.node.id"
              :node="row.node"
              :level="row.level"
              :has-children="row.hasChildren"
              v-slot="{ node, isSelected, isDragging, instruction, instructionTargetId, padLeft, actions }"
            >
              <div
                class="op-row op-layer"
                :class="{
                  'is-selected': isSelected,
                  'is-hidden': !node.visible,
                  'is-dragging': isDragging,
                  [`drop-${instruction?.type}`]: instruction && instructionTargetId === node.id,
                }"
                :style="{ paddingLeft: `calc(${padLeft} + 4px)` }"
                @click="actions.select($event.shiftKey || $event.metaKey)"
                @dblclick="editingLayer = node.id"
              >
                <button
                  class="op-twisty"
                  :class="{ 'is-open': expanded.includes(node.id) }"
                  :style="{ visibility: row.hasChildren ? 'visible' : 'hidden' }"
                  @click.stop="actions.toggleExpand()"
                >
                  <Icon :svg="CHEVRON_ICON" :size="12" />
                </button>
                <Icon class="op-layer-icon" :svg="LAYER_ICONS[node.type] ?? LAYER_ICONS.RECTANGLE" :size="14" />
                <input
                  v-if="editingLayer === node.id"
                  class="op-rename"
                  :value="node.name"
                  autofocus
                  @click.stop
                  @keydown.enter="finishRename(actions.rename, $event)"
                  @keydown.esc="editingLayer = null"
                  @blur="finishRename(actions.rename, $event)"
                />
                <span v-else class="op-row-label">{{ node.name }}</span>
                <span class="op-layer-tools">
                  <button
                    class="op-icon-btn"
                    :class="{ 'is-on': node.locked }"
                    :title="node.locked ? 'Unlock' : 'Lock'"
                    @click.stop="actions.toggleLock()"
                  >
                    <Icon :svg="LOCK_ICON" :size="13" />
                  </button>
                  <button
                    class="op-icon-btn"
                    :class="{ 'is-on': !node.visible }"
                    :title="node.visible ? 'Hide' : 'Show'"
                    @click.stop="actions.toggleVisibility()"
                  >
                    <Icon :svg="node.visible ? EYE_ICON : EYE_OFF_ICON" :size="13" />
                  </button>
                </span>
              </div>
            </LayerTreeItem>
            <div v-if="visibleRows.length === 0" class="op-empty">No layers on this page</div>
          </div>
        </LayerTreeRoot>
      </section>
    </aside>

    <main class="op-canvas">
      <CanvasRoot :show-rulers="true" @ready="onReady" @failed="onFailed">
        <CanvasSurface class="op-surface" />
      </CanvasRoot>

      <button v-if="!sidebarOpen" class="op-icon-btn op-sidebar-toggle" title="Show sidebar" @click="sidebarOpen = true">
        <svg class="op-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
          <rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11" />
        </svg>
      </button>

      <ToolbarRoot
        :tools="designTools"
        v-slot="{ tools, activeTool, flyoutSelections, expandedFlyout, actions }"
      >
        <div class="op-toolbar" role="toolbar">
          <div v-for="tool in tools" :key="tool.key" class="op-tool-group">
            <button
              class="op-tool"
              :class="{ 'is-active': activeTool === tool.key || tool.flyout?.includes(activeTool) }"
              :title="tool.flyout ? toolName(flyoutSelections.get(tool.key) ?? tool.key) : `${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`"
              @click="actions.setTool(flyoutSelections.get(tool.key) ?? tool.key)"
            >
              <Icon :svg="TOOL_ICONS[flyoutSelections.get(tool.key) ?? tool.key] ?? TOOL_ICONS.SELECT!" :size="18" />
            </button>
            <button
              v-if="tool.flyout"
              class="op-tool-caret"
              :title="`More ${tool.label.toLowerCase()} tools`"
              @click="actions.toggleFlyout(tool.key)"
            >
              <Icon :svg="CHEVRON_DOWN_ICON" :size="10" />
            </button>
            <div v-if="tool.flyout && expandedFlyout === tool.key" class="op-flyout" role="menu">
              <button
                v-for="sub in tool.flyout"
                :key="sub"
                class="op-flyout-item"
                :class="{ 'is-active': activeTool === sub }"
                role="menuitem"
                @click="actions.setTool(sub)"
              >
                <Icon :svg="TOOL_ICONS[sub] ?? TOOL_ICONS.SELECT!" :size="14" />
                <span>{{ toolName(sub) }}</span>
                <kbd>{{ toolKey(sub) }}</kbd>
              </button>
            </div>
          </div>
        </div>
      </ToolbarRoot>

      <div v-if="readOnly" class="op-banner">
        OpenPencil can't write this file format. Run “Save as .fig” to keep your edits.
      </div>
      <div v-if="status === 'loading'" class="op-overlay">Starting OpenPencil…</div>
      <div v-else-if="status === 'failed'" class="op-overlay is-error">
        The canvas could not start: {{ error }}
      </div>
    </main>

    <DesignPanel />
  </div>
</template>
