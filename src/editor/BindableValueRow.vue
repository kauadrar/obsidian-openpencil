<script setup lang="ts">
// Wraps one numeric or colour field with a variable binding: a diamond trigger opens the
// "Apply variable" list, and a bound field shows its variable as a pill with a detach button.
// Without a single target node (nothing or several selected) the field is shown unchanged.
import { computed } from 'vue'
import type { Color } from '@open-pencil/scene-graph/primitives'
import { useColorBindingProvider, useNumberBindingProvider } from '@open-pencil/vue/controls/binding-provider'
import { BindableValuePicker, BindableValueRoot, BindableValueTrigger } from '@open-pencil/vue/primitives/BindableValue'
import VariablePopover from './VariablePopover.vue'
import { colorToHex } from './fields'

const props = defineProps<{
  nodeId: string | null
  path: string
  kind: 'number' | 'color'
  value: number | Color | symbol
}>()

// The provider is chosen once per instance, so a row never switches between number and colour.
const provider = props.kind === 'color' ? useColorBindingProvider() : useNumberBindingProvider()
const types = props.kind === 'color' ? ['COLOR'] : ['FLOAT']
const targets = computed(() => (props.nodeId ? [{ nodeId: props.nodeId, path: props.path }] : []))
const createLabel = (value: unknown) => {
  if (props.kind === 'number' && typeof value === 'number') {
    return `Create number variable from ${Math.round(value * 100) / 100}`
  }
  if (props.kind === 'color' && value && typeof value === 'object' && 'r' in value) {
    return `Create colour variable from #${colorToHex(value as Color)}`
  }
  return undefined
}
</script>

<template>
  <BindableValueRoot v-if="nodeId" :provider="provider as never" :targets="targets" :value="value as never" v-slot="s">
    <div class="op-bind" :data-state="s.state">
      <div v-if="s.state === 'bound' && s.variable" class="op-bind-pill" :title="s.variable.name">
        <span class="op-bind-pill-name">{{ s.variable.name }}</span>
        <button
          type="button"
          class="op-bind-pill-detach"
          aria-label="Detach variable"
          title="Detach variable"
          @click="s.actions.unbind()"
        >×</button>
      </div>
      <slot v-else />
      <BindableValueTrigger class="op-bind-trigger" aria-label="Apply variable" title="Apply variable">◇</BindableValueTrigger>
      <BindableValuePicker>
        <VariablePopover
          :types="types"
          :search="s.searchTerm"
          :create-label="createLabel(value)"
          @search="(term: string) => s.actions.setSearchTerm(term)"
          @create="s.actions.create('')"
        />
      </BindableValuePicker>
    </div>
  </BindableValueRoot>
  <slot v-else />
</template>
