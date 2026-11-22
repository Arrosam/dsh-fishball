/**
 * DSH's own settings-form primitives, taken unchanged from the current DSH's web frontend: the
 * `@deepseek-ai/dsh-client-ui-primitives` regions SettingsForm, SettingsValueField,
 * settingsNumberField, settingsTextField and SettingsFormModel, read from the frontend bundle's source
 * map (fishball-test-helpers/dsh-primitives `frontendAssets`). They are evaluated over the page's
 * React shim with stub class names, a plain Tag and icon, and fishball-test-helpers/react-shim's
 * snapshot store, so the page stages, validates and saves through DSH's real form model AND its real
 * form view (fishball-test-helpers/dsh-primitives' SettingsForm is a stand-in, and it has no
 * settingsNumberField). Only Button and Input are fakes (they pass their props through).
 *
 * LIMIT: only some DSH versions ship the frontend's source map (0.2.2-rc.3 and later; not 0.2.1-rc.5 or
 * 0.2.2-rc.1, whose bundles carry the same code minified). On a version without one, the newest
 * installed version that has one serves (the old suite pinned 0.2.2-rc.3's for every SDK), and
 * `primitivesVersion()` says which; the page's Cordis and schemastery are still the DSH under test.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DSH_VERSION, VERSIONS_DIR, isInstalled } from 'fishball-test-helpers/dsh'
import { frontendAssets } from 'fishball-test-helpers/dsh-primitives'
import { primitivesModule, snapshotStore } from 'fishball-test-helpers/react-shim'

/** Where the regions live in the map, and what they need from outside. */
export const PRIMITIVES = Object.freeze({
  mapSuffix: '.js.map',
  source: /ui-primitives\/lib\/index\.js$/,
  from: '//#region lib/types/settings-form/SettingsForm.js',
  to: '//#region lib/types/markdown/highlight.js',
  exports: Object.freeze(['SettingsForm', 'SettingsValueField', 'settingsNumberField', 'settingsTextField', 'SettingsFormModel']),
  deps: Object.freeze(['jsx', 'jsxs', 'useState', 'useRef', 'useEffect', 'css$29', 'css$30', 'Tag', 'IconInfoOutlineRegular', 'createSnapshotStore']),
  module: '@deepseek-ai/dsh-client-ui-primitives',
  /** The attribute every fake primitive carries, naming it. */
  attr: 'data-primitive',
})

/** The primitives' source text in one version's frontend map (the regions between PRIMITIVES.from and PRIMITIVES.to), or null. */
function sourceIn(version) {
  const dir = frontendAssets(version)
  if (!fs.existsSync(dir)) return null
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(PRIMITIVES.mapSuffix))) {
    const map = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const at = map.sources.findIndex((s) => PRIMITIVES.source.test(s))
    if (at < 0) continue
    const text = map.sourcesContent[at]
    const start = text.indexOf(PRIMITIVES.from)
    const end = text.indexOf(PRIMITIVES.to)
    assert.ok(start >= 0 && end > start, 'the primitives source of DSH ' + version + ' no longer holds the settings-form regions')
    return text.slice(start, end)
  }
  return null
}

/** Installed versions, newest first (numeric parts compared as numbers). */
const newestFirst = () => fs.readdirSync(VERSIONS_DIR).filter(isInstalled).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

let cached
/** `{version, source}`: the current DSH's primitives source, else the newest installed version's that has one. */
function primitivesSource() {
  if (cached) return cached
  for (const version of [DSH_VERSION, ...newestFirst().filter((v) => v !== DSH_VERSION)]) {
    const source = sourceIn(version)
    if (source) return (cached = { version, source })
  }
  assert.fail('no installed DSH frontend ships a source map carrying the ui-primitives source')
}
/** The DSH version whose settings-form primitives the page renders. */
export const primitivesVersion = () => primitivesSource().version

/** The primitives module the page requires: DSH's real settings-form exports, Button and Input passing their props through, any other export generic. */
export function realPrimitives(React) {
  const h = React.createElement
  const element = (type, props, key) => ({ $$rp: true, type, key: key ?? null, props: props ?? {} })
  const classNames = new Proxy({}, { get: (_t, k) => String(k) })
  const deps = {
    jsx: element, jsxs: element,
    useState: React.useState, useRef: React.useRef, useEffect: React.useEffect,
    css$29: classNames, css$30: classNames,
    Tag: ({ children, tone }) => h('span', { [PRIMITIVES.attr]: 'Tag', 'data-tone': tone }, children),
    IconInfoOutlineRegular: () => h('span', { [PRIMITIVES.attr]: 'Icon' }),
    createSnapshotStore: snapshotStore,
  }
  // eslint-disable-next-line no-new-func -- DSH's own module text, evaluated over the shim.
  const real = new Function(...PRIMITIVES.deps, primitivesSource().source + '\nreturn {' + PRIMITIVES.exports.join(',') + '}')(...PRIMITIVES.deps.map((d) => deps[d]))
  return primitivesModule(React, {
    ...real,
    Button: ({ children, ...rest }) => h('button', { type: 'button', [PRIMITIVES.attr]: 'Button', ...rest }, children),
    Input: ({ icon, ...rest }) => h('input', { [PRIMITIVES.attr]: 'Input', ...rest }),
  })
}