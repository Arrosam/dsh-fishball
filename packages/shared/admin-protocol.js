/**
 * The child `admin` service's wire protocol (fishball-shared, R-ARCH-08).
 *
 * Moved from dsh-instance's src/slim/child/admin.js with its rules unchanged: the child
 * serves this protocol (its applier and wire end stay with the child, src/slim/child/admin.js)
 * and the main host's relay (src/slim/host/admin.js) speaks it, so both ends validate one
 * definition instead of two drifting ones. The vocabulary, limits and typed refusal are plain module exports; `refuse` and
 * ADMIN_APPLICATIONS are exported because the child's applier refuses and accepts the same way.
 *
 * The request/result validators and the frame codec read three values of the Fishball contract:
 * DIGEST (inventory digests) and STATUS/STATUS_CODES (admin.status). fishball-shared imports no
 * other V3 package (R-ARCH-08 rule 2), so each end passes its own `dsh-connector/contract`
 * values to `createAdminProtocol`, which wraps the moved validators and codec; the rules
 * themselves exist only here.
 */
import { randomUUID } from 'node:crypto'

const KIB = 1024
const NO_KEYS = Object.freeze([])

/**
 * The admin wire protocol. One JSON frame out, one typed outcome back.
 *
 * `channel` is the lifecycle-wire payload channel this protocol requires. The session bridge
 * owns the wire's `control` channel exclusively — its frames are envelope v2 and a foreign
 * frame closes the connection — so the admin protocol needs its own payload channel on the
 * same authenticated wire rather than a second socket. Merge hook (see the delivery report):
 * dsh-instance's src/native-runtime/wire.js must carry this channel and hand each end a
 * transport view.
 */
export const ADMIN = Object.freeze({
  version: 1,
  channel: 'admin',
})

/**
 * Frame and payload bounds. The lifecycle wire caps one frame at 1 MiB
 * (RUNTIME_LIMITS.maxFrameBytes) and carries this protocol's frame inside it as a JSON string,
 * where every quote gains an escape byte; half of that frame leaves room for the escaping, so an
 * oversize reply is refused with `too-large` instead of making the wire drop the connection.
 * The package bound covers a pnpm install/remove, which outlives any interactive request.
 */
export const ADMIN_LIMITS = Object.freeze({
  frameBytes: 512 * KIB,
  requestTimeoutMs: 30_000,
  packageTimeoutMs: 10 * 60_000,
  operationsPerMutation: 64,
  pathDepth: 8,
  specChars: 512,
  nameChars: 256,
  descriptionChars: 1000,
})

/** The page's operations; `local` ones never travel (the relay answers them itself). */
export const ADMIN_OPERATION = Object.freeze({
  status: 'admin.status',
  restart: 'admin.restart',
  modelGet: 'admin.model.get',
  modelSet: 'admin.model.set',
  pluginsGet: 'admin.plugins.get',
  pluginInstall: 'admin.plugin.install',
  pluginRemove: 'admin.plugin.remove',
  pluginEnable: 'admin.plugin.enable',
  pluginDisable: 'admin.plugin.disable',
  settingsGet: 'admin.settings.get',
  settingsMutate: 'admin.settings.mutate',
})

const LOCAL = Object.freeze({ local: true, timeoutMs: 0 })
const remote = (timeoutMs) => Object.freeze({ local: false, timeoutMs })

/** Direction and time bound of each operation; a local operation is the host's own work. */
export const ADMIN_OPERATIONS = Object.freeze({
  [ADMIN_OPERATION.status]: LOCAL,
  [ADMIN_OPERATION.restart]: LOCAL,
  [ADMIN_OPERATION.modelGet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.modelSet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.pluginsGet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.pluginInstall]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.pluginRemove]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.pluginEnable]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.pluginDisable]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.settingsGet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.settingsMutate]: remote(ADMIN_LIMITS.requestTimeoutMs),
})

/**
 * The typed refusal vocabulary. Plugin codes reuse DSH's own management refusal names
 * (`ManagementError.code`), so the page shows the real reason — unknown package, protected
 * package, incompatible version — instead of one flattened failure.
 */
export const ADMIN_ERROR = Object.freeze({
  // Frame and channel.
  invalidFrame: 'invalid-frame',
  version: 'unsupported-version',
  operation: 'unsupported-operation',
  payload: 'invalid-payload',
  limit: 'too-large',
  unavailable: 'unavailable',
  timeout: 'timeout',
  disconnected: 'disconnected',
  invalidResponse: 'invalid-response',
  failed: 'operation-failed',
  // Revisions.
  staleRevision: 'stale-revision',
  // Model.
  unknownProvider: 'unknown-provider',
  unknownModel: 'unknown-model',
  invalidEffort: 'invalid-reasoning-effort',
  modelUnavailable: 'model-unavailable',
  // Settings.
  unknownNamespace: 'unknown-namespace',
  readOnly: 'read-only',
  // Plugins; the first twelve are DSH's own codes (see the comment above).
  unknownPlugin: 'unknown-plugin',
  invalidSpec: 'invalid-spec',
  alreadyInstalled: 'already-installed',
  ambiguousInstall: 'ambiguous-install',
  notBundle: 'not-bundle',
  notRemovable: 'not-removable',
  stopProfile: 'stop-profile',
  bundleInUse: 'bundle-in-use',
  incompatibleVersion: 'incompatible-version',
  unsupportedPlatform: 'unsupported-platform',
  managementRequired: 'management-required',
  unaddressable: 'unaddressable',
  // Admin-owned: a package run that waits for build-script approval, and everything unmapped.
  buildBlocked: 'build-blocked',
  pluginFailed: 'plugin-failed',
})

const ADMIN_CODES = new Set(Object.values(ADMIN_ERROR))

/** A successful package change; `cancelled` and `failed` are refusals, never results. */
export const ADMIN_APPLICATIONS = new Set(['applied', 'restart-required', 'overridden'])

/**
 * A typed refusal thrown inside this module. It never reaches a caller: `handle` turns it into
 * `{ok:false,error}`, and `createAdminCodec` turns boundary failures into error frames.
 */
export class AdminFailure extends Error {
  /**
   * @param {string} code - one of ADMIN_ERROR's values.
   * @param {{expected?: number, actual?: number}} [details] - revision facts for a stale refusal.
   */
  constructor(code, details = {}) {
    super(code)
    this.name = 'AdminFailure'
    this.code = code
    this.details = details
  }
}

/** Throw one typed refusal; the admin applier and this protocol refuse the same way. */
export function refuse(code, details) { throw new AdminFailure(code, details) }

/** The page-facing refusal shape; `details` carry revision numbers only. */
export function refusal(code, details = {}) {
  return { ok: false, error: { code, ...details } }
}

/** Convert any thrown value into a typed refusal, never rethrowing into a caller. */
export function refusalOf(error) {
  return error instanceof AdminFailure ? refusal(error.code, error.details) : refusal(ADMIN_ERROR.failed)
}

/**
 * Plain, dense, data-only containers, as the frozen contract validates them: accessors and
 * extra own keys cannot smuggle a value past a check. The contract module keeps its own copies
 * private and holds no admin operations, so the admin boundary carries its own four helpers.
 */
function exact(value, required, optional = NO_KEYS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(ADMIN_ERROR.payload)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) refuse(ADMIN_ERROR.payload)
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) refuse(ADMIN_ERROR.payload)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse(ADMIN_ERROR.payload)
  }
  for (const key of required) if (!Object.hasOwn(value, key)) refuse(ADMIN_ERROR.payload)
}

function list(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse(ADMIN_ERROR.payload)
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse(ADMIN_ERROR.payload)
  }
}

function text(value, max = ADMIN_LIMITS.nameChars) {
  if (typeof value !== 'string' || value.length === 0) refuse(ADMIN_ERROR.payload)
  if ([...value].length > max) refuse(ADMIN_ERROR.payload)
}

function natural(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse(ADMIN_ERROR.payload)
}

function boolean(value) {
  if (typeof value !== 'boolean') refuse(ADMIN_ERROR.payload)
}

function oneOf(value, values) {
  if (!values.includes(value)) refuse(ADMIN_ERROR.payload)
}

function has(value, key) { return Object.hasOwn(value, key) }

/**
 * Bind the validators and the frame codec to the caller's contract values.
 *
 * @param {object} contract - the Fishball contract's values this protocol checks against.
 * @param {{algorithm: string, hex: string, hexLength: number}} contract.DIGEST - the digest shape.
 * @param {Record<string, string>} contract.STATUS - the lifecycle states `admin.status` may answer.
 * @param {Record<string, string>} contract.STATUS_CODES - the codes `admin.status` may answer.
 * @returns {{validateRequest: Function, validateResult: Function, createAdminCodec: Function}}
 *   `validateRequest(operation, payload)` and `validateResult(operation, result)` throw
 *   AdminFailure; `createAdminCodec()` returns the frame codec both ends use.
 */
export function createAdminProtocol({ DIGEST, STATUS, STATUS_CODES }) {
  /** A sha256 hex digest, the same shape the contract uses for attachment bytes. */
  function digestChars(value) {
    if (typeof value !== 'string' || value.length !== DIGEST.hexLength) refuse(ADMIN_ERROR.payload)
    for (const character of value) if (!DIGEST.hex.includes(character)) refuse(ADMIN_ERROR.payload)
  }

  /** One `{provider, model}` pair, with the effort only when the adapter has one. */
  function selectionShape(value) {
    exact(value, ['provider', 'model'], ['reasoningEffort'])
    text(value.provider, ADMIN_LIMITS.nameChars)
    text(value.model, ADMIN_LIMITS.nameChars)
    if (has(value, 'reasoningEffort')) text(value.reasoningEffort, ADMIN_LIMITS.nameChars)
  }

  /**
   * One settings path edit. A wholesale write of the section root is refused: the page holds a
   * redacted value, and rebuilding the section from it would silently delete every secret the
   * wire never returned (dsh-settings' SettingsPathOp warning).
   */
  function settingOpShape(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(ADMIN_ERROR.payload)
    if (value.op === 'set') {
      exact(value, ['op', 'path', 'value'])
      if (value.value === undefined) refuse(ADMIN_ERROR.payload)
    }
    else if (value.op === 'unset') exact(value, ['op', 'path'])
    else refuse(ADMIN_ERROR.payload)
    list(value.path)
    if (value.path.length === 0 || value.path.length > ADMIN_LIMITS.pathDepth) refuse(ADMIN_ERROR.payload)
    for (const step of value.path) text(step, ADMIN_LIMITS.nameChars)
  }

  /* ---------------------------------------------------------------- request shapes */

  function noPayload(value) { exact(value, NO_KEYS) }

  function modelSetRequest(value) {
    exact(value, ['revision', 'provider', 'model'], ['reasoningEffort'])
    natural(value.revision)
    text(value.provider, ADMIN_LIMITS.nameChars)
    text(value.model, ADMIN_LIMITS.nameChars)
    if (has(value, 'reasoningEffort')) text(value.reasoningEffort, ADMIN_LIMITS.nameChars)
  }

  function installRequest(value) {
    exact(value, ['inventoryRevision', 'spec'])
    digestChars(value.inventoryRevision)
    text(value.spec, ADMIN_LIMITS.specChars)
  }

  function bundleRequest(value) {
    exact(value, ['inventoryRevision', 'name'])
    digestChars(value.inventoryRevision)
    text(value.name, ADMIN_LIMITS.nameChars)
  }

  function mutateRequest(value) {
    exact(value, ['ns', 'revision', 'ops'])
    text(value.ns, ADMIN_LIMITS.nameChars)
    natural(value.revision)
    list(value.ops)
    if (value.ops.length === 0 || value.ops.length > ADMIN_LIMITS.operationsPerMutation) refuse(ADMIN_ERROR.payload)
    for (const op of value.ops) settingOpShape(op)
  }

  const REQUESTS = Object.freeze({
    [ADMIN_OPERATION.status]: noPayload,
    [ADMIN_OPERATION.restart]: noPayload,
    [ADMIN_OPERATION.modelGet]: noPayload,
    [ADMIN_OPERATION.modelSet]: modelSetRequest,
    [ADMIN_OPERATION.pluginsGet]: noPayload,
    [ADMIN_OPERATION.pluginInstall]: installRequest,
    [ADMIN_OPERATION.pluginRemove]: bundleRequest,
    [ADMIN_OPERATION.pluginEnable]: bundleRequest,
    [ADMIN_OPERATION.pluginDisable]: bundleRequest,
    [ADMIN_OPERATION.settingsGet]: noPayload,
    [ADMIN_OPERATION.settingsMutate]: mutateRequest,
  })

  /* ---------------------------------------------------------------- result shapes */

  function statusResult(value) {
    exact(value, ['state', 'code'])
    oneOf(value.state, Object.values(STATUS))
    if (value.code !== null) oneOf(value.code, Object.values(STATUS_CODES))
  }

  function modelShape(value) {
    exact(value, ['provider', 'id', 'name', 'efforts'], ['description', 'contextWindow', 'defaultEffort'])
    text(value.provider, ADMIN_LIMITS.nameChars)
    text(value.id, ADMIN_LIMITS.nameChars)
    text(value.name, ADMIN_LIMITS.nameChars)
    if (has(value, 'description')) text(value.description, ADMIN_LIMITS.descriptionChars)
    if (has(value, 'contextWindow')) natural(value.contextWindow)
    if (has(value, 'defaultEffort')) text(value.defaultEffort, ADMIN_LIMITS.nameChars)
    list(value.efforts)
    for (const effort of value.efforts) {
      exact(effort, ['id', 'name'])
      text(effort.id, ADMIN_LIMITS.nameChars)
      text(effort.name, ADMIN_LIMITS.nameChars)
    }
  }

  function modelResult(value) {
    exact(value, ['revision', 'selection', 'providers', 'models'], ['active'])
    natural(value.revision)
    selectionShape(value.selection)
    if (has(value, 'active') && value.active !== null) selectionShape(value.active)
    list(value.providers)
    for (const provider of value.providers) {
      exact(provider, ['id', 'name'])
      text(provider.id, ADMIN_LIMITS.nameChars)
      text(provider.name, ADMIN_LIMITS.nameChars)
    }
    list(value.models)
    for (const model of value.models) modelShape(model)
  }

  function modelSetResult(value) {
    exact(value, ['revision', 'selection'], ['sessionError'])
    natural(value.revision)
    selectionShape(value.selection)
    if (has(value, 'sessionError') && !ADMIN_CODES.has(value.sessionError)) refuse(ADMIN_ERROR.payload)
  }

  function bundleShape(value) {
    exact(value, ['name', 'enabled', 'installed', 'removable', 'official'], ['version'])
    text(value.name, ADMIN_LIMITS.nameChars)
    if (has(value, 'version')) text(value.version, ADMIN_LIMITS.nameChars)
    boolean(value.enabled)
    boolean(value.installed)
    boolean(value.removable)
    boolean(value.official)
  }

  function pluginsResult(value) {
    exact(value, ['inventoryRevision', 'bundles'])
    digestChars(value.inventoryRevision)
    list(value.bundles)
    for (const bundle of value.bundles) bundleShape(bundle)
  }

  function application(value) {
    if (!ADMIN_APPLICATIONS.has(value)) refuse(ADMIN_ERROR.payload)
  }

  function installResult(value) {
    exact(value, ['inventoryRevision', 'application', 'name'], ['version'])
    digestChars(value.inventoryRevision)
    application(value.application)
    text(value.name, ADMIN_LIMITS.nameChars)
    if (has(value, 'version')) text(value.version, ADMIN_LIMITS.nameChars)
  }

  function changeResult(value) {
    exact(value, ['inventoryRevision', 'application'])
    digestChars(value.inventoryRevision)
    application(value.application)
  }

  function enabledResult(value) {
    exact(value, ['inventoryRevision', 'application', 'enabled'])
    digestChars(value.inventoryRevision)
    application(value.application)
    boolean(value.enabled)
  }

  function namespaceShape(value) {
    exact(value, ['ns', 'revision', 'autoGenerate', 'schema', 'value', 'secrets'])
    text(value.ns, ADMIN_LIMITS.nameChars)
    natural(value.revision)
    boolean(value.autoGenerate)
    // schema and value are DSH's own redacted documents; the frame round-trip already made them
    // JSON, so their contents are never inspected (a value holds a secret slot's "set" state at
    // most, never the secret itself).
    list(value.secrets)
    for (const secret of value.secrets) {
      exact(secret, ['path', 'set'])
      list(secret.path)
      for (const step of secret.path) text(step, ADMIN_LIMITS.nameChars)
      boolean(secret.set)
    }
  }

  function settingsResult(value) {
    exact(value, ['writable', 'namespaces'])
    boolean(value.writable)
    list(value.namespaces)
    for (const entry of value.namespaces) namespaceShape(entry)
  }

  function mutateResult(value) {
    exact(value, ['ns', 'revision'])
    text(value.ns, ADMIN_LIMITS.nameChars)
    natural(value.revision)
  }

  const RESULTS = Object.freeze({
    [ADMIN_OPERATION.status]: statusResult,
    [ADMIN_OPERATION.restart]: statusResult,
    [ADMIN_OPERATION.modelGet]: modelResult,
    [ADMIN_OPERATION.modelSet]: modelSetResult,
    [ADMIN_OPERATION.pluginsGet]: pluginsResult,
    [ADMIN_OPERATION.pluginInstall]: installResult,
    [ADMIN_OPERATION.pluginRemove]: changeResult,
    [ADMIN_OPERATION.pluginEnable]: enabledResult,
    [ADMIN_OPERATION.pluginDisable]: enabledResult,
    [ADMIN_OPERATION.settingsGet]: settingsResult,
    [ADMIN_OPERATION.settingsMutate]: mutateResult,
  })

  /** Validate one request payload against its operation; throws AdminFailure. */
  function validateRequest(operation, payload) {
    if (!Object.hasOwn(REQUESTS, operation)) refuse(ADMIN_ERROR.operation)
    REQUESTS[operation](payload)
    return payload
  }

  /** Validate one result payload against its operation; throws AdminFailure. */
  function validateResult(operation, result) {
    if (!Object.hasOwn(RESULTS, operation)) refuse(ADMIN_ERROR.operation)
    RESULTS[operation](result)
    return result
  }

  /* ---------------------------------------------------------------- wire frames */

  /** The wire error object is a code plus revision facts; nothing else may ride in it. */
  function errorShape(value) {
    exact(value, ['code'], ['expected', 'actual'])
    if (typeof value.code !== 'string' || !ADMIN_CODES.has(value.code)) refuse(ADMIN_ERROR.payload)
    if (has(value, 'expected')) natural(value.expected)
    if (has(value, 'actual')) natural(value.actual)
    return value
  }

  function outcomeShape(value) {
    if (!value || typeof value !== 'object' || typeof value.ok !== 'boolean') refuse(ADMIN_ERROR.payload)
    if (value.ok) {
      if (!has(value, 'result') || has(value, 'error')) refuse(ADMIN_ERROR.payload)
    } else if (!has(value, 'error') || has(value, 'result')) refuse(ADMIN_ERROR.payload)
    return value
  }

  /**
   * The frame codec both ends use. Every frame is bounded before it is sent: the lifecycle wire
   * closes a connection whose frame overflows, and a typed `too-large` refusal is recoverable
   * while a dropped wire is not.
   */
  function createAdminCodec() {
    return Object.freeze({
      /** Build one request frame, with the payload validated for its operation. */
      request(operation, payload) {
        if (!Object.hasOwn(ADMIN_OPERATIONS, operation)) refuse(ADMIN_ERROR.operation)
        if (ADMIN_OPERATIONS[operation].local) refuse(ADMIN_ERROR.operation)
        validateRequest(operation, payload)
        return { v: ADMIN.version, id: randomUUID(), op: operation, payload }
      },

      /** One frame as wire text, bounded. */
      encode(frame) {
        let encoded
        try { encoded = JSON.stringify(frame) } catch { refuse(ADMIN_ERROR.payload) }
        if (Buffer.byteLength(encoded, 'utf8') > ADMIN_LIMITS.frameBytes) refuse(ADMIN_ERROR.limit)
        return encoded
      },

      /** Wire text as a frame, bounded and JSON-parsed; the shape check is the caller's. */
      decode(encoded) {
        if (typeof encoded !== 'string') refuse(ADMIN_ERROR.invalidFrame)
        if (Buffer.byteLength(encoded, 'utf8') > ADMIN_LIMITS.frameBytes) refuse(ADMIN_ERROR.limit)
        let frame
        try { frame = JSON.parse(encoded) } catch { refuse(ADMIN_ERROR.invalidFrame) }
        return frame
      },

      /** Validate an incoming request frame and its payload. */
      acceptRequest(frame) {
        exact(frame, ['v', 'id', 'op', 'payload'])
        if (frame.v !== ADMIN.version) refuse(ADMIN_ERROR.version)
        text(frame.id, ADMIN_LIMITS.nameChars)
        if (typeof frame.op !== 'string' || !Object.hasOwn(ADMIN_OPERATIONS, frame.op)) refuse(ADMIN_ERROR.operation)
        if (ADMIN_OPERATIONS[frame.op].local) refuse(ADMIN_ERROR.operation)
        validateRequest(frame.op, frame.payload)
        return frame
      },

      /**
       * Build one reply frame. `operation` validates a successful result; a refusal may be
       * answered without one, because the request that produced it may have had no valid
       * operation to begin with.
       */
      reply(id, operation, outcome) {
        text(id, ADMIN_LIMITS.nameChars)
        outcomeShape(outcome)
        if (outcome.ok) {
          if (!Object.hasOwn(ADMIN_OPERATIONS, operation)) refuse(ADMIN_ERROR.operation)
          validateResult(operation, outcome.result)
          return { v: ADMIN.version, id, ok: true, result: outcome.result }
        }
        return { v: ADMIN.version, id, ok: false, error: errorShape(outcome.error) }
      },

      /** Validate an incoming reply against the request it answers. */
      acceptReply(frame, operation) {
        try {
          exact(frame, ['v', 'id', 'ok'], ['result', 'error'])
          if (frame.v !== ADMIN.version || typeof frame.id !== 'string' || typeof frame.ok !== 'boolean') {
            refuse(ADMIN_ERROR.invalidResponse)
          }
          outcomeShape(frame)
          if (frame.ok) {
            validateResult(operation, frame.result)
            return { ok: true, result: frame.result }
          }
          return { ok: false, error: errorShape(frame.error) }
        } catch { refuse(ADMIN_ERROR.invalidResponse) }
      },
    })
  }

  return Object.freeze({ validateRequest, validateResult, createAdminCodec })
}
