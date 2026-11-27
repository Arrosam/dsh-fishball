/**
 * WD-LIVE: the real dsh-connector-watchdog on a real DSH (the dsh-connector-watchdog bundle linked beside
 * dsh-agent-connector), driven only as Fishball and the session's model reach it: Watchdog's
 * contributed MCP tools, the connector's events, and DSH's own session turns. The judge's side
 * session answers from the scripted fake model; its requests are recognised by a marker in the
 * brief's purpose (the side session's id is minted by Watchdog). Gap check against
 * docs/watchdog-project-notes.md §2–§3: the core cases (tests/watchdog/core.test.mjs) run over
 * fakes; these rows prove the same rules through the connector's delegate → grant → offer path.
 * Patrol timing (60 s minimum) stays in the core cases. 2026-11-21 (after the live test): an
 * undecided request's offer carries delegate {watchdog, passed | failed, reason}; a drift stop is
 * reported to the manager with the hook cause. Techniques: UC, EP, DT, ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { row } from 'dsh-connector-test-helpers/connector-world/rows'
import { EVENT_TYPE, IX, K1, REFUSAL, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL } from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import {
  argsFor, call, cid, decided, eventually, free, handOver, managed, ofType, okCall, pending, principal, quiet, reconnect, resultsOf, session, step, stockFor,
  takeBack, tok, waitEvents, world,
} from 'dsh-connector-test-helpers/connector-world/interactions'
import { SHARED_CODES } from 'dsh-agent-connector/tools'
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
/** watchdog_session_start's arguments in `folder`: session_start's, plus a purpose (and scope) carrying `judgeMarker`. */
const startArgsIn = (folder, { message = tok('first'), judgeMarker = tok('wdj') } = {}) => ({
  folder, title: 'WD start ' + tok('t'), message, attachments: [], purpose: WD.purpose(judgeMarker), scope: WD.scope,
})
/**
 * Arguments for a session whose FIRST turn's first model step is one asking fixture call (the new
 * session's id is not known in advance, so its first message carries a marker the scripted model
 * answers by), and the judge's answer queued for the side session (recognised by the purpose's
 * marker). The judge's marker is queued first, so a side-session request that also quotes the
 * session's first message still takes the judge's answer.
 */
async function startedFirstAsking(w, p, { judge }) {
  const folder = await w.call('folder', { name: tok('wdstart') })
  const judgeMarker = tok('wdj')
  const sessionMarker = tok('wds')
  const text = tok('wd')
  await w.call('queueMarker', { marker: judgeMarker, script: [judge] })
  await w.call('queueMarker', { marker: sessionMarker, script: [step(IX.fixture.askTool, argsFor(IX.fixture.askTool, text), cid('wd')), [{ text: 'done' }]] })
  return { args: startArgsIn(folder, { message: 'Begin. ' + sessionMarker, judgeMarker }), text, judgeMarker }
}
const judgeLeft = async (w, marker) => (await w.call('markerState', { marker }))?.left ?? 0
const watchdogSettlement = (p, sid) => waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.settlement).find((s) => s.sourceSessionId === sid && s.payload.by === SETTLED_BY.delegate), 'a Watchdog settlement')
const offerFor = (p, text) => waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.permission).find((x) => x.payload.reason === IX.fixture.reason(text)), 'a permission offer')

export function registerWatchdogLiveCases(sdk) {
  row(sdk, 'WD-L01', 'UC (installed)', 'the bundle loads dsh-connector-watchdog and preset-watchdog; a paired principal sees the five tools (watchdog_session_start included: this connector offers dshConnectorSessions.start); watchdog_brief\'s description mentions watchdog_session_start', async (t) => {
    const w = await wdWorld(sdk)
    for (const id of [WD.row, WD.presetRow]) assert.equal((await w.call('row', { id })).active, true, id)
    const p = await principal(t, w)
    const tools = (await p.client.listTools()).tools
    const names = tools.map((x) => x.name)
    assert.equal(Object.values(WD.tool).length, 5, 'harness: five Watchdog tools')
    for (const name of Object.values(WD.tool)) assert.ok(names.includes(name), name)
    assert.deepEqual(names.filter((n) => n.startsWith(WD.row + '.')).sort(), Object.values(WD.tool).sort(), 'Watchdog contributes other tools than the five')
    assert.ok(tools.find((x) => x.name === WD.tool.brief).description.includes('watchdog_session_start'), 'watchdog_brief does not point to watchdog_session_start')
  })

  row(sdk, 'WD-L10', 'EP (watchdog_session_start input schema)', 'its inputSchema has session_start\'s properties plus purpose and scope (strings); required = session_start\'s required plus purpose; closed (additionalProperties false)', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const listed = (await p.client.listTools()).tools.find((x) => x.name === WD.tool.sessionStart)
    assert.ok(listed, 'watchdog_session_start is not listed')
    const core = K1.toolDefinition(TOOL.sessionStart).inputSchema
    const schema = listed.inputSchema
    assert.deepEqual(Object.keys(schema.properties).sort(), [...Object.keys(core.properties), ...WD.startOwn].sort())
    for (const [k, v] of Object.entries(core.properties)) assert.equal(schema.properties[k].type, v.type, k)
    for (const k of WD.startOwn) assert.equal(schema.properties[k].type, 'string', k)
    assert.deepEqual([...schema.required].sort(), [...core.required, 'purpose'].sort())
    assert.equal(schema.additionalProperties, false)
  })

  row(sdk, 'WD-L11', 'ST (the gap closed: watchdog_session_start → first request)', 'watchdog_session_start → {ok, sessionId, managed: true, running, supervised: true}; the session\'s first turn\'s first asking call is decided by Watchdog (judge allow): the call runs, settlement {allowed, by delegate, delegate.name watchdog}, no permission offer to the manager', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const s = await startedFirstAsking(w, p, { judge: WD.answer.allow('the first request is in scope') })
    const r = await wd(p, WD.tool.sessionStart, s.args)
    assert.deepEqual([r.ok, typeof r.sessionId, r.managed, typeof r.running, r.supervised], [true, 'string', true, 'boolean', true], JSON.stringify(r))
    assert.equal((await decided(w, s.text, r.sessionId)).outcome, IX.outcome.allowed)
    const settled = await watchdogSettlement(p, r.sessionId)
    assert.deepEqual([settled.payload.outcome, settled.payload.delegate?.name, settled.payload.delegate?.toolName], [SETTLEMENT_OUTCOME.allowed, WD.delegate, IX.fixture.askTool])
    await quiet()
    assert.deepEqual(ofType(await pending(p.client), EVENT_TYPE.permission).filter((e) => e.payload.reason === IX.fixture.reason(s.text)), [], 'the first request was offered to the manager')
    assert.equal(await judgeLeft(w, s.judgeMarker), 0, 'the judge was not asked')
    await free(w, r.sessionId)
  })

  row(sdk, 'WD-L12', 'ST (contrast: session_start, then watchdog_brief — the known window)', 'a session started with session_start asks before any brief: its first request is a normal offer to the manager with no delegate field; a watchdog_brief afterwards succeeds but the waiting request stays with the manager (the judge is not asked for it)', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const s = await startedFirstAsking(w, p, { judge: WD.answer.allow('should not be asked') })
    const { purpose, scope, ...coreArgs } = s.args
    const started = await okCall(p.client, TOOL.sessionStart, coreArgs)
    // Deterministic order: the brief is sent only once the first request already reached the manager.
    const offer = await offerFor(p, s.text)
    assert.equal(offer.sourceSessionId, started.sessionId)
    assert.equal('delegate' in offer.payload, false, 'a request asked before the brief carries a delegate: ' + JSON.stringify(offer.payload))
    const b = await wd(p, WD.tool.brief, { sessionId: started.sessionId, purpose, scope })
    assert.equal(b.ok, true, JSON.stringify(b))
    await quiet()
    assert.equal(await judgeLeft(w, s.judgeMarker), 1, 'the judge was asked for a request made before the brief')
    assert.equal(ofType(await pending(p.client), EVENT_TYPE.settlement).filter((x) => x.sourceSessionId === started.sessionId && x.payload.by === SETTLED_BY.delegate).length, 0)
    await free(w, started.sessionId)
  })

  // DT over session_start's refusal → watchdog_session_start's refusal over MCP (a declared or K2 shared code is kept, any other → operation-failed).
  const START_REFUSALS = [
    ['an empty purpose (Watchdog\'s own check, before any start)', () => ({ purpose: ' ' }), WD.code.emptyPurpose, null],
    ['an unknown model → invalid-decision (declared)', () => ({ model: 'fbtest-no-such-model' }), REFUSAL.invalidDecision, REFUSAL.invalidDecision],
    ['a relative folder → forbidden (shared)', () => ({ folder: 'relative/fbwd-folder' }), REFUSAL.forbidden, REFUSAL.forbidden],
    ['a missing absolute folder → unknown-session (shared)', (f) => ({ folder: f + '-fbwd-missing' }), REFUSAL.unknownSession, REFUSAL.unknownSession],
    ['an invisible title → limit-exceeded (shared)', () => ({ title: '\u200b' }), REFUSAL.limitExceeded, REFUSAL.limitExceeded],
    ['an empty folder → invalid-arguments, not answerable → operation-failed', () => ({ folder: '' }), WD.code.operationFailed, REFUSAL.invalidArguments],
  ]
  row(sdk, 'WD-L13', 'DT (watchdog_session_start refusals over MCP)', 'empty purpose → empty-purpose; a start refusal keeps a declared or shared code and its message "session_start refused: <code>"; invalid-arguments (a K2 call code) → operation-failed with the K1 code in its message; nothing is created; every code is declared, shared or operation-failed', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    const folder = await w.call('folder', { name: tok('wdstart') })
    for (const [label, extra, code, k1] of START_REFUSALS) {
      // k1: the K1 code session_start refused with (null: Watchdog refused before any start).
      const before = await w.call('sessionIds')
      const r = await wd(p, WD.tool.sessionStart, { ...startArgsIn(folder), ...extra(folder) })
      assert.deepEqual([r.ok, r.code], [false, code], label + ': ' + JSON.stringify(r))
      assert.ok(WD.startDeclared.includes(r.code) || SHARED_CODES.includes(r.code), label + ': ' + r.code + ' is neither declared nor shared')
      if (k1 !== null) assert.equal(r.message, WD.startRefused(k1), label)
      assert.deepEqual(await w.call('sessionIds'), before, label + ': a session was created')
    }
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

  // DT over the judge's answer → the offer's delegate (the user, 2026-11-21: a failure is told from a judged pass).
  const OFFERED = [
    ['a judged pass', WD.answer.pass(), { name: WD.delegate, outcome: WD.outcome.passed, reason: WD.passReason }],
    ['an unreadable answer', WD.answer.nonsense(), { name: WD.delegate, outcome: WD.outcome.failed, reason: WD.failure.unreadable }],
    ['an unknown verdict', WD.answer.unknown(), { name: WD.delegate, outcome: WD.outcome.failed, reason: WD.failure.unreadable }],
    ['allow with an empty reason', WD.answer.allow(''), { name: WD.delegate, outcome: WD.outcome.failed, reason: WD.failure.unreadable }],
  ]
  row(sdk, 'WD-L05', 'DT (pass / unreadable → the manager, with delegate {outcome})', 'a judged pass → the offer carries delegate {watchdog, passed, its reason}; an unreadable answer, an unknown verdict or a reasonless allow → delegate {watchdog, failed, judge-unreadable}; no Watchdog settlement; no stop', async (t) => {
    const w = await wdWorld(sdk)
    const p = await principal(t, w)
    for (const [label, answer, expected] of OFFERED) {
      const b = await briefed(w, p)
      await judgeWill(w, b, answer)
      const r = await asks(w, b.sid)
      const offer = await offerFor(p, r.text)
      assert.deepEqual(offer.payload.delegate, expected, label)
      await quiet()
      assert.equal(ofType(await pending(p.client), EVENT_TYPE.settlement).filter((s) => s.sourceSessionId === b.sid).length, 0, label)
      assert.equal((await judged(w, b)).left, 0, label + ': the judge was not asked')
      assert.equal(await w.call('status', { sessionId: b.sid }), IX.dsh.running, label + ': the turn does not wait on the offer')
      await free(w, b.sid)
    }
  })

  row(sdk, 'WD-L06', 'UC + ST (drift at a request)', 'the call is rejected, the turn is stopped, the manager gets the drift event {sessionId, during: permission, reason} and a turn-finished {stopped, stop {aborted, "the turn was cancelled (hook: Watchdog stopped the session (permission): <reason>)"}}; the manager can still message the session', async (t) => {
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
    // The stop names Watchdog's cause, not the user's (the user, 2026-11-21).
    const finished = await waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.turnFinished).find((x) => x.sourceSessionId === b.sid && x.payload.outcome === WD.turn.stopped), 'a stopped turn-finished')
    assert.equal(finished.payload.stop?.kind, WD.turn.aborted, JSON.stringify(finished.payload))
    assert.ok(finished.payload.stop.message.startsWith(WD.turn.driftStopPrefix), JSON.stringify(finished.payload.stop))
    assert.equal(finished.payload.stop.message, WD.turn.driftStop('it is rewriting the website instead'))
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