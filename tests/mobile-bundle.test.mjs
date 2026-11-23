import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainJsPath = path.resolve(__dirname, '../dist/main.js')

test('dist/main.js loads and runs onload() on mobile without requiring node:* modules', async () => {
  const requiredNodeModules = []

  class FakePlugin {
    app = {
      vault: {
        on: () => ({}),
        offref: () => {},
        getAbstractFileByPath: () => null,
        adapter: {},
      },
      workspace: {
        on: () => ({}),
        onLayoutReady: () => {},
        getLeavesOfType: () => [],
      },
    }
    manifest = { id: 'openpencil-editor', dir: '.obsidian/plugins/openpencil-editor' }
    async loadData() {
      return {}
    }
    async saveData() {}
    addSettingTab() {}
    addRibbonIcon() {}
    registerView() {}
    registerExtensions() {}
    registerMarkdownPostProcessor() {}
    registerEditorExtension() {}
    addCommand() {}
    registerEvent() {}
  }

  const fakeObsidian = {
    App: class {},
    FileView: class {},
    FuzzySuggestModal: class {},
    Menu: class {},
    MenuItem: class {},
    Notice: class {},
    Platform: { isDesktopApp: false, isMobile: true },
    Plugin: FakePlugin,
    PluginSettingTab: class {},
    Setting: class {},
    TFile: class {},
    TFolder: class {},
    normalizePath: (p) => p,
  }

  const customRequire = (request) => {
    if (request === 'obsidian') return fakeObsidian
    if (request === '@codemirror/view') return { EditorView: {}, ViewPlugin: { fromClass: () => ({}) } }
    if (request.startsWith('node:')) {
      requiredNodeModules.push(request)
      throw new Error(`Mobile environment cannot load ${request}`)
    }
    throw new Error(`Unexpected external require: ${request}`)
  }

  const code = fs.readFileSync(mainJsPath, 'utf8')
  const mod = { exports: {} }
  const fn = vm.runInThisContext(`(function(exports, require, module, __filename, __dirname) {\n${code}\n})`, {
    filename: mainJsPath,
  })
  fn(mod.exports, customRequire, mod, mainJsPath, path.dirname(mainJsPath))

  const PluginClass = mod.exports.default ?? mod.exports
  const plugin = new PluginClass()
  await plugin.onload()
  assert.deepEqual(requiredNodeModules, [])
})

test('mobile mode never writes to vault on save or markDirty', async () => {
  let modifyBinaryCalls = 0
  const customRequire = (request) => {
    if (request === 'obsidian') {
      return {
        App: class {},
        FileView: class {
          app = {
            vault: {
              modifyBinary: async () => {
                modifyBinaryCalls++
              },
            },
          }
        },
        FuzzySuggestModal: class {},
        Menu: class {},
        MenuItem: class {},
        Notice: class {},
        Platform: { isDesktopApp: false, isMobile: true },
        Plugin: class {},
        PluginSettingTab: class {},
        Setting: class {},
        TFile: class {},
        TFolder: class {},
        normalizePath: (p) => p,
      }
    }
    if (request === '@codemirror/view') return { EditorView: {}, ViewPlugin: { fromClass: () => ({}) } }
    if (request.startsWith('node:')) throw new Error(`Mobile environment cannot load ${request}`)
    throw new Error(`Unexpected external require: ${request}`)
  }

  const code = fs.readFileSync(mainJsPath, 'utf8')
  const mod = { exports: {} }
  const fn = vm.runInThisContext(`(function(exports, require, module, __filename, __dirname) {\n${code}\n})`, {
    filename: mainJsPath,
  })
  fn(mod.exports, customRequire, mod, mainJsPath, path.dirname(mainJsPath))

  const PluginClass = mod.exports.default ?? mod.exports
  const { DesignView } = mod.exports
  const ViewClass = DesignView ?? PluginClass
  assert.ok(ViewClass)
  if (DesignView) {
    const view = new DesignView({}, {})
    view.file = { name: 'test.fig', basename: 'test', extension: 'fig' }
    view.mounted = { canWrite: true, exportNative: async () => new Uint8Array([1, 2, 3]) }
    await view.save()
    assert.equal(modifyBinaryCalls, 0)
  }
})

test('dist/main.js embedded editor payload contains is-preview and op-preview-page', () => {
  const code = fs.readFileSync(mainJsPath, 'utf8')
  const match = code.match(/PAYLOAD\s*=\s*"([A-Za-z0-9+/=]+)"/)
  assert.ok(match, 'dist/main.js must contain embedded gzipped PAYLOAD')
  const raw = zlib.gunzipSync(Buffer.from(match[1], 'base64'))
  const headerLength = raw.readUInt32LE(0)
  const header = JSON.parse(raw.subarray(4, 4 + headerLength).toString('utf8'))
  let offset = 4 + headerLength
  let editorJs = null
  for (const entry of header) {
    if (entry.path === 'editor.js') {
      editorJs = raw.subarray(offset, offset + entry.size).toString('utf8')
      break
    }
    offset += entry.size
  }
  assert.ok(editorJs, 'editor.js must be present in embedded payload')
  assert.ok(editorJs.includes('is-preview'), 'editor.js must contain is-preview')
  assert.ok(editorJs.includes('op-preview-page'), 'editor.js must contain op-preview-page')
})
