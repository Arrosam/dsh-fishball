/**
 * Part 4 tests: Multi-Step, Multi-Page Onboarding UI (`client.onboarding.js` via `client.js`).
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { textOf } from '../../../support/rp-recommend.mjs'
import {
  BILLION_CONTEXT,
  FIXTURE,
  INSTANCE_ROUTES,
  LANGS,
  MEMORY_PLUGINS,
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

    describe('Step 1: Fishball model sync & selection (EP + ST)', () => {
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
        const syncedShown = await page.until(() => page.text().includes('Claude Sonnet 4'))
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

      test('ST-2: clicking a model choice posts onboarding/model, sets aria-pressed="true", and shows saved badge', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        const choices = page.byAttr(UI_ATTR.modelChoice)
        assert.ok(choices.length >= 2, 'expected model choice buttons from catalog')

        await page.press(choices[0])
        assert.ok(await page.until(() => page.requestsOf('POST', ONBOARDING_ROUTES.model).length === 1))

        const post = page.requestsOf('POST', ONBOARDING_ROUTES.model)[0]
        assert.equal(typeof post.body.provider, 'string')
        assert.equal(typeof post.body.model, 'string')
        assert.ok(post.body.provider.length > 0 && post.body.model.length > 0)

        const selected = await page.until(() => page.byAttr(UI_ATTR.modelChoice).some((n) => String(n.props['aria-pressed']) === 'true'))
        assert.ok(selected, 'chosen model button must carry aria-pressed="true"')
        assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelSaved).length >= 1), 'must show [data-onboarding-model-saved]')
        assert.deepEqual(page.world.errors, [])
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
        const modelOpt = options.find((o) => String(o.props.value ?? '') !== '')
        assert.ok(emptyOpt, 'expected empty (disabled) option in watchdog select')
        assert.ok(modelOpt, 'expected at least one model option from remote.session.modelCatalog()')

        // Pick a model -> scope.set('model', selection) + saved badge
        await page.select(page.byAttr(UI_ATTR.watchdogSelect)[0], String(modelOpt.props.value))
        assert.ok(await page.until(() => page.world.watchdogCalls.set.length === 1), 'expected scope.set("model", selection)')
        assert.equal(page.world.watchdogCalls.set[0].field, 'model')
        assert.equal(typeof page.world.watchdogCalls.set[0].value?.provider, 'string')
        assert.equal(typeof page.world.watchdogCalls.set[0].value?.model, 'string')
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
      test('ST-1: full 4-step flow -> welcome screen -> clicking Start posts complete("completed") and renders frame', async (t) => {
        const page = await openOnboardingPage(t, sdk)
        await page.mountGate()
        await waitForStep(page, UI_STEP.fishballModel)

        // Choose a model in Step 1
        await page.press(page.byAttr(UI_ATTR.modelChoice)[0])
        assert.ok(await page.until(() => page.byAttr(UI_ATTR.modelSaved).length >= 1))

        // Navigate Steps 1 -> 2 -> 3 -> 4
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.watchdog)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.memory)
        await page.press(page.byAttr(UI_ATTR.next)[0])
        await waitForStep(page, UI_STEP.welcome)

        assert.equal(page.byAttr(UI_ATTR.welcome).length, 1, 'Step 4 must render [data-onboarding-welcome]')
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
