/**
 * Black-box reader of the frozen K3 declaration files (`.d.ts` under packages/connector/host-services
 * and packages/core/contracts). K3 is "types only", so the cases read the declarations as text: no
 * product module is loaded, and no TypeScript compiler is needed (the repository and both SDKs ship
 * none). Syntax validity is checked with Node's own `module.stripTypeScriptTypes`.
 *
 * The export names are K3's choice. A service is found by its Cordis name (a member of an
 * interface such as the augmented `Context`, or a declaration named after it in PascalCase), and a
 * member by the name the requirement gives it. Type references are followed through interfaces
 * (with `extends`), type aliases, intersections, unions and `Promise<…>`.
 */
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { FILES, RESOLVE_DEPTH } from './constants.mjs'

const IDENT = /^[A-Za-z_$][\w$]*$/
const OPEN = '{([<'
const CLOSE = '})]>'

/** Every file under `dir` (relative paths), or [] when the folder does not exist. */
export function folderFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort()
}

/**
 * The text with comments blanked to spaces (offsets kept) and the comments' own text kept apart, so
 * structure is read from code and documentation from comments. Strings and template literals stay.
 */
export function blankComments(text) {
  let code = ''
  for (let i = 0; i < text.length;) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      const stop = end < 0 ? text.length : end
      code += ' '.repeat(stop - i)
      i = stop
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end < 0 ? text.length : end + 2
      code += text.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1
      code += text.slice(i, j + 1)
      i = j + 1
    } else { code += c; i += 1 }
  }
  return code
}

/** Index of the bracket closing the one at `open` (code text; strings skipped). */
function closing(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    const c = code[i]
    if (c === '\'' || c === '"' || c === '`') { i = skipString(code, i); continue }
    if (c === '=' && code[i + 1] === '>') { i += 1; continue }
    if (OPEN.includes(c)) depth += 1
    else if (CLOSE.includes(c)) { depth -= 1; if (depth === 0) return i }
  }
  return code.length
}
function skipString(code, i) {
  let j = i + 1
  while (j < code.length && code[j] !== code[i]) j += code[j] === '\\' ? 2 : 1
  return j
}

/**
 * Split `code` at depth-0 separators. `separators` is a set of characters; a newline separates only
 * when the type does not obviously continue (a leading `|`, `&`, `.`, `=>` or a dangling operator).
 */
function splitTop(code, separators, { newline = false } = {}) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '\'' || c === '"' || c === '`') { i = skipString(code, i); continue }
    if (c === '=' && code[i + 1] === '>') { i += 1; continue }
    if (OPEN.includes(c)) depth += 1
    else if (CLOSE.includes(c)) depth -= 1
    else if (depth === 0 && (separators.includes(c) || (newline && c === '\n' && endsMember(code, start, i)))) {
      parts.push({ start, end: i, text: code.slice(start, i) })
      start = i + 1
    }
  }
  parts.push({ start, end: code.length, text: code.slice(start) })
  return parts.filter((p) => p.text.trim() !== '')
}
// A closing `>` ends a member (`Promise<…>`); only a dangling `=>` continues it.
const CONTINUES_AFTER = /(?:[|&:,(=<?.]|=>)\s*$/
const CONTINUES_BEFORE = /^\s*(?:[|&.?:=]|=>|extends\b)/
const endsMember = (code, start, i) => code.slice(start, i).trim() !== '' && !CONTINUES_AFTER.test(code.slice(start, i)) && !CONTINUES_BEFORE.test(code.slice(i + 1))

/** Parameters of a parenthesised list: [{name, optional, type, rest}]. */
export function parseParams(text) {
  return splitTop(text, ',').map(({ text: raw }) => {
    const p = raw.trim()
    const rest = p.startsWith('...')
    const body = rest ? p.slice(3) : p
    const colon = topIndex(body, ':')
    const head = (colon < 0 ? body : body.slice(0, colon)).trim()
    const type = colon < 0 ? '' : body.slice(colon + 1).trim()
    const optional = head.endsWith('?') || topIndex(body, '=') >= 0
    return { name: head.replace(/\?$/, ''), optional, type, rest }
  })
}
function topIndex(text, ch) {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\'' || c === '"' || c === '`') { i = skipString(text, i); continue }
    if (c === '=' && text[i + 1] === '>') { i += 1; continue }
    if (OPEN.includes(c)) depth += 1
    else if (CLOSE.includes(c)) depth -= 1
    else if (depth === 0 && c === ch) return i
  }
  return -1
}

const MEMBER = /^\s*(?:readonly\s+)?(['"]?)([A-Za-z_$][\w$-]*)\1\s*(\?)?\s*([(<:])/
/** A function type `(params) => R` (optionally generic), as a property's type. */
const FUNCTION_TYPE = /^\s*(?:<[^>]*>\s*)?\(/

/** One member: {name, optional, method, params, returns, type, doc}. Call signatures are skipped. */
function parseMember(code, original, part, nextLineEnd) {
  const m = MEMBER.exec(part.text)
  if (!m) return null
  const [, , name, question, opener] = m
  let at = m.index + m[0].length - 1
  const text = part.text
  if (opener === '<') at = closing(text, at) + 1
  // The member's own span holds its leading JSDoc and a trailing `//` comment (both blanked in code);
  // a comment after a `;` on the same line is read too.
  const doc = commentText(original.slice(part.start, part.end)) + ' ' + commentText(original.slice(part.end, nextLineEnd))
  if (opener === '(' || (opener === '<' && text[skipSpace(text, at)] === '(')) {
    const open = text.indexOf('(', at)
    const close = closing(text, open)
    const after = text.slice(close + 1)
    const colon = after.indexOf(':')
    return { name, optional: !!question, method: true, params: parseParams(text.slice(open + 1, close)), returns: colon < 0 ? '' : after.slice(colon + 1).trim(), type: '', doc }
  }
  const type = text.slice(at + 1).trim()
  if (FUNCTION_TYPE.test(type)) {
    const open = type.indexOf('(')
    const close = closing(type, open)
    const arrow = type.indexOf('=>', close)
    return { name, optional: !!question, method: true, params: parseParams(type.slice(open + 1, close)), returns: arrow < 0 ? '' : type.slice(arrow + 2).trim(), type, doc }
  }
  return { name, optional: !!question, method: false, params: [], returns: '', type, doc }
}
const skipSpace = (text, i) => { while (/\s/.test(text[i] ?? '')) i += 1; return i }
const commentText = (text) => (text.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join(' ')

/** Members of an object-type body (the text between its braces), with offsets into the file. */
function parseBody(code, original, open, close) {
  const body = code.slice(open + 1, close)
  return splitTop(body, ';,', { newline: true }).map((part) => {
    const shifted = { start: part.start + open + 1, end: part.end + open + 1, text: part.text }
    const lineEnd = original.indexOf('\n', shifted.end)
    return parseMember(code, original, shifted, lineEnd < 0 ? original.length : Math.min(lineEnd, close))
  }).filter(Boolean)
}

const DECL = /\b(interface|type)\s+([A-Za-z_$][\w$]*)\s*(<)?/g

/**
 * Every interface and type alias of a set of declaration texts:
 * name → [{kind, file, members?, extends?, raw?, doc}] (interfaces may merge across files).
 */
export function readDeclarations(texts) {
  const decls = new Map()
  const add = (name, decl) => decls.set(name, [...(decls.get(name) ?? []), decl])
  for (const [file, original] of texts) {
    const code = blankComments(original)
    for (const m of code.matchAll(DECL)) {
      const [, kind, name, generic] = m
      let at = m.index + m[0].length - (generic ? 1 : 0)
      if (generic) at = closing(code, at) + 1
      const doc = commentText(original.slice(Math.max(0, m.index - 400), m.index).split(/\n\s*\n/).pop())
      if (kind === 'interface') {
        const open = code.indexOf('{', at)
        if (open < 0) continue
        const heritage = code.slice(at, open).replace(/^\s*extends\s+/, '')
        const parents = heritage.trim() === '' ? [] : splitTop(heritage, ',').map((p) => /[A-Za-z_$][\w$.]*/.exec(p.text)?.[0]).filter(Boolean)
        add(name, { kind, file, members: parseBody(code, original, open, closing(code, open)), extends: parents, doc })
      } else {
        const eq = code.indexOf('=', at)
        if (eq < 0) continue
        const end = aliasEnd(code, eq + 1)
        add(name, { kind: 'alias', file, raw: code.slice(eq + 1, end).trim(), rawOriginal: original.slice(eq + 1, end), doc })
      }
    }
  }
  return decls
}
/** End of a type alias: the first depth-0 `;`, or a blank line / a new top-level statement. */
function aliasEnd(code, from) {
  let depth = 0
  for (let i = from; i < code.length; i++) {
    const c = code[i]
    if (c === '\'' || c === '"' || c === '`') { i = skipString(code, i); continue }
    if (c === '=' && code[i + 1] === '>') { i += 1; continue }
    if (OPEN.includes(c)) depth += 1
    else if (CLOSE.includes(c)) { if (depth === 0) return i; depth -= 1 }
    else if (depth === 0 && c === ';') return i
    else if (depth === 0 && c === '\n' && /^\s*(?:export\b|declare\b|interface\b|type\b|\n|$)/.test(code.slice(i + 1))) return i
  }
  return code.length
}

/** The type text with a `Promise<…>` (or `PromiseLike<…>`) wrapper removed. */
export const unwrapPromise = (type) => {
  const m = /^\s*(?:Promise|PromiseLike)\s*</.exec(type)
  return m ? type.slice(m[0].length, type.trim().lastIndexOf('>') + (type.length - type.trimEnd().length)).trim() : type.trim()
}
const stripParens = (type) => {
  const t = type.trim()
  return t.startsWith('(') && closing(t, 0) === t.length - 1 ? stripParens(t.slice(1, -1)) : t
}
const isLiteral = (t) => /^(['"]).*\1$/.test(t) || /^-?\d+(?:\.\d+)?$/.test(t) || /^(?:true|false)$/.test(t)
const literalValue = (t) => (/^(['"])/.test(t) ? t.slice(1, -1) : t)

/** A model over one declaration set: resolve members and literal vocabularies of type texts. */
export function model(texts) {
  const decls = readDeclarations(texts)
  const lookup = (name) => decls.get(name.split('.').pop()) ?? []

  /** Members of a type text (object literal, reference, intersection or union), keyed by name. */
  function members(type, depth = 0) {
    const out = new Map()
    if (!type || depth > RESOLVE_DEPTH) return out
    const t = stripParens(unwrapPromise(type))
    const add = (list) => { for (const m of list) if (!out.has(m.name)) out.set(m.name, m) }
    for (const sep of ['|', '&']) {
      const parts = splitTop(t, sep)
      if (parts.length > 1) { for (const p of parts) add(members(p.text, depth + 1).values()); return out }
    }
    if (t.startsWith('{')) {
      const code = blankComments(t)
      add(parseBody(code, t, 0, closing(code, 0)))
      return out
    }
    const name = /^[A-Za-z_$][\w$.]*/.exec(t)?.[0]
    if (!name) return out
    for (const decl of lookup(name)) {
      if (decl.kind === 'interface') {
        add(decl.members)
        for (const parent of decl.extends) add(members(parent, depth + 1).values())
      } else add(members(decl.raw, depth + 1).values())
    }
    return out
  }

  /** The leaves of a union type, resolved through aliases: literal values, or `other:<text>`. */
  function leaves(type, depth = 0) {
    const t = stripParens(unwrapPromise(type ?? ''))
    if (t === '' || depth > RESOLVE_DEPTH) return []
    const parts = splitTop(t, '|')
    if (parts.length > 1) return parts.flatMap((p) => leaves(p.text, depth + 1))
    if (isLiteral(t)) return [{ literal: literalValue(t) }]
    const aliases = IDENT.test(t) ? lookup(t).filter((d) => d.kind === 'alias') : []
    if (aliases.length > 0) return aliases.flatMap((d) => leaves(d.raw, depth + 1))
    // `typeof CODES[keyof typeof CODES]` and similar computed vocabularies cannot be read as text.
    return [{ other: t }]
  }

  /** The type text of a service: an interface member named `service`, else a declaration named in PascalCase. */
  function serviceType(service) {
    for (const list of decls.values()) for (const d of list) {
      const member = d.kind === 'interface' && d.members.find((m) => m.name === service)
      if (member) return member.method ? null : member.type
    }
    const pascal = service[0].toUpperCase() + service.slice(1)
    return decls.has(pascal) ? pascal : null
  }

  /** Every declaration (any name) whose members include all of `names`. */
  const declarationsWith = (names) => [...decls].filter(([n]) => names.every((k) => members(n).has(k))).map(([n]) => n)

  return { decls, members, leaves, serviceType, declarationsWith }
}

/** The declaration texts of a folder: Map relative path → text. */
export function declarationTexts(dir) {
  return new Map(folderFiles(dir).filter((f) => FILES.declaration.test(f)).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]))
}

/** Syntax errors of declaration texts, as `file: message` (Node's own TypeScript type stripper). */
export function syntaxErrors(texts) {
  const errors = []
  for (const [file, text] of texts) {
    try { stripTypeScriptTypes(text, { mode: 'strip' }) } catch (error) { errors.push(file + ': ' + error.message.split('\n')[0]) }
  }
  return errors
}

/** Module specifiers a declaration text imports or references (`import … from`, `import('…')`, `declare module`). */
export function specifiers(text) {
  const code = blankComments(text)
  const found = []
  for (const m of code.matchAll(/\bfrom\s*(['"])([^'"]+)\1|\bimport\s*\(\s*(['"])([^'"]+)\3\s*\)|\bimport\s+(['"])([^'"]+)\5|\/\/\/\s*<reference\s+types=(['"])([^'"]+)\7/g)) found.push(m[2] ?? m[4] ?? m[6] ?? m[8])
  for (const m of text.matchAll(/\/\/\/\s*<reference\s+(?:types|path)=(['"])([^'"]+)\1/g)) found.push(m[2])
  return found
}
