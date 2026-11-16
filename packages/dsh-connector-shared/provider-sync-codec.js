/**
 * The provider-sync wire codec (dsh-connector-shared, R-ARCH-08; §10, §15 T16).
 *
 * Moved unchanged from dsh-instance's src/slim/child/provider-sync-target.js: the main host's
 * source end (dsh-instance src/provider-sync-service.js) builds, bounds and checks frames and
 * describes itself with it, and so does the child's target end (dsh-instance
 * src/child/provider-sync-target.js, moved there from fishball-core by I-HOST). The endpoint and the child row stay with the target; the preview/confirm engine is ./provider-sync.js.
 *
 * No value ever appears in a preview, a refusal or a result: group entries are exact-key checked
 * against metadata only, and the record validator lives in ./provider-sync.js.
 */
import { createHash, randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { PROVIDER_SYNC } from './provider-sync.js'

const KIB = 1024
const HEX = '0123456789abcdef'
const NO_KEYS = Object.freeze([])
const CONFIG_OUTCOMES = Object.freeze(['added', 'unchanged', 'failed', 'unknown'])
const KEY_OUTCOMES = Object.freeze(['imported', 'exists', 'failed', 'not-attempted', 'unknown'])
const SYNC_STATUSES = Object.freeze(['succeeded', 'partial', 'failed', 'skipped', 'unknown'])
const SAFE_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * Feature-owned protocol and capacity limits. The frame bound mirrors the T11 admin channel:
 * the lifecycle wire caps one frame at 1 MiB (RUNTIME_LIMITS.maxFrameBytes) and this protocol
 * rides inside it as a JSON string, where every quote gains an escape byte. Half of that frame
 * leaves headroom, so an oversize reply is a typed refusal instead of a dropped wire.
 */
export const PROVIDER_SYNC_TARGET = Object.freeze({
  version: 1,
  channel: 'provider-sync',
  actions: Object.freeze({ inventory: 'inventory', import: 'import' }),
  identity: Object.freeze({
    schemaVersion: '1',
    keys: Object.freeze(['runtimeId', 'profileId', 'schemaVersion', 'version']),
    identifier: /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/,
    hash: 'sha256',
    encoding: 'hex',
  }),
  limits: Object.freeze({
    frameBytes: 512 * KIB,
    requestTimeoutMs: 30_000,
    tokenHexChars: 64,
    digestHexChars: 64,
    idChars: 128,
    codeChars: 128,
    nameChars: 4096,
    modelChars: 4096,
    textChars: 4096,
    items: PROVIDER_SYNC.maxItems,
  }),
  code: Object.freeze({
    invalidFrame: 'invalid-frame',
    version: 'unsupported-version',
    action: 'unsupported-operation',
    payload: 'invalid-payload',
    limit: 'too-large',
    failed: 'target-failed',
    invalidResponse: 'invalid-response',
  }),
  state: Object.freeze({ inactive: 'inactive', ready: 'ready' }),
  errorMessage: 'Provider sync target refused the operation.',
})
const T = PROVIDER_SYNC_TARGET
const A = T.actions
const E = T.code
const ACTION_VALUES = Object.freeze(Object.values(A))

/** A typed protocol failure; its code is the only thing that crosses the wire. */
export class ProviderSyncTargetError extends Error {
  constructor(code) {
    super(T.errorMessage)
    this.name = 'ProviderSyncTargetError'
    this.code = code
  }
}
const refuse = (code) => { throw new ProviderSyncTargetError(code) }

/** Plain, data-only containers: accessors or extra keys cannot smuggle a value past a check. */
export const plain = (value) => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const has = (value, key) => Object.hasOwn(value, key)
function exact(value, required, optional = NO_KEYS) {
  if (!plain(value)) refuse(E.payload)
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) refuse(E.payload)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !has(descriptor, 'value')) refuse(E.payload)
  }
  for (const key of required) if (!has(value, key)) refuse(E.payload)
}
function list(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse(E.payload)
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !has(descriptor, 'value')) refuse(E.payload)
  }
}
function text(value, max = T.limits.textChars) {
  if (typeof value !== 'string' || value.length === 0 || [...value].length > max) refuse(E.payload)
}
function natural(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse(E.payload)
}
function boolean(value) {
  if (typeof value !== 'boolean') refuse(E.payload)
}
function oneOf(value, values) {
  if (!values.includes(value)) refuse(E.payload)
}
/** A refusal code that may cross the wire: a kebab-case identifier, bounded. */
export function safeCode(value) {
  return typeof value === 'string' && value.length <= T.limits.codeChars && SAFE_CODE.test(value)
}
function hex(value, length) {
  if (typeof value !== 'string' || value.length !== length) refuse(E.payload)
  for (const character of value) if (!HEX.includes(character)) refuse(E.payload)
}
function identityOf(value) {
  exact(value, T.identity.keys)
  for (const key of T.identity.keys) if (typeof value[key] !== 'string' || !T.identity.identifier.test(value[key])) refuse(E.payload)
  return value
}

/* ---------------------------------------------------------------- result shapes */

/** One preview entry: metadata only, and no unknown field may add a value to it. */
function groupItem(value) {
  exact(value, ['id', 'name', 'models', 'keyMask'], ['api', 'endpoint', 'reason'])
  if (typeof value.id !== 'string' || !T.identity.identifier.test(value.id)) refuse(E.payload)
  text(value.name, T.limits.nameChars)
  if (value.keyMask !== PROVIDER_SYNC.mask) refuse(E.payload)
  list(value.models)
  for (const model of value.models) text(model, T.limits.modelChars)
  if (has(value, 'api')) text(value.api, T.limits.codeChars)
  if (has(value, 'endpoint')) text(value.endpoint, T.limits.textChars)
  if (has(value, 'reason') && !safeCode(value.reason)) refuse(E.payload)
}
function previewGroups(value) {
  exact(value, ['add', 'existsSkip', 'conflictSkip', 'unsupported'])
  for (const key of ['add', 'existsSkip', 'conflictSkip', 'unsupported']) {
    list(value[key])
    if (value[key].length > T.limits.items) refuse(E.limit)
    for (const item of value[key]) groupItem(item)
  }
}
function previewResult(value) {
  exact(value, ['token', 'source', 'target', 'sourceFingerprint', 'expiresAt', 'groups'])
  hex(value.token, T.limits.tokenHexChars)
  identityOf(value.source)
  identityOf(value.target)
  hex(value.sourceFingerprint, T.limits.digestHexChars)
  natural(value.expiresAt)
  previewGroups(value.groups)
}
function confirmItem(value) {
  // catalogAdvertised is the engine's best-effort post-write directory probe; it is a fact about
  // the target catalog, not a credential value, and must survive the frame so the page can show it.
  exact(value, ['id', 'config', 'key', 'status'], ['reason', 'catalogAdvertised'])
  if (typeof value.id !== 'string' || !T.identity.identifier.test(value.id)) refuse(E.payload)
  oneOf(value.config, CONFIG_OUTCOMES)
  oneOf(value.key, KEY_OUTCOMES)
  oneOf(value.status, SYNC_STATUSES)
  if (has(value, 'reason') && !safeCode(value.reason)) refuse(E.payload)
  if (has(value, 'catalogAdvertised')) boolean(value.catalogAdvertised)
}
function confirmResult(value) {
  exact(value, ['results', 'complete'])
  list(value.results)
  if (value.results.length > T.limits.items) refuse(E.limit)
  for (const item of value.results) confirmItem(item)
  boolean(value.complete)
}
const RESULT_SHAPES = Object.freeze({ [A.inventory]: previewResult, [A.import]: confirmResult })

/* ---------------------------------------------------------------- frame codec */

function outcomeShape(value) {
  if (!plain(value) || typeof value.ok !== 'boolean') refuse(E.payload)
  if (value.ok) { if (!has(value, 'result') || has(value, 'error')) refuse(E.payload) }
  else if (!has(value, 'error') || has(value, 'result')) refuse(E.payload)
}
function errorShape(value) {
  exact(value, ['code'])
  if (!safeCode(value.code)) refuse(E.payload)
  return { code: value.code }
}

/**
 * The frame codec of both ends (each side's copy). A request carries the source identity beside the source
 * inventory, because the target engine verifies that the inventory belongs to the peer that
 * sent it; the wire's mutual HMAC already authenticates the process, not the profile identity.
 */
export function createProviderSyncCodec() {
  return Object.freeze({
    request(action, peer, payload, id = randomUUID()) {
      if (!ACTION_VALUES.includes(action) || !plain(payload)) refuse(E.payload)
      identityOf(peer)
      text(id, T.limits.idChars)
      return { v: T.version, id, op: action, peer, payload }
    },
    encode(frame) {
      let encoded
      try { encoded = JSON.stringify(frame) } catch { refuse(E.payload) }
      if (Buffer.byteLength(encoded, 'utf8') > T.limits.frameBytes) refuse(E.limit)
      return encoded
    },
    decode(encoded) {
      if (typeof encoded !== 'string') refuse(E.invalidFrame)
      if (Buffer.byteLength(encoded, 'utf8') > T.limits.frameBytes) refuse(E.limit)
      let frame
      try { frame = JSON.parse(encoded) } catch { refuse(E.invalidFrame) }
      return frame
    },
    acceptRequest(frame) {
      exact(frame, ['v', 'id', 'op', 'peer', 'payload'])
      if (frame.v !== T.version) refuse(E.version)
      text(frame.id, T.limits.idChars)
      if (!ACTION_VALUES.includes(frame.op)) refuse(E.action)
      identityOf(frame.peer)
      if (!plain(frame.payload)) refuse(E.payload)
      return frame
    },
    reply(id, action, outcome) {
      text(id, T.limits.idChars)
      outcomeShape(outcome)
      if (outcome.ok) {
        if (!ACTION_VALUES.includes(action)) refuse(E.action)
        RESULT_SHAPES[action](outcome.result)
        return { v: T.version, id, ok: true, result: outcome.result }
      }
      return { v: T.version, id, ok: false, error: errorShape(outcome.error) }
    },
    acceptReply(frame, action) {
      exact(frame, ['v', 'id', 'ok'], ['result', 'error'])
      if (frame.v !== T.version || typeof frame.id !== 'string' || typeof frame.ok !== 'boolean') refuse(E.invalidResponse)
      outcomeShape(frame)
      if (frame.ok) {
        if (!ACTION_VALUES.includes(action)) refuse(E.invalidResponse)
        RESULT_SHAPES[action](frame.result)
        return { ok: true, result: frame.result }
      }
      return { ok: false, error: errorShape(frame.error) }
    },
  })
}

/* ---------------------------------------------------------------- identity */

/**
 * The target/source identity both ends exchange: a per-boot id, the canonical profile path hash,
 * and the running DSH version. Source and target describe identity with this helper, each from its
 * side's copy.
 */
export async function providerSyncIdentity(profile, runtimeId) {
  if (!profile || typeof profile.dir !== 'string' || profile.dir === '') throw new TypeError('dsh provider sync: a profile directory is required')
  if (typeof runtimeId !== 'string') throw new TypeError('dsh provider sync: a runtime id is required')
  const identity = {
    runtimeId,
    profileId: createHash(T.identity.hash).update(await realpath(profile.dir)).digest(T.identity.encoding),
    schemaVersion: T.identity.schemaVersion,
    version: getDshRuntimeVersion(),
  }
  identityOf(identity)
  return Object.freeze(identity)
}
