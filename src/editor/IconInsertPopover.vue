<script setup lang="ts">
// Insert icon: a toolbar popover that searches Iconify icons, filters by set, and inserts the chosen
// icon at the centre of the view, or into the selected frame. Iconify needs internet access; when it
// cannot be reached the popover says so and stays usable, and nothing throws.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import type { Editor } from '@open-pencil/core'
import { useIconSearch } from '@open-pencil/vue/controls/icon'

const props = defineProps<{ editor: Editor }>()

const open = ref(false)
const search = useIconSearch()
const inserting = ref(false)

// Iconify's previews are SVG text from a remote service: shown as data-URL images, never as markup.
const previewUrl = (name: string): string | null => {
  const svg = search.previews.value.get(name)
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
}

const unavailable = computed(() => search.failed.value && search.visible.value.length === 0)
// Iconify's sets are fetched over the network; the Material Symbols results can still show offline, so the
// note says what is missing rather than leaving the search looking complete.
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const setOnline = () => (online.value = navigator.onLine)
onMounted(() => {
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
})
const empty = computed(() => !search.loading.value && !search.failed.value && search.query.value.trim() !== '' && search.visible.value.length === 0)

watch(open, (isOpen) => {
  if (isOpen) void search.loadSets().catch(() => {})
})
watch(
  () => search.visible.value,
  (names) => search.want(names),
  { immediate: true },
)

/**
 * Inserts the icon. With one frame selected, the icon goes inside it: the editor places icons in the
 * container that is entered, so that frame is entered for the insert and the previous state restored.
 */
async function insert(name: string) {
  if (inserting.value) return
  inserting.value = true
  const ed = props.editor
  const frame = ed.getSelectedNode()
  const previous = ed.state.enteredContainerId
  try {
    if (frame && frame.type === 'FRAME') ed.enterContainer(frame.id)
    await ed.insertIcon(name)
  } catch {
    // Offline or a failed fetch: the icon is not inserted and the editor carries on.
  } finally {
    if (frame && frame.type === 'FRAME') {
      if (previous) ed.enterContainer(previous)
      else ed.exitContainers()
    }
    inserting.value = false
  }
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger class="op-tool op-insert-icon" title="Insert icon" aria-label="Insert icon">
      <svg class="op-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="8" r="5.5" /><path d="M8 5.5v5M5.5 8h5" />
      </svg>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="op-icon-popover" side="bottom" align="start" :side-offset="8">
        <div class="op-icon-popover-head">
          <input
            v-model="search.query.value"
            class="op-icon-search"
            type="search"
            placeholder="Search icons"
            aria-label="Search icons"
            spellcheck="false"
            @keydown.stop
          />
          <select
            class="op-icon-set"
            aria-label="Icon set"
            :value="search.set.value ?? ''"
            @change="(e) => (search.set.value = (e.target as HTMLSelectElement).value || null)"
          >
            <option value="">All sets</option>
            <option v-for="s in search.sets.value" :key="s.prefix" :value="s.prefix">{{ s.name }}</option>
          </select>
        </div>

        <div v-if="!online" class="op-icon-status">Offline: Iconify icons need an internet connection.</div>
        <div v-if="search.loading.value || search.setsLoading.value" class="op-icon-status">Searching…</div>
        <div v-else-if="unavailable" class="op-icon-status">Icons unavailable. Iconify needs an internet connection.</div>
        <div v-else-if="empty" class="op-icon-status">No icons found</div>

        <div class="op-icon-grid" role="list">
          <button
            v-for="name in search.visible.value"
            :key="name"
            type="button"
            class="op-icon-cell"
            role="listitem"
            :title="name"
            :disabled="inserting"
            @click="insert(name)"
          >
            <img v-if="previewUrl(name)" :src="previewUrl(name) ?? undefined" alt="" draggable="false" />
            <span v-else class="op-icon-cell-pending" aria-hidden="true" />
          </button>
        </div>

        <button v-if="search.hasMore.value" type="button" class="op-icon-more" :disabled="search.loading.value" @click="search.loadMore()">
          Load more
        </button>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
