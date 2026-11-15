/**
 * Black-box readers for the K1d cases. Everything is read through the frozen contract itself:
 * - K1's module, per SDK, through the K1 harness (`../k1/schema-module.mjs`);
 * - K1's `index.d.ts` and K3's `host-services/*.d.ts` as text, through K3's declaration reader
 *   (`../k3/declarations.mjs`, `../k3/contracts.mjs`);
 * - the two READMEs as Markdown blocks;
 * - core's vendored copy, regenerated into a temp folder with core's own generator (its usage line:
 *   `node scripts/vendor-mcp-schema.mjs [coreDir]`), and imported in plain Node as core does.
 * No implementation file under packages/*\/src is read.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, getHashes } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { declarationText } from '../k1/cases.mjs'
import { exportedRegExps } from '../k1/schema-module.mjs'
import { contracts } from '../k3/contracts.mjs'
import { blankComments, folderFiles, model } from '../k3/declarations.mjs'
import { DERIVED_ID, FILES, ID_ORACLE, MD_BLOCK_START } from './constants.mjs'

// ------------------------------------------------------------------------------------------------
// Declarations

let k1Model
/** K1's `index.d.ts`: `{file, text, code, m}` (code = comments blanked; m = K3's declaration model). */
export function k1Declarations() {
  if (!k1Model) {
    const [file, text] = declarationText()
    k1Model = { file, text, code: blankComments(text), m: model(new Map([[file, text]])) }
  }
  return k1Model
}
/** K3's host-services declarations (K3's own reader). */
export const hostContracts = () => contracts(FILES.hostDir)

/** One interface's members, asserting the interface is declared. */
export function interfaceMembers(m, name) {
  assert.ok(m.decls.has(name), `no declaration named ${name}`)
  return m.members(name)
}
/** One method of a member map, asserted present. */
export function method(members, name) {
  const found = members.get(name)
  assert.ok(found, `no member ${name}; members: ${[...members.keys()].join(', ')}`)
  assert.ok(found.method, `${name} is not a method`)
  return found
}

/**
 * The JSDoc that leads `kind name` (e.g. `interface Mailbox`, `type HostedEntryState`) in a
 * declaration text, with the docs of everything inside an interface body: what the contract says
 * about the declaration, read in full (K3's reader keeps only the last 400 characters before it).
 */
export function docOf(text, kind, name) {
  const at = new RegExp(String.raw`\b${kind}\s+${name}\b`).exec(text)
  assert.ok(at, `no ${kind} ${name}`)
  const before = text.slice(0, at.index)
  const open = before.lastIndexOf('/**')
  const close = before.lastIndexOf('*/')
  const lead = open >= 0 && close > open && before.slice(close + 2).trim().replace(/^export(?:\s+declare)?$/, '') === '' ? before.slice(open, close + 2) : ''
  if (kind !== 'interface') return lead
  const bodyOpen = text.indexOf('{', at.index)
  let depth = 0
  for (let i = bodyOpen; i < text.length; i++) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}' && --depth === 0) return lead + '\n' + text.slice(bodyOpen, i)
  }
  return lead + '\n' + text.slice(bodyOpen)
}

/** The literal leaves of a type text; a `typeof X[keyof typeof X]` leaf resolves through the loaded module's `X`. */
export function typeValues(m, type, mod) {
  const out = new Set()
  for (const leaf of m.leaves(type)) {
    if (leaf.literal !== undefined) { out.add(leaf.literal); continue }
    const constant = /^typeof\s+([A-Za-z_$][\w$]*)\s*\[\s*keyof\s+typeof\s+\1\s*\]$/.exec(leaf.other.trim())?.[1]
    assert.ok(constant, `the type ${type} has a leaf that is neither a literal nor a frozen constant's values: ${leaf.other}`)
    assert.ok(mod[constant] && typeof mod[constant] === 'object', `the type ${type} names ${constant}, which the module does not export`)
    for (const v of Object.values(mod[constant])) out.add(v)
  }
  return [...out]
}

/** String literals in declaration code (comments blanked). */
export const codeLiterals = (code) => new Set([...code.matchAll(/(['"`])((?:(?!\1)[^\\\n])*)\1/g)].map((x) => x[2]))
/** Whether `name` is an identifier of `code` (comments blanked). */
export const hasIdentifier = (code, name) => new RegExp(String.raw`(?<![\w$])${name}(?![\w$])`).test(code)

// ------------------------------------------------------------------------------------------------
// Folder texts and README blocks

/** Map relative path → text of every contract text file of `dir` matching `only`. */
export function texts(dir, only = FILES.text) {
  return new Map(folderFiles(dir).filter((f) => only.test(f)).map((f) => [path.join(path.relative(process.cwd(), dir), f), fs.readFileSync(path.join(dir, f), 'utf8')]))
}

/**
 * A Markdown text as blocks: paragraphs (split at blank lines), each table row, list item and
 * heading on its own; a list item keeps its indented continuation lines.
 */
export function markdownBlocks(text) {
  const blocks = []
  for (const chunk of text.split(/\n\s*\n/)) {
    let current = []
    for (const line of chunk.split('\n')) {
      if (MD_BLOCK_START.test(line) && current.length > 0) { blocks.push(current.join('\n')); current = [] }
      current.push(line)
    }
    if (current.length > 0) blocks.push(current.join('\n'))
  }
  return blocks
}
export const readme = (dir) => fs.readFileSync(path.join(dir, FILES.readme), 'utf8')

// ------------------------------------------------------------------------------------------------
// The derived id of design §5.5a, computed from the module's frozen parts

/** RFC 4648 §6 base32 of `bytes` over `alphabet`, without padding. */
export function base32(bytes, alphabet) {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << DERIVED_ID.bitsPerByte) | byte
    bits += DERIVED_ID.bitsPerByte
    while (bits >= DERIVED_ID.bitsPerChar) {
      bits -= DERIVED_ID.bitsPerChar
      out += alphabet[(buffer >> bits) & (alphabet.length - 1)]
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) out += alphabet[(buffer << (DERIVED_ID.bitsPerChar - bits)) & (alphabet.length - 1)]
  return out
}

/**
 * The frozen parts of the derived id, found by meaning: the exported object that holds the prefix
 * string `cid-`; beside it a whole number (the character count), a 32-character string (the
 * alphabet) and a digest name node:crypto knows.
 */
export function derivedIdParts(mod) {
  const holders = []
  const visit = (value, depth) => {
    if (value === null || typeof value !== 'object' || depth > 2) return
    if (Object.values(value).includes(DERIVED_ID.prefix)) holders.push(value)
    for (const v of Object.values(value)) visit(v, depth + 1)
  }
  for (const v of Object.values(mod)) visit(v, 0)
  assert.equal(holders.length, 1, `exported objects holding the prefix ${DERIVED_ID.prefix}: ${holders.length}`)
  const values = Object.values(holders[0])
  const hashes = new Set(getHashes())
  return {
    prefix: DERIVED_ID.prefix,
    chars: values.filter((v) => Number.isSafeInteger(v)),
    alphabet: values.filter((v) => typeof v === 'string' && v.length === DERIVED_ID.alphabet.length),
    digest: values.filter((v) => typeof v === 'string' && hashes.has(v)),
  }
}

/** The module's derived-id parts, each required to be found exactly once (row 9 checks their values). */
export function frozenIdParts(mod) {
  const parts = derivedIdParts(mod)
  for (const key of ['chars', 'alphabet', 'digest']) assert.equal(parts[key].length, 1, `the derived id's ${key}: ${JSON.stringify(parts[key])}`)
  return { prefix: parts.prefix, chars: parts.chars[0], alphabet: parts.alphabet[0], digest: parts.digest[0] }
}

/** `prefix` + the first `chars` characters of base32(digest(clientIdUrl)), as design §5.5a says. */
export const deriveId = ({ prefix, chars, alphabet, digest }, clientIdUrl) =>
  prefix + base32(createHash(digest).update(clientIdUrl).digest(), alphabet).slice(0, chars)

/** The module's id validator: the exported RegExp that accepts every R-ID-02 sample and refuses each dotted one. */
export const moduleIdPattern = (mod) => exportedRegExps(mod).find((re) => ID_ORACLE.accepted.every((v) => re.test(v)) && !ID_ORACLE.refused.some((v) => re.test(v)))

// ------------------------------------------------------------------------------------------------
// Core's vendored copy

let regenerated
/**
 * Runs core's generator into a fresh temp core folder (never into the checkout) and returns
 * Map relative path → bytes of what it wrote, and of what core has committed. Run once.
 */
export function vendorTrees() {
  regenerated ??= (async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), FILES.tempPrefix))
    try {
      const run = spawnSync(process.execPath, [FILES.vendorScript, tmp], { encoding: 'utf8' })
      assert.equal(run.status, 0, `the generator failed: ${run.stderr}`)
      return { generated: tree(path.join(tmp, FILES.vendorFolder)), committed: tree(FILES.coreVendor) }
    } finally {
      // Guard the recursive delete: only the temp folder this helper made.
      assert.ok(path.dirname(tmp) === os.tmpdir() && path.basename(tmp).startsWith(FILES.tempPrefix), 'refusing to remove ' + tmp)
      await rm(tmp, { recursive: true, force: true })
    }
  })()
  return regenerated
}
const tree = (dir) => new Map(folderFiles(dir).map((f) => [f, fs.readFileSync(path.join(dir, f))]))

/** Core's committed vendored module, imported in plain Node as core's link imports it. */
export const vendoredModule = () => import(pathToFileURL(path.join(FILES.coreVendor, FILES.vendorEntry)).href)

/** A module's exported data as comparable JSON: RegExps as their source, functions by name. */
export function exportedData(mod) {
  const replacer = (_k, v) => (v instanceof RegExp ? `RegExp:${v}` : typeof v === 'function' ? `function:${v.name}` : v)
  return Object.fromEntries(Object.keys(mod).sort().map((k) => [k, JSON.parse(JSON.stringify(mod[k], replacer) ?? 'null')]))
}
