<script setup lang="ts">
// Page-level Variables section (nothing selected): local collections with their variable counts,
// and a mode switcher for each collection that has 2+ modes.
import { computed } from 'vue'
import { useEditor } from '@open-pencil/vue'
import { useVariableModes } from '@open-pencil/vue/controls/variable-modes'
import { summarizeCollections } from './variables'

const editor = useEditor()
const { choices, setMode } = useVariableModes()

const collections = computed(() => {
  void editor.state.sceneVersion
  return summarizeCollections(editor.getCollections(), (id) => editor.getVariable(id))
})
const total = computed(() => collections.value.reduce((sum, c) => sum + c.count, 0))
const modeChoices = computed(() => choices.value.filter((c) => c.modes.length > 1))
</script>

<template>
  <section class="op-prop op-page-vars">
    <div class="op-prop-head">Variables</div>
    <div v-if="total === 0" class="op-prop-note">No local variables</div>
    <ul v-else class="op-var-collections">
      <li v-for="c in collections" :key="c.id" class="op-var-collection">
        <span class="op-var-collection-name">{{ c.name }}</span>
        <span class="op-var-count">{{ c.count }}</span>
      </li>
    </ul>
    <label v-for="c in modeChoices" :key="c.collectionId" class="op-var-mode">
      <span class="op-var-mode-name">{{ c.name }}</span>
      <select
        :value="typeof c.value === 'string' ? c.value : ''"
        :aria-label="`Mode for ${c.name}`"
        @change="(e) => setMode(c.collectionId, (e.target as HTMLSelectElement).value || null)"
      >
        <option value="">Auto</option>
        <option v-for="m in c.modes" :key="m.modeId" :value="m.modeId">{{ m.name }}</option>
      </select>
    </label>
  </section>
</template>
