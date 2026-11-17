/**
 * R-FIX-CORE black-box rows for the ask cards (review finding F12; acceptance criteria in the
 * task's requirements, .rfix-requirements.md): if storing an ask card for an event fails, that
 * event is not passed on (not acked, offered again on the next poll); other events of the same
 * page continue; the ask-cards poll listener resolves with the ids of the failed events.
 *
 * Level: unit, F-ASKCARD's world (world.mjs) with a card table whose writes can be failed
 * (`tableFault`). The main pipeline's half ("not passed to event intake") lives inside core's main
 * row and has no export; these rows check the listener's contract it relies on, and that the
 * offer polled again is stored and fileable (so nothing is lost).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { ASK_TOOL, CODE, EVENT_TYPE } from './constants.mjs'
import { askEvent, offerOf, worldFor } from './world.mjs'

/**
 * A fault that fails the card writes naming one of `approvalIds` while `on.active`: a write whose
 * arguments hold the id as a whole JSON string value or key (`"fbtest-ask-1"`), so `fbtest-ask-1`
 * never matches `fbtest-ask-10`.
 */
const failingFor = (on, approvalIds) => ({ args }) => on.active && approvalIds.some((id) => JSON.stringify(args).includes(JSON.stringify(id)))
const permission = () => askEvent({ type: EVENT_TYPE.permission })
const flat = (results) => results.flat().filter((v) => v !== undefined)
/** The refusal code of a raw `ask_user` result (structured or JSON text). */
const codeOf = (result) => result?.code ?? result?.error?.code ?? JSON.stringify(result ?? null).match(/"code"\s*:\s*"([^"]+)"/)?.[1]

export function registerRfixAskCases(sdk) {
  caseTest(sdk, 'RFIX-F12-DT-01', 'rule 1 (one of two fails)', 'a page of two offers, the first card\'s write fails → the listener resolves with [the first event\'s id]; the second card is stored', async (t) => {
    const on = { active: true }
    const a = permission()
    const b = permission()
    const w = await worldFor(t, sdk, { tableFault: failingFor(on, [a.payload.approvalId]) })
    const results = await w.poll(a, b)
    assert.deepEqual(flat(results), [a.eventId], 'the listener\'s failed ids')
    // A stored offer is fileable; an unfiled record is not listed as a card until it is filed.
    on.active = false
    assert.notEqual(codeOf(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(b) })), CODE.unknownOffer, 'the other offer of the page was not stored')
    assert.ok(w.card(b.payload.approvalId), 'no card after filing the other offer')
    assert.equal(codeOf(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(a) })), CODE.unknownOffer, 'the offer whose write failed was stored')
  })
  caseTest(sdk, 'RFIX-F12-DT-01', 'rule 2 (all stored)', 'a page whose cards are all stored → the listener resolves with no ids', async (t) => {
    const w = await worldFor(t, sdk, { tableFault: () => false })
    const results = await w.poll(permission(), permission())
    assert.deepEqual(flat(results), [])
  })
  caseTest(sdk, 'RFIX-F12-DT-01', 'rule 3 (all fail)', 'every card write of a page fails → the listener resolves with every event id, in page order', async (t) => {
    const a = permission()
    const b = permission()
    const w = await worldFor(t, sdk, { tableFault: failingFor({ active: true }, [a.payload.approvalId, b.payload.approvalId]) })
    assert.deepEqual(flat(await w.poll(a, b)), [a.eventId, b.eventId])
  })
  caseTest(sdk, 'RFIX-F12-DT-01', 'rule 4 (no card-able event)', 'a page with no offer (a settlement only) → no failed ids', async (t) => {
    const w = await worldFor(t, sdk, { tableFault: () => true })
    const results = await w.poll()
    assert.deepEqual(flat(results), [])
  })
  caseTest(sdk, 'RFIX-F12-ST-01', 1, 'the write fails, the same offer is polled again after the store recovers → stored, and ask_user files it (no unknown-offer)', async (t) => {
    const on = { active: true }
    const a = permission()
    const w = await worldFor(t, sdk, { tableFault: failingFor(on, [a.payload.approvalId]) })
    assert.deepEqual(flat(await w.poll(a)), [a.eventId])
    on.active = false
    assert.deepEqual(flat(await w.poll(a)), [], 'the replayed offer failed again')
    const filed = await w.tool.execute({ [ASK_TOOL.arg]: offerOf(a) })
    assert.notEqual(codeOf(filed), CODE.unknownOffer, 'the offer is unknown after its replay: ' + JSON.stringify(filed))
    assert.ok(w.card(a.payload.approvalId), 'no card after the replay')
  })
}
