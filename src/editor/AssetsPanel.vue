<script setup lang="ts">
// Assets tab: the document's local components, grouped by page. A row can be dragged onto the canvas
// or inserted with its + button, which places an instance at the viewport centre.
import { computed, ref } from 'vue'
import type { Editor } from '@open-pencil/core'
import type { SceneNode } from '@open-pencil/scene-graph'
import { collectComponents, COMPONENT_DRAG_TYPE, groupAssets } from './assets'

const props = defineProps<{ editor: Editor }>()

const search = ref('')
const collapsed = ref(new Set<string>())

const groups = computed(() => {
  void props.editor.state.sceneVersion
  const pages = props.editor.graph.getPages().map((page) => ({
    id: page.id,
    name: page.name,
    components: collectComponents(page.childIds, (id) => props.editor.graph.getNode(id)),
  }))
  return groupAssets(pages, search.value)
})

function toggle(pageId: string) {
  const next = new Set(collapsed.value)
  if (next.has(pageId)) next.delete(pageId)
  else next.add(pageId)
  collapsed.value = next
}

// Schematic thumbnail: the component's first visible solid fill, in its own shape. It is not a render.
function thumbStyle(node: SceneNode | undefined): Record<string, string> {
  const fill = node?.fills?.find((f) => f.type === 'SOLID' && f.visible !== false)
  const style: Record<string, string> = {}
  if (fill && fill.type === 'SOLID') {
    const { r, g, b } = fill.color
    style.background = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`
  }
  if (node?.type === 'ELLIPSE') style.borderRadius = '50%'
  return style
}

function insertAtCentre(componentId: string) {
  const node = props.editor.graph.getNode(componentId)
  const vp = props.editor.getViewportSize()
  const centre = props.editor.screenToCanvas(vp.width / 2, vp.height / 2)
  const x = centre.x - (node?.width ?? 0) / 2
  const y = centre.y - (node?.height ?? 0) / 2
  const instance = props.editor.createInstanceFromComponent(componentId, x, y)
  if (instance) props.editor.select([instance])
}

function onDragStart(event: DragEvent, componentId: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData(COMPONENT_DRAG_TYPE, componentId)
  event.dataTransfer.setData('text/plain', componentId)
  event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <div class="op-assets">
    <input
      v-model="search"
      class="op-assets-search"
      type="search"
      placeholder="Search components"
      aria-label="Search components"
      spellcheck="false"
      @keydown.stop
    />
    <div v-for="group in groups" :key="group.pageId" class="op-assets-group">
      <button
        type="button"
        class="op-assets-group-head"
        :aria-expanded="!collapsed.has(group.pageId)"
        @click="toggle(group.pageId)"
      >
        <span class="op-assets-twisty" :class="{ 'is-open': !collapsed.has(group.pageId) }">▸</span>
        <span class="op-assets-group-name">{{ group.pageName }}</span>
        <span class="op-var-count">{{ group.components.length }}</span>
      </button>
      <ul v-if="!collapsed.has(group.pageId)" class="op-assets-list">
        <li
          v-for="component in group.components"
          :key="component.id"
          class="op-asset"
          draggable="true"
          :title="`Drag onto the canvas, or click +`"
          @dragstart="onDragStart($event, component.id)"
        >
          <span class="op-asset-thumb" :style="thumbStyle(editor.graph.getNode(component.id))" aria-hidden="true" />
          <span class="op-asset-name">{{ component.name }}</span>
          <button
            type="button"
            class="op-asset-add"
            :aria-label="`Insert ${component.name}`"
            title="Insert at the centre of the view"
            @click="insertAtCentre(component.id)"
          >+</button>
        </li>
      </ul>
    </div>
    <div v-if="groups.length === 0" class="op-empty op-assets-empty">
      {{ search.trim() ? `No components match “${search.trim()}”` : 'No components in this document' }}
    </div>
  </div>
</template>
