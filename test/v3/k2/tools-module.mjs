/**
 * Black-box access to the frozen `fishball-connector/tools` module for the K2 cases.
 *
 * The module is reached through its package specifier (the connector's export map, linked at the
 * repository root as the suite runner links it), then imported bound to one installed SDK with the
 * private-skills harness, so a "[SDK x]" result runs on that SDK. Its exported data is read by
 * meaning (a value at a path whose name says what it is), because the export names are K2's choice
 * and the cases fix only the values (R-EXT-18, design §13.2).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { INSTANCE, REPO } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SKILL_SDK } from '../../private-skills/support/constants.mjs'
import { API, FIXTURE, MCP_CORE, REGISTER_CODE, TOOLS_MODULE, WALK_DEPTH } from './constants.mjs'

const loaded = new Map()

/** The file `fishball-connector/tools` resolves to (throws when the export map's target is missing). */
export function resolveToolsFile() {
  linkContractForSourceRun()
  return fileURLToPath(import.meta.resolve(TOOLS_MODULE.specifier))
}

/** The module, imported once per SDK. */
export function toolsModule(sdk) {
  if (!loaded.has(sdk)) loaded.set(sdk, importInstance(sdk, path.relative(INSTANCE.dir, resolveToolsFile())))
  return loaded.get(sdk)
}

/** One SDK's MCP core (the spec-shape oracle; 2.2.0 on both hosts). */
export const mcpCore = (sdk) => import(pathToFileURL(path.join(SKILL_SDK.versionsDir, sdk, SKILL_SDK.nodeModules, MCP_CORE.pkg, MCP_CORE.entry)).href)

const isPlain = (v) => v !== null && typeof v === 'object' && !(v instanceof RegExp)

/** Every non-object leaf of the exported data as {path, value}; functions and classes are not walked. */
export function leaves(mod) {
  const out = []
  const seen = new Set()
  const walk = (value, at, depth) => {
    if (isPlain(value)) {
      if (seen.has(value) || depth > WALK_DEPTH) return
      seen.add(value)
      for (const [k, v] of Object.entries(value)) walk(v, [...at, k], depth + 1)
    } else if (typeof value !== 'function') out.push({ path: at.join('.'), value })
  }
  for (const [k, v] of Object.entries(mod)) walk(v, [k], 0)
  return out
}
export const exportedStrings = (mod) => new Set(leaves(mod).filter((l) => typeof l.value === 'string').map((l) => l.value))
/** Numbers exported at a path that matches `meaning`. */
export const numbersAt = (mod, meaning) => leaves(mod).filter((l) => typeof l.value === 'number' && meaning.test(l.path)).map((l) => l.value)
/** Exported arrays (any depth) whose items are all strings. */
export function stringLists(mod) {
  const out = []
  const seen = new Set()
  const walk = (value, depth) => {
    if (!isPlain(value) || seen.has(value) || depth > WALK_DEPTH) return
    seen.add(value)
    if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) out.push(value)
    for (const v of Object.values(value)) walk(v, depth + 1)
  }
  for (const v of Object.values(mod)) walk(v, 0)
  return out
}

/** A definition of EXT-EP-01 row 1's class, with fields replaced; a field set to undefined is removed. */
export function definition(overrides = {}) {
  const d = { ...FIXTURE.valid, execute: async () => ({ ok: true, data: {} }), ...overrides }
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete d[k]
  return d
}

const snapshot = (value) => JSON.stringify(value, (_k, v) => (typeof v === 'function' ? String(v) : v))

/**
 * Runs `defineTool(def)`. Returns {code: null, value} when it accepts, {code} when it refuses with a
 * `ToolContributionError`. Any other throw fails the case. Common refusal oracle (README): a refusal
 * changes nothing, so the definition is checked to be unchanged after the call.
 */
export function define(mod, def) {
  const before = snapshot(def)
  try {
    const value = mod[API.define](def)
    return { code: null, value }
  } catch (error) {
    if (!(error instanceof mod[API.error])) throw new Error('defineTool threw something other than ' + API.error + ': ' + error?.name)
    if (snapshot(def) !== before) throw new Error('a refused definition was changed by defineTool')
    return { code: error.code }
  }
}
export const accepts = (mod, def) => define(mod, def).code === null
export const isInvalid = (mod, def) => define(mod, def).code === REGISTER_CODE.invalid

/**
 * The largest value `limits[key]` may declare: doubling, then halving, between the last accepted
 * and the first refused value. Returns null when even 1 is refused, Infinity when no refusal is
 * found below Number.MAX_SAFE_INTEGER (no ceiling).
 */
export function largestAccepted(mod, key) {
  const ok = (v) => accepts(mod, definition({ limits: { [key]: v } }))
  if (!ok(1)) return null
  let lo = 1
  while (ok(lo * 2)) {
    lo *= 2
    if (lo * 2 > Number.MAX_SAFE_INTEGER) return Infinity
  }
  let hi = lo * 2
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** The text of every source or declaration file in the module's folder, by repo-relative path. */
export function folderTexts() {
  const dir = path.join(REPO, TOOLS_MODULE.folder)
  if (!fs.existsSync(dir)) return new Map()
  return new Map(fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => TOOLS_MODULE.textFile.test(f))
    .map((f) => [path.join(TOOLS_MODULE.folder, f), fs.readFileSync(path.join(dir, f), 'utf8')]))
}
