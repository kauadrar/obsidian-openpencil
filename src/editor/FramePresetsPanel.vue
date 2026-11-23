<script setup lang="ts">
// Shown while the Frame tool is active with nothing drawn yet: one collapsible group per category,
// each row "Name … W × H". Clicking a row creates a frame of that size at the centre of the view.
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { useEditor } from '@open-pencil/vue'
import { FRAME_PRESET_CATEGORIES, type FramePreset } from './frame-presets'

const editor = useEditor()

function createFrame(preset: FramePreset) {
  editor.createFrameFromPreset(preset)
}
</script>

<template>
  <section class="op-frame-presets" aria-label="Frame">
    <div class="op-prop-head op-frame-presets-head"><span>Frame</span></div>
    <CollapsibleRoot
      v-for="category in FRAME_PRESET_CATEGORIES"
      :key="category.id"
      v-slot="{ open }"
      :default-open="category.id === 'phone'"
      class="op-frame-group"
    >
      <CollapsibleTrigger class="op-frame-group-trigger">
        <span class="op-frame-twisty" :class="{ 'is-open': open }">▸</span>
        <span class="op-frame-group-name">{{ category.label }}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <button
          v-for="preset in category.presets"
          :key="preset.id"
          type="button"
          class="op-frame-row"
          :data-frame-preset="preset.id"
          @click="createFrame(preset)"
        >
          <span class="op-frame-row-name">{{ preset.name }}</span>
          <span class="op-frame-row-size">{{ preset.width }} × {{ preset.height }}</span>
        </button>
      </CollapsibleContent>
    </CollapsibleRoot>
  </section>
</template>
