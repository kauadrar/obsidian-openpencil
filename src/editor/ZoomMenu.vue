<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import type { Editor } from '@open-pencil/core'
import type { DesignIssueMarker, DesignIssueSeverity } from '@open-pencil/core/canvas'
import { createLinter } from '@open-pencil/core/lint'
import { formatShortcut } from '@open-pencil/vue/editor/commands'

const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ close: [] }>()

type EditorStateWithRulers = Editor['state'] & { showRulers?: boolean }

const menuRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const zoomText = ref(`${Math.round(props.editor.state.zoom * 100)}%`)

watch(
  () => props.editor.state.zoom,
  (z) => (zoomText.value = `${Math.round(z * 100)}%`),
)

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

onClickOutside(menuRef, (event) => {
  if ((event.target as HTMLElement | null)?.closest('.op-zoom')) return
  emit('close')
})

function commitZoom() {
  const n = parseFloat(zoomText.value.replace('%', '').trim())
  if (Number.isFinite(n)) props.editor.zoomToLevel(n / 100)
  zoomText.value = `${Math.round(props.editor.state.zoom * 100)}%`
  emit('close')
}

function zoomStep(delta: number) {
  const { width, height } = props.editor.getViewportSize()
  props.editor.applyZoom(delta, width / 2, height / 2)
}

const pixelGridOn = computed(() => props.editor.state.showPixelGrid !== false)
const snapPixelOn = computed(() => props.editor.state.snappingPreferences.pixelGrid)
const rulersOn = computed(() => (props.editor.state as EditorStateWithRulers).showRulers !== false)
const issuesOn = computed(() => props.editor.state.designIssues !== null)

function togglePixelGrid() {
  props.editor.state.showPixelGrid = props.editor.state.showPixelGrid === false
  props.editor.requestRepaint()
}

function toggleSnapPixel() {
  props.editor.state.snappingPreferences.pixelGrid = !props.editor.state.snappingPreferences.pixelGrid
}

function toggleRulers() {
  const state = props.editor.state as EditorStateWithRulers
  state.showRulers = state.showRulers === false
  props.editor.requestRepaint()
}

const SEVERITY_RANK: Record<DesignIssueSeverity, number> = { error: 3, warning: 2, info: 1 }

function toggleDesignIssues() {
  if (props.editor.state.designIssues !== null) {
    props.editor.clearDesignIssues()
    return
  }
  const result = createLinter({ preset: 'recommended' }).lintGraph(props.editor.graph, [props.editor.state.currentPageId])
  const byNode = new Map<string, DesignIssueMarker>()
  for (const msg of result.messages) {
    const existing = byNode.get(msg.nodeId)
    if (!existing) {
      byNode.set(msg.nodeId, { nodeId: msg.nodeId, severity: msg.severity, count: 1 })
    } else {
      existing.count++
      if (SEVERITY_RANK[msg.severity] > SEVERITY_RANK[existing.severity]) existing.severity = msg.severity
    }
  }
  props.editor.setDesignIssueMarkers([...byNode.values()])
}

const actions = [
  { label: 'Zoom in', shortcut: formatShortcut('Mod+='), run: () => zoomStep(-100) },
  { label: 'Zoom out', shortcut: formatShortcut('Mod+-'), run: () => zoomStep(100) },
  { label: 'Zoom to fit', shortcut: formatShortcut('Shift+1'), run: () => props.editor.zoomToFit() },
  { label: 'Zoom to 50%', shortcut: '', run: () => props.editor.zoomToLevel(0.5) },
  { label: 'Zoom to 100%', shortcut: formatShortcut('Mod+0'), run: () => props.editor.zoomTo100() },
  { label: 'Zoom to 200%', shortcut: '', run: () => props.editor.zoomToLevel(2) },
]
</script>

<template>
  <div ref="menuRef" class="op-zoom-menu" role="menu" @keydown.esc.stop="emit('close')">
    <div class="op-zoom-input-row">
      <input
        ref="inputRef"
        v-model="zoomText"
        class="op-zoom-input"
        aria-label="Zoom percentage"
        spellcheck="false"
        @keydown.stop="($event.key === 'Enter' && commitZoom(), $event.key === 'Escape' && emit('close'))"
      />
    </div>
    <button
      v-for="item in actions"
      :key="item.label"
      class="op-zoom-item"
      role="menuitem"
      @click="item.run(); emit('close')"
    >
      <span class="op-zoom-check" />
      <span>{{ item.label }}</span>
      <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
    </button>
    <div class="op-zoom-sep" />
    <button class="op-zoom-item" role="menuitemcheckbox" :aria-checked="pixelGridOn" @click="togglePixelGrid()">
      <span class="op-zoom-check">{{ pixelGridOn ? '✓' : '' }}</span>
      <span>Pixel grid</span>
      <kbd>{{ formatShortcut("Shift+'") }}</kbd>
    </button>
    <button class="op-zoom-item" role="menuitemcheckbox" :aria-checked="snapPixelOn" @click="toggleSnapPixel()">
      <span class="op-zoom-check">{{ snapPixelOn ? '✓' : '' }}</span>
      <span>Snap to pixel grid</span>
      <kbd>{{ formatShortcut("Mod+Shift+'") }}</kbd>
    </button>
    <button class="op-zoom-item" role="menuitemcheckbox" :aria-checked="rulersOn" @click="toggleRulers()">
      <span class="op-zoom-check">{{ rulersOn ? '✓' : '' }}</span>
      <span>Rulers</span>
      <kbd>{{ formatShortcut('Shift+R') }}</kbd>
    </button>
    <button class="op-zoom-item" role="menuitemcheckbox" :aria-checked="issuesOn" @click="toggleDesignIssues()">
      <span class="op-zoom-check">{{ issuesOn ? '✓' : '' }}</span>
      <span>Design issues</span>
    </button>
  </div>
</template>
