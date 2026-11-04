/**
 * Requirement-only refresh coverage through registered settings UI and real host API.
 * EP: healthy/empty/partial catalogs; HTTP/network/JSON/application/schema failures.
 * BVA: 0/1/many models; first/repeated click; absent/current/disappearing identity.
 * DT: confirmed {none,A} x outcome {success,failure,empty}; draft unchanged, no implicit Save.
 * ST: load -> refresh pending -> success/failure -> retry; stale and unmounted completion.
 * No production source/constants/diffs are inspected or imported by the test author.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UI, nodes, textOf } from './support/dedicated-model-client.mjs'
import { MODEL_CASE as M } from './support/dedicated-model.mjs'
import { REFRESH as C, FAILURES, accessibleName, catalog, emptyCatalog, identity, nearestSharedContainer, withRefresh } from './support/model-list-refresh.mjs'
import { refreshHost, HOST_REFRESH as H } from './support/model-list-refresh-host.mjs'

const pendingFeedback = driver => C.labels.loading.test(driver.text) || nodes(driver.section, node => node.props?.[C.attributes.ariaBusy] === true || node.props?.[C.attributes.ariaBusy] === String(true)).length > C.zero
const modelOptions = driver => driver.options.filter(option => option.props.value !== C.empty)

// These are semantic/structural checks, not a claim about pixel placement or a real keyboard engine.
describe('Model catalog refresh: registered settings UI', () => {
  it('MR-01 EP: named keyboard-capable Refresh sits beside the named model picker, not beside Save', () => withRefresh(async driver => {
    const button = driver.refresh
    assert.ok(button.type === C.tag.button || /button/i.test(String(button.type)) || button.props.role === C.values.button, 'Refresh uses a semantic button control')
    assert.match(accessibleName(button, driver.section), C.labels.refresh, 'Refresh has an accessible action name')
    assert.notEqual(button.props.tabIndex, C.last, 'Refresh is not removed from keyboard navigation')
    const picker = driver.picker
    const labels = nodes(driver.section, node => node.type === C.tag.label && (node.props.htmlFor === picker.props.id && picker.props.id || nodes(node, item => item === picker).length))
    assert.ok(accessibleName({ props: { [C.attributes.ariaLabel]: picker.props[C.attributes.ariaLabel], [C.attributes.ariaLabelledBy]: picker.props[C.attributes.ariaLabelledBy] } }, driver.section).trim() || labels.some(label => textOf(label).trim()), 'model picker has an associated accessible name')
    const shared = nearestSharedContainer(driver.section, picker, button)
    assert.ok(shared, 'picker and Refresh share a local control container')
    assert.equal(nodes(shared, node => node === driver.save).length, C.zero, 'Refresh is grouped with picker rather than in the Save action row')
    driver.assertReadOnly(true)
  }))

  it('MR-02 BVA/ST: every completed click re-fetches the same endpoint and displays newly configured options without reload', () => withRefresh(async (driver, _harness, transport) => {
    const before = transport.requests.length
    const first = await driver.beginRefresh()
    assert.equal(transport.requests.length, before + C.one)
    assert.ok(pendingFeedback(driver), 'pending refresh has visible loading or busy feedback')
    assert.ok(driver.optionFor(C.model.old), 'last usable options stay available while fetching')
    await driver.respond(first.request, catalog([C.model.old, C.model.fresh]))
    await first.completion
    assert.ok(driver.optionFor(C.model.fresh), 'new model appears from fresh host catalog')
    assert.equal(driver.optionFor(C.model.draft), undefined, 'removed unselected model does not remain cached')
    const second = await driver.beginRefresh()
    assert.equal(transport.requests.length, before + C.two, 'a later click is not served by component cache')
    await driver.respond(second.request, catalog([C.model.latest]))
    await second.completion
    assert.ok(driver.optionFor(C.model.latest))
    assert.equal(driver.optionFor(C.model.fresh), undefined)
    assert.equal(Boolean(driver.refresh.props.disabled), false, 'successful refresh can be repeated')
    assert.equal(pendingFeedback(driver), false, 'loading ends after resolution')
    for (const request of transport.requests) {
      assert.equal(request.url.pathname, C.api.models, 'same host configured-model catalog endpoint')
      assert.equal(request.options.method ?? C.method.get, C.method.get, 'refresh reads instead of mutating')
      const cache = request.options.cache
      const headers = new Headers(request.options.headers)
      assert.ok([C.values.noStore, C.values.reload, C.values.noCache].includes(cache) || /no-cache|no-store/.test(headers.get('cache-control') ?? C.empty), 'observable request flags bypass a stale browser response')
    }
    driver.assertReadOnly(true)
  }))

  for (const initial of C.initialStates) {
    for (const failure of FAILURES) {
      it('MR-03 EP/DT/ST: ' + initial.name + '; ' + failure.name + ' retains last usable list and recovers', () => withRefresh(async driver => {
        const before = driver.snapshot()
        const value = driver.picker.props.value
        const pending = await driver.beginRefresh()
        driver.assertReadOnly(initial.blocked)
        await driver.fail(pending.request, failure)
        await pending.completion
        assert.deepEqual(driver.snapshot(), before, 'failed refresh cannot replace the last usable option list')
        assert.equal(driver.picker.props.value, value, 'failure cannot silently select or clear a model')
        assert.match(driver.text, C.labels.error, 'catalog failure is visible')
        assert.equal(Boolean(driver.refresh.props.disabled), false, 'failed refresh remains retryable')
        assert.equal(pendingFeedback(driver), false, 'loading ends on failure')
        driver.assertReadOnly(initial.blocked)
        const retry = await driver.beginRefresh()
        await driver.respond(retry.request, catalog([C.model.fresh]))
        await retry.completion
        assert.ok(driver.optionFor(C.model.fresh), 'manual retry recovers without page reload')
        driver.assertReadOnly(initial.blocked)
      }, { selection: initial.selection } ))
    }
  }

  for (const failure of FAILURES) {
    it('MR-04 EP/ST: initial ' + failure.name + ' is recoverable by the same Refresh control', () => withRefresh(async driver => {
      assert.match(driver.text, C.labels.error, 'initial failure is visible')
      driver.assertReadOnly(true)
      const retry = await driver.beginRefresh()
      await driver.respond(retry.request, catalog([C.model.fresh]))
      await retry.completion
      assert.ok(driver.optionFor(C.model.fresh))
      assert.equal(Boolean(driver.refresh.props.disabled), false)
      driver.assertReadOnly(true)
    }, { initialFailure: failure }))
  }

  it('MR-04b EP/DT: per-provider failures are reported without rejecting successful provider groups', () => withRefresh(async driver => {
    const pending = await driver.beginRefresh()
    await driver.respond(pending.request, catalog([C.model.fresh], { failures: [C.partialFailure] }))
    await pending.completion
    const available = driver.optionFor(C.model.fresh)
    assert.ok(available, 'successful provider model remains visible')
    assert.equal(Boolean(available.props.disabled), false, 'partial failure does not disable successful provider models')
    assert.ok(C.labels.error.test(driver.text) || driver.text.includes(C.partialFailure.name) || driver.text.includes(C.partialFailure.message), 'per-provider error remains visible')
    const value = await driver.choose(C.model.fresh)
    assert.equal(driver.picker.props.value, value, 'successful partial catalog remains selectable')
    driver.assertReadOnly(true)
  }))

  for (const models of [[], [C.model.fresh]]) {
    it('MR-05 BVA: refreshed catalog has ' + models.length + ' available models without creating consent', () => withRefresh(async driver => {
      const pending = await driver.beginRefresh()
      await driver.respond(pending.request, models.length ? catalog(models) : emptyCatalog())
      await pending.completion
      assert.equal(modelOptions(driver).length, models.length, 'zero/first model boundaries render accurately')
      assert.equal(driver.picker.props.value, C.empty, 'catalog membership never silently chooses a model')
      if (!models.length) assert.match(driver.text, C.labels.empty, 'valid empty catalog has a useful empty state')
      driver.assertReadOnly(true)
    }))
  }

  it('MR-06 BVA/DT: initial empty catalog still provides a recoverable Refresh action', () => withRefresh(async driver => {
    assert.equal(modelOptions(driver).length, C.zero)
    assert.match(driver.text, C.labels.empty)
    const pending = await driver.beginRefresh()
    await driver.respond(pending.request, catalog([C.model.fresh]))
    await pending.completion
    assert.ok(driver.optionFor(C.model.fresh))
    driver.assertReadOnly(true)
  }, { initialCatalog: emptyCatalog() }))

  for (const next of [{ name: 'other successful models', value: () => catalog([C.model.fresh]) }, { name: 'zero successful groups', value: emptyCatalog }]) {
    it('MR-07 DT/ST: saved model disappearing into ' + next.name + ' stays visible as unavailable', () => withRefresh(async driver => {
      const value = driver.picker.props.value
      const pending = await driver.beginRefresh()
      await driver.respond(pending.request, next.value())
      await pending.completion
      driver.assertUnavailable(value, C.model.old)
      assert.match(driver.text, C.labels.unavailable, 'missing current model warning remains visible even when catalog is empty')
      driver.assertReadOnly(false)
      const retry = await driver.beginRefresh()
      await driver.respond(retry.request, catalog())
      await retry.completion
      assert.equal(driver.picker.props.value, value, 'reappearing saved identity remains selected')
      assert.doesNotMatch(textOf(driver.selected), C.labels.unavailable, 'availability label clears when host offers the model again')
      driver.assertReadOnly(false)
    }, { selection: { ...identity(), reasoningEffort: C.effort } }))
  }

  it('MR-08 EP: a saved model absent from the initial host catalog is visible rather than a blank native select', () => withRefresh(async driver => {
    driver.assertUnavailable(driver.picker.props.value, C.model.old)
    driver.assertReadOnly(false)
  }, { selection: identity(), initialCatalog: emptyCatalog() }))

  it('MR-08b EP: same model id in another provider does not silently satisfy a missing saved provider/model identity', () => withRefresh(async driver => {
    driver.assertUnavailable(driver.picker.props.value, C.model.old)
    const offered = driver.options.filter(option => String(option.props.value).includes(C.model.old))
    assert.equal(offered.length, C.two, 'saved missing route and distinct available route are both visible')
    assert.equal(offered.filter(option => !option.props.disabled).length, C.one, 'only the route actually offered by the catalog is available')
    driver.assertReadOnly(false)
  }, { selection: identity(), initialCatalog: catalog([C.model.old], { provider: C.provider.other }) }))

  for (const initial of [{ name: 'unconfirmed first draft', selection: null, blocked: true }, { name: 'replacement of saved model', selection: identity(), blocked: false }]) {
    it('MR-09 DT/ST: ' + initial.name + ' survives success, failure, and disappearing-draft refresh', () => withRefresh(async driver => {
      const value = await driver.choose(C.model.draft)
      const good = await driver.beginRefresh()
      await driver.respond(good.request, catalog([C.model.old, C.model.draft, C.model.fresh]))
      await good.completion
      assert.equal(driver.picker.props.value, value, 'successful refresh preserves an unsaved draft')
      const bad = await driver.beginRefresh()
      await driver.fail(bad.request, FAILURES[C.one])
      await bad.completion
      assert.equal(driver.picker.props.value, value, 'failed refresh preserves an unsaved draft')
      const missing = await driver.beginRefresh()
      await driver.respond(missing.request, emptyCatalog())
      await missing.completion
      driver.assertUnavailable(value, C.model.draft)
      driver.assertReadOnly(initial.blocked)
    }, { selection: initial.selection }))
  }

  it('MR-09b DT: saved A and unsaved B both stay visibly unavailable after a completely empty refresh', () => withRefresh(async driver => {
    const draftValue = await driver.choose(C.model.draft)
    const savedValue = driver.optionFor(C.model.old)?.props.value
    assert.ok(savedValue, 'saved identity was visible before refresh')
    const pending = await driver.beginRefresh()
    await driver.respond(pending.request, emptyCatalog())
    await pending.completion
    driver.assertUnavailable(draftValue, C.model.draft)
    const saved = driver.options.find(option => option.props.value === savedValue)
    assert.ok(saved, 'saved identity remains an option even while another draft is selected')
    assert.match(textOf(saved), C.labels.unavailable)
    assert.ok(textOf(saved).includes(C.model.old))
    driver.assertReadOnly(false)
  }, { selection: identity() }))

  for (const staleFailure of [false, true]) {
    it('MR-10 ST: immediate repeated activation either stays single-flight or rejects an older ' + (staleFailure ? 'failure' : 'success'), () => withRefresh(async (driver, _harness, transport) => {
      const before = transport.requests.length
      const first = await driver.beginRefresh()
      // React commits discrete input events before the next click. A disabled native
      // button cannot emit that second click; invoking its old callback synchronously
      // would invent an interaction the browser does not perform.
      const second = driver.refresh.props.disabled ? Promise.resolve() : Promise.resolve(driver.refresh.props.onClick())
      await driver.flush()
      const active = transport.requests.slice(before)
      assert.ok(active.length >= C.one && active.length <= C.two, 'double activation produces no unbounded request loop')
      assert.ok(pendingFeedback(driver))
      const latest = active.at(C.last)
      await driver.respond(latest, catalog([C.model.latest]))
      if (active.length === C.two) {
        const older = active[C.zero]
        if (staleFailure) await driver.fail(older, FAILURES[C.one]); else await driver.respond(older, catalog([C.model.stale]))
      }
      await Promise.all([first.completion, second])
      await driver.flush()
      assert.ok(driver.optionFor(C.model.latest), 'latest successful catalog stays visible')
      assert.equal(driver.optionFor(C.model.stale), undefined, 'older response cannot replace the latest catalog')
      assert.equal(Boolean(driver.refresh.props.disabled), false)
      driver.assertReadOnly(true)
    }))
  }

  it('MR-10b BVA (synthetic React batch): two activations before commit cannot cancel both refresh requests', () => withRefresh(async (driver, _harness, transport) => {
    const before = transport.requests.length
    const click = driver.refresh.props.onClick
    const first = Promise.resolve(click())
    const second = Promise.resolve(click())
    await driver.flush()
    const active = transport.requests.slice(before)
    assert.ok(active.length >= C.one && active.length <= C.two, 'batched activations still request the host catalog')
    await driver.respond(active.at(C.last), catalog([C.model.latest]))
    for (const obsolete of active.slice(C.zero, C.last)) await driver.respond(obsolete, catalog([C.model.stale]))
    await Promise.all([first, second])
    await driver.flush()
    assert.ok(driver.optionFor(C.model.latest))
    assert.equal(driver.optionFor(C.model.stale), undefined)
    driver.assertReadOnly(true)
  }))

  for (const oldFailure of [false, true]) {
    it('MR-11 ST: an unmounted pending ' + (oldFailure ? 'failure' : 'success') + ' cannot replace the newly mounted settings catalog', () => withRefresh(async (driver, harness, transport) => {
      const obsolete = transport.latest
      harness.unmount()
      await driver.mount(null)
      const current = transport.latest
      assert.notEqual(current, obsolete, 'newly mounted settings request their own catalog')
      await driver.respond(current, catalog([C.model.latest]))
      if (oldFailure) await driver.fail(obsolete, FAILURES[C.one]); else await driver.respond(obsolete, catalog([C.model.stale]))
      assert.ok(driver.optionFor(C.model.latest))
      assert.equal(driver.optionFor(C.model.stale), undefined)
      assert.equal(Boolean(driver.refresh.props.disabled), false)
      driver.assertReadOnly(true)
    }, { holdInitial: true }))
  }

  it('MR-12 ST/regression dfdb: Refresh then explicit Save accepts the full POST confirmation before any SSE', () => withRefresh(async (driver, harness) => {
    const pending = await driver.beginRefresh()
    await driver.respond(pending.request, UI.catalog)
    await pending.completion
    const option = driver.options.find(node => String(node.props.value).includes(M.selection.model))
    assert.ok(option)
    driver.picker.props.onChange({ target: { value: option.props.value } })
    await driver.flush()
    const saving = Promise.resolve(driver.save.props.onClick())
    await driver.flush()
    assert.deepEqual(harness.sent.at(C.last), { pathname: C.api.select, body: M.selection })
    assert.equal(harness.blocks.has(UI.fishball), true, 'pending Save does not grant consent')
    await harness.reply(true, { ok: true, state: harness.state(M.selection) })
    await saving
    await driver.flush()
    assert.equal(harness.blocks.has(UI.fishball), false, 'full HTTP confirmation alone unlocks composer')
    assert.equal(driver.picker.props.value, option.props.value, 'saved model remains selected without SSE')
  }))
})

// The separate local-only provider fixture changes models at runtime, never credentials,
// profile state, or host policy. Only the public API and sessionController catalog are compared.
describe('Model catalog refresh: real isolated host endpoint', () => {
  it('MR-H01 EP/BVA/ST: dynamic host catalog and partial-provider failure remain fresh and read-only', { timeout: H.timeoutMs }, async () => {
    const w = await refreshHost()
    try {
      const selection = { provider: H.providers.good, model: H.models.first, reasoningEffort: H.effort }
      const saved = await w.host.post(C.api.select, selection)
      assert.equal(saved.status, C.http.ok, saved.text)
      assert.equal(saved.json?.ok, true, saved.text)
      assert.deepEqual(saved.json.state?.modelSelection, selection, 'precondition: saved model has a real reasoning effort')
      const before = await w.snapshots()
      const initial = await w.host.get(C.api.models)
      assert.equal(initial.status, C.http.ok, initial.text)
      assert.equal(initial.json?.ok, true)
      assert.deepEqual(initial.json.catalog, await w.probe(H.operations.catalog), 'endpoint is the same sessionController.modelCatalog used by host selectors')
      assert.ok(JSON.stringify(initial.json.catalog).includes(H.models.first))
      await w.probe(H.operations.configure, { models: [H.models.next], broken: true })
      const changed = await w.host.get(C.api.models)
      assert.equal(changed.status, C.http.ok, changed.text)
      assert.equal(changed.json?.ok, true)
      assert.deepEqual(changed.json.catalog, await w.probe(H.operations.catalog))
      const good = changed.json.catalog.groups.find(group => group.id === H.providers.good)
      assert.deepEqual(good?.models.map(model => model.id), [H.models.next], 'each GET reflects new provider models without host restart')
      assert.ok(changed.json.catalog.failures.some(failure => JSON.stringify(failure).includes(H.providers.broken)), 'host reports failed provider in catalog.failures')
      assert.deepEqual(await w.snapshots(), before, 'catalog refresh preserves dedicated model, session effort, DSH defaults, settings')
      // Reuse the actual host failure entry contract instead of inventing a private shape.
      await withRefresh(async driver => {
        const pending = await driver.beginRefresh()
        await driver.respond(pending.request, changed.json.catalog)
        await pending.completion
        const available = driver.optionFor(H.models.next)
        assert.ok(available, 'successful provider options remain usable beside a failed provider')
        assert.equal(Boolean(available.props.disabled), false)
        assert.ok(C.labels.error.test(driver.text) || driver.text.includes(H.providers.broken), 'partial provider failure is reported visibly')
        driver.assertReadOnly(true)
      })
      await w.probe(H.operations.configure, { models: [], broken: false })
      const empty = await w.host.get(C.api.models)
      assert.deepEqual(empty.json?.catalog, await w.probe(H.operations.catalog))
      assert.equal(empty.json.catalog.groups.some(group => group.id === H.providers.good && group.models.length), false)
      assert.deepEqual(await w.snapshots(), before)
    } finally { await w.host.stop() }
  })
})
