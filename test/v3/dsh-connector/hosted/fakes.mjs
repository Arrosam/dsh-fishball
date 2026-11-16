/**
 * The C-SUCCEED world's seam and fakes. Nothing here reads the hosted, routing, mailbox, pairs or
 * tokens code: the seam wraps the public storage-domain handles every module opens through
 * `ctx.storageDomain` and the ports the cases inject.
 *
 * - `Seam`: a journal of every storage write (`put`, `delete`, `update`, `deleteMany` on any table of
 *   any domain) and every write-like port call (mailbox, SettingsWriter, SessionNotes), in order.
 *   Drivers: `mark()` starts numbering steps afresh (each step gets `descriptor` and the `ordinal` of
 *   that descriptor since the mark, so two worlds built the same way name the same step the same
 *   way); `failNext(match)` makes the first matching step reject (and disarms); `failEvery(match)`
 *   makes every matching step reject until its `stop()`; `holdNext(match)` pauses the first matching
 *   step until `open(fail)` (`fail` true: it then rejects instead of running); `observers` run before
 *   and after each step, so a
 *   case samples the state "between steps". A failed step never reaches the real handle: DSH's
 *   domain stays healthy, as after a write the backend refused. The staged transfer's handle
 *   (C-MAILBOX `stage`) journals its `commit` and `undo` as the mailbox port's `stage.commit` /
 *   `stage.undo` calls; `confirm()` is synchronous and passes through.
 * - `FakeWriter` (K1d SettingsWriter over the world's settings document, as the C-TOKENS world's):
 *   calls run in call order; `addToken` / `removeToken` write the document and resolve after the
 *   registry's sync of it (rejecting when that sync refuses it); `setDesignated` sets the live
 *   `routing.agentToken`.
 * - `FakeNotes` (K1d SessionNotes): records every `system(sessionId, note)` attempt in `calls`, and
 *   in `stored` only the ones the seam let through (a note that was written).
 * - `FakeTimers`: `{setTimeout, clearTimeout}` that never fire on their own; `runAll()` fires what is due.
 */
import { CALL, FIXTURE, PORT, STEP } from './constants.mjs'

/** Table members that write (DSH storage-domain KvTable). */
const TABLE_WRITES = Object.freeze(['put', 'delete', 'update', 'deleteMany'])
/** Mailbox port members that write; reads (`poll`, `summary`) are not steps. */
const MAILBOX_WRITES = Object.freeze([CALL.commit, CALL.retire, CALL.transfer, CALL.stage, CALL.ack, 'hold', 'release', 'drop', 'retireContributor'])

const injected = () => Object.assign(new Error(FIXTURE.injected), { injected: true })

export class Seam {
  /** Every step, in order: `{index, kind, descriptor, ordinal, …info}`. */
  journal = []
  /** Called (no argument) before and after every step; a throwing observer is recorded in `observerErrors`. */
  observers = new Set()
  observerErrors = []
  #ordinals = new Map()
  #fail = null
  #failing = new Set()
  #holds = []

  /** Starts numbering afresh; returns the journal index the next step gets. */
  mark() {
    this.#ordinals.clear()
    return this.journal.length
  }
  /** The steps since `from` (a `mark()` result). */
  since(from) { return this.journal.slice(from) }
  /** The first step after this call that `match`es rejects with an injected failure; then disarmed. */
  failNext(match) { this.#fail = match }
  /** Whether an armed failure has not fired yet. */
  get failArmed() { return this.#fail !== null }
  /** Every step that `match`es rejects with an injected failure until `stop()`; returns `{stop, count}` (`count()`: how many failed). */
  failEvery(match) {
    const entry = { match, failed: 0 }
    this.#failing.add(entry)
    return { stop: () => { this.#failing.delete(entry) }, count: () => entry.failed }
  }
  /**
   * The first step that `match`es waits until `open(fail)`; `reached` resolves with it once it
   * waits. `open(true)` makes that step reject with an injected failure instead of running.
   */
  holdNext(match) {
    let arrive
    let open
    const hold = { match, reached: new Promise((r) => { arrive = r }), opened: new Promise((r) => { open = r }) }
    hold.arrive = arrive
    this.#holds.push(hold)
    return { reached: hold.reached, open: (fail = false) => { const at = this.#holds.indexOf(hold); if (at >= 0) this.#holds.splice(at, 1); open(fail) } }
  }
  observe() {
    for (const fn of [...this.observers]) {
      try { fn() } catch (error) { this.observerErrors.push(error) }
    }
  }

  /** Records one step and runs `run` (synchronously when nothing holds it, so write order is unchanged). */
  step(kind, info, run) {
    const descriptor = kind === STEP.write ? `${STEP.write} ${info.domain}/${info.table}.${info.op}` : `${STEP.call} ${info.port}.${info.member}`
    const ordinal = (this.#ordinals.get(descriptor) ?? 0) + 1
    this.#ordinals.set(descriptor, ordinal)
    const step = Object.freeze({ index: this.journal.length, kind, descriptor, ordinal, ...info })
    this.journal.push(step)
    this.observe()
    // Every failEvery matcher sees every step: a stateful one (afterCommit) must also see the steps
    // failNext or another matcher fails.
    const every = [...this.#failing].filter((entry) => entry.match(step))
    if (this.#fail !== null && this.#fail(step)) {
      this.#fail = null
      return Promise.reject(injected())
    }
    if (every.length > 0) {
      for (const entry of every) entry.failed += 1
      return Promise.reject(injected())
    }
    const after = (value) => { this.observe(); return value }
    const at = this.#holds.findIndex((h) => h.match(step))
    if (at >= 0) {
      const [hold] = this.#holds.splice(at, 1)
      hold.arrive(step)
      return hold.opened.then((fail) => (fail ? Promise.reject(injected()) : run())).then(after)
    }
    return Promise.resolve(run()).then(after)
  }
}

/** A step matcher: the step named `ref` (same descriptor, same ordinal since the mark). */
export const sameStep = (ref) => (s) => s.descriptor === ref.descriptor && s.ordinal === ref.ordinal
/** A step matcher: a call of `port.member`. */
export const callStep = (port, member) => (s) => s.kind === STEP.call && s.port === port && s.member === member
/** A step matcher: a storage write to `domain`. */
export const writeStep = (domain) => (s) => s.kind === STEP.write && s.domain === domain
/**
 * A stateful matcher that matches `match` only after the succession's commit point: the first write
 * to `commitDomain` (PairStore.succeed's one registry write, R-NAME-07).
 */
export function afterCommit(commitDomain, match) {
  let committed = false
  return (s) => {
    if (!committed && writeStep(commitDomain)(s)) { committed = true; return false }
    return committed && match(s)
  }
}

/** Returns `target` with `get(name)`'s write members routed through `wrap(name, op, call)`; every other member passes through. */
function writesThrough(target, ops, wrap) {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj)
      if (typeof value !== 'function') return value
      if (ops.includes(prop)) return (...args) => wrap(prop, () => value.apply(obj, args), args)
      return value.bind(obj)
    },
  })
}

/**
 * Wraps the DSH domain facility on `ctx` so that every domain any module opens afterwards journals
 * its table writes in `seam`. Table handles are wrapped once per domain and name, so a module that
 * keeps its handle keeps one wrapper.
 */
export function seamStorage(ctx, seam) {
  const facility = ctx.storageDomain
  const open = facility.open.bind(facility)
  facility.open = async (spec) => {
    const domain = await open(spec)
    const tables = new Map()
    const table = (name) => {
      if (!tables.has(name)) {
        tables.set(name, writesThrough(domain.table(name), TABLE_WRITES, (op, run, args) => seam.step(STEP.write, { domain: domain.name, table: name, op, key: args[0] }, run)))
      }
      return tables.get(name)
    }
    let global
    return new Proxy(domain, {
      get(obj, prop) {
        if (prop === 'table') return table
        // `global` throws on a spec that declares none, so it is wrapped only when a module reads it.
        if (prop === 'global') {
          global ??= writesThrough(obj.global, ['set'], (op, run) => seam.step(STEP.write, { domain: domain.name, table: prop, op }, run))
          return global
        }
        const value = Reflect.get(obj, prop, obj)
        return typeof value === 'function' ? value.bind(obj) : value
      },
    })
  }
}

/**
 * The mailbox port routing is given: `base` (routing fakes' mailboxPort over the real mailbox) with
 * its write members journaled, and the handle `stage` resolves journaled too (see the file comment).
 */
export function seamMailbox(base, seam) {
  const journaled = (member, run, args) => seam.step(STEP.call, { port: PORT.mailbox, member, args }, run)
  return writesThrough(base, MAILBOX_WRITES, (member, run, args) => {
    const done = journaled(member, run, args)
    return member === CALL.stage ? done.then((staged) => stagedThrough(staged, journaled)) : done
  })
}
/** The staged-transfer handle (phase 3 surface: movedIds, commit, confirm, undo) with its two asynchronous writes journaled. */
const stagedThrough = (staged, journaled) => Object.freeze({
  movedIds: staged.movedIds,
  commit: (draft) => journaled(CALL.stagedCommit, () => staged.commit(draft), [draft]),
  confirm: () => staged.confirm(),
  undo: (sourceSessions) => journaled(CALL.stagedUndo, () => staged.undo(sourceSessions), [sourceSessions]),
})

/** K1d SettingsWriter over the world's document (see the file comment). */
export class FakeWriter {
  /** Every call, in order: `{op, item?, entryKey?}`. */
  calls = []
  #chain = Promise.resolve()
  /**
   * @param seam   the world's seam (every call is a step)
   * @param world  `{doc, settings, apply(list)}`: the document, the live settings, the registry's sync
   */
  constructor(seam, world) {
    this.seam = seam
    this.world = world
  }
  #serial(member, args, run) {
    this.calls.push({ op: member, ...args })
    const next = this.#chain.then(() => this.seam.step(STEP.call, { port: PORT.writer, member, args }, run))
    this.#chain = next.catch(() => {})
    return next
  }
  /** K1d: a save that fails or that the sync refuses leaves the document holding the previous list. */
  async #save(list) {
    const previous = this.world.doc.tokens
    this.world.doc.tokens = list
    let result
    try {
      result = await this.world.apply(list)
    } catch (error) {
      this.world.doc.tokens = previous
      throw error
    }
    if (result?.ok !== true) {
      this.world.doc.tokens = previous
      throw Object.assign(new Error(FIXTURE.refusedSave), { code: result?.code })
    }
  }
  addToken(item) { return this.#serial(CALL.addToken, { item }, () => this.#save([...this.world.doc.tokens, item])) }
  removeToken(entryKey) { return this.#serial(CALL.removeToken, { entryKey }, () => this.#save(this.world.doc.tokens.filter((i) => i.key !== entryKey))) }
  setDesignated(entryKey) { return this.#serial(CALL.setDesignated, { entryKey }, async () => { this.world.settings.set({ agentToken: entryKey }) }) }
  /** The calls of `op`. */
  of(op) { return this.calls.filter((c) => c.op === op) }
}

/** K1d SessionNotes. */
export class FakeNotes {
  /** Every attempt, written or not. */
  calls = []
  /** The notes written (the seam let the call through). */
  stored = []
  constructor(seam) { this.seam = seam }
  system(sessionId, note) {
    this.calls.push({ sessionId, note })
    return this.seam.step(STEP.call, { port: PORT.notes, member: CALL.system, args: { sessionId } }, async () => { this.stored.push({ sessionId, note }) })
  }
  /** The notes written to `sessionId`. */
  of(sessionId) { return this.stored.filter((c) => c.sessionId === sessionId).map((c) => c.note) }
  /** The attempts for `sessionId`. */
  attemptsOf(sessionId) { return this.calls.filter((c) => c.sessionId === sessionId).length }
}

/** `{setTimeout, clearTimeout}` that fire only on `runAll()`. Detached members work (they are arrow fields). */
export class FakeTimers {
  /** Every delay ever asked for, in order. */
  scheduled = []
  #pending = new Map()
  #next = 1
  setTimeout = (fn, ms) => {
    const id = this.#next++
    this.#pending.set(id, fn)
    this.scheduled.push(ms)
    return id
  }
  clearTimeout = (id) => { this.#pending.delete(id) }
  get pending() { return this.#pending.size }
  /** Fires every timer pending now (not ones they set) and waits for each. */
  async runAll() {
    const due = [...this.#pending.values()]
    this.#pending.clear()
    for (const fn of due) await fn()
  }
}
