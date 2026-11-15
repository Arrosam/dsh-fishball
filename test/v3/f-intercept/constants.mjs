/**
 * Vocabulary for the F-INTERCEPT cases (v3-tasks.md row F-INTERCEPT; .runtime/reports/v3-remaining-plan.md
 * W2): EVT-UC-02, EVT-UC-03, EVT-EP-03, EVT-EP-05, EVT-DT-02, EVT-DT-03, EVT-DT-04, EVT-ST-02.
 *
 * Every product value comes from a frozen contract module, never from an implementation:
 * - K1 `dsh-connector/mcp-schema` (event types, tool names, offer ids, the events resource);
 * - K2 `dsh-connector/tools` (the contributed-type prefix, through K1's re-export);
 * - K3 `packages/core/contracts/events.d.ts` (types only, so its three values are read from the
 *   declaration text: the default priority, the `fenced` code and the `disconnected` code).
 * - K3 `packages/core/contracts/constants.js`, for the values the user's decisions of 2026-11-14 name
 *   (`PRESENT_RETRY`, `TEXT.presentGivenUp`, `REASON.presentGivenUp`, `STATE`, `MESSAGE.idPrefix`); read,
 *   never re-typed (see CORE). K1's values above live in K1 `mcp-schema/constants.js`.
 * DSH's own vocabulary (session-log event kinds, the cancel causes) is the installed SDK's. The rest is
 * fixture data (plugin ids, markers) and harness timing, which are not product values.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, LINK_REFUSAL, TOOL } from '../../../packages/dsh-connector/mcp-schema/index.js'
// A namespace import: a value the product has not exported yet fails the cases that use it, with a
// reason, instead of failing this whole file at module link time (test-first).
import * as EVENTS_CONSTANTS from '../../../packages/core/contracts/constants.js'
import { REPO } from '../../support/constants.mjs'

export { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, LINK_REFUSAL, TOOL }

/** The F-INTERCEPT "Owns" folder. FBTEST_F_INTERCEPT_ENTRY moves the entry (another checkout). */
export const SUBJECT = Object.freeze({
  dir: path.join(REPO, 'packages', 'core', 'src', 'events'),
  entry: process.env.FBTEST_F_INTERCEPT_ENTRY ?? path.join(REPO, 'packages', 'core', 'src', 'events', 'index.js'),
  /** A factory export found by meaning when the module has more than one function export. */
  factoryName: /^create.*(?:event|intercept)/i,
})

/** K3's declaration file for the interception service. */
const EVENTS_DTS = path.join(REPO, 'packages', 'core', 'contracts', 'events.d.ts')
const read = () => fs.readFileSync(EVENTS_DTS, 'utf8')
const pick = (pattern, what) => {
  const m = pattern.exec(read())
  if (!m) throw new Error(`K3 events.d.ts states no ${what}`)
  return m[1]
}
/**
 * The three K3 values the cases need: "`priority` … (default 0)", the `fenced` literal of
 * `CommitResult`, and the `disconnected` code a rejected `send` resolves to.
 */
export const K3 = Object.freeze({
  get defaultPriority() { return Number(pick(/`priority`[^()]*\(default (-?\d+)\)/, 'default priority')) },
  get fenced() { return pick(/type CommitResult\s*=[^\n]*code:\s*'([^']+)'/, 'fenced code') },
  get disconnected() { return pick(/rejected `send` resolves `\{ok: false, code: '([^']+)'\}`/, 'disconnected code') },
  /** R-INT-01: the controller's members, exactly (K3 "It has exactly these three members"). */
  controller: Object.freeze(['accept', 'commit', 'release']),
})

/** One named export of the events module's constants.js, or a clear failure when it is missing. */
const coreValue = (name) => {
  const value = EVENTS_CONSTANTS[name]
  if (value === undefined) throw new Error(`packages/core/contracts/constants.js exports no ${name} (decision 2026-11-14)`)
  return value
}
/**
 * The user's decisions 2026-11-14 3 and 4 name these values in the events module's constants.js:
 * the presenter retry schedule, the give-up notice and its log reason, and the ledger's admitted state.
 */
export const CORE = Object.freeze({
  /** `{attempts, backoffMs, backoffFactor}` (decision 3). */
  get presentRetry() { return coreValue('PRESENT_RETRY') },
  /** The notice text Fishball gets for a given-up event (decision 3). */
  presentGivenUp: (eventId, type) => coreValue('TEXT').presentGivenUp(eventId, type),
  get presentGivenUpReason() { return coreValue('REASON').presentGivenUp },
  /** The acceptance ledger's state of an admitted event (decision 4). */
  get admitted() { return coreValue('STATE').admitted },
  /** The acceptance ledger's state of an interceptor record whose commit began (K3 `committing`). */
  get committing() { return coreValue('STATE').committing },
  /** Every acceptance-ledger state, to read a record's state without knowing its field (decision 4). */
  get states() { return Object.values(coreValue('STATE')) },
  /** The id of the DSH inbox message core hands Fishball for `eventId` (decision 4, row 11e). */
  messageId: (eventId) => coreValue('MESSAGE').idPrefix + eventId,
  /** `{domain, table}`: where the acceptance ledger lives in dsh-storage-domain, to read a record (row 11e). */
  get ledger() { return coreValue('LEDGER') },
})

/** DSH's own session-log vocabulary (installed SDK; observed through its public persistence). */
export const DSH = Object.freeze({
  userMessage: 'user/message',
  turnEnd: 'turn/end',
  preStep: 'agent/pre-step',
  /** dsh-agent's live notice of an agent's status change (`idle` ⇄ `running`). */
  agentStatus: 'agent/status',
  running: 'running',
  /** dsh-agent's durable inbox mutation (`data.inserted` holds the messages it queued). */
  inboxSpliced: 'agent/inbox/spliced',
  /** The closer resume appends for a turn a crash interrupted (DSH's crash notice). */
  interrupted: 'interrupted',
  userCancel: Object.freeze({ kind: 'user' }),
  /** dsh-session `AgentCancelCause` variants other than the user's Stop. */
  parentCancel: Object.freeze({ kind: 'parent' }),
  hookCancel: Object.freeze({ kind: 'hook', reason: 'fbtest-hook' }),
  disposedCancel: Object.freeze({ kind: 'disposed' }),
  /** dsh-agent `PreStepDecision` that rejects the step: the turn ends `blocked`. */
  rejectStep: Object.freeze({ kind: 'reject' }),
  /** `turn/end` reason kinds (dsh-session `TurnEndReasonMap`). */
  ended: Object.freeze({ aborted: 'aborted', error: 'error', blocked: 'blocked' }),
  idle: 'idle',
  /** cordis's logger type of a warning. */
  warn: 'warn',
  sdkPlugins: Object.freeze([
    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-storage',
  ]),
  executor: '@deepseek-ai/dsh-tool-executor-native',
  storageJson: '@deepseek-ai/dsh-storage-json',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  persistence: '@deepseek-ai/dsh-session-persistence-jsonl',
  checkpoint: '@deepseek-ai/dsh-session-checkpoint-policy',
  agentLoop: '@deepseek-ai/dsh-agent-loop',
  cordis: '@deepseek-ai/cordis',
  llm: '@deepseek-ai/dsh-llm',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so nothing core logs is missed. */
  allLevels: 3,
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  pluginX: 'fbtest-x',
  pluginY: 'fbtest-y',
  fishballSession: 'fbtest-fishball',
  /** The session the Fishball agent moves to when its session is replaced (decision 2026-11-14 4). */
  replacementSession: 'fbtest-fishball-2',
  otherSession: 'fbtest-other',
  watchedSession: 'fbtest-s1',
  provider: 'fbtest-fake',
  model: 'fbtest-fake',
  /** EVT-UC-02's own example type, `contributed:demo.ping`. */
  contributed: 'demo.ping',
  namespace: 'demo',
  contributedEvent: 'ping',
  generation: 'fbtest-gen-1',
  marker: 'FBTEST-EVT-',
  secret: 'FBTEST-SECRET-',
  busyId: 'fbtest-busy',
  busyText: 'FBTEST-BUSY long user task',
  laterId: 'fbtest-later',
  laterText: 'FBTEST-LATER next user turn',
  /** The user's ordinary message that wakes Fishball right after a restart (row 11e). */
  userId: 'fbtest-user',
  userText: 'FBTEST-USER ordinary message after the restart',
  otherText: 'FBTEST-OTHER side session turn',
  answer: 'fbtest-answer',
  modelText: 'fbtest ok',
  fault: 'fbtest: injected fault',
  logSuffix: '.jsonl',
  files: Object.freeze({ connector: 'connector.json', model: 'model.jsonl', interceptor: 'interceptor.jsonl', window: 'window.json', created: 'created', domain: 'domain', sessions: 'sessions' }),
  tempPrefix: 'fbtest-f-intercept-',
})

/** Harness waits only; never a product oracle. */
export const WAIT = Object.freeze({
  settleMs: 20000, quietMs: 800, pollMs: 25, childMs: 90000, testMs: 180000,
  /** Event-loop turns (setImmediate) given to a settled handler's tail before an unhandled rejection is ruled out. */
  immediateTurns: 5,
})

/** Node's process events a case listens to. */
export const PROCESS_EVENT = Object.freeze({ unhandledRejection: 'unhandledRejection' })

/** Owners of rows this task cannot check (v3-tasks.md W2–W6). */
export const LATER = Object.freeze({
  mailbox: 'C-MAILBOX (EVT-UC-01 / R-EVS-04: an external agent\'s subscription is served by the connector, with no interception)',
  // K3's registration names no fiber, so "not ready" is only observable when the registration comes
  // through `ctx.fishballInstance` in the plugin's own context, which core's service row provides.
  wire: 'F-WIRE (core\'s service row provides fishballInstance, so a registration carries its plugin\'s fiber and readiness)',
  e2e: 'E2E-CORE (W6 browser flow: the user removes a queued Fishball event from DSH\'s inbox)',
})
