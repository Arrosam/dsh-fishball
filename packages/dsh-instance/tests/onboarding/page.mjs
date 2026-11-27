import assert from 'node:assert/strict'
import { parseJson } from '@dsh-instance/test-helpers/json'
import { json as jsonResponse, openPage, trackLocale } from '@dsh-instance/test-helpers/page'
import { primitivesFor } from '@dsh-instance/test-helpers/primitives'
import { findAll, textOf } from '@dsh-instance/test-helpers/react-shim'
import { PACKAGE_DIR } from '../support/instance.mjs'
import { FIXTURE, INSTANCE_ROUTES, ONBOARDING_ROUTES, PORTAL, UI_ATTR, WATCHDOG_NS, WATCHDOG_STATE } from './constants.mjs'

/**
 * Scripted DSH main page for `packages/dsh-instance/client.js` + `client.onboarding.js`.
 * Exposes the registered portal `Gate` and all network/service side effects.
 */
export async function openOnboardingPage(t, sdk, {
  lang = 'en',
  onboardingState = { ok: true, completed: false, needed: true, childReady: true, model: null, catalog: FIXTURE.catalog },
  failState = false,
  instanceStatus = { state: 'ready', code: null, detail: null, notice: null, busy: false },
  watchdogMode = WATCHDOG_STATE.ready,
  watchdogInitialModel = undefined,
  mainBundles = [],
  mainPlugins = [],
  pluginManagerMode = 'full',
  strictRemoteProxy = false,
  hostCatalog = FIXTURE.catalog,
  installedFishballBundles = [],
  missingProviders = FIXTURE.missingProviders,
  syncedCatalog = FIXTURE.syncedCatalog,
  respond = () => undefined,
} = {}) {
  let currentWatchdogMode = watchdogMode
  const world = {
    state: structuredClone(onboardingState),
    failState,
    status: { ...instanceStatus },
    hostCatalog: structuredClone(hostCatalog),
    installedFishballBundles: structuredClone(installedFishballBundles),
    mainBundles: structuredClone(mainBundles),
    mainPlugins: structuredClone(mainPlugins),
    requests: [],
    watchdogCalls: { set: [], unset: [], mutate: [] },
    watchdogModel: watchdogInitialModel,
  }

  const answer = (method, pathname, rawBody) => {
    const body = rawBody ? parseJson(rawBody) : undefined
    const scripted = respond(method, pathname, body, world)
    if (scripted !== undefined) {
      return Promise.resolve(scripted).then((v) => (v instanceof Response ? v : jsonResponse(v)))
    }
    if (pathname === ONBOARDING_ROUTES.state && method === 'GET') {
      if (world.failState) return Promise.reject(new TypeError('fbtest network failure'))
      return jsonResponse(world.state)
    }
    if (pathname === ONBOARDING_ROUTES.model && method === 'POST') {
      world.state = { ...world.state, model: body }
      return jsonResponse({ ok: true, model: body })
    }
    if (pathname === ONBOARDING_ROUTES.complete && method === 'POST') {
      world.state = { ...world.state, completed: true, needed: false, outcome: body?.outcome }
      return jsonResponse({ ok: true, completed: true, outcome: body?.outcome })
    }
    if (pathname === INSTANCE_ROUTES.status && method === 'GET') {
      return jsonResponse(world.status)
    }
    if (pathname === INSTANCE_ROUTES.modelsCheck && method === 'POST') {
      return jsonResponse({
        ok: true,
        result: { checkId: FIXTURE.checkId, missing: structuredClone(missingProviders), notOffered: [], present: [] },
      })
    }
    if (pathname === INSTANCE_ROUTES.modelsAdd && method === 'POST') {
      const ids = body?.ids ?? []
      // Merge syncedCatalog into world.state.catalog so subsequent state refresh sees new models
      const existingGroups = world.state?.catalog?.groups ?? []
      world.state = {
        ...world.state,
        catalog: { groups: [...existingGroups, ...structuredClone(syncedCatalog.groups)] },
      }
      return jsonResponse({
        ok: true,
        result: { items: ids.map((id) => ({ id, outcome: 'added' })) },
      })
    }
    if (pathname === INSTANCE_ROUTES.pluginsList && method === 'GET') {
      return jsonResponse({ ok: true, bundles: world.installedFishballBundles, protected: [] })
    }
    if (pathname === INSTANCE_ROUTES.pluginsInspect && method === 'POST') {
      const inspection = {
        status: 'accepted',
        kind: 'registry',
        name: body?.spec,
        version: '1.0.0',
        spec: body?.spec,
        source: { kind: 'registry', spec: body?.spec },
        summary: { name: body?.spec, version: '1.0.0' },
      }
      return jsonResponse({ ok: true, value: inspection, inspection })
    }
    return new Response('', { status: 404 })
  }

  // Model configForms matching `@deepseek-ai/dsh-client-ui-settings` SDK contract
  const formListeners = new Map()
  const notifyForm = (ns) => { for (const fn of [...(formListeners.get(ns) ?? [])]) fn() }
  const isWatchdogServed = () => currentWatchdogMode === WATCHDOG_STATE.ready || currentWatchdogMode === WATCHDOG_STATE.unsupported
  const watchdogSchemaOf = () => (currentWatchdogMode === WATCHDOG_STATE.ready
    ? { type: 'object', dict: { model: { type: 'object', dict: { provider: { type: 'string' }, model: { type: 'string' }, reasoningEffort: { type: 'string' } } } } }
    : { type: 'object', dict: { enabled: { type: 'boolean' } } })

  const makeNamespaces = () => {
    const list = [{
      ns: FIXTURE.rowId,
      autoGenerate: false,
      schema: { type: 'object', dict: { enabled: { type: 'boolean' } } },
      value: { enabled: true },
      applies: 'live',
      secrets: [],
      revision: 1,
    }]
    if (isWatchdogServed()) {
      list.push({
        ns: WATCHDOG_NS,
        autoGenerate: false,
        schema: watchdogSchemaOf(),
        value: currentWatchdogMode === WATCHDOG_STATE.ready
          ? (world.watchdogModel ? { model: world.watchdogModel } : {})
          : { enabled: true },
        applies: 'live',
        secrets: [],
        revision: 1,
      })
    }
    return list
  }

  let describeSnapshot = {
    status: 'ready',
    view: { writable: true, hasDocument: true, namespaces: makeNamespaces() },
    error: null,
  }
  const describeListeners = new Set()
  const formRefreshers = new Map()
  const whileServedSubscriptions = []
  const refreshDescribe = () => {
    describeSnapshot = {
      status: 'ready',
      view: { writable: true, hasDocument: true, namespaces: makeNamespaces() },
      error: null,
    }
    for (const refresh of formRefreshers.values()) refresh()
    for (const fn of [...describeListeners]) fn()
    const served = new Set(makeNamespaces().map((n) => n.ns))
    for (const sub of whileServedSubscriptions) sub.sync(served)
  }

  const formCache = new Map()
  const getForm = (ns) => {
    if (formCache.has(ns)) return formCache.get(ns)
    const getSnap = () => {
      if (ns === WATCHDOG_NS) {
        if (!isWatchdogServed()) {
          return { status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false }
        }
        return {
          status: 'ready',
          value: currentWatchdogMode === WATCHDOG_STATE.ready
            ? (world.watchdogModel ? { model: world.watchdogModel } : {})
            : { enabled: true },
          base: {},
          user: world.watchdogModel ? { model: world.watchdogModel } : {},
          revision: 1,
          writable: true,
        }
      }
      return { status: 'ready', value: { enabled: true }, base: { enabled: true }, user: {}, revision: 1, writable: true }
    }
    let cachedSnap = getSnap()
    formRefreshers.set(ns, () => { cachedSnap = getSnap(); notifyForm(ns) })
    const form = {
      getSnapshot: () => cachedSnap,
      subscribe(fn) {
        if (!formListeners.has(ns)) formListeners.set(ns, new Set())
        formListeners.get(ns).add(fn)
        return () => formListeners.get(ns)?.delete(fn)
      },
      async set(field, value) {
        if (ns === WATCHDOG_NS) {
          world.watchdogCalls.set.push({ field, value })
          if (field === 'model') world.watchdogModel = value
        }
        cachedSnap = getSnap()
        refreshDescribe()
        notifyForm(ns)
        return true
      },
      async unset(field) {
        if (ns === WATCHDOG_NS) {
          world.watchdogCalls.unset.push({ field })
          if (field === 'model') world.watchdogModel = undefined
        }
        cachedSnap = getSnap()
        refreshDescribe()
        notifyForm(ns)
        return true
      },
      async mutate(ops, rev) {
        if (ns === WATCHDOG_NS) world.watchdogCalls.mutate.push({ ops, rev })
        cachedSnap = getSnap()
        refreshDescribe()
        notifyForm(ns)
        return true
      },
    }
    formCache.set(ns, form)
    return form
  }

  const configForms = {
    get: getForm,
    describe: () => ({
      getSnapshot: () => describeSnapshot,
      subscribe: (fn) => { describeListeners.add(fn); return () => describeListeners.delete(fn) },
      ensure: async () => {},
      acceptView: () => {},
    }),
    whileServed(namespaces, register) {
      const wanted = [namespaces].flat()
      let dispose = null
      let active = false
      const sub = {
        sync(served) {
          const matched = wanted.filter((n) => served.has(n))
          if (matched.length > 0 && !active) {
            active = true
            dispose = register(new Set(matched))
          } else if (matched.length === 0 && active) {
            active = false
            const prev = dispose
            dispose = null
            if (typeof prev === 'function') prev()
          }
        },
      }
      whileServedSubscriptions.push(sub)
      sub.sync(new Set(makeNamespaces().map((n) => n.ns)))
      return () => {
        const idx = whileServedSubscriptions.indexOf(sub)
        if (idx >= 0) whileServedSubscriptions.splice(idx, 1)
        if (active && typeof dispose === 'function') dispose()
        active = false
        dispose = null
      }
    },
  }

  const remoteListeners = new Map()
  const emitRemote = (event, payload) => {
    for (const fn of [...(remoteListeners.get(event) ?? [])]) fn(payload)
  }
  const pluginManagerFace = pluginManagerMode === 'full'
    ? {
        listBundles: async () => ({ ok: true, value: structuredClone(world.mainBundles) }),
        listPlugins: async () => ({ ok: true, value: structuredClone(world.mainPlugins) }),
      }
    : pluginManagerMode === 'no-list'
      ? {}
      : undefined

  const remote = {
    $on: (event, fn) => {
      if (!remoteListeners.has(event)) remoteListeners.set(event, new Set())
      remoteListeners.get(event).add(fn)
      return () => remoteListeners.get(event)?.delete(fn)
    },
    session: {
      modelCatalog: async () => ({
        ok: true,
        value: {
          default: FIXTURE.modelA,
          routableProviders: world.hostCatalog.groups.map((g) => g.id),
          groups: structuredClone(world.hostCatalog.groups),
          failures: [],
        },
      }),
    },
  }
  if (strictRemoteProxy) {
    Object.defineProperty(remote, 'pluginManager', {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('cannot get property "remote.pluginManager" without inject')
      },
    })
  } else if (pluginManagerFace !== undefined) {
    remote.pluginManager = pluginManagerFace
  }

  // Provide `dshConnectorUiPortal` to capture the registered OnboardingGate
  let activeGate = null
  const portalRegistrations = []
  const portal = {
    apiVersion: PORTAL.apiVersion,
    registerGate(Gate) {
      activeGate = Gate
      portalRegistrations.push(Gate)
      return () => { if (activeGate === Gate) activeGate = null }
    },
  }

  const { missingKeys, decorateLocale } = trackLocale()
  const page = await openPage(t, {
    sdk, packageDir: PACKAGE_DIR, id: FIXTURE.rowId, entry: FIXTURE.entryFile, lang, base: FIXTURE.pageBase,
    primitives: (React) => primitivesFor(sdk, React, { modal: true }),
    respond({ method, path, body }) {
      world.requests.push({ method, path, body: body ? parseJson(body) : undefined, rawBody: body })
      return answer(method, path, body)
    },
    decorateLocale,
    services: () => ({
      configForms, remote, 'remote.session': remote.session, [PORTAL.serviceName]: portal,
      ...(pluginManagerFace === undefined ? {} : { 'remote.pluginManager': pluginManagerFace }),
    }),
  })
  world.errors = page.errors
  const { shim, React, settle: settleAll } = page
  // The real web shell mounts shell.overlay; this hosts the shared Fishball install dialog.
  for (const [index, entry] of page.entriesOf('shell.overlay').entries()) {
    await page.mountEntry('shell-overlay-' + index, entry)
  }
  assert.ok(activeGate, 'client.onboarding.js did not register a Gate: ' + page.errors.join('; '))

  const GATE_KEY = 'onboarding-gate'
  const api = {
    world,
    shim,
    missingKeys,
    portalRegistrations,
    get gate() { return activeGate },
    settle: settleAll,
    until: page.until,
    emitRemote,
    async updateWatchdog({ mode, mainBundles: nextBundles, mainPlugins: nextPlugins } = {}) {
      if (mode !== undefined) currentWatchdogMode = mode
      if (nextBundles !== undefined) world.mainBundles = structuredClone(nextBundles)
      if (nextPlugins !== undefined) world.mainPlugins = structuredClone(nextPlugins)
      refreshDescribe()
      emitRemote('plugin-manager/changed', {})
      emitRemote('config-forms/changed', {})
      await settleAll()
    },
    async mountGate({ title = FIXTURE.windowTitle } = {}) {
      assert.ok(activeGate, 'client.onboarding.js did not register a Gate in dshConnectorUiPortal')
      const renderFrame = () => React.createElement('div', { [UI_ATTR.testFrame]: 'mounted' }, 'CHILD_FRAME')
      shim.mount(GATE_KEY, () => React.createElement(activeGate, { title, renderFrame }))
      await settleAll()
    },
    async unmountGate() {
      shim.unmountRoot(GATE_KEY)
      await settleAll()
    },
    tree: () => shim.treeOf(GATE_KEY),
    find: (predicate) => findAll(shim.treeOf(GATE_KEY), predicate),
    byAttr: (attr, value) => findAll(
      shim.treeOf(GATE_KEY),
      (n) => n.props[attr] !== undefined && n.props[attr] !== false && (value === undefined || String(n.props[attr]) === String(value)),
    ),
    text: () => shim.treeOf(GATE_KEY).map(textOf).join(' ').replace(/\s+/g, ' ').trim(),
    hasFrame: () => findAll(shim.treeOf(GATE_KEY), (n) => n.props[UI_ATTR.testFrame] === 'mounted').length > 0,
    requestsOf: (method, pathname) => world.requests.filter((r) => r.method === method && r.path === pathname),
    press: page.press,
    async select(node, value) {
      assert.ok(node, 'no select element')
      const target = { value }
      node.props.onChange?.({ target, currentTarget: target, preventDefault() {} })
      await settleAll()
    },
  }
  return api
}
