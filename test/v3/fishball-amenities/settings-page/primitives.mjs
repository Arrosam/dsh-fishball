/**
 * DSH's own settings-form primitives, taken unchanged from the installed web frontend: the
 * `@deepseek-ai/dsh-client-ui-primitives` regions SettingsForm, SettingsValueField,
 * settingsNumberField, settingsTextField and SettingsFormModel, read from the frontend bundle's
 * source map (only the 0.2.2-rc.3 install ships one; the 0.2.1-rc.5 and 0.2.2-rc.1 bundles carry
 * the same code minified). They are evaluated over the React shim, with stub class names, a plain
 * Tag and icon, and a minimal snapshot store. So the page under test stages, validates and saves
 * through DSH's real form model; only Button and Input are fakes (they pass their props through).
 *
 * LIMIT: one copy (0.2.2-rc.3's) serves every SDK row; the page code is browser-only and the
 * SDK under test supplies cordis and schemastery.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/** Where the frontend bundle and its map live, and which regions are read. */
export const PRIMITIVES = Object.freeze({
  sdk: '0.2.2-rc.3',
  assets: path.join('node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets'),
  mapSuffix: '.js.map',
  source: /ui-primitives\/lib\/index\.js$/,
  from: '//#region lib/types/settings-form/SettingsForm.js',
  to: '//#region lib/types/markdown/highlight.js',
  exports: Object.freeze(['SettingsForm', 'SettingsValueField', 'settingsNumberField', 'settingsTextField', 'SettingsFormModel']),
  deps: Object.freeze(['jsx', 'jsxs', 'useState', 'useRef', 'useEffect', 'css$29', 'css$30', 'Tag', 'IconInfoOutlineRegular', 'createSnapshotStore']),
  module: '@deepseek-ai/dsh-client-ui-primitives',
})

let cachedSource
/** The primitives' source text (the regions between PRIMITIVES.from and PRIMITIVES.to). */
export function primitivesSource(versionsDir) {
  if (cachedSource) return cachedSource
  const dir = path.join(versionsDir, PRIMITIVES.sdk, PRIMITIVES.assets)
  assert.ok(fs.existsSync(dir), 'no DSH ' + PRIMITIVES.sdk + ' web frontend at ' + dir)
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(PRIMITIVES.mapSuffix))) {
    const map = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const at = map.sources.findIndex((s) => PRIMITIVES.source.test(s))
    if (at < 0) continue
    const text = map.sourcesContent[at]
    const start = text.indexOf(PRIMITIVES.from)
    const end = text.indexOf(PRIMITIVES.to)
    assert.ok(start >= 0 && end > start, 'the primitives source no longer holds the settings-form regions')
    cachedSource = text.slice(start, end)
    return cachedSource
  }
  assert.fail('no source map under ' + dir + ' carries the ui-primitives source')
}

/** A minimal snapshot store: the SettingsFormModel.bind contract (getSnapshot, subscribe, set, update). */
function createSnapshotStore(init) {
  let state = init
  const listeners = new Set()
  const notify = () => { for (const l of [...listeners]) l() }
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { state = next; notify() },
    update: (mutate) => { const draft = structuredClone(state); mutate(draft); state = draft; notify() },
  }
}

/** The attribute every fake primitive carries, naming it. */
export const PRIMITIVE_ATTR = 'data-primitive'

/**
 * The primitives module the page requires: DSH's real settings-form exports, Button and Input
 * passing their props to a host button / input, and any other export a plain element.
 */
export function primitivesModule(React, versionsDir) {
  const h = React.createElement
  const element = (type, props, key) => ({ $$rp: true, type, key: key ?? null, props: props ?? {} })
  const classNames = new Proxy({}, { get: (_t, k) => String(k) })
  const deps = {
    jsx: element, jsxs: element,
    useState: React.useState, useRef: React.useRef, useEffect: React.useEffect,
    css$29: classNames, css$30: classNames,
    Tag: ({ children, tone }) => h('span', { [PRIMITIVE_ATTR]: 'Tag', 'data-tone': tone }, children),
    IconInfoOutlineRegular: () => h('span', { [PRIMITIVE_ATTR]: 'Icon' }),
    createSnapshotStore,
  }
  // eslint-disable-next-line no-new-func -- DSH's own module text, evaluated over the shim.
  const real = new Function(...PRIMITIVES.deps, primitivesSource(versionsDir) + '\nreturn {' + PRIMITIVES.exports.join(',') + '}')(...PRIMITIVES.deps.map((d) => deps[d]))
  const known = {
    ...real,
    Button: ({ children, ...rest }) => h('button', { type: 'button', [PRIMITIVE_ATTR]: 'Button', ...rest }, children),
    Input: ({ icon, ...rest }) => h('input', { [PRIMITIVE_ATTR]: 'Input', ...rest }),
  }
  const cache = new Map()
  const proxy = new Proxy({}, {
    get(_t, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return proxy
      if (name in known) return known[name]
      if (!cache.has(name)) cache.set(name, ({ children, ...rest }) => h('div', { [PRIMITIVE_ATTR]: name, ...rest }, children))
      return cache.get(name)
    },
  })
  return proxy
}
