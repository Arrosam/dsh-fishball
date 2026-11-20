/**
 * The one place that binds the R-FIX-FUI F1 rows to the code under test.
 *
 * - `viewModule(sdk)`: fishball-ui `src/pairing/index.js` (`pairingView`) and `text.js`
 *   (`PAIRING_TEXT`, the specified copy), bound to the SDK.
 * - `expectedView(...)`: the requirement's view model written out from the copy, the oracle.
 * - `rowWorld(t, sdk)`: fishball-ui's REAL Node row (`index.js`) applied as a plugin in a real Cordis
 *   Context of that SDK, which provides a recording `connection` (its `fetch.register`). Core's
 *   `fishballInstance` is a fake with a scriptable `ui.pairing`, provided, replaced and removed by
 *   its own plugin fibers, so the row meets Cordis's real `internal/service` events.
 * Nothing of the implementation is read; only exports and the routes' Responses are observed.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { importBound } from '../../shared/dsh-host/subject.mjs'
import { FIXTURE, ROUTE, STATE, SUBJECT, VIEW, WAIT } from './constants.mjs'

export async function viewModule(sdk) {
  const view = await importBound(sdk, SUBJECT.view)
  const text = await importBound(sdk, SUBJECT.text)
  assert.equal(typeof view[SUBJECT.viewExport], 'function', `fishball-ui src/pairing/index.js exports no ${SUBJECT.viewExport}()`)
  assert.equal(typeof text[SUBJECT.textExport], 'object', 'no PAIRING_TEXT')
  return { pairingView: view[SUBJECT.viewExport], TEXT: text[SUBJECT.textExport] }
}

// ------------------------------------------------------------------------------------- views

/** A warning as core's view carries it; `inUse` is `{name}` or, nameless, `{prefix: 'ID: ', id}`. */
export const warningOf = ({ idMatches = true, lastSeenAt = FIXTURE.lastSeenAt, nameless = false, name = FIXTURE.name } = {}) => Object.freeze({
  boundId: FIXTURE.boundId, name: nameless ? null : name, pairedAt: FIXTURE.pairedAt, lastSeenAt, idMatches, advice: null,
  inUse: Object.freeze(nameless ? { prefix: VIEW.idPrefix, id: FIXTURE.boundId } : { name }),
})
/** A name issue (`source` is core's; its value is not drawn). */
export const nameIssueOf = (code, { nameless = false, name = FIXTURE.name } = {}) => Object.freeze({
  source: 'fbtest-source', code, inUse: Object.freeze(nameless ? { prefix: VIEW.idPrefix, id: FIXTURE.boundId } : { name }),
})
/** One core view `{state, warning, choices, nameIssue}`. */
export function coreView(state, { warning = null, nameIssue = null } = {}) {
  const choices = state === STATE.warnMatch ? ['continue', 'new-token-and-id'] : state === STATE.warnMismatch ? ['new-token'] : []
  const w = warning ?? (state === STATE.warnMatch ? warningOf() : state === STATE.warnMismatch ? warningOf({ idMatches: false }) : null)
  return Object.freeze({ state, warning: w, choices: Object.freeze(choices), nameIssue })
}

/** `lastSeen` as the requirement formats it (`neverSeen`, or Intl medium/short in the zone; a bad zone → default). */
export function lastSeenText(TEXT, lang, lastSeenAt, timeZone) {
  if (lastSeenAt === null) return TEXT[lang].neverSeen
  const options = { ...VIEW.timeFormat }
  let zoneOk = timeZone !== undefined
  if (zoneOk) { try { new Intl.DateTimeFormat(VIEW.locale[lang], { timeZone }) } catch { zoneOk = false } }
  if (zoneOk) options.timeZone = timeZone
  return new Intl.DateTimeFormat(VIEW.locale[lang], options).format(new Date(lastSeenAt))
}
const inUseName = (inUse) => (typeof inUse?.name === 'string' ? inUse.name : VIEW.idPrefix + inUse.id)

/** The requirement's view model for one core view (the oracle). */
export function expectedView(TEXT, view, lang, timeZone) {
  const l = VIEW.langs.includes(lang) ? lang : VIEW.defaultLang
  const T = TEXT[l]
  const out = { state: view?.state, title: T.title, lines: [], confirm: null, choices: [], failed: T.chooseFailed }
  if (view === undefined) return out
  const label = (choice) => ({ choice, label: T[VIEW.choiceLabel[choice]] })
  if (view.state === STATE.warnMatch) {
    out.lines.push({ kind: STATE.warnMatch, text: T.warnMatch(inUseName(view.warning.inUse), lastSeenText(TEXT, l, view.warning.lastSeenAt, timeZone)) })
    out.confirm = T.confirm
    out.choices = [label('continue'), label('new-token-and-id')]
  } else if (view.state === STATE.warnMismatch) {
    out.lines.push({ kind: STATE.warnMismatch, text: T.warnMismatch(inUseName(view.warning.inUse), lastSeenText(TEXT, l, view.warning.lastSeenAt, timeZone)) })
    out.choices = [label('new-token')]
  } else if (VIEW.stateText[view.state]) {
    out.lines.push({ kind: view.state, text: T[VIEW.stateText[view.state]] })
  }
  if (view.nameIssue) {
    const tail = typeof view.nameIssue.inUse?.name === 'string' ? T.nameInUse(view.nameIssue.inUse.name) : T.nameless(view.nameIssue.inUse.id)
    out.lines.push({ kind: view.nameIssue.code, text: T[VIEW.nameText[view.nameIssue.code]] + VIEW.separator + tail })
  }
  return out
}

/** A plain, comparable copy of a view-model result. */
export const plain = (v) => JSON.parse(JSON.stringify(v))
export const deepFrozen = (v) => v === null || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(deepFrozen))

// ------------------------------------------------------------------------------------- the row

/** A fake `fishballInstance` with a scriptable `ui.pairing` (`set(view)` notifies its listeners). */
export function fakeInstance({ view = coreView(STATE.unpaired), apiVersion = ROUTE.apiVersion, pairing = true, choose } = {}) {
  const listeners = new Set()
  const calls = []
  let current = view
  const face = {
    state: () => current,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    choose: async (choice, options) => { calls.push([choice, options]); return choose ? choose(choice, options) : { ok: true } },
  }
  return {
    service: Object.freeze({ apiVersion, ...(pairing ? { ui: Object.freeze({ pairing: face }) } : { ui: Object.freeze({}) }) }),
    calls, listeners,
    set(next) { current = next; for (const fn of [...listeners]) fn(next) },
  }
}

const cordisOf = async (sdk) => import(pathToFileURL(path.join(runtimeOf(sdk), '@deepseek-ai', 'cordis', 'lib', 'index.js')).href)
const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)) }

/**
 * fishball-ui's row in a real Cordis root. Returns `{routes, provide(instance) → dispose, open(lang, tz),
 * choose(body, raw?), stop()}`.
 */
export async function rowWorld(t, sdk) {
  const { Context } = await cordisOf(sdk)
  const root = new Context()
  const routes = []
  const withdrawn = []
  root.provide(ROUTE.connection, { fetch: { register(route) { routes.push(route); return () => { withdrawn.push(route.path) } } } })
  const row = await importBound(sdk, SUBJECT.row)
  const fiber = root.plugin(row)
  await fiber
  await settle()
  const fibers = []
  let stopped = false
  const stop = async () => { if (stopped) return; stopped = true; for (const f of fibers.reverse()) await f.dispose?.(); await fiber.dispose?.(); await settle() }
  t.after(stop)
  const route = (at) => { const r = routes.find((x) => x.path === at); assert.ok(r, `no route at ${at}; routes ${JSON.stringify(routes.map((x) => x.path))}`); return r }
  return {
    routes, withdrawn, stop,
    /** Provide `instance.service` as `fishballInstance` from its own fiber; resolves to its disposer. */
    async provide(instance) {
      const f = root.plugin({ name: 'fbtest-core-stand-in', apply: (ctx) => { ctx.provide(ROUTE.service, instance.service) } })
      await f
      fibers.push(f)
      await settle()
      return async () => { await f.dispose(); await settle() }
    },
    /** Open the stream; returns a reader of its frames. */
    async open(query = '') {
      const abort = new AbortController()
      const response = await route(ROUTE.stream).fetch(new Request(new URL(ROUTE.stream + query, FIXTURE.base), { method: ROUTE.get, signal: abort.signal }))
      return sseReader(response, abort)
    },
    async choose(body, raw = false) {
      const response = await route(ROUTE.choose).fetch(new Request(new URL(ROUTE.choose, FIXTURE.base), { method: ROUTE.post, body: raw ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
      const text = await response.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: response.status, json, text }
    },
  }
}

/** Reads `data: <json>\n\n` frames from an SSE Response; `next()` waits for one, `quiet()` proves none came. */
function sseReader(response, abort) {
  const frames = []
  let buffer = ''
  let ended = false
  const waiters = new Set()
  const reader = response.body?.getReader()
  const pump = async () => {
    if (!reader) { ended = true; return }
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += new TextDecoder().decode(value)
        let at
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, at)
          buffer = buffer.slice(at + 2)
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
          if (data !== '') frames.push(JSON.parse(data))
        }
        for (const w of [...waiters]) w()
      }
    } catch { /* aborted */ }
    ended = true
    for (const w of [...waiters]) w()
  }
  void pump()
  const wait = (test, ms) => new Promise((resolve) => {
    const check = () => { if (test()) { waiters.delete(check); clearTimeout(timer); resolve(true) } }
    const timer = setTimeout(() => { waiters.delete(check); resolve(false) }, ms)
    waiters.add(check)
    check()
  })
  return {
    response, frames,
    get ended() { return ended },
    async count(n, ms = WAIT.frameMs) { await wait(() => frames.length >= n, ms); return frames.length },
    async quiet(ms = WAIT.quietMs) { await new Promise((r) => setTimeout(r, ms)); return frames.length },
    async closed(ms = WAIT.frameMs) { return wait(() => ended, ms) },
    abort: () => abort.abort(),
  }
}
