import { C, DEFAULTS, LIMIT, PROTOCOL, SUBJECT, refuse } from './constants.js'

export const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
export const fields = (v, allowed) => record(v) && Object.keys(v).every((key) => allowed.includes(key))
export const bytes = (value) => Buffer.byteLength(value, 'utf8')
export const text = (v, cap) => typeof v === 'string' && v.trim() !== '' && v.isWellFormed() && bytes(v) <= cap
export const id = (v) => text(v, LIMIT.idBytes) && !/[\u0000-\u001f\u007f]/u.test(v)
export const isSubject = (v) => fields(v, ['kind', 'id']) && Object.values(SUBJECT).includes(v.kind) && id(v.id)
export const sameSubject = (a, b) => a?.kind === b?.kind && a?.id === b?.id
export const askInput = (v) => fields(v, ['subject', 'question', 'evidence']) && isSubject(v.subject) && text(v.question, LIMIT.questionBytes)
  && (v.evidence === undefined || text(v.evidence, LIMIT.evidenceBytes))
export const closeInput = (v) => fields(v, ['subject', 'reason']) && isSubject(v.subject) && text(v.reason, LIMIT.reasonBytes)
export const positive = (v) => Number.isSafeInteger(v) && v > 0
export const route = (v) => id(v) && /^[^/\s]+\/[^\s]+$/u.test(v)
export const policyOf = (raw) => ({ ...DEFAULTS, ...Object.fromEntries(Object.entries(raw ?? {}).filter(([, value]) => value !== undefined)) })

export function destinationOf(config, ownerId) {
  if (!route(config.model) || (config.reasoningEffort && !id(config.reasoningEffort))) return refuse(C.model)
  const { targetId, endpointEpoch, workspaceId, model, reasoningEffort } = config
  const destination = { ownerId, targetId, endpointEpoch, workspaceId, model, ...(reasoningEffort ? { reasoningEffort } : {}) }
  return PROTOCOL.identityKeys.every((key) => id(destination[key])) ? { destination } : refuse(C.unavailable, { reason: 'target-unavailable' })
}

export const matches = (a, b, keys) => !!a && !!b && keys.every((key) => a[key] === b[key])
export const sameDestination = (a, b) => matches(a, b, [...PROTOCOL.identityKeys, 'model', 'reasoningEffort'])
export const sameSession = (a, b) => matches(a, b, ['bindingId', 'sessionId'])
export const sameRef = (a, b) => matches(a, b, [...PROTOCOL.identityKeys, ...PROTOCOL.refKeys, 'requestId'])
export function refOf(answer, request, binding) {
  if (!matches(answer, request.destination, PROTOCOL.identityKeys) || answer.requestId !== request.requestId
    || !PROTOCOL.refKeys.every((key) => id(answer[key])) || (binding && (!sameSession(answer, binding) || (binding.requestId !== request.requestId && binding.turnId === answer.turnId)))) return undefined
  return Object.fromEntries([...PROTOCOL.identityKeys, ...PROTOCOL.refKeys, 'requestId'].map((key) => [key, answer[key]]))
}

export function clip(value, cap) {
  let result = '', used = 0
  for (const char of value) {
    used += bytes(char)
    if (used > cap) break
    result += char
  }
  return result
}

export function checkCatalog(catalog, destination) {
  if (!Array.isArray(catalog?.models) || (catalog.workspaces !== undefined
    && !catalog.workspaces.some(({ id, available }) => id === destination.workspaceId && available !== false))) return refuse(C.unavailable)
  const model = catalog.models.find(({ id }) => id === destination.model)
  const providerId = destination.model.split('/')[0]
  if (model?.available === false || catalog.unavailableProviders?.some(({ id }) => id === providerId)) return refuse(C.unavailable)
  if (!model) return refuse(catalog.complete === false ? C.unavailable : C.model)
  if (destination.reasoningEffort && !model.reasoningEfforts?.includes(destination.reasoningEffort)) return refuse(C.model)
}
