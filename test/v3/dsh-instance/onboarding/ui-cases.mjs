/**
 * Part 4 tests: Multi-Step, Multi-Page Onboarding UI (`client.onboarding.js` via `client.js`).
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import {
  BILLION_CONTEXT,
  CHILD_MODEL_CONTRACT,
  FIXTURE,
  INSTANCE_ROUTES,
  LANGS,
  MEMORY_PLUGINS,
  MODEL_FIXTURE,
  MODEL_PICKER_COPY,
  ONBOARDING_CONTRACT,
  ONBOARDING_ROUTES,
  TERMINAL_INSTANCE_STATES,
  UI_ATTR,
  UI_STEP,
  WATCHDOG_NS,
  WATCHDOG_STATE,
} from './constants.mjs'
import { openOnboardingPage } from './subject.mjs'

async function waitForStep(page, step) {
  const ok = await page.until(() => page.byAttr(UI_ATTR.step, step).length === 1)
  assert.ok(ok, `expected onboarding step "${step}" to be rendered; active tree text: ${page.text()}`)
}

async function advanceToStep(page, targetStep) {
  const order = [UI_STEP.fishballModel, UI_STEP.watchdog, UI_STEP.memory, UI_STEP.welcome]
  const targetIdx = order.indexOf(targetStep)
  assert.ok(targetIdx >= 0)
  await waitForStep(page, order[0])
  for (let i = 0; i < targetIdx; i += 1) {
    const [nextBtn] = page.byAttr(UI_ATTR.next)
    assert.ok(nextBtn, `missing next button on step ${order[i]}`)
    await page.press(nextBtn)
    await waitForStep(page, order[i + 1])
  }
}

const modelKey = ({ provider, model }) => JSON.stringify([provider, model])
const KEY_PLAIN = modelKey(MODEL_FIXTURE.plain)
const KEY_REASONER = modelKey(MODEL_FIXTURE.reasoner)
const KEY_GPT5 = modelKey(MODEL_FIXTURE.gpt5)
const KEY_UNLISTED = modelKey(MODEL_FIXTURE.unlisted)

const modelSelectOf = (page) => page.byAttr(UI_ATTR.modelSelect, 'true')[0]
const effortSelectOf = (page) => page.byAttr(UI_ATTR.effortSelect, 'true')[0]
const optionsOf = (selectNode) => findAll(selectNode.children, (n) => n.tag === 'option')
const optgroupsOf = (selectNode) => findAll(selectNode.children, (n) => n.tag === 'optgroup')
const labelFor = (page, id) => page.find((n) => n.tag === 'label' && (n.props.htmlFor === id || n.props.for === id))[0]

export function registerUiOnboardingCases(sdk) {
  describe(`dsh-instance onboarding UI wizard (SDK ${sdk})`, () => {
    describe('Gate passthrough & fail-open decision table (DT)', () => {
      test('DT-1: completed=true, needed=false renders renderFrame() immediately without showing wizard', async (t) => {
        const page = await openOnboardingPage(t, sdk, {
          onboardingState: { ok: true, completed: true, needed: false, childReady: true, model: FIXTURE.modelA, catalog: FIXTURE.catalog },
        })
        await page.mountGate()

        assert.ok(await page.until(() => page.hasFrame()), 'expected renderFrame() to mount immediately')
        assert.equal(page.byAttr(UI_ATTR.root, 'active').length, 0, 'wizard must not appear when already completed')
        assert.deepEqual(page.world.errors, [])
      })

      for (const state of TERMINAL_INSTANCE_STATES) {
        test(`DT-2: needed=null with terminal instance status "${state}" yields to renderFrame() immediately`, async (t) => {
          const page = await openOnboardingPage(t, sdk, {
            onboardingState: { ok: true, completed: false, needed: null, childReady: false, model: null, catalog: null },
            instanceStatus: { state, code: null, detail: null, notice: null, busy: false },
          })
          await page.mountGate()

          assert.ok(await page.until(() => page.hasFrame()), `must yield to renderFrame() when instance is ${state}`)
          assert.equal(page.byAttr(UI_ATTR.root, 'active').length, 0)
          assert.deepEqual(page.world.errors, [])
        })
      }

      test('DT-3: network failure on onboarding/state fails open and yields to renderFrame()', async (t) => {
        const page = await openOnboardingPage(t, sdk, { failState: true })
        await page.mountGate()

        assert.ok(await page.until(() => page.hasFrame()), 'must fail open to renderFrame() on network error')
        assert.equal(page.byAttr(UI_ATTR.root, 'active').length, 0)
      })

      test('DT-4: HTTP 500 / non-JSON on onboarding/state fails open and yields to renderFrame()', async (t) => {
        const page = await openOnboardingPage(t, sdk, {
          respond: (method, pathname) => (pathname === ONBOARDING_ROUTES.state && method === 'GET'
            ? new Response('internal error', { status: 500 })
            : undefined),
        })
        await page.mountGate()

        assert.ok(await page.until(() => page.hasFrame()), 'must fail open to renderFrame() on unreadable state response')
        assert.equal(page.byAttr(UI_ATTR.root, 'active').length, 0)
      })
    })

    describe('Step 1: Fishball model sync & two-dropdown model/effort picker (EP + BVA + DT + ST)', () => {
      const deferred = () => {
        let resolve
        const promise = new Promise((r) => { resolve = r })
        return { promise, resolve }
      }

      test('ST-1: sync button posts models/check -> models/add for missing ids -> refreshes onboarding/state with newly synced models', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)
        assert.equal(page.byAttr(UI_ATTR.root, 'active').length, 1)
        assert.equal(page.hasFrame(), false)

        const initialStateGets = page.requestsOf('GET', ONBOARDING_ROUTES.state).length
        const [syncBtn] = page.byAttr(UI_ATTR.syncButton)
        assert.ok(syncBtn, 'Step 1 must render [data-onboarding-sync-button]')

        await page.press(syncBtn)

        // Verify check -> add(all missing ids) -> state refresh
        assert.ok(await page.until(() => page.requestsOf('POST', INSTANCE_ROUTES.modelsAdd).length === 1), 'expected models/add POST')
        assert.equal(page.requestsOf('POST', INSTANCE_ROUTES.modelsCheck).length, 1)
        const addReq = page.requestsOf('POST', INSTANCE_ROUTES.modelsAdd)[0]
        assert.equal(addReq.body.checkId, FIXTURE.checkId)
        assert.deepEqual(addReq.body.ids, FIXTURE.missingProviders.map((p) => p.id))

        const refreshed = await page.until(() => page.requestsOf('GET', ONBOARDING_ROUTES.state).length > initialStateGets)
        assert.ok(refreshed, 'expected onboarding/state refresh after models/add')

        // Newly synced model appears in picker
        const syncedShown = await page.until(() => page.text().includes(MODEL_FIXTURE.syncedName))
        assert.ok(syncedShown, 'newly synced model should appear in Step 1 picker after refresh')
        assert.deepEqual(page.world.errors, [])
      })

      test('EP: sync button skips models/add when models/check returns zero missing providers', async (t) => {
        const page = await openOnboardingPage(t, sdk, { missingProviders: [] })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        const [syncBtn] = page.byAttr(UI_ATTR.syncButton)
        await page.press(syncBtn)
        assert.ok(await page.until(() => page.requestsOf('POST', INSTANCE_ROUTES.modelsCheck).length === 1))
        await page.settle()
        assert.equal(page.requestsOf('POST', INSTANCE_ROUTES.modelsAdd).length, 0, 'must not call models/add when missing is empty')
        assert.deepEqual(page.world.errors, [])
      })

      test('EP / BVA (DOM hooks, labels, optgroup grouping & State A): renders side-by-side model & effort selects with localized labels, provider optgroups, and disabled effort select when no model is chosen (en & zh)', async (t) => {
        for (const lang of LANGS) {
          const page = await openOnboardingPage(t, sdk, { lang })
          await page.mountGate()
          await waitForStep(page, UI_STEP.fishballModel)

          assert.equal(page.byAttr(UI_ATTR.modelPicker).length, 1, 'must render [data-onboarding-model-picker]')
          const modelSel = modelSelectOf(page)
          const effortSel = effortSelectOf(page)
          assert.ok(modelSel && modelSel.tag === 'select', 'must render <select data-onboarding-model-select="true">')
          assert.ok(effortSel && effortSel.tag === 'select', 'must render <select data-onboarding-effort-select="true">')

          // Labels associated via htmlFor === select.id
          assert.ok(modelSel.props.id, 'model select must have an id for its <label>')
          assert.ok(effortSel.props.id, 'effort select must have an id for its <label>')
          const modelLabel = labelFor(page, modelSel.props.id)
          const effortLabel = labelFor(page, effortSel.props.id)
          assert.ok(modelLabel, 'model select must have a matching <label>')
          assert.ok(effortLabel, 'effort select must have a matching <label>')
          assert.equal(textOf(modelLabel).trim(), MODEL_PICKER_COPY.modelLabel[lang])
          assert.equal(textOf(effortLabel).trim(), MODEL_PICKER_COPY.effortLabel[lang])

          // Left <select>: value === "", enabled placeholder, grouped by provider <optgroup>
          assert.equal(String(modelSel.props.value ?? ''), '')
          const modelOpts = optionsOf(modelSel)
          assert.equal(String(modelOpts[0].props.value ?? ''), '')
          assert.equal(Boolean(modelOpts[0].props.disabled), false, 'placeholder option must be enabled while value === ""')
          assert.equal(textOf(modelOpts[0]).trim(), MODEL_PICKER_COPY.modelPlaceholder[lang])

          const groups = optgroupsOf(modelSel)
          assert.deepEqual(
            groups.map((g) => g.props.label),
            [MODEL_FIXTURE.providers.deepseek, MODEL_FIXTURE.providers.openai],
          )
          assert.deepEqual(
            optionsOf(groups[0]).map((o) => [String(o.props.value), textOf(o).trim()]),
            [
              [KEY_PLAIN, MODEL_FIXTURE.plain.name],
              [KEY_REASONER, MODEL_FIXTURE.reasoner.name],
            ],
          )
          assert.deepEqual(
            optionsOf(groups[1]).map((o) => [String(o.props.value), textOf(o).trim()]),
            [[KEY_GPT5, MODEL_FIXTURE.gpt5.name]],
          )
          // 1 placeholder + 3 model options (never expanded per reasoning effort)
          assert.equal(modelOpts.length, 4, 'left select must render placeholder + 3 model options, never expanded per effort')

          // Right <select> State A (no active model): disabled, value "", option "Select a model first" / "请先选择模型", hint hidden
          assert.equal(Boolean(effortSel.props.disabled), true, 'State A: effort select must be disabled with no active model')
          assert.equal(String(effortSel.props.value ?? ''), '')
          assert.equal(String(effortSel.props[UI_ATTR.effortModel] ?? ''), '')
          const effortOpts = optionsOf(effortSel)
          assert.equal(effortOpts.length, 1)
          assert.equal(textOf(effortOpts[0]).trim(), MODEL_PICKER_COPY.effortSelectModelFirst[lang])
          assert.equal(page.byAttr(UI_ATTR.effortHint).length, 0, 'State A: effort hint must be hidden')

          assert.deepEqual(page.missingKeys, [], `missing locale keys in ${lang}: ${JSON.stringify(page.missingKeys)}`)
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('DT-1 (plain model -> State B): selecting plain model immediately posts {provider,model}, disables effort select with Not applicable, disables model placeholder, and shows saved badge (en & zh)', async (t) => {
        for (const lang of LANGS) {
          const page = await openOnboardingPage(t, sdk, { lang })
          await page.mountGate()
          await waitForStep(page, UI_STEP.fishballModel)

          await page.select(modelSelectOf(page), KEY_PLAIN)

          assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))
          const post = page.requestsOf('POST', ONBOARDING_ROUTES.model)[0]
          assert.deepEqual(post.body, { provider: MODEL_FIXTURE.plain.provider, model: MODEL_FIXTURE.plain.model })
          assert.equal('reasoningEffort' in post.body, false, 'plain model must omit reasoningEffort')
          assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelSaved).length >= 1), 'must show [data-onboarding-model-saved]')

          const modelSel = modelSelectOf(page)
          assert.equal(String(modelSel.props.value), KEY_PLAIN)
          const placeholderOpt = optionsOf(modelSel).find((o) => String(o.props.value ?? '') === '')
          assert.equal(Boolean(placeholderOpt?.props.disabled), true, 'placeholder option must be disabled once a model is chosen')

          // Right <select> State B: disabled, value "", option "Not applicable" / "不支持调整", no hint
          const effortSel = effortSelectOf(page)
          assert.equal(Boolean(effortSel.props.disabled), true, 'State B: effort select must be disabled for plain model')
          assert.equal(String(effortSel.props.value ?? ''), '')
          const effortOpts = optionsOf(effortSel)
          assert.equal(effortOpts.length, 1)
          assert.equal(textOf(effortOpts[0]).trim(), MODEL_PICKER_COPY.effortNotApplicable[lang])
          assert.equal(page.byAttr(UI_ATTR.effortHint).length, 0, 'State B: effort hint must not render for plain model')

          assert.deepEqual(page.missingKeys, [])
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('DT-2 (reasoning model -> State C -> State D): selecting reasoning model sends 0 POSTs, enables effort select with Select effort + hint; selecting effort posts {provider,model,reasoningEffort}, hides hint, shows saved badge (en & zh)', async (t) => {
        for (const lang of LANGS) {
          const page = await openOnboardingPage(t, sdk, { lang })
          await page.mountGate()
          await waitForStep(page, UI_STEP.fishballModel)

          // Select reasoning model -> State C (0 POSTs)
          await page.select(modelSelectOf(page), KEY_REASONER)
          assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 0, 'selecting a model with efforts must NOT immediately POST')

          const modelSel = modelSelectOf(page)
          assert.equal(String(modelSel.props.value), KEY_REASONER)
          assert.equal(Boolean(optionsOf(modelSel)[0].props.disabled), true)

          const effortSelC = effortSelectOf(page)
          assert.equal(Boolean(effortSelC.props.disabled), false, 'State C: effort select must be enabled')
          assert.equal(String(effortSelC.props.value ?? ''), '')
          assert.equal(effortSelC.props[UI_ATTR.effortModel], KEY_REASONER)
          const effortOptsC = optionsOf(effortSelC)
          assert.deepEqual(
            effortOptsC.map((o) => [String(o.props.value ?? ''), textOf(o).trim()]),
            [
              ['', MODEL_PICKER_COPY.effortPlaceholder[lang]],
              [MODEL_FIXTURE.reasoner.efforts.medium.id, MODEL_FIXTURE.reasoner.efforts.medium.name],
              [MODEL_FIXTURE.reasoner.efforts.high.id, MODEL_FIXTURE.reasoner.efforts.high.name],
            ],
          )
          assert.equal(Boolean(effortOptsC[0].props.disabled), false, 'State C: effort placeholder must be enabled while value === ""')

          const hintsBefore = page.byAttr(UI_ATTR.effortHint, 'true')
          assert.equal(hintsBefore.length, 1, 'State C: must render [data-onboarding-effort-hint="true"]')
          assert.ok(textOf(hintsBefore[0]).trim().length > 0)
          assert.deepEqual(page.missingKeys, [], `missing locale keys in ${lang}: ${JSON.stringify(page.missingKeys)}`)

          // Select 'high' effort -> State D (posts { provider, model, reasoningEffort })
          await page.select(effortSelC, MODEL_FIXTURE.reasoner.efforts.high.id)
          assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))
          assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[0].body, {
            provider: MODEL_FIXTURE.reasoner.provider,
            model: MODEL_FIXTURE.reasoner.model,
            reasoningEffort: MODEL_FIXTURE.reasoner.efforts.high.id,
          })

          assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelSaved).length >= 1), 'must show [data-onboarding-model-saved]')
          const effortSelD = effortSelectOf(page)
          assert.equal(Boolean(effortSelD.props.disabled), false, 'State D: effort select stays enabled')
          assert.equal(String(effortSelD.props.value), MODEL_FIXTURE.reasoner.efforts.high.id)
          assert.equal(Boolean(optionsOf(effortSelD)[0].props.disabled), true, 'State D: effort placeholder must be disabled once effort is saved')
          assert.equal(page.byAttr(UI_ATTR.effortHint).length, 0, 'State D: effort hint must hide once active model + effort is saved')
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('ST-3 (switching, re-picking & boundary no-ops): Model A -> Model B resets effort select without overwriting Model A; re-picking effort posts new effort; placeholder & invalid values are no-ops; switching to plain disables effort select', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        // Save Model A (deepseek-reasoner + high)
        await page.select(modelSelectOf(page), KEY_REASONER)
        await page.select(effortSelectOf(page), MODEL_FIXTURE.reasoner.efforts.high.id)
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))

        // Switch left <select> to Model B (gpt-5) -> State C, 0 additional POSTs, Model A remains saved on host
        await page.select(modelSelectOf(page), KEY_GPT5)
        assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 1, 'switching to Model B must not POST before effort is chosen')
        assert.equal(String(modelSelectOf(page).props.value), KEY_GPT5)
        const effortB = effortSelectOf(page)
        assert.equal(Boolean(effortB.props.disabled), false)
        assert.equal(String(effortB.props.value ?? ''), '')
        assert.equal(effortB.props[UI_ATTR.effortModel], KEY_GPT5)
        assert.deepEqual(
          optionsOf(effortB).map((o) => String(o.props.value ?? '')),
          ['', MODEL_FIXTURE.gpt5.efforts.low.id, MODEL_FIXTURE.gpt5.efforts.high.id],
        )
        assert.equal(page.byAttr(UI_ATTR.effortHint, 'true').length, 1)
        assert.deepEqual(page.world.state.model, {
          provider: MODEL_FIXTURE.reasoner.provider,
          model: MODEL_FIXTURE.reasoner.model,
          reasoningEffort: MODEL_FIXTURE.reasoner.efforts.high.id,
        })

        // Boundary no-op: selecting placeholder "" on effort select sends 0 POSTs
        await page.select(effortSelectOf(page), '')
        assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 1)

        // Pick Model B effort 'low' -> POST #2
        await page.select(effortSelectOf(page), MODEL_FIXTURE.gpt5.efforts.low.id)
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 2))
        assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[1].body, {
          provider: MODEL_FIXTURE.gpt5.provider,
          model: MODEL_FIXTURE.gpt5.model,
          reasoningEffort: MODEL_FIXTURE.gpt5.efforts.low.id,
        })
        assert.equal(String(effortSelectOf(page).props.value), MODEL_FIXTURE.gpt5.efforts.low.id)
        assert.equal(page.byAttr(UI_ATTR.effortHint).length, 0)

        // Re-pick different effort 'high' on already-saved Model B -> POST #3
        await page.select(effortSelectOf(page), MODEL_FIXTURE.gpt5.efforts.high.id)
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 3))
        assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[2].body, {
          provider: MODEL_FIXTURE.gpt5.provider,
          model: MODEL_FIXTURE.gpt5.model,
          reasoningEffort: MODEL_FIXTURE.gpt5.efforts.high.id,
        })
        assert.equal(String(effortSelectOf(page).props.value), MODEL_FIXTURE.gpt5.efforts.high.id)

        // Boundary no-ops on left <select>: placeholder "" and invalid values do not POST or clobber selection
        for (const invalidVal of ['', ...MODEL_FIXTURE.invalidKeys]) {
          await page.select(modelSelectOf(page), invalidVal)
        }
        assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 3, 'placeholder and invalid values on model select must be no-ops')
        assert.equal(String(modelSelectOf(page).props.value), KEY_GPT5)
        assert.equal(String(effortSelectOf(page).props.value), MODEL_FIXTURE.gpt5.efforts.high.id)

        // Switch left <select> to plain model -> POST #4 immediately and effort select transitions to State B
        await page.select(modelSelectOf(page), KEY_PLAIN)
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 4))
        assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[3].body, {
          provider: MODEL_FIXTURE.plain.provider,
          model: MODEL_FIXTURE.plain.model,
        })
        assert.equal(Boolean(effortSelectOf(page).props.disabled), true)
        assert.equal(textOf(optionsOf(effortSelectOf(page))[0]).trim(), MODEL_PICKER_COPY.effortNotApplicable.en)
        assert.equal(page.byAttr(UI_ATTR.effortHint).length, 0)
        assert.deepEqual(page.world.errors, [])
      })

      test('ST-4 (initial mount, Back from Step 2, unlisted saved effort/model fallbacks & legacy unset reasoningEffort): populates both selects accurately across all saved-state boundaries', async (t) => {
        // 1. Pre-saved effort model (openai/gpt-5 + high) -> State D + Back preservation
        const page = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: FIXTURE.modelB,
            catalog: FIXTURE.catalog,
          },
        })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        assert.equal(String(modelSelectOf(page).props.value), KEY_GPT5)
        assert.equal(Boolean(optionsOf(modelSelectOf(page))[0].props.disabled), true)
        assert.equal(Boolean(effortSelectOf(page).props.disabled), false)
        assert.equal(effortSelectOf(page).props[UI_ATTR.effortModel], KEY_GPT5)
        assert.equal(String(effortSelectOf(page).props.value), MODEL_FIXTURE.gpt5.efforts.high.id)
        assert.equal(Boolean(optionsOf(effortSelectOf(page))[0].props.disabled), true)
        assert.equal(page.byAttr(UI_ATTR.effortHint).length, 0)

        // Navigate forward to Step 2 and back to Step 1 -> both selects preserved
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.watchdog)
        await page.press(page.byAttr(UI_ATTR.back)[0])
        await waitForStep(page, UI_STEP.fishballModel)
        assert.equal(String(modelSelectOf(page).props.value), KEY_GPT5)
        assert.equal(String(effortSelectOf(page).props.value), MODEL_FIXTURE.gpt5.efforts.high.id)

        // 2. BVA: unlisted saved reasoningEffort renders fallback <option value={id}>{id}</option>
        const pageRawEffort = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: { provider: MODEL_FIXTURE.gpt5.provider, model: MODEL_FIXTURE.gpt5.model, reasoningEffort: MODEL_FIXTURE.gpt5.customEffortId },
            catalog: FIXTURE.catalog,
          },
        })
        await pageRawEffort.mountGate()
        await waitForStep(pageRawEffort, UI_STEP.fishballModel)
        const rawEffortSel = effortSelectOf(pageRawEffort)
        assert.equal(String(rawEffortSel.props.value), MODEL_FIXTURE.gpt5.customEffortId)
        const fallbackEffortOpt = optionsOf(rawEffortSel).find((o) => String(o.props.value) === MODEL_FIXTURE.gpt5.customEffortId)
        assert.ok(fallbackEffortOpt, 'unlisted saved effort must render a fallback <option>')
        assert.equal(textOf(fallbackEffortOpt).trim(), MODEL_FIXTURE.gpt5.customEffortId)
        assert.equal(pageRawEffort.byAttr(UI_ATTR.effortHint).length, 0)

        // 3. BVA: unlisted saved model not in catalog.groups renders fallback <option value="[provider,model]">provider / model</option>
        const pageUnlistedModel = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: { provider: MODEL_FIXTURE.unlisted.provider, model: MODEL_FIXTURE.unlisted.model },
            catalog: FIXTURE.catalog,
          },
        })
        await pageUnlistedModel.mountGate()
        await waitForStep(pageUnlistedModel, UI_STEP.fishballModel)
        const unlistedModelSel = modelSelectOf(pageUnlistedModel)
        assert.equal(String(unlistedModelSel.props.value), KEY_UNLISTED)
        const fallbackModelOpt = optionsOf(unlistedModelSel).find((o) => String(o.props.value) === KEY_UNLISTED)
        assert.ok(fallbackModelOpt, 'unlisted saved model must render a fallback <option>')
        assert.equal(textOf(fallbackModelOpt).trim(), MODEL_FIXTURE.unlisted.fallbackLabel)
        assert.equal(Boolean(effortSelectOf(pageUnlistedModel).props.disabled), true)
        assert.equal(textOf(optionsOf(effortSelectOf(pageUnlistedModel))[0]).trim(), MODEL_PICKER_COPY.effortNotApplicable.en)

        // 4. BVA: legacy saved effort-capable model lacking reasoningEffort -> State C (value "" + effort hint visible until effort saved)
        const pageNoEffort = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: { provider: MODEL_FIXTURE.gpt5.provider, model: MODEL_FIXTURE.gpt5.model },
            catalog: FIXTURE.catalog,
          },
        })
        await pageNoEffort.mountGate()
        await waitForStep(pageNoEffort, UI_STEP.fishballModel)
        assert.equal(String(modelSelectOf(pageNoEffort).props.value), KEY_GPT5)
        assert.equal(Boolean(effortSelectOf(pageNoEffort).props.disabled), false)
        assert.equal(String(effortSelectOf(pageNoEffort).props.value ?? ''), '')
        assert.equal(pageNoEffort.byAttr(UI_ATTR.effortHint, 'true').length, 1, 'effort hint must display when saved effort-capable model lacks reasoningEffort')

        await pageNoEffort.select(effortSelectOf(pageNoEffort), MODEL_FIXTURE.gpt5.efforts.high.id)
        assert.ok(await pageNoEffort.until(() => pageNoEffort.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))
        assert.equal(String(effortSelectOf(pageNoEffort).props.value), MODEL_FIXTURE.gpt5.efforts.high.id)
        assert.equal(pageNoEffort.byAttr(UI_ATTR.effortHint).length, 0, 'effort hint must hide once effort is saved')

        assert.deepEqual(page.world.errors, [])
        assert.deepEqual(pageRawEffort.world.errors, [])
        assert.deepEqual(pageUnlistedModel.world.errors, [])
        assert.deepEqual(pageNoEffort.world.errors, [])
      })

      test('ST-5 (catalog refresh drops active model): clears stale selection to State A, or falls back to still-present saved effort model without resurrecting cleared selection', async (t) => {
        // Sub-case A: no saved model, active effort model disappears -> resets to State A
        let replaceCatalog = false
        const page = await openOnboardingPage(t, sdk, {
          respond: (method, pathname) => {
            if (pathname === INSTANCE_ROUTES.modelsAdd && method === 'POST') {
              replaceCatalog = true
              return { ok: true, result: { items: [{ id: 'anthropic-main', outcome: 'added' }] } }
            }
            if (pathname === ONBOARDING_ROUTES.state && method === 'GET' && replaceCatalog) {
              return {
                ok: true,
                completed: false,
                needed: true,
                childReady: true,
                model: null,
                catalog: FIXTURE.syncedCatalog,
              }
            }
            return undefined
          },
        })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        await page.select(modelSelectOf(page), KEY_GPT5)
        assert.equal(effortSelectOf(page).props[UI_ATTR.effortModel], KEY_GPT5)
        assert.equal(page.byAttr(UI_ATTR.effortHint, 'true').length, 1)

        // Sync refreshes catalog without openai/gpt-5 -> resets cleanly to State A
        await page.press(page.byAttr(UI_ATTR.syncButton)[0])
        assert.ok(await page.until(() => page.text().includes(MODEL_FIXTURE.syncedName)))
        assert.equal(String(modelSelectOf(page).props.value ?? ''), '')
        assert.equal(Boolean(effortSelectOf(page).props.disabled), true)
        assert.equal(String(effortSelectOf(page).props[UI_ATTR.effortModel] ?? ''), '')
        assert.equal(textOf(optionsOf(effortSelectOf(page))[0]).trim(), MODEL_PICKER_COPY.effortSelectModelFirst.en)
        assert.equal(page.byAttr(UI_ATTR.effortHint).length, 0)
        assert.deepEqual(page.world.errors, [])

        // Sub-case B: saved effort model (deepseek-reasoner + high) + temporary active effort model (gpt-5) dropped on sync #1, then gpt-5 restored on sync #2
        const savedReasoner = {
          provider: MODEL_FIXTURE.reasoner.provider,
          model: MODEL_FIXTURE.reasoner.model,
          reasoningEffort: MODEL_FIXTURE.reasoner.efforts.high.id,
        }
        let syncPhase = 0
        const pageFallback = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: savedReasoner,
            catalog: FIXTURE.catalog,
          },
          respond: (method, pathname) => {
            if (pathname === INSTANCE_ROUTES.modelsAdd && method === 'POST') {
              syncPhase += 1
              return { ok: true, result: { items: [{ id: 'openai-main', outcome: 'added' }] } }
            }
            if (pathname === ONBOARDING_ROUTES.state && method === 'GET' && syncPhase > 0) {
              return {
                ok: true,
                completed: false,
                needed: true,
                childReady: true,
                model: savedReasoner,
                // Phase 1 drops openai/gpt-5 (keeps deepseek-reasoner); Phase 2 restores full catalog including openai/gpt-5
                catalog: syncPhase === 1 ? MODEL_FIXTURE.deepseekOnlyCatalog : FIXTURE.catalog,
              }
            }
            return undefined
          },
        })
        await pageFallback.mountGate()
        await waitForStep(pageFallback, UI_STEP.fishballModel)

        // Initially showing saved deepseek-reasoner + high
        assert.equal(String(modelSelectOf(pageFallback).props.value), KEY_REASONER)
        assert.equal(String(effortSelectOf(pageFallback).props.value), MODEL_FIXTURE.reasoner.efforts.high.id)

        // Temporarily switch left <select> to openai/gpt-5 (unsaved selectedModelKey)
        await pageFallback.select(modelSelectOf(pageFallback), KEY_GPT5)
        assert.equal(String(modelSelectOf(pageFallback).props.value), KEY_GPT5)
        assert.equal(effortSelectOf(pageFallback).props[UI_ATTR.effortModel], KEY_GPT5)
        assert.equal(String(effortSelectOf(pageFallback).props.value ?? ''), '')

        // Sync #1: drops openai/gpt-5 -> must fall back cleanly to saved deepseek-reasoner + high
        await pageFallback.press(pageFallback.byAttr(UI_ATTR.syncButton)[0])
        assert.ok(await pageFallback.until(() => !optionsOf(modelSelectOf(pageFallback)).some((o) => String(o.props.value) === KEY_GPT5)))
        assert.equal(String(modelSelectOf(pageFallback).props.value), KEY_REASONER, 'must fall back to still-present saved model')
        assert.equal(effortSelectOf(pageFallback).props[UI_ATTR.effortModel], KEY_REASONER)
        assert.equal(String(effortSelectOf(pageFallback).props.value), MODEL_FIXTURE.reasoner.efforts.high.id)
        assert.equal(pageFallback.byAttr(UI_ATTR.effortHint).length, 0)

        // Sync #2: restores openai/gpt-5 -> cleared selectedModelKey must NOT resurrect openai/gpt-5
        await pageFallback.press(pageFallback.byAttr(UI_ATTR.syncButton)[0])
        assert.ok(await pageFallback.until(() => optionsOf(modelSelectOf(pageFallback)).some((o) => String(o.props.value) === KEY_GPT5)))
        assert.equal(
          String(modelSelectOf(pageFallback).props.value),
          KEY_REASONER,
          'cleared selectedModelKey must not resurrect when dropped model reappears in later catalog refresh',
        )
        assert.equal(effortSelectOf(pageFallback).props[UI_ATTR.effortModel], KEY_REASONER)
        assert.equal(String(effortSelectOf(pageFallback).props.value), MODEL_FIXTURE.reasoner.efforts.high.id)
        assert.deepEqual(pageFallback.world.errors, [])

        // Sub-case C: after an effort save succeeds, Refresh returning a different external saved model updates both selects instead of being shadowed
        const externalModel = {
          provider: MODEL_FIXTURE.reasoner.provider,
          model: MODEL_FIXTURE.reasoner.model,
          reasoningEffort: MODEL_FIXTURE.reasoner.efforts.medium.id,
        }
        let externalUpdated = false
        const pageExternal = await openOnboardingPage(t, sdk, {
          respond: (method, pathname) => {
            if (pathname === INSTANCE_ROUTES.modelsAdd && method === 'POST') {
              externalUpdated = true
              return { ok: true, result: { items: [{ id: 'openai-main', outcome: 'added' }] } }
            }
            if (pathname === ONBOARDING_ROUTES.state && method === 'GET' && externalUpdated) {
              return {
                ok: true,
                completed: false,
                needed: true,
                childReady: true,
                model: externalModel,
                catalog: FIXTURE.catalog,
              }
            }
            return undefined
          },
        })
        await pageExternal.mountGate()
        await waitForStep(pageExternal, UI_STEP.fishballModel)

        // Save openai/gpt-5 + high via two-dropdown effort save
        await pageExternal.select(modelSelectOf(pageExternal), KEY_GPT5)
        await pageExternal.select(effortSelectOf(pageExternal), MODEL_FIXTURE.gpt5.efforts.high.id)
        assert.ok(await pageExternal.until(() => pageExternal.byAttr(UI_ATTR.modelSaved).length >= 1))
        assert.equal(String(modelSelectOf(pageExternal).props.value), KEY_GPT5)
        assert.equal(String(effortSelectOf(pageExternal).props.value), MODEL_FIXTURE.gpt5.efforts.high.id)

        // Trigger refresh returning an externally changed model -> both selects must reflect externalModel
        const stateGetsBefore = pageExternal.requestsOf('GET', ONBOARDING_ROUTES.state).length
        await pageExternal.press(pageExternal.byAttr(UI_ATTR.syncButton)[0])
        assert.ok(await pageExternal.until(() => pageExternal.requestsOf('GET', ONBOARDING_ROUTES.state).length > stateGetsBefore))
        assert.equal(
          String(modelSelectOf(pageExternal).props.value),
          KEY_REASONER,
          'model select must reflect externally updated saved model after effort save + refresh',
        )
        assert.equal(effortSelectOf(pageExternal).props[UI_ATTR.effortModel], KEY_REASONER)
        assert.equal(
          String(effortSelectOf(pageExternal).props.value),
          MODEL_FIXTURE.reasoner.efforts.medium.id,
          'effort select must reflect externally updated saved reasoningEffort after effort save + refresh',
        )
        assert.equal(pageExternal.byAttr(UI_ATTR.effortHint).length, 0)
        assert.deepEqual(pageExternal.world.errors, [])
      })

      test('DT-3 (disabled states & concurrent change guard): both selects disabled while saving or !childReady, and rapid synchronous onChange sends only 1 POST', async (t) => {
        // Case A: while saving (in-flight POST /onboarding/model) + synchronous rapid double-change guard
        let holdSave = null
        const page = await openOnboardingPage(t, sdk, {
          respond: (method, pathname, body, world) => {
            if (pathname === ONBOARDING_ROUTES.model && method === 'POST' && holdSave) {
              return holdSave.promise.then(() => {
                world.state = { ...world.state, model: body }
                return { ok: true, model: body }
              })
            }
            return undefined
          },
        })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        // Select gpt-5 to enable effort select, then fire two synchronous rapid onChange events before React re-renders
        await page.select(modelSelectOf(page), KEY_GPT5)
        holdSave = deferred()
        const effortSel = effortSelectOf(page)
        const target = { value: MODEL_FIXTURE.gpt5.efforts.high.id }
        effortSel.props.onChange?.({ target, currentTarget: target, preventDefault() {} })
        effortSel.props.onChange?.({ target, currentTarget: target, preventDefault() {} })
        await page.settle()
        assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 1, 'rapid concurrent onChange must be guarded synchronously and send only 1 POST')

        assert.equal(Boolean(modelSelectOf(page).props.disabled), true, 'model select must be disabled while saving')
        assert.equal(Boolean(effortSelectOf(page).props.disabled), true, 'effort select must be disabled while saving')

        // Release save -> both selects re-enable
        holdSave.resolve()
        holdSave = null
        assert.ok(await page.until(() => !modelSelectOf(page).props.disabled && !effortSelectOf(page).props.disabled))

        // Case B: !childReady (state has needed: true, childReady: false)
        const pageNotReady = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: false,
            model: FIXTURE.modelB,
            catalog: FIXTURE.catalog,
          },
        })
        await pageNotReady.mountGate()
        await waitForStep(pageNotReady, UI_STEP.fishballModel)
        assert.equal(Boolean(modelSelectOf(pageNotReady).props.disabled), true, 'model select must be disabled when !childReady')
        assert.equal(Boolean(effortSelectOf(pageNotReady).props.disabled), true, 'effort select must be disabled when !childReady')
        assert.deepEqual(page.world.errors, [])
        assert.deepEqual(pageNotReady.world.errors, [])
      })

      test('EP-SaveFailure: {ok: false} on plain model or effort save shows role="alert" and preserves prior saved selects cleanly', async (t) => {
        const failModelSave = (method, pathname) => {
          if (pathname === ONBOARDING_ROUTES.model && method === 'POST') {
            return { ok: false, code: CHILD_MODEL_CONTRACT.code.writeFailed }
          }
          return undefined
        }

        // 1. No prior saved model (model === null): plain model failure keeps left select at "" & right select in State A; effort failure keeps right select at ""
        const page = await openOnboardingPage(t, sdk, { respond: failModelSave })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        await page.select(modelSelectOf(page), KEY_PLAIN)
        assert.ok(await page.until(() => page.find((n) => n.props.role === 'alert').length >= 1), 'expected role="alert" on plain model save failure')
        assert.equal(page.byAttr(UI_ATTR.modelSaved).length, 0, 'must not show saved badge on failure')
        assert.equal(String(modelSelectOf(page).props.value ?? ''), '', 'failed plain model save with model===null must keep left select at ""')
        assert.equal(Boolean(effortSelectOf(page).props.disabled), true)
        assert.equal(textOf(optionsOf(effortSelectOf(page))[0]).trim(), MODEL_PICKER_COPY.effortSelectModelFirst.en)

        await page.select(modelSelectOf(page), KEY_GPT5)
        await page.select(effortSelectOf(page), MODEL_FIXTURE.gpt5.efforts.high.id)
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 2))
        assert.ok(page.find((n) => n.props.role === 'alert').length >= 1, 'expected role="alert" on effort save failure')
        assert.equal(page.byAttr(UI_ATTR.modelSaved).length, 0, 'must not show saved badge on effort save failure')
        assert.equal(String(effortSelectOf(page).props.value ?? ''), '', 'failed effort save must keep right select at ""')
        assert.deepEqual(page.world.errors, [])

        // 2. Prior saved effort model (openai/gpt-5 + high) -> switching to failing plain model preserves both saved selects cleanly
        const pageWithSaved = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: FIXTURE.modelB,
            catalog: FIXTURE.catalog,
          },
          respond: failModelSave,
        })
        await pageWithSaved.mountGate()
        await waitForStep(pageWithSaved, UI_STEP.fishballModel)

        await pageWithSaved.select(modelSelectOf(pageWithSaved), KEY_PLAIN)
        assert.ok(await pageWithSaved.until(() => pageWithSaved.find((n) => n.props.role === 'alert').length >= 1), 'expected role="alert" when plain model switch fails')
        assert.equal(
          String(modelSelectOf(pageWithSaved).props.value),
          KEY_GPT5,
          'prior saved model must stay selected in left select after plain model save failure',
        )
        assert.equal(Boolean(effortSelectOf(pageWithSaved).props.disabled), false)
        assert.equal(
          effortSelectOf(pageWithSaved).props[UI_ATTR.effortModel],
          KEY_GPT5,
          'prior saved effort model must stay intact after plain model save failure',
        )
        assert.equal(
          String(effortSelectOf(pageWithSaved).props.value),
          MODEL_FIXTURE.gpt5.efforts.high.id,
          'prior saved effort value must stay intact after plain model save failure',
        )
        assert.equal(pageWithSaved.byAttr(UI_ATTR.effortHint).length, 0)
        assert.deepEqual(pageWithSaved.world.errors, [])
      })

      test('EP: Step 1 Next button advances to Step 2 even without choosing a model', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.watchdog)
        assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 0)
        assert.deepEqual(page.world.errors, [])
      })
    })

    describe('Step 2: Watchdog model configuration & status detection (DT + EP + BVA + ST)', () => {
      test('DT-1 (ready): renders watchdog select, picks model via scope.set, shows saved badge, and unsets on empty selection', async (t) => {
        const page = await openOnboardingPage(t, sdk, { watchdogMode: WATCHDOG_STATE.ready })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.ready).length === 1), 'expected watchdog ready state')
        const selectReady = await page.until(() => {
          const [sel] = page.byAttr(UI_ATTR.watchdogSelect)
          if (!sel) return false
          const options = page.find((n) => n.tag === 'option')
          return options.length >= 2
        })
        assert.ok(selectReady, 'expected <select data-onboarding-watchdog-select> with empty option + catalog model options')

        const options = page.find((n) => n.tag === 'option')
        const emptyOpt = options.find((o) => String(o.props.value ?? '') === '')
        const nonEmptyOpts = options.filter((o) => String(o.props.value ?? '') !== '')
        assert.ok(emptyOpt, 'expected empty (disabled) option in watchdog select')
        // Step 2 Watchdog <select> intentionally stays flat across (model x effort):
        // FIXTURE.catalog = deepseek-chat (1) + deepseek-reasoner (2 efforts) + gpt-5 (2 efforts) = 5 flat options
        assert.equal(nonEmptyOpts.length, 5, 'Step 2 watchdog select must still list all 5 flat (model, reasoningEffort) combinations')
        const effortOpt = nonEmptyOpts.find((o) => String(o.props.value).includes('gpt-5') && String(o.props.value).includes('high'))
        assert.ok(effortOpt, 'expected flat (openai, gpt-5, high) option in watchdog select')

        // Pick a flat model+effort option -> scope.set('model', { provider, model, reasoningEffort }) + saved badge
        await page.select(page.byAttr(UI_ATTR.watchdogSelect)[0], String(effortOpt.props.value))
        assert.ok(await page.until(() => page.world.watchdogCalls.set.length === 1), 'expected scope.set("model", selection)')
        assert.equal(page.world.watchdogCalls.set[0].field, 'model')
        assert.deepEqual({ ...page.world.watchdogCalls.set[0].value }, FIXTURE.modelB)
        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogSaved).length >= 1), 'expected [data-onboarding-watchdog-saved]')

        // Pick empty -> scope.unset('model')
        await page.select(page.byAttr(UI_ATTR.watchdogSelect)[0], '')
        assert.ok(await page.until(() => page.world.watchdogCalls.unset.length === 1), 'expected scope.unset("model")')
        assert.equal(page.world.watchdogCalls.unset[0].field, 'model')
        assert.deepEqual(page.world.errors, [])
      })

      test('DT-2a (missing): neither bundle nor plugin exists -> missing state and allows advancing', async (t) => {
        const page = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [],
          mainPlugins: [],
        })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.missing).length === 1), 'expected watchdog missing state')
        assert.equal(page.byAttr(UI_ATTR.watchdogSelect).length, 0)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.memory)
        assert.deepEqual(page.world.errors, [])
      })

      test('DT-2b (missing): bundle exists with installed=false and no error -> missing state', async (t) => {
        const page = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [{ name: WATCHDOG_NS, installed: false, enabled: false }],
          mainPlugins: [],
        })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.missing).length === 1), 'uninstalled bundle without error must show missing')
        assert.equal(page.byAttr(UI_ATTR.watchdogSelect).length, 0)
        assert.deepEqual(page.world.errors, [])
      })

      test('DT-3 (unsupported): watchdog served without model field shows unsupported state and allows advancing', async (t) => {
        const page = await openOnboardingPage(t, sdk, { watchdogMode: WATCHDOG_STATE.unsupported })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.unsupported).length === 1), 'expected watchdog unsupported state')
        assert.equal(page.byAttr(UI_ATTR.watchdogSelect).length, 0)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.memory)
        assert.deepEqual(page.world.errors, [])
      })

      test('DT-4a (disabled via bundle): installed=true, enabled=false, no error -> disabled state with distinct copy from missing (en & zh)', async (t) => {
        for (const lang of LANGS) {
          const missingPage = await openOnboardingPage(t, sdk, {
            lang,
            watchdogMode: WATCHDOG_STATE.missing,
            mainBundles: [],
            mainPlugins: [],
          })
          await missingPage.mountGate()
          await advanceToStep(missingPage, UI_STEP.watchdog)
          assert.ok(await missingPage.until(() => missingPage.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.missing).length === 1))
          const missingText = missingPage.text()

          const disabledPage = await openOnboardingPage(t, sdk, {
            lang,
            watchdogMode: WATCHDOG_STATE.missing,
            mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: false }],
            mainPlugins: [],
          })
          await disabledPage.mountGate()
          await advanceToStep(disabledPage, UI_STEP.watchdog)
          assert.ok(await disabledPage.until(() => disabledPage.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.disabled).length === 1), `expected disabled state in ${lang}`)
          assert.equal(disabledPage.byAttr(UI_ATTR.watchdogSelect).length, 0)
          const disabledText = disabledPage.text()
          assert.notEqual(disabledText, missingText, `disabled message must differ from missing message in ${lang}`)

          // User can still advance cleanly
          await disabledPage.press(disabledPage.byAttr(UI_ATTR.next)[0])
          await waitForStep(disabledPage, UI_STEP.memory)
          assert.deepEqual(disabledPage.world.errors, [])
        }
      })

      test('DT-4b (disabled via plugin entry): plugin entry enabled=false, no error -> disabled state', async (t) => {
        const page = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [],
          mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: false, fiberPhase: null }],
        })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.disabled).length === 1))
        assert.deepEqual(page.world.errors, [])
      })

      test('DT-5a (error via failed plugin): fiberPhase="failed" shows error state and displays plugin.diagnostic', async (t) => {
        const diagnostic = 'Watchdog boot crash XYZ-42'
        const page = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true }],
          mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: true, fiberPhase: 'failed', diagnostic }],
        })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.error).length === 1), 'expected error state for fiberPhase="failed"')
        assert.ok(page.text().includes(diagnostic), `expected diagnostic "${diagnostic}" in: ${page.text()}`)
        assert.equal(page.byAttr(UI_ATTR.watchdogSelect).length, 0)
        assert.deepEqual(page.world.errors, [])
      })

      test('DT-5b (error via bundle.error): displays bundle.error.diagnostic, or falls back to bundle.error.code', async (t) => {
        // With diagnostic
        const p1 = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true, error: { code: 'LOAD_FAILED', diagnostic: 'Manifest broken ABC' } }],
          mainPlugins: [],
        })
        await p1.mountGate()
        await advanceToStep(p1, UI_STEP.watchdog)
        assert.ok(await p1.until(() => p1.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.error).length === 1))
        assert.ok(p1.text().includes('Manifest broken ABC'), `expected bundle.error.diagnostic in: ${p1.text()}`)

        // Without diagnostic -> displays code
        const p2 = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true, error: { code: 'ERR_WATCHDOG_BROKEN' } }],
          mainPlugins: [],
        })
        await p2.mountGate()
        await advanceToStep(p2, UI_STEP.watchdog)
        assert.ok(await p2.until(() => p2.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.error).length === 1))
        assert.ok(p2.text().includes('ERR_WATCHDOG_BROKEN'), `expected bundle.error.code in: ${p2.text()}`)
        assert.deepEqual(p1.world.errors, [])
        assert.deepEqual(p2.world.errors, [])
      })

      test('DT-5c (error via enabled-but-no-form): installed & enabled, availability!="missing", fiberPhase active, form absent -> error state', async (t) => {
        const page = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true, availability: 'profile' }],
          mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: true, fiberPhase: 'active' }],
        })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.error).length === 1), 'enabled active watchdog with missing form must report error')
        assert.deepEqual(page.world.errors, [])
      })

      test('BVA (pending/loading guard on DT-5c): enabled watchdog with fiberPhase="pending" or "loading" does not falsely report error', async (t) => {
        for (const phase of ['pending', 'loading']) {
          const page = await openOnboardingPage(t, sdk, {
            watchdogMode: WATCHDOG_STATE.missing,
            mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true, availability: 'profile' }],
            mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: true, fiberPhase: phase }],
          })
          await page.mountGate()
          await advanceToStep(page, UI_STEP.watchdog)
          await page.settle()
          assert.equal(page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.error).length, 0, `fiberPhase="${phase}" must not falsely report error`)
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('EP fallback compatibility: missing or incomplete remote.pluginManager falls back gracefully to missing with zero errors', async (t) => {
        for (const pluginManagerMode of ['absent', 'no-list']) {
          const page = await openOnboardingPage(t, sdk, {
            watchdogMode: WATCHDOG_STATE.missing,
            pluginManagerMode,
          })
          await page.mountGate()
          await advanceToStep(page, UI_STEP.watchdog)

          assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.missing).length === 1), `mode "${pluginManagerMode}" must fall back to missing`)
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('ST live transitions: disabled -> ready and error -> ready update Step 2 UI live on plugin-manager/changed & config-forms/changed', async (t) => {
        // Transition 1: disabled -> ready
        const p1 = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: false }],
          mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: false, fiberPhase: null }],
        })
        await p1.mountGate()
        await advanceToStep(p1, UI_STEP.watchdog)
        assert.ok(await p1.until(() => p1.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.disabled).length === 1))

        await p1.updateWatchdog({
          mode: WATCHDOG_STATE.ready,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true }],
          mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: true, fiberPhase: 'active' }],
        })
        assert.ok(await p1.until(() => p1.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.ready).length === 1), 'disabled -> ready live update')
        assert.ok(await p1.until(() => p1.byAttr(UI_ATTR.watchdogSelect).length === 1))

        // Transition 2: error -> ready
        const p2 = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true }],
          mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: true, fiberPhase: 'failed', diagnostic: 'Temporary failure' }],
        })
        await p2.mountGate()
        await advanceToStep(p2, UI_STEP.watchdog)
        assert.ok(await p2.until(() => p2.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.error).length === 1))

        await p2.updateWatchdog({
          mode: WATCHDOG_STATE.ready,
          mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true }],
          mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: true, fiberPhase: 'active' }],
        })
        assert.ok(await p2.until(() => p2.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.ready).length === 1), 'error -> ready live update')
        assert.ok(await p2.until(() => p2.byAttr(UI_ATTR.watchdogSelect).length === 1))
        assert.deepEqual(p1.world.errors, [])
        assert.deepEqual(p2.world.errors, [])
      })

      test('DT strict Cordis proxy: throwing ctx.remote.pluginManager uses ctx.get("remote.pluginManager") without crash across disabled / error / missing', async (t) => {
        const cases = [
          {
            label: 'disabled',
            expected: WATCHDOG_STATE.disabled,
            mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: false }],
            mainPlugins: [],
          },
          {
            label: 'error',
            expected: WATCHDOG_STATE.error,
            mainBundles: [{ name: WATCHDOG_NS, installed: true, enabled: true }],
            mainPlugins: [{ entryId: WATCHDOG_NS, moduleName: WATCHDOG_NS, enabled: true, fiberPhase: 'failed', diagnostic: 'Strict proxy boot error' }],
            expectText: 'Strict proxy boot error',
          },
          {
            label: 'missing',
            expected: WATCHDOG_STATE.missing,
            mainBundles: [],
            mainPlugins: [],
          },
        ]

        for (const row of cases) {
          const page = await openOnboardingPage(t, sdk, {
            watchdogMode: WATCHDOG_STATE.missing,
            strictRemoteProxy: true,
            pluginManagerMode: 'full',
            mainBundles: row.mainBundles,
            mainPlugins: row.mainPlugins,
          })
          await page.mountGate()
          await waitForStep(page, UI_STEP.fishballModel)
          await page.press(page.byAttr(UI_ATTR.next)[0])
          await waitForStep(page, UI_STEP.watchdog)

          assert.ok(
            await page.until(() => page.byAttr(UI_ATTR.watchdogState, row.expected).length === 1),
            `strict proxy (${row.label}) must classify as ${row.expected}`,
          )
          if (row.expectText) {
            assert.ok(page.text().includes(row.expectText), `expected "${row.expectText}" in: ${page.text()}`)
          }
          assert.deepEqual(page.world.errors, [], `unexpected errors for strict proxy (${row.label})`)
        }
      })

      test('EP strict Cordis proxy: throwing ctx.remote.pluginManager with ctx.get("remote.pluginManager") === undefined falls back to missing without crash', async (t) => {
        const page = await openOnboardingPage(t, sdk, {
          watchdogMode: WATCHDOG_STATE.missing,
          strictRemoteProxy: true,
          pluginManagerMode: 'absent',
        })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.watchdog)

        assert.ok(await page.until(() => page.byAttr(UI_ATTR.watchdogState, WATCHDOG_STATE.missing).length === 1), 'must fall back cleanly to missing')
        assert.deepEqual(page.world.errors, [])
      })
    })

    describe('Step 3: 4 Recommended plugins (EP + ST + en/zh descriptions)', () => {
      test('EP/ST: lists all 4 recommended plugins (including billion-context) with distinct concise descriptions in en & zh and no generic meow-memory note', async (t) => {
        for (const lang of LANGS) {
          const page = await openOnboardingPage(t, sdk, { lang })
          await page.mountGate()
          await advanceToStep(page, UI_STEP.memory)

          const cardTexts = new Map()
          for (const pkg of MEMORY_PLUGINS) {
            const found = await page.until(() => page.byAttr(UI_ATTR.memoryItem, pkg).length === 1)
            assert.ok(found, `expected [data-onboarding-memory-item="${pkg}"] in ${lang}`)

            const card = page.byAttr(UI_ATTR.memoryItem, pkg)[0]
            const cardText = textOf(card).replace(/\s+/g, ' ').trim()
            assert.ok(cardText.length > 0, `empty card text for ${pkg} in ${lang}`)
            cardTexts.set(pkg, cardText)
          }

          // Every plugin must have a distinct description (strip pkg name so we compare description/copy)
          const stripped = [...cardTexts.entries()].map(([pkg, txt]) => txt.replaceAll(pkg, '').trim())
          assert.equal(new Set(stripped).size, MEMORY_PLUGINS.length, `all 4 plugins must have distinct descriptions in ${lang}: ${JSON.stringify(stripped)}`)

          // No longer shows generic "Fishball has no built-in memory" note on meow-memory
          assert.equal(/Fishball has no built-in memory/i.test(cardTexts.get('meow-memory')), false, 'meow-memory must not show old generic note')
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('ST: installing billion-context triggers child plugin install dialog, marks installed when in inventory, and advances to Step 4', async (t) => {
        const installedPkg = MEMORY_PLUGINS[0]
        const page = await openOnboardingPage(t, sdk, {
          installedFishballBundles: [{ name: installedPkg, version: '1.0.0', enabled: true }],
        })
        await page.mountGate()
        await advanceToStep(page, UI_STEP.memory)

        // Installed plugin has no install button; billion-context has install button
        assert.equal(page.byAttr(UI_ATTR.memoryInstall, installedPkg).length, 0, 'installed plugin shows Installed badge instead of install button')
        const [installBillion] = page.byAttr(UI_ATTR.memoryInstall, BILLION_CONTEXT)
        assert.ok(installBillion, `uninstalled ${BILLION_CONTEXT} must show [data-onboarding-memory-install="${BILLION_CONTEXT}"]`)

        // Triggering install opens shared Fishball install dialog inspecting billion-context
        await page.press(installBillion)
        const inspected = await page.until(() => page.requestsOf('POST', INSTANCE_ROUTES.pluginsInspect).some((r) => r.body?.spec === BILLION_CONTEXT))
        assert.ok(inspected, `expected install dialog to inspect "${BILLION_CONTEXT}"`)

        // When billion-context is present in child inventory, it shows as installed and Continue advances to Step 4
        const pageWithBillion = await openOnboardingPage(t, sdk, {
          installedFishballBundles: [{ name: BILLION_CONTEXT, version: '1.0.0', enabled: true }],
        })
        await pageWithBillion.mountGate()
        await advanceToStep(pageWithBillion, UI_STEP.memory)
        assert.equal(pageWithBillion.byAttr(UI_ATTR.memoryInstall, BILLION_CONTEXT).length, 0, `${BILLION_CONTEXT} should be marked installed when in child inventory`)

        await pageWithBillion.press(pageWithBillion.byAttr(UI_ATTR.next)[0])
        await waitForStep(pageWithBillion, UI_STEP.welcome)
        assert.deepEqual(page.world.errors, [])
        assert.deepEqual(pageWithBillion.world.errors, [])
      })
    })

    describe('Step 4, Back Navigation, Skip on Any Step, and Locales (ST + EP)', () => {
      test('ST-1: full 4-step flow with two-dropdown effort model -> welcome summary displays formatted label with effort -> clicking Start posts complete("completed") and renders frame', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        // Choose a reasoning model + effort (OpenAI / GPT-5 -> High) in Step 1 dropdowns
        await page.select(modelSelectOf(page), KEY_GPT5)
        await page.select(effortSelectOf(page), MODEL_FIXTURE.gpt5.efforts.high.id)
        assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelSaved).length >= 1))

        // Navigate Steps 1 -> 2 -> 3 -> 4
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.watchdog)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.memory)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.welcome)

        const welcomeNodes = page.byAttr(UI_ATTR.welcome)
        assert.equal(welcomeNodes.length, 1, 'Step 4 must render [data-onboarding-welcome]')
        assert.ok(
          textOf(welcomeNodes[0]).includes(MODEL_FIXTURE.gpt5.highSummaryLabel),
          `Step 4 welcome summary must include "${MODEL_FIXTURE.gpt5.highSummaryLabel}"; got: ${textOf(welcomeNodes[0])}`,
        )
        const [startBtn] = page.byAttr(UI_ATTR.start)
        assert.ok(startBtn, 'Step 4 must render [data-onboarding-start]')

        await page.press(startBtn)
        assert.ok(await page.until(() => page.hasFrame()), 'clicking Start must transition immediately to renderFrame()')
        const completes = page.requestsOf('POST', ONBOARDING_ROUTES.complete)
        assert.equal(completes.length, 1)
        assert.deepEqual(completes[0].body, { outcome: ONBOARDING_CONTRACT.outcome.completed })
        assert.deepEqual(page.world.errors, [])
      })

      test('ST-2: Back button navigates cleanly 4 -> 3 -> 2 -> 1 without losing Step 1 selection', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        // Select a model in Step 1
        await page.select(modelSelectOf(page), KEY_PLAIN)
        assert.ok(await page.until(() => String(modelSelectOf(page).props.value) === KEY_PLAIN))

        // Forward to Step 4
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.watchdog)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.memory)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.welcome)

        // Backward: 4 -> 3 -> 2 -> 1
        await page.press(page.byAttr(UI_ATTR.back)[0])
        await waitForStep(page, UI_STEP.memory)
        await page.press(page.byAttr(UI_ATTR.back)[0])
        await waitForStep(page, UI_STEP.watchdog)
        await page.press(page.byAttr(UI_ATTR.back)[0])
        await waitForStep(page, UI_STEP.fishballModel)

        // Step 1 selection state preserved
        assert.equal(
          String(modelSelectOf(page).props.value),
          KEY_PLAIN,
          'Step 1 selected model must be preserved after navigating back',
        )
        assert.deepEqual(page.world.errors, [])
      })

      for (const step of [UI_STEP.fishballModel, UI_STEP.watchdog, UI_STEP.memory, UI_STEP.welcome]) {
        test(`ST-3: Skip button on step "${step}" posts complete("skipped") and transitions immediately to renderFrame()`, async (t) => {
          const page = await openOnboardingPage(t, sdk)
          await page.mountGate()
          await advanceToStep(page, step)

          const [skipBtn] = page.byAttr(UI_ATTR.skipAll)
          assert.ok(skipBtn, `expected [data-onboarding-skip-all] on step ${step}`)
          await page.press(skipBtn)

          assert.ok(await page.until(() => page.hasFrame()), `skip on ${step} must transition immediately to renderFrame()`)
          const completes = page.requestsOf('POST', ONBOARDING_ROUTES.complete)
          assert.equal(completes.length, 1)
          assert.deepEqual(completes[0].body, { outcome: ONBOARDING_CONTRACT.outcome.skipped })
          assert.deepEqual(page.world.errors, [])
        })
      }

      test('EP: en and zh locales render distinct translated copy across all 4 steps with zero missing keys', async (t) => {
        const snapshots = {}
        for (const lang of LANGS) {
          const page = await openOnboardingPage(t, sdk, { lang })
          await page.mountGate()
          const texts = []
          for (const step of [UI_STEP.fishballModel, UI_STEP.watchdog, UI_STEP.memory, UI_STEP.welcome]) {
            await waitForStep(page, step)
            const txt = page.text()
            assert.ok(txt.length > 0, `empty text on step ${step} for locale ${lang}`)
            texts.push(txt)
            if (step !== UI_STEP.welcome) await page.press(page.byAttr(UI_ATTR.next)[0])
          }
          assert.deepEqual(page.missingKeys, [], `missing locale keys for ${lang}: ${JSON.stringify(page.missingKeys)}`)
          assert.deepEqual(page.world.errors, [])
          snapshots[lang] = texts
        }

        // Verify en and zh actually differ on every step (not hardcoded English everywhere)
        for (let i = 0; i < 4; i += 1) {
          assert.notEqual(snapshots.en[i], snapshots.zh[i], `step ${i + 1} should have distinct en vs zh translations`)
          assert.match(snapshots.zh[i], /[\u4e00-\u9fff]/, `step ${i + 1} zh locale should contain Chinese characters`)
        }
      })
    })
  })
}
