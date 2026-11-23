<script setup lang="ts">
// Properties section for a selected main component or component set: add Text, Boolean or Instance
// swap properties, edit each one's name and default, and remove it. Instances pick these up through
// their overrides.
import { computed, ref } from 'vue'
import { useEditor } from '@open-pencil/vue'
import { useComponentPropertyAuthoring } from '@open-pencil/vue/controls/component-props'
import {
  ADDABLE_PROPERTIES,
  booleanToValue,
  propertyRowsOnly,
  subtreeIds,
  swapDefaultFor,
  valueToBoolean,
  type PropertyKind,
} from './component-props'

const auth = useComponentPropertyAuthoring()
const editor = useEditor()
const menuOpen = ref(false)

const owner = computed(() => auth.context.value?.owner.id ?? null)
const rows = computed(() => propertyRowsOnly(auth.rows.value))

// Core only accepts an Instance swap property whose default is an existing component, so new ones start
// on another component in the file. Null (item disabled) when the file has no other component.
const swapDefault = computed<string | null>(() => {
  void editor.state.sceneVersion
  const ownerId = owner.value
  if (!ownerId) return null
  const inside = subtreeIds(ownerId, (id) => editor.graph.getNode(id))
  return swapDefaultFor([...editor.graph.getAllNodes()], inside)
})

function defaultFor(item: { type: PropertyKind; defaultValue: string }): string | null {
  return item.type === 'INSTANCE_SWAP' ? swapDefault.value : item.defaultValue
}

function add(type: PropertyKind, name: string, defaultValue: string | null) {
  const ownerId = owner.value
  if (!ownerId || defaultValue === null) return
  auth.create(ownerId, name, type, defaultValue)
  menuOpen.value = false
}

function commitName(propertyId: string, ownerId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const name = input.value.trim()
  if (!name) input.value = rows.value.find((r) => r.id === propertyId)?.property.name ?? ''
  else auth.rename(ownerId, propertyId, name)
}
</script>

<template>
  <section class="op-prop op-component-props" :class="{ 'is-readonly': !auth.editable.value }">
    <div class="op-prop-head">
      <span>Properties</span>
      <div class="op-add-wrap">
        <button
          type="button"
          class="op-icon-btn"
          title="Add property"
          aria-label="Add property"
          :aria-expanded="menuOpen"
          :disabled="!auth.editable.value || !owner"
          @click="menuOpen = !menuOpen"
        >+</button>
        <ul v-if="menuOpen" class="op-add-menu" role="menu">
          <li v-for="item in ADDABLE_PROPERTIES" :key="item.type">
            <button
              type="button"
              role="menuitem"
              class="op-add-item"
              :disabled="defaultFor(item) === null"
              :title="defaultFor(item) === null ? 'Needs another component in this file' : undefined"
              @click="add(item.type, item.name, defaultFor(item))"
            >
              {{ item.label }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <div v-for="row in rows" :key="row.id" class="op-component-prop">
      <input
        class="op-component-prop-name"
        :value="row.property.name"
        aria-label="Property name"
        spellcheck="false"
        :disabled="!auth.editable.value"
        @keydown.stop="(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()"
        @change="(e: Event) => commitName(row.id, row.property.ownerId, e)"
      />
      <span class="op-component-prop-type">{{ row.property.type.toLowerCase().replace('_', ' ') }}</span>

      <input
        v-if="row.property.type === 'TEXT'"
        class="op-component-prop-default"
        :value="row.property.defaultValue"
        aria-label="Default text"
        spellcheck="false"
        :disabled="!auth.editable.value"
        @keydown.stop="(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()"
        @change="(e: Event) => auth.setDefault(row.property.ownerId, row.id, (e.target as HTMLInputElement).value)"
      />
      <label v-else-if="row.property.type === 'BOOLEAN'" class="op-component-prop-default">
        <input
          type="checkbox"
          :checked="valueToBoolean(row.property.defaultValue)"
          :disabled="!auth.editable.value"
          @change="(e: Event) => auth.setDefault(row.property.ownerId, row.id, booleanToValue((e.target as HTMLInputElement).checked))"
        />
        <span>Default</span>
      </label>
      <select
        v-else
        class="op-component-prop-default"
        :value="row.property.defaultValue"
        aria-label="Default component"
        :disabled="!auth.editable.value"
        @change="(e: Event) => auth.setDefault(row.property.ownerId, row.id, (e.target as HTMLSelectElement).value)"
      >
        <option value="">None</option>
        <option v-for="opt in auth.swapOptions(row.id)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>

      <button
        type="button"
        class="op-icon-btn op-component-prop-remove"
        title="Remove property"
        aria-label="Remove property"
        :disabled="!auth.editable.value"
        @click="auth.remove(row.property.ownerId, row.id)"
      >−</button>
    </div>

    <div v-if="rows.length === 0" class="op-prop-note">No properties yet. Use + to add one.</div>
  </section>
</template>
