/**
 * Values of the core + ui system rows: core's published contracts and fishball-shared's ui-seam (by name),
 * the old suites' requirement values (model-dialog FRAME keys, MULTI-0 / F-WIRE members, the wire C
 * constants, DESIGN §35's interval), DSH's page markup. Harness budgets are marked.
 */
import { GUARDS } from 'fishball-core/contracts'

export const SYS = Object.freeze({
  home: Object.freeze({ both: 'fbcu-both', board: 'fbcu-board', broken: 'fbcu-broken', watch: 'fbcu-watch' }),
  langs: Object.freeze(['en', 'zh']),
  ok: 200,
  on: 'on',
  setOk: Object.freeze({ status: 'ok', missing: Object.freeze([]) }),
  modelRow: 'ui-model-selection',
  recommendedRoute: '/api/fishball/recommended',
  stripRoute: '/api/fishball/strip?lang=',
  /** MULTI-3 requirement B: the strip route serves targetsView's frame. */
  frameKeys: Object.freeze(['on', 'title', 'empty', 'notices', 'targets', 'words', 'brandStyle']),
  withdrawnConnect: '/api/fishball/connect',
  unknownTarget: 't-fbtestunknownaaaa',
  coreMissingLine: 'fishball-core-missing',
  members: Object.freeze(['manager', 'events', 'ui', 'bridge', 'attention', 'page']),
  uiMembers: Object.freeze(['managerSessionId', 'targets', 'guards', 'asks']),
  /** Core's own direct manager tools (reminders, message_user, ask_user) and its private Skills prefix. */
  coreTools: Object.freeze(['schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete', 'message_user', 'ask_user']),
  privateSkill: /^private_skill_/,
  managerTools: GUARDS.managerTools,
  impossibleEngine: '>=99.0.0',
  brokenPrefix: 'fbtest-cu-broken-board-',
  bootGraph: /(?:globalThis\["__DSH_BOOT__"\]|window\.__DSH_BOOT__)\s*=\s*(\{.*?\});?\s*<\/script>/s,
  dshScope: '@deepseek-ai/',
  targetName: 'Office-DSH',
  sse: Object.freeze({ type: 'text/event-stream', separator: /\r?\n\r?\n/, line: /\r?\n/, data: 'data:' }),
  /** DESIGN §35: TARGET_SESSIONS.watchIntervalMs 15 s; "at once" is well inside one interval (harness margins). */
  watch: Object.freeze({
    intervalMs: 15000, marginMs: 5000, atOnceMs: 5000,
    session: Object.freeze({ sessionId: 'fbtest-self-start', title: 'Started by itself', workspaceId: null, running: true, pendingInteraction: false }),
  }),
  // Harness waits only.
  readyMs: 90000, recomposeMs: 60000, callMs: 60000, connectMs: 60000, frameMs: 10000, pollMs: 100, caseMs: 900000,
})
