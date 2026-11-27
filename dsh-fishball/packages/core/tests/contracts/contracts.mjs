/**
 * The K3 contracts as the K3a cases read them (ported from test/v3/contract/k3-host-services/contracts.mjs
 * without its K3-only data-only checks): one declaration model per owned folder, and the lookups
 * the cases share (a service's members, a member's parameters, a refusal-code vocabulary, a
 * service found by the shape of its members). Black box: declaration text only (declarations.mjs).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { blankComments, declarationTexts, folderFiles, model, unwrapPromise } from './declarations.mjs'

const loaded = new Map()

/** {dir, files, texts, m} of one owned folder, read once. */
export function contracts(dir) {
  if (!loaded.has(dir)) {
    const texts = declarationTexts(dir)
    loaded.set(dir, { dir, files: folderFiles(dir), texts, m: model(texts) })
  }
  return loaded.get(dir)
}

/** The owned folder holds at least one declaration file. */
export function needDeclarations(c) {
  assert.ok(fs.existsSync(c.dir), path.relative(process.cwd(), c.dir) + ' does not exist (K3 "Owns")')
  assert.ok(c.texts.size > 0, 'no .d.ts file in ' + c.dir + '; files: ' + c.files.join(', '))
}

/** The members of a named service (found by its Cordis name), asserting it is declared. */
export function serviceMembers(c, service) {
  needDeclarations(c)
  const type = c.m.serviceType(service)
  assert.ok(type, `no declaration of the ${service} service (a Context member or a ${service[0].toUpperCase() + service.slice(1)} type)`)
  const members = c.m.members(type)
  assert.ok(members.size > 0, `${service} resolves to ${JSON.stringify(type)} with no members`)
  return members
}

/** One member, asserted present, a method when `method` is set. */
export function member(members, name, { method = true } = {}) {
  const found = members.get(name)
  assert.ok(found, `no member ${name}; members: ${[...members.keys()].join(', ')}`)
  if (method) assert.ok(found.method, `${name} is not a method: ${found.type}`)
  return found
}

/** A method's parameter list: exactly `params` long, required up to `optionalFrom`, optional from it. */
export function assertParams(found, { params, optionalFrom = params }) {
  const list = found.params.filter((p) => !p.rest)
  assert.equal(list.length, params, `${found.name} parameters: ${JSON.stringify(list.map((p) => p.name + (p.optional ? '?' : '')))}`)
  list.forEach((p, i) => assert.equal(p.optional, i >= optionalFrom, `${found.name} parameter ${i + 1} (${p.name}) optional`))
  return list
}

/** All string literals of the folder's declaration code (for vocabularies typed through a constant). */
function folderLiterals(c) {
  const out = new Set()
  for (const text of c.texts.values()) for (const m of blankComments(text).matchAll(/(['"])((?:(?!\1)[^\\\n])*)\1/g)) out.add(m[2])
  return out
}

/**
 * The literal vocabulary of a type text. A union of literals (through aliases) is read directly. A
 * vocabulary typed through a declared constant (`typeof CODES[number]`) cannot be read as text, so
 * then every literal of the folder counts: weaker, but it still fails when a value is missing.
 */
export function vocabulary(c, type) {
  const leaves = c.m.leaves(type)
  const literals = new Set(leaves.filter((l) => l.literal !== undefined).map((l) => l.literal))
  if (leaves.some((l) => l.other !== undefined && !/^(?:string|number)$/.test(l.other))) for (const v of folderLiterals(c)) literals.add(v)
  return { literals, open: leaves.some((l) => /^(?:string|number)$/.test(l.other ?? '')) }
}

/** The refusal codes of a method's result (the `code` member of its result union). */
export function resultCodes(c, found) {
  const result = c.m.members(found.returns)
  const code = result.get('code')
  assert.ok(code, `${found.name} returns no refusal \`code\`: ${found.returns}`)
  const vocab = vocabulary(c, code.type)
  assert.equal(vocab.open, false, `${found.name}'s code is an open ${code.type}, not a frozen vocabulary`)
  return vocab.literals
}

export const assertIncludes = (set, values, what) => assert.deepEqual(values.filter((v) => !set.has(v)), [], `${what} lacks these values; it has ${JSON.stringify([...set])}`)

/** The element type of an array type text (`T[]`, `readonly T[]`, `Array<T>`, `ReadonlyArray<T>`). */
export function elementType(type) {
  const t = unwrapPromise(type).replace(/^readonly\s+/, '')
  const generic = /^(?:Readonly)?Array\s*<([\s\S]*)>$/.exec(t)
  if (generic) return generic[1].trim()
  return t.endsWith('[]') ? t.slice(0, -2).trim().replace(/^\(([\s\S]*)\)$/, '$1') : null
}

/**
 * A service found by shape rather than name: the first non-method member (of any interface) whose
 * type has every member in `names`. Returns {service, members} or null.
 */
export function serviceByShape(c, test) {
  for (const list of c.m.decls.values()) for (const d of list) {
    if (d.kind !== 'interface') continue
    for (const candidate of d.members) {
      if (candidate.method) continue
      const members = c.m.members(candidate.type)
      if (test(members)) return { service: candidate.name, members }
    }
  }
  return null
}
