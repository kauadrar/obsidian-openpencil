<script setup lang="ts">
// Frame section for one selected non-icon frame: a preset select that shows the preset matching the
// frame's W×H (or Custom) and resizes the frame to the chosen preset in one undoable step.
import { computed } from 'vue'
import type { SceneNode } from '@open-pencil/scene-graph'
import { useEditor } from '@open-pencil/vue'
import {
  findFrameResizePreset,
  FRAME_RESIZE_PRESET_CATEGORIES,
  FRAME_RESIZE_PRESETS,
} from './frame-presets'

const props = defineProps<{ frame: SceneNode }>()
const editor = useEditor()

const currentId = computed(() => {
  void editor.state.sceneVersion
  const f = props.frame
  return findFrameResizePreset(f.width, f.height, f.name)?.id ?? ''
})

function choose(id: string) {
  const preset = FRAME_RESIZE_PRESETS.find((p) => p.id === id)
  if (preset) editor.resizeFrameToPreset(props.frame.id, preset)
}
</script>

<template>
  <section class="op-prop op-frame-preset">
    <div class="op-prop-head"><span>Frame</span></div>
    <label class="op-frame-preset-field">
      <span class="op-field-label">Frame preset</span>
      <select :value="currentId" aria-label="Frame preset" @change="(e) => choose((e.target as HTMLSelectElement).value)">
        <option value="" disabled>Custom</option>
        <optgroup v-for="category in FRAME_RESIZE_PRESET_CATEGORIES" :key="category.id" :label="category.label">
          <option v-for="preset in category.presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
        </optgroup>
      </select>
    </label>
  </section>
</template>
