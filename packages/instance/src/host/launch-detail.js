import { redact } from '../native-runtime/stderr-log.js'

const DETAIL = Object.freeze({
  maxCharacters: 2000,
  redacted: '[redacted]',
  fallback: 'Native instance startup failed.',
  exit: 'Child exited with code ',
  signal: 'Child exited with signal ',
  signals: /^SIG[A-Z0-9]+$/,
  minEnvSubstringCharacters: 4,
  secretEnvKey: /(?:key|token|secret|password|passwd|credential|authorization)/i,
  regexCharacters: /[.*+?^${}()|[\]\\]/g,
  regexEscape: '\\$&',
  newline: /[\r\n]/,
  // Public diagnostics are stricter than the private stderr log: omit assignments and homes.
  assignment: /["']?\b([\w.-]+)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/g,
  home: /(?:\/(?:Users|home)\/[^\s"'<>]+|\/root(?:\/[^\s"'<>]*)?|[A-Z]:[\\/]Users[\\/][^\s"'<>]+)/gi,
  // Stop at a credential label: schemes and quoted/multi-word values cannot escape masking.
  secret: /\b(?:bearer|api[ _-]?key|token|secret|password|credential|authorization)s?\b.*$/gi,
  controls: /[\u0000-\u0008\u000b-\u001f\u007f]/g,
})

/** Only this bounded, sanitized first line may leave the main process; never publish a stack. */
export function safeLaunchDetail(value, env = process.env) {
  if (typeof value !== 'string' || !value.trim()) return null
  let text = value.split(DETAIL.newline)[0]
  // Ordinary short settings are not secrets; credential-named values remain private at any size.
  const environment = Object.entries(env)
    .filter(([key, value]) => typeof value === 'string' && value &&
      (DETAIL.secretEnvKey.test(key) || value.length >= DETAIL.minEnvSubstringCharacters))
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([, value]) => value.replace(DETAIL.regexCharacters, DETAIL.regexEscape))
  // Discover every private span on the original line: replacing a short credential first could
  // destroy an Authorization label, while replacing a home first could expose an env prefix.
  const patterns = [DETAIL.secret, DETAIL.home, DETAIL.assignment]
  if (environment.length) patterns.push(new RegExp(environment.join('|'), 'g'))
  const spans = patterns.flatMap(pattern => [...text.matchAll(pattern)]
    .map(match => ({ start: match.index, end: match.index + match[0].length })))
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const merged = []
  for (const span of spans) {
    const previous = merged.at(-1)
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end)
    else merged.push(span)
  }
  // Emit masks only after collecting overlaps; neither masks nor credential syntax are rescanned.
  let cursor = 0
  const parts = []
  for (const span of merged) {
    parts.push(redact(text.slice(cursor, span.start)), DETAIL.redacted)
    cursor = span.end
  }
  parts.push(redact(text.slice(cursor)))
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
