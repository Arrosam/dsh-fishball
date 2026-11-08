/**
 * session.start with a model at the official publication / GUI boundaries (DESIGN §5d "Target only":
 * a session already model-selected by another GUI/plugin is refused rather than reported as configured;
 * after the first request header DSH owns routing, including later GUI switches), over the bridge
 * (H-STUB). No production source inspected.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | SSM-24 | ST (GUI selects between create publication and return) | refused; the existing GUI selection is not overwritten; only that GUI selection saved DSH's default; no first message |
 * | SSM-25 | ST (successful start → first header → GUI switches) | later requests follow the GUI choice, not the initial selection |
 * | SSM-27 | ST (GUI changes while the first assembly waits) | the first request stays on the start's selection; the following ones adopt the GUI choice |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { T, turn } from './support/expect.mjs'
import { START_MODEL as C, route } from './support/start-session-model.mjs'
import { armedStart, assertModelStart, assertSelectionRefused, responseOf, useModelHost } from './support/instance-stub-start.mjs'
import { until } from './support/util.mjs'

const chosen = { provider: C.provider, model: C.models.fast, reasoningEffort: C.effort.wrongModel }
const startSelection = { model: route(C.models.analysis), reasoningEffort: C.effort.last }
const routeOf = (r) => ({ provider: r.provider, model: r.model, reasoningEffort: r.reasoningEffort })
/** The target's requests the fixture saw after event index `from`. */
const requestsAfter = async (w, sessionId, from) => (await w.events()).slice(from).filter((e) => e.type === 'request' && e.sessionId === sessionId && !e.purpose)

describe('session.start with a model: existing and later GUI-selection authority', () => {
  const w = useModelHost('g-ssm-gui-races')

  it('SSM-24 ST a GUI selection between create publication and return: refused, not overwritten, no message', T, async () => {
    const answer = await armedStart(w, { ...startSelection, notifyWhenFinished: true }, { externalSelection: chosen })
    const sid = await assertSelectionRefused(w, answer)
    assert.equal(answer.events.some((e) => e.type === 'select' && e.selection?.model === C.models.analysis), false, 'the GUI pending selection is not overwritten')
    const saves = answer.events.filter((e) => e.type === 'default-save')
    assert.equal(saves.length, 1, "only the independent GUI selection saves DSH's default")
    assert.deepEqual(saves[0].selection, chosen)
    assert.ok(answer.events.some((e) => e.type === 'external-selection-end' && e.sessionId === sid))
  })

  it('SSM-25 ST successful start → first header → GUI switches: later requests follow the GUI', T, async () => {
    await w.arm()
    try {
      const json = await assertModelStart(w, await w.start(startSelection), { model: C.models.analysis, effort: C.effort.last })
      assert.deepEqual((await w.probe('guiSelection', { sessionId: json.sessionId, ...chosen })).selected, chosen)
      const from = (await w.events()).length
      await turn(w.host, json.sessionId)
      const later = await requestsAfter(w, json.sessionId, from)
      assert.ok(later.length)
      for (const r of later) assert.deepEqual(routeOf(r), chosen)
    } finally { await w.disarm() }
  })

  it('SSM-27 ST the GUI changes while the first assembly waits: the first request stays, the next adopts the GUI', T, async () => {
    await w.arm({ holdAssembly: true })
    try {
      const sid = responseOf(await w.start(startSelection)).sessionId
      assert.equal(await until(() => w.probe('heldAssembly'), C.fixture.timeoutMs), sid, 'the first assembly is suspended')
      assert.deepEqual((await w.probe('guiSelection', { sessionId: sid, ...chosen })).selected, chosen)
      assert.equal(await w.probe('releaseAssembly'), true)
      assert.ok(await w.wait(sid))
      const [first] = await w.requests(sid)
      assert.deepEqual(routeOf(first), { provider: C.provider, model: C.models.analysis, reasoningEffort: C.effort.last })
      const from = (await w.events()).length
      await turn(w.host, sid)
      const later = await requestsAfter(w, sid, from)
      assert.ok(later.length)
      for (const r of later) assert.deepEqual(routeOf(r), chosen)
    } finally { await w.probe('releaseAssembly'); await w.disarm() }
  })
})
