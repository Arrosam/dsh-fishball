/**
 * Vocabulary for the F-FACADE cases (v3-tasks.md row F-FACADE; .runtime/reports/v3-w3-briefs.md
 * "F-FACADE"): EXT-DT-03 rows E6 and E8 (Fishball side), EXT-UC-02 A3, and the core side of
 * EXT-UC-04 A1. Requirements R-EXT-05/13/14/20, R-UI-08/09, R-FB-06, R-FN-01, design §6.3.
 *
 * Every product value comes from a frozen contract, never from an implementation:
 * - K1 `dsh-connector/mcp-schema`: the core tool list (`TOOLS`), the target states, the
 *   `disconnected` answer (`LINK_REFUSAL`), `unsupported-operation` (`REFUSAL`), event types;
 * - K2 `dsh-connector/tools`: the public-name separator, the embed-UI alias, the contributor
 *   `_meta` key;
 * - design §13.6 (flag D§13.6): embed-UI's attention tools' local names and results;
 * - design §6.3: "no raw `mcp__…` tool" (the prefix DSH's own MCP client gives every MCP tool).
 * DSH's own vocabulary is the installed SDK's. The rest is fixture data and harness timing.
 */
import path from 'node:path'
import {
  CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, LINK_REFUSAL, REFUSAL, TARGET_CODE, TARGET_STATE, TOOL, TOOLS,
} from '../../../packages/dsh-connector/mcp-schema/index.js'
import * as K2_TOOLS from '../../../packages/dsh-connector/tools/index.js'
import { REPO } from '../../support/constants.mjs'

export { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, TOOL, TOOLS }

/** The F-FACADE "Owns" folder. FBTEST_F_FACADE_ENTRY moves the entry (another checkout). */
export const SUBJECT = Object.freeze({
  dir: path.join(REPO, 'packages', 'core', 'src', 'bridge'),
  entry: process.env.FBTEST_F_FACADE_ENTRY ?? path.join(REPO, 'packages', 'core', 'src', 'bridge', 'index.js'),
  /** The relayed factory (Fishball 2026-11-15, subject.mjs). */
  factory: 'createBridge',
  /** The bridge's source files the static row reads (`packages/core/src/bridge/*.js`). */
  sourceFile: /\.js$/,
})

/**
 * K2 amendment at the W3 merge (DECIDED #W3-2): the façade applies K2's EXTERNAL_NAME. Its own
 * exports (`modelNameOf(name)`, `MODEL_NAME.dot`, `MODEL_NAME.separator`) were named in the
 * amendment. `restated` finds the mapping's replacement written as a quoted string literal of its
 * own (`'__'`, `"__"` or a template); `'mcp__'` (the raw-prefix constant) does not match.
 */
export const EXTERNAL = Object.freeze({
  id: 'K2-AMEND-1 (F-FACADE)',
  modelNameOf: 'modelNameOf',
  constants: 'MODEL_NAME',
  restated: /(['"`])__\1/,
  /** Public names with 1, 2 and 3 dots, and a core tool name (no namespace): the decision's own examples first. */
  mapped: Object.freeze([
    ['ns.tool', 'ns__tool'],
    ['embed-ui.attention.signal', 'embed-ui__attention__signal'],
    ['fbtest-x.a.b.c', 'fbtest-x__a__b__c'],
  ]),
  /**
   * BVA where only the dots cross the limit (each `.` adds one character): a 12-character namespace
   * and a 48-character local name (K2's grammar maximum) give a 61-character public name. With 2
   * dots in the local name (3 in all) it maps to 64 and is offered; with 3 (4 in all) it maps to 65
   * and is refused, though its public name is just as long.
   */
  bvaNamespace: 'fbtest-bva-x',
  localChars: 48,
  dotsAt64: 2,
  pad: 'a',
})

/** K1's values the oracles use. */
export const K1 = Object.freeze({
  disconnected: LINK_REFUSAL.disconnected,
  unsupported: REFUSAL.unsupportedOperation,
  forbidden: REFUSAL.forbidden,
  invalidArguments: REFUSAL.invalidArguments,
  operationFailed: REFUSAL.operationFailed,
  imagesUnsupported: REFUSAL.imagesUnsupported,
  connected: Object.freeze({ state: TARGET_STATE.connected }),
  down: Object.freeze({ state: TARGET_STATE.unreachable, code: TARGET_CODE.unreachable }),
})

/**
 * K2: `<namespace>.<name>`, so every contributed name holds the separator and no core name does.
 * `externalName` is K2's EXTERNAL_NAME (DECIDED #W3-2, the K2 amendment at the W3 merge). It is
 * read through the module namespace so this file still loads on a contract without it; every row
 * that maps a name then fails, and K2-AMEND-1 names the missing export.
 */
const { NAMESPACE } = K2_TOOLS
export const K2 = Object.freeze({
  separator: NAMESPACE.separator,
  embedUi: NAMESPACE.aliases['dsh-connector-ui'],
  metaKey: K2_TOOLS.CONTRIBUTOR_META_KEY,
  externalName: K2_TOOLS.EXTERNAL_NAME,
})

/** Design §13.6 (D§13.6): embed-UI's two contributed tools and the signal's accepted result. */
export const ATTENTION = Object.freeze({
  signal: K2.embedUi + K2.separator + 'attention.signal',
  state: K2.embedUi + K2.separator + 'attention.state',
  accepted: Object.freeze({ ok: true, accepted: true }),
})

/**
 * Model-facing names (Fishball 2026-11-15, Q-8 decided: the public name is NOT kept). DSH's model
 * function-name contract is `[A-Za-z0-9_-]`, at most 64 characters (dsh-mcp-client
 * lib/index.js:57–100), so the one frozen mapping is `.` → `__` (`embed-ui.attention.signal` →
 * `embed-ui__attention__signal`). A mapped name over 64 characters, starting with `mcp__`, without
 * a namespace (a listed non-core tool with no `.`, `not-namespaced`) or clashing with another is
 * not offered and is logged once. Core tools keep their names; `inbox_poll`, `inbox_ack`, `pair`
 * and `set_name` are withheld from the model and from X12. Since the K2 amendment at the W3 merge
 * (DECIDED #W3-2) the mapping is K2's `EXTERNAL_NAME`, read from there, never restated.
 */
export const MODEL_NAME = Object.freeze({
  from: K2.externalName?.replaced,
  to: K2.externalName?.replacement,
  maxChars: 64,
  /** Design §6.3: no tool the model is offered carries DSH's MCP-client prefix. */
  rawPrefix: 'mcp__',
  withheld: Object.freeze([TOOL.inboxPoll, TOOL.inboxAck, TOOL.pair, TOOL.setName]),
})
/** The model-facing name of a public tool name (Fishball 2026-11-15; K2 EXTERNAL_NAME since DECIDED #W3-2). */
export function modelName(publicName) {
  if (K2.externalName === undefined) throw new Error('dsh-connector/tools exports no EXTERNAL_NAME (K2 amendment at the W3 merge)')
  return publicName.split(MODEL_NAME.from).join(MODEL_NAME.to)
}

/**
 * The façade's call order (Fishball 2026-11-15, answer 2): link down → `disconnected`; not listed →
 * `unsupported-operation`; the X19 gate (`session.message`, `session.redirect`); the image gate
 * (`attachment_read`, model calls only) → `images-unsupported`; then `callTool`.
 */
export const GATE = Object.freeze({
  sends: Object.freeze({ [TOOL.sessionMessage]: 'session.message', [TOOL.sessionRedirect]: 'session.redirect' }),
  imageTool: TOOL.attachmentRead,
})

/**
 * `present(event)` (Fishball 2026-11-15, answer 3, Q-11 decided: F-FACADE renders every event):
 * `[{type: 'text', text}]` whose header names the type when K1's `isEventType` accepts it, and
 * says "unknown type" otherwise.
 */
export const PRESENT = Object.freeze({ blockType: 'text', unknownType: /unknown type/i })

/** Watchdog's registration types (R-WD-08, R-INT-07: it never registers for `contributed:…`). */
export const WATCHDOG_TYPES = Object.freeze([EVENT_TYPE.permission, EVENT_TYPE.settlement, EVENT_TYPE.retirement])

/** DSH's own vocabulary (installed SDK). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  llm: '@deepseek-ai/dsh-llm',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  storageJson: '@deepseek-ai/dsh-storage-json',
  persistence: '@deepseek-ai/dsh-session-persistence-jsonl',
  checkpoint: '@deepseek-ai/dsh-session-checkpoint-policy',
  agentLoop: '@deepseek-ai/dsh-agent-loop',
  executor: '@deepseek-ai/dsh-tool-executor-native',
  sdkPlugins: Object.freeze([
    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-storage',
  ]),
  /** dsh-llm StreamChunk / block / finish vocabulary. */
  block: Object.freeze({ text: 'text', toolCall: 'tool-call' }),
  finish: Object.freeze({ stop: 'stop', toolCalls: 'tool-calls' }),
  toolRole: 'tool',
  idle: 'idle',
  allLevels: 3,
})

/** Fixture data: not product values. */
const contributed = (namespace, name, description, properties = {}) => Object.freeze({
  name: namespace + K2.separator + name,
  description,
  inputSchema: { type: 'object', properties, additionalProperties: false },
  annotations: { readOnlyHint: true },
  _meta: { [K2.metaKey]: { plugin: namespace, version: '1.0.0' } },
})
export const FIXTURE = Object.freeze({
  provider: 'fbtest-fake',
  model: 'fbtest-fake',
  session: 'fbtest-facade',
  cwdName: 'cwd',
  modelText: 'fbtest ok',
  loggerName: 'fbtest-f-facade',
  tempPrefix: 'fbtest-f-facade-',
  pluginFold: 'fbtest-fold-notify',
  pluginWatchdog: 'fbtest-watchdog',
  /** X's tools in C (E8) and C''s own (E6), each with a unique description the oracle finds. */
  x: Object.freeze([
    contributed('fbtest-x', 'lookup', 'FBTEST-X lookup a board item by key', { q: { type: 'string' } }),
    contributed('fbtest-x', 'note', 'FBTEST-X add a note'),
  ]),
  added: contributed('fbtest-y', 'ping', 'FBTEST-Y ping, added by list_changed'),
  remote: Object.freeze([contributed('fbtest-remote', 'lookup', 'FBTEST-REMOTE lookup in the remote DSH')]),
  attention: Object.freeze([
    contributed(K2.embedUi, 'attention.signal', 'FBTEST attention signal', { important: { type: 'boolean' } }),
    contributed(K2.embedUi, 'attention.state', 'FBTEST attention state'),
  ]),
  /** A contributed call's argument and the result the fake link answers with. */
  query: 'fbtest-query',
  resultMarker: 'FBTEST-RESULT',
  callId: 'fbtest-call-',
  sessionId: 'fbtest-s1',
  attachmentId: 'fbtest-att-1',
  /** An X19 refusal the fake gate answers with (its shape is the relayed `{code, reason}`). */
  gateRefusal: Object.freeze({ code: 'fbtest-gate-refused', reason: 'fbtest: no active brief' }),
  pluginX12: 'fbtest-x12',
  userText: 'FBTEST-USER please use your tools',
})

/** Harness waits only; never a product oracle. */
export const WAIT = Object.freeze({ settleMs: 20000, quietMs: 300, pollMs: 25 })

/** Owners of rows this task cannot check (v3-tasks.md W4–W6, the open W3 questions). */
export const LATER = Object.freeze({
  remote: 'X-REMOTE (two DSH processes: the real connector C / C\' with its contributors, read through the façade of a real standalone or hosted Fishball)',
  status: 'F-STATUS (core\'s status shows the contributed-tool count, R-EXT-14 note)',
  watchdog: 'WD-ROUTE + WD-WIRE (the real Watchdog row registered through fishballInstance next to the façade)',
})
