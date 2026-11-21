/**
 * Oracle values of the fishball-heartbeat cases, taken only from the requirements the lead relayed
 * (the user's words plus the derived row contract, and the lead's refinement of 2026-11-21: a turn
 * that entered no step is neutral; plain setTimeout; remaining <= 0 is overdue). No file under
 * packages/fishball-amenities/heartbeat/ was read.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

/** The installed SDK's packages the world is built from (read only), and their vocabulary. */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  session: '@deepseek-ai/dsh-session',
  llm: '@deepseek-ai/dsh-llm',
  /** A loader row naming a built-in plugin. */
  builtinPrefix: 'cordis:',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so no line is missed. */
  allLevels: 3,
  /** cordis FiberState.ACTIVE. */
  fiberActive: 2,
  warn: 'warn',
  services: Object.freeze({ tools: 'tools', profileContext: 'profileContext', instance: 'fishballInstance', appReady: 'appReady' }),
  event: Object.freeze({ turnStart: 'turn/start', stepStart: 'step/start', stepEnd: 'step/end', userMessage: 'user/message', turnEnd: 'turn/end' }),
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
  entry: path.join(REPO, 'packages', 'fishball-amenities', 'heartbeat', 'index.js'),
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
  notice: Object.freeze({ pluginId: PLUGIN_ID, wake: true }),
})

/** user/message sources (decision-table conditions). */
export const SOURCE = Object.freeze({
  user: Object.freeze({ kind: 'user' }),
  heartbeat: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: PLUGIN_ID }),
  /** Another plugin's notice: not a heartbeat. */
  otherPlugin: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: 'fbtest-other-plugin' }),
  /** Some other producer's user/message (an injected context). */
  otherKind: Object.freeze({ kind: 'fbtest-other-kind' }),
})

/** Turn shapes: the sources a turn admits inside its step; `empty` enters no step (neutral). */
export const TURN = Object.freeze({
  real: Object.freeze([SOURCE.user]),
  heartbeat: Object.freeze([SOURCE.heartbeat]),
  mixed: Object.freeze([SOURCE.heartbeat, SOURCE.user]),
  otherPlugin: Object.freeze([SOURCE.otherPlugin]),
  otherKind: Object.freeze([SOURCE.otherKind]),
  heartbeatAndOther: Object.freeze([SOURCE.heartbeat, SOURCE.otherPlugin]),
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
  /** Hostile or out-of-contract argument shapes (all invalid-input). */
  invalidArgs: Object.freeze([
    Object.freeze({ label: 'no focus', args: Object.freeze({}) }),
    Object.freeze({ label: 'numeric focus', args: Object.freeze({ focus: 5 }) }),
    Object.freeze({ label: 'null focus', args: Object.freeze({ focus: null }) }),
    Object.freeze({ label: 'array focus', args: Object.freeze({ focus: Object.freeze(['a']) }) }),
    Object.freeze({ label: 'extra intervalSeconds', args: Object.freeze({ focus: 'a', intervalSeconds: 1 }) }),
    Object.freeze({ label: 'extra maxConsecutive', args: Object.freeze({ focus: 'a', maxConsecutive: 99 }) }),
    Object.freeze({ label: 'extra unknown key', args: Object.freeze({ focus: 'a', fbtest: true }) }),
    Object.freeze({ label: 'null arguments', args: null }),
  ]),
})

export const WAIT = Object.freeze({
  testMs: 60_000,
  /** Real time given to the row's async work before "nothing happened" is concluded. */
  settleMs: 60,
  pollMs: 5,
  untilMs: 5_000,
})
