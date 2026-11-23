<script setup lang="ts">
// The editor shell, laid out like OpenPencil's own window: a sidebar with pages and layers,
// the canvas with rulers, and a floating icon toolbar. Built from @open-pencil/vue's unstyled
// primitives; the look lives in styles.css under .op-shell.
import { computed, defineComponent, h, inject, onMounted, onUnmounted, provide, ref, watchEffect, type Ref } from 'vue'
import { EDITOR_TOOLS, type Editor, type Tool } from '@open-pencil/core'
import { CanvasRoot, CanvasSurface, useCanvasContext, useCanvasInput } from '@open-pencil/vue/canvas'
import { useTextEdit } from '@open-pencil/vue/canvas/text-edit'
import { toolCursor } from '@open-pencil/vue/editor/tool-cursor'
import { ToolbarRoot } from '@open-pencil/vue/primitives/Toolbar'
import { PageListRoot } from '@open-pencil/vue/primitives/PageList'
import { LayerTreeRoot, LayerTreeItem } from '@open-pencil/vue/primitives/LayerTree'
import { formatShortcut, useEditorCommands, type EditorCommandId } from '@open-pencil/vue/editor/commands'
import { useTypography } from '@open-pencil/vue/controls/typography'
import { useInlineRename } from '@open-pencil/vue/editor/inline-rename'
import { useEditorKeyboard } from '@open-pencil/vue/editor/keyboard'
import { useMenuModel, type MenuEntry } from '@open-pencil/vue/editor/menu-model'
import DesignPanel from './DesignPanel.vue'
import ZoomMenu from './ZoomMenu.vue'
import { copySelection, copySelectionAsPNG, copySelectionAsSVG, cutSelection, exportSelection, pasteProperties, pasteSelection } from './clipboard'
import { DESIGN_NAME, NOTIFY, RESOLVE_DROP_FILES, SHOW_CONTEXT_MENU, WRITE_EXPORT, toContextEntries, type ContextMenuEntry } from './context'
import { placeDroppedFiles } from './drop'
import { deletePageWithUndo, movePageWithUndo, renamePageWithUndo } from './pages'
import { createAppShortcuts } from './shortcuts'
import {
  CHEVRON_DOWN_ICON,
  CHEVRON_ICON,
  EYE_ICON,
  EYE_OFF_ICON,
  LAYER_ICONS,
  MASK_ICON,
  LOCK_ICON,
  PAGE_ICON,
  TOOL_ICONS,
} from './icons'

const props = defineProps<{
  editor: Editor
  active: Ref<boolean>
  zoomSpeed: Ref<number>
  readOnly: boolean
  previewOnly?: boolean
  fileName: string
}>()
const emit = defineEmits<{ save: [] }>()

/** Bridges CanvasRoot's input so zoomSpeed can be updated live from Obsidian settings. */
const CanvasInputBridge = defineComponent({
  setup() {
    const { canvasRef, hitTestSectionTitle, hitTestComponentLabel, hitTestFrameTitle } = useCanvasContext()
    const { cursorOverride } = useCanvasInput(
      canvasRef,
      props.editor,
      hitTestSectionTitle,
      hitTestComponentLabel,
      hitTestFrameTitle,
      undefined,
      undefined,
      undefined,
      () => props.zoomSpeed.value,
    )
    useTextEdit(canvasRef, props.editor)
    watchEffect(() => {
      const el = canvasRef.value
      if (!el) return
      el.style.cursor = toolCursor(props.editor.state.activeTool, cursorOverride.value) ?? ''
    })
    return () => null
  },
})

useEditorKeyboard({
  active: () => !props.previewOnly && props.active.value,
  shortcuts: createAppShortcuts(props.editor, () => emit('save')),
})
const showRulers = computed(
  () => !props.previewOnly && (props.editor.state as typeof props.editor.state & { showRulers?: boolean }).showRulers !== false,
)

const showContextMenu = inject(SHOW_CONTEXT_MENU, null)
const notify = inject(NOTIFY, null)
const writeExport = inject(WRITE_EXPORT, null)
const resolveDropFiles = inject(RESOLVE_DROP_FILES, null)
const designName = props.fileName.replace(/\.[^.]+$/, '')
provide(DESIGN_NAME, designName)
const { canvasMenu } = useMenuModel()
const { commands: editorCommands, runCommand: runSdkCommand } = useEditorCommands()
const typography = useTypography()

function buildContextMenu(event: MouseEvent, cursorPos?: { x: number; y: number }) {
  if (!showContextMenu) return
  const hasSelection = props.editor.state.selectedIds.size > 0
  const clipboardGroup: ContextMenuEntry[] = [
    {
      label: 'Copy',
      shortcut: formatShortcut('Mod+C'),
      disabled: !hasSelection,
      action: () => void copySelection(props.editor),
    },
    {
      label: 'Cut',
      shortcut: formatShortcut('Mod+X'),
      disabled: !hasSelection,
      action: () => void cutSelection(props.editor),
    },
    {
      label: 'Paste',
      shortcut: formatShortcut('Mod+V'),
      action: () => void pasteSelection(props.editor, cursorPos),
    },
    {
      label: 'Copy as',
      sub: [
        {
          label: 'Copy as SVG',
          disabled: !hasSelection,
          action: () => void copySelectionAsSVG(props.editor, notify ?? undefined),
        },
        {
          label: 'Copy as PNG',
          disabled: !hasSelection,
          action: () => void copySelectionAsPNG(props.editor, notify ?? undefined),
        },
      ],
    },
    { separator: true },
  ]
  const entries = canvasMenu.value.map((entry) => {
    if (entry.separator) return entry
    const node = props.editor.getSelectedNode()
    if (entry.id === 'selection.toggleVisibility') return { ...entry, label: (node?.visible ?? true) ? 'Hide' : 'Show' }
    if (entry.id === 'selection.toggleLock') return { ...entry, label: (node?.locked ?? false) ? 'Unlock' : 'Lock' }
    return entry
  })
  showContextMenu([...clipboardGroup, ...toContextEntries(entries)], {
    x: event.clientX,
    y: event.clientY,
  })
}

function onCanvasContextMenu(event: MouseEvent) {
  const el = event.currentTarget as HTMLElement | null
  const rect = el?.getBoundingClientRect()
  if (!rect) return
  const pos = props.editor.screenToCanvas(event.clientX - rect.left, event.clientY - rect.top)
  const hit = props.editor.hitTestAtPoint(pos.x, pos.y, event.metaKey || event.ctrlKey)
  if (hit) {
    if (!props.editor.state.selectedIds.has(hit.id)) props.editor.select([hit.id])
  } else {
    props.editor.clearSelection()
  }
  buildContextMenu(event, pos)
}

// Shift selects the range from the anchor row (a single select when there is none); Cmd/Ctrl adds or
// removes one row; a plain click on a row that is already selected starts its inline rename.
function onLayerClick(
  event: MouseEvent,
  node: { id: string; name: string },
  wasSelected: boolean,
  select: (mode: boolean | { additive: boolean; range: boolean }) => void,
) {
  if (event.shiftKey) return select({ additive: event.metaKey, range: true })
  if (!event.metaKey && wasSelected) return layerRename.start(node.id, node.name)
  select(event.metaKey)
}

function onLayerContextMenu(nodeId: string, event: MouseEvent) {
  if (!props.editor.state.selectedIds.has(nodeId)) props.editor.select([nodeId])
  buildContextMenu(event)
}

const pageRename = useInlineRename((pageId, name) => renamePageWithUndo(props.editor, pageId, name))

function onPageClick(pageId: string, pageName: string, currentPageId: string, divider: boolean, switchPage: (id: string) => void) {
  if (pageRename.editingId.value === pageId || divider) return
  if (pageId === currentPageId) pageRename.start(pageId, pageName)
  else switchPage(pageId)
}

function onPageContextMenu(pageId: string, pageName: string, pageCount: number, event: MouseEvent) {
  if (!showContextMenu) return
  showContextMenu(
    [
      { label: 'Rename', action: () => pageRename.start(pageId, pageName) },
      { label: 'Delete', disabled: pageCount <= 1, action: () => deletePageWithUndo(props.editor, pageId) },
    ],
    { x: event.clientX, y: event.clientY },
  )
}

const dragPageId = ref<string | null>(null)
const pageDrop = ref<{ id: string; position: 'above' | 'below' } | null>(null)

function onPageDragStart(pageId: string, event: DragEvent) {
  dragPageId.value = pageId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', pageId)
  }
}

function onPageDragOver(pageId: string, event: DragEvent) {
  if (!dragPageId.value || dragPageId.value === pageId) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
  pageDrop.value = { id: pageId, position }
}

function onPageDrop(targetId: string) {
  const fromId = dragPageId.value
  const drop = pageDrop.value
  clearPageDrag()
  if (!fromId || !drop || fromId === targetId) return
  const pages = props.editor.graph.getPages()
  const fromIndex = pages.findIndex((p) => p.id === fromId)
  const targetIndex = pages.findIndex((p) => p.id === targetId)
  if (fromIndex === -1 || targetIndex === -1) return
  const rawIndex = drop.position === 'above' ? targetIndex : targetIndex + 1
  const nextIndex = rawIndex > fromIndex ? rawIndex - 1 : rawIndex
  movePageWithUndo(props.editor, fromId, nextIndex)
}

function clearPageDrag() {
  dragPageId.value = null
  pageDrop.value = null
}

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
const zoomMenuOpen = ref(false)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const error = ref('')
const pageSheetOpen = ref(false)

function selectPreviewPage(switchPage: (id: string) => void, pageId: string) {
  switchPage(pageId)
  pageSheetOpen.value = false
  requestAnimationFrame(() => props.editor.zoomToFit())
}

function onReady() {
  status.value = 'ready'
  requestAnimationFrame(() => props.editor.zoomToFit())
}

const onPreviewResize = () => {
  if (props.previewOnly && status.value === 'ready') {
    requestAnimationFrame(() => props.editor.zoomToFit())
  }
}

onMounted(() => {
  if (props.previewOnly) {
    window.addEventListener('resize', onPreviewResize)
    window.addEventListener('orientationchange', onPreviewResize)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onPreviewResize)
  window.removeEventListener('orientationchange', onPreviewResize)
})
function onFailed(e: unknown) {
  status.value = 'failed'
  error.value = e instanceof Error ? e.message : String(e ?? 'CanvasKit could not start.')
  console.error('[openpencil] canvas failed', e)
}

let previewTouchLast: { x: number; y: number } | null = null
let previewPinchDist = 0
let previewLastTapAt = 0
let previewLastTapPos: { x: number; y: number } | null = null

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function onPreviewTouchStart(e: TouchEvent) {
  if (!props.previewOnly) return
  if (e.touches.length === 1) {
    const t = e.touches[0]
    previewTouchLast = { x: t.clientX, y: t.clientY }
    previewPinchDist = 0
    const now = Date.now()
    if (
      previewLastTapPos &&
      now - previewLastTapAt < 300 &&
      Math.hypot(t.clientX - previewLastTapPos.x, t.clientY - previewLastTapPos.y) < 24
    ) {
      props.editor.zoomToFit()
      previewLastTapAt = 0
      previewLastTapPos = null
    } else {
      previewLastTapAt = now
      previewLastTapPos = { x: t.clientX, y: t.clientY }
    }
  } else if (e.touches.length === 2) {
    previewTouchLast = null
    previewPinchDist = touchDistance(e.touches[0], e.touches[1])
  }
}

function onPreviewTouchMove(e: TouchEvent) {
  if (!props.previewOnly) return
  if (e.touches.length === 1 && previewTouchLast) {
    const t = e.touches[0]
    props.editor.state.panX += t.clientX - previewTouchLast.x
    props.editor.state.panY += t.clientY - previewTouchLast.y
    previewTouchLast = { x: t.clientX, y: t.clientY }
    props.editor.requestRender()
  } else if (e.touches.length === 2) {
    const dist = touchDistance(e.touches[0], e.touches[1])
    if (previewPinchDist > 0 && dist > 0) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      const oldZoom = props.editor.state.zoom
      const newZoom = Math.min(64, Math.max(0.02, oldZoom * (dist / previewPinchDist)))
      const scale = newZoom / oldZoom
      props.editor.state.panX = cx - (cx - props.editor.state.panX) * scale
      props.editor.state.panY = cy - (cy - props.editor.state.panY) * scale
      props.editor.state.zoom = newZoom
      props.editor.requestRender()
    }
    previewPinchDist = dist
  }
}

function onPreviewTouchEnd(e: TouchEvent) {
  if (!props.previewOnly) return
  if (e.touches.length === 1) {
    previewTouchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    previewPinchDist = 0
  } else if (e.touches.length === 0) {
    previewTouchLast = null
    previewPinchDist = 0
  }
}

const layerRename = useInlineRename((nodeId, name) => {
  props.editor.updateNodeWithUndo(nodeId, { name }, 'Rename layer')
})

function canRunCommand(id: string): boolean {
  if (id in editorCommands) return editorCommands[id as EditorCommandId].enabled.value
  const hasSelection = props.editor.state.selectedIds.size > 0
  switch (id) {
    case 'app.renameSelection':
      return props.editor.state.selectedIds.size === 1
    case 'app.copyProperties':
    case 'app.pasteProperties':
    case 'app.copyAsSVG':
    case 'app.copyAsPNG':
    case 'app.exportSelection':
      return hasSelection
    case 'app.bold':
    case 'app.italic':
    case 'app.underline':
      return typography.nodes.value.length > 0
    case 'app.toggleRulers':
    case 'app.togglePixelGrid':
    case 'app.toggleSnapPixelGrid':
      return true
    default:
      return false
  }
}

function runCommand(id: string): void {
  if (id in editorCommands) {
    runSdkCommand(id as EditorCommandId)
    return
  }
  switch (id) {
    case 'app.renameSelection': {
      const node = props.editor.getSelectedNode()
      if (node) layerRename.start(node.id, node.name)
      break
    }
    case 'app.copyProperties':
      void copySelection(props.editor, true)
      break
    case 'app.pasteProperties':
      void pasteProperties(props.editor)
      break
    case 'app.bold':
      typography.toggleBold()
      break
    case 'app.italic':
      typography.toggleItalic()
      break
    case 'app.underline':
      typography.toggleDecoration('UNDERLINE')
      break
    case 'app.toggleRulers': {
      const state = props.editor.state as typeof props.editor.state & { showRulers?: boolean }
      state.showRulers = state.showRulers === false
      props.editor.requestRepaint()
      break
    }
    case 'app.togglePixelGrid':
      props.editor.state.showPixelGrid = props.editor.state.showPixelGrid === false
      props.editor.requestRepaint()
      break
    case 'app.toggleSnapPixelGrid':
      props.editor.state.snappingPreferences.pixelGrid = !props.editor.state.snappingPreferences.pixelGrid
      break
    case 'app.copyAsSVG':
      void copySelectionAsSVG(props.editor, notify ?? undefined)
      break
    case 'app.copyAsPNG':
      void copySelectionAsPNG(props.editor, notify ?? undefined)
      break
    case 'app.exportSelection':
      void exportSelection(props.editor, designName, writeExport, notify)
      break
  }
}

async function onCanvasDrop(event: DragEvent) {
  const el = event.currentTarget as HTMLElement | null
  const rect = el?.getBoundingClientRect()
  if (!rect) return
  const pos = props.editor.screenToCanvas(event.clientX - rect.left, event.clientY - rect.top)
  let files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length === 0 && resolveDropFiles && event.dataTransfer) {
    files = (await resolveDropFiles(event.dataTransfer)) ?? []
  }
  if (files.length === 0) return
  await placeDroppedFiles(props.editor, files, pos.x, pos.y, notify)
}

function placeFiles(files: File[], cx?: number, cy?: number): Promise<boolean> {
  if (cx !== undefined && cy !== undefined) return placeDroppedFiles(props.editor, files, cx, cy, notify)
  const vp = props.editor.getViewportSize()
  const center = props.editor.screenToCanvas(vp.width / 2, vp.height / 2)
  return placeDroppedFiles(props.editor, files, center.x, center.y, notify)
}

defineExpose({ canRunCommand, runCommand, placeFiles })
</script>

<template>
  <div class="op-shell" :class="{ 'is-collapsed': !sidebarOpen, 'is-preview': previewOnly }">
    <aside v-if="!previewOnly && sidebarOpen" class="op-sidebar">
      <header class="op-doc">
        <span class="op-doc-name" :title="fileName">{{ fileName }}</span>
        <button class="op-icon-btn" title="Hide sidebar" @click="sidebarOpen = false">
          <svg class="op-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11" />
          </svg>
        </button>
      </header>

      <section class="op-section op-pages">
        <PageListRoot v-slot="{ pages, currentPageId, isDivider, actions }">
          <div class="op-section-head">
            <span>Pages</span>
            <button class="op-icon-btn" title="Add page" @click="actions.add()">
              <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
          </div>
          <div class="op-list">
            <div
              v-for="page in pages"
              :key="page.id"
              class="op-row op-page"
              :class="{
                'is-active': page.id === currentPageId && !isDivider(page),
                'is-divider': isDivider(page) && pageRename.editingId.value !== page.id,
                'is-dragging': dragPageId === page.id,
                [`drop-reorder-${pageDrop?.position}`]: pageDrop?.id === page.id,
              }"
              draggable="true"
              @click="onPageClick(page.id, page.name, currentPageId, isDivider(page), actions.switch)"
              @dblclick="pageRename.start(page.id, page.name)"
              @contextmenu.prevent.stop="onPageContextMenu(page.id, page.name, pages.length, $event)"
              @dragstart="onPageDragStart(page.id, $event)"
              @dragover.prevent="onPageDragOver(page.id, $event)"
              @drop.prevent="onPageDrop(page.id)"
              @dragend="clearPageDrag"
            >
              <template v-if="pageRename.editingId.value === page.id">
                <Icon :svg="PAGE_ICON" :size="14" />
                <input
                  :ref="(el) => el && pageRename.focusInput(el as HTMLInputElement)"
                  class="op-rename"
                  :value="page.name"
                  @click.stop
                  @keydown.stop="pageRename.onKeydown"
                  @blur="pageRename.commit(page.id, $event)"
                />
              </template>
              <span v-else-if="isDivider(page)" class="op-page-divider" />
              <template v-else>
                <Icon :svg="PAGE_ICON" :size="14" />
                <span class="op-row-label">{{ page.name }}</span>
              </template>
            </div>
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
                @click="onLayerClick($event, node, isSelected, (mode) => tree.select(node.id, mode))"
                @contextmenu.prevent.stop="onLayerContextMenu(row.node.id, $event)"
              >
                <button
                  class="op-twisty"
                  :class="{ 'is-open': expanded.includes(node.id) }"
                  :style="{ visibility: row.hasChildren ? 'visible' : 'hidden' }"
                  @click.stop="actions.toggleExpand()"
                >
                  <Icon :svg="CHEVRON_ICON" :size="12" />
                </button>
                <Icon class="op-layer-icon" :svg="node.mask ? MASK_ICON : (LAYER_ICONS[node.type] ?? LAYER_ICONS.RECTANGLE)" :size="14" />
                <input
                  v-if="layerRename.editingId.value === node.id"
                  :ref="(el) => el && layerRename.focusInput(el as HTMLInputElement)"
                  class="op-rename"
                  :value="node.name"
                  @click.stop
                  @keydown.stop="layerRename.onKeydown"
                  @blur="layerRename.commit(node.id, $event)"
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
      <CanvasRoot :key="showRulers ? 'rulers' : 'no-rulers'" :show-rulers="showRulers" :input="false" @ready="onReady" @failed="onFailed">
        <CanvasSurface
          class="op-surface"
          @contextmenu.prevent="onCanvasContextMenu"
          @dragover.prevent="($event.dataTransfer && ($event.dataTransfer.dropEffect = 'copy'))"
          @drop.prevent="onCanvasDrop"
          @touchstart.passive="onPreviewTouchStart"
          @touchmove.prevent="onPreviewTouchMove"
          @touchend="onPreviewTouchEnd"
        />
        <CanvasInputBridge v-if="!previewOnly" />
      </CanvasRoot>

      <button v-if="!previewOnly && !sidebarOpen" class="op-icon-btn op-sidebar-toggle" title="Show sidebar" @click="sidebarOpen = true">
        <svg class="op-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25">
          <rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11" />
        </svg>
      </button>

      <ToolbarRoot
        v-if="!previewOnly"
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

      <!-- Bottom-left: the top-right of a view is where other Obsidian plugins draw status overlays. -->
      <button class="op-zoom" title="Zoom" @click="zoomMenuOpen = !zoomMenuOpen">{{ Math.round(editor.state.zoom * 100) }}%</button>
      <ZoomMenu v-if="zoomMenuOpen" :editor="editor" @close="zoomMenuOpen = false" />

      <PageListRoot v-if="previewOnly" v-slot="{ pages, currentPageId, isDivider, actions }">
        <template v-if="pages.filter((p) => !isDivider(p)).length > 1">
          <button
            class="op-preview-page-btn"
            :aria-expanded="pageSheetOpen"
            @click="pageSheetOpen = !pageSheetOpen"
          >
            <span class="op-preview-page-label">
              {{ pages.find((p) => p.id === currentPageId)?.name ?? 'Page' }}
            </span>
            <Icon :svg="CHEVRON_DOWN_ICON" :size="12" />
          </button>
          <div v-if="pageSheetOpen" class="op-preview-page-backdrop" @click="pageSheetOpen = false">
            <div class="op-preview-page-sheet" role="dialog" aria-label="Pages" @click.stop>
              <div class="op-preview-page-sheet-head">Pages</div>
              <button
                v-for="page in pages.filter((p) => !isDivider(p))"
                :key="page.id"
                class="op-preview-page-item"
                :class="{ 'is-active': page.id === currentPageId }"
                @click="selectPreviewPage(actions.switch, page.id)"
              >
                <Icon :svg="PAGE_ICON" :size="14" />
                <span>{{ page.name }}</span>
              </button>
            </div>
          </div>
        </template>
      </PageListRoot>

      <div v-if="readOnly && !previewOnly" class="op-banner">
        OpenPencil can't write this file format. Run “Save as .fig” to keep your edits.
      </div>
      <div v-if="status === 'loading'" class="op-overlay">Starting OpenPencil…</div>
      <div v-else-if="status === 'failed'" class="op-overlay is-error">
        The canvas could not start: {{ error }}
      </div>
    </main>

    <DesignPanel v-if="!previewOnly" />
  </div>
</template>
