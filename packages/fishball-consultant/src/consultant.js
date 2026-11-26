import { randomUUID } from 'node:crypto'
import { C, DECISION, INSTRUCTION, LIMIT, PROTOCOL, S, SUBJECT, cleanupPending, missingGuarantee, refuse } from './constants.js'
import { askInput, checkCatalog, closeInput, destinationOf, id, isSubject, matches, policyOf, positive, refOf, sameDestination, sameRef, sameSubject, text } from './shapes.js'
import { briefOf, counts, digestOf, forSubject, isActive, isInFlight, noticeFor, presentResult, resultOf, utcDayOf } from './brief.js'

const ok = (status, extra) => ({ ok: true, status, ...extra })
const unconfirmed = (requestId) => ({ ok: false, status: S.unconfirmed, requestId })
const isReceipt = (answer) => answer?.event === PROTOCOL.receipt
const provesNoDelivery = (answer, request) => isReceipt(answer) && answer.status === S.notDelivered
  && answer.requestId === request.requestId && matches(answer, request.destination, PROTOCOL.identityKeys)
const bindingOf = (state, subject) => state.bindings.find((row) => sameSubject(row.subject, subject))
const requestOf = (state, requestId) => state.requests.find((row) => row.requestId === requestId)
const keyOf = (subject) => subject.kind + ':' + subject.id
const projected = (row, state) => {
  const { subject, title, status, destination, closeReason } = row
  return { subject, title, status: status === S.open && closeReason ? S.closeRequested : status, destination, sessionId: row.ref?.sessionId, ...counts(forSubject(state, subject)) }
}
const lookupRef = ({ requestId, destination, ref, previous }) => ref ?? {
  requestId, ...Object.fromEntries(PROTOCOL.identityKeys.map((key) => [key, destination[key]])), ...previous,
}

export function createConsultant({ ledger, getConfig, discover, capability, disclosure, notify, now = Date.now, ownerId = 'profile-owner' }) {
  const config = () => policyOf(getConfig())
  const pendingCards = new Map(), dispatching = new Set(), reconciling = new Set(), inHandOff = new Map()
  let stopped = false

  async function prove(destination) {
    try {
      const proof = await capability?.(structuredClone(destination))
      if (proof?.version === PROTOCOL.version && PROTOCOL.guarantees.every((key) => proof.guarantees?.[key] === true)
        && ['send', 'status', 'close'].every((key) => typeof proof[key] === 'function')) return proof
    } catch { /* Unverifiable is the same as absent. */ }
  }

  function policy() {
    const current = config()
    if (current.paused || stopped) return refuse(C.disabled)
    if (![current.asksPerSubject, current.asksPerDay].every(positive) || current.paused !== false) return refuse(C.policy)
    return destinationOf(current, ownerId)
  }

  async function preflight(expected) {
    const selected = policy()
    if (!selected.destination) return selected
    const { destination } = selected
    if (expected && !sameDestination(expected, destination)) return refuse(C.binding)
    try {
      const unavailable = checkCatalog(await discover?.(structuredClone(destination)), destination)
      if (unavailable) return unavailable
    } catch { return refuse(C.unavailable) }
    const proof = await prove(destination)
    return proof ? { destination, proof } : missingGuarantee()
  }

  function budget(state, subject, utcDay) {
    const { asksPerDay, asksPerSubject } = config()
    const scopes = [
      ['subject', asksPerSubject, forSubject(state, subject)],
      ['profile', asksPerDay, state.requests.filter(({ day }) => day === utcDay)],
    ]
    for (const [scope, limit, requests] of scopes) {
      const { used, reserved } = counts(requests)
      if (used + reserved >= limit) return refuse(C.budget, { scope, limit, used, reserved, utcDay })
    }
  }

  function checkThread(state, subject) {
    const thread = bindingOf(state, subject)
    if (!thread) return refuse(C.unknown)
    if (thread.status !== S.open) return refuse(C.closed)
    if (subject.kind !== SUBJECT.topic) return refuse(C.unknown)
    return { thread }
  }

  async function ask(input) {
    if (!askInput(input)) return refuse(C.input)
    input = structuredClone(input)
    const { subject } = input
    const initial = policy()
    if (!initial.destination) return initial
    const preliminary = checkThread(ledger.read(), subject)
    if (!preliminary.thread) return preliminary
    const pre = await preflight(preliminary.thread.destination)
    if (!pre.proof) return pre
    if (typeof disclosure?.open !== 'function') return refuse(C.policy)
    const created = await ledger.transact((state) => {
      const checked = checkThread(state, subject)
      if (!checked.thread) return checked
      const current = policy()
      if (!current.destination) return current
      const { destination } = pre, { thread } = checked
      if (!sameDestination(current.destination, destination) || (thread.destination && !sameDestination(thread.destination, destination))) return refuse(C.binding)
      const requests = forSubject(state, subject)
      if (requests.some(isActive)) return refuse(C.busy)
      const blocked = budget(state, subject, utcDayOf(now()))
      if (blocked) return blocked
      const brief = briefOf(input, requests)
      if (!brief) return refuse(C.policy)
      const previous = thread.ref && { bindingId: thread.ref.bindingId, sessionId: thread.ref.sessionId }
      const request = { subject, requestId: randomUUID(), destination, brief, previous, status: S.awaiting, createdAt: now() }
      request.digest = digestOf(request)
      state.requests.push(request)
      return { request }
    })
    if (!created.request) return created
    const { requestId, destination, brief, digest } = created.request
    const answer = (input) => decide(requestId, input)
    try {
      const card = await disclosure.open({ requestId, destination, brief, digest, instruction: INSTRUCTION }, answer)
      if (!id(card?.cardId)) throw new Error('Disclosure card was not issued.')
      const attached = await ledger.transact((state) => {
        const request = requestOf(state, requestId)
        if (stopped || request.status !== S.awaiting) return false
        request.cardId = card.cardId
        return true
      })
      if (attached) { pendingCards.set(requestId, card.cardId); return ok(S.awaiting, { requestId }) }
      disclosure.cancel?.(card.cardId)
    } catch { /* Neither an ordinary card nor a failed render can authorize a send. */ }
    await expire(requestId)
    return refuse(C.policy)
  }

  function expire(requestId, why = S.refused) {
    return ledger.transact((state) => {
      const request = requestOf(state, requestId)
      if (request?.status === S.awaiting) request.status = why
    })
  }

  async function decide(requestId, decision) {
    const { ownerId: actualOwner, cardId, decision: choice } = decision ?? {}
    if (actualOwner !== ownerId || !id(cardId) || pendingCards.get(requestId) !== cardId) return refuse(C.policy)
    if (!Object.values(DECISION).includes(choice)) return refuse(C.policy)
    // Synchronously claim the local card once. A restart expires any unconsumed card; it never sends.
    pendingCards.delete(requestId)
    if (choice !== DECISION.allow) { await expire(requestId, S.declined); return ok(S.declined, { requestId }) }
    const waiting = requestOf(ledger.read(), requestId)
    if (waiting?.status !== S.awaiting || waiting.cardId !== cardId) return refuse(C.policy)
    const pre = await preflight(waiting.destination)
    if (!pre.proof) { await expire(requestId); return pre }
    dispatching.add(requestId)
    try {
      const reserved = await ledger.transact((state) => {
        const request = requestOf(state, requestId)
        const checked = checkThread(state, request.subject)
        if (!checked.thread) return checked
        const current = policy()
        if (!current.destination) return current
        if (!sameDestination(current.destination, request.destination) || !sameDestination(pre.destination, request.destination)) return refuse(C.binding)
        if (request.status !== S.awaiting || request.cardId !== cardId || request.digest !== digestOf(request)) return refuse(C.policy)
        const day = utcDayOf(now()), limit = budget(state, request.subject, day)
        if (limit) return limit
        request.day = day
        request.status = S.sending
        return { request }
      })
      if (!reserved.request) { await expire(requestId); return reserved }
      const current = policy()
      if (!current.destination || !sameDestination(current.destination, waiting.destination)
        || bindingOf(ledger.read(), waiting.subject)?.status !== S.open) {
        // The protected send invocation has not happened; only this local branch may release without a receipt.
        await ledger.transact((state) => { requestOf(state, requestId).status = S.notDelivered })
        return current.destination ? refuse(C.binding) : current
      }
      const { destination, brief, digest, previous } = reserved.request
      // Only the dedicated protected port can receive this envelope. That port must compare its
      // actual provider bytes against the approved envelope and re-check its own policy at send.
      let reply
      try { reply = await pre.proof.send({ requestId, destination, brief, digest, instruction: INSTRUCTION, ...(previous && { previous, ...previous }) }) }
      catch { /* Ambiguous delivery keeps the original reservation; never retry. */ }
      return await setDelivery(requestId, reply)
    } finally { dispatching.delete(requestId) }
  }

  function setDelivery(requestId, answer) {
    return ledger.transact((state) => {
      const request = requestOf(state, requestId)
      if (!request || request.status !== S.sending) return unconfirmed(requestId)
      if (provesNoDelivery(answer, request)) { request.status = S.notDelivered; return refuse(C.unavailable, { requestId }) }
      const thread = bindingOf(state, request.subject)
      const ref = isReceipt(answer) && answer.status === S.accepted && refOf(answer.ref, request, thread.ref)
      if (ref) {
        thread.destination = request.destination
        thread.ref = request.ref = ref
        request.status = S.accepted
        return ok(S.accepted, { requestId })
      }
      request.status = S.unconfirmed
      return unconfirmed(requestId)
    })
  }

  async function deliver(requestId) {
    const notice = async () => {
      const snapshot = ledger.read(), request = requestOf(snapshot, requestId)
      const item = snapshot.outbox.find((entry) => entry.requestId === requestId)
      if (stopped || !item || bindingOf(snapshot, request.subject)?.status !== S.open || typeof notify !== 'function') return
      let receipt
      try { receipt = await notify(item.notice) } catch { return }
      if (['queued', 'held', 'duplicate'].includes(receipt?.status)) await ledger.transact((state) => {
        state.outbox = state.outbox.filter((entry) => entry.requestId !== requestId)
      })
    }
    const existing = inHandOff.get(requestId)
    if (existing) return existing
    const task = Promise.resolve().then(notice)
    inHandOff.set(requestId, task)
    try { await task } finally { inHandOff.delete(requestId) }
  }

  async function resolveReceipt(request, proof) {
    if (dispatching.has(request.requestId)) return unconfirmed(request.requestId)
    let receipt
    try { receipt = await proof.status(lookupRef(request)) } catch { return unconfirmed(request.requestId) }
    const result = resultOf(receipt)
    const resolved = await ledger.transact((state) => {
      const current = requestOf(state, request.requestId), thread = bindingOf(state, request.subject)
      if (!isInFlight(current)) return ok(current.status, { requestId: current.requestId })
      if (current.status !== S.accepted && provesNoDelivery(receipt, current)) {
        current.status = S.notDelivered
        return ok(S.notDelivered, { requestId: current.requestId })
      }
      if (!isReceipt(receipt) || (!result && receipt.status !== S.accepted)) return unconfirmed(current.requestId)
      const ref = refOf(receipt, current, thread.ref)
      if (!ref || (current.ref && !sameRef(ref, current.ref))) return unconfirmed(current.requestId)
      thread.destination = current.destination
      thread.ref = current.ref = ref
      current.status = result?.status ?? S.accepted
      if (result) {
        current.result = result
        if (thread.status === S.open) state.outbox.push({ requestId: current.requestId, notice: noticeFor(current, result, ref) })
      }
      return ok(current.status, { requestId: current.requestId })
    })
    await deliver(request.requestId)
    return resolved
  }

  async function archive(subject) {
    const state = ledger.read(), thread = bindingOf(state, subject), requests = forSubject(state, subject)
    const active = requests.find(isInFlight)
    if (!thread || thread.status !== S.cleanup) return cleanupPending()
    // Core may still be activating before the notice reaches its inbox; do not promise
    // archival until any already-started handoff settles. Discard prevents new handoffs.
    if (requests.some(({ requestId }) => inHandOff.has(requestId)) || (active && dispatching.has(active.requestId))) return cleanupPending()
    const destination = active?.destination ?? thread.destination
    if (destination && destination.ownerId !== ownerId) return cleanupPending()
    if (active || thread.ref) {
      const proof = await prove(destination)
      if (!proof || stopped) return cleanupPending()
      const ref = active ? lookupRef(active) : thread.ref
      let receipt
      try { receipt = await proof.close(ref) } catch { return cleanupPending() }
      const full = active ? refOf(receipt, active, thread.ref) : ref
      if (!isReceipt(receipt) || receipt.status !== S.archived || !full || !sameRef(full, receipt) || (active?.ref && !sameRef(active.ref, receipt))) return cleanupPending()
    }
    return ledger.transact((draft) => {
      bindingOf(draft, subject).status = S.archived
      for (const request of forSubject(draft, subject).filter(isInFlight)) request.status = S.stopped
      return ok(S.closed)
    })
  }

  async function reconcile(subject) {
    if (!isSubject(subject)) return refuse(C.input)
    const key = keyOf(subject)
    if (reconciling.has(key)) return bindingOf(ledger.read(), subject)?.status === S.cleanup ? cleanupPending() : refuse(C.busy)
    reconciling.add(key)
    try {
      const state = ledger.read(), thread = bindingOf(state, subject)
      if (!thread) return refuse(C.unknown)
      if (thread.status === S.cleanup) return await archive(subject)
      if (thread.status === S.archived || stopped) return refuse(C.closed)
      const requests = forSubject(state, subject)
      const active = requests.find(isInFlight)
      if (active) {
        if (active.destination.ownerId !== ownerId) return refuse(C.owner)
        const proof = await prove(active.destination)
        if (!proof || stopped) return missingGuarantee()
        return await resolveReceipt(active, proof)
      }
      for (const { requestId } of requests) await deliver(requestId)
      return ok(S.open)
    } finally { reconciling.delete(key) }
  }

  return Object.freeze({
    ask,
    async close(input) {
      if (!closeInput(input)) return refuse(C.input)
      const { subject, reason } = structuredClone(input)
      return ledger.transact((state) => {
        const thread = bindingOf(state, subject)
        if (!thread) return refuse(C.unknown)
        if (thread.status !== S.open) return refuse(C.closed)
        thread.closeReason = reason
        return ok(S.closeRequested)
      })
    },
    createTopic(title) {
      if (!text(title, LIMIT.titleBytes)) return refuse(C.input)
      return ledger.transact((state) => {
        const subject = { kind: SUBJECT.topic, id: randomUUID() }
        state.bindings.push({ subject, title, status: S.open, createdAt: now() })
        return { ok: true, subject }
      })
    },
    async discard(subject) {
      if (!isSubject(subject)) return refuse(C.input)
      subject = structuredClone(subject)
      const outcome = await ledger.transact((state) => {
        const thread = bindingOf(state, subject)
        if (!thread) return refuse(C.unknown)
        if (thread.status === S.archived) return ok(S.closed)
        thread.status = S.cleanup
        const requests = forSubject(state, subject)
        for (const request of requests.filter(({ status }) => status === S.awaiting)) request.status = S.declined
        state.outbox = state.outbox.filter((entry) => !requests.some(({ requestId }) => requestId === entry.requestId))
        return { requests: requests.map(({ cardId, requestId }) => ({ cardId, requestId })) }
      })
      if (!outcome.requests) return outcome
      for (const { requestId, cardId } of outcome.requests) {
        if (pendingCards.delete(requestId)) disclosure.cancel?.(cardId)
      }
      return await reconcile(subject)
    },
    reconcile,
    async recover() {
      await ledger.transact((state) => {
        for (const request of state.requests) {
          if (request.status === S.awaiting) request.status = S.refused
          if (request.status === S.sending) request.status = S.unconfirmed
        }
      })
    },
    async drainNotices() {
      for (const { requestId } of ledger.read().outbox) await deliver(requestId)
    },
    stop() { stopped = true; pendingCards.clear() },
    list() { const state = ledger.read(); return state.bindings.map((row) => projected(row, state)) },
    detail(subject) {
      if (!isSubject(subject)) return refuse(C.input)
      const state = ledger.read(), thread = bindingOf(state, subject)
      if (!thread) return refuse(C.unknown)
      return { thread: projected(thread, state), requests: forSubject(state, subject).map((row) => {
        const { requestId, destination, brief, status, result, createdAt, cardId, digest, ref } = row
        const awaiting = status === S.awaiting && pendingCards.get(requestId) === cardId && !!cardId
        return { requestId, destination, brief: awaiting ? brief : { ...brief, history: [] }, status: status === S.sending ? S.unconfirmed : status,
          result: presentResult(result), createdAt, sessionId: ref?.sessionId, ...(awaiting && { cardId, digest, instruction: INSTRUCTION }) }
      }) }
    },
    budgets() {
      const utcDay = utcDayOf(now()), { asksPerDay, asksPerSubject } = config()
      return { utcDay, asksPerDay, asksPerSubject, ...counts(ledger.read().requests.filter(({ day }) => day === utcDay)) }
    },
    async status() { const { proof, destination, ...status } = await preflight(); return proof ? undefined : status },
  })
}
