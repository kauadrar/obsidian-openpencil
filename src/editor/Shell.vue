<script setup lang="ts">
// A deliberately small editor shell: tool bar, page list, canvas. Everything else
// (property panels, layers, AI chat) can be added later from @open-pencil/vue primitives.
import { ref, type Ref } from 'vue'
import type { Editor } from '@open-pencil/core'
import { CanvasRoot, CanvasSurface } from '@open-pencil/vue/canvas'
import { ToolbarRoot } from '@open-pencil/vue/primitives/Toolbar'
import { PageListRoot } from '@open-pencil/vue/primitives/PageList'
import { useEditorKeyboard } from '@open-pencil/vue/editor/keyboard'

const props = defineProps<{
  editor: Editor
  active: Ref<boolean>
  readOnly: boolean
}>()
const emit = defineEmits<{ save: [] }>()

useEditorKeyboard({
  active: () => props.active.value,
  shortcuts: [{ id: 'save', keys: 'Mod+S', run: () => emit('save') }],
})

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
</script>

<template>
  <div class="op-shell">
    <aside class="op-pages">
      <PageListRoot v-slot="{ pages, currentPageId, actions }">
        <div class="op-pages-title">Pages</div>
        <button
          v-for="page in pages"
          :key="page.id"
          class="op-page"
          :class="{ 'is-active': page.id === currentPageId }"
          @click="actions.switch(page.id)"
        >
          {{ page.name }}
        </button>
      </PageListRoot>
    </aside>

    <main class="op-canvas">
      <CanvasRoot :show-rulers="false" @ready="onReady" @failed="onFailed">
        <CanvasSurface class="op-surface" />
      </CanvasRoot>

      <ToolbarRoot v-slot="{ tools, activeTool, actions }">
        <div class="op-toolbar" role="toolbar">
          <button
            v-for="tool in tools"
            :key="tool.key"
            class="op-tool"
            :class="{ 'is-active': activeTool === tool.key }"
            :title="`${tool.label} (${tool.shortcut})`"
            @click="actions.setTool(tool.key)"
          >
            {{ tool.label }}
          </button>
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
  </div>
</template>
