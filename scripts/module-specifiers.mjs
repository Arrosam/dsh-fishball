// Shared by the Fishball test checker and the cross-component amenity check.
const RULE = Object.freeze({
  blockComment: /\/\*[\s\S]*?\*\//g,
  lineComment: /^\s*\/\/.*$/gm,
  specifier: /(?:\bfrom\s*|(?:\bimport|\brequire|\bimport\.meta\.resolve)\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g,
})

/**
 * `code` with the body of every string, template and regex literal blanked to spaces (same length,
 * so line numbers hold), except a quoted string in specifier position (directly after `from`,
 * `import` or `import(`). A small scanner, not a parser: a `/` starts a regex where an expression may
 * begin (after an operator, a bracket, a keyword or the start of the text), otherwise it is division.
 */
function blankLiterals(code) {
  const out = code.split('')
  const before = (i) => code.slice(Math.max(0, i - LOOKBEHIND), i)
  let i = 0
  while (i < code.length) {
    const c = code[i]
    const regex = c === '/' && code[i + 1] !== '/' && code[i + 1] !== '*' && REGEX_BEFORE.test(before(i))
    if (!QUOTES.includes(c) && !regex) { i++; continue }
    // Specifiers may be split across lines or padded with arbitrary indentation.
    let end = i
    while (end > 0 && /\s/.test(code[end - 1])) end--
    if (code[end - 1] === '(') {
      end--
      while (end > 0 && /\s/.test(code[end - 1])) end--
    }
    const keep = !regex && c !== '`' && SPECIFIER_BEFORE.test(code.slice(Math.max(0, end - LOOKBEHIND), end))
    let j = i + 1
    let inClass = false
    while (j < code.length) {
      if (code[j] === '\\') { j += 2; continue }
      if (regex && code[j] === '[') inClass = true
      else if (regex && code[j] === ']') inClass = false
      else if (code[j] === c && !inClass) break
      else if (code[j] === '\n' && c !== '`') break
      j++
    }
    if (!keep) for (let k = i + 1; k < Math.min(j, code.length); k++) if (out[k] !== '\n') out[k] = ' '
    i = j + 1
  }
  return out.join('')
}
const QUOTES = Object.freeze(["'", '"', '`'])
/** Characters looked back over to decide a literal's position. */
const LOOKBEHIND = 12
const SPECIFIER_BEFORE = /(?:\bfrom|\bimport|\brequire|\bresolve)$/
const REGEX_BEFORE = /(?:^|[=(,:;!&|?{}[+\-*%<>~^]|\breturn|\btypeof|\bcase|\bdo|\belse|\bin|\bof)\s*$/

export const stripComments = (raw) => raw.replace(RULE.blockComment, (m) => m.replace(/[^\n]/g, ' ')).replace(RULE.lineComment, (m) => ' '.repeat(m.length))
export const specifiers = (code, { commonJS = false } = {}) => {
  const statements = blankLiterals(code)
  return commonJS ? statements.matchAll(RULE.specifier) : [...statements.matchAll(RULE.specifier)].filter((match) => !match[0].startsWith('require'))
}
export const bareName = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
