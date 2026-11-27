/**
 * DISCOVERY-TOOLS system rows on a real DSH (worker.mjs, both SDKs). Requirements (the decision,
 * not src/domain/discovery.js): models_list lists DSH's live catalog (sessionController
 * .modelCatalog()) as {model: '<group.id>/<model.id>', provider, providerName, name,
 * reasoningEfforts, defaultReasoningEffort?}, the default as {model, reasoningEffort?}, failed
 * providers by id and name only; every listed model (and any of its efforts) is accepted by
 * session_start, an effort outside the model's list is invalid-decision. workspaces_list lists every
 * registry workspace {workspaceId, title, canonical path, available} in registry order; a gone
 * directory is available: false and session_start refuses its id with unknown-session. A session
 * started with a listed workspaceId is placed in that workspace, and sessions_list reports that
 * workspaceId (null for an unregistered directory), its title and a boolean running.
 *
 * Oracles: DSH's own catalog and registry, read by a test-only worker extension
 * (discovery-extension.mjs), and the fake provider's models (test/support FAKE). Techniques: Use
 * Case (discover then start), Equivalence Partitioning (listed vs unlisted effort; registered vs
 * unregistered folder; existing vs removed directory). Rows are few: each boots no extra DSH beyond
 * this file's one scenario per SDK.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { BUDGET, ENV, K1 } from 'dsh-connector-test-helpers/connector-world/constants'
import { DISCOVERY as D } from './discovery-constants.mjs'
import { okCall, paired, refusedCall } from 'dsh-connector-test-helpers/connector-world/steps'
import { scenario } from 'dsh-connector-test-helpers/connector-world/world'

const { TOOL, REFUSAL } = K1
let counter = 0
const fresh = (base) => `${base}-${process.pid}-${++counter}`
const row = (sdk, part, title, fn) => test(caseName(sdk, D.id, part, title), { timeout: BUDGET.testMs }, fn)
const world = (sdk) => scenario(sdk, D.scenario, { env: { [ENV.extension]: D.extension } })
const startArgs = (folder, extra = {}) => ({ folder, title: D.title, message: D.message, attachments: [], ...extra })
const isDirectory = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

/** models_list's expected answer, derived from DSH's live catalog by the requirement's mapping. */
function expectedModels(catalog) {
  return {
    ok: true,
    models: catalog.groups.flatMap((group) => group.models.map((m) => ({
      model: `${group.id}/${m.id}`, provider: group.id, providerName: group.name, name: m.name,
      reasoningEfforts: (m.reasoning?.efforts ?? []).map((e) => e.id),
      ...(m.reasoning?.defaultEffort === undefined ? {} : { defaultReasoningEffort: m.reasoning.defaultEffort }),
    }))),
    defaultModel: { model: `${catalog.default.provider}/${catalog.default.model}`, ...(catalog.default.reasoningEffort === undefined ? {} : { reasoningEffort: catalog.default.reasoningEffort }) },
    unavailableProviders: catalog.failures.map((f) => ({ provider: f.id, providerName: f.name })),
  }
}
/** A new session's placement: its persisted cwd and the workspace groups holding it. */
async function placementOf(w, sessionId) {
  const state = await w.call('placementState')
  return { cwd: state.sessions.find((s) => s.id === sessionId)?.cwd, groups: state.groups.filter((g) => g.members.includes(sessionId)).map((g) => g.id) }
}
const listedRow = async (client, sessionId) => (await okCall(client, TOOL.sessionsList, { limit: D.listLimit })).sessions.find((s) => s.sessionId === sessionId)

export function registerDiscoveryWireCases(sdk) {
  row(sdk, 'models_list (UC)', 'lists DSH\'s live catalog by the requirement\'s mapping, including both fake models with their exact model strings and the default; no failure message', async (t) => {
    const w = await world(sdk)
    const { client } = await paired(t, w)
    const catalog = await w.call('discoveryCatalog')
    const s = await okCall(client, TOOL.modelsList, {})
    assert.deepEqual(s, expectedModels(catalog))
    for (const { model } of D.models) assert.ok(s.models.some((m) => m.model === model), model + ' is not listed')
    assert.equal(s.defaultModel.model, D.defaultModel)
    for (const f of catalog.failures) assert.ok(!JSON.stringify(s).includes(f.message), 'a provider failure message was returned')
  })
  row(sdk, 'models_list → session_start (EP)', 'each listed fake model starts a session whose requests use it; any listed effort is accepted; an unlisted effort → invalid-decision, nothing created', async (t) => {
    const w = await world(sdk)
    const { client } = await paired(t, w)
    const listed = (await okCall(client, TOOL.modelsList, {})).models
    for (const { model, id } of D.models) {
      const m = listed.find((x) => x.model === model)
      assert.ok(m, model + ' is not listed')
      for (const effort of [undefined, ...m.reasoningEfforts]) {
        const folder = await w.call('folder', { name: fresh(D.folder) })
        const s = await okCall(client, TOOL.sessionStart, startArgs(folder, { model: m.model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }))
        await w.call('waitIdle', { sessionId: s.sessionId })
        const requests = await w.call('requests', { sessionId: s.sessionId })
        assert.ok(requests.length > 0, 'the first message started no turn')
        assert.deepEqual([...new Set(requests.map((r) => r.model))], [id], model)
      }
      assert.equal(m.reasoningEfforts.includes(D.unlistedEffort), false, 'harness: the fixture effort is listed')
      const folder = await w.call('folder', { name: fresh(D.folder) })
      const before = await w.call('placementState')
      await refusedCall(client, TOOL.sessionStart, startArgs(folder, { model: m.model, reasoningEffort: D.unlistedEffort }), REFUSAL.invalidDecision)
      assert.deepEqual(await w.call('placementState'), before, 'a refused start created a session or sent a turn')
    }
  })
  row(sdk, 'workspaces_list (UC/EP)', 'lists every registry workspace in registry order with id, title, canonical path, available; duplicate titles both listed; a removed fixture directory → available false and session_start refuses its id', async (t) => {
    const w = await world(sdk)
    const { client } = await paired(t, w)
    const first = await w.call('registerWorkspace', { name: fresh(D.folder), title: D.workspaceTitle })
    const second = await w.call('registerWorkspace', { name: fresh(D.folder), title: D.workspaceTitle })
    const gone = await w.call('registerWorkspace', { name: fresh(D.folder), title: fresh(D.workspaceTitle) })
    // Remove only this disposable, empty fixture directory the case just made under the DSH home.
    assert.equal(path.dirname(gone.path), fs.realpathSync(path.join(w.home, D.workDir)))
    fs.rmdirSync(gone.path)
    const registry = await w.call('discoveryRegistry')
    const s = await okCall(client, TOOL.workspacesList, {})
    assert.deepEqual(s, { ok: true, workspaces: registry.map((r) => ({ workspaceId: r.id, title: r.title, path: r.path, available: isDirectory(r.path) })) })
    const byId = new Map(s.workspaces.map((x) => [x.workspaceId, x]))
    for (const ws of [first, second]) assert.deepEqual(byId.get(ws.id), { workspaceId: ws.id, title: D.workspaceTitle, path: fs.realpathSync(ws.path), available: true })
    assert.notEqual(first.id, second.id)
    assert.equal(byId.get(gone.id)?.available, false)
    for (const x of s.workspaces) assert.ok(path.isAbsolute(x.path), x.path)
    const before = await w.call('placementState')
    await refusedCall(client, TOOL.sessionStart, startArgs(gone.id), REFUSAL.unknownSession)
    assert.deepEqual(await w.call('placementState'), before)
  })
  row(sdk, 'workspaceId → session_start → sessions_list (UC/EP)', 'a listed workspaceId places the session in that workspace and sessions_list reports it; an unregistered directory reports workspaceId null', async (t) => {
    const w = await world(sdk)
    const { client } = await paired(t, w)
    const ws = await w.call('registerWorkspace', { name: fresh(D.folder), title: fresh(D.workspaceTitle) })
    const listed = (await okCall(client, TOOL.workspacesList, {})).workspaces.find((x) => x.workspaceId === ws.id)
    assert.ok(listed?.available, 'the new workspace is not listed as available')
    const loose = await w.call('folder', { name: fresh(D.folder) })
    for (const [folder, workspaceId, cwd] of [[listed.workspaceId, listed.workspaceId, listed.path], [loose, null, loose]]) {
      const title = fresh(D.title)
      const s = await okCall(client, TOOL.sessionStart, { ...startArgs(folder), title })
      await w.call('waitIdle', { sessionId: s.sessionId })
      const placed = await placementOf(w, s.sessionId)
      assert.equal(fs.realpathSync(placed.cwd), fs.realpathSync(cwd), 'wrong working directory')
      assert.deepEqual(placed.groups, workspaceId === null ? [] : [workspaceId], 'wrong workspace membership')
      const r = await listedRow(client, s.sessionId)
      assert.ok(r, 'sessions_list does not list the managed session')
      assert.deepEqual([r.workspaceId, r.title, typeof r.running, typeof r.pendingInteraction], [workspaceId, title, 'boolean', 'boolean'])
    }
  })
}
