/**
 * WD-LIVE: the real dsh-connector-watchdog on a real DSH (the amenities bundle linked beside
 * dsh-agent-connector), driven only as Fishball and the session's model reach it: Watchdog's
 * contributed MCP tools, the connector's events, and DSH's own session turns. The judge's side
 * session answers from the scripted fake model; its requests are recognised by a marker in the
 * brief's purpose (the side session's id is minted by Watchdog). Gap check against
 * docs/watchdog-project-notes.md §2–§3: the core cases (tests/watchdog/core.test.mjs) run over
 * fakes; these rows prove the same rules through the connector's delegate → grant → offer path.
 * Patrol timing (60 s minimum) stays in the core cases. Techniques: UC, EP, DT, ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { row } from '../../../../dsh-connector/tests/interactions/rows.mjs'
import { EVENT_TYPE, IX, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL } from '../../../../dsh-connector/tests/interactions/constants.mjs'
import {
  argsFor, call, cid, decided, eventually, free, handOver, managed, ofType, okCall, pending, principal, quiet, reconnect, resultsOf, session, step, stockFor,
  takeBack, tok, waitEvents, world,
} from '../../../../dsh-connector/tests/interactions/subject.mjs'
import { WD } from './constants.mjs'

const wdWorld = (sdk, label = WD.scenario.main) => world(sdk, label, WD.env)

/** Watchdog's tool as `p` calls it (its structured K2 result). */
const wd = (p, tool, args) => call(p.client, tool, args)

/** A briefed managed session whose side-session answers are recognised by `marker`. */
async function briefed(w, p, { scope = WD.scope } = {}) {
  const sid = await managed(w, p)
  const marker = tok('wdm')
  const r = await wd(p, WD.tool.brief, { sessionId: sid, purpose: WD.purpose(marker), scope })
  assert.equal(r.ok, true, JSON.stringify(r))
  return { sid, marker }
}

/** Queues the judge's next answers (one per judgement) for the side session of `b`. */
const judgeWill = (w, b, ...answers) => w.call('queueMarker', { marker: b.marker, except: b.sid, script: answers })
const judged = async (w, b) => (await w.call('markerState', { marker: b.marker })) ?? { sessions: [], left: 0 }

/** One asking fixture call in `sid`; does not wait for its outcome. */
async function asks(w, sid) {
  await free(w, sid)
  const text = tok('wd')
  const id = cid('wd')
  await w.call('driveStart', { sessionId: sid, text: tok('user'), script: [step(IX.fixture.askTool, argsFor(IX.fixture.askTool, text), id), [{ text: 'done' }]] })
  return { text, id }
}
const watchdogSettlement = (p, sid) => waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.settlement).find((s) => s.sourceSessionId === sid && s.payload.by === SETTLED_BY.delegate), 'a Watchdog settlement')
const offerFor = (p, text) => waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.permission).find((x) => x.payload.reason === IX.fixture.reason(text)), 'a permission offer')

export function registerWatchdogLiveCases(sdk) {
  row(sdk, 'WD-L01', 'UC (installed)', 'the bundle loads dsh-connector-watchdog and preset-watchdog; a paired principal sees the four tools', async (t) => {
    const w = await wdWorld(sdk)
    for (const id of [WD.row, WD.presetRow]) assert.equal((await w.call('row', { id })).active, true, id)
    const p = await principal(t, w)
    const names = (await p.client.listTools()).tools.map((x) => x.name)
    for (const name of Object.values(WD.tool)) assert.ok(names.includes(name), name)
  })

  row(sdk, 'WD-L02', 'EP (brief: who, what)', 'only the manager may brief; an empty purpose and a second brief are refused; a later manager replaces an earlier manager\'s brief', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const q = await principal(t, w, 'WD principal Q')
    const sid = await managed(w, p)
    assert.equal((await wd(q, WD.tool.brief, { sessionId: sid, purpose: 'x' })).code, WD.code.forbidden)
    assert.equal((await wd(p, WD.tool.brief, { sessionId: sid, purpose: '  ' })).code, WD.code.emptyPurpose)
    assert.equal((await wd(p, WD.tool.refine, { sessionId: sid, scope: 'x' })).code, WD.code.notBriefed)
    const first = await wd(p, WD.tool.brief, { sessionId: sid, purpose: ' build it ' })
    assert.deepEqual([first.ok, first.purpose, first.scope, first.paused], [true, 'build it', '', false])
    assert.equal((await wd(p, WD.tool.brief, { sessionId: sid, purpose: 'again' })).code, WD.code.conflict)
    await takeBack(w, sid)
    await handOver(w, sid, q)
    assert.equal((await wd(p, WD.tool.refine, { sessionId: sid, scope: 'x' })).code, WD.code.forbidden)
    assert.equal((await wd(q, WD.tool.refine, { sessionId: sid, scope: 'x' })).code, WD.code.notBriefed)
    assert.equal((await wd(q, WD.tool.brief, { sessionId: sid, purpose: 'Q\'s purpose' })).ok, true)
  })

  row(sdk, 'WD-L03', 'UC + EP (allow within the scope)', 'the call runs with no offer; the manager gets settlement {allowed, by delegate, delegate {name: watchdog}}; the side session judged on the purpose, the scope and the request; the brief is persisted', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const b = await briefed(w, p)
    await judgeWill(w, b, WD.answer.allow('within the scope'))
    const r = await asks(w, b.sid)
    assert.equal((await decided(w, r.text, b.sid)).outcome, IX.outcome.allowed)
    const s = await watchdogSettlement(p, b.sid)
    assert.deepEqual([s.payload.outcome, s.payload.delegate], [SETTLEMENT_OUTCOME.allowed, { name: WD.delegate, toolName: IX.fixture.askTool, reason: 'within the scope' }])
    assert.deepEqual(ofType(await pending(p.client), EVENT_TYPE.permission).filter((e) => e.payload.reason === IX.fixture.reason(r.text)), [])
    const [side] = (await judged(w, b)).sessions
    assert.ok(side && side !== b.sid, 'no side session judged')
    const prompt = (await w.call('requests', { sessionId: side })).at(-1).texts
    for (const part of [WD.purpose(b.marker), WD.scope, IX.fixture.askTool, IX.fixture.reason(r.text)]) assert.ok(prompt.includes(part), 'the judgement lacks ' + part)
    await free(w, b.sid)
    const stored = await eventually(() => findBriefs(w.home).some((x) => x.sessionId === b.sid && x.sideSessionId === side))
    assert.ok(stored, 'the brief (with its side session) is not in briefs.json')
  })

  row(sdk, 'WD-L04', 'EP (reject: beyond the purpose and dangerous)', 'the call is rejected; the agent reads the reason; settlement {rejected, by delegate}', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const b = await briefed(w, p)
    await judgeWill(w, b, WD.answer.reject('deletes the home folder'))
    const r = await asks(w, b.sid)
    assert.equal((await decided(w, r.text, b.sid)).outcome, IX.outcome.rejected)
    assert.equal((await watchdogSettlement(p, b.sid)).payload.outcome, SETTLEMENT_OUTCOME.rejected)
    await w.call('idle', { sessionId: b.sid })
    const [result] = await resultsOf(w, b.sid, r.id)
    assert.ok(result?.text.includes('deletes the home folder'), JSON.stringify(result))
  })

  row(sdk, 'WD-L05', 'DT (pass, nonsense → the manager)', 'a pass and an unreadable answer each leave the request to the manager as a normal offer, with no Watchdog settlement', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    for (const answer of [WD.answer.pass(), WD.answer.nonsense()]) {
      const b = await briefed(w, p)
      await judgeWill(w, b, answer)
      const r = await asks(w, b.sid)
      await offerFor(p, r.text)
      await quiet()
      assert.equal(ofType(await pending(p.client), EVENT_TYPE.settlement).filter((s) => s.sourceSessionId === b.sid).length, 0)
      assert.equal((await judged(w, b)).left, 0, 'the judge was not asked')
      await free(w, b.sid)
    }
  })

  row(sdk, 'WD-L06', 'UC + ST (drift at a request)', 'the call is rejected, the turn is stopped, the manager gets the drift event {sessionId, during: permission, reason}; the manager can still message the session', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const b = await briefed(w, p)
    await judgeWill(w, b, WD.answer.drifted('it is rewriting the website instead'))
    const r = await asks(w, b.sid)
    assert.equal((await decided(w, r.text, b.sid)).outcome, IX.outcome.rejected)
    const drift = await waitEvents(p.client, (e) => e.find((x) => x.type === WD.driftType && x.sourceSessionId === b.sid), 'a drift event')
    assert.deepEqual(drift.payload.data, { sessionId: b.sid, during: WD.during.permission, reason: 'it is rewriting the website instead' })
    assert.ok(drift.payload.summary.includes('it is rewriting the website instead'), drift.payload.summary)
    assert.ok(await w.call('idle', { sessionId: b.sid }), 'the drifted turn was not stopped')
    const sent = await call(p.client, TOOL.sessionMessage, { sessionId: b.sid, message: tok('back on track'), attachments: [] })
    assert.equal(sent.ok, true, JSON.stringify(sent))
    await free(w, b.sid)
  })

  row(sdk, 'WD-L07', 'ST (pause → resume)', 'a paused brief judges nothing (the request is offered to the manager); after resume the judge decides again', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const b = await briefed(w, p)
    assert.equal((await wd(p, WD.tool.pause, { sessionId: b.sid })).paused, true)
    const r1 = await asks(w, b.sid)
    await offerFor(p, r1.text)
    assert.deepEqual((await judged(w, b)).sessions, [])
    await free(w, b.sid)
    assert.equal((await wd(p, WD.tool.resume, { sessionId: b.sid })).paused, false)
    await judgeWill(w, b, WD.answer.allow('resumed and in scope'))
    const r2 = await asks(w, b.sid)
    assert.equal((await decided(w, r2.text, b.sid)).outcome, IX.outcome.allowed)
    await free(w, b.sid)
  })

  row(sdk, 'WD-L08', 'DT (unmanaged)', 'after Take back the brief no longer speaks: the user sees the stock prompt; the judge is not asked', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const b = await briefed(w, p)
    await takeBack(w, b.sid)
    await judgeWill(w, b, WD.answer.allow('x'))
    const r = await asks(w, b.sid)
    assert.ok(await eventually(async () => (await stockFor(w, r.text)).length > 0), 'no stock prompt')
    assert.equal((await judged(w, b)).left, 1, 'the judge was asked for an unmanaged session')
    await free(w, b.sid)
  })

  row(sdk, 'WD-L09', 'ST (restart)', 'a brief survives a DSH restart: Watchdog still decides for the same manager', async (t) => {
    const w = await wdWorld(sdk, WD.scenario.restart)
    const p = await principal(t, w)
    const b = await briefed(w, p)
    await w.restart()
    const again = await reconnect(t, w, p)
    await w.call('resume', { sessionId: b.sid })
    await judgeWill(w, b, WD.answer.allow('still in scope'))
    const r = await asks(w, b.sid)
    assert.equal((await decided(w, r.text, b.sid)).outcome, IX.outcome.allowed)
    assert.equal((await watchdogSettlement(again, b.sid)).payload.delegate.name, WD.delegate)
    assert.equal((await wd(again, WD.tool.brief, { sessionId: b.sid, purpose: 'x' })).code, WD.code.conflict)
    await free(w, b.sid)
  })
}

/** Every brief in the profile's briefs.json (wherever DSH's home puts the profile). */
function findBriefs(home) {
  const files = fs.readdirSync(home, { recursive: true }).map(String).filter((f) => f.endsWith(path.join(WD.store.dir, WD.store.file)))
  return files.flatMap((f) => { try { return JSON.parse(fs.readFileSync(path.join(home, f), 'utf8')).briefs } catch { return [] } })
}
