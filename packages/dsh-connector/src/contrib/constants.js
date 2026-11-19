/**
 * The contribution service's own constants (task C-EXT; design §13; spike V3-S5 `8f2788e`). Every
 * contract value (limits, codes, names, the quarantine rule) is K2's, in `../../tools`; this file
 * holds only what C-EXT itself needs to talk to the Cordis host and to write its log.
 */

/** Values read from, or handed to, the Cordis host (cordis 4.0.5 on 0.2.1-rc.5, 4.1.0 on 0.2.2-rc.1). */
export const HOST = Object.freeze({
  /**
   * Cordis `FiberState.LOADING` and `.ACTIVE` (a const enum, so not exported at runtime; the same
   * numbers on both versions). A registration is visible and callable only while its owner fiber
   * is in one of them (S5 Q4): a fiber turns UNLOADING before its effect disposers run (S5 L2).
   */
  liveFiberStates: Object.freeze([1, 2]),
  /**
   * Cordis's tracker (`symbols.tracker` is `Symbol.for('cordis.tracker')` on both versions). A
   * service object carrying it is traced: in its methods `this.ctx` is the context the caller
   * reached the service through (S5 I1), so `register(def)` needs no `ctx` argument. `noShadow`
   * keeps that use-site context instead of the provider's.
   */
  tracker: Symbol.for('cordis.tracker'),
  trackerOptions: Object.freeze({ property: 'ctx', noShadow: true }),
  /**
   * Where a contributor's activation record lives: on its root fiber (S5 Q2). A global symbol, so a
   * reloaded connector (a fresh module instance after a hot reload) finds the same record, and the
   * quarantine on it survives the connector's reload (EXT-ST-01 #8a).
   */
  activationKey: Symbol.for('dsh-connector.contrib.activation'),
  /** Cordis effect labels, shown in Cordis's own diagnostics. */
  labels: Object.freeze({
    service: 'dsh-connector: dshConnectorTools',
    activation: 'dsh-connector: contributor activation',
    registration: 'dsh-connector: contributed tool',
  }),
})

/**
 * How a loader entry's module specifier names its package (S5 I3): a `cordis:` builtin has none;
 * a relative, absolute or `file:` specifier is a path row, whose package is the nearest
 * `package.json`; anything else is a bare package specifier (`name` or `@scope/name`, maybe with a
 * subpath). The npm scope syntax itself (`@`, `/`) is K2's NAMESPACE.scopePrefix / scopeSeparator.
 */
export const SPECIFIER = Object.freeze({
  builtinPrefix: 'cordis:',
  relativePrefix: '.',
  absolutePrefix: '/',
  fileScheme: 'file:',
  scopedSegments: 2,
  plainSegments: 1,
  manifestEncoding: 'utf8',
  /**
   * A file name under a directory, for asking Node for that directory's nearest manifest
   * (`findPackageJSON` takes a file location; the file need not exist).
   */
  probeFile: 'index.js',
  // Decided by Fishball (2026-11-14, #7): a package with no string `version` is still a
  // contributor; `_meta` then carries the empty version.
  noVersion: '',
})

/** Field names of a ContributedResult and of the advertised output schema's success branch. */
export const RESULT_FIELD = Object.freeze({ ok: 'ok', data: 'data', text: 'text', code: 'code', message: 'message' })
/** The only keys each ContributedResult branch may have; anything else is a bad shape (design §13.5). */
export const RESULT_KEYS = Object.freeze({
  success: Object.freeze([RESULT_FIELD.ok, RESULT_FIELD.data, RESULT_FIELD.text]),
  refusal: Object.freeze([RESULT_FIELD.ok, RESULT_FIELD.code, RESULT_FIELD.message]),
})

/**
 * Why a call counted as `contributor-failed`. Each is logged once per (activation, kind)
 * (R-EXT-08; decided by Fishball 2026-11-14, #7), and each counts toward the quarantine
 * (Fishball #2: a bad shape, an output-schema mismatch and an oversize result count like a crash
 * or a timeout).
 */
export const FAILURE_KIND = Object.freeze({
  threw: 'threw',
  timeout: 'timeout',
  shape: 'bad-shape',
  oversize: 'oversize',
  outputSchema: 'output-schema',
})

/**
 * The log (R-EXT-15): the namespace, a tool's local name and a code or kind only. Never arguments,
 * results, payloads, principals or tokens (R-SEC-02).
 */
export const LOG = Object.freeze({
  name: 'dsh-connector-contrib',
  registered: 'contributor %s registered tool %s',
  refused: 'contributor %s: registration refused (%s)',
  unidentified: '(unidentified)',
  withdrawn: 'contributor %s withdrawn',
  quarantined: 'contributor %s quarantined',
  failed: 'contributor %s tool %s failed (%s)',
  portFailed: 'contributor %s: event not queued, %s failed (%s)',
  emitFailed: 'an event was not queued: emit failed (%s)',
  retireFailed: 'contributor %s: a pending event could not be retired (%s)',
  listChangedFailed: 'tools list change could not be sent (%s)',
})

/** The emit pipeline's own values (emit.js). */
export const EMIT = Object.freeze({
  /** Joins the contributor namespace and the recipient key of a rate bucket; in neither grammar. */
  bucketKeySeparator: '\u0000',
  /** Thrown at load when emit.js's check order no longer matches K2's EMIT_CHECK_ORDER. */
  orderMismatch: 'dsh-connector contrib: emit no longer follows K2 EMIT_CHECK_ORDER',
})

/** Thrown by a second `provide` of one createContributions (index.js: one per connector activation). */
export const SERVICE_REUSED = 'dsh-connector contrib: provide() called twice; create one per connector activation'

/** Which port failed, for LOG.portFailed. */
export const PORT = Object.freeze({ sessionExists: 'sessionExists', router: 'router', mailbox: 'mailbox' })
