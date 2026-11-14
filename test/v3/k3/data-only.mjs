/**
 * The data-only rule of core contracts' `constants.js` (K3 amendment 2026-11-14, Fishball's final
 * rule): frozen data, `import type` / `export type … from`, JSDoc, and pure template formatters
 * (`(a, b) => \`…${a}…${b.c}…\``) only. Black box: the file is read as text, never loaded.
 *
 * A small tokenizer rather than regular expressions: strings and template text may hold `=>`,
 * `function` or `import(` as plain characters, and only tokens outside them are code. Comments are
 * blanked first with the shared `blankComments`. Regular-expression literals are not recognised
 * (a data file has no need of them; one holding a quote would be misread and should be reported).
 */
import { DATA_ONLY } from './constants.mjs'
import { blankComments } from './declarations.mjs'

const { keyword: KW, punct: P, violation: V } = DATA_ONLY
const IDENT = /[A-Za-z_$][\w$]*/y
const NUMBER = /\d[\w.]*/y
const SPACE = /\s/

/** End index (exclusive) of the quoted string starting at `i`. */
function stringEnd(code, i) {
  let j = i + 1
  while (j < code.length && code[j] !== code[i]) j += code[j] === P.escape ? 2 : 1
  return j + 1
}

/** The template literal starting at `i`: {end, interpolations: [source text of each `${…}`]}. */
function readTemplate(code, i) {
  const interpolations = []
  let j = i + 1
  while (j < code.length && code[j] !== P.backtick) {
    if (code[j] === P.escape) { j += 2; continue }
    if (code.startsWith(P.interpolation, j)) {
      const start = j + P.interpolation.length
      j = interpolationEnd(code, start)
      interpolations.push(code.slice(start, j))
    }
    j += 1
  }
  return { end: j + 1, interpolations }
}
/** Index of the `}` closing an interpolation whose source starts at `i` (strings and nested templates skipped). */
function interpolationEnd(code, i) {
  let depth = 0
  for (let j = i; j < code.length; j++) {
    const c = code[j]
    if (P.quotes.includes(c)) j = stringEnd(code, j) - 1
    else if (c === P.backtick) j = readTemplate(code, j).end - 1
    else if (c === P.braceOpen) depth += 1
    else if (c === P.braceClose) { if (depth === 0) return j; depth -= 1 }
  }
  return code.length
}

/** Tokens of code text: {kind: ident|number|string|template|punct, value, interpolations?}. */
export function tokenize(code) {
  const tokens = []
  for (let i = 0; i < code.length;) {
    const c = code[i]
    if (SPACE.test(c)) { i += 1; continue }
    const ident = matchAt(IDENT, code, i)
    const word = ident ?? matchAt(NUMBER, code, i)
    if (word) { tokens.push({ kind: ident ? 'ident' : 'number', value: word }); i += word.length; continue }
    if (P.quotes.includes(c)) { const end = stringEnd(code, i); tokens.push({ kind: 'string', value: code.slice(i, end) }); i = end; continue }
    if (c === P.backtick) {
      const { end, interpolations } = readTemplate(code, i)
      tokens.push({ kind: 'template', value: code.slice(i, end), interpolations })
      i = end
      continue
    }
    const value = code.startsWith(P.arrow, i) ? P.arrow : c
    tokens.push({ kind: 'punct', value })
    i += value.length
  }
  return tokens
}
function matchAt(re, text, i) {
  re.lastIndex = i
  return re.exec(text)?.[0] ?? null
}

const isIdent = (t, value) => t?.kind === 'ident' && (value === undefined || t.value === value)
const isPunct = (t, value) => t?.kind === 'punct' && t.value === value

/** An interpolation that is only an identifier or a dotted member access (`id`, `a.b.c`). */
function isPlainAccess(source) {
  const tokens = tokenize(source)
  return tokens.length > 0 && tokens.every((t, k) => (k % 2 === 0 ? isIdent(t) : isPunct(t, P.dot))) && tokens.length % 2 === 1
}

/** Index of the `(` matching the `)` at `close`, or -1. */
function openingParen(tokens, close) {
  let depth = 0
  for (let k = close; k >= 0; k--) {
    if (isPunct(tokens[k], P.parenClose)) depth += 1
    else if (isPunct(tokens[k], P.parenOpen) && --depth === 0) return k
  }
  return -1
}

/**
 * The arrow at `at` is a pure template formatter: parameters are plain identifiers (none, one bare,
 * or a parenthesised comma list), nothing such as `async` stands before them, the body is one
 * template literal whose interpolations are plain accesses, and nothing continues the body.
 */
function isTemplateFormatter(tokens, at) {
  let start = at - 1
  if (isPunct(tokens[start], P.parenClose)) {
    const open = openingParen(tokens, start)
    if (open < 0) return false
    const params = tokens.slice(open + 1, start)
    const plain = params.every((t, k) => (k % 2 === 0 ? isIdent(t) : isPunct(t, P.comma))) && params.length % 2 !== 0
    if (params.length > 0 && !plain) return false
    start = open
  } else if (!isIdent(tokens[start])) return false
  if (isIdent(tokens[start - 1])) return false
  const body = tokens[at + 1]
  const after = tokens[at + 2]
  return body?.kind === 'template' && body.interpolations.every(isPlainAccess) && (after === undefined || (after.kind === 'punct' && DATA_ONLY.bodyEnd.includes(after.value)))
}

/** Index of the `}` closing the `{` at `open`. */
function closingBrace(tokens, open) {
  let depth = 0
  for (let k = open; k < tokens.length; k++) {
    if (isPunct(tokens[k], P.braceOpen)) depth += 1
    else if (isPunct(tokens[k], P.braceClose) && --depth === 0) return k
  }
  return tokens.length
}

/** What an `import` / `export` keyword at `k` brings in that is not type-only, or null. */
function moduleViolation(tokens, k) {
  const next = tokens[k + 1]
  if (isIdent(tokens[k], KW.import)) {
    if (isPunct(next, P.parenOpen)) return V.dynamicImport
    // Type-only: `import type {…}`, `import type * as N`, `import type N`. But `import type from './x'`
    // and `import type, {…} from` bring in a value default named `type`.
    const then = tokens[k + 2]
    const typeOnly = isIdent(next, KW.type) && (isPunct(then, P.braceOpen) || isPunct(then, P.star) || (isIdent(then) && !isIdent(then, KW.from)))
    return typeOnly ? null : V.valueImport
  }
  if (isPunct(next, P.star)) return V.reExport
  if (isPunct(next, P.braceOpen) && isIdent(tokens[closingBrace(tokens, k + 1) + 1], KW.from)) return V.reExport
  return null
}

/** Each violation as `<kind> at token <n>: <context>` (empty when the tokens are data only). */
function violations(tokens, options) {
  const out = []
  const report = (k, kind) => out.push(`${kind} at token ${k}: ${tokens.slice(Math.max(0, k - 2), k + 3).map((t) => t.value).join(' ')}`)
  tokens.forEach((t, k) => {
    if (isIdent(t, KW.function)) report(k, V.function)
    else if (isIdent(t, KW.class)) report(k, V.class)
    else if (isIdent(t, KW.import) || isIdent(t, KW.export)) { const kind = moduleViolation(tokens, k); if (kind) report(k, kind) }
    else if (isPunct(t, P.arrow) && !(options.templateFormatters && isTemplateFormatter(tokens, k))) report(k, V.arrow)
    // `) {` opens a body: a method shorthand, a getter, a function or a statement block; data has none.
    else if (isPunct(t, P.parenClose) && isPunct(tokens[k + 1], P.braceOpen)) report(k, V.methodBody)
    if (t.kind === 'template') for (const source of t.interpolations) out.push(...violations(tokenize(source), options))
  })
  return out
}

/**
 * Why a script text is not data only (empty when it is). `templateFormatters` defaults to the
 * amendment's flag; the self-check passes it explicitly to cover both settings.
 */
export function dataOnlyViolations(text, { templateFormatters = DATA_ONLY.templateFormatters } = {}) {
  return violations(tokenize(blankComments(text)), { templateFormatters })
}
