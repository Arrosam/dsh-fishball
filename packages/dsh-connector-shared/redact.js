/**
 * Secret masking for diagnostics (dsh-connector-shared, R-ARCH-08). Moved unchanged from
 * dsh-instance's src/native-runtime/stderr-log.js: the instance's child stderr log, the main host's
 * provider-sync host adapter (./provider-sync-host.js) and the connector's contributed-tool
 * refusals (dsh-connector src/contrib/calls.js) mask the same shapes. Until I-HOST, the child's
 * provider-sync host adapter masks with fishball-shared's identical copy (requirements 1.40: one
 * copy per side); keep the two in step until then.
 */

/**
 * Secret shapes masked before a line reaches disk. The child never prints its bearer or the
 * control secret on purpose; these are defence in depth for a library or crash that prints one:
 * an Authorization value, a key/token/secret/password assignment, and any long opaque run (the
 * bearer and the control secret are 64 hex characters, API keys are long word runs). The run
 * excludes '/' and '.' so file paths in stack traces stay readable.
 */
const REDACTION = Object.freeze([
  Object.freeze({ pattern: /\bbearer\s+[^\s"',;]+/gi, replacement: 'Bearer [redacted]' }),
  Object.freeze({ pattern: /\b(token|key|secret|password|credential|authorization)(s?["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, replacement: '$1$2[redacted]' }),
  Object.freeze({ pattern: /[A-Za-z0-9_+=-]{32,}/g, replacement: '[redacted]' }),
])

/** Mask the secret shapes above: child stderr lines and provider-sync failure diagnostics. */
export function redact(text) {
  return REDACTION.reduce((value, { pattern, replacement }) => value.replace(pattern, replacement), text)
}
