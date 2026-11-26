import { createHash } from 'node:crypto'
import { ID, INSTRUCTION, LIMIT, PROTOCOL, S, TERMINAL } from './constants.js'
import { bytes, clip, record, sameSubject } from './shapes.js'

export const forSubject = (state, subject) => state.requests.filter((request) => sameSubject(request.subject, subject))
export const utcDayOf = (time) => new Date(time).toISOString().split('T')[0]
export const isInFlight = (request) => [S.sending, S.unconfirmed, S.accepted].includes(request.status)
export const isActive = (request) => request.status === S.awaiting || isInFlight(request)
export function counts(requests) {
  let used = 0, reserved = 0
  for (const request of requests) {
    if (!request.day) continue
    if ([S.sending, S.unconfirmed].includes(request.status)) reserved++
    else if (request.status !== S.notDelivered) used++
  }
  return { used, reserved }
}

export function briefOf(input, requests) {
  const history = []
  for (const { brief, result } of requests.filter(({ day, status }) => day && status !== S.notDelivered)) {
    if (result === undefined || result.truncated) return undefined
    const { question, evidence } = brief
    const { status, text } = result
    history.push({ question, ...(evidence === undefined ? {} : { evidence }), result: { status, ...(text === undefined ? {} : { text }) } })
  }
  const { question, evidence } = input
  const brief = { history, question, ...(evidence === undefined ? {} : { evidence }) }
  if (bytes(JSON.stringify({ instruction: INSTRUCTION, brief })) <= LIMIT.briefBytes) return brief
}

export const digestOf = ({ destination, brief, requestId, previous }) => createHash('sha256').update(JSON.stringify({ instruction: INSTRUCTION, destination, brief, requestId, previous })).digest('hex')

export function resultOf(receipt) {
  if (receipt?.event !== PROTOCOL.receipt || !TERMINAL.includes(receipt.status)) return undefined
  const { status } = receipt
  const usage = record(receipt.usage) ? Object.fromEntries(['inputTokens', 'outputTokens', 'reasoningTokens']
    .filter((key) => Number.isSafeInteger(receipt.usage[key]) && receipt.usage[key] >= 0).map((key) => [key, receipt.usage[key]])) : undefined
  if (status !== S.advice) return { status, ...(usage && { usage }) }
  if (typeof receipt.text !== 'string' || !receipt.text.isWellFormed() || !receipt.text.trim() || typeof receipt.truncated !== 'boolean') return undefined
  const text = clip(receipt.text, LIMIT.storedAdviceBytes)
  return { status, text, truncated: receipt.truncated || text !== receipt.text, ...(usage && { usage }) }
}

export function presentResult(result) {
  if (result?.status !== S.advice) return result
  const text = clip(result.text, LIMIT.displayedBytes)
  return { ...result, text, truncated: result.truncated || text !== result.text }
}

export function noticeFor(request, result, ref) {
  const payload = { event: PROTOCOL.receipt, origin: 'Consultant (untrusted advice; not authorization or execution)', subject: request.subject,
    requestId: request.requestId, targetId: ref.targetId, model: request.destination.model, ...presentResult(result) }
  const dedupeKey = [ID, ref.endpointEpoch, ref.bindingId, ref.requestId, result.status].join(':')
  return { pluginId: ID, text: JSON.stringify(payload), wake: true, dedupeKey }
}
