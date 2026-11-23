<script setup lang="ts">
// The Design panel's Export section, after OpenPencil's: export settings (scale and format) kept on
// the selected layers, or on the page with nothing selected, and a button that renders them.
// The files go to the host (Obsidian writes them next to the design); without one, the browser
// downloads them.
import { computed, inject, ref } from 'vue'
import type { ExportSetting } from '@open-pencil/scene-graph'
import { jpgFormat, pngFormat, svgFormat, webpFormat, type ExportTarget, type IOFormatAdapter } from '@open-pencil/core/io'
import { getCanvasKit } from '@open-pencil/core/canvaskit'
import { useExport } from '@open-pencil/vue/document/export'
import { DESIGN_NAME, NOTIFY, WRITE_EXPORT, type WriteExport } from './context'
import { buildExportFileName } from './export-name'
import { EXPORT_SCALE_PRESETS, exportScaleLabel, parseExportScale } from './export-scale'

const ex = useExport()
const writeExport = inject(WRITE_EXPORT, null)
const notify = inject(NOTIFY, null)
const designName = inject(DESIGN_NAME, 'Design')

/** The formats the plugin can write; OpenPencil's PDF, PPTX and draw.io need the desktop app. */
const ADAPTERS: Record<string, IOFormatAdapter> = { png: pngFormat, jpg: jpgFormat, webp: webpFormat, svg: svgFormat }
const formatOptions = computed(() => ex.formatOptions.filter((o) => o.value in ADAPTERS))

const settings = computed(() => ex.activeSettings.value)
const busy = ref(false)
const status = ref('')

/** A typed scale is committed on Enter or when the field loses focus; text that is not a scale reverts. */
function commitScale(index: number, field: HTMLInputElement, current: number) {
  const next = parseExportScale(field.value)
  if (next === null) {
    field.value = exportScaleLabel(current)
    return
  }
  ex.updateScale(index, next)
  field.value = exportScaleLabel(next)
}

function fileName(setting: ExportSetting, ext: string) {
  const ids = ex.targetIds.value
  const nodeId = ex.activeTarget.value !== 'page' && ids.length === 1 ? ids[0] : undefined
  return buildExportFileName(ex.editor, {
    designName,
    targetName: ex.activeName.value || 'Export',
    nodeId,
    suffix: setting.suffix,
    scale: ex.formatSupportsScale(setting.format) ? setting.scale : 1,
    extension: ext,
  })
}

function target(): ExportTarget {
  const ids = ex.targetIds.value
  if (ex.activeTarget.value === 'page') return { scope: 'page', pageId: ex.editor.state.currentPageId }
  return ids.length === 1 ? { scope: 'node', nodeId: ids[0]! } : { scope: 'selection', nodeIds: ids }
}

function download(name: string, data: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function runExport() {
  if (busy.value || !settings.value.length) return
  busy.value = true
  status.value = ''
  const written: string[] = []
  try {
    const context = { canvasKit: await getCanvasKit(), renderer: ex.editor.renderer ?? undefined }
    for (const setting of settings.value) {
      const adapter = ADAPTERS[setting.format]
      if (!adapter?.exportContent) continue
      const result = await adapter.exportContent(
        { graph: ex.editor.graph, target: target() },
        { scale: setting.scale },
        context,
      )
      const data = typeof result.data === 'string' ? new TextEncoder().encode(result.data) : result.data
      const name = fileName(setting, result.extension)
      if (writeExport) written.push(await (writeExport as WriteExport)(name, data))
      else {
        download(name, data, result.mimeType)
        written.push(name)
      }
    }
    status.value = written.length === 1 ? `Exported ${written[0]}` : `Exported ${written.length} files`
  } catch (e) {
    const msg = `Export failed: ${e instanceof Error ? e.message : String(e)}`
    status.value = msg
    notify?.(msg)
    console.error('[openpencil] export failed', e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="op-prop">
    <div class="op-prop-head">
      Export
      <button class="op-icon-btn" title="Add export setting" @click="ex.addSetting()">
        <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
      </button>
    </div>
    <div v-if="ex.mixed.value" class="op-prop-note">Click + to replace mixed export settings</div>
    <template v-else>
      <datalist id="op-export-scale-presets">
        <option v-for="p in EXPORT_SCALE_PRESETS" :key="p" :value="exportScaleLabel(p)" />
      </datalist>
      <div v-for="(setting, i) in settings" :key="i" class="op-paint">
        <label class="op-field op-export-scale" :class="{ 'is-disabled': !ex.formatSupportsScale(setting.format) }">
          <input
            type="text"
            list="op-export-scale-presets"
            spellcheck="false"
            :value="exportScaleLabel(setting.scale)"
            :disabled="!ex.formatSupportsScale(setting.format)"
            aria-label="Export scale"
            title="Export scale (0.01x to 1024x)"
            @keydown.stop="(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()"
            @blur="(e: FocusEvent) => commitScale(i, e.target as HTMLInputElement, setting.scale)"
          />
        </label>
        <label class="op-field op-export-format">
          <select :value="setting.format" @change="(e: Event) => ex.updateFormat(i, (e.target as HTMLSelectElement).value as ExportSetting['format'])">
            <option v-if="!(setting.format in ADAPTERS)" :value="setting.format" disabled>{{ setting.format.toUpperCase() }} (desktop app)</option>
            <option v-for="o in formatOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <button class="op-icon-btn" title="Remove export setting" @click="ex.removeSetting(i)">
          <svg class="op-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M3 8h10" /></svg>
        </button>
      </div>
      <button v-if="settings.length" class="op-export-btn" :disabled="busy" @click="runExport">
        {{ busy ? 'Exporting…' : `Export ${ex.activeName.value || 'page'}` }}
      </button>
      <div v-if="status" class="op-prop-note" :class="{ 'is-warning': status.startsWith('Export failed') }">{{ status }}</div>
    </template>
  </section>
</template>
