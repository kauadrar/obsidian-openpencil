<script setup lang="ts">
// Component properties and variants for a selected instance: text overrides, boolean toggles,
// instance-swap pickers and variant selects. Each change goes through the SDK, so it is undoable.
import { computed } from 'vue'
import { useComponentProperties } from '@open-pencil/vue/controls/component-props'
import { booleanToValue, splitOverrideControls, valueToBoolean } from './component-props'
import { releaseCheckboxFocus } from './focus'

const overrides = useComponentProperties()
const split = computed(() => splitOverrideControls(overrides.controls.value))

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')
const isMixed = (value: unknown): boolean => typeof value !== 'string'
</script>

<template>
  <section v-if="overrides.active.value" class="op-prop op-instance-props">
    <div class="op-prop-head"><span>Component properties</span></div>

    <div v-for="c in split.properties" :key="c.id" class="op-instance-prop">
      <span class="op-instance-prop-name">{{ c.name }}</span>

      <input
        v-if="c.type === 'TEXT'"
        class="op-instance-prop-value"
        type="text"
        :value="asText(c.value)"
        :placeholder="isMixed(c.value) ? 'Mixed' : ''"
        :aria-label="`${c.name} text`"
        spellcheck="false"
        @input="(e) => overrides.setTextValue(c.id, (e.target as HTMLInputElement).value)"
        @change="overrides.flush()"
        @blur="overrides.flush()"
        @keydown.stop="(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()"
      />

      <input
        v-else-if="c.type === 'BOOLEAN'"
        type="checkbox"
        class="op-instance-prop-value"
        :checked="valueToBoolean(asText(c.value))"
        :aria-label="c.name"
        @change="(e: Event) => { overrides.setValue(c.id, booleanToValue((e.target as HTMLInputElement).checked)); releaseCheckboxFocus(e) }"
      />

      <select
        v-else
        class="op-instance-prop-value"
        :value="asText(c.value)"
        :aria-label="`${c.name} instance`"
        @change="(e) => overrides.setValue(c.id, (e.target as HTMLSelectElement).value)"
      >
        <option v-if="isMixed(c.value)" value="" disabled>Mixed</option>
        <option v-for="o in c.options" :key="o.value" :value="o.value" :disabled="o.disabled">{{ o.label }}</option>
      </select>
    </div>

    <template v-if="split.variants.length">
      <div class="op-prop-head op-instance-variants-head"><span>Variants</span></div>
      <div v-for="c in split.variants" :key="c.id" class="op-instance-prop">
        <span class="op-instance-prop-name">{{ c.name }}</span>
        <select
          class="op-instance-prop-value"
          :value="asText(c.value)"
          :aria-label="`${c.name} variant`"
          @change="(e) => overrides.setValue(c.id, (e.target as HTMLSelectElement).value)"
        >
          <option v-if="isMixed(c.value)" value="" disabled>Mixed</option>
          <option v-for="o in c.options" :key="o.value" :value="o.value" :disabled="o.disabled">{{ o.label }}</option>
        </select>
      </div>
    </template>
  </section>
</template>
