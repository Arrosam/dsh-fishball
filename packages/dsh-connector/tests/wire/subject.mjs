/**
 * The one place that binds the C-WIRE cases to the dev surface. The cases otherwise see the
 * connector only as DSH does: a bundle the worker installs (worker.mjs), its root services, its
 * routes on DSH's listener and its approval listener. The relayed surface (dev session, 2026-11-16):
 *
 *   packages/dsh-connector/index.js           the plugin entry: `name`, `inject`, `Config`, `apply`
 *   packages/dsh-connector/package.json       engines.dsh, dsh.client (platform web, entry client.js)
 *   src/settings-page/constants.js            SETTINGS_PAGE.route.{create, notice, state}
 *   src/ui/constants.js                       UI_ROUTE (routes under /api/dsh-connector/ui/*)
 *   src/revocation/index.js                   REVOCATION_NOTE.text (the system note, Q4)
 *   mcp-schema                                READ_ROLE (K1), read by constants.mjs through K1
 *
 * Only exported data is read from the modules (never their code), and only here; the plugin entry
 * is imported for its exported names and Config, never applied.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { HARNESS, SKILL_SDK } from '../../../../test/private-skills/support/constants.mjs'
import { INSTANCE } from '../../../../test/support/constants.mjs'
import { linkContractForSourceRun } from '../../../../test/support/contract-link.mjs'
import { importInstance } from '../../../../test/private-skills/support/sdk.mjs'
import { resolveRuntimePackages } from '../pairs/subject.mjs'
import { FILES, PACKAGES } from './constants.mjs'

/**
 * The plugin entry imports DSH-shipped runtime peers outside `@deepseek-ai/` beyond the pairs
 * suite's (`yaml`, a connector peerDependency): resolved from the tagged SDK, as that hook does.
 */
const ENTRY_PEERS = Object.freeze(['yaml'])
let hooked = false
function resolveEntryPeers() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const version = context.parentURL === undefined ? null : new URL(context.parentURL).searchParams.get(HARNESS.versionTag)
      if (version === null || !ENTRY_PEERS.includes(specifier)) return nextResolve(specifier, context)
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(SKILL_SDK.versionsDir, version, SKILL_SDK.packageFile)).href })
    },
  })
}

const bound = (sdk, file) => {
  assert.ok(fs.existsSync(file), `${file} does not exist`)
  linkContractForSourceRun()
  resolveRuntimePackages()
  resolveEntryPeers()
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/** The plugin entry bound to `sdk`: `{name, inject, Config, apply}`. */
export async function pluginEntry(sdk) {
  const mod = await bound(sdk, path.join(PACKAGES.connector.dir, 'index.js'))
  return mod.default && mod.apply === undefined ? mod.default : mod
}

/**
 * `Config(input)` read as plain data. Volatile fields (DSH's live settings) resolve to a wrapper
 * whose `get()` reads the current value; the cases compare values, so every wrapper is read.
 */
export async function resolveConfig(sdk, input) {
  const { Config } = await pluginEntry(sdk)
  const read = (v) => {
    if (v && typeof v === 'object' && typeof v.get === 'function') return read(v.get())
    if (Array.isArray(v)) return v.map(read)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, read(x)]))
    return v
  }
  return read(Config(input))
}

/** SETTINGS_PAGE (its routes) as the settings page module exports it. */
export async function settingsPageRoutes() {
  const mod = await import(pathToFileURL(FILES.settingsPageConstants).href)
  assert.ok(mod.SETTINGS_PAGE?.route, 'src/settings-page/constants.js exports no SETTINGS_PAGE.route')
  return mod.SETTINGS_PAGE.route
}

/** UI_ROUTE as the UI backend exports it. */
export async function uiRoutes() {
  const mod = await import(pathToFileURL(FILES.uiConstants).href)
  assert.ok(mod.UI_ROUTE, 'src/ui/constants.js exports no UI_ROUTE')
  return mod.UI_ROUTE
}

/** REVOCATION_NOTE.text (src/revocation/index.js), bound to `sdk`. */
export async function revocationNoteText(sdk) {
  const mod = await bound(sdk, FILES.revocation)
  assert.equal(typeof mod.REVOCATION_NOTE?.text, 'string', 'src/revocation/index.js exports no REVOCATION_NOTE.text')
  return mod.REVOCATION_NOTE.text
}
