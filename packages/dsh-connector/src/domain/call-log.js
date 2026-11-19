/**
 * What the session's own log says about one call (spikes S11, S36): the model-requested arguments
 * of a permission request's call, and the call id of a question that names none. Read-only and
 * pure over `session.snapshotEvents()`; moved from the V2 broker and question router by C-WIRE-2.
 */
import { createHash } from 'node:crypto'
import { ARGUMENTS_STATUS } from '../../mcp-schema/index.js'
import { canonical } from '../digest.js'
import { cutToBytes, byteLength } from '../text.js'
import { ELLIPSIS, GRANT, LOG_EVENT, QUESTION } from './constants.js'

/** The parsed arguments of one call as the model sent them (JSON text or a value), or undefined. */
function parsedArguments(raw) {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return undefined }
}

/** Arguments as the JSON text a descriptor carries: complete, or cut to `maxBytes` (truncated). */
export function argumentsText(text, maxBytes) {
  if (byteLength(text) <= maxBytes) return { text, status: ARGUMENTS_STATUS.complete }
  return { text: cutToBytes(text, maxBytes, ELLIPSIS), status: ARGUMENTS_STATUS.truncated }
}

/**
 * The arguments of `callId` in the session's log, as JSON text.
 * @returns `{text, status, value}`: status complete | truncated (over `maxBytes`) | unavailable
 *   (no call id, not found, or a call to another tool than `toolName`, whose arguments do not
 *   describe this request); `value` is the whole parsed arguments (the grant key), or undefined
 */
export function argumentsOf(session, callId, toolName, maxBytes) {
  const none = { text: '', status: ARGUMENTS_STATUS.unavailable, value: undefined }
  if (callId === undefined) return none
  const events = session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    let call
    if (event.type === LOG_EVENT.assistant) {
      const block = event.data?.message?.content?.find((entry) => entry.type === LOG_EVENT.toolCallBlock && entry.id === callId)
      if (block !== undefined) call = { name: block.name, raw: block.arguments }
    } else if (event.type === LOG_EVENT.ptcDispatch && event.data?.subCallId === callId) call = { name: event.data.name, raw: event.data.arguments }
    if (call === undefined) continue
    if (call.name !== toolName) return none
    const text = typeof call.raw === 'string' ? call.raw : JSON.stringify(call.raw)
    return { ...argumentsText(text, maxBytes), value: parsedArguments(call.raw) }
  }
  return none
}

/** sha256 of a call's canonical JSON arguments (any key order): an exact grant matches calls by it. */
export const argumentsDigest = (args) => createHash(GRANT.digest).update(canonical(args)).digest(GRANT.digestEncoding)

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The question ids of logged ask_user_question arguments, or null when unreadable. */
function questionIdsOf(raw) {
  const parsed = parsedArguments(raw)
  if (!isObject(parsed) || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return null
  return parsed.questions.every((question) => isObject(question) && typeof question.id === 'string') ? parsed.questions.map((question) => question.id) : null
}

/**
 * The call id of a question whose request names none (the legacy ask_user_question sends no
 * `wait`, S36 Q1): the session's ask_user_question call with no result yet whose question ids
 * match; with parallel calls of the same ids the newest is taken (S36 risk).
 * @returns the call id, or undefined
 */
export function questionCallIdOf(session, questions) {
  const open = new Map()
  for (const event of session.snapshotEvents()) {
    if (event.type === LOG_EVENT.toolCall && event.data?.name === QUESTION.askTool) open.set(event.data.callId, event.data.arguments)
    else if (event.type === LOG_EVENT.toolResult) open.delete(event.data?.message?.toolCallId)
  }
  const ids = questions.map((question) => question.id)
  const match = [...open].reverse().find(([, raw]) => {
    const asked = questionIdsOf(raw)
    return asked !== null && asked.length === ids.length && asked.every((id) => ids.includes(id))
  })
  return match?.[0]
}
