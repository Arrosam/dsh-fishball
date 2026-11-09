import { jsonStringSpans } from './json-string-spans.js'

const DETAIL = Object.freeze({
  maxCharacters: 2000,
  redacted: '[redacted]',
  fallback: 'Native instance startup failed.',
  exit: 'Child exited with code ',
  signal: 'Child exited with signal ',
  signals: /^SIG[A-Z0-9]+$/,
  nameCamelBoundary: /([a-z0-9])([A-Z])/g,
  nameAcronymBoundary: /([A-Z])([A-Z][a-z])/g,
  nameBoundaryReplacement: '$1_$2',
  nameSeparators: /[^a-z0-9]+/g,
  nameSeparator: '_',
  // Complete components only; bare KEY / CACHE_KEY are not credential names.
  secretEnvKey: /(?:^|_)(?:passwords?|passwd|tokens?|secrets?|credentials?|authorization|(?:api|access|private|secret)_?keys?)(?:_|$)/,
  occurrenceStep: 1,
  newline: /[\r\n]/,
  // Consume escaped characters as pairs so an escaped quote cannot end a credential value.
  // An unterminated quoted value extends to the end of this already isolated first line.
  // Look ahead so an ordinary outer assignment cannot swallow a nested credential assignment.
  assignment: /(?=((?:"(?<doubleName>(?:\\[^\r\n]|[^"\\\r\n])*)"|'(?<singleName>(?:\\[^\r\n]|[^'\\\r\n])*)'|\b(?<bareName>[\w.-]+))\s*[:=]\s*(?:"(?:\\[^\r\n]|[^"\\\r\n])*(?:"|\\?$)|'(?:\\[^\r\n]|[^'\\\r\n])*(?:'|\\?$)|[^\s,;]+)))/g,
  authorization: /\b(?:basic|bearer)\s+[^\s"',;]+/gi,
  // Userinfo ends at the last @ in the authority, not an @ embedded in the password.
  urlStart: /\b[a-z][a-z0-9+.-]*:\/\//gi,
  urlCredentials: /^[a-z][a-z0-9+.-]*:\/\/[^\s/?#]+@/i,
  home: /(?:\/(?:Users|home)\/[^\s"'<>]+|\/root(?:\/[^\s"'<>]*)?|[A-Z]:[\\/]Users[\\/][^\s"'<>]+)/gi,
  // Stop at a credential label: schemes and quoted/multi-word values cannot escape masking.
  secret: /\b(?:bearer|api[ _-]?key|token|secret|password|credential|authorization)s?\b.*$/gi,
  controls: /[\u0000-\u0008\u000b-\u001f\u007f]/g,
})

/** Normalize delimited, camelCase and acronym names before matching credential components. */
function isSensitiveParameterName(name) {
  const normalized = name.replace(DETAIL.nameAcronymBoundary, DETAIL.nameBoundaryReplacement)
    .replace(DETAIL.nameCamelBoundary, DETAIL.nameBoundaryReplacement).toLowerCase()
    .replace(DETAIL.nameSeparators, DETAIL.nameSeparator)
  return DETAIL.secretEnvKey.test(normalized)
}

/** Bound URLs by string tokens only inside validated JSON containers, never by raw quotes. */
function urlCredentialSpans(text) {
  const stringSpans = jsonStringSpans(text)
  return [...text.matchAll(DETAIL.urlStart)].flatMap(candidate => {
    const start = candidate.index
    // A JSON-looking substring inside plain userinfo must not split that URL's authority.
    // Only the string containing the scheme can bound its last-@ search.
    const enclosing = stringSpans.find(span => span.start < start && start < span.end)
    const match = text.slice(start, enclosing?.end ?? text.length).match(DETAIL.urlCredentials)
    return match ? [{ start, end: start + match[0].length }] : []
  })
}

/** Only this bounded, sanitized first line may leave the main process; never publish a stack. */
export function safeLaunchDetail(value, env = process.env) {
  if (typeof value !== 'string' || !value.trim()) return null
  let text = value.split(DETAIL.newline)[0]
  // Environment membership and value length do not imply secrecy; credential names do.
  const environment = new Set(Object.entries(env)
    .filter(([key, value]) => typeof value === 'string' && value && isSensitiveParameterName(key))
    .map(([, value]) => value))
  const environmentSpans = []
  for (const credential of environment) {
    // Search each literal independently, including occurrences beginning inside a prior one.
    // A consuming alternation misses crossing overlaps; advancing by length misses self-overlaps.
    let start = text.indexOf(credential)
    while (start !== -1) {
      environmentSpans.push({ start, end: start + credential.length })
      start = text.indexOf(credential, start + DETAIL.occurrenceStep)
    }
  }
  // Discover every private span on the original line: replacing a short credential first could
  // destroy an Authorization label, while replacing a home first could expose an env prefix.
  const patterns = [DETAIL.secret, DETAIL.home, DETAIL.authorization]
  const assignments = [...text.matchAll(DETAIL.assignment)]
    .filter(match => isSensitiveParameterName(match.groups.doubleName ?? match.groups.singleName ?? match.groups.bareName))
    .map(match => ({ start: match.index, end: match.index + match[1].length }))
  const spans = patterns.flatMap(pattern => [...text.matchAll(pattern)]
    .map(match => ({ start: match.index, end: match.index + match[0].length })))
    .concat(assignments, environmentSpans, urlCredentialSpans(text))
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const merged = []
  for (const span of spans) {
    const previous = merged.at(-1)
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end)
    else merged.push(span)
  }
  // Emit masks only after collecting overlaps; neither masks nor credential syntax are rescanned.
  // Do not reuse the private-log redactor: generic opaque runs and ordinary assignments are public.
  let cursor = 0
  const parts = []
  for (const span of merged) {
    parts.push(text.slice(cursor, span.start), DETAIL.redacted)
    cursor = span.end
  }
  parts.push(text.slice(cursor))
  text = parts.join('').replace(DETAIL.controls, '').trim()
  return Array.from(text || DETAIL.fallback).slice(0, DETAIL.maxCharacters).join('')
}

// Object identity, not matching prose, carries typed evidence across the in-process boundary.
// Neither raw error objects nor serialized/copied status objects can acquire this provenance.
const processFacts = new WeakMap()

/** Project internal evidence to the existing public string shape, retaining provenance locally. */
export function launchStatus(value) {
  const fact = processFacts.get(value.detail)
  const status = { ...value, detail: fact ?? value.detail }
  if (fact !== undefined) processFacts.set(status, fact)
  return status
}

/** Only snapshots produced from typed evidence may bypass textual redaction. */
export function statusLaunchDetail(status) {
  return processFacts.get(status) ?? safeLaunchDetail(status?.detail)
}

/** Prefer typed process evidence; arbitrary error messages must pass the public redactor. */
export function launchDetail(error) {
  let fact
  if (Number.isInteger(error?.exitCode)) fact = DETAIL.exit + error.exitCode
  else if (typeof error?.signal === 'string' && DETAIL.signals.test(error.signal)) fact = DETAIL.signal + error.signal
  if (fact !== undefined) {
    const evidence = Object.freeze({})
    processFacts.set(evidence, Array.from(fact).slice(0, DETAIL.maxCharacters).join(''))
    return evidence
  }
  return safeLaunchDetail(error?.message) ?? DETAIL.fallback
}
