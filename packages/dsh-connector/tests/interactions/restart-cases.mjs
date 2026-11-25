/**
 * Connector restarts and settings (USE-CASES.md IX-UC-01…05 post-conditions) on a real DSH that is
 * stopped and started again on the same home. Gap-check (B) rows: DUR-06, RST-01…06, END-08; and the
 * settings the user changed (decision list items 8, 9; q5). Its own scenario per SDK: a restart must
 * not disturb the other files' worlds. Techniques: EP, ST.
 */
import assert from 'node:assert/strict'
import { DECISION_TEXT, EVENT_TYPE, FIXTURE, IX, REFUSAL, RELAYED, SURFACE, TOOL, WORLD } from './constants.mjs'
import { row } from './rows.mjs'
import {
  A, answer, asked, assertCovered, decided, managed, ofType, okCall, pending, prefixGrant, principal, qAnswer, questioned, quiet, reconnect, tok, turn,
  world,
} from './subject.mjs'

const SET = RELAYED.setting
const REQUESTS = SURFACE.settings.requests
const REQUEST_DEFAULTS = Object.freeze({ [SURFACE.settings.autoEscalatePermissions]: true, [SURFACE.settings.autoRejectIncompleteArguments]: true })
const restartWorld = (sdk) => world(sdk, WORLD.scenario.restart)
/** The settings value DSH describes for the connector row. */
const value = async (w) => (await w.settings())?.value ?? {}

export function registerRestartCases(sdk) {
  // One flow per SDK: a managed session with a grant and an open question, then a restart.
  row(sdk, 'DUR-06 / RST-01…06 / END-08', 'ST (Managed, a grant with uses, a question open → connector restart)', 'after the restart: the session still has message_agent and its request is offered; the old question id is expired and nothing is re-offered; the grant keeps its uses and still covers', async (t) => {
    const w = await restartWorld(sdk)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const base = tok('rst')
    const r = await asked(w, p, sid, { tool: 'bash', text: base + ' a' })
    const granted = await answer(p, r, A.grant(prefixGrant(base, FIXTURE.yearMs)))
    assert.equal(granted.ok, true, JSON.stringify(granted))
    await decided(w, base + ' a', sid)
    await assertCovered(w, p, sid, 'bash', base + ' b')
    const qsid = await managed(w, p, IX.preset.ask)
    const q = await questioned(w, p, qsid)

    await w.restart()
    const again = await reconnect(t, w, p)
    await w.call('resume', { sessionId: sid })
    // The grant: still listed with its uses, still covers.
    const g = (await okCall(again.client, TOOL.grantsList, {})).grants.find((x) => x.grantId === granted.grantId)
    assert.ok(g, 'the grant was lost in the restart')
    assert.equal(g.uses, 1)
    await assertCovered(w, again, sid, 'bash', base + ' c')
    // The managed tools and offers.
    await turn(w, sid, [[{ text: tok('after') }]])
    const tools = (await w.call('requestTools', { sessionId: sid })).at(-1).map((x) => x.name)
    assert.ok(tools.includes(RELAYED.messageTool), 'no message_agent after the restart')
    const r2 = await asked(w, again, sid)
    assert.equal(r2.event.type, EVENT_TYPE.permission)
    // The question: its old id is expired, and it is not offered again.
    const late = await qAnswer(again, q, { answers: FIXTURE.answer.blue })
    assert.deepEqual([late.ok, late.code], [false, REFUSAL.expired])
    await quiet()
    const reoffered = ofType(await pending(again.client), EVENT_TYPE.question).filter((e) => e.payload.approvalId === q.d.approvalId && e.eventId !== q.event.eventId)
    assert.deepEqual(reoffered, [], 'the question was offered again after the restart')
  })

  // ------------------------------------------------------------------------- settings (the user's decisions)
  row(sdk, 'IX-SET-01', 'EP (settings schema and defaults)', `the settings hold exactly tokens, approval, ${REQUESTS}, ${Object.keys(RELAYED.kept).join(', ')}; limits retain their defaults; both permission options are booleans defaulting to true`, async () => {
    const w = await world(sdk)
    const { value: v, schema } = await w.settings()
    assert.deepEqual(Object.keys(v).sort(), [SET.tokens, SET.approval, REQUESTS, ...Object.keys(RELAYED.kept)].sort())
    for (const [k, d] of Object.entries(RELAYED.kept)) assert.equal(v[k], d, k)
    assert.deepEqual(v[REQUESTS], REQUEST_DEFAULTS)

    const group = schema.refs[schema.refs[schema.uid].dict[REQUESTS]]
    assert.equal(group?.type, 'object', REQUESTS)
    for (const [key, expected] of Object.entries(REQUEST_DEFAULTS)) {
      const field = schema.refs[group.dict[key]]
      assert.equal(field?.type, 'boolean', key)
      assert.equal(field.meta?.default, expected, key)
    }
  })
  row(sdk, 'IX-SET-02', 'EP (removed fields)', `none of ${RELAYED.removed.join(', ')} is a setting; no routing.agentToken (${DECISION_TEXT.q5})`, async () => {
    const w = await world(sdk)
    const v = await value(w)
    for (const k of RELAYED.removed) assert.equal(Object.hasOwn(v, k), false, k + ' is still a setting')
    assert.equal(Object.hasOwn(v, SURFACE.settings.routing), false, 'routing is still a setting')
  })
  row(sdk, 'IX-SET-03', 'ST (approval.dshName unset → set → cleared, live)', 'dshName is optional (unset = undefined by default), accepts a string and is cleared again, with no remount', async () => {
    const w = await world(sdk)
    assert.equal((await value(w))[SET.approval]?.[SET.dshName], undefined, 'dshName has a default')
    const fiber = (await w.call('row')).fiber
    const port = (await value(w))[SET.approval][SURFACE.settings.port]
    assert.equal((await w.call('settingsUpdate', { patch: { [SET.approval]: { [SURFACE.settings.port]: port, [SET.dshName]: FIXTURE.name.a } } })).ok, true)
    assert.equal((await value(w))[SET.approval][SET.dshName], FIXTURE.name.a)
    assert.equal((await w.call('settingsMutate', { ops: [{ op: 'unset', path: [SET.approval, SET.dshName] }] })).ok, true)
    assert.equal((await value(w))[SET.approval][SET.dshName], undefined)
    assert.equal((await w.call('row')).fiber, fiber, 'a dshName edit remounted the row')
  })
  // MULTI-2 user naming decision (2026-11-18): approval reuses the bare resolved base;
  // only MCP discovery/resource identity appends -DSH. URL/origin is no longer a fallback.
  row(sdk, 'IX-SET-04', 'EP (dshName on the consent page)', 'the OAuth approval page shows nonblank dshName verbatim and node:os.hostname() when unset, empty or whitespace-only (bare base, no MCP -DSH suffix)', null, {
    todo: 'needs an https CIMD client the real DSH can fetch (the consent form is shown only for a resolved client); the module-level rendering of a given name is C-OAUTH-WEB\'s (oauth-web cases, STUB.dshName)',
  })
  row(sdk, 'IX-SET-05', 'EP (the state route)', 'GET state answers {ok, entries, approval}: no designated field (q5)', async () => {
    const w = await world(sdk)
    const r = await w.owner('GET', SURFACE.route.state)
    assert.deepEqual(Object.keys(r.json).sort(), ['approval', 'entries', 'ok'])
    assert.deepEqual(Object.keys(r.json.approval).sort(), [...SURFACE.approvalKeys])
  })
  row(sdk, 'IX-SET-06', 'EP (no V2 service)', 'the dshConnector and fishballSessionState services are gone', async () => {
    const w = await world(sdk)
    const got = await w.call('services', { names: [SURFACE.service.v2, IX.v2.sessionState] })
    assert.equal(got[SURFACE.service.v2].present, false)
    assert.equal(got[IX.v2.sessionState].present, false)
  })
  row(sdk, 'IX-SET-07', 'EP (no V2 route)', 'no /api/fishball/* route answers the owner with JSON', async () => {
    const w = await world(sdk)
    for (const route of IX.v2.routes) {
      const r = await w.owner('GET', route)
      assert.ok(r.status >= IX.v2.badRequest || r.json === undefined, `${route} still answers: ${r.status} ${r.text.slice(0, 200)}`)
    }
  })
}
