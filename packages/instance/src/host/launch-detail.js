import { redact } from '../native-runtime/stderr-log.js'

const DETAIL = Object.freeze({
  maxCharacters: 2000,
  redacted: '[redacted]',
  fallback: 'Native instance startup failed.',
  exit: 'Child exited with code ',
  signal: 'Child exited with signal ',
  signals: /^SIG[A-Z0-9]+$/,
  newline: /[\r\n]/,
  // Public diagnostics are stricter than the private stderr log: omit assignments and homes.
  assignment: /["']?\b([\w.-]+)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/g,
  assignmentMask: '$1=[redacted]',
  home: /(?:\/(?:Users|home)\/[^\s"'<>]+|\/root(?:\/[^\s"'<>]*)?|[A-Z]:[\\/]Users[\\/][^\s"'<>]+)/gi,
  // Stop at a credential label: schemes and quoted/multi-word values cannot escape masking.
  secret: /\b(?:bearer|api[ _-]?key|token|secret|password|credential|authorization)s?\b.*$/gi,
  controls: /[\u0000-\u0008\u000b-\u001f\u007f]/g,
})

/** Only this bounded, sanitized first line may leave the main process; never publish a stack. */
export function safeLaunchDetail(value, env = process.env) {
  if (typeof value !== 'string' || !value.trim()) return null
  let text = value.split(DETAIL.newline)[0].replace(DETAIL.home, DETAIL.redacted)
  // Remove even unlabelled environment values, longest first so prefixes cannot expose tails.
  for (const secret of [...new Set(Object.values(env).filter(value => typeof value === 'string' && value))].sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join(DETAIL.redacted)
  }
  text = redact(text.replace(DETAIL.secret, DETAIL.redacted)).replace(DETAIL.home, DETAIL.redacted).replace(DETAIL.assignment, DETAIL.assignmentMask)
    .replace(DETAIL.controls, '').trim()
  return Array.from(text || DETAIL.fallback).slice(0, DETAIL.maxCharacters).join('')
}

/** Prefer typed process evidence; arbitrary error messages must pass the public redactor. */
export function launchDetail(error) {
  if (Number.isInteger(error?.exitCode)) return DETAIL.exit + error.exitCode
  if (typeof error?.signal === 'string' && DETAIL.signals.test(error.signal)) return DETAIL.signal + error.signal
  return safeLaunchDetail(error?.message) ?? DETAIL.fallback
}
