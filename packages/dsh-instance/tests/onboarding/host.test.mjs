/**
 * Part 3 tests: Host Onboarding Service (`src/host/onboarding.js`) and Routes (`src/host/onboarding-routes.js`).
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe } from 'node:test'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { CHILD_MODEL_CONTRACT, FIXTURE, HTTP, ONBOARDING_CONTRACT, ONBOARDING_ROUTES } from './constants.mjs'
import { onboardingModule, onboardingRoutesWorld, tempDir } from './subject.mjs'

function makeFakeChildModel({
  namespacePresent = true,
  model = null,
  catalog = FIXTURE.catalog,
  failRead = false,
  setResult,
  failSet = false,
} = {}) {
  let currentModel = model
  const calls = { read: 0, set: [] }
  return {
    calls,
    get model() { return currentModel },
    set model(v) { currentModel = v },
    async read() {
      calls.read += 1
      if (failRead) throw Object.assign(new Error('channel unavailable'), { code: CHILD_MODEL_CONTRACT.errorCode })
      return { ok: true, namespacePresent, model: currentModel, catalog }
    },
    async set(selection) {
      calls.set.push(selection)
      if (failSet) throw new Error('transport error')
      if (setResult !== undefined) return setResult
      currentModel = selection
      return { ok: true, model: selection }
    },
  }
}

eachSdk((sdk) => {
  describe(`dsh-instance onboarding host service & routes (SDK ${sdk})`, () => {
    describe('createOnboarding decision table & state transitions (DT + ST)', () => {
      caseTest(sdk, 'ONBOARD-HOST-DT-01', 'main', 'DT-1: existing onboarding.json marker returns completed=true, needed=false without calling childModel.read()', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const markerPath = path.join(root, ONBOARDING_CONTRACT.file)
        fs.writeFileSync(markerPath, JSON.stringify({
          format: ONBOARDING_CONTRACT.format,
          outcome: ONBOARDING_CONTRACT.outcome.completed,
          completedAt: '2026-11-23T00:00:00.000Z',
        }))
        const cm = makeFakeChildModel({ failRead: true })
        const warnings = []
        const onboarding = createOnboarding({ childModel: () => cm, root: () => root, warn: (...a) => warnings.push(a) })

        const state = await onboarding.state()
        assert.equal(state.ok, true)
        assert.equal(state.completed, true)
        assert.equal(state.needed, false)
        assert.equal(cm.calls.read, 0, 'must not query child when marker already exists')
      })

      caseTest(sdk, 'ONBOARD-HOST-DT-02', 'main', 'DT-2: marker absent + childModel() undefined -> completed=false, needed=null, childReady=false', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const onboarding = createOnboarding({ childModel: () => undefined, root: () => root, warn: () => {} })

        const state = await onboarding.state()
        assert.deepEqual(state, {
          ok: true,
          completed: false,
          needed: null,
          childReady: false,
          model: null,
          catalog: null,
        })
        assert.equal(fs.existsSync(path.join(root, ONBOARDING_CONTRACT.file)), false)
      })

      caseTest(sdk, 'ONBOARD-HOST-DT-03', 'main', 'DT-3: marker absent + childModel.read() throws -> completed=false, needed=null, childReady=false', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const cm = makeFakeChildModel({ failRead: true })
        const warnings = []
        const onboarding = createOnboarding({ childModel: () => cm, root: () => root, warn: (...a) => warnings.push(a) })

        const state = await onboarding.state()
        assert.deepEqual(state, {
          ok: true,
          completed: false,
          needed: null,
          childReady: false,
          model: null,
          catalog: null,
        })
        assert.equal(fs.existsSync(path.join(root, ONBOARDING_CONTRACT.file)), false)
      })

      caseTest(sdk, 'ONBOARD-HOST-DT-04', 'main', 'DT-4: marker absent + namespacePresent=false -> completed=false, needed=null, childReady=false, catalog preserved', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const cm = makeFakeChildModel({ namespacePresent: false, model: null, catalog: FIXTURE.catalog })
        const onboarding = createOnboarding({ childModel: () => cm, root: () => root, warn: () => {} })

        const state = await onboarding.state()
        assert.deepEqual(state, {
          ok: true,
          completed: false,
          needed: null,
          childReady: false,
          model: null,
          catalog: FIXTURE.catalog,
        })
        assert.equal(fs.existsSync(path.join(root, ONBOARDING_CONTRACT.file)), false)
      })

      caseTest(sdk, 'ONBOARD-HOST-DT-05', 'main', 'DT-5: marker absent + namespacePresent=true + model!==null (preconfigured) -> writes preconfigured marker & completes', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const markerPath = path.join(root, ONBOARDING_CONTRACT.file)
        const cm = makeFakeChildModel({ namespacePresent: true, model: FIXTURE.modelA, catalog: FIXTURE.catalog })
        const onboarding = createOnboarding({ childModel: () => cm, root: () => root, warn: () => {} })

        const state = await onboarding.state()
        assert.equal(state.ok, true)
        assert.equal(state.completed, true)
        assert.equal(state.needed, false)
        assert.equal(state.childReady, true)
        assert.deepEqual(state.model, FIXTURE.modelA)
        assert.deepEqual(state.catalog, FIXTURE.catalog)

        // Verify marker file written on disk
        assert.equal(fs.existsSync(markerPath), true)
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
        assert.equal(marker.format, ONBOARDING_CONTRACT.format)
        assert.equal(marker.outcome, ONBOARDING_CONTRACT.outcome.preconfigured)
        assert.equal(typeof marker.completedAt, 'string')
        assert.ok(!Number.isNaN(Date.parse(marker.completedAt)), 'completedAt should be valid ISO date')

        // Subsequent state() uses marker without touching child
        const readsBefore = cm.calls.read
        const again = await onboarding.state()
        assert.equal(again.completed, true)
        assert.equal(again.needed, false)
        assert.equal(cm.calls.read, readsBefore)
      })

      caseTest(sdk, 'ONBOARD-HOST-ST-06', 'main', 'DT-6 & ST-7: active onboarding session stays needed=true after selectModel() until complete() is called', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const markerPath = path.join(root, ONBOARDING_CONTRACT.file)
        const cm = makeFakeChildModel({ namespacePresent: true, model: null, catalog: FIXTURE.catalog })
        const onboarding = createOnboarding({ childModel: () => cm, root: () => root, warn: () => {} })

        // State 6: enter active onboarding session
        const s1 = await onboarding.state()
        assert.deepEqual(s1, {
          ok: true,
          completed: false,
          needed: true,
          childReady: true,
          model: null,
          catalog: FIXTURE.catalog,
        })
        assert.equal(fs.existsSync(markerPath), false)

        // Select a model during Step 1
        const sel = await onboarding.selectModel(FIXTURE.modelB)
        assert.deepEqual(sel, { ok: true, model: FIXTURE.modelB })
        assert.equal(cm.calls.set.length, 1)

        // State 7 (CRITICAL): subsequent state() BEFORE complete() MUST NOT auto-complete as preconfigured!
        const s2 = await onboarding.state()
        assert.deepEqual(s2, {
          ok: true,
          completed: false,
          needed: true,
          childReady: true,
          model: FIXTURE.modelB,
          catalog: FIXTURE.catalog,
        })
        assert.equal(fs.existsSync(markerPath), false, 'marker MUST NOT be written before complete()')

        // Repeat state() call (e.g. after syncing models) also remains active
        const s3 = await onboarding.state()
        assert.equal(s3.completed, false)
        assert.equal(s3.needed, true)
        assert.deepEqual(s3.model, FIXTURE.modelB)
        assert.equal(fs.existsSync(markerPath), false)
      })

      for (const outcome of [ONBOARDING_CONTRACT.outcome.completed, ONBOARDING_CONTRACT.outcome.skipped]) {
        caseTest(sdk, 'ONBOARD-HOST-ST-07', outcome, `ST-8: complete("${outcome}") writes marker and flips subsequent state() to completed=true, needed=false`, async (t) => {
          const { createOnboarding } = await onboardingModule(sdk)
          const root = tempDir(t)
          const markerPath = path.join(root, ONBOARDING_CONTRACT.file)
          const cm = makeFakeChildModel({ namespacePresent: true, model: null })
          const onboarding = createOnboarding({ childModel: () => cm, root: () => root, warn: () => {} })

          await onboarding.state()
          const res = await onboarding.complete(outcome)
          assert.deepEqual(res, { ok: true, completed: true, outcome })

          assert.equal(fs.existsSync(markerPath), true)
          const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
          assert.equal(marker.format, ONBOARDING_CONTRACT.format)
          assert.equal(marker.outcome, outcome)
          assert.equal(typeof marker.completedAt, 'string')
          assert.ok(!Number.isNaN(Date.parse(marker.completedAt)))

          const after = await onboarding.state()
          assert.equal(after.ok, true)
          assert.equal(after.completed, true)
          assert.equal(after.needed, false)
        })
      }

      caseTest(sdk, 'ONBOARD-HOST-ST-08', 'main', 'ST-9: deleting onboarding.json resets onboarding on a fresh createOnboarding instance', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const markerPath = path.join(root, ONBOARDING_CONTRACT.file)
        const cm = makeFakeChildModel({ namespacePresent: true, model: null })

        const first = createOnboarding({ childModel: () => cm, root: () => root, warn: () => {} })
        await first.complete(ONBOARDING_CONTRACT.outcome.skipped)
        assert.equal((await first.state()).completed, true)

        // Simulate uninstall removing runtime tree / onboarding.json
        fs.rmSync(markerPath, { force: true })

        const second = createOnboarding({ childModel: () => cm, root: () => root, warn: () => {} })
        const resetState = await second.state()
        assert.equal(resetState.ok, true)
        assert.equal(resetState.completed, false)
        assert.equal(resetState.needed, true)
        assert.equal(resetState.childReady, true)
      })

      caseTest(sdk, 'ONBOARD-HOST-EP-09', 'main', 'EP: selectModel validates selection, checks child readiness, and delegates when valid + ready', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        let currentChild = undefined
        const onboarding = createOnboarding({ childModel: () => currentChild, root: () => root, warn: () => {} })

        // Invalid selection -> invalid-model (even when child is not ready)
        for (const bad of [null, undefined, {}, { provider: '', model: 'm' }, { provider: 'p', model: '  ' }]) {
          assert.deepEqual(await onboarding.selectModel(bad), { ok: false, code: CHILD_MODEL_CONTRACT.code.invalidModel })
        }

        // Valid selection + child undefined -> not-ready
        assert.deepEqual(await onboarding.selectModel(FIXTURE.modelA), { ok: false, code: CHILD_MODEL_CONTRACT.code.notReady })

        // Valid selection + child ready -> delegates to childModel().set(...)
        currentChild = makeFakeChildModel({ namespacePresent: true })
        assert.deepEqual(await onboarding.selectModel(FIXTURE.modelA), { ok: true, model: FIXTURE.modelA })
        assert.equal(currentChild.calls.set.length, 1)

        // Propagates write-failed from child
        currentChild = makeFakeChildModel({ setResult: { ok: false, code: CHILD_MODEL_CONTRACT.code.writeFailed } })
        assert.deepEqual(await onboarding.selectModel(FIXTURE.modelA), { ok: false, code: CHILD_MODEL_CONTRACT.code.writeFailed })
      })

      caseTest(sdk, 'ONBOARD-HOST-EP-10', 'main', 'EP: complete rejects invalid outcomes with invalid-request without writing marker; undefined defaults to completed', async (t) => {
        const { createOnboarding } = await onboardingModule(sdk)
        const root = tempDir(t)
        const markerPath = path.join(root, ONBOARDING_CONTRACT.file)
        const onboarding = createOnboarding({ childModel: () => undefined, root: () => root, warn: () => {} })

        for (const bad of ['preconfigured', '', null, 'done', 123]) {
          const res = await onboarding.complete(bad)
          assert.deepEqual(res, { ok: false, code: 'invalid-request' }, `outcome ${JSON.stringify(bad)} must be refused`)
        }
        assert.equal(fs.existsSync(markerPath), false)

        // Omitted (undefined) defaults to 'completed'
        const def = await onboarding.complete(undefined)
        assert.deepEqual(def, { ok: true, completed: true, outcome: ONBOARDING_CONTRACT.outcome.completed })
        assert.equal(fs.existsSync(markerPath), true)
      })
    })

    describe('registerOnboardingRoutes & ONBOARDING_ROUTE (EP + BVA + DT)', () => {
      caseTest(sdk, 'ONBOARD-HOST-EP-11', 'main', 'EP: exports exact ONBOARDING_ROUTE paths and registers all three routes', async (t) => {
        const stub = {
          state: async () => ({ ok: true, completed: false, needed: true, childReady: true, model: null, catalog: null }),
          selectModel: async (m) => ({ ok: true, model: m }),
          complete: async (o) => ({ ok: true, completed: true, outcome: o }),
        }
        const w = await onboardingRoutesWorld(sdk, stub)
        assert.equal(w.ONBOARDING_ROUTE.state, ONBOARDING_ROUTES.state)
        assert.equal(w.ONBOARDING_ROUTE.model, ONBOARDING_ROUTES.model)
        assert.equal(w.ONBOARDING_ROUTE.complete, ONBOARDING_ROUTES.complete)
        const paths = w.routes.map((r) => r.path).sort()
        assert.deepEqual(paths, Object.values(ONBOARDING_ROUTES).sort())
      })

      caseTest(sdk, 'ONBOARD-HOST-DT-12', 'main', 'DT security: same-origin fence returns HTTP 403 { ok: false, code: "operation-failed" } on cross-origin, disallowed sec-fetch-site, or missing requestRejection', async (t) => {
        let called = 0
        const stub = {
          state: async () => { called += 1; return { ok: true } },
          selectModel: async () => { called += 1; return { ok: true } },
          complete: async () => { called += 1; return { ok: true } },
        }
        const w = await onboardingRoutesWorld(sdk, stub)

        const blockedHeaders = [
          { label: 'sec-fetch-site cross-site', secFetchSite: 'cross-site', origin: HTTP.origin },
          { label: 'sec-fetch-site same-site', secFetchSite: 'same-site', origin: HTTP.origin },
          { label: 'foreign origin header', secFetchSite: 'same-origin', origin: HTTP.foreignOrigin },
        ]

        for (const hdr of blockedHeaders) {
          const rState = await w.call('GET', ONBOARDING_ROUTES.state, hdr)
          assert.equal(rState.status, HTTP.forbidden, `GET /state blocked for ${hdr.label}`)
          assert.deepEqual(rState.json, { ok: false, code: HTTP.operationFailed })

          const rModel = await w.call('POST', ONBOARDING_ROUTES.model, { ...hdr, body: FIXTURE.modelA })
          assert.equal(rModel.status, HTTP.forbidden, `POST /model blocked for ${hdr.label}`)
          assert.deepEqual(rModel.json, { ok: false, code: HTTP.operationFailed })

          const rComplete = await w.call('POST', ONBOARDING_ROUTES.complete, { ...hdr, body: { outcome: 'completed' } })
          assert.equal(rComplete.status, HTTP.forbidden, `POST /complete blocked for ${hdr.label}`)
          assert.deepEqual(rComplete.json, { ok: false, code: HTTP.operationFailed })
        }

        // Missing ctx.connection.requestRejection fails closed with 403 even on same-origin headers
        const noFence = await onboardingRoutesWorld(sdk, stub, { withRequestRejection: false })
        for (const [method, route, body] of [
          ['GET', ONBOARDING_ROUTES.state, undefined],
          ['POST', ONBOARDING_ROUTES.model, FIXTURE.modelA],
          ['POST', ONBOARDING_ROUTES.complete, { outcome: 'completed' }],
        ]) {
          const res = await noFence.call(method, route, { body })
          assert.equal(res.status, HTTP.forbidden, `${method} ${route} must fail closed when requestRejection is absent`)
          assert.deepEqual(res.json, { ok: false, code: HTTP.operationFailed })
        }

        assert.equal(called, 0, 'blocked requests must never reach the onboarding service')

        // Allowed sec-fetch-site: 'none' passes the fence
        const rNone = await w.call('GET', ONBOARDING_ROUTES.state, { secFetchSite: 'none', origin: HTTP.origin })
        assert.equal(rNone.status, HTTP.ok)
        assert.equal(called, 1)
      })

      caseTest(sdk, 'ONBOARD-HOST-BVA-13', 'main', 'BVA body size: exact 16384 bytes accepted; 16385 bytes (1 over limit) rejected with HTTP 400', async (t) => {
        const stub = {
          state: async () => ({ ok: true }),
          selectModel: async (m) => ({ ok: true, model: m }),
          complete: async (o) => ({ ok: true, completed: true, outcome: o }),
        }
        const w = await onboardingRoutesWorld(sdk, stub)

        const padJsonToBytes = (obj, targetBytes) => {
          const base = JSON.stringify(obj)
          const pad = targetBytes - Buffer.byteLength(base, 'utf8')
          assert.ok(pad >= 0)
          return base + ' '.repeat(pad)
        }

        // Exact boundary: 16384 bytes -> HTTP 200
        const exactModel = padJsonToBytes(FIXTURE.modelA, HTTP.maxBodyBytes)
        assert.equal(Buffer.byteLength(exactModel, 'utf8'), HTTP.maxBodyBytes)
        const okModel = await w.call('POST', ONBOARDING_ROUTES.model, { body: exactModel })
        assert.equal(okModel.status, HTTP.ok)
        assert.equal(okModel.json.ok, true)

        const exactComplete = padJsonToBytes({ outcome: 'completed' }, HTTP.maxBodyBytes)
        assert.equal(Buffer.byteLength(exactComplete, 'utf8'), HTTP.maxBodyBytes)
        const okComplete = await w.call('POST', ONBOARDING_ROUTES.complete, { body: exactComplete })
        assert.equal(okComplete.status, HTTP.ok)
        assert.equal(okComplete.json.ok, true)

        // 1 byte over boundary: 16385 bytes -> HTTP 400
        const overModel = padJsonToBytes(FIXTURE.modelA, HTTP.maxBodyBytes + 1)
        assert.equal(Buffer.byteLength(overModel, 'utf8'), HTTP.maxBodyBytes + 1)
        const badModel = await w.call('POST', ONBOARDING_ROUTES.model, { body: overModel })
        assert.equal(badModel.status, HTTP.badRequest)
        assert.equal(badModel.json.ok, false)
        assert.equal(typeof badModel.json.code, 'string')

        const overComplete = padJsonToBytes({ outcome: 'skipped' }, HTTP.maxBodyBytes + 1)
        const badComplete = await w.call('POST', ONBOARDING_ROUTES.complete, { body: overComplete })
        assert.equal(badComplete.status, HTTP.badRequest)
        assert.equal(badComplete.json.ok, false)
        assert.equal(typeof badComplete.json.code, 'string')
      })

      caseTest(sdk, 'ONBOARD-HOST-EP-14', 'main', 'EP malformed JSON, non-object bodies, unknown extra keys, and invalid values -> HTTP 400', async (t) => {
        let called = 0
        const stub = {
          state: async () => ({ ok: true }),
          selectModel: async () => { called += 1; return { ok: true } },
          complete: async () => { called += 1; return { ok: true } },
        }
        const w = await onboardingRoutesWorld(sdk, stub)

        const badModelBodies = [
          '{not-json',
          '[]',
          'null',
          '42',
          '"string"',
          JSON.stringify({}),
          JSON.stringify({ provider: '', model: 'gpt-5' }),
          JSON.stringify({ provider: 'openai', model: '   ' }),
          JSON.stringify({ provider: 'openai', model: 'gpt-5', unknown: true }),
        ]
        for (const raw of badModelBodies) {
          const res = await w.call('POST', ONBOARDING_ROUTES.model, { body: raw })
          assert.equal(res.status, HTTP.badRequest, `POST /model should return 400 for ${raw}`)
          assert.equal(res.json?.ok, false)
          assert.equal(typeof res.json?.code, 'string')
        }

        const badCompleteBodies = [
          '{not-json',
          '[]',
          'null',
          JSON.stringify({ outcome: '' }),
          JSON.stringify({ outcome: null }),
          JSON.stringify({ outcome: 'preconfigured' }),
          JSON.stringify({ outcome: 'invalid' }),
          JSON.stringify({ outcome: 'completed', extra: 1 }),
        ]
        for (const raw of badCompleteBodies) {
          const res = await w.call('POST', ONBOARDING_ROUTES.complete, { body: raw })
          assert.equal(res.status, HTTP.badRequest, `POST /complete should return 400 for ${raw}`)
          assert.equal(res.json?.ok, false)
          assert.equal(typeof res.json?.code, 'string')
        }
        assert.equal(called, 0, 'invalid bodies must be rejected before calling onboarding service')
      })

      caseTest(sdk, 'ONBOARD-HOST-DT-15', 'main', 'DT valid HTTP 200 flows for GET /state, POST /model, and POST /complete', async (t) => {
        const root = tempDir(t)
        const { createOnboarding } = await onboardingModule(sdk)
        const cm = makeFakeChildModel({ namespacePresent: true, model: null, catalog: FIXTURE.catalog })
        const onboarding = createOnboarding({ childModel: () => cm, root: () => root, warn: () => {} })
        const w = await onboardingRoutesWorld(sdk, onboarding)

        // GET /state
        const r1 = await w.call('GET', ONBOARDING_ROUTES.state)
        assert.equal(r1.status, HTTP.ok)
        assert.equal(r1.json.ok, true)
        assert.equal(r1.json.needed, true)
        assert.equal(r1.json.completed, false)

        // POST /model (with reasoningEffort)
        const r2 = await w.call('POST', ONBOARDING_ROUTES.model, { body: FIXTURE.modelB })
        assert.equal(r2.status, HTTP.ok)
        assert.deepEqual(r2.json, { ok: true, model: FIXTURE.modelB })

        // GET /state still needed=true before complete
        const r3 = await w.call('GET', ONBOARDING_ROUTES.state)
        assert.equal(r3.status, HTTP.ok)
        assert.equal(r3.json.needed, true)
        assert.deepEqual(r3.json.model, FIXTURE.modelB)

        // POST /complete
        const r4 = await w.call('POST', ONBOARDING_ROUTES.complete, { body: { outcome: 'completed' } })
        assert.equal(r4.status, HTTP.ok)
        assert.deepEqual(r4.json, { ok: true, completed: true, outcome: 'completed' })

        // POST /complete with empty object defaults outcome to 'completed'
        const rDefault = await w.call('POST', ONBOARDING_ROUTES.complete, { body: {} })
        assert.equal(rDefault.status, HTTP.ok)
        assert.deepEqual(rDefault.json, { ok: true, completed: true, outcome: 'completed' })

        // GET /state now completed=true, needed=false
        const r5 = await w.call('GET', ONBOARDING_ROUTES.state)
        assert.equal(r5.status, HTTP.ok)
        assert.equal(r5.json.completed, true)
        assert.equal(r5.json.needed, false)
      })
    })
  })
})
