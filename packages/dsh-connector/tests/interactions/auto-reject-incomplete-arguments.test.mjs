/** Black-box coverage through DSH's permission waterfall, session log, and the manager's MCP client. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { ARGUMENTS_STATUS, BUDGET, FIXTURE, IX, K1, REFUSAL, RELAYED, SURFACE } from './constants.mjs'
import {
  A, answer, argsFor, asked, assertCovered, bytes, cid, decided, eventually, free, isListed, legacyIncompleteWorld, listed,
  managed, pending, permissionOptionOff, prefixGrant, principal, quiet, resultOf, resultsOf, session, setLimit, step,
  stockFor, tok, untilStock, userClicks, world,
} from './subject.mjs'

const SPEC = Object.freeze({
  suite: 'Auto-reject incomplete arguments',
  world: 'ix-auto-reject-incomplete-arguments',
  shell: 'bash',
  updated: 'notifications/resources/updated',
  missingCall: Object.freeze({ nocall: true }),
  command: 'printf ',
  rejection: /incomplete|truncated|too long|not fully|unavailable/i,
  shorter: /shorter (?:shell )?commands?/i,
  shorterTarget: /well (?:under|below) (?:about |roughly |approximately |~\s*)?2[,.]?000\s+characters/i,
  justification: /(?:short|brief) (?:justification|reason|explanation)/i,
  rejectionLog: /auto[- ]?reject|reject.*(?:incomplete|truncated)|(?:incomplete|truncated).*reject/i,
  info: 'info',
  nextText: 'done',
  delegateVerdict: Object.freeze({ verdict: 'reject', reason: 'fixture delegate rejection' }),
})
const ACCEPTED = { ok: true, accepted: true }
const S = SURFACE.settings
const excerptField = RELAYED.setting.argumentExcerptBytes
const sdks = ['0.2.1-rc.5', '0.2.2-rc.1']
const wideCommand = () => SPEC.command + tok('wide') + FIXTURE.padUnit.repeat(RELAYED.kept.argumentExcerptBytes)

function drive(w, sid, text, extra = {}) {
  const id = cid('check')
  const args = { ...argsFor(SPEC.shell, text), ...extra }
  return { id, start: () => w.call('driveStart', { sessionId: sid, text: tok('turn'), script: [step(SPEC.shell, args, id), [{ text: SPEC.nextText }]] }) }
}

async function listenForWakes(t, w, p) {
  const hints = []
  p.client.setNotificationHandler(SPEC.updated, (n) => hints.push(n.params.uri))
  const subscription = await p.client.listen({ resourceSubscriptions: [K1.RESOURCE.events.uri] }, { timeout: BUDGET.rpcMs })
  t.after(() => subscription.close().catch(() => {}))
  const sid = await managed(w, p)
  assert.ok(await eventually(() => hints.includes(K1.RESOURCE.events.uri)), 'manager subscription did not receive the handover wake')
  const before = await pending(p.client)
  return { sid, hints, before }
}

async function assertQuietRejection(t, w, text, extra) {
  const p = await principal(t, w)
  const { sid, hints, before } = await listenForWakes(t, w, p)
  const r = drive(w, sid, text, extra)
  const entries = (await w.call('logs')).length
  const delegate = { name: IX.delegate.name, sessionId: sid }
  await w.call('delegateScript', { ...delegate, verdict: SPEC.delegateVerdict })
  t.after(async () => {
    await w.call('releaseHold', { sessionId: sid })
    await w.call('delegateScript', { ...delegate, verdict: null })
    await free(w, sid)
  })

  // Hold the turn's continuation so its ordinary turn-finished event cannot mask a rejection wake.
  await w.call('holdNext', { sessionId: sid })
  await r.start()
  assert.ok(await eventually(() => w.call('isHeld', { sessionId: sid })), 'first model response was not held')
  const wakeCount = hints.length
  assert.equal(await w.call('releaseHold', { sessionId: sid, holdFollowing: true }), true)
  await resultOf(w, sid, r.id)
  assert.equal((await w.call('delegateSeen')).filter((seen) => seen.sessionId === sid).length, 0, 'incomplete permission reached the delegate')
  assert.equal((await decided(w, text, sid)).outcome, IX.outcome.rejected)

  assert.ok(await eventually(() => w.call('isHeld', { sessionId: sid })), 'the session did not resume after the rejection')
  await quiet()
  assert.deepEqual(await stockFor(w, text), [], 'rejection opened a stock prompt')
  assert.deepEqual(await w.call('cards', { sessionId: sid }), [], 'rejection opened a session card')
  assert.deepEqual(await listed(p, sid), [], 'rejection left a listed approval')
  assert.deepEqual(await pending(p.client), before, 'rejection added a manager event')
  assert.deepEqual(hints.slice(wakeCount), [], 'rejection woke the manager mailbox')
  const diagnostics = (await w.call('logs')).slice(entries).filter((line) => SPEC.rejectionLog.test(line.text))
  assert.deepEqual(diagnostics.map((line) => line.type), [SPEC.info], JSON.stringify(diagnostics))

  // The session must see guidance even if DSH cannot tie the permission request to a tool result.
  assert.equal(await w.call('releaseHold', { sessionId: sid }), true)
  assert.ok(await w.call('idle', { sessionId: sid }), 'the turn did not end')
  const transcript = (await w.call('lastRequestMessages', { sessionId: sid })).map(({ text }) => text).join('\n')
  assert.match(transcript, SPEC.rejection)
  assert.match(transcript, SPEC.shorter)
  assert.match(transcript, SPEC.shorterTarget)
  assert.match(transcript, SPEC.justification)
}

for (const sdk of sdks) {
  const row = (label, fn) => test(SPEC.suite + ' [' + sdk + ']: ' + label, { timeout: BUDGET.testMs }, fn)

  row('on by default: oversized managed arguments reject before delegate with retry guidance and no approval side effects', async (t) => {
    await assertQuietRejection(t, await world(sdk, SPEC.world), wideCommand())
  })

  row('turning off automatic handoff does not turn off rejection of unavailable arguments', async (t) => {
    const w = await permissionOptionOff(sdk, S.autoEscalatePermissions)
    await assertQuietRejection(t, w, SPEC.command + tok('unavailable'), SPEC.missingCall)
  })

  row('opt-out restores manager handling and does not alter an existing offer or disable automatic handoff', async (t) => {
    const w = await legacyIncompleteWorld(sdk)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    t.after(() => free(w, sid))
    const r = await asked(w, p, sid, { tool: SPEC.shell, text: wideCommand() })
    assert.equal(r.d.argumentsStatus, ARGUMENTS_STATUS.truncated)
    assert.equal(r.d[S.autoEscalatePermissions], true)
    assert.equal((await answer(p, r, A.allow())).code, REFUSAL.argumentsIncomplete)
    assert.equal(await isListed(p, r), true)
    assert.deepEqual(await resultsOf(w, sid, r.id), [])
    const before = await listed(p, sid)
    const receipt = await w.call('settingsMutate', { ops: [{ op: 'set', path: [S.requests, S.autoRejectIncompleteArguments], value: true }] })
    assert.equal(receipt.ok, true, JSON.stringify(receipt))
    assert.deepEqual(await listed(p, sid), before)
    assert.deepEqual(await answer(p, r, A.reject()), ACCEPTED)
    assert.ok((await resultOf(w, sid, r.id)).text.includes(RELAYED.rejected(FIXTURE.otherReason)))
  })

  row('complete arguments at the excerpt limit remain eligible; a standing grant can cover a later truncated call', async (t) => {
    const w = await world(sdk, SPEC.world)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    t.after(() => free(w, sid))
    const base = SPEC.command + tok('prefix')
    await setLimit(t, w, excerptField, bytes(JSON.stringify(argsFor(SPEC.shell, base))))
    const r = await asked(w, p, sid, { tool: SPEC.shell, text: base })
    assert.equal(r.d.argumentsStatus, ARGUMENTS_STATUS.complete)
    assert.equal((await answer(p, r, A.grant(prefixGrant(base)))).accepted, true)
    assert.equal((await decided(w, base, sid)).outcome, IX.outcome.allowed)
    await assertCovered(w, p, sid, SPEC.shell, base + ' ' + tok('covered'))
  })

  row('oversized unmanaged arguments still go to the user', async (t) => {
    const w = await world(sdk, SPEC.world)
    const p = await principal(t, w)
    const sid = await session(w)
    t.after(() => free(w, sid))
    const text = wideCommand()
    const r = drive(w, sid, text)
    await r.start()
    await untilStock(w, text)
    assert.deepEqual(await resultsOf(w, sid, r.id), [])
    await userClicks(w, text, IX.outcome.allowed)
    assert.equal((await resultOf(w, sid, r.id)).text, IX.fixture.outcomeText(IX.outcome.allowed))
    assert.deepEqual((await pending(p.client)).filter((e) => e.sourceSessionId === sid), [])
  })
}
