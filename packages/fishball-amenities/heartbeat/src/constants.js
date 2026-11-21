export const NAMESPACE = 'fishball-heartbeat'

/**
 * The optional service this row binds to (extension points §1). apiVersion is fishball-core's
 * current one (MULTI-0: 2; core's MAIN.apiVersion). Not imported from fishball-core: amenities
 * must load with no core installed (R-FB-06), so they cannot resolve its modules.
 */
export const HOST = Object.freeze({
  service: 'fishballInstance', profile: 'profileContext', apiVersion: 2, serviceEvent: 'internal/service',
  appReady: 'appReady',
})

/** DSH session vocabulary this amenity folds (dsh-session SessionEventMap, both SDKs). */
export const SESSION = Object.freeze({
  event: 'session/event',
  turnStart: 'turn/start',
  turnEnd: 'turn/end',
  stepStart: 'step/start',
  userMessage: 'user/message',
  /** The source kind of a message the user typed (dsh-llm MessageSourceMap.user). */
  userSource: 'user',
  /** fishball-core's plugin notice source (manager/service.js noticeSource). */
  noticeSource: 'fishball-notice',
})

export const TIME = Object.freeze({ millisecondsPerSecond: 1000 })

export const FOCUS = Object.freeze({
  /** Code points; bounds what every heartbeat message carries into Fishball's context. */
  maxChars: 2000,
  directory: 'fishball-heartbeat', file: 'focus.json', version: 1,
  directoryMode: 0o700, fileMode: 0o600, encoding: 'utf8', temporarySuffix: '.tmp-', missing: 'ENOENT',
})

export const TOOL = Object.freeze({ name: 'heartbeat_focus', argKeys: Object.freeze(['focus']) })

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
  focusField: 'The complete focus for the next heartbeat. Empty clears it.',
  heading: (position, limit, idleSeconds) => `Fishball heartbeat ${position} of ${limit}: you have been idle for ${idleSeconds} seconds. This turn keeps your context cache warm; use it for useful work. If nothing needs doing, answer in one short line.`,
  focus: focus => `Focus for this heartbeat:\n${focus}`,
  noFocus: 'No focus was set for this heartbeat: review your current work and the sessions you manage.',
  closing: `At the end of this turn, call ${TOOL.name} to set the next heartbeat's focus from the current state (for example, the progress of the sessions you manage and what to check next).`,
  separator: '\n\n',
  saved: focus => focus === '' ? 'Heartbeat focus cleared.' : 'Heartbeat focus saved.',
})

export const LOG = Object.freeze({
  /** R-FB-06: the one line this row logs when no compatible fishball-core is there at ready. */
  coreMissing: 'fishball-core-missing',
  notifyFailed: 'heartbeat could not be sent (%s); the next turn re-arms it',
  focusUnreadable: 'heartbeat focus could not be read (%s); this heartbeat carries none',
})

/** dedupeKey of one idle gap: the manager session and the seq of the turn/end that opened it. */
export const dedupeKey = (sessionId, turnEndSeq) => `${NAMESPACE}:${sessionId}:${turnEndSeq}`
