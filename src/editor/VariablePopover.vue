<script setup lang="ts">
// The "Apply variable" list: a search box, variables grouped by collection, and a create action.
// Rendered inside BindableValuePicker, so picking an item binds it through the binding provider.
import { computed } from 'vue'
import { ComboboxContent, ComboboxItem, ComboboxPortal } from 'reka-ui'
import { useEditor } from '@open-pencil/vue'
import { groupVariables } from './variables'

const props = defineProps<{
  types: readonly string[]
  search: string
  createLabel?: string
}>()

const emit = defineEmits<{
  search: [term: string]
  create: []
}>()

const editor = useEditor()
const groups = computed(() => {
  void editor.state.sceneVersion
  return groupVariables(editor.getCollections(), (id) => editor.getVariable(id), props.search, props.types)
})
</script>

<template>
  <ComboboxPortal>
    <ComboboxContent class="op-var-popover" position="popper" :side-offset="4" align="start">
      <input
        class="op-var-search"
        type="search"
        placeholder="Search variables"
        aria-label="Search variables"
        spellcheck="false"
        :value="search"
        @input="(e) => emit('search', (e.target as HTMLInputElement).value)"
        @keydown.stop
      />
      <div v-for="group in groups" :key="group.collectionId" class="op-var-group" role="group" :aria-label="group.name">
        <div class="op-var-group-head">{{ group.name }}</div>
        <ComboboxItem v-for="v in group.variables" :key="v.id" class="op-var-item" :value="v">
          {{ v.name }}
        </ComboboxItem>
      </div>
      <div v-if="!groups.length" class="op-var-empty">No matching variables</div>
      <button v-if="createLabel" type="button" class="op-var-create" @click="emit('create')">{{ createLabel }}</button>
    </ComboboxContent>
  </ComboboxPortal>
</template>
