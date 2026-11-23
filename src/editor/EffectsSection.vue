<script setup lang="ts">
// The Design panel's Effects section, after OpenPencil's: a list of shadows and blurs, each with
// a type, visibility and remove, and its values in a row that opens below it. Edits go through
// @open-pencil/vue's effect controls, so they are undoable and apply to every selected layer.
import { computed } from 'vue'
import type { BlendMode, Effect } from '@open-pencil/scene-graph'
import type { Color } from '@open-pencil/scene-graph/primitives'
import { useEditorPropertyList } from '@open-pencil/vue/controls/property-list'
import { useEffectsControls } from '@open-pencil/vue/controls/effects'
import { useNodeProps } from '@open-pencil/vue/controls/node-props'
import { ColorField, NumField } from './fields'
import { EYE_ICON, EYE_OFF_ICON } from './icons'
import BindableValueRow from './BindableValueRow.vue'
import { displayEffectType, SHADOW_BLEND_MODES, showsBehindTransparent, supportedEffectOptions } from './effects'

const effects = useEditorPropertyList('effects')
const fx = useEffectsControls()
const { node, isMulti } = useNodeProps()

// Effect values bind to variables for one layer at a time, as the layer fields do.
const bindNodeId = computed(() => (!isMulti.value && node.value ? node.value.id : null))
const setBlend = (i: number, blendMode: string) => fx.commitEffect(i, { blendMode: blendMode as BlendMode })
const setShowBehind = (i: number, show: boolean) => fx.commitEffect(i, { showShadowBehindNode: show })

const add = () => {
  effects.actions.add(fx.createDefaultEffect())
  fx.expandedIndex.value = effects.items.value.length - 1
}
const setType = (i: number, type: Effect['type']) => fx.updateType(effects.actions.patch, node.value, i, type)
const setColor = (i: number, c: Color) => fx.updateColor(effects.actions.patch, i, c)
const setAlpha = (i: number, e: Effect, a: number) => fx.updateColor(effects.actions.patch, i, { ...e.color, a })
</script>

<template>
  <section class="op-prop">
    <div class="op-prop-head">
      Effects
      <button class="op-icon-btn" title="Add effect" @click="add">
        <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
      </button>
    </div>
    <div v-if="effects.isMixed.value" class="op-prop-note">Click + to replace mixed effects</div>
    <template v-else>
      <div v-for="(effect, i) in effects.items.value" :key="i" class="op-effect">
        <div class="op-paint" :class="{ 'is-hidden': !effect.visible }">
          <button
            class="op-icon-btn"
            :class="{ 'is-on': fx.expandedIndex.value === i }"
            title="Effect settings"
            @click="fx.toggleExpand(i)"
          >
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round">
              <path v-if="fx.isShadow(effect.type)" d="M3 3h7v7H3zM12 5.5V12H5.5" />
              <circle v-else cx="8" cy="8" r="5" stroke-dasharray="1.5 1.5" />
            </svg>
          </button>
          <label class="op-field op-effect-type">
            <select :value="displayEffectType(effect.type)" @change="(e: Event) => setType(i, (e.target as HTMLSelectElement).value as Effect['type'])">
              <option v-for="o in supportedEffectOptions(fx.effectOptionsFor(effects.items.value, i))" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button class="op-icon-btn" :title="effect.visible ? 'Hide effect' : 'Show effect'" @click="effects.actions.toggleVisibility(i)">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" v-html="effect.visible ? EYE_ICON : EYE_OFF_ICON" />
          </button>
          <button class="op-icon-btn" title="Remove effect" @click="fx.handleRemove(effects.actions.remove, i)">
            <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
          </button>
        </div>

        <div v-if="fx.expandedIndex.value === i" class="op-effect-detail">
          <template v-if="fx.isShadow(effect.type)">
            <label class="op-field op-effect-blend">
              <span class="op-field-label">Blend</span>
              <select :value="effect.blendMode ?? 'NORMAL'" aria-label="Blend mode" @change="(e: Event) => setBlend(i, (e.target as HTMLSelectElement).value)">
                <option v-for="m in SHADOW_BLEND_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </label>
            <div class="op-grid2">
              <BindableValueRow :node-id="bindNodeId" :path="`effects/${i}/offsetX`" kind="number" :value="effect.offset.x">
                <NumField label="X" title="Offset X" :value="effect.offset.x" @commit="(v: number) => fx.commitEffect(i, (e) => ({ offset: { ...e.offset, x: v } }))" />
              </BindableValueRow>
              <BindableValueRow :node-id="bindNodeId" :path="`effects/${i}/offsetY`" kind="number" :value="effect.offset.y">
                <NumField label="Y" title="Offset Y" :value="effect.offset.y" @commit="(v: number) => fx.commitEffect(i, (e) => ({ offset: { ...e.offset, y: v } }))" />
              </BindableValueRow>
              <BindableValueRow :node-id="bindNodeId" :path="`effects/${i}/radius`" kind="number" :value="effect.radius">
                <NumField label="◌" title="Blur" :min="0" :value="effect.radius" @commit="(v: number) => fx.commitEffect(i, { radius: v })" />
              </BindableValueRow>
              <BindableValueRow :node-id="bindNodeId" :path="`effects/${i}/spread`" kind="number" :value="effect.spread">
                <NumField label="⊕" title="Spread" :value="effect.spread" @commit="(v: number) => fx.commitEffect(i, { spread: v })" />
              </BindableValueRow>
            </div>
            <ColorField
              :color="{ ...effect.color, a: 1 }"
              :opacity="effect.color.a"
              @color="(c: Color) => setColor(i, { ...c, a: effect.color.a })"
              @opacity="(a: number) => setAlpha(i, effect, a)"
            />
            <label v-if="effect.type === 'DROP_SHADOW'" class="op-effect-behind">
              <input
                type="checkbox"
                :checked="showsBehindTransparent(effect)"
                @change="(e: Event) => setShowBehind(i, (e.target as HTMLInputElement).checked)"
              />
              <span>Show behind transparent areas</span>
            </label>
          </template>
          <template v-else-if="fx.isBlur(effect.type)">
            <div class="op-grid2">
              <BindableValueRow :node-id="bindNodeId" :path="`effects/${i}/radius`" kind="number" :value="effect.radius">
                <NumField label="◌" title="Blur" :min="0" :value="effect.radius" @commit="(v: number) => fx.commitEffect(i, { radius: v })" />
              </BindableValueRow>
            </div>
          </template>
          <div v-else class="op-prop-note">This effect's settings can be edited in OpenPencil.</div>
        </div>
      </div>
    </template>
  </section>
</template>
