/**
 * Black-box access to the frozen `dsh-connector/mcp-schema` module for the K1 cases.
 *
 * The module is reached through its package specifier (the connector's export map, linked at the
 * repository root as the suite runner links it), then imported bound to one installed SDK with the
 * private-skills harness, so a "[SDK x]" result runs on that SDK. The export names are K1's choice
 * and the cases fix only values (README, flag K), so frozen values are found by meaning: a value at
 * a path whose name says what it is. The SDK's own MCP packages (2.2.0 on both hosts) are the
 * oracle for spec-defined shapes: tool definitions, OAuth error codes, JSON Schema validation.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { INSTANCE, REPO } from '../../../support/constants.mjs'
import { linkContractForSourceRun } from '../../../support/contract-link.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { SKILL_SDK } from '../../../private-skills/support/constants.mjs'
import { MCP, SCHEMA_MODULE, TOOLS_SPECIFIER, UNITS, WALK_DEPTH } from './constants.mjs'

const loaded = new Map()
const onSdk = (sdk, specifier) => {
  const key = sdk + ' ' + specifier
  if (!loaded.has(key)) {
    linkContractForSourceRun()
    // import.meta.resolve does not check that the export target exists; the import below does.
    const file = fileURLToPath(import.meta.resolve(specifier))
    loaded.set(key, importInstance(sdk, path.relative(INSTANCE.dir, file)))
  }
  return loaded.get(key)
}
/** The frozen module, imported once per SDK. */
export const schemaModule = (sdk) => onSdk(sdk, SCHEMA_MODULE.specifier)
/** K2's frozen module, for the names K1 shares with it. */
export const toolsModule = (sdk) => onSdk(sdk, TOOLS_SPECIFIER)

const sdkFile = (sdk, ...parts) => path.join(SKILL_SDK.versionsDir, sdk, SKILL_SDK.nodeModules, ...parts)
const sdkImport = (sdk, ...parts) => import(pathToFileURL(sdkFile(sdk, ...parts)).href)
/** One SDK's MCP client, core and ajv validator (2.2.0 on both hosts). */
export const mcpClient = (sdk) => sdkImport(sdk, MCP.client, MCP.clientEntry)
export const mcpCore = (sdk) => sdkImport(sdk, MCP.core, MCP.coreEntry)
export const mcpClientVersion = (sdk) => JSON.parse(fs.readFileSync(sdkFile(sdk, MCP.client, MCP.manifest), 'utf8')).version
/** A JSON Schema validator as this SDK's client uses it for tool schemas (its default engine). */
export async function validatorFor(sdk) {
  const { AjvJsonSchemaValidator } = await sdkImport(sdk, MCP.client, MCP.ajvEntry)
  const provider = new AjvJsonSchemaValidator()
  return (schema) => {
    const check = provider.getValidator(schema)
    return (value) => check(value).valid
  }
}

const isPlain = (v) => v !== null && typeof v === 'object' && !(v instanceof RegExp)

/**
 * Walks exported data depth-first: `visit(value, keys)` for every value. Functions and classes are
 * not entered; each object is visited once (frozen constants share sub-objects).
 */
export function walk(mod, visit) {
  const seen = new Set()
  const step = (value, keys, depth) => {
    visit(value, keys)
    if (!isPlain(value) || seen.has(value) || depth > WALK_DEPTH) return
    seen.add(value)
    for (const [k, v] of Object.entries(value)) step(v, [...keys, k], depth + 1)
  }
  for (const [k, v] of Object.entries(mod)) step(v, [k], 0)
}
/** Every non-object, non-function leaf as {path, key, value}. */
export function leaves(mod) {
  const out = []
  walk(mod, (value, keys) => {
    if (!isPlain(value) && typeof value !== 'function') out.push({ path: keys.join('.'), key: keys.at(-1), value })
  })
  return out
}
export const exportedStrings = (mod) => new Set(leaves(mod).filter((l) => typeof l.value === 'string').map((l) => l.value))
/** Strings and object keys of the exported data: an error map keyed by its codes freezes them too. */
export function exportedStringsAndKeys(mod) {
  const out = exportedStrings(mod)
  walk(mod, (value) => { if (isPlain(value) && !Array.isArray(value)) for (const k of Object.keys(value)) out.add(k) })
  return out
}
export const exportedRegExps = (mod) => leaves(mod).filter((l) => l.value instanceof RegExp).map((l) => l.value)
/** Numbers at a path that satisfies `meaning` (a predicate on the dotted path). */
export const numbersAt = (mod, meaning) => leaves(mod).filter((l) => typeof l.value === 'number' && meaning(l.path))
/** Durations, in seconds, at a path that satisfies `meaning`; the unit comes from the value's own key. */
export function secondsAt(mod, meaning) {
  return numbersAt(mod, meaning).flatMap((l) => {
    const unit = UNITS.find(([re]) => re.test(l.key))
    return unit ? [{ ...l, seconds: l.value * unit[1] }] : []
  })
}
/** Exported arrays (any depth) whose items are all strings. */
export function stringLists(mod) {
  const out = []
  walk(mod, (value) => { if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) out.push(value) })
  return out
}
/** An exported string list equal to `expected` as a set. */
export const hasListEqualTo = (mod, expected) => stringLists(mod).some((list) => list.length === new Set(list).size && list.length === expected.length && expected.every((v) => list.includes(v)))

/** The HTTP status a frozen error mapping gives `code`: numbers 100–599 at a path naming the code. */
const fold = (s) => s.toLowerCase().replace(/[_-]/g, '')
export const statusesFor = (mod, code) => leaves(mod)
  .filter((l) => typeof l.value === 'number' && l.value >= 100 && l.value <= 599 && l.path.split('.').some((k) => fold(k) === fold(code)))
  .map((l) => l.value)

/**
 * Tool definitions: exported objects with an object `inputSchema`, named by their `name` or by the
 * key they are stored under. Returns a Map name → definition (the first one found per name).
 */
export function toolDefinitions(mod) {
  const out = new Map()
  walk(mod, (value, keys) => {
    if (!isPlain(value) || Array.isArray(value) || !isPlain(value.inputSchema)) return
    const name = typeof value.name === 'string' ? value.name : keys.at(-1)
    if (!out.has(name)) out.set(name, value)
  })
  return out
}
/** Property names a schema's object root can carry, across its `oneOf` / `anyOf` / `allOf` branches. */
export function rootPropertyNames(schema) {
  if (!isPlain(schema)) return new Set()
  const names = new Set(Object.keys(isPlain(schema.properties) ? schema.properties : {}))
  for (const k of ['oneOf', 'anyOf', 'allOf']) for (const branch of schema[k] ?? []) for (const n of rootPropertyNames(branch)) names.add(n)
  return names
}
/** Every property name declared anywhere in a schema (nested objects and array items included). */
export function allPropertyNames(schema, out = new Set()) {
  if (Array.isArray(schema)) for (const s of schema) allPropertyNames(s, out)
  else if (isPlain(schema)) {
    if (isPlain(schema.properties)) for (const n of Object.keys(schema.properties)) out.add(n)
    for (const v of Object.values(schema)) allPropertyNames(v, out)
  }
  return out
}

/** The text of every source, declaration and freeze-record file in the module's folder. */
export function folderTexts(only = SCHEMA_MODULE.textFile) {
  const dir = path.join(REPO, SCHEMA_MODULE.folder)
  if (!fs.existsSync(dir)) return new Map()
  return new Map(fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => only.test(f))
    .map((f) => [path.join(SCHEMA_MODULE.folder, f), fs.readFileSync(path.join(dir, f), 'utf8')]))
}
export const allText = (only) => [...folderTexts(only).values()].join('\n')
export const readManifest = (relative) => JSON.parse(fs.readFileSync(path.join(REPO, relative), 'utf8'))
