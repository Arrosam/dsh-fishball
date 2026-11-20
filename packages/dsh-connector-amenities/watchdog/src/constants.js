/**
 * dsh-connector-watchdog's own contract (docs/watchdog-project-notes.md; the user's decisions of
 * 2026-11-20): names, the brief record, the tools' wording and codes, the verdict vocabulary and the
 * judge's instructions. Model-facing text is English only, as the adapter's.
 */

export const WATCHDOG = Object.freeze({
  name: 'dsh-connector-watchdog',
  /** Its agent preset (notes 1.24 "Watchdog也是一个预设"), declared in the bundle's cordis.patch.yml. */
  preset: 'watchdog',
  /** The delegate name the manager sees in `settlement.delegate.name`. */
  delegate: 'watchdog',
  /** Services looked up at runtime: a consumer must load without them (host-services README). */
  service: Object.freeze({ sessions: 'dshConnectorSessions', tools: 'dshConnectorTools', apiVersion: 1 }),
  effect: Object.freeze({
    services: 'dsh-connector-watchdog: connector services',
    tools: 'dsh-connector-watchdog: tools',
    delegate: 'dsh-connector-watchdog: delegate',
    close: 'dsh-connector-watchdog: close',
  }),
})

/** The persisted briefs: one JSON file under the profile home (the user: briefs survive a restart). */
export const STORE = Object.freeze({
  directory: 'dsh-connector-watchdog',
  file: 'briefs.json',
  version: 1,
  encoding: 'utf8',
  fileMode: 0o600,
  directoryMode: 0o700,
})

/** The side sessions' folder, under the same directory (one side session per supervised session, U8). */
export const SIDE = Object.freeze({ directory: 'side', textBlock: 'text', userSource: 'dsh-connector-watchdog', assistantEvent: 'assistant/message', sessionEvent: 'session/event', turnEnd: 'turn/end' })

/** What the judge may answer. A permission judgement: allow | reject | pass | drifted; a patrol: ok | drifted. */
export const VERDICT = Object.freeze({ allow: 'allow', reject: 'reject', pass: 'pass', drifted: 'drifted', ok: 'ok' })

/** Why a drift was found, in the `drift` event. */
export const DURING = Object.freeze({ patrol: 'patrol', permission: 'permission' })

/** The contributed event (public name `dsh-connector-amenities.drift`). */
export const DRIFT_EVENT = Object.freeze({ name: 'drift', summaryChars: 280 })

export const TOOL = Object.freeze({
  brief: 'watchdog_brief',
  refine: 'watchdog_refine',
  pause: 'watchdog_pause',
  resume: 'watchdog_resume',
})

/** Domain refusal codes (K2 NAME_GRAMMAR.code); `forbidden` and `conflict` are K2 shared codes. */
export const CODE = Object.freeze({
  forbidden: 'forbidden',
  conflict: 'conflict',
  notBriefed: 'not-briefed',
  emptyPurpose: 'empty-purpose',
  nothingToRefine: 'nothing-to-refine',
})

export const TEXT = Object.freeze({
  brief: 'Assign Watchdog to a session you manage. Watchdog supervises it against its purpose on a patrol timer and at each permission request, and answers permission requests that fall within the approvable scope for you (each allow covers one call). Requests outside the scope, high-risk ones and questions still come to you. When the session drifts from its purpose, Watchdog stops its turn and sends you a drift event; you can still message the session. Briefing a session you already briefed answers "conflict": use watchdog_refine.',
  refine: 'Change the purpose and/or the approvable scope of a session you briefed. An empty scope removes it (every request then comes to you). The patrol timer is not moved.',
  pause: 'Stop the session\'s current turn, then pause Watchdog\'s supervision of it: no patrol and no permission answers until watchdog_resume.',
  resume: 'Resume Watchdog\'s supervision of a paused session; the patrol timer starts again from now.',
  sessionId: 'A session you manage (a subagent\'s id means its root session).',
  purpose: 'What the session is for: its goal and constraints. Watchdog judges drift against it.',
  scope: 'Optional: a plain description of the permission requests Watchdog may approve for you.',
  drift: (during, reason) => `Watchdog stopped the session (${during}): ${reason}`,
})

/**
 * The judge's instructions (notes §3 decision table, as last revised; escalation to the user is
 * deferred by the user's decision of 2026-11-20, so "other high risk" passes to the manager).
 * Each judgement is one self-contained message, so a refine applies at the next one.
 */
export const JUDGE = Object.freeze({
  intro: 'You are Watchdog, a supervisor of another agent\'s session for the agent that manages it. You never act on the session yourself: you read and judge, and you answer with exactly one JSON object and nothing else.',
  purpose: (purpose) => `Purpose of the supervised session (required, from its manager):\n${purpose}`,
  scope: (scope) => (scope === '' ? 'Approvable scope: none. You may not allow any request.' : `Approvable scope (requests you may allow for the manager):\n${scope}`),
  messages: (text) => (text === '' ? 'No new messages since your last judgement.' : `New messages of the supervised session since your last judgement (oldest first):\n${text}`),
  truncated: '(Older new messages were left out by the read limits.)',
  message: (role, text) => `[${role}] ${text}`,
  permission: (d) => `Permission request: tool "${d.toolName}"\nReason given: ${d.reason || '(none)'}\nArguments (${d.argumentsStatus}):\n${d.arguments ?? ''}`,
  permissionRules: [
    'Decide this one permission request with these rules, in order:',
    '1. If the session as a whole has drifted from its purpose, answer {"verdict":"drifted","reason":"..."}.',
    '2. If the request is clearly within the approvable scope and consistent with the purpose, answer {"verdict":"allow","reason":"..."}.',
    '3. If the request is beyond the purpose AND dangerous, answer {"verdict":"reject","reason":"..."}; the reason is shown to the session\'s agent.',
    '4. Anything else (another high-risk request, any doubt, no scope), answer {"verdict":"pass","reason":"..."}: the manager decides.',
  ].join('\n'),
  patrolRules: 'Patrol check: judge only whether the session is still working towards its purpose. Answer {"verdict":"ok","reason":"..."} or {"verdict":"drifted","reason":"..."}.',
})

export const LOG = Object.freeze({
  format: '%s: %s (%s)',
  storeUnreadable: 'the briefs file could not be read; starting with no briefs',
  storeWriteFailed: 'the briefs file could not be written',
  servicesMissing: 'dsh-agent-connector\'s dshConnectorSessions or dshConnectorTools is not available; Watchdog is idle',
  toolsRefused: 'the connector refused the Watchdog tools',
  judgeFailed: 'a judgement failed; the request goes to the manager',
  patrolFailed: 'a patrol failed',
  stopFailed: 'a drifted session could not be stopped',
  emitRefused: 'the drift event was refused',
})
