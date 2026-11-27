/**
 * Oracle values of the watchdog live-config cases (USE-CASES.md beside this file): R2 (every user
 * setting volatile, type/default/bounds/description kept) and R3 (a live change re-applies the row:
 * the patrol uses the current minCheckIntervalSeconds; a stored unpaused brief is re-armed), relayed
 * by the lead on 2026-11-22, plus the row's public surface the implementer relayed the same day
 * (inject ['sessionController']; home = profileContext.home; briefs.json; global setTimeout; the
 * connector services looked up optionally, apiVersion 1; a patrol reads
 * sessions.read({sessionId, maxMessages: readMaxMessages, maxBytes: readMaxBytes})). The four
 * descriptions are the ones the fields had before this change (git HEAD of src/config.js).
 * index.js and src/config.js were not read.
 */
import path from 'node:path'

export const WATCHDOG = Object.freeze({
  name: 'dsh-connector-watchdog',
  entry: path.resolve(import.meta.dirname, '../../index.js'),
  inject: 'sessionController',
  services: Object.freeze({ sessions: 'dshConnectorSessions', tools: 'dshConnectorTools', apiVersion: 1, profile: 'profileContext' }),
  tool: Object.freeze({ brief: 'watchdog_brief', refine: 'watchdog_refine', pause: 'watchdog_pause', resume: 'watchdog_resume' }),
  store: Object.freeze({ dir: 'dsh-connector-watchdog', file: 'briefs.json', version: 1 }),
})

/** Watchdog's dedicated model setting: volatile object, unset by default (disables Watchdog). */
export const MODEL_FIELD = Object.freeze({
  name: 'model',
  type: 'object',
  description: 'Model used for Watchdog judgements. Watchdog is disabled while unset.',
  subfields: Object.freeze(['provider', 'model', 'reasoningEffort']),
})

/** R2: the numeric limit fields, in order (type natural = number step 1). */
export const FIELDS = Object.freeze([
  Object.freeze({ name: 'minCheckIntervalSeconds', type: 'number', step: 1, default: 1740, min: 60, max: 86_400, description: 'Seconds between two patrol checks of one supervised session.' }),
  Object.freeze({ name: 'readMaxMessages', type: 'number', step: 1, default: 8, min: 1, max: 100, description: 'Most new messages one judgement reads; the connector\'s caps still apply.' }),
  Object.freeze({ name: 'readMaxBytes', type: 'number', step: 1, default: 8192, min: 1024, max: 1_048_576, description: 'Most UTF-8 bytes of new messages one judgement reads.' }),
  Object.freeze({ name: 'checkTimeoutSeconds', type: 'number', step: 1, default: 120, min: 30, max: 900, description: 'How long one judgement may take; a late one passes the request to the manager.' }),
])

export const ALL_FIELDS = Object.freeze([MODEL_FIELD.name, ...FIELDS.map((f) => f.name)])

export const SDK = Object.freeze({ versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3']), cordis: '@deepseek-ai/cordis', loader: '@deepseek-ai/cordis-plugin-loader', builtinPrefix: 'cordis:', fiberActive: 2 })

/** Fixture data (test values). */
export const FIXTURE = Object.freeze({
  principal: Object.freeze({ key: 'fbtest-principal', name: 'fbtest manager' }),
  session: 'fbtest-session-1',
  paused: 'fbtest-session-paused',
  purpose: 'fbtest: fix the login bug',
  protocolVersion: '2026-07-28',
  tempPrefix: 'fbtest-wd-live-',
  /** Intervals in seconds used by the rows (inside 60..86400). */
  interval: Object.freeze({ first: 600, second: 900, short: 120 }),
  reads: Object.freeze({ messages: 20, bytes: 4096 }),
  model: Object.freeze({
    first: Object.freeze({ provider: 'fbtest-cheap', model: 'mini' }),
    second: Object.freeze({ provider: 'fbtest-cheap', model: 'mini-fast', reasoningEffort: 'low' }),
  }),
})

export const TIME = Object.freeze({ secondMs: 1000, edgeMs: 1, epochMs: Date.UTC(2026, 10, 22) })
export const WAIT = Object.freeze({ testMs: 60_000, settleRounds: 60 })
