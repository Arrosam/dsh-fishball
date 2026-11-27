/**
 * Vocabulary for the F-WIRE manager cases (reminders in the manager, the manager singleton and
 * its setup, the generated identity, Fishball's model). Authority: .runtime/f-wire-interface.md
 * (fixed 2026-11-16), DESIGN.md §20, requirements R-FB-02, R-FB-13, R-ID-10 (design/v3-token-reveal),
 * the V2 reminder rules core keeps unchanged (docs/slim-native-design.md T10: the schedule tool's
 * names and parameters, `every` at least 60 s, one-shot ends after it fires, a missed occurrence
 * is delivered after downtime), the session route (docs/plugins/instance-extension-points.md X1a:
 * GET reads, POST ensures; concurrent waiters join one activation) and the frozen core contracts
 * (packages/core/contracts/constants.js). No value comes from an implementation.
 */
import path from 'node:path'
// A namespace import: an --against run on a commit before MULTI-0 (whose fishball-shared has no
// SEAM_TARGETS) still loads the in-process RFIX rows; only the Connect rows read these routes.
import * as SEAM from 'fishball-shared/ui-seam'
import * as K1 from 'fishball-test-helpers/connector-contract/mcp-schema'
import { FAKE, FAKE_MODELS } from 'fishball-test-helpers/fake-llm'
// A namespace import for the same reason (WATCHDOG is newer than the R-FIX-CORE fixes): the RFIX
// regression rows must load on their base commits; rows needing a missing value fail on their own.
import * as CONTRACTS from '../../contracts/constants.js'

export const { CONNECT, FISHBALL_MODEL, MCP, WATCHDOG } = CONTRACTS
export { K1 }

/** fishball-core's own folder (this file is packages/<core>/tests/manager/). */
export const CORE_DIR = path.join(import.meta.dirname, '..', '..')

/** The standalone world: core alone (its library beside it), no connector, no instance (../support/core-world.mjs). */
export const WORLD = Object.freeze({
  homeLabel: 'fbmgr',
  core: 'fishball-core',
  roles: Object.freeze({ user: 'user', tool: 'tool' }),
})

/** Waiting only; none is a product oracle. */
export const BUDGET = Object.freeze({
  pollMs: 100,
  turnMs: 60000, applyMs: 30000, applyPollMs: 1000, fireMs: 60000, connectMs: 30000,
  /** Parent wait between the stop of boot 1 and boot 2, so the "missed" reminder's time passes while DSH is down. */
  downtimeMs: 12000,
})

/** Core's routes (interface "Routes"; the session route is X1a's, unchanged). */
export const ROUTE = Object.freeze({
  session: '/api/fishball/session',
  // MULTI-0: the K3a Connect routes are withdrawn; Connect is per target (SEAM_TARGETS.route).
  connect: SEAM.SEAM_TARGETS?.route.connect,
  cancel: SEAM.SEAM_TARGETS?.route.cancel,
  targetIdField: SEAM.SEAM_TARGETS?.route.targetIdField,
})
/** The V2 reminder page API that is gone (DESIGN §20 "their V2 page API is gone"; inst-OQ-19). */
export const RETIRED = Object.freeze({
  api: Object.freeze(['/api/reminders', '/api/reminders/fbtest-reminder-id']),
  embed: '/fishball/embed/api/reminders',
  missing: 404,
})
export const HTTP = Object.freeze({ get: 'GET', post: 'POST', ok: 200, json: 'application/json', okMin: 200, okMax: 299 })

/** The manager's model-visible tools (R-FB-02 base set; interface "Manager scope tools"). */
export const TOOLS = Object.freeze({
  base: Object.freeze(['read', 'read_image', 'working_directory']),
  reminders: Object.freeze(['schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete']),
  ask: 'ask_user',
  privateSkill: /^private_skill_/,
  /** MSG-USER (2026-11-21): core's manager-only `message_user` (MESSAGE_TOOL.send), one of core's own tools. */
  message: 'message_user',
})

/** The persona (the user's answer 5: V3 tool names; V2-only features removed). */
export const PERSONA = Object.freeze({
  present: Object.freeze(['session_message', 'approval_answer']),
  absent: Object.freeze(['message_session', 'answer_approval', 'list_plugins', 'watch_session']),
})

/**
 * F-FIX persona rows (the user's decisions of 2026-11-16/17): no `ask_agent` tool ("不给ask_agent工具");
 * `approval_answer` with decision `ask` is refused ("Refuse it"); permission requests become cards
 * (2026-11-17: "Permission requests become cards"), filed with `ask_user` and answered Allow once
 * or Reject. The words come from the requirements; the patterns only find them in prose.
 */
export const PERSONA_FIX = Object.freeze({
  entry: path.join(CORE_DIR, 'src', 'persona.js'),
  export: 'PERSONA_ROLE',
  absentTool: 'ask_agent',
  /** `ask` offered as a decision word: quoted or code-spanned, `decision: ask`, "ask the session", or listed beside another decision. */
  askDecision: Object.freeze([/[`'"]ask[`'"]/, /decision\W{0,4}ask\b/i, /\bask the session\b/i, /\bask\b\s*(?:,|\/|or)\s*(?:escalate|reject|grant|allow)\b/i, /\b(?:escalate|reject|grant|allow)\s*(?:,|\/|or)\s*ask\b/i]),
  decisions: Object.freeze(['allow', 'grant', 'reject', 'escalate']),
  askTool: 'ask_user',
  permission: /\bpermissions?\b/i,
  allowOnce: /allow once/i,
  reject: /\breject\b/i,
  exactPermission: Object.freeze([/\b(?:exact|specific|precise)\b/i, /\b(?:action|request|operation|command|call)\b/i, /\b(?:allowance|authoriz\w*)\b/i]),
  lowRisk: Object.freeze([/\bread\b/i, /\bsearch\b/i, /\blist\b/i, /\breversible\b/i, /\bworkspace\b/i, /\bbuild\w*/i, /\btest\w*/i, /\bformat\w*/i, /\bdeclared (?:dep\w*|packages)\b/i, /\bedit\w*/i, /\b(?:local commits?|commit(?:ting|s)? locally)\b/i, /\bworkspace-write\b/i]),
  highRisk: Object.freeze([/\bdelet\w*/i, /\boverwrit\w*/i, /\b(?:outside|external)\b/i, /\b(?:existing|pre-existing|preexisting|not created)\b/i, /\bcredentials?\b/i, /\b(?:outbound|external sends?|push|publish)\b/i, /\bsystem\b/i, /\baccounts?\b/i, /\bdanger-full-access\b/i, /\birreversible\b/i, /\bopaque\b/i, /\buser[ -]reserved\b|\breserved\b[^.]*\buser\b/i]),
  /** The retired wording of the ask card's source (an `ask` event filed as a card). */
  askEvent: /\ban [`'"]?ask[`'"]? event\b/i,
})

/**
 * WD-PERSONA rows (the user's decision, 2026-11-22): when a DSH offers Watchdog (the
 * dsh-connector-watchdog amenity's tools), a session Fishball wants supervised is started with
 * Watchdog's watchdog_session_start instead of the connector's session_start, with purpose and
 * approvable scope; Watchdog supervises the session
 * from its first request; watchdog_brief only covers what a running session asks after the brief.
 * The words come from that decision; the patterns only find them in prose.
 */
export const PERSONA_WATCHDOG = Object.freeze({
  /** The contract's tool table as the requirement names it: exactly these two tools. */
  tools: Object.freeze({ sessionStart: 'watchdog_session_start', brief: 'watchdog_brief' }),
  watchdog: /\bWatchdog\b/,
  /** "when/if/where a DSH offers (has, provides, lists) Watchdog", or "Watchdog is offered/available". */
  conditional: /\b(?:when|if|where|whenever)\b[^.:;]{0,80}\b(?:offers?|has|provides?|lists?|exposes?)\b[^.:;]{0,40}\bWatchdog\b|\bWatchdog\b[^.:;]{0,40}\bis (?:offered|available|present|listed)\b/i,
  insteadOf: /\binstead of\b|\brather than\b|\bin place of\b|\bnot\b/i,

  purpose: /\bpurpose\b/i,
  approvableScope: /\bapprovable scope\b|\bscope\b[^.]{0,40}\bapprov/i,
  supervises: /\bsupervis/i,
  firstRequest: /\bfirst (?:permission )?request\b/i,
  only: /\bonly\b/i,
  afterBrief: /\bafter\b|\b(?:subsequent|later|future)\b/i,
  running: /\brunning\b/i,
  tempCopy: Object.freeze({
    file: path.join('src', 'persona.js'),
    copied: Object.freeze(['src', 'contracts', 'package.json']),
    sharedPackage: 'fishball-shared',
    tmpPrefix: 'fbtest-wd-persona-',
    nodeModules: 'node_modules',
  }),
  /** The contract file a copy's WATCHDOG names are swapped in (EP-06), and stand-in names that are no real tool's. */
  contractFile: path.join('contracts', 'constants.js'),
  swapped: Object.freeze({ sessionStart: 'fbtest_wd_swapped_start', brief: 'fbtest_wd_swapped_brief' }),
  /** The connector tool Watchdog's start replaces (K1's name). */
  connectorStart: 'session_start',
  /** A sentence that would forbid session_start outright, or make Watchdog's start unconditional. */
  forbidsStart: (start, watchdogStart) => new RegExp(`\\b(?:never|do not|don't|must not)\\b[^.]{0,40}\\b(?:use|call)\\b[^.]{0,20}\\b${start}\\b|\\balways\\b[^.]{0,40}\\b${watchdogStart}\\b`, 'i'),

})

export const PRESET = Object.freeze({ fishball: 'fishball' })

/** Markdown markers for the Watchdog line's style check. */
export const PERSONA_BOLD = Object.freeze({
  lineBreak: '\n', carriageReturn: '\r', marker: '**',
  chinesePunct: Object.freeze(['，', '。', '！', '？', '；', '：', '、', '）', '」', '”', '…', '—', '（', '【', '》']),
})
export const personaLines = (persona) => persona.split(PERSONA_BOLD.lineBreak)
/** DSH settings.mutate op words and the message role a reminder delivery has. */
export const OP = Object.freeze({ set: 'set', unset: 'unset' })
export const ROLE = Object.freeze({ user: 'user' })

/** R-ID-10: `fb-` and 16 lowercase base32 (RFC 4648 a–z, 2–7) characters. */
export const IDENTITY = Object.freeze({
  generated: /^fb-[a-z2-7]{16}$/,
  /** A user id inside R-ID-02 (`MCP.id.pattern`) and outside the generated pattern. */
  user: 'fbtest-owner-id-1',
  path: Object.freeze(['identity', 'id']),
  key: 'id',
  group: 'identity',
  /** R-FIX-CORE F09 (R-ID-02 `^[A-Za-z0-9_-]{1,64}$`): ids outside the grammar, a blank one, and a second valid one. */
  invalid: Object.freeze({ dot: 'bad.id', long: 'a'.repeat(65), space: 'bad id' }),
  longestValid: 'b'.repeat(64),
  blank: '',
  idInvalid: 'id-invalid',
})

/** Connect inputs that reach an approval URL (R12 = B: an https CIMD URL with a path; a loopback http target). */
export const CONNECT_INPUT = Object.freeze({

  metadataPath: Object.freeze(['connect', 'clientMetadataUrl']),
  metadataUrl: 'https://agent.example/fishball-core.json',
  bindHost: '127.0.0.1',
  scheme: 'http:',
  approvalUrl: 'approval-url',
})

/** Fishball's model (DESIGN §20): DSH's default comes from the overlay's default-model row. */
export const MODEL = Object.freeze({
  dshDefault: Object.freeze({ provider: FAKE.provider, model: FAKE.model }),
  routable: Object.freeze({ provider: FAKE.provider, model: FAKE_MODELS.b }),
  unroutable: Object.freeze({ provider: 'fbtest-no-provider', model: 'fbtest-no-model' }),
})

/**
 * Reminder decision table (schedule_create, one scripted model step per row, all in one response).
 * `accepted` is derived from the V2 rules core keeps unchanged: exactly one timing selector,
 * a positive `after_seconds`, `every_seconds` of at least 60.
 */
const LONG_SECONDS = 3600
const EVERY_MIN_SECONDS = 60
const FIRE_SECONDS = 1
export const REMINDER = Object.freeze({
  rows: Object.freeze([
    Object.freeze({ row: 'DT-1 after 3600 s', title: 'fbtest-rem-keep', args: { after_seconds: LONG_SECONDS }, accepted: true }),
    Object.freeze({ row: 'BVA after 0 s (below 1)', title: 'fbtest-rem-after-zero', args: { after_seconds: 0 }, accepted: false }),
    Object.freeze({ row: 'BVA every 59 s (below 60)', title: 'fbtest-rem-every-59', args: { every_seconds: EVERY_MIN_SECONDS - 1 }, accepted: false }),
    Object.freeze({ row: 'BVA every 60 s (lowest)', title: 'fbtest-rem-every-60', args: { every_seconds: EVERY_MIN_SECONDS }, accepted: true }),
    Object.freeze({ row: 'DT two selectors', title: 'fbtest-rem-two-selectors', args: { after_seconds: LONG_SECONDS, every_seconds: EVERY_MIN_SECONDS }, accepted: false }),
    // Last: it fires about a second later, and no scripted call may be queued while it is delivered.
    Object.freeze({ row: 'BVA after 1 s (lowest)', title: 'fbtest-rem-fire', args: { after_seconds: FIRE_SECONDS }, accepted: true, fires: true }),
  ]),
  promptOf: (title) => 'fbtest reminder prompt ' + title,
  keep: 'fbtest-rem-keep',
  renamed: 'fbtest-rem-kept-renamed',
  deleted: 'fbtest-rem-every-60',
  fire: 'fbtest-rem-fire',
  /** Created just before the stop of boot 1; its time passes while DSH is down. */
  missed: Object.freeze({ title: 'fbtest-rem-missed', after_seconds: 6 }),
  callPrefix: 'call_fbmgr_',
})
