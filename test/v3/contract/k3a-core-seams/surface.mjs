/**
 * What the K3a cases read: core's constants (imported at runtime only), the connector's published
 * values (tests are not packages, so they may import the connector), DSH's credentials library of
 * one SDK (imported read only, never booted), core's guarded rows (read as text, the way the K3 and
 * F-GUARDS suites do), and a few declaration lookups the K3 reader does not cover (`Pick<…>`).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FOLDER } from '../k3-host-services/constants.mjs'
import { contracts, elementType, needDeclarations } from '../k3-host-services/contracts.mjs'
import { folderFiles, model, specifiers } from '../k3-host-services/declarations.mjs'
import { SDK } from '../package-boundaries/constants.mjs'
import { CREDENTIALS, DSH_SIDE, FILE, HOSTED, TYPES, UI } from './constants.mjs'

const importFile = (file) => import(pathToFileURL(file).href)

export const core = () => contracts(FOLDER.coreContracts)
export const coreConstants = () => importFile(FILE.coreConstants)
/** The connector's published MCP surface: mcp-schema plus tools/constants.js. */
export async function connector() {
  const [schema, tools] = await Promise.all([importFile(FILE.connectorSchema), importFile(FILE.connectorTools)])
  return { ...schema, ...tools }
}

/** A specifier names a DSH-side package: equal to one of its names or under it. */
export const isDshSide = (specifier) => DSH_SIDE.names.some((n) => specifier === n || specifier.startsWith(n + '/'))
/** A relative specifier of `file` resolving into a DSH-side package folder. */
const resolvesIntoDshSide = (file, specifier) => {
  if (!specifier.startsWith('.')) return false
  const target = path.resolve(path.dirname(file), specifier)
  return DSH_SIDE.folders.some((dir) => target === dir || target.startsWith(dir + path.sep))
}
/** Every file of core contracts with a DSH-side reference, as `file: specifier` (code and declarations). */
export function dshSideReferences() {
  needDeclarations(core())
  return folderFiles(FOLDER.coreContracts).flatMap((f) => {
    const file = path.join(FOLDER.coreContracts, f)
    return specifiers(fs.readFileSync(file, 'utf8')).filter((s) => isDshSide(s) || resolvesIntoDshSide(file, s)).map((s) => f + ': ' + s)
  })
}

/** The SDK folder, or null when it is not installed (the case is then skipped with a reason). */
export function sdkDir(sdk) {
  const dir = path.join(SDK.versionsDir, sdk)
  return fs.existsSync(path.join(dir, CREDENTIALS.entry)) ? dir : null
}
export const sdkMissing = (sdk) => CREDENTIALS.missing + path.join(SDK.versionsDir, sdk)
export const credentials = (dir) => importFile(path.join(dir, CREDENTIALS.entry))
/** The SDK's credentials declarations, read with the K3 reader. */
export function credentialTypes(dir) {
  const typesDir = path.join(dir, CREDENTIALS.types)
  const texts = new Map(fs.readdirSync(typesDir).filter((f) => f.endsWith('.d.ts')).map((f) => [f, fs.readFileSync(path.join(typesDir, f), 'utf8')]))
  return { texts, m: model(texts) }
}

/** Core's guarded rows: bare `{id, disabled: true}` rows of cordis.patch.yml, and the K3 `GuardedRow` union. */
export function guardedRows() {
  const patch = [...fs.readFileSync(FILE.corePatch, 'utf8').matchAll(HOSTED.guardRow)].map((m) => m[1])
  const declared = core().m.leaves(HOSTED.guardedRowType).map((l) => l.literal).filter((v) => v !== undefined)
  return { patch, declared }
}

/** A literal union's values, asserting that every leaf is a literal (a `typeof …` type hides drift). */
export function literalUnion(c, type) {
  assert.ok(c.m.decls.has(type), `no declaration ${type} in ${c.dir}`)
  const leaves = c.m.leaves(type)
  assert.deepEqual(leaves.filter((l) => l.literal === undefined).map((l) => l.other), [], `${type} is not a literal union`)
  return leaves.map((l) => l.literal)
}
/** The literal value of a member typed as one string literal (`'x'` or `readonly 'x'`). */
export function literalMember(c, members, name) {
  const found = members.get(name)
  assert.ok(found, `no member ${name}; members: ${[...members.keys()].join(', ')}`)
  const leaves = c.m.leaves(found.type.replace(/^readonly\s+/, ''))
  assert.ok(leaves.length === 1 && leaves[0].literal !== undefined, `${name} is typed ${found.type}, not one literal`)
  return leaves[0].literal
}

/** Members of a type text, following `Pick<T, 'a' | 'b'>` and `Omit<…>` (and aliases to them). */
export function membersOf(c, type) {
  const t = (type ?? '').trim()
  const alias = (c.m.decls.get(t) ?? []).find((d) => d.kind === 'alias')
  const utility = TYPES.utility.exec(alias ? alias.raw.trim() : t)
  if (!utility) return c.m.members(t)
  const [, kind, base, keyText] = utility
  const keys = new Set(c.m.leaves(keyText.trim()).map((l) => l.literal))
  return new Map([...membersOf(c, base)].filter(([name]) => keys.has(name) === (kind === TYPES.pick)))
}

/** Every member name reachable from a type (members, parameters, results), with the path to it. */
export function reachableNames(c, type, depth = UI.walkDepth, at = type, seen = new Set()) {
  if (depth < 0 || seen.has(type)) return []
  seen.add(type)
  const out = []
  for (const m of membersOf(c, type).values()) {
    const where = at + '.' + m.name
    out.push({ name: m.name, where, type: m.type || m.returns })
    out.push(...signatureNames(c, m, depth, where, seen))
  }
  return out
}
/** Parameter names of a method (and of function-typed parameters, such as listeners), and the types they lead to. */
function signatureNames(c, m, depth, where, seen) {
  const out = []
  for (const p of m.params) {
    out.push({ name: p.name, where: where + '(' + p.name + ')', type: p.type })
    const fn = functionType(c, p.type)
    if (fn) out.push(...signatureNames(c, fn, depth - 1, where + '(' + p.name + ')', seen))
  }
  for (const next of [m.type, m.returns, ...m.params.map((p) => p.type)].filter(Boolean)) out.push(...reachableNames(c, elementType(next) ?? next, depth - 1, where, seen))
  return out
}
/** A function type text (directly or through an alias) as a member {params, returns}; null when it is none. */
export function functionType(c, type) {
  const t = (type ?? '').trim()
  const direct = c.m.members(`{ h: ${t} }`).get('h')
  if (direct?.method) return direct
  const alias = (c.m.decls.get(t) ?? []).find((d) => d.kind === 'alias')
  return alias ? functionType(c, alias.raw) : null
}

/** Paths (`a.b[0]`) of every object reachable from `value` that is not frozen, and of every function. */
export function unfrozen(value, at) {
  if (typeof value === 'function') return [at + ' (a function)']
  if (value === null || typeof value !== 'object') return []
  return [...(Object.isFrozen(value) ? [] : [at]), ...Object.entries(value).flatMap(([k, v]) => unfrozen(v, Array.isArray(value) ? `${at}[${k}]` : `${at}.${k}`))]
}

/** A URL's path (the metadata documents carry absolute URLs). */
export const pathOf = (url) => new URL(url).pathname
