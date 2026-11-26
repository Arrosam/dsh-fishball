/**
 * Part 4 tests: Multi-Step, Multi-Page Onboarding UI (`client.onboarding.js` via `client.js`).
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { textOf } from '../../../support/rp-recommend.mjs'
import {
  BILLION_CONTEXT,
  CHILD_MODEL_CONTRACT,
  FIXTURE,
  INSTANCE_ROUTES,
  LANGS,
  MEMORY_PLUGINS,
  MODEL_FIXTURE,
  MODEL_SELECTED_LABEL,
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

    describe('Step 1: Fishball model sync & two-step model/effort picker (EP + BVA + DT + ST)', () => {
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

      test('EP / BVA: model picker renders one button per model (not expanded by efforts) with JSON [provider,model] key & "provider / model" aria-label', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        assert.equal(page.byAttr(UI_ATTR.modelPicker).length, 1, 'must render [data-onboarding-model-picker]')
        const choices = page.byAttr(UI_ATTR.modelChoice)
        // FIXTURE.catalog has 3 models (1 plain + 2 with 2 efforts each): must render 3 buttons, NOT 5
        assert.equal(choices.length, 3, 'must render exactly one button per model, never expanded per reasoning effort')

        assert.deepEqual(
          choices.map((n) => n.props[UI_ATTR.modelChoice]),
          [KEY_PLAIN, KEY_REASONER, KEY_GPT5],
        )
        assert.deepEqual(
          choices.map((n) => n.props['aria-label']),
          [MODEL_FIXTURE.plain.ariaLabel, MODEL_FIXTURE.reasoner.ariaLabel, MODEL_FIXTURE.gpt5.ariaLabel],
        )
        assert.equal(page.byAttr(UI_ATTR.effortPicker).length, 0, 'effort picker hidden before selecting a model with efforts')
        assert.deepEqual(page.world.errors, [])
      })

      test('DT-1 (plain model, no reasoning.efforts): clicking posts {provider,model} immediately, keeps effort picker hidden, shows Selected (en & zh)', async (t) => {
        for (const lang of LANGS) {
          const page = await openOnboardingPage(t, sdk, { lang })
          await page.mountGate()
          await waitForStep(page, UI_STEP.fishballModel)

          const [plainBtn] = page.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)
          assert.ok(plainBtn)
          await page.press(plainBtn)

          assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))
          const post = page.requestsOf('POST', ONBOARDING_ROUTES.model)[0]
          assert.deepEqual(post.body, { provider: MODEL_FIXTURE.plain.provider, model: MODEL_FIXTURE.plain.model })
          assert.equal('reasoningEffort' in post.body, false, 'plain model must omit reasoningEffort')

          assert.equal(page.byAttr(UI_ATTR.effortPicker).length, 0, 'effort picker must not render for model without efforts')
          assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelSaved).length >= 1), 'must show [data-onboarding-model-saved]')

          const [updatedBtn] = page.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)
          assert.equal(String(updatedBtn.props['aria-pressed']), 'true')
          assert.ok(textOf(updatedBtn).includes(MODEL_SELECTED_LABEL[lang]), `expected "${MODEL_SELECTED_LABEL[lang]}" in row: ${textOf(updatedBtn)}`)
          assert.deepEqual(page.missingKeys, [])
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('DT-2 (model with reasoning.efforts): clicking model reveals effort picker with hint, exposes aria-expanded, sends 0 POSTs; clicking effort posts {provider,model,reasoningEffort} and updates badges', async (t) => {
        for (const lang of LANGS) {
          const page = await openOnboardingPage(t, sdk, { lang })
          await page.mountGate()
          await waitForStep(page, UI_STEP.fishballModel)

          const [reasonerBtn] = page.byAttr(UI_ATTR.modelChoice, KEY_REASONER)
          assert.notEqual(String(reasonerBtn.props['aria-expanded']), 'true', 'inactive effort-capable model must not be aria-expanded="true"')
          await page.press(reasonerBtn)

          // Must NOT post yet
          await page.settle()
          assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 0, 'clicking a model with efforts must NOT immediately POST')
          assert.equal(String(page.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0].props['aria-pressed']), 'true')
          assert.equal(String(page.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0].props['aria-expanded']), 'true', 'active effort-capable model must expose aria-expanded="true"')
          assert.notEqual(String(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0].props['aria-expanded']), 'true', 'other effort-capable model must not be aria-expanded="true"')

          // Effort picker appears directly for that model with one button per effort
          const [picker] = page.byAttr(UI_ATTR.effortPicker, 'true')
          assert.ok(picker, 'must reveal [data-onboarding-effort-picker="true"]')
          assert.equal(picker.props[UI_ATTR.effortModel], KEY_REASONER)
          const effortBtns = page.byAttr(UI_ATTR.effortChoice)
          assert.deepEqual(
            effortBtns.map((n) => n.props[UI_ATTR.effortChoice]),
            [MODEL_FIXTURE.reasoner.efforts.medium.id, MODEL_FIXTURE.reasoner.efforts.high.id],
          )
          for (const eb of effortBtns) assert.notEqual(String(eb.props['aria-pressed']), 'true')

          // Unsaved effort hint is visible while active model differs from saved model
          const hintBeforeSave = textOf(picker)
          assert.ok(hintBeforeSave.length > 0)
          assert.deepEqual(page.missingKeys, [], `missing locale keys in ${lang}: ${JSON.stringify(page.missingKeys)}`)

          // Click 'high' effort -> posts { provider, model, reasoningEffort: 'high' }
          await page.press(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.reasoner.efforts.high.id)[0])
          assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))
          assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[0].body, {
            provider: MODEL_FIXTURE.reasoner.provider,
            model: MODEL_FIXTURE.reasoner.model,
            reasoningEffort: MODEL_FIXTURE.reasoner.efforts.high.id,
          })

          assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelSaved).length >= 1))
          assert.equal(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.reasoner.efforts.high.id)[0].props['aria-pressed']), 'true')
          assert.notEqual(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.reasoner.efforts.medium.id)[0].props['aria-pressed']), 'true')

          // Model row shows Selected + effort display name ("High")
          const savedRowText = textOf(page.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0])
          assert.ok(savedRowText.includes(MODEL_SELECTED_LABEL[lang]), `expected ${MODEL_SELECTED_LABEL[lang]} in: ${savedRowText}`)
          assert.ok(savedRowText.includes(MODEL_FIXTURE.reasoner.efforts.high.name), `expected effort display name "${MODEL_FIXTURE.reasoner.efforts.high.name}" in: ${savedRowText}`)

          // Unsaved effort hint hidden once saved (picker text shrinks without the unsaved hint)
          const pickerTextAfterSave = textOf(page.byAttr(UI_ATTR.effortPicker, 'true')[0])
          assert.ok(pickerTextAfterSave.length < hintBeforeSave.length, 'unsaved effort hint should hide once active model is saved')
          assert.deepEqual(page.world.errors, [])
        }
      })

      test('ST-3 (switching models & changing effort): Model A -> Model B does not overwrite saved Model A until effort clicked; re-picking effort updates saved effort; switching to plain hides effort picker', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        // Save Model A (deepseek-reasoner + high)
        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0])
        await page.press(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.reasoner.efforts.high.id)[0])
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))

        // Switch to Model B (gpt-5, also has efforts) -> effort picker switches, NO POST yet, Model A stays saved
        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0])
        await page.settle()
        assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 1, 'switching to Model B must not POST before effort is chosen')
        assert.equal(page.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel], KEY_GPT5)
        assert.deepEqual(
          page.byAttr(UI_ATTR.effortChoice).map((n) => n.props[UI_ATTR.effortChoice]),
          [MODEL_FIXTURE.gpt5.efforts.low.id, MODEL_FIXTURE.gpt5.efforts.high.id],
        )
        assert.equal(String(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0].props['aria-pressed']), 'true')
        assert.notEqual(String(page.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0].props['aria-pressed']), 'true')
        // Model A row STILL displays Selected + High
        const rowAText = textOf(page.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0])
        assert.ok(rowAText.includes(MODEL_SELECTED_LABEL.en) && rowAText.includes(MODEL_FIXTURE.reasoner.efforts.high.name), 'Model A must stay saved until Model B effort is chosen')

        // Click Model B effort 'low' -> saves Model B + low
        await page.press(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.low.id)[0])
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 2))
        assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[1].body, {
          provider: MODEL_FIXTURE.gpt5.provider,
          model: MODEL_FIXTURE.gpt5.model,
          reasoningEffort: MODEL_FIXTURE.gpt5.efforts.low.id,
        })
        assert.equal(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.low.id)[0].props['aria-pressed']), 'true')
        assert.ok(textOf(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0]).includes(MODEL_FIXTURE.gpt5.efforts.low.name))

        // Click different effort 'high' on already-saved Model B -> posts new effort
        await page.press(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0])
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 3))
        assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[2].body, {
          provider: MODEL_FIXTURE.gpt5.provider,
          model: MODEL_FIXTURE.gpt5.model,
          reasoningEffort: MODEL_FIXTURE.gpt5.efforts.high.id,
        })
        assert.equal(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0].props['aria-pressed']), 'true')
        assert.notEqual(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.low.id)[0].props['aria-pressed']), 'true')
        assert.ok(textOf(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0]).includes(MODEL_FIXTURE.gpt5.efforts.high.name))

        // Switch to plain model -> posts immediately and hides effort picker
        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)[0])
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 4))
        assert.deepEqual(page.requestsOf('POST', ONBOARDING_ROUTES.model)[3].body, {
          provider: MODEL_FIXTURE.plain.provider,
          model: MODEL_FIXTURE.plain.model,
        })
        assert.equal(page.byAttr(UI_ATTR.effortPicker).length, 0)
        assert.deepEqual(page.world.errors, [])
      })

      test('ST-4 (initial mount & Back with pre-saved effort model + BVA raw effort fallback & missing effort hint): auto-displays effort picker with saved effort pressed', async (t) => {
        // Initial mount with already-saved model + effort
        const page = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: FIXTURE.modelB, // { provider: 'openai', model: 'gpt-5', reasoningEffort: 'high' }
            catalog: FIXTURE.catalog,
          },
        })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        assert.equal(String(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0].props['aria-pressed']), 'true')
        assert.equal(String(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0].props['aria-expanded']), 'true')
        const [picker] = page.byAttr(UI_ATTR.effortPicker, 'true')
        assert.ok(picker, 'effort picker must auto-open for pre-saved model with efforts')
        assert.equal(picker.props[UI_ATTR.effortModel], KEY_GPT5)
        assert.equal(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0].props['aria-pressed']), 'true')
        assert.ok(textOf(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0]).includes(MODEL_SELECTED_LABEL.en))
        assert.ok(textOf(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0]).includes(MODEL_FIXTURE.gpt5.efforts.high.name))

        // Navigate forward to Step 2 and back to Step 1 -> effort picker & pressed effort still shown
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.watchdog)
        await page.press(page.byAttr(UI_ATTR.back)[0])
        await waitForStep(page, UI_STEP.fishballModel)
        assert.equal(page.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel], KEY_GPT5)
        assert.equal(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0].props['aria-pressed']), 'true')

        // BVA: unknown saved reasoningEffort id falls back to displaying the raw id
        const pageRaw = await openOnboardingPage(t, sdk, {
          onboardingState: {
            ok: true,
            completed: false,
            needed: true,
            childReady: true,
            model: { provider: MODEL_FIXTURE.gpt5.provider, model: MODEL_FIXTURE.gpt5.model, reasoningEffort: MODEL_FIXTURE.gpt5.customEffortId },
            catalog: FIXTURE.catalog,
          },
        })
        await pageRaw.mountGate()
        await waitForStep(pageRaw, UI_STEP.fishballModel)
        assert.ok(
          textOf(pageRaw.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0]).includes(MODEL_FIXTURE.gpt5.customEffortId),
          'unknown effort id must fall back to displaying raw model.reasoningEffort',
        )

        // BVA: saved effort-capable model without reasoningEffort still shows effort hint until an effort is saved
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
        const pickerMissingEffortText = textOf(pageNoEffort.byAttr(UI_ATTR.effortPicker, 'true')[0])
        await pageNoEffort.press(pageNoEffort.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0])
        assert.ok(await pageNoEffort.until(() => pageNoEffort.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))
        const pickerSavedEffortText = textOf(pageNoEffort.byAttr(UI_ATTR.effortPicker, 'true')[0])
        assert.ok(
          pickerSavedEffortText.length < pickerMissingEffortText.length,
          'effort hint must display when saved effort-capable model lacks reasoningEffort and hide once an effort is saved',
        )

        assert.deepEqual(page.world.errors, [])
        assert.deepEqual(pageRaw.world.errors, [])
        assert.deepEqual(pageNoEffort.world.errors, [])
      })

      test('ST-5 (catalog refresh drops active model): clears stale effort picker cleanly, or falls back to still-present saved effort model without resurrecting cleared selection', async (t) => {
        // Sub-case A: no saved model, active effort model disappears -> effort picker clears
        let replaceCatalog = false
        const page = await openOnboardingPage(t, sdk, {
          respond: (method, pathname) => {
            if (pathname === INSTANCE_ROUTES.modelsAdd && method === 'POST') {
              replaceCatalog = true
              return { ok: true, result: { items: [{ id: 'anthropic-main', outcome: 'added' }] } }
            }
            if (pathname === ONBOARDING_ROUTES.state && method === 'GET' && replaceCatalog) {
              // Refreshed catalog ONLY contains anthropic/claude-sonnet-4 (openai/gpt-5 disappeared)
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

        // Open effort picker for openai/gpt-5
        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0])
        assert.equal(page.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel], KEY_GPT5)

        // Sync refreshes catalog without openai/gpt-5 -> stale effort picker must disappear
        await page.press(page.byAttr(UI_ATTR.syncButton)[0])
        assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelChoice).length === 1 && page.text().includes(MODEL_FIXTURE.syncedName)))
        assert.equal(page.byAttr(UI_ATTR.effortPicker).length, 0, 'stale effort picker must be cleared when active model leaves catalog')
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
        assert.equal(pageFallback.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel], KEY_REASONER)
        assert.equal(String(pageFallback.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.reasoner.efforts.high.id)[0].props['aria-pressed']), 'true')

        // Temporarily click openai/gpt-5 (unsaved selectedModelKey)
        await pageFallback.press(pageFallback.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0])
        assert.equal(pageFallback.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel], KEY_GPT5)
        assert.equal(String(pageFallback.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0].props['aria-pressed']), 'true')

        // Sync #1: drops openai/gpt-5 -> must fall back cleanly to saved deepseek-reasoner + high
        await pageFallback.press(pageFallback.byAttr(UI_ATTR.syncButton)[0])
        assert.ok(await pageFallback.until(() => pageFallback.byAttr(UI_ATTR.modelChoice, KEY_GPT5).length === 0))
        assert.equal(
          pageFallback.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel],
          KEY_REASONER,
          'dropping unsaved selectedModelKey must fall back to still-present saved effort model',
        )
        assert.equal(String(pageFallback.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0].props['aria-pressed']), 'true')
        assert.equal(String(pageFallback.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.reasoner.efforts.high.id)[0].props['aria-pressed']), 'true')

        // Sync #2: restores openai/gpt-5 -> cleared selectedModelKey must NOT resurrect openai/gpt-5
        await pageFallback.press(pageFallback.byAttr(UI_ATTR.syncButton)[0])
        assert.ok(await pageFallback.until(() => pageFallback.byAttr(UI_ATTR.modelChoice, KEY_GPT5).length === 1))
        assert.equal(
          pageFallback.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel],
          KEY_REASONER,
          'cleared selectedModelKey must not resurrect when dropped model reappears in later catalog refresh',
        )
        assert.equal(String(pageFallback.byAttr(UI_ATTR.modelChoice, KEY_REASONER)[0].props['aria-pressed']), 'true')
        assert.notEqual(String(pageFallback.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0].props['aria-pressed']), 'true')
        assert.deepEqual(pageFallback.world.errors, [])
      })

      test('DT-3 (disabled states & concurrent click guard): model/effort buttons disabled while saving or !childReady, and synchronous rapid double-click sends only 1 POST', async (t) => {
        // Case A: while saving (in-flight POST /onboarding/model) + synchronous rapid double-click guard
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

        // Reveal effort picker for gpt-5, then fire two synchronous rapid clicks before React re-renders
        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0])
        holdSave = deferred()
        const [highEffortBtn] = page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)
        highEffortBtn.props.onClick?.()
        highEffortBtn.props.onClick?.()
        await page.settle()
        assert.equal(page.requestsOf('POST', ONBOARDING_ROUTES.model).length, 1, 'rapid concurrent clicks must be guarded synchronously and send only 1 POST')

        for (const btn of page.byAttr(UI_ATTR.modelChoice)) {
          assert.equal(Boolean(btn.props.disabled), true, 'all model buttons must be disabled while saving')
        }
        for (const btn of page.byAttr(UI_ATTR.effortChoice)) {
          assert.equal(Boolean(btn.props.disabled), true, 'all effort buttons must be disabled while saving')
        }

        // Release save -> buttons re-enable
        holdSave.resolve()
        holdSave = null
        assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelChoice).every((b) => !b.props.disabled)))
        assert.ok(page.byAttr(UI_ATTR.effortChoice).every((b) => !b.props.disabled))

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
        for (const btn of pageNotReady.byAttr(UI_ATTR.modelChoice)) {
          assert.equal(Boolean(btn.props.disabled), true, 'all model buttons must be disabled when !childReady')
        }
        for (const btn of pageNotReady.byAttr(UI_ATTR.effortChoice)) {
          assert.equal(Boolean(btn.props.disabled), true, 'all effort buttons must be disabled when !childReady')
        }
        assert.deepEqual(page.world.errors, [])
        assert.deepEqual(pageNotReady.world.errors, [])
      })

      test('EP-SaveFailure: {ok: false} on plain model or effort save shows role="alert" without highlighting failed model or clobbering prior saved effort model', async (t) => {
        const failModelSave = (method, pathname) => {
          if (pathname === ONBOARDING_ROUTES.model && method === 'POST') {
            return { ok: false, code: CHILD_MODEL_CONTRACT.code.writeFailed }
          }
          return undefined
        }

        // 1. No prior saved model: plain model failure & effort save failure
        const page = await openOnboardingPage(t, sdk, { respond: failModelSave })
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)[0])
        assert.ok(await page.until(() => page.find((n) => n.props.role === 'alert').length >= 1), 'expected role="alert" on plain model save failure')
        assert.equal(page.byAttr(UI_ATTR.modelSaved).length, 0, 'must not show saved badge on failure')
        assert.notEqual(String(page.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)[0].props['aria-pressed']), 'true', 'failed plain model must not be highlighted as aria-pressed="true"')
        assert.equal(textOf(page.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)[0]).includes(MODEL_SELECTED_LABEL.en), false)

        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0])
        await page.press(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0])
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 2))
        assert.ok(page.find((n) => n.props.role === 'alert').length >= 1, 'expected role="alert" on effort save failure')
        assert.equal(page.byAttr(UI_ATTR.modelSaved).length, 0, 'must not show saved badge on effort save failure')
        assert.notEqual(String(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0].props['aria-pressed']), 'true')
        assert.equal(textOf(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0]).includes(MODEL_SELECTED_LABEL.en), false)
        assert.deepEqual(page.world.errors, [])

        // 2. Prior saved effort model (openai/gpt-5 + high) -> clicking failing plain model preserves saved model & effort picker cleanly
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

        await pageWithSaved.press(pageWithSaved.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)[0])
        assert.ok(await pageWithSaved.until(() => pageWithSaved.find((n) => n.props.role === 'alert').length >= 1), 'expected role="alert" when plain model switch fails')
        assert.notEqual(
          String(pageWithSaved.byAttr(UI_ATTR.modelChoice, KEY_PLAIN)[0].props['aria-pressed']),
          'true',
          'failed plain model must not get phantom aria-pressed="true"',
        )
        assert.equal(
          String(pageWithSaved.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0].props['aria-pressed']),
          'true',
          'prior saved effort model must stay highlighted after plain model save failure',
        )
        const gpt5RowText = textOf(pageWithSaved.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0])
        assert.ok(gpt5RowText.includes(MODEL_SELECTED_LABEL.en) && gpt5RowText.includes(MODEL_FIXTURE.gpt5.efforts.high.name))
        assert.equal(
          pageWithSaved.byAttr(UI_ATTR.effortPicker, 'true')[0]?.props[UI_ATTR.effortModel],
          KEY_GPT5,
          'prior saved effort picker must stay intact after plain model save failure',
        )
        assert.equal(String(pageWithSaved.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0].props['aria-pressed']), 'true')
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
      test('ST-1: full 4-step flow with two-step effort model -> welcome summary displays formatted label with effort -> clicking Start posts complete("completed") and renders frame', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        // Choose a two-step effort model (OpenAI / GPT-5 -> High) in Step 1
        await page.press(page.byAttr(UI_ATTR.modelChoice, KEY_GPT5)[0])
        await page.press(page.byAttr(UI_ATTR.effortChoice, MODEL_FIXTURE.gpt5.efforts.high.id)[0])
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
        await page.press(page.byAttr(UI_ATTR.modelChoice)[0])
        assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelChoice).some((n) => String(n.props['aria-pressed']) === 'true')))

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
        assert.ok(
          page.byAttr(UI_ATTR.modelChoice).some((n) => String(n.props['aria-pressed']) === 'true'),
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
