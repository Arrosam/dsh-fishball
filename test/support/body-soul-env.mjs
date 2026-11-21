/**
 * Shared loading and scratch-space helpers for the body-soul black-box files (test/body-soul-*.test.mjs).
 *
 * - Product modules are imported from the worktree's packages; `@deepseek-ai/*` resolves to
 *   FBTEST_DSH_RUNTIME through the existing resolver (provider-sync-sdk.mjs). The instance's
 *   settings migration also imports `zod`, a package DSH ships in the same runtime but which is not
 *   under `@deepseek-ai/`, so one extra resolve hook maps that single name to the same runtime.
 * - Scratch directories are throwaway temp dirs (os.tmpdir()), removed after each test.
 * - The connector's `record.*` words live inside the closure of the moved connector UI
 *   (packages/dsh-connector-ui/src/client/client.shell.js, the page dictionaries' part since U-SHELL's split), so they are read from the source text.
 */
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { EMBED_UI, REPO } from './constants.mjs'
import { FIXTURE } from './provider-sync-official.mjs'
import { resolveFromRuntime, resolveOfficialSDK } from './provider-sync-sdk.mjs'

export const BODY_SOUL = Object.freeze({
  instance: path.join(REPO, 'packages', 'dsh-instance'),
  connector: path.join(REPO, 'packages', 'dsh-connector'),
  /** V3 R-CORE: the slim child, slim ui, persona and fishball-ui page packages moved here. */
  core: path.join(REPO, 'packages', 'core'),
  /** V3 F-UI: the page, the Recommended tab and its data moved, unchanged, from core into fishball-ui. */
  ui: path.join(REPO, 'packages', 'core', 'ui'),
  tempPrefix: 'fbtest-body-soul-',
  /** Runtime packages outside `@deepseek-ai/` that instance modules import. */
  runtimePackages: Object.freeze(['zod']),
})

let hooked = false
function installHooks() {
  if (hooked) return
  hooked = true
  resolveOfficialSDK()
  resolveFromRuntime((specifier) => BODY_SOUL.runtimePackages.includes(specifier))
}

/** Import a module of packages/dsh-instance by its path relative to that package. */
export async function loadInstance(relative) {
  installHooks()
  return import(pathToFileURL(path.join(BODY_SOUL.instance, relative)).href)
}

/** Import a module of packages/core by its path relative to that package. */
export async function loadCore(relative) {
  installHooks()
  return import(pathToFileURL(path.join(BODY_SOUL.core, relative)).href)
}

/** Import a module of packages/fishball-ui by its path relative to that package. */
export async function loadUi(relative) {
  installHooks()
  return import(pathToFileURL(path.join(BODY_SOUL.ui, relative)).href)
}

/** Import a module of packages/dsh-connector by its path relative to that package. */
export async function loadConnector(relative) {
  installHooks()
  return import(pathToFileURL(path.join(BODY_SOUL.connector, relative)).href)
}

/** The installed DSH package anchor of the selected runtime (a profile context needs one). */
export function runtimeAnchor() {
  return createRequire(path.join(FIXTURE.runtime, '../package.json')).resolve('@deepseek-ai/dsh/package.json')
}

/** A throwaway directory under the OS temp dir, removed when the test ends. */
export async function tempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), BODY_SOUL.tempPrefix))
  t.after(async () => {
    // Guard the one recursive delete: only a directory this helper created under the OS temp dir.
    if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith(BODY_SOUL.tempPrefix)) throw new Error('unexpected temp dir ' + dir)
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

/**
 * The page dictionary words of one browser bundle file: its `const en = {`
 * and `const zh = {` objects, keyed exactly as `t()` looks them up. Only single-quoted
 * `'key': '…'` pairs are read. `keep` narrows the result for a feature's own prefix.
 */
function clientWords(file, keep) {
  const source = fs.readFileSync(file, 'utf8')
  const enAt = source.indexOf('const en = {')
  const zhAt = source.indexOf('const zh = {')
  if (enAt < 0 || zhAt < 0 || zhAt < enAt) throw new Error('dictionaries not found in ' + file)
  const zhEnd = source.indexOf('\n    }\n', zhAt)
  const pairs = (text) => {
    const words = {}
    for (const match of text.matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) words[match[1]] = match[2].replace(/\\(.)/g, '$1')
    return words
  }
  const narrow = (words) => (keep === undefined ? words : Object.fromEntries(Object.entries(words).filter(([key]) => keep(key))))
  return { en: narrow(pairs(source.slice(enAt, zhAt))), zh: narrow(pairs(source.slice(zhAt, zhEnd < 0 ? undefined : zhEnd))) }
}

/** The connector's `record.*` words per language (the same observation point as its page). */
export function connectorRecordWords() {
  return clientWords(EMBED_UI.connectorClient, (key) => key.startsWith('record.'))
}

/**
 * The instance card's words per language (sync reasons, state and failure explanations). Since
 * R-EMBED the V2 card is two files: the card chunk in embed-UI and the status line it shows, which
 * stays the instance's (src/child-settings/client.status.js); their words are read together.
 */
export function instanceClientWords() {
  const parts = [EMBED_UI.instanceCard, EMBED_UI.statusLine].map((file) => clientWords(file))
  return { en: Object.assign({}, ...parts.map((p) => p.en)), zh: Object.assign({}, ...parts.map((p) => p.zh)) }
}

/** CJK ideographs: the observable mark of the Chinese variant. */
export const CJK = /[\u3400-\u9fff]/
