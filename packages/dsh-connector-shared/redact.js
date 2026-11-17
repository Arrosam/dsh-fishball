/**
 * Secret masking for diagnostics (dsh-connector-shared, R-ARCH-08). Its users mask the same shapes:
 * dsh-instance's child stderr log (src/native-runtime/stderr-log.js), its provider-sync host adapter
 * (src/lib/provider-sync-host.js, main host and child-side row), and the connector's
 * contributed-tool refusals (dsh-connector src/contrib/calls.js).
 */

/**
 * Secret shapes masked before a line reaches disk or a contributed-tool reply. The child never
 * prints its bearer or the control secret on purpose; these are defence in depth for a library or
 * crash that prints one (R-FIX-REDACT):
 * - a value assigned (`:` or `=`) to a credential name, whether the name is bare, quoted or an
 *   escaped JSON key, in any case style (`apiKey`, `client_secret`, `X-Api-Key`). The whole value
 *   is masked whatever its length: a complete quoted string (escapes honoured), a whole JSON
 *   container, an Authorization value's scheme and credential through the end of the line, or one
 *   bare run (with its credential when the run is a Bearer / Basic scheme);
 * - a standalone `Bearer <credential>`;
 * - any long opaque run (the bearer and the control secret are 64 hex characters, API keys are
 *   long word runs). The run excludes '/' and '.' so file paths in stack traces stay readable.
 * A one-component name such as `APIKEY` is not split, so only the opaque-run rule covers its value.
 */
const REDACTION = Object.freeze({
  mask: '[redacted]',
  // A name, then its separator. An escaped JSON key (\"apiKey\") is tried before a plain quoted one.
  // A bare name may only start where no name character precedes it, and the atomic (?=(…))\k<bare>
  // stops it backtracking, so a long dotted run is scanned once rather than once per suffix.
  assignment: /(?:(?<name>\\"[\w .-]+\\"|"[\w .-]+"|'[\w .-]+')|(?<![\w.-])(?=(?<bare>[\w.-]+))\k<bare>)[ \t]*[:=][ \t]*/g,
  // Name components: split acronyms and camelCase (DSHAgentToken → DSH_Agent_Token), then delimiters.
  nameAcronymBoundary: /([A-Z])([A-Z][a-z])/g,
  nameCamelBoundary: /([a-z0-9])([A-Z])/g,
  nameBoundary: '$1_$2',
  nameSeparators: /[^a-z0-9]+/,
  // Complete components only: `monkey`, `tokenizer` and `passwordless` are not credentials.
  sensitiveComponent: /^(?:token|key|secret|password|credential|authorization)s?$/,
  // An Authorization value is a scheme, known or not, and its credential: both are masked to the
  // line's end, since Basic / Digest credentials hold separators no bare run would reach past.
  authorizationComponent: /^authorization$/,
  bareValue: /^[^\s"',;&]+/,
  schemeValue: /^(?:bearer|basic)[ \t]+[^\s"',;&]+/i,
  bearer: /\bbearer\s+(?<credential>[^\s"',;]+)/dgi,
  opaqueRun: /[A-Za-z0-9_+=-]{32,}/g,
  quotes: '"\'',
  escape: '\\',
  escapedQuoteLength: 2,
  containerOpen: '[{',
  containerClose: ']}',
  // A container's strings are JSON strings: only '"' opens one, so an apostrophe cannot hide a bracket.
  containerQuote: '"',
  lineEnd: /[\r\n]/,
  lineEndOrText: /[\r\n]|$/,
})

/** The lower-case components of a credential name, whatever its quoting and case style. */
const nameComponents = (name) => name.replace(REDACTION.nameAcronymBoundary, REDACTION.nameBoundary)
  .replace(REDACTION.nameCamelBoundary, REDACTION.nameBoundary).toLowerCase()
  .split(REDACTION.nameSeparators).filter(Boolean)

/** The index where the physical line holding `from` ends (its \r / \n, or the text's end). */
const lineEnd = (text, from) => from + text.slice(from).search(REDACTION.lineEndOrText)

/**
 * The end of a quoted value's contents (the index of its closing delimiter), or of its line when
 * unterminated, so a cut-off credential is still masked whole. `escaped` reads the contents of an
 * escaped JSON string (\"…\"): every raw `\X` pair is the character X, so \" closes it and \\\"
 * is an escaped quote inside it.
 */
function quotedEnd(text, from, quote, escaped) {
  const read = (at) => (escaped && text[at] === REDACTION.escape ? [text[at + 1], at + 2] : [text[at], at + 1])
  const endsLine = (char) => char === undefined || REDACTION.lineEnd.test(char)
  let at = from
  while (at < text.length) {
    const [char, next] = read(at)
    if (char === quote) return at
    if (endsLine(char)) break
    // An escape takes the next character with it, unless that ends the line: the value ends there.
    const [escapedChar, afterEscaped] = char === REDACTION.escape ? read(next) : []
    if (char === REDACTION.escape && endsLine(escapedChar)) { at = next; break }
    at = afterEscaped ?? next
  }
  return lineEnd(text, Math.min(at, text.length))
}

/** The end (exclusive) of the balanced [ / { container at `from`; an unbalanced one runs to the text's end. */
function containerEnd(text, from) {
  let depth = 0
  for (let at = from; at < text.length; at++) {
    const char = text[at]
    if (char === REDACTION.containerQuote) at = quotedEnd(text, at + 1, char, false)
    else if (REDACTION.containerOpen.includes(char)) depth++
    else if (REDACTION.containerClose.includes(char) && --depth === 0) return at + 1
  }
  return text.length
}

/** The private span of the value that starts at `from` after a credential name, or null when it is empty. */
function valueSpan(text, from, components) {
  const span = (start, end) => (end > start ? { start, end } : null)
  const first = text[from]
  if (first === REDACTION.escape && REDACTION.quotes.includes(text[from + 1])) {
    const start = from + REDACTION.escapedQuoteLength
    return span(start, quotedEnd(text, start, text[from + 1], true))
  }
  if (REDACTION.quotes.includes(first)) return span(from + 1, quotedEnd(text, from + 1, first, false))
  if (REDACTION.containerOpen.includes(first)) return span(from, containerEnd(text, from))
  if (components.some((c) => REDACTION.authorizationComponent.test(c))) return span(from, lineEnd(text, from))
  const rest = text.slice(from)
  const run = rest.match(REDACTION.schemeValue) ?? rest.match(REDACTION.bareValue)
  return run ? span(from, from + run[0].length) : null
}

/** Every private span of `text`, all found on the original text, so no mask can hide or create syntax. */
function privateSpans(text) {
  const assignments = []
  // Resume after each masked value: a name inside it is masked already, and rescanning every
  // nested `password=[` of an unbalanced value to the text's end would be quadratic.
  const assignment = new RegExp(REDACTION.assignment)
  for (let match = assignment.exec(text); match; match = assignment.exec(text)) {
    const components = nameComponents(match.groups.name ?? match.groups.bare)
    if (!components.some((c) => REDACTION.sensitiveComponent.test(c))) continue
    const span = valueSpan(text, match.index + match[0].length, components)
    if (!span) continue
    assignments.push(span)
    assignment.lastIndex = span.end
  }
  const bearers = [...text.matchAll(REDACTION.bearer)].map((match) => {
    const [start, end] = match.indices.groups.credential
    return { start, end }
  })
  const runs = [...text.matchAll(REDACTION.opaqueRun)].map((match) => ({ start: match.index, end: match.index + match[0].length }))
  return [...assignments, ...bearers, ...runs].sort((a, b) => a.start - b.start || b.end - a.end)
}

/**
 * Mask the secret shapes above in a diagnostic: a child stderr block, a provider-sync failure
 * message or a contributed tool's refusal message. Overlapping or touching spans become one mask,
 * so redacting the output again changes nothing.
 *
 * @param {string} text
 * @returns {string} the text with every private span replaced by `[redacted]`.
 */
export function redact(text) {
  const merged = []
  for (const span of privateSpans(text)) {
    const previous = merged.at(-1)
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end)
    else merged.push({ ...span })
  }
  let cursor = 0
  const parts = []
  for (const { start, end } of merged) {
    parts.push(text.slice(cursor, start), REDACTION.mask)
    cursor = end
  }
  parts.push(text.slice(cursor))
  return parts.join('')
}
