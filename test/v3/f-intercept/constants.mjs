/**
 * Vocabulary for the F-INTERCEPT cases (v3-tasks.md row F-INTERCEPT; .runtime/reports/v3-remaining-plan.md
 * W2): EVT-UC-02, EVT-UC-03, EVT-EP-03, EVT-EP-05, EVT-DT-02, EVT-DT-03, EVT-DT-04, EVT-ST-02.
 *
 * Every product value comes from a frozen contract module, never from an implementation:
 * - K1 `fishball-connector/mcp-schema` (event types, tool names, offer ids, the events resource);
 * - K2 `fishball-connector/tools` (the contributed-type prefix, through K1's re-export);
 * - K3 `packages/core/contracts/events.d.ts` (types only, so its three values are read from the
 *   declaration text: the default priority, the `fenced` code and the `disconnected` code).
 * DSH's own vocabulary (session-log event kinds, the cancel cause) is the installed SDK's. The rest is
 * fixture data (plugin ids, markers) and harness timing, which are not product values.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, TOOL } from '../../../packages/connector/mcp-schema/index.js'
import { REPO } from '../../support/constants.mjs'

export { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, TOOL }

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

/** DSH's own session-log vocabulary (installed SDK; observed through its public persistence). */
export const DSH = Object.freeze({
  userMessage: 'user/message',
  turnEnd: 'turn/end',
  preStep: 'agent/pre-step',
  /** The closer resume appends for a turn a crash interrupted (DSH's crash notice). */
  interrupted: 'interrupted',
  userCancel: Object.freeze({ kind: 'user' }),
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
  otherText: 'FBTEST-OTHER side session turn',
  answer: 'fbtest-answer',
  modelText: 'fbtest ok',
  files: Object.freeze({ connector: 'connector.json', model: 'model.jsonl', interceptor: 'interceptor.jsonl', created: 'created', domain: 'domain', sessions: 'sessions' }),
  tempPrefix: 'fbtest-f-intercept-',
})

/** Harness waits only; never a product oracle. */
export const WAIT = Object.freeze({ settleMs: 20000, quietMs: 800, pollMs: 25, childMs: 90000, testMs: 180000 })

/** Owners of rows this task cannot check (v3-tasks.md W2–W6). */
export const LATER = Object.freeze({
  mailbox: 'C-MAILBOX (EVT-UC-01 / R-EVS-04: an external agent\'s subscription is served by the connector, with no interception)',
  wdDecide: 'WD-DECIDE (Watchdog allow / justified reject / escalate and its non-waking settlement note, R-WD-09)',
  // K3's registration names no fiber, so "not ready" is only observable when the registration comes
  // through `ctx.fishballInstance` in the plugin's own context, which core's service row provides.
  wire: 'F-WIRE (core\'s service row provides fishballInstance, so a registration carries its plugin\'s fiber and readiness)',
  e2e: 'E2E-CORE (W6 browser flow: the user removes a queued Fishball event from DSH\'s inbox)',
})
