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
import os from 'node:os'
import { FAKE, FAKE_MODELS } from '../../../support/constants.mjs'
import { CONNECT, FISHBALL_MODEL, MCP } from '../../../../packages/core/contracts/constants.js'
import * as K1 from '../../../../packages/dsh-connector/mcp-schema/index.js'

export { CONNECT, FISHBALL_MODEL, MCP, K1 }

/** The SDKs (R-COMPAT-01); FBTEST_DSH_VERSIONS moves their parent folder. */
export const SDK = Object.freeze({
  versionsDir: process.env.FBTEST_DSH_VERSIONS ?? path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  /** The SDK that can report a session's preset (`agentPresets.presetForSession`); 0.2.1-rc.5 cannot (R-FB-13). */
  presetReporting: '0.2.2-rc.1',
})
export const runtimeOf = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules')

/** The standalone world: core alone (with its bundled library as a dependency), no connector, no instance. */
export const WORLD = Object.freeze({
  file: path.join(import.meta.dirname, 'world.mjs'),
  profile: 'fbmgr',
  homeLabel: 'fbmgr',
  homeMarker: path.join('.runtime', 'test-homes'),
  workDir: 'work',
  overlay: 'fbmgr.overlay.yml',
  core: 'fishball-core',
  shared: 'fishball-shared',
  folders: Object.freeze({ 'fishball-core': 'core', 'fishball-shared': 'shared' }),
  defaultModelRow: 'agent-default-model',
  fakeLlmRow: 'fbtest-llm',
  /** The files a settings save could write (DSH's profile patch and the home-level patch). */
  patchFile: 'cordis.patch.yml',
  urlLine: /dsh web: (http\S+)/,
  idle: 'idle',
  roles: Object.freeze({ user: 'user', tool: 'tool' }),
  turnText: 'fbtest manager turn',
  ready: 'ready', reply: 'reply', call: 'call',
})

/** Waiting only; none is a product oracle. */
export const BUDGET = Object.freeze({
  bootMs: 180000, readyMs: 90000, callMs: 120000, stopMs: 20000, pollMs: 100,
  turnMs: 60000, applyMs: 30000, applyPollMs: 1000, fireMs: 60000, connectMs: 30000,
  /** Parent wait between the stop of boot 1 and boot 2, so the "missed" reminder's time passes while DSH is down. */
  downtimeMs: 12000,
})

/** Core's routes (interface "Routes"; the session route is X1a's, unchanged). */
export const ROUTE = Object.freeze({
  session: '/api/fishball/session',
  connect: '/api/fishball/connect',
  cancel: '/api/fishball/connect/cancel',
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
})

/** The persona (the user's answer 5: V3 tool names; V2-only features removed). */
export const PERSONA = Object.freeze({
  present: Object.freeze(['session_message', 'approval_answer']),
  absent: Object.freeze(['message_session', 'answer_approval', 'list_plugins', 'watch_session']),
})

export const PRESET = Object.freeze({ fishball: 'fishball' })
/** DSH settings.mutate op words and the message role a reminder delivery has. */
export const OP = Object.freeze({ set: 'set', unset: 'unset' })
export const ROLE = Object.freeze({ user: 'user' })
export const GUARD_OK = 'ok'

/** R-ID-10: `fb-` and 16 lowercase base32 (RFC 4648 a–z, 2–7) characters. */
export const IDENTITY = Object.freeze({
  generated: /^fb-[a-z2-7]{16}$/,
  /** A user id inside R-ID-02 (`MCP.id.pattern`) and outside the generated pattern. */
  user: 'fbtest-owner-id-1',
  path: Object.freeze(['identity', 'id']),
  key: 'id',
  group: 'identity',
})

/** Connect inputs that reach an approval URL (R12 = B: an https CIMD URL with a path; a loopback http target). */
export const CONNECT_INPUT = Object.freeze({
  targetPath: Object.freeze(['target', 'url']),
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

/** Rows whose behaviour is not observable from outside with this harness. */
export const TODO = Object.freeze({
  unroutableLog: 'F-WIRE: "an unroutable selection is logged once" has no specified log name or text, so the line cannot be identified black-box',
  reasoningEffort: 'E2E-CORE: the scripted model route declares no reasoning effort, so model.reasoningEffort cannot be shown to reach a request',
  firstGet: 'F-WIRE: GET /api/fishball/session before any ensure on a fresh home is not specified (null or an id)',
  defaultChange: 'F-WIRE: whether a live change of DSH\'s own default model reaches a manager with model unset is not specified',
})
