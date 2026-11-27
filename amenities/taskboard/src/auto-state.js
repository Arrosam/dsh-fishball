import { assertDocument, refusal } from './board.js'
import { CODE, STATUS } from './constants.js'
import { AUTO_LIMIT, AUTO_NOTICE, AUTO_REASON, AUTO_REVIEW } from './auto-constants.js'

export const integer = (value) => Number.isSafeInteger(value) && value >= 0
export const identifier = (value) => typeof value === 'string' && value.length > 0 && value.length <= AUTO_LIMIT.idChars
const str = (value) => typeof value === 'string'
const shape = (value, fields, optional = {}) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every((key) => Object.hasOwn(fields, key) || Object.hasOwn(optional, key)) &&
  Object.entries(fields).every(([key, check]) => Object.hasOwn(value, key) && check(value[key])) &&
  Object.entries(optional).every(([key, check]) => !Object.hasOwn(value, key) || check(value[key]))
const arrayOf = (check) => (value) => Array.isArray(value) && value.every(check)
const oneOf = (values) => (value) => Object.values(values).includes(value)
const optionalId = (v) => v === null || str(v)
const status = oneOf(STATUS)
const patch = { status, progress: integer, noteAppend: str }
const diff = (check) => (v) => shape(v, { before: check, after: check })
const source = (v) => shape(v, {
  targetId: identifier, endpointEpoch: (value) => identifier(value) || integer(value), eventId: identifier, sessionId: identifier,
  assignmentId: identifier, turnId: identifier, sequence: integer,
})
const parent = (v) => v === null || shape(v, { taskId: str, title: str, status, progress: Number.isInteger, path: arrayOf(str) })
const change = (v) => shape(v, { taskId: str, title: str, progress: Number.isInteger, parent, evidence: str,
  fields: (d) => shape(d, {}, { status: diff(status), progress: diff(Number.isInteger), note: (n) => diff(str)(n) || shape(n, { before: (v) => v === null, after: str, appendOnly: (v) => v === true }) }),
})
export const modelSelection = (v) => v === null || shape(v, { provider: identifier, model: identifier })
const batch = (v) => shape(v, {
  batchId: identifier, batchVersion: integer, baseRevision: integer, revision: integer, createdAt: integer,
  model: (m) => m !== null && modelSelection(m), source, changes: arrayOf(change), reviewIds: arrayOf(identifier),
  notification: oneOf(AUTO_NOTICE),
}, { undone: (u) => shape(u, { at: integer, revision: integer, actor: (a) => a === 'owner' }), archivedAt: integer })
const decision = (v) => v === 'reject' || shape(v, { confirm: arrayOf(oneOf(Object.keys(patch))) })
const review = (v) => shape(v, {
  reviewId: identifier, reviewVersion: integer, batchId: identifier, taskId: str, title: str, source, evidence: str,
  suggestion: (s) => shape(s, {}, patch), baseRevision: integer, status: oneOf(AUTO_REVIEW),
  snapshot: (s) => shape(s, { parentId: optionalId, title: str, createdAt: Number.isSafeInteger,
    fields: (f) => shape(f, {}, { status, progress: Number.isInteger, note: str }) }),
}, { resolvedAt: integer, resolvedRevision: integer, decision })
const entry = (v) => shape(v, { key: identifier, at: integer }, { outcome: oneOf(AUTO_REASON) })
const watermark = (v) => shape(v, { key: identifier, sequence: integer })
const counters = (v) => shape(v, {}, Object.fromEntries(Object.values(AUTO_REASON).map((key) => [key, integer])))
const autoState = (v) => shape(v, {
  model: modelSelection, generation: integer, batches: arrayOf(batch), reviews: arrayOf(review),
  receipts: arrayOf(entry), watermarks: arrayOf(watermark), sent: arrayOf(integer), cooldownUntil: integer, counts: counters,
}, { last: (x) => shape(x, { reason: oneOf(AUTO_REASON), at: integer }) })

export const emptyAuto = () => ({ model: null, generation: 0, batches: [], reviews: [], receipts: [], watermarks: [], sent: [], cooldownUntil: 0, counts: {} })

/** The public document never acquires metadata keys. A malformed v2 is not an empty board. */
export function assertStored(value) {
  if (!value || (!Object.hasOwn(value, 'board') && !Object.hasOwn(value, 'auto'))) return assertDocument(value)
  if (!shape(value, { board: (board) => Boolean(assertDocument(board)), auto: autoState })) throw refusal(CODE.unavailable)
  return value
}

export const snapshotOf = (value) => Object.hasOwn(value, 'board') ? value : { board: value, auto: emptyAuto() }
export const publicReview = ({ snapshot, ...review }) => review
export const pendingReview = (review) => review.status === AUTO_REVIEW.pending
export const unknownNotice = (batch) => [AUTO_NOTICE.pending, AUTO_NOTICE.claimed, AUTO_NOTICE.unknown].includes(batch.notification) && batch.archivedAt === undefined
export const unresolvedCount = (auto) => auto.reviews.filter(pendingReview).length + auto.batches.filter(unknownNotice).length
export const storageBytes = (auto) => Buffer.byteLength(JSON.stringify(auto), 'utf8')
export const recentCalls = (auto, now) => auto.sent.filter((at) => at > now - AUTO_LIMIT.hourMs)
export const withinRetention = (batch, now) => batch.createdAt > now - AUTO_LIMIT.retentionMs

/** Once revision moves, full reverse note images can no longer be used safely. */
export function compactUndoNotes(auto, revision, now) {
  let changed = false
  const batches = auto.batches.map((batch) => {
    if (batch.undone === undefined && batch.revision === revision && (now === undefined || withinRetention(batch, now))) return batch
    const changes = batch.changes.map((change) => {
      const note = change.fields.note
      if (!note || note.appendOnly) return change
      changed = true
      const after = note.after.slice(note.before.length).trimStart()
      return { ...change, fields: { ...change.fields, note: { before: null, after, appendOnly: true } } }
    })
    return changes.some((change, index) => change !== batch.changes[index]) ? { ...batch, changes } : batch
  })
  return changed ? { ...auto, batches } : auto
}

export function pruneAuto(auto, now) {
  const pending = new Set(auto.reviews.filter(pendingReview).map((review) => review.batchId))
  const batches = auto.batches.filter((batch) => pending.has(batch.batchId) || unknownNotice(batch) || withinRetention(batch, now))
  const retained = new Set(batches.map((batch) => batch.batchId))
  return { ...auto, batches, reviews: auto.reviews.filter((review) => retained.has(review.batchId)),
    receipts: auto.receipts.filter(({ at }) => at > now - AUTO_LIMIT.retentionMs), sent: recentCalls(auto, now) }
}
