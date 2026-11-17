/**
 * Small helpers the domain modules share (task C-WIRE-2), so each rule is written once: a request
 * id, a refusal, a trimmed text, and the signal a waterfall step hands on.
 */
import { randomUUID } from 'node:crypto'
import { REQUEST_ID } from './constants.js'

/** A request id: `prefix` (REQUEST_ID) plus 32 lowercase hex characters (a UUID without dashes). */
export const mintId = (prefix) => prefix + randomUUID().replace(REQUEST_ID.uuidSeparator, '')

/** A domain refusal `{ok: false, code}` (a K1 REFUSAL code). */
export const refused = (code) => Object.freeze({ ok: false, code })

/** A text trimmed, or '' for anything that is not a string. */
export const trimmed = (text) => (typeof text === 'string' ? text.trim() : '')

/**
 * The signal a step hands on to the next answerer: the asker's own, joined with one this module can
 * abort, so aborting `own` withdraws the next answerer's card or prompt in every browser (S33,
 * S36). Placed on the request when DSH lets it be (it captured the asker's signal already and
 * passes a fresh request object, so nothing leaks back).
 * @returns `{own, signal, placed}`: `placed` is false for a frozen request (the caller's fallback)
 */
export function joinSignal(req) {
  const own = new AbortController()
  const signal = req.signal === undefined ? own.signal : AbortSignal.any([req.signal, own.signal])
  try { req.signal = signal } catch { /* a frozen request: `placed` says so */ }
  return { own, signal, placed: req.signal === signal }
}
