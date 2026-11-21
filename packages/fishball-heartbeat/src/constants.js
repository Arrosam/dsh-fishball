export const NAMESPACE = 'fishball-heartbeat'

/**
 * The optional service this row binds to (extension points §1). apiVersion is fishball-core's
 * current one (MULTI-0: 2; core's MAIN.apiVersion). Not imported from fishball-core: amenities
 * must load with no core installed (R-FB-06), so they cannot resolve its modules.
 */
export const HOST = Object.freeze({
  service: 'fishballInstance', profile: 'profileContext', apiVersion: 2, serviceEvent: 'internal/service',
  appReady: 'appReady',
  /**
   * DSH's context measure and compaction (dsh-token-meter, dsh-compaction). The token meter stays on
   * the host plane (dsh-web-app's patch); the compaction service lives inside the manager's agent
   * preset as an isolated group, so it is read through the preset registry (`serviceFor`), with a
   * host-plane one as the fallback, the order DSH's own session controller reads scoped services in.
   */
  tokenMeter: 'tokenMeter', compaction: 'compaction', agentPresets: 'agentPresets',
})

/** DSH session vocabulary this amenity folds (dsh-session SessionEventMap, both SDKs). */
export const SESSION = Object.freeze({
  event: 'session/event',
  turnStart: 'turn/start',
  turnEnd: 'turn/end',
  stepStart: 'step/start',
  userMessage: 'user/message',
  /** dsh-compaction's lock marker, first event of every compaction attempt that got past selection. */
  compactionStart: 'compaction/start',
  /** fishball-core's plugin notice source (manager/service.js noticeSource); pluginId names its sender. */
  noticeSource: 'fishball-notice',
  /**
   * Sources of the messages that wake Fishball for work, so a turn carrying one is a real turn even
   * if a heartbeat was claimed with it: the user's own words (dsh-llm MessageSourceMap.user), core's
   * event batches (contracts WAKE / MESSAGE.sourceKind; since wake batching one message carries a
   * whole batch) and core's reminders (manager/reminders.js DELIVERY.source). Another plugin's
   * notice is work too (see turns.js). Ambient DSH context (runtime, time) is none of these.
   */
  workSources: Object.freeze(['user', 'fishball-event', 'schedule']),
})

export const TIME = Object.freeze({
  millisecondsPerSecond: 1000,
  /**
   * How late a timer may fire and still send. Node's timers run on a monotonic clock that stops
   * while the machine sleeps, so after a sleep the timer fires long past the cache lifetime; such a
   * heartbeat would pay a cold write, so it is dropped like an overdue one at restart. The tolerance
   * only absorbs event-loop delay (Fishball's value, 2026-11-21).
   */
  lateToleranceMs: 5000,
})

export const FOCUS = Object.freeze({
  /** Code points; bounds what every heartbeat message carries into Fishball's context. */
  maxChars: 2000,
  directory: 'fishball-heartbeat', file: 'focus.json', version: 1,
  directoryMode: 0o700, fileMode: 0o600, encoding: 'utf8', missing: 'ENOENT',
})

export const TOOL = Object.freeze({
  name: 'heartbeat_focus',
  argKeys: Object.freeze(['focus']),
  // dsh-tools schema and content words. The field is `json`, as the board's are (tool.js).
  jsonType: 'json',
  textBlock: 'text',
})

export const REFUSAL = Object.freeze({
  notManager: 'not-manager',
  invalidInput: 'invalid-input',
  focusUnavailable: 'focus-unavailable',
})

/**
 * Model-facing words. The closing instruction is part of EVERY heartbeat (the user's requirement):
 * the next heartbeat's focus is only as good as the state Fishball saw at the end of this one.
 */
export const TEXT = Object.freeze({
  toolDescription: `Set what the next heartbeat turn should focus on. Heartbeats are automatic turns sent while you are idle, to keep your context cache warm; use each one for useful work. Pass the complete focus text (it replaces the previous one); an empty string clears it. At most ${FOCUS.maxChars} characters. Only the focus can be changed: the interval and the limit are the user's settings.`,
  focusField: 'A string: the complete focus for the next heartbeat. Empty clears it.',
  heading: (position, limit, idleSeconds) => `Fishball heartbeat ${position} of ${limit}: you have been idle for ${idleSeconds} seconds. This turn keeps your context cache warm; use it for useful work.`,
  focus: focus => `Focus for this heartbeat:\n${focus}`,
  noFocus: 'No focus was set for this heartbeat: review your current work and the sessions you manage.',
  closing: `At the end of this turn, call ${TOOL.name} to set the next heartbeat's focus from the current state (for example, the progress of the sessions you manage and what to check next).`,
  separator: '\n\n',
  saved: focus => focus === '' ? 'Heartbeat focus cleared.' : 'Heartbeat focus saved.',
})

export const LOG = Object.freeze({
  /** R-FB-06: the one line this row logs when no compatible fishball-core is there at ready. */
  coreMissing: 'fishball-core-missing',
  lateDropped: 'heartbeat dropped: its timer fired %d ms late (the machine slept?); the next turn re-arms it',
  notifyFailed: 'heartbeat could not be sent (%s); the next turn re-arms it',
  focusUnreadable: 'heartbeat focus could not be read (%s); this heartbeat carries none',
  compactionUnavailable: 'heartbeats stopped but Fishball\'s context cannot be compacted: no %s service',
  measureFailed: 'heartbeats stopped but Fishball\'s context could not be measured (%s); it is not compacted',
  compacted: 'heartbeats stopped with %d context tokens (over %d): compacted %d history items (~%d tokens)',
  nothingToCompact: 'heartbeats stopped with %d context tokens (over %d), but nothing could be compacted',
  compactionFailed: 'compaction when heartbeats stopped failed (%s); not retried until the next cooling',
})

/** The short reason a log line names for an error: its code, else its name. */
export const reasonOf = error => error?.code ?? error?.name

/** dedupeKey of one idle gap: the manager session and the seq of the turn/end that opened it. */
export const dedupeKey = (sessionId, turnEndSeq) => `${NAMESPACE}:${sessionId}:${turnEndSeq}`
