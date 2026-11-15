/**
 * One Fishball DSH for the WD-ROUTE cases: F-INTERCEPT's world (../f-intercept/world.mjs: real SDK
 * session, agent, storage and the **real** core events module of packages/core/src/events/, with a
 * fake connector link and a fake model) with Watchdog's routing opened over it (subject.mjs).
 *
 * Watchdog's ports are traced, never imitated:
 * - `events`: core's real interception service, with every registration, disposal, handler call
 *   and `ctl` call recorded on one timeline (the "accept first" oracle);
 * - `link`: core's link as Watchdog sees it, recording its own calls; it can go down (answers K1's
 *   `disconnected`) or hold a send in flight;
 * - `notify`: the fake X10 `manager.notify` that records the in-session notices (R-WD-08);
 * - `judge`: the WD-DECIDE stand-in; each call takes the next scripted verdict.
 * Every Fishball-side observation is F-INTERCEPT's public one: durable admissions in the Fishball
 * session log (its wakes) and traces of an event's marker in any context.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { APPROVAL_KIND } from '../../../packages/dsh-connector/contract/contract.js'
import {
  CONTRIBUTED_TYPE_PREFIX, DECISION_KIND_OF, EVENT_TYPE, LINK_REFUSAL, OFFER_ID, RETIREMENT_REASON, SETTLED_BY,
  SETTLEMENT_OUTCOME, TOOL, formatOfferId,
} from '../../../packages/dsh-connector/mcp-schema/index.js'
import { openWorld, removeRoot } from '../f-intercept/world.mjs'
import { DECISION, FIXTURE, WAIT } from './constants.mjs'
import { openRouting } from './subject.mjs'

const ET = EVENT_TYPE
let counter = 0

/** A K1 offer descriptor (mcp-schema shapes.js `descriptor`) for `id`, timer-free. */
function descriptor(type, approvalId, offerId, text) {
  return {
    approvalId, offerId, kind: type === ET.permission || type === ET.ask ? APPROVAL_KIND.approval : APPROVAL_KIND.question,
    prompt: text, choices: [], title: text, at: Date.now(), toolName: FIXTURE.marker, callId: null, reason: text, quotes: [],
  }
}
/** Each K1 payload shape (mcp-schema EVENT_PAYLOAD_SHAPES), filled from the event's own fields. */
const PAYLOAD = Object.freeze({
  [ET.permission]: (f) => descriptor(ET.permission, f.approvalId, f.offerId, f.text),
  [ET.question]: (f) => descriptor(ET.question, f.approvalId, f.offerId, f.text),
  [ET.planReview]: (f) => descriptor(ET.planReview, f.approvalId, f.offerId, f.text),
  [ET.ask]: (f) => descriptor(ET.ask, f.approvalId, f.offerId, f.text),
  [ET.settlement]: (f) => ({ approvalId: f.approvalId, outcome: SETTLEMENT_OUTCOME.allowed, by: SETTLED_BY.user }),
  [ET.retirement]: (f) => ({ retiredEventId: f.retired ?? f.marker, reason: RETIREMENT_REASON.withdrawn }),
  [ET.turnFinished]: (f) => ({ sessionId: f.session, running: f.flags?.running ?? false, queued: f.flags?.queued ?? false }),
  [ET.state]: (f) => ({ sessionId: f.session, running: f.flags?.running ?? true, pendingInteraction: f.flags?.pendingInteraction ?? false }),
  [ET.message]: (f) => ({ text: f.text, images: [] }),
  [ET.handover]: (f) => ({ sessionId: f.session, note: f.text }),
  [ET.takeback]: (f) => ({ sessionId: f.session, note: f.text }),
  [ET.notice]: (f) => ({ code: FIXTURE.marker.toLowerCase(), text: f.text }),
})
export const contributedType = () => `${CONTRIBUTED_TYPE_PREFIX}${FIXTURE.namespace}.${FIXTURE.contributedEvent}`

/**
 * One K1 mailbox event of `type` in `session`, with a marker in its id and text. `of` makes a
 * `settlement` or `retirement` end that earlier offer event (same correlation id, design §6.4
 * `watchdog.handled(e.correlationId)`; same approval id; `retiredEventId`).
 */
export function wdEvent(type, { session = FIXTURE.s1, of, flags } = {}) {
  const n = ++counter
  const marker = FIXTURE.marker + n
  const text = `${marker} ${type}`
  const own = `fbtestwd${process.pid}x${n}`
  const answerable = DECISION_KIND_OF[type] !== undefined
  const approvalId = of?.approvalId ?? own
  const offerId = answerable ? formatOfferId(own, OFFER_ID.firstRevision) : undefined
  const fields = { session, text, marker, approvalId, offerId, retired: of?.eventId, flags }
  const payload = type.startsWith(CONTRIBUTED_TYPE_PREFIX)
    ? { namespace: FIXTURE.namespace, event: FIXTURE.contributedEvent, data: { text }, summary: text }
    : PAYLOAD[type](fields)
  const event = {
    eventId: marker, mailboxGeneration: FIXTURE.generation, sequence: n, type, at: Date.now(),
    sourceSessionId: session, correlationId: offerId ?? of?.correlationId ?? null, payload,
    payloadDigest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  }
  if (answerable) event.offer = { offerId, revision: OFFER_ID.firstRevision, decisionKind: DECISION_KIND_OF[type] }
  return { ...event, marker, approvalId }
}

/** A promise with its resolvers, for a held judgement or a held send. */
export const deferred = () => Promise.withResolvers()

/** One ordered record of everything Watchdog's ports saw: `{eventId, step, ...}`. */
function newTrace() {
  const steps = []
  return {
    steps,
    registrations: [],
    log: (eventId, step, extra = {}) => steps.push({ eventId, step, ...extra }),
    of: (eventId) => steps.filter((s) => s.eventId === eventId),
  }
}

/** The step names the trace records (one per port effect). */
export const STEP = Object.freeze({
  offered: 'offered', acceptCalled: 'accept-called', accepted: 'accepted', commit: 'commit', send: 'send',
  release: 'release', judge: 'judge', link: 'link', notify: 'notify',
})

/** `ctl` as Watchdog gets it: core's own controller, each call recorded. */
function tracedCtl(event, ctl, trace) {
  return {
    async accept() {
      trace.log(event.eventId, STEP.acceptCalled)
      const ok = await ctl.accept()
      trace.log(event.eventId, STEP.accepted, { ok })
      return ok
    },
    commit(send) {
      trace.log(event.eventId, STEP.commit)
      return ctl.commit(() => { trace.log(event.eventId, STEP.send); return send() })
    },
    release(e, options) {
      trace.log(event.eventId, STEP.release, { options })
      return ctl.release(e, options)
    },
  }
}

/**
 * Core's interception service as Watchdog's `events` port; `refuse` makes `intercept` throw (a
 * registration failure). Every handler run is kept in `inFlight` until it settles, so teardown can
 * wait for them (see wdWorld).
 */
function eventsPort(core, trace, gate, inFlight) {
  return {
    intercept(registration, handler) {
      if (gate.refuse) throw new Error(FIXTURE.registrationFault)
      const record = { registration, disposed: false, seen: [] }
      trace.registrations.push(record)
      const dispose = core.intercept(registration, (event, ctl) => {
        record.seen.push(event.eventId)
        trace.log(event.eventId, STEP.offered, { types: registration.types })
        const run = handler(event, tracedCtl(event, ctl, trace))
        const settled = Promise.resolve(run).catch(() => {}).finally(() => inFlight.delete(settled))
        inFlight.add(settled)
        return run
      })
      return () => { record.disposed = true; dispose() }
    },
  }
}

/** Core's link as Watchdog's `link` port: its own calls recorded; `down` answers `disconnected`; `gate` holds a send. */
class WatchdogLink {
  constructor(base, trace) {
    this.base = base
    this.trace = trace
    this.calls = []
    this.listeners = 0
    this.down = false
    this.gate = null
  }
  async callTool(name, args = {}) {
    this.calls.push({ name, args })
    this.trace.log(this.eventOf(args), STEP.link, { name })
    if (this.down) return { ok: false, code: LINK_REFUSAL.disconnected }
    if (this.gate) await this.gate
    return this.base.callTool(name, args)
  }
  onResourceUpdated(listener) {
    this.listeners += 1
    return this.base.onResourceUpdated(listener)
  }
  /** The event an answer is for, by its offer id (the trace is per event). */
  eventOf(args) { return this.offers.get(args?.offerId) ?? null }
  offers = new Map()
}

/** The default verdict: allow, low risk (WD-DT-01 rule 1). */
export const ALLOW = Object.freeze({ answer: Object.freeze({ decision: DECISION.allow, reason: FIXTURE.reason }) })
export const ESCALATE = Object.freeze({ answer: Object.freeze({ decision: DECISION.escalate, reason: FIXTURE.reason }) })
export const TO_FISHBALL = Object.freeze({ toFishball: Object.freeze({ reasoning: FIXTURE.reasoning }) })

/**
 * A Fishball DSH with Watchdog's routing opened (not yet `ready()`), cleaned up by `t`.
 * `verdicts` is the judge's script: each judgement takes the next one (a value, a promise, or a
 * function of the event); with none left it answers ALLOW.
 */
export async function wdWorld(t, sdk, { ready = true } = {}) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), FIXTURE.tempPrefix))
  let world
  let routing
  const closers = []
  const inFlight = new Set()
  /**
   * Teardown must not close core's ledger domain under a handler core is still finishing: core
   * records an event's outcome after its handler settles (and a disposal sends in-flight events to
   * Fishball), so a close before that tail rejects with "domain is closed". Each step therefore waits
   * for every handler run to settle and then for the world's own settle signal (no change at the
   * link, the model or the log, every agent idle) before the next step closes anything.
   */
  const drain = async () => {
    while (inFlight.size > 0) await Promise.allSettled([...inFlight])
    await world?.settle()
  }
  t.after(async () => {
    for (const close of closers.reverse()) await close().catch(() => {})
    await drain()
    await routing?.dispose()
    await drain()
    await world?.close()
    // Guard the one recursive delete: only the directory this helper made under the OS temp dir.
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith(FIXTURE.tempPrefix)) await removeRoot(root)
  })
  world = await openWorld(sdk, root)
  const trace = newTrace()
  const gate = { refuse: false }
  const link = new WatchdogLink(world.link, trace)
  const notices = []
  const verdicts = []
  const ports = {
    events: eventsPort(world.core, trace, gate, inFlight),
    link,
    async notify(notice) {
      trace.log(null, STEP.notify, { wake: notice?.wake })
      notices.push(notice)
      return { queued: true }
    },
    judge(event) {
      trace.log(event.eventId, STEP.judge)
      const next = verdicts.shift() ?? ALLOW
      return Promise.resolve(typeof next === 'function' ? next(event) : next)
    },
    logger: world.ctx.logger(FIXTURE.logger),
  }
  const open = async () => {
    routing = await openRouting(sdk, ports)
    if (ready) await routing.ready()
    return routing
  }
  await open()

  return {
    world, trace, link, notices, verdicts, gate, ports,
    get routing() { return routing },
    /** A restart of the Watchdog plugin (WD-ST-01 row 5): the old routing disposed, a new one opened and ready. */
    async restart() { await routing.dispose(); routing = undefined; return open() },
    /** Publish `event` at the connector and wait until the Fishball DSH has settled. */
    async publish(event) {
      if (event.offer) link.offers.set(event.offer.offerId, event.eventId)
      world.link.publish(event)
      await world.settle()
      return event
    },
    settle: () => world.settle(),
    /** Fishball's wakes for `event` (F-INTERCEPT's oracle: durable admissions carrying its marker). */
    wakes: async (event) => (await world.admissions(event.marker)).length,
    /** Whether any Watchdog registration's handler was handed `event`. */
    handled: (event) => trace.registrations.some((r) => r.seen.includes(event.eventId)),
    /** Answers Watchdog's link sent for `event` that reached the connector. */
    answers: (event) => world.link.answers().filter((a) => a.name === TOOL.approvalAnswer && a.args?.offerId === event.offer?.offerId),
    /** The "watchdog is down" notices so far. */
    downNotices: (pattern) => notices.filter((n) => pattern.test(String(n?.text ?? ''))),
    closeLater: (fn) => closers.push(fn),
  }
}

/** Waits until `predicate()` holds (harness wait only); false on timeout. */
export async function waitFor(predicate, ms = WAIT.eventMs) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, WAIT.pollMs))
  }
  return false
}
