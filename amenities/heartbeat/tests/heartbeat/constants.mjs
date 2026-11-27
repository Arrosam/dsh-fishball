/**
 * Oracle values of the fishball-heartbeat cases, taken only from the requirements the lead relayed
 * (the user's words plus the derived row contract) and the lead's two refinements of 2026-11-21:
 * (1) a turn that entered no step is neutral; plain setTimeout; remaining <= 0 is overdue;
 * (2) after core's event batching (165b734c): work messages (user, fishball-event, schedule, another
 * plugin's notice) make a turn real; focus is an optional untyped field; a timer firing more than
 * 5000 ms late is dropped with a warning; the armed delay is capped at the interval.
 * No file under the package's src/ (fishball-amenities/heartbeat/ before the amenities split,
 * 2026-11-21) was read; index.js and src/config.js are imported as modules.
 */
import path from 'node:path'

/** This package's folder (tests/heartbeat/ is two levels below it). */
const PACKAGE_DIR = path.join(import.meta.dirname, '..', '..')

/**
 * The current DSH's packages the world is built from (read only, through fishball-test-helpers/dsh
 * importDsh: they are the host, not packages of this repository), and their vocabulary.
 */
export const DSH = Object.freeze({
  cordis: 'cordis',
  loader: 'cordis-plugin-loader',
  session: 'dsh-session',
  llm: 'dsh-llm',
  /** A loader row naming a built-in plugin. */
  builtinPrefix: 'cordis:',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so no line is missed. */
  allLevels: 3,
  /** cordis FiberState.ACTIVE. */
  fiberActive: 2,
  warn: 'warn',
  /** Logger types a failure may be logged at. */
  problemLevels: Object.freeze(['warn', 'error']),
  services: Object.freeze({ tools: 'tools', profileContext: 'profileContext', instance: 'fishballInstance', appReady: 'appReady' }),
  event: Object.freeze({ turnStart: 'turn/start', stepStart: 'step/start', stepEnd: 'step/end', userMessage: 'user/message', turnEnd: 'turn/end', inboxSpliced: 'agent/inbox/spliced' }),
  /** dsh-agent-loop's pending-input lists: inject/steer splice into next-step, followup into next-turn. */
  inbox: Object.freeze({ nextStep: 'next-step', nextTurn: 'next-turn' }),
  /** Surface placement every user/message append needs (dsh-session SurfaceIntent). */
  surface: Object.freeze({ surfaceOp: 'append' }),
  textBlock: 'text',
  /** TurnEndReason values; the contract says the reason never matters. */
  endReason: Object.freeze({
    completed: Object.freeze({ kind: 'completed' }),
    aborted: Object.freeze({ kind: 'aborted', reason: Object.freeze({ kind: 'legacy' }) }),
    error: Object.freeze({ kind: 'error', error: Object.freeze({ message: 'fbtest failure', code: 'UNKNOWN' }) }),
  }),
})

const PLUGIN_ID = 'fishball-heartbeat'

/** The row's public contract. */
export const HEARTBEAT = Object.freeze({
  name: PLUGIN_ID,
  /** Its own package since the amenities split (the user, 2026-11-21). */
  entry: path.join(PACKAGE_DIR, 'index.js'),
  /** fishballInstance.apiVersion the row attaches to; any other reads as missing. */
  apiVersion: 2,
  olderApiVersion: 1,
  coreMissing: 'fishball-core-missing',
  /** <home>/fishball-heartbeat/ holds the saved focus. */
  storeDir: PLUGIN_ID,
  tool: 'heartbeat_focus',
  argument: 'focus',
  code: Object.freeze({ notManager: 'not-manager', invalidInput: 'invalid-input', focusUnavailable: 'focus-unavailable' }),
  config: Object.freeze({ interval: 'intervalSeconds', max: 'maxConsecutive' }),
  /** intervalSeconds 1 … 2147483 (setTimeout's limit in seconds); maxConsecutive >= 1. */
  limit: Object.freeze({ intervalMin: 1, intervalMax: 2_147_483, maxMin: 1, focusCodePoints: 2000 }),
  /** A heartbeat whose timer fires more than this after (turn end + interval) is dropped (refinement 2, item 3). */
  lateToleranceMs: 5000,
  /** dsh-tools' defineTool refusal of non-object arguments, thrown before execute runs (refinement 2, item 2). */
  argsErrorCode: 'INVALID_ARGS',
  notice: Object.freeze({ pluginId: PLUGIN_ID, wake: true }),
})

/**
 * R2/R3 of the amenities' settings pages (the lead, 2026-11-22): the heartbeat's two settings are
 * volatile and keep their type, bounds and descriptions (the text before this change, git HEAD); a
 * live change re-applies the row without remounting it. (fishball-board's fields staying non-volatile
 * is another package's Config: an integration row, not this package's.)
 */
export const LIVE = Object.freeze({
  fields: Object.freeze([
    Object.freeze({ name: 'intervalSeconds', type: 'number', step: 1, min: 1, max: 2_147_483, absent: Object.freeze(['default']), description: 'Seconds without any Fishball turn before a heartbeat turn is sent. Set it below your model\'s cache lifetime. Leave empty to turn heartbeats off.' }),
    Object.freeze({ name: 'maxConsecutive', type: 'number', step: 1, min: 1, absent: Object.freeze(['default', 'max']), description: 'Heartbeat turns allowed in a row with no other turn between them; after that the cache is left to cool until the next real turn. Leave empty to turn heartbeats off.' }),
  ]),
  /** Another branch adds this field; the rows tolerate it but never require it. */
  optionalField: 'compactThresholdTokens',
  config: path.join(PACKAGE_DIR, 'src', 'config.js'),
})

/** user/message sources (decision-table conditions). */
export const SOURCE = Object.freeze({
  user: Object.freeze({ kind: 'user' }),
  heartbeat: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: PLUGIN_ID }),
  /** Another plugin's notice: not a heartbeat. */
  otherPlugin: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: 'fbtest-other-plugin' }),
  /** core's event batch (one Fishball turn per batch; packages/core/contracts FISHBALL_EVENT sourceKind). */
  fishballEvent: Object.freeze({ kind: 'fishball-event', events: Object.freeze([Object.freeze({ key: 'fbtest-key-1', eventId: 'fbtest-event-1', type: 'fbtest.event', targetId: 'fbtest-target' })]) }),
  /** core's reminders. */
  schedule: Object.freeze({ kind: 'schedule' }),
  /** fishball-taskboard's reminder, which it injects right after every compaction/end (the incident of 2026-11-22). */
  taskboard: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: 'fishball-taskboard' }),
  /** meow-memory's own turn (its 'dream'): no work kind, so a step admitting only it is real (HB-DT-01 parts 4/6). */
  meowDream: Object.freeze({ kind: 'plugin:meow-memory' }),
  /** Injected contexts: they decide nothing. */
  runtimeContext: Object.freeze({ kind: 'runtime-context' }),
  timeContext: Object.freeze({ kind: 'time-context' }),
})

/** Turn shapes: the sources a turn admits inside its step; `empty` enters no step (neutral). */
export const TURN = Object.freeze({
  real: Object.freeze([SOURCE.user]),
  heartbeat: Object.freeze([SOURCE.heartbeat]),
  mixed: Object.freeze([SOURCE.heartbeat, SOURCE.user]),
  otherPlugin: Object.freeze([SOURCE.otherPlugin]),
  fishballEvent: Object.freeze([SOURCE.fishballEvent]),
  schedule: Object.freeze([SOURCE.schedule]),
  runtimeContext: Object.freeze([SOURCE.runtimeContext]),
  heartbeatAndOther: Object.freeze([SOURCE.heartbeat, SOURCE.otherPlugin]),
  heartbeatAndEvent: Object.freeze([SOURCE.heartbeat, SOURCE.fishballEvent]),
  heartbeatAndSchedule: Object.freeze([SOURCE.heartbeat, SOURCE.schedule]),
  heartbeatAndContexts: Object.freeze([SOURCE.runtimeContext, SOURCE.heartbeat, SOURCE.timeContext]),
  /** A step with no user/message at all: "neither", so real. */
  stepOnly: Object.freeze([]),
  empty: null,
})

export const TIME = Object.freeze({
  secondMs: 1000,
  /** A fixed start for the fake clock (2026-11-20T00:00:00Z). */
  epochMs: Date.UTC(2026, 10, 20),
  /** The interval most cases use, and how long "silence" is watched (many intervals). */
  intervalSeconds: 60,
  silenceIntervals: 10,
})

/** Fixture data; every value is a test value, not a product one. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-heartbeat-',
  homeDir: 'dsh-home',
  profileName: 'fishball',
  callIdPrefix: 'fbtest-call-',
  rejectMessage: 'fbtest notify refused',
  focus: 'fbtest-focus: check managed sessions A and B',
  otherFocus: 'fbtest-focus-2: review the board',
  padded: '  fbtest-padded focus \n',
  blank: ' \n\t ',
  /** One astral code point (two UTF-16 units): lengths count code points. */
  astral: '\u{1F41F}',
  ascii: 'x',
  /** Object arguments the tool itself must refuse with a returned invalid-input. */
  invalidArgs: Object.freeze([
    Object.freeze({ label: 'no focus', args: Object.freeze({}) }),
    Object.freeze({ label: 'numeric focus', args: Object.freeze({ focus: 5 }) }),
    Object.freeze({ label: 'null focus', args: Object.freeze({ focus: null }) }),
    Object.freeze({ label: 'array focus', args: Object.freeze({ focus: Object.freeze(['a']) }) }),
    Object.freeze({ label: 'extra intervalSeconds', args: Object.freeze({ focus: 'a', intervalSeconds: 1 }) }),
    Object.freeze({ label: 'extra maxConsecutive', args: Object.freeze({ focus: 'a', maxConsecutive: 99 }) }),
    Object.freeze({ label: 'extra unknown key', args: Object.freeze({ focus: 'a', fbtest: true }) }),
  ]),
  /** Non-object arguments: defineTool may throw ToolArgsError before the tool runs (accepted), or the tool returns invalid-input. */
  nonObjectArgs: Object.freeze([
    Object.freeze({ label: 'null arguments', args: null }),
    Object.freeze({ label: 'array arguments', args: Object.freeze(['a']) }),
    Object.freeze({ label: 'string arguments', args: 'a' }),
  ]),
  /** A non-turn record in the manager log: an event core holds but has not delivered yet. */
  pendingRecord: 'plugin:fbtest/event-pending',
  meterMessage: 'fbtest token meter failure',
  meterCode: 'FBTEST_METER',
  compactionMessage: 'fbtest compaction failure',
  shadowedTokens: 100,
  /** The compaction/summary and checkpoint message the fake engine writes, as dsh-compaction-basic does. */
  compactionProvider: 'fbtest-provider',
  compactionModel: 'fbtest-model',
  checkpointText: 'fbtest compaction summary',
  /** The command id /compact records on its compaction (sourceCommandId). */
  commandId: 'fbtest-command-compact',
  /** Suffix of a compactionId no start in the log carries. */
  otherCompactionId: 'unmatched',
})

/**
 * Compaction on cooling (the user's requirement of 2026-11-21, relayed by the lead): when the
 * heartbeat gives up warming the cache it measures Fishball's context (tokenMeter.measure(session)
 * .totalTokens) and, strictly above compactThresholdTokens (a natural number, default 256000, row
 * config only), compacts it once per cooling through compactNow(agent, signal) of the engine read
 * as agentPresets.serviceFor(agent, 'compaction'), else the host-plane 'compaction' service.
 */
export const COMPACT = Object.freeze({
  config: 'compactThresholdTokens',
  defaultThreshold: 256_000,
  services: Object.freeze({ tokenMeter: 'tokenMeter', compaction: 'compaction', agentPresets: 'agentPresets' }),
  meter: Object.freeze({ present: 'present', absent: 'absent', throws: 'throws' }),
  /** What the fake compactNow does: commit a compaction, find nothing, reject, throw at once, or wait for abort. */
  result: Object.freeze({ compacted: 'compacted', nothing: 'nothing', reject: 'reject', throws: 'throws', hang: 'hang' }),
  provider: Object.freeze({ preset: 'preset', host: 'host' }),
  /** dsh-compaction ManualCompactionError and one of its codes. */
  errorName: 'ManualCompactionError',
  errorCode: 'summary',
  baselineKind: 'estimated',
  event: Object.freeze({ start: 'compaction/start', summary: 'compaction/summary', end: 'compaction/end' }),
  /** dsh-compaction's checkpoint message source kind (COMPACT_CHECKPOINT_MARKER). */
  checkpointKind: 'compact-checkpoint',
  idPrefix: 'fbtest-compaction-',
})

export const WAIT = Object.freeze({
  testMs: 60_000,
  /** Real time given to the row's async work before "nothing happened" is concluded. */
  settleMs: 60,
  pollMs: 5,
  untilMs: 5_000,
})
