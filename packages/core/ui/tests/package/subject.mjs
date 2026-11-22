/**
 * What fishball-ui's package rows read, and how. Black box: the package's manifests and the
 * specifiers its shipped files name (a static scan), its browser entry and chunks run unread in a
 * node:vm page (fishball-test-helpers/browser-sandbox) whose module loader is DSH's face (`require`,
 * `require.async('./<chunk>')`, `require.asset`), applied by the current DSH's own Cordis.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBrowserSandbox } from 'fishball-test-helpers/browser-sandbox'
import { importDsh } from 'fishball-test-helpers/dsh'
import { REPO } from 'fishball-test-helpers/packages'
import { createReactShim, fakePrimitives, jsxRuntime, reactDomModules } from 'fishball-test-helpers/react-shim'
import { settle } from 'fishball-test-helpers/wait'
import { CLIENT, CORDIS, FIXTURE, MOVED, UI_PACKAGE } from './constants.mjs'

const read = (file) => JSON.parse(fs.readFileSync(file, MOVED.encoding))
/** A manifest inside fishball-ui's folder (`''` = its own). */
export const manifestOf = (folder = '') => read(path.join(UI_PACKAGE.dir, folder, UI_PACKAGE.manifest))
/** `[{field, name}]` of every package a manifest names in `fields`. */
export const manifestNames = (manifest, fields = UI_PACKAGE.depFields) => fields.flatMap((field) => {
  const value = manifest[field]
  return (Array.isArray(value) ? value : Object.keys(value ?? {})).map((name) => ({ field, name }))
})
const bare = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])

/** Every shipped JS file of fishball-ui (its manifest's `files`, folders expanded, nested packages' too), repo-absolute. */
export function shippedFiles() {
  const out = []
  const add = (abs) => {
    if (fs.statSync(abs).isDirectory()) { for (const name of fs.readdirSync(abs)) add(path.join(abs, name)); return }
    if (/\.(m?js|cjs)$/.test(abs)) out.push(abs)
  }
  for (const entry of manifestOf().files ?? []) { const abs = path.join(UI_PACKAGE.dir, entry); if (fs.existsSync(abs)) add(abs) }
  return [...new Set(out)].sort()
}
/** import / export-from / import() / require() / require.async() specifiers of one file (string literals). */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire(?:\.async|\.resolve)?\s*\(\s*)(['"`])([^'"`\n]+)\1/g
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
/** Every reference a shipped file makes: `{file, specifier, target (package name or null), outside (a path leaving the package)}`. */
export function references() {
  return shippedFiles().flatMap((file) => [...stripComments(fs.readFileSync(file, MOVED.encoding)).matchAll(SPECIFIER)].map((m) => {
    const specifier = m[2]
    const local = specifier.startsWith('.') || specifier.startsWith('/')
    const resolved = local ? path.resolve(path.dirname(file), specifier) : null
    return {
      file: path.relative(UI_PACKAGE.dir, file), specifier,
      target: local ? null : bare(specifier),
      outside: local && !(resolved === UI_PACKAGE.dir || resolved.startsWith(UI_PACKAGE.dir + path.sep)),
    }
  }))
}
export const describeRef = (r) => `${r.file}: ${JSON.stringify(r.specifier)}`

/** A repository file as it was at `ref` (git show), written into a scratch folder removed after the case. */
export function baseFile(t, ref, relative) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), MOVED.tempPrefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, path.basename(relative))
  fs.writeFileSync(file, execFileSync('git', ['show', `${ref}:${relative}`], { cwd: REPO, encoding: MOVED.encoding }))
  return file
}

/** The page modules a chunk may require: React over the shim, react-dom, the JSX runtime, plain primitives. */
export function platform() {
  const { React } = createReactShim({ stale() {} })
  return { react: React, ...reactDomModules(), 'react/jsx-runtime': jsxRuntime(React), '@deepseek-ai/dsh-client-ui-primitives': fakePrimitives(React) }
}
/** A page whose `<head>` keeps the `<style>` elements appended to it (fishball-test-helpers/fake-dom). */
const newPage = () => createBrowserSandbox({ lang: FIXTURE.lang, baseURI: FIXTURE.baseURI, fetch: async () => new Response('', { status: FIXTURE.notFound }) })
/** The `<style>` elements of a page's head. */
export const stylesOf = (page) => page.document.head.querySelectorAll(CLIENT.styleTag)

/** loadClient's word for a chunk whose load rejects. */
export const CHUNK_FAILS = 'fail'

/**
 * Run fishball-ui's `client.js` unread and materialize its module. `chunks` decides what a chunk load
 * gives: absent runs the real chunk file, CHUNK_FAILS rejects, a function `(file) => exports` stands
 * in for it. Returns the registrations, the module's exports, every chunk load and require.
 */
export function loadClient({ chunks = {}, modules = platform() } = {}) {
  const page = newPage()
  page.runFile(path.join(UI_PACKAGE.dir, CLIENT.entry))
  const entry = page.registrations.find((r) => r.chunk === undefined)
  const loads = []
  const required = []
  const requireFor = () => {
    const require = (spec) => {
      required.push(spec)
      if (spec in modules) return modules[spec]
      throw new Error('fbtest page: unexpected require ' + JSON.stringify(spec))
    }
    require.async = async (spec) => {
      loads.push(spec)
      const file = spec.slice(CLIENT.localPrefix.length)
      const how = chunks[file]
      if (how === CHUNK_FAILS) throw new Error(FIXTURE.chunkFault)
      if (typeof how === 'function') return how(file)
      page.runFile(path.join(UI_PACKAGE.dir, file))
      const reg = page.registrations.find((r) => r.chunk === file)
      if (!reg) throw new Error('the chunk ' + file + ' registered nothing')
      return reg.factory(requireFor())
    }
    require.asset = (reference) => reference
    return require
  }
  const exports = entry ? entry.factory(requireFor()) : undefined
  return { page, registrations: page.registrations, entry, exports, loads, required }
}

/** Run one chunk file alone and materialize it (its registration and exports). */
export function loadChunk(file, modules = platform()) {
  const page = newPage()
  page.runFile(path.join(UI_PACKAGE.dir, file))
  const required = []
  const require = Object.assign((spec) => { required.push(spec); if (!(spec in modules)) throw new Error('unexpected require ' + spec); return modules[spec] }, { async: async () => ({}), asset: (r) => r })
  const exports = page.registrations.length === 1 ? page.registrations[0].factory(require) : undefined
  return { registrations: page.registrations, exports, required }
}

/** Apply a client module's plugin in a fresh Cordis root of the current DSH; records every fiber that fails. */
export async function applyIn(t, exports) {
  const { Context } = await importDsh(CORDIS.name)
  const root = new Context()
  const failed = []
  root.on(CORDIS.statusEvent, (fiber) => { if (fiber.state === CORDIS.failed) failed.push(fiber.runtime?.name ?? fiber.name) })
  const plugin = exports?.default ?? exports
  assert.equal(typeof plugin?.apply, 'function', 'the client exports no client plugin')
  const fiber = root.plugin(plugin)
  t.after(async () => { await fiber.dispose?.() })
  await settle(FIXTURE.settleRounds)
  return { failed }
}

/** Apply fishball-ui's client with every part a stand-in that records the kit it got and that it started. */
export async function startClient(t, failing = {}) {
  const started = []
  const kits = []
  const standIn = (file, exportName) => () => ({ [exportName]: (kit) => { kits.push({ file, kit }); return { name: FIXTURE.partName(file), apply() { started.push(file) } } } })
  const chunks = Object.fromEntries(Object.values(CLIENT.parts).map((p) => [p.file, failing[p.file] === CHUNK_FAILS ? CHUNK_FAILS : standIn(p.file, p.export)]))
  const client = loadClient({ chunks })
  const { failed } = await applyIn(t, client.exports)
  return { ...client, started, kits, failed }
}
