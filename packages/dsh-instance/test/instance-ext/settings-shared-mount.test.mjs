/**
 * PBS: the shared main-card mounts of the hosted-only settings sections (R-B, R-B1, R-B2), black-box.
 *
 * V3 R-HOST-11 / task R-CORE (4): the sections that show the main card's status line moved out of the
 * generic panel into the instance-owned bundle `fishball-hosted-settings`, which registers them into
 * core's settings-section extension point; the panel's own style sheet stays with core's generic
 * panel, so the shared card's mounts are now locale.register → mountStyles (no mountStyle).
 *
 * packages/dsh-instance/src/child-settings/client.js is a classic `window.__ModuleLoader__.load({id, factory})`
 * script, loaded here in node:vm the same way page-open-session-page.mjs loads the page. React is
 * the exported shim of test/support/rp-recommend.mjs (nothing is rendered: the mounts under test
 * happen in a ctx.effect, not in a component). Only the module's documented inject surfaces
 * (`fishballSettingsSections` through `ctx.get`, and `locale`) and `ctx.effect` are faked; any other ctx access is recorded so a
 * failing precondition names it.
 *
 * Driving the loader: `require.async('./client.status.js')` returns a thenable whose fulfil/reject
 * handlers the case keeps. Calling the fulfil handler is "the loader reaches ready". Calling it again
 * after a successful mount is the only black-box way to make the loader notify its listeners again
 * (R-B2 control); a real promise settles once, so that call stands for any later notification.
 *
 * Techniques: BVA over the position of the throwing mount (none, 1st, 2nd = last, past the last), EP over the
 * loader's outcome (ready / failed), ST over (loading, ready, disposed). Each case names its technique.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createReactShim } from '../../../../test/support/rp-recommend.mjs'
import { settle } from './page-open-session-page.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const PBS = Object.freeze({
  client: path.join(HERE, '..', '..', 'src', 'child-settings', 'client.js'),
  moduleId: 'fishball-hosted-settings',
  /** Core's settings-section extension point, the service the hosted sections register into. */
  sectionsService: 'fishballSettingsSections',
  sharedChunk: './client.status.js',
  baseURI: 'http://child.test/',
  modules: Object.freeze({ react: 'react', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  sharedLocale: 'pbs-shared-locale',
  sharedDictionaries: Object.freeze({ en: Object.freeze({ title: 'PBS shared' }) }),
  loadFailure: 'PBS chunk load failure',
})

/**
 * The mounts in R-B order; `site` names the fake that mounts or throws. `style` (the panel's own
 * sheet) is core's generic panel's now, not the hosted sections': a call to it is out of order.
 */
const MOUNT = Object.freeze({ locale: 'locale.register', styles: 'shared.mountStyles', style: 'shared.mountStyle' })
const MOUNT_ORDER = Object.freeze([MOUNT.locale, MOUNT.styles])

/** Minimal fake primitives: a Button host element is all the factory needs at load time. */
function fakePrimitives(React) {
  return { Button: function Button({ children, ...rest }) { return React.createElement('button', { type: 'button', ...rest }, children) } }
}

/** A thenable whose handlers stay callable: the case decides when (and how often) the loader settles. */
function controllableChunk() {
  const handlers = []
  return {
    handlers,
    then(onFulfilled, onRejected) { handlers.push({ onFulfilled, onRejected }); return new Promise(() => {}) },
  }
}

/**
 * Load and apply the settings row.
 * @param options.throwAt - one MOUNT value whose call throws its sentinel, or none.
 */
function bootSettings({ throwAt } = {}) {
  const shim = createReactShim({ stale() {} })
  const React = shim.React
  const mounts = []
  const live = new Set()
  const unexpected = []
  const chunks = []
  const effects = []
  let inEffect = null
  const fault = throwAt ? Object.assign(new Error('PBS sentinel: ' + throwAt), { pbsSentinel: throwAt }) : undefined

  /** Record one mount: it becomes live, and its disposer (idempotent, as DSH's are) removes it. */
  function mount(site) {
    mounts.push(site)
    if (site === throwAt) throw fault
    live.add(site)
    let done = false
    return () => { if (done) return; done = true; live.delete(site) }
  }

  const shared = {
    locale: PBS.sharedLocale,
    dictionaries: PBS.sharedDictionaries,
    mountStyles: () => mount(MOUNT.styles),
    mountStyle: () => mount(MOUNT.style),
  }
  /** Core's extension point as the hosted sections see it; sections are accepted and not rendered. */
  const sectionsService = {
    register: () => () => {},
    reactSection: () => ({ mount() {}, unmount() {} }),
    classes: { section: 'pbs-section', row: 'pbs-row', hint: 'pbs-hint', error: 'pbs-error' },
  }

  let registered
  const window = { __ModuleLoader__: { load(entry) { registered = entry } }, addEventListener() {}, removeEventListener() {}, location: new URL(PBS.baseURI) }
  const document = { baseURI: PBS.baseURI, documentElement: { lang: 'en' } }
  const sandbox = { window, document, URL, URLSearchParams, AbortController, queueMicrotask, structuredClone, console, setTimeout, clearTimeout }
  sandbox.globalThis = sandbox
  window.document = document
  vm.createContext(sandbox)
  vm.runInContext(readFileSync(PBS.client, 'utf8'), sandbox, { filename: PBS.client })
  if (!registered || registered.id !== PBS.moduleId || typeof registered.factory !== 'function') throw new Error('client.js did not register ' + PBS.moduleId + ' through __ModuleLoader__.load')

  const modules = { [PBS.modules.react]: React, [PBS.modules.primitives]: fakePrimitives(React) }
  const requireFn = (name) => {
    if (!(name in modules)) throw new Error('unexpected require ' + name)
    return modules[name]
  }
  requireFn.async = (name) => {
    const chunk = controllableChunk()
    chunks.push({ name, chunk, effect: inEffect })
    return chunk
  }
  const plugin = registered.factory(requireFn)

  const localeListeners = new Set()
  const guarded = (label, target) => new Proxy(target, {
    get(object, name) {
      if (typeof name === 'string' && !(name in object) && name !== 'then') unexpected.push(label + '.' + name)
      return object[name]
    },
  })
  const ctx = guarded('ctx', {
    effect(execute) {
      const record = { dispose: undefined }
      effects.push(record)
      const previous = inEffect
      inEffect = record
      try { record.dispose = execute() } finally { inEffect = previous }
      return record.dispose
    },
    get(name) {
      if (name !== PBS.sectionsService) { unexpected.push('ctx.get(' + String(name) + ')'); return undefined }
      return guarded(PBS.sectionsService, sectionsService)
    },
    locale: guarded('locale', {
      // The row may register other namespaces of its own (outside R-B); only the shared card's
      // registration is the R-B mount under test.
      register(namespace, dictionaries) {
        if (namespace !== PBS.sharedLocale) return () => {}
        assert.equal(dictionaries, PBS.sharedDictionaries, 'locale.register gets shared.dictionaries')
        return mount(MOUNT.locale)
      },
      bind: () => (key) => key,
      subscribe(fn) { localeListeners.add(fn); return () => localeListeners.delete(fn) },
      getSnapshot: () => 0,
      getLocale: () => ({ active: 'en', locales: [{ id: 'en', label: 'English' }], revision: 0 }),
    }),
  })
  plugin.apply(ctx)

  /** Every handler of the shared chunk reaches ready (fulfils with {shared}); returns what each threw. */
  function ready() { return notify((handler) => handler.onFulfilled?.({ shared })) }
  function fail() { return notify((handler) => handler.onRejected?.(new Error(PBS.loadFailure))) }
  function notify(call) {
    const thrown = []
    for (const { chunk } of sharedChunks()) for (const handler of chunk.handlers) { try { call(handler) } catch (error) { thrown.push(error) } }
    return thrown
  }
  const sharedChunks = () => chunks.filter((entry) => entry.name === PBS.sharedChunk)
  /** Row teardown: every effect's disposer, in reverse order, as the fiber does; returns what threw. */
  function teardownRow() {
    const thrown = []
    for (const record of [...effects].reverse()) if (typeof record.dispose === 'function') { try { record.dispose() } catch (error) { thrown.push(error) } }
    return thrown
  }
  return { mounts, live, fault, unexpected, chunks, sharedChunks, effects, ready, fail, teardownRow }
}

/** Precondition shared by every case: the effect asked for the shared chunk through require.async. */
function assertLoaderStarted(row) {
  assert.deepEqual(row.unexpected, [], 'no ctx surface outside the sections service, locale and effect is used')
  assert.ok(row.sharedChunks().length >= 1, "an effect calls require.async('" + PBS.sharedChunk + "')")
  assert.ok(row.sharedChunks().every((entry) => entry.effect !== null), 'the chunk is requested from inside a ctx.effect')
}

// ---------------------------------------------------------------------------------------------
// R-B / R-B1: mount order and removal of earlier mounts when a later one throws
// ---------------------------------------------------------------------------------------------

/** BVA over the failing position: none, 1st, 2nd (the last), past the last. Expected live set before teardown. */
const MOUNT_ROWS = Object.freeze([
  Object.freeze({ id: 'PBS-BVA-01', technique: 'BVA (no throw)', throwAt: undefined, attempted: MOUNT_ORDER, liveBefore: MOUNT_ORDER }),
  Object.freeze({ id: 'PBS-BVA-02', technique: 'BVA (1st mount throws)', throwAt: MOUNT.locale, attempted: MOUNT_ORDER.slice(0, 1), liveBefore: Object.freeze([]) }),
  // V3: the 2nd mount is the last one; the former 3rd position (the panel sheet) moved to core.
  Object.freeze({ id: 'PBS-BVA-03', technique: 'BVA (2nd = last mount throws)', throwAt: MOUNT.styles, attempted: MOUNT_ORDER, liveBefore: MOUNT_ORDER.slice(0, 1) }),
  // Just past the last position: the panel sheet's mountStyle is core's, so a fault there is never reached.
  Object.freeze({ id: 'PBS-BVA-04', technique: 'BVA (past the last: mountStyle would throw)', throwAt: MOUNT.style, attempted: MOUNT_ORDER, liveBefore: MOUNT_ORDER }),
])

describe('PBS R-B1 fishball-hosted-settings: shared card mounts are removed by row teardown even when a later mount throws', () => {
  for (const row of MOUNT_ROWS) {
    const label = row.throwAt ? row.throwAt + ' throws' : 'every mount succeeds'
    it(`${row.id} ${row.technique}: ${label}`, async () => {
      const world = bootSettings({ throwAt: row.throwAt })
      assertLoaderStarted(world)
      assert.deepEqual(world.mounts, [], 'nothing is mounted while the loader is still loading')
      // The listener's own throw is not specified by R-B1; it is caught here, not asserted.
      world.ready()
      await settle()
      // Mounting stops at the throw (a later part is never attempted after an earlier one threw).
      assert.deepEqual(world.mounts, [...row.attempted], 'mounts run in order locale.register → mountStyles, up to the throw')
      assert.deepEqual([...world.live], [...row.liveBefore], 'precondition: the parts before the throw are mounted')
      world.teardownRow()
      assert.deepEqual([...world.live], [], 'row teardown removes every part that was mounted')
    })
  }
})

// ---------------------------------------------------------------------------------------------
// R-B2 control and loader state transitions
// ---------------------------------------------------------------------------------------------

describe('PBS R-B / R-B2 fishball-hosted-settings: loader notifications and teardown', () => {
  it('PBS-ST-05 ST ready → ready again (control, R-B2): a later loader notification mounts nothing twice', async () => {
    const world = bootSettings()
    assertLoaderStarted(world)
    world.ready()
    await settle()
    assert.deepEqual(world.mounts, [...MOUNT_ORDER], 'precondition: one successful mount')
    world.ready()
    await settle()
    assert.deepEqual(world.mounts, [...MOUNT_ORDER], 'no part is mounted a second time')
    world.teardownRow()
    assert.deepEqual([...world.live], [])
  })

  it('PBS-ST-06 ST loading → disposed → ready: the disposer unsubscribes from the loader, so nothing mounts', async () => {
    const world = bootSettings()
    assertLoaderStarted(world)
    world.teardownRow()
    world.ready()
    await settle()
    assert.deepEqual(world.mounts, [], 'a ready notification after teardown mounts nothing')
  })

  it('PBS-ST-07 ST ready → disposed → ready: no remount after teardown', async () => {
    const world = bootSettings()
    assertLoaderStarted(world)
    world.ready()
    await settle()
    world.teardownRow()
    assert.deepEqual([...world.live], [], 'precondition: teardown removed all parts')
    world.ready()
    await settle()
    assert.deepEqual(world.mounts, [...MOUNT_ORDER], 'no part is mounted again after teardown')
    assert.deepEqual([...world.live], [])
  })

  it('PBS-EP-08 EP (loader fails): nothing is mounted and teardown is clean', async () => {
    const world = bootSettings()
    assertLoaderStarted(world)
    world.fail()
    await settle()
    assert.deepEqual(world.mounts, [], 'a failed chunk load mounts no part')
    world.teardownRow()
    assert.deepEqual([...world.live], [])
  })
})
