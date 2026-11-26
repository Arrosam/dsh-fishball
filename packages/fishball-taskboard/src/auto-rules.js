/** Pure rules for the automatic taskboard entry point. The caller owns trusted source identity,
 * receipt deduplication, authorization and the queue's base-revision check before applyProposals.
 */
import { createHash } from 'node:crypto'
import { AUTO_LIMIT, AUTO_REVIEW } from './auto-constants.js'
import { identifier, integer, withinRetention } from './auto-state.js'
import { codePoints, isUnfinished, refusal } from './board.js'
import { CODE, LIMITS, OPEN_STATUSES, STATUS } from './constants.js'

const FIELD = Object.freeze({
  proposal: Object.freeze(['status', 'progress', 'noteAppend']),
  reversible: Object.freeze(['status', 'progress', 'note']),
  undo: Object.freeze(['batchId', 'expectedBatchVersion', 'baseRevision']),
  review: Object.freeze(['reviewId', 'expectedReviewVersion', 'baseRevision', 'decision']),
})
const PROPOSAL_KEYS = Object.freeze(['taskId', 'evidence', ...FIELD.proposal])
const REVIEW_ACTION = Object.freeze({ reject: 'reject' })
const INITIAL_REVIEW_VERSION = 1
const UNDO_ACTOR = 'owner'
const HASH = Object.freeze({ algorithm: 'sha256', encoding: 'hex' })
const NOTE_SEPARATOR = '\n'
const PATH_SEPARATORS = Object.freeze([' → ', ' > ', ' / '])
const LINE = Object.freeze({
  separator: /\r\n|[\n\r\u2028\u2029]/u,
  fence: /^[ \t]*(?:>\s*)?(`{3,}|~{3,})(.*)$/u,
  quotedOrCode: /^(?: {4}|\t|[ \t]*(?:>|<|["'“‘「『]))/u,
  introduction: /[:：]$/u,
  bullet: /^\s*(?:[-*+] |\d+[.)] )/u,
  heading: /^#{1,6}\s+(.*)$/u,
  notObserved: /^(?:plans?|next steps?|future work|to do|excerpts?|(?:quoted )?examples?|(?:proposed|expected|target|hypothetical) (?:updates?|progress|results?)|计划|下一步|示例|引用|预期)(?:\s*[:：].*|\s*)$/iu,
  observed: /^(?:actual (?:progress|results?|status)|(?:observed )?results?|(?:current )?(?:progress|status)|实际进度|实际结果|当前进度)(?:\s*[:：]\s*|\s*)$/iu,
  period: /[.。]$/u,
  factSeparator: /[;；]/u,
  labeledSuffix: /^(?:\s*[:：]\s*|\s+|(?=[\p{Script=Han}]))/u,
})

// This is a whitelist of assertions, not a natural-language classifier. In particular, none
// of these forms can hide an imperative, a negation, or a percentage attached to another task.
const FACT = Object.freeze({
  progress: /^(?:(?:is )?at |(?:has )?reached |(?:(?:actual )?progress(?: is|\s*[:：])?\s+)|(?:实际进度|进度)(?:为|是|[:：])?\s*)(\d{1,3})\s*[%％](?: progress)?$/iu,
  statusAndNumber: Object.freeze([
    [STATUS.inProgress, /^(?:is in progress at |(?:正在进行|进行中)[,，]\s*(?:实际)?进度(?:为|是|[:：])?\s*)(\d{1,3})\s*[%％](?: progress)?$/iu],
    [STATUS.done, /^(?:is complete(?:d)? at |(?:已|全部|已全部)完成[,，]\s*(?:实际)?进度(?:为|是|[:：])?\s*)(100)\s*[%％](?: progress)?$/iu],
  ]),
  statuses: Object.freeze([
    [STATUS.inProgress, /^(?:(?:is )?in progress|(?:has )?(?:started|begun)(?: implementation)?|(?:is )?underway|(?:已)?开始实施|正在进行|进行中)$/iu],
    [STATUS.blocked, /^(?:(?:is )?blocked(?: (?:waiting for|on) (?:validation|review|approval|(?:a |the )?dependency|CI|tests?|input|sign[- ]off))?|(?:is )?waiting for (?:validation|review|approval|(?:a |the )?dependency|CI|tests?|input|sign[- ]off)|已受阻|受阻|(?:正)?等待(?:依赖|验证|审核|批准))$/iu],
    [STATUS.todo, /^(?:(?:is |has )?not (?:yet )?started|尚未开始|未开始)$/iu],
    [STATUS.done, /^(?:(?:(?:is |was |has been )?(?:complete(?:d)?|done))|(?:is )?(?:fully|all) complete(?:d)?|(?:已|全部|已经)?完成|已全部完成)$/iu],
  ]),
  note: /^(?:(?:(?:all |\d+ )?(?:(?:unit|integration|smoke|regression) )?tests? (?:passed|failed))|(?:(?:the )?(?:checksums?|hashes|hash|signatures?) (?:was |were )?verified)|(?:测试已通过|测试失败|校验值已核对|已核对校验值))$/iu,
})

const invalid = (field) => { throw refusal(CODE.invalidInput, field) }
const stale = () => { throw refusal(CODE.stale) }
const present = (value) => typeof value === 'string' && value.length > 0
const withoutPeriod = (line) => line.replace(LINE.period, '')
const reportsCompletion = ({ status, progress }) => status === STATUS.done || progress === LIMITS.progress.max
const taskIndex = (board) => new Map(board.tasks.map((task) => [task.id, task]))
const taskLabel = ({ id, title, progress }) => ({ taskId: id, title, progress })
const storedField = (field) => field === 'noteAppend' ? 'note' : field
const digest = (value) => createHash(HASH.algorithm).update(JSON.stringify(value)).digest(HASH.encoding)

function keys(value, allowed, field) {
  if (!value || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) invalid(field)
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(field)
}

function increment(version) {
  if (!Number.isSafeInteger(version + 1)) throw refusal(CODE.limitReached)
  return version + 1
}

function writeFields(board, changes, at) {
  if (changes.size === 0) return board
  const tasks = board.tasks.map((task) => changes.has(task.id) ? { ...task, ...changes.get(task.id), updatedAt: at } : task)
  return { ...board, tasks, revision: increment(board.revision) }
}

function ancestorTitles(byId, task) {
  const path = []
  for (let ancestor = byId.get(task.parentId); ancestor; ancestor = byId.get(ancestor.parentId)) path.unshift(ancestor.title)
  return path
}

function labelsOf(byId) {
  const labels = new Map()
  for (const task of byId.values()) {
    const titles = [...ancestorTitles(byId, task), task.title]
    const aliases = new Set([task.id, task.title, ...PATH_SEPARATORS.map((separator) => titles.join(separator))])
    for (const label of aliases) {
      if (!label) continue
      if (!labels.has(label)) labels.set(label, new Set())
      labels.get(label).add(task.id)
    }
  }
  return labels
}

/** Match a whole, literal assertion rather than a substring of a sentence, example or code. */
function assertions(text) {
  const observed = []
  let fenced
  let inQuoteOrCode = false
  let nonReport = false
  for (const raw of text.split(LINE.separator)) {
    const fence = LINE.fence.exec(raw)
    if (fence) {
      const [, marker, tail] = fence
      if (!fenced) fenced = marker
      else if (marker.startsWith(fenced) && !tail.trim()) fenced = undefined
      continue
    }
    if (fenced) continue
    const line = raw.trim()
    if (!line) inQuoteOrCode = false
    else if (LINE.quotedOrCode.test(raw)) inQuoteOrCode = true
    if (!line || inQuoteOrCode) continue
    const claim = line.replace(LINE.bullet, '')
    const heading = LINE.heading.exec(claim)?.[1]
    const label = heading ?? claim
    if (LINE.observed.test(label)) nonReport = false
    else if (heading || LINE.introduction.test(label) || LINE.notObserved.test(label)) nonReport = true
    else if (!nonReport) observed.push({ line, claim })
  }
  return observed
}

/** A fact can include explicit status and number together, plus one or more proven note clauses. */
function parseFacts(suffix) {
  const facts = {}
  const notes = []
  for (const part of suffix.split(LINE.factSeparator)) {
    const clause = part.trim()
    const predicate = withoutPeriod(clause)
    const [combinedStatus, combinedProgress] = FACT.statusAndNumber.find(([, form]) => form.test(predicate)) ?? []
    const progress = (combinedProgress ?? FACT.progress).exec(predicate)
    const state = combinedStatus ?? FACT.statuses.find(([, form]) => form.test(predicate))?.[0]
    if (state !== undefined) {
      if (Object.hasOwn(facts, 'status')) return undefined
      facts.status = state
    }
    if (progress) {
      if (Object.hasOwn(facts, 'progress')) return undefined
      facts.progress = Number(progress[1])
    }
    if (FACT.note.test(predicate)) notes.push(clause)
    else if (!progress && state === undefined) return undefined
  }
  return { ...facts, notes }
}

function factOf(claim, labels) {
  const matches = []
  for (const [label, taskIds] of labels) {
    const writtenLabel = [label, '**' + label + '**', '`' + label + '`'].find((candidate) => claim.startsWith(candidate))
    if (writtenLabel === undefined) continue
    const suffix = claim.slice(writtenLabel.length)
    const delimiter = LINE.labeledSuffix.exec(suffix)
    if (!delimiter) continue
    const facts = parseFacts(suffix.slice(delimiter[0].length))
    if (facts) matches.push({ taskIds, facts })
  }
  if (matches.length !== 1 || matches[0].taskIds.size !== 1) return undefined
  const [match] = matches
  return { taskId: match.taskIds.values().next().value, facts: match.facts }
}

function evidenceIndex(text, labels) {
  return assertions(text).flatMap(({ line, claim }) => {
    const match = factOf(claim, labels)
    if (!match) return []
    // Permit exact quotes with/without a list marker or terminal period, never inner substrings.
    return [{ ...match, quotes: new Set([line, claim, withoutPeriod(line), withoutPeriod(claim)]) }]
  })
}

function appendNote(note, fragment, field) {
  const fact = withoutPeriod(fragment)
  if (note.split(LINE.separator).some((line) => withoutPeriod(line.trim()) === fact)) return note
  const next = note ? note + NOTE_SEPARATOR + fragment : fragment
  if (codePoints(next) > LIMITS.noteChars.max) invalid(field)
  return next
}

function supportedPatch(proposal, facts, task, field) {
  const patch = {}
  for (const name of FIELD.proposal) {
    if (!Object.hasOwn(proposal, name)) continue
    const fieldName = field + '.' + name
    const value = proposal[name]
    if (name === 'status') {
      if ((!OPEN_STATUSES.includes(value) && value !== STATUS.done) || value !== facts.status) invalid(fieldName)
    } else if (name === 'progress') {
      if (!Number.isInteger(value) || value < LIMITS.progress.min || value > LIMITS.progress.max ||
          value < task.progress || value !== facts.progress) invalid(fieldName)
    } else {
      if (!present(value) || codePoints(value) > AUTO_LIMIT.evidenceChars ||
          !facts.notes.some((note) => note === value.trim() || withoutPeriod(note) === value.trim())) invalid(fieldName)
    }
    patch[name] = name === 'noteAppend' ? value.trim() : value
  }
  return patch
}

function materialize(task, patch, noteField) {
  const changes = {}
  for (const [name, value] of Object.entries(patch)) {
    const field = storedField(name)
    const after = field === 'note' ? appendNote(task.note, value, noteField) : value
    if (task[field] !== after) changes[field] = after
  }
  return changes
}

function snapshotValues(task, suggestion) {
  // Status is also a guard on any completion proposal: intervening closure is not consent.
  const fields = { status: task.status }
  for (const name of Object.keys(suggestion)) {
    const field = storedField(name)
    fields[field] = field === 'note' ? digest(task.note) : task[field]
  }
  return fields
}

function reviewFor(task, evidence, suggestion, batchId, source) {
  const { parentId, title, createdAt } = task
  return {
    reviewId: digest([batchId, task.id]), reviewVersion: INITIAL_REVIEW_VERSION, batchId, taskId: task.id,
    title, source, evidence, suggestion, status: AUTO_REVIEW.pending,
    snapshot: { parentId, title, createdAt, fields: snapshotValues(task, suggestion) },
  }
}

function summarize(next, patches) {
  const tasks = taskIndex(next)
  return [...patches].map(([id, { fields, evidence }]) => {
    const task = tasks.get(id)
    const parent = tasks.get(task.parentId)
    return {
      ...taskLabel(task),
      parent: parent ? { ...taskLabel(parent), status: parent.status, path: ancestorTitles(tasks, task) } : null,
      fields, evidence,
    }
  })
}

/**
 * Validate the entire model response on one validated board. Returns a single next board with
 * frozen-at-commit diffs and review drafts; no input is mutated, even when a later proposal refuses.
 */
export function applyProposals(board, response, text, { batchId, source, now }) {
  keys(response, ['proposals'], 'proposals')
  if (!Array.isArray(response.proposals) || response.proposals.length > board.tasks.length || board.tasks.length > AUTO_LIMIT.rows) invalid('proposals')
  if (!present(text)) invalid('evidence')
  const tasks = taskIndex(board)
  const indexed = evidenceIndex(text, labelsOf(tasks))
  const reportedComplete = new Set(indexed.filter(({ facts }) => reportsCompletion(facts)).map(({ taskId }) => taskId))
  const seen = new Set()
  const patches = new Map()
  const writes = new Map()
  const reviews = []
  for (const [index, proposal] of response.proposals.entries()) {
    const field = 'proposals[' + index + ']'
    keys(proposal, PROPOSAL_KEYS, field)
    const { taskId, evidence } = proposal
    const task = tasks.get(taskId)
    if (!task || seen.has(taskId) || !isUnfinished(task) || board.memos.some(({ id }) => id === taskId)) invalid(field + '.taskId')
    seen.add(taskId)
    if (!present(evidence) || codePoints(evidence) > AUTO_LIMIT.evidenceChars || !text.includes(evidence)) invalid(field + '.evidence')
    const matches = indexed.filter((item) => item.quotes.has(evidence))
    if (!matches.length || matches.some((item) => item.taskId !== taskId)) invalid(field + '.evidence')
    const [{ facts }] = matches
    const patch = supportedPatch(proposal, facts, task, field)
    const completion = reportsCompletion(facts)
    // The model cannot bypass review by quoting around a completion report for the same row.
    if (!completion && (reportedComplete.has(taskId) || !Object.keys(patch).length)) invalid(field)
    if (completion) {
      // The literal completion fact itself can supply a review field; never infer one terminal
      // field from the other and do not let other fields of this item escape into automatic writes.
      if (facts.status === STATUS.done) patch.status = STATUS.done
      if (facts.progress === LIMITS.progress.max) patch.progress = LIMITS.progress.max
    }
    // A selected quote cannot disambiguate two explicit values in the same report.
    for (const name of FIELD.reversible) {
      if (name !== 'note' && Object.hasOwn(patch, name) && indexed.some((item) =>
        item.taskId === taskId && Object.hasOwn(item.facts, name) && item.facts[name] !== patch[name])) invalid(field + '.' + name)
    }
    const change = materialize(task, patch, field + '.noteAppend')
    if (completion) {
      if (Object.keys(change).length) reviews.push(reviewFor(task, evidence, patch, batchId, source))
    } else if (Object.keys(change).length) {
      writes.set(taskId, change)
      const fields = Object.fromEntries(Object.entries(change).map(([name, after]) => [name, { before: task[name], after }]))
      patches.set(taskId, { fields, evidence })
    }
  }
  const next = writeFields(board, writes, now)
  return { board: next, changes: summarize(next, patches), reviews: reviews.map((review) => ({ ...review, baseRevision: next.revision })) }
}

function targetOf(args, allowed, idKey, versionKey, records) {
  keys(args, allowed, idKey)
  if (!identifier(args[idKey])) invalid(idKey)
  if (!integer(args[versionKey]) || args[versionKey] === 0) invalid(versionKey)
  if (!integer(args.baseRevision)) invalid('baseRevision')
  const record = records.find((item) => item[idKey] === args[idKey])
  if (!record) throw refusal(CODE.notFound, idKey)
  return record
}

function closeReview(review, status, now, revision, decision) {
  return {
    ...review, status, reviewVersion: increment(review.reviewVersion), resolvedAt: now, resolvedRevision: revision,
    ...(decision === undefined ? {} : { decision }),
  }
}

/** Undo uses persisted mirrors, never a browser-supplied patch. Replaying a successful undo is inert. */
export function undoBatch(board, auto, args, now) {
  const batch = targetOf(args, FIELD.undo, 'batchId', 'expectedBatchVersion', auto.batches)
  const { batchId } = batch
  if (batch.undone) return { board, auto, batchId, alreadyUndone: true }
  if (!batch.changes.length || !withinRetention(batch, now) || args.baseRevision !== board.revision ||
      batch.revision !== board.revision || args.expectedBatchVersion !== batch.batchVersion) stale()
  const related = auto.reviews.filter((review) => review.batchId === batchId)
  if (related.length !== batch.reviewIds.length || related.some((review) => !batch.reviewIds.includes(review.reviewId) ||
      review.status !== AUTO_REVIEW.pending || review.reviewVersion !== INITIAL_REVIEW_VERSION)) stale()
  const tasks = taskIndex(board)
  const writes = new Map()
  for (const { taskId, fields } of batch.changes) {
    const task = tasks.get(taskId)
    const entries = Object.entries(fields)
    if (!task || writes.has(taskId) || !entries.length || entries.some(([name, { before, after }]) =>
      !FIELD.reversible.includes(name) || task[name] !== after || before === after)) stale()
    writes.set(taskId, Object.fromEntries(entries.map(([name, { before }]) => [name, before])))
  }
  const next = writeFields(board, writes, now)
  const undone = { at: now, revision: next.revision, actor: UNDO_ACTOR }
  return {
    board: next, batchId,
    auto: {
      ...auto,
      batches: auto.batches.map((entry) => entry === batch ? { ...entry, batchVersion: increment(entry.batchVersion), undone } : entry),
      reviews: auto.reviews.map((review) => review.batchId === batchId ? closeReview(review, AUTO_REVIEW.voided, now, next.revision) : review),
    },
  }
}

function confirmedFields(decision, suggestion) {
  if (decision === REVIEW_ACTION.reject) return []
  keys(decision, ['confirm'], 'decision')
  const fields = decision.confirm
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > FIELD.proposal.length || new Set(fields).size !== fields.length ||
      [...fields].some((name) => !FIELD.proposal.includes(name) || !Object.hasOwn(suggestion, name))) invalid('decision.confirm')
  return fields
}

/** A manager's explicit resolution is a fresh decision, not an automatically accepted completion. */
export function resolveReview(board, auto, args, now) {
  const review = targetOf(args, FIELD.review, 'reviewId', 'expectedReviewVersion', auto.reviews)
  if (args.baseRevision !== board.revision || args.expectedReviewVersion !== review.reviewVersion || review.status !== AUTO_REVIEW.pending) stale()
  const fields = confirmedFields(args.decision, review.suggestion)
  const task = board.tasks.find(({ id }) => id === review.taskId)
  const { snapshot } = review
  const sameTarget = task && snapshot && task.parentId === snapshot.parentId && task.title === snapshot.title && task.createdAt === snapshot.createdAt
  const sameSnapshot = sameTarget && Object.entries(snapshotValues(task, review.suggestion))
    .every(([name, value]) => snapshot.fields[name] === value)
  // A fresh rejection can discard stale evidence, but can never confirm it or change the board.
  if (!sameSnapshot && fields.length) stale()
  const status = fields.length ? AUTO_REVIEW.confirmed : sameSnapshot ? AUTO_REVIEW.rejected : AUTO_REVIEW.voided
  const writes = new Map()
  if (fields.length) {
    const patch = Object.fromEntries(fields.map((name) => [name, review.suggestion[name]]))
    const values = materialize(task, patch, 'decision.confirm')
    if (Object.keys(values).length) writes.set(task.id, values)
  }
  const next = writeFields(board, writes, now)
  const decision = fields.length ? { confirm: [...fields] } : REVIEW_ACTION.reject
  const resolved = closeReview(review, status, now, next.revision, decision)
  return { board: next, auto: { ...auto, reviews: auto.reviews.map((entry) => entry === review ? resolved : entry) },
    reviewId: review.reviewId, reviewVersion: resolved.reviewVersion, status }
}
