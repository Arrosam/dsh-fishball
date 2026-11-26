import { createHash } from 'node:crypto'
import { isUnfinished, refusal } from './board.js'
import { CODE, NAMESPACE } from './constants.js'
import { AUTO_LIMIT, AUTO_NOTICE, AUTO_REASON as WHY, AUTO_WIRE } from './auto-constants.js'
import { compactUndoNotes, identifier, integer, modelSelection, pendingReview, pruneAuto, publicReview, recentCalls,
  storageBytes, unknownNotice, unresolvedCount, withinRetention } from './auto-state.js'
import { applyProposals, undoBatch } from './auto-rules.js'

const keyOf = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
const sameModel = (a, b) => a?.provider === b?.provider && a?.model === b?.model
const project = ({ id, parentId, title, status, progress, note }) => ({ id, parentId, title, status, progress, note })
const eligibleBoard = (board) => board.tasks.length <= AUTO_LIMIT.rows && board.tasks.some(isUnfinished)
const lastSequence = (auto, key) => auto.watermarks.find((mark) => mark.key === key)?.sequence
const diagnostic = (auto, reason, at) => ({ ...auto, counts: { ...auto.counts,
  [reason]: Math.min(Number.MAX_SAFE_INTEGER, (auto.counts[reason] ?? 0) + 1) }, last: { reason, at } })

function sourceOf(observed) {
  const { targetId, endpointEpoch } = observed.source ?? {}
  const { eventId } = observed
  const { sessionId, assignment, turnFinal } = observed.payload ?? {}
  if (![targetId, eventId, sessionId, assignment?.id, turnFinal?.turnId].every(identifier) ||
      !(identifier(endpointEpoch) || integer(endpointEpoch)) || assignment.purpose !== AUTO_WIRE.work ||
      turnFinal.version !== AUTO_WIRE.version || !integer(turnFinal.sequence)) return undefined
  return { targetId, endpointEpoch, eventId, sessionId, assignmentId: assignment.id,
    turnId: turnFinal.turnId, sequence: turnFinal.sequence }
}

const noticeText = (batch) => {
  // Render bounded trusted structure; titles and identities are quoted JSON data, never instructions.
  const tasks = batch.changes.map(({ taskId, title, progress, parent, fields }) => ({
    taskId, title, progress: progress + '%', ...(fields.progress ? { previousProgress: fields.progress.before + '%' } : {}),
    directParent: parent === null ? 'No parent task' : { ...parent, progress: parent.progress + '%' },
  }))
  return 'Task board auto-update: already committed; do not apply it again.\n' + JSON.stringify({
    batchId: batch.batchId, revision: batch.revision, sessionId: batch.source.sessionId, tasks,
    ...(batch.reviewIds.length ? { pendingCompletionReviews: batch.reviewIds.length } : {}),
  })
}

const noticeResult = (batch, notification) => ({ ...batch, notification, batchVersion: batch.batchVersion + 1 })
const replaceBatch = (auto, batch) => ({ ...auto, batches: auto.batches.map((old) => old.batchId === batch.batchId ? batch : old) })
const capacity = (auto) => storageBytes(auto) <= AUTO_LIMIT.bytes && unresolvedCount(auto) <= AUTO_LIMIT.unresolved

function untilAbort(signal, work) {
  signal.throwIfAborted()
  let abort
  const fence = new Promise((_, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  return Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return work() }), fence])
    .finally(() => signal.removeEventListener('abort', abort))
}

/** Paid work outside the board queue; receipts, budgets and the write fence inside it. */
export function createAutoUpdate({ store, modelPort, now = Date.now }) {
  let binding, active, unsubscribe
  let settingsIntent = 0
  const currentHost = () => Boolean(store.automation && store.canWrite?.() !== false && binding && typeof binding.events?.observeTurnFinished === 'function' &&
    typeof binding.events?.isCurrentWorkTurn === 'function' && modelPort.available?.() !== false)
  const isEnabled = () => currentHost() && store.readAuto().auto.model !== null

  async function log(reason, receiptKey, cooldownMs) {
    await store.change((board, auto) => {
      if (auto.model === null && receiptKey === undefined) return { board }
      const at = now()
      return { board, auto: { ...diagnostic(auto, reason, at),
        ...(receiptKey === undefined ? {} : { receipts: auto.receipts.map((r) => r.key === receiptKey ? { ...r, outcome: reason } : r) }),
        ...(integer(cooldownMs) && cooldownMs > 0 ? { cooldownUntil: Math.max(auto.cooldownUntil, at + cooldownMs) } : {}),
      } }
    })
  }

  async function flushNotice(instance, id) {
    if (binding !== instance || typeof instance.manager?.notify !== 'function') return
    const { result: { batch } } = await store.change((board, auto) => {
      const pending = auto.batches.find((b) => b.batchId === id && b.notification === AUTO_NOTICE.pending && b.archivedAt === undefined)
      if (!pending || binding !== instance) return { board }
      const batch = noticeResult(pending, AUTO_NOTICE.claimed)
      return { board, auto: replaceBatch(auto, batch), batch }
    })
    if (!batch) return
    let status = AUTO_NOTICE.unknown
    try {
      if (binding === instance) {
        await instance.manager.notify({ pluginId: NAMESPACE, dedupeKey: NAMESPACE + ':auto:' + id, text: noticeText(batch), wake: true })
        status = AUTO_NOTICE.accepted
      }
    } catch (error) {
      // A known pre-admission refusal is different from a transport/unknown outcome.
      if (error?.code === 'manager-not-ready') status = AUTO_NOTICE.failed
    }
    await store.change((board, auto) => {
      const current = auto.batches.find((b) => b.batchId === id)
      return current?.notification !== AUTO_NOTICE.claimed ? { board } :
        { board, auto: replaceBatch(auto, noticeResult(current, status)) }
    })
  }

  async function recoverNotices(instance) {
    if (!store.automation || typeof instance.manager?.notify !== 'function') return
    const { result: { ids } } = await store.change((board, auto) => {
      if (binding !== instance) return { board }
      const batches = auto.batches.map((batch) => batch.notification === AUTO_NOTICE.claimed ? noticeResult(batch, AUTO_NOTICE.unknown) : batch)
      return { board, auto: batches.some((batch, index) => batch !== auto.batches[index]) ? { ...auto, batches } : auto,
        ids: batches.filter((batch) => batch.notification === AUTO_NOTICE.pending).map((batch) => batch.batchId) }
    })
    for (const id of ids ?? []) await flushNotice(instance, id)
  }

  async function observe(instance, event) {
    if (binding !== instance || !isEnabled()) return
    const source = sourceOf(event)
    if (!source) return log(WHY.invalidSource)
    const { targetId, endpointEpoch, eventId, sessionId, assignmentId, sequence } = source
    const receiptKey = keyOf(targetId, endpointEpoch, eventId)
    const markKey = keyOf(targetId, endpointEpoch, sessionId, assignmentId)
    const batchId = keyOf(NAMESPACE, targetId, endpointEpoch, sessionId, assignmentId, sequence)
    const { turnFinal } = event.payload
    const text = turnFinal.message?.text
    const controller = new AbortController()
    const deadline = AbortSignal.timeout(AUTO_LIMIT.timeoutMs)
    const signal = AbortSignal.any([controller.signal, deadline])
    const fresh = () => untilAbort(signal, () => binding === instance && instance.events.isCurrentWorkTurn(event, { signal }))
    const { result: { job } } = await store.change((board, original) => {
      if (binding !== instance || original.model === null) return { board }
      const at = now()
      const auto = pruneAuto(original, at)
      const prior = lastSequence(auto, markKey)
      if ((prior !== undefined && sequence <= prior) || auto.receipts.some(({ key }) => key === receiptKey)) return { board }
      const next = { ...auto, watermarks: [...auto.watermarks.filter(({ key }) => key !== markKey), { key: markKey, sequence }],
        receipts: [...auto.receipts, { key: receiptKey, at }] }
      // Do not lose an in-flight fence just because a new management stream cannot be retained.
      if (!capacity(next)) {
        active?.abort.abort()
        return { board, auto: diagnostic(auto, WHY.capacity, at) }
      }
      const reason = turnFinal.reason !== AUTO_WIRE.completed || turnFinal.message?.truncated !== false ||
          typeof text !== 'string' || text.trim() === '' ? WHY.invalidSource :
        !eligibleBoard(board) ? WHY.rowBudget : active ? WHY.busy :
          auto.cooldownUntil > at ? WHY.rateLimited : auto.sent.length >= AUTO_LIMIT.calls ? WHY.rateBudget :
            unresolvedCount(auto) >= AUTO_LIMIT.unresolved ? WHY.capacity : undefined
      return reason ? { board, auto: diagnostic(next, reason, at) } :
        { board, auto: next, job: { board, generation: auto.generation, model: auto.model } }
    })
    if (!job) return
    // Another contender may have queued behind the first receipt before its durable result was visible.
    if (active) return log(WHY.busy, receiptKey)
    active = { abort: controller }
    const fence = (board, auto) => !signal.aborted && binding === instance && auto.generation === job.generation &&
      board.revision === job.board.revision && lastSequence(auto, markKey) === sequence
    let notify = false
    try {
      if (!await fresh()) return await log(WHY.invalidSource, receiptKey)
      if (!await untilAbort(signal, () => modelPort.has(job.model))) return await log(WHY.modelUnavailable, receiptKey)
      const send = await untilAbort(signal, () => modelPort.prepare(job.model, job.board.tasks.map(project), text, signal))
      const { result: { claimed } } = await store.change(async (board, auto) => {
        if (!fence(board, auto) || !await fresh() || !fence(board, auto)) return { board }
        const at = now()
        const sent = recentCalls(auto, at)
        if (auto.cooldownUntil > at || sent.length >= AUTO_LIMIT.calls) return { board }
        return { board, auto: { ...auto, sent: [...sent, at] }, claimed: true }
      })
      if (!claimed || !await fresh()) return await log(WHY.stale, receiptKey)
      const current = store.readAuto()
      if (!fence(current.board, current.auto)) return await log(WHY.stale, receiptKey)
      const response = await untilAbort(signal, send)
      if (!await untilAbort(signal, () => modelPort.has(job.model))) return await log(WHY.modelUnavailable, receiptKey)
      const { result } = await store.change(async (board, original) => {
        const at = now()
        const auto = pruneAuto(original, at)
        const skip = (reason) => ({ board, auto: diagnostic(auto, reason, at) })
        if (!fence(board, auto) || !eligibleBoard(board) || !await fresh() || !fence(board, auto)) return skip(WHY.stale)
        let plan
        try { plan = applyProposals(board, response, text, { batchId, source, now: at }) }
        catch { return skip(WHY.invalidOutput) }
        const { changes, reviews } = plan
        if (!changes.length && !reviews.length) return skip(WHY.noChange)
        const batch = { batchId, batchVersion: 1, baseRevision: board.revision, revision: plan.board.revision,
          createdAt: at, source, model: job.model, changes, reviewIds: reviews.map(({ reviewId }) => reviewId),
          notification: changes.length ? AUTO_NOTICE.pending : AUTO_NOTICE.none }
        const next = { ...auto, batches: [...auto.batches, batch], reviews: [...auto.reviews, ...reviews] }
        if (!capacity(next)) return skip(WHY.capacity)
        return { board: plan.board, auto: next, notify: changes.length > 0 }
      })
      notify = result.notify === true
    } catch (error) {
      const code = Object.values(WHY).includes(error?.code) ? error.code : WHY.modelFailed
      await log(controller.signal.aborted ? WHY.stale : deadline.aborted ? WHY.timeout : code, receiptKey, error?.cooldownMs)
    } finally {
      active = undefined
    }
    if (notify) await flushNotice(instance, batchId)
  }

  function refreshObserver() {
    if (!isEnabled()) { unsubscribe?.(); unsubscribe = undefined; return }
    if (unsubscribe !== undefined) return
    const instance = binding
    unsubscribe = instance.events.observeTurnFinished((event) => observe(instance, event).catch(() => {}))
  }

  function bind(instance) {
    unsubscribe?.()
    unsubscribe = undefined
    active?.abort.abort()
    binding = instance
    refreshObserver()
    void recoverNotices(instance).catch(() => {})
    return () => {
      if (binding !== instance) return
      unsubscribe?.()
      unsubscribe = undefined
      binding = undefined
      active?.abort.abort()
    }
  }

  async function settings(args) {
    if (!args || Object.keys(args).length !== 1 || !Object.hasOwn(args, 'model') || !modelSelection(args.model)) throw refusal(CODE.invalidInput, 'model')
    const model = args.model
    const intent = ++settingsIntent
    if (model !== null && (!store.automation || modelPort.available?.() === false || !await modelPort.has(model))) throw refusal(CODE.invalidInput, 'model')
    const { after, result } = await store.change((board, auto) => {
      // An older catalog lookup must not enable the feature after a more recent Off request.
      if (intent !== settingsIntent) throw refusal(CODE.stale)
      return sameModel(auto.model, model) ? { board } : {
        board, auto: { ...pruneAuto(auto, now()), model, generation: auto.generation + 1 }, changed: true,
      }
    })
    if (result.changed) active?.abort.abort()
    refreshObserver()
    return { ok: true, revision: after.revision, model }
  }

  async function view() {
    const models = await Promise.resolve().then(() => modelPort.models?.() ?? []).catch(() => [])
    const { board, auto: snapshot } = store.readAuto()
    const at = now()
    const auto = compactUndoNotes(pruneAuto(snapshot, at), board.revision, at)
    const modelAvailable = auto.model === null || await Promise.resolve().then(() => modelPort.has(auto.model)).catch(() => false)
    const reason = store.canWrite?.() === false ? WHY.storageUnavailable : !currentHost() ? WHY.hostUnavailable : auto.model === null ? WHY.off : !modelAvailable ? WHY.modelUnavailable :
      unresolvedCount(auto) >= AUTO_LIMIT.unresolved || !capacity(auto) ? WHY.capacity : undefined
    const pendingIds = new Set(auto.reviews.filter(pendingReview).map(({ reviewId }) => reviewId))
    return { ok: true, revision: board.revision, model: auto.model, models, available: currentHost() && modelAvailable,
      ...(reason === undefined ? {} : { reason }), retentionDays: AUTO_LIMIT.retentionDays,
      batches: auto.batches.map((batch) => ({ ...batch, undoable: withinRetention(batch, at) && batch.undone === undefined &&
        batch.changes.length > 0 && batch.revision === board.revision && batch.reviewIds.every((id) => pendingIds.has(id)) })),
      reviews: auto.reviews.map(publicReview), diagnostics: { counts: auto.counts, ...(auto.last ? { last: auto.last } : {}), sentLastHour: auto.sent.length },
    }
  }

  async function undo(args) {
    const { after, result } = await store.change((board, auto) => undoBatch(board, auto, args, now()))
    return { ok: true, revision: after.revision, ...result }
  }

  async function archiveNotice(args) {
    const { batchId, expectedBatchVersion } = args ?? {}
    if (!identifier(batchId) || !integer(expectedBatchVersion) || Object.keys(args).length !== 2) throw refusal(CODE.invalidInput)
    const { after } = await store.change((board, auto) => {
      const batch = auto.batches.find((b) => b.batchId === batchId)
      if (batch?.batchVersion !== expectedBatchVersion || batch.notification !== AUTO_NOTICE.unknown || !unknownNotice(batch)) throw refusal(CODE.stale)
      return { board, auto: replaceBatch(auto, { ...noticeResult(batch, batch.notification), archivedAt: now() }) }
    })
    return { ok: true, revision: after.revision, batchId }
  }

  return Object.freeze({ bind, isEnabled, settings, view, undo, archiveNotice })
}
