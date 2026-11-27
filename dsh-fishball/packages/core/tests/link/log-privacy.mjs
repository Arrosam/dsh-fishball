/**
 * F-FIX-3 (two silent catches in fishball-core now log one warning each): the thrown-value
 * partitions both suites throw, the recording logger, and the oracle for what one warning may say.
 *
 * Requirement (relayed by Fishball, 2026-11-17): the warning is exactly
 * `warn(LINK_SAVE.text.failed, <fixed reason>, code)`, where `code` is
 * `String(error.code ?? error.name ?? typeof error)`; nothing else of the failure is logged: never
 * its message, stack, a URL, a token, a client secret or credential text. The expected codes below
 * are worked out from that rule by hand, row by row (they are the oracle; the rule's implementation
 * is not imported). Every thrown value carries this run's fresh secrets in each field a careless
 * logger could print (message, `url`, `cause`, the stack, a string throw itself).
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { inspect } from 'node:util'

const fresh = (prefix) => prefix + randomBytes(18).toString('base64url')
/** This run's fake secrets: a token, a client secret, and a URL carrying both. */
export const SECRET = (() => {
  const token = fresh('fbtest-fix3-token-')
  const clientSecret = fresh('fbtest-fix3-client-secret-')
  const url = `https://fbtest-fix3-secret.test/api/agent/oauth/token?access_token=${token}&client_secret=${clientSecret}`
  return Object.freeze({ token, clientSecret, url, detail: `fbtest-fix3 detail: token ${token} at ${url}` })
})()

/** An Error carrying the secrets everywhere, with `code` / `name` as given (absent when undefined). */
function secretError(fields = {}) {
  const error = new Error(SECRET.detail, { cause: { token: SECRET.token, clientSecret: SECRET.clientSecret } })
  error.url = SECRET.url
  if ('name' in fields) error.name = fields.name
  if ('code' in fields) error.code = fields.code
  return error
}
class FbtestError extends Error {
  constructor() { super(SECRET.detail); this.url = SECRET.url; this.token = SECRET.token }
}
FbtestError.prototype.name = 'FbtestError'

/**
 * The thrown-value partitions: [row, title, make(), expected code]. EP over Error with `code`,
 * Error with `name` only, a plain Error, and non-Error throws (string, undefined, null, object,
 * number); BVA on `code` at the nullish edge (`0` and `''` are kept, `null` falls through to `name`).
 */
export const THROWN = Object.freeze([
  ['1 code', "an Error with code 'EFBTEST_FIX3' (and a name) → its code", () => secretError({ code: 'EFBTEST_FIX3', name: 'FbtestError' }), 'EFBTEST_FIX3'],
  ['2 code 0', 'an Error with code 0 (falsy, not nullish) → "0"', () => secretError({ code: 0 }), '0'],
  ["3 code ''", "an Error with code '' (empty, not nullish) → ''", () => secretError({ code: '' }), ''],
  ['4 code null', "an Error with code null and name 'FbtestError' → the name", () => secretError({ code: null, name: 'FbtestError' }), 'FbtestError'],
  ['5 name only', "an Error subclass named 'FbtestError', no code → the name", () => new FbtestError(), 'FbtestError'],
  ['6 plain Error', "a plain Error → 'Error'", () => secretError(), 'Error'],
  ['7 string', "a thrown string (the secret text itself) → 'string'", () => SECRET.detail, 'string'],
  ['8 undefined', "a thrown undefined → 'undefined'", () => undefined, 'undefined'],
  ['9 null', "a thrown null → 'object' (typeof null)", () => null, 'object'],
  ['10 object', "a plain object with message, url and clientSecret → 'object'", () => ({ message: SECRET.detail, url: SECRET.url, clientSecret: SECRET.clientSecret }), 'object'],
  ['11 number', "a thrown number → 'number'", () => 7, 'number'],
])
/** The partition the decision-table rows throw (an Error with a code). */
export const [CODE_ROW] = THROWN
export const CODE_THROW = Object.freeze({ make: CODE_ROW[2], code: CODE_ROW[3] })

/**
 * A recording logger factory: `of(name)` answers a logger whose every method (warn, info, error,
 * debug or any other) records `{name, level, args}` in `logs`, so a call on an unexpected level is
 * seen rather than crashing.
 */
export function logRecorder() {
  const logs = []
  const names = []
  const of = (name) => {
    names.push(name)
    return new Proxy({}, { get: (_, level) => (typeof level === 'string' ? (...args) => { logs.push({ name, level, args }) } : undefined) })
  }
  return { logs, names, of }
}

/** Everything logged (every argument of every call) holds none of this run's secrets nor `extra`. */
export function assertNoSecret(logs, extra = [], label = '') {
  const text = logs.map((l) => inspect(l.args, { depth: Infinity, showHidden: true }) + String(l.args)).join('\n')
  for (const secret of [SECRET.token, SECRET.clientSecret, SECRET.url, SECRET.detail, ...extra]) {
    assert.equal(text.includes(secret), false, `a log argument carries ${JSON.stringify(secret)} ${label}: ${text}`)
  }
}

/** Exactly one call was logged, a warning on `name` with exactly `args`; and it holds no secret. */
export function assertOneWarning(logs, name, args, label = '', extra = []) {
  assert.deepEqual(logs.map((l) => ({ name: l.name, level: l.level, args: l.args })), [{ name, level: 'warn', args }], `logged ${label}`)
  assertNoSecret(logs, extra, label)
}
