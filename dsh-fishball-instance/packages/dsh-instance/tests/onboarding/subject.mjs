/** Onboarding services and routes bound to the SDK under test. */
import assert from 'node:assert/strict'
import { Duplex } from 'node:stream'
import { parseJson } from '@dsh-instance/test-helpers/json'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { routeContext } from '../host/fakes.mjs'
import { importInstance } from '../support/instance.mjs'
import { CHILD_MODEL_CONTRACT, FIXTURE, HTTP } from './constants.mjs'

const TASK = 'ONBOARDING'
async function requireModule(sdk, { task, entry, exports }) {
  const mod = await importInstance(sdk, entry)
  for (const name of exports) {
    assert.ok(name in mod, `${task}: ${entry} must export ${name}`)
  }
  return mod
}

export const nativeConstantsModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: 'src/native-runtime/constants.js',
  exports: ['CHILD_MODEL', 'ONBOARDING', 'runtimeLimits'],
})

export const childModelModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: 'src/native-runtime/child-model.js',
  exports: ['normalizeModelSelection', 'sanitizeCatalog', 'createChildModelClient', 'createChildModelReceiver'],
})

export const wireModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: 'src/native-runtime/wire.js',
  exports: ['Wire'],
})

export const onboardingModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: 'src/host/onboarding.js',
  exports: ['createOnboarding'],
})

export const onboardingRoutesModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: 'src/host/onboarding-routes.js',
  exports: ['ONBOARDING_ROUTE', 'registerOnboardingRoutes'],
})

/** Scratch temp dir cleaned up automatically on test end. */
export function tempDir(t) {
  return tempRoot(cleanups(t), FIXTURE.tempPrefix)
}

/** Linked in-memory Duplex stream pair (same stream interface as net.Socket, works in any sandbox). */
function duplexPair() {
  let a
  let b
  a = new Duplex({
    read() {},
    write(chunk, _enc, cb) { b.push(chunk); cb() },
    final(cb) { b.push(null); cb() },
  })
  b = new Duplex({
    read() {},
    write(chunk, _enc, cb) { a.push(chunk); cb() },
    final(cb) { a.push(null); cb() },
  })
  a.on('close', () => { if (!b.destroyed) b.destroy() })
  b.on('close', () => { if (!a.destroyed) a.destroy() })
  return [a, b]
}

/** Real Wire pair over linked Duplex streams (authenticated). */
export async function wirePair(t, sdk) {
  const { Wire } = await wireModule(sdk)
  const { runtimeLimits } = await nativeConstantsModule(sdk)
  const [client, socket] = duplexPair()
  t.after(() => { client.destroy(); socket.destroy() })
  const hostWire = new Wire(client, runtimeLimits())
  const childWire = new Wire(socket, runtimeLimits())
  hostWire.authenticated = true
  childWire.authenticated = true
  return { hostWire, childWire, client, socket }
}

/**
 * Fake DSH child `settings` service matching `@deepseek-ai/dsh-settings` public contract:
 * `describe({ redactSecrets })` -> `{ writable, hasDocument, namespaces: SettingsNamespaceView[] }`
 * `mutate(ns, ops, expectedRevision)` -> updates stored value and increments revision.
 */
export function fakeChildSettings({
  namespacePresent = true,
  initialModel = null,
  revision = 7,
  failMutate = false,
  failDescribe = false,
} = {}) {
  let currentModel = initialModel
  let currentRevision = revision
  const calls = { describe: [], mutate: [] }
  return {
    calls,
    get model() { return currentModel },
    set model(v) { currentModel = v },
    get revision() { return currentRevision },
    async describe(opts) {
      calls.describe.push(opts)
      if (failDescribe) throw new Error('fbtest describe failed')
      return namespacePresent
        ? [{
            ns: CHILD_MODEL_CONTRACT.settingsNamespace,
            autoGenerate: false,
            schema: { type: 'object', dict: { model: { type: 'object' } } },
            value: currentModel === null ? {} : { model: currentModel },
            applies: 'live',
            secrets: [],
            revision: currentRevision,
          }]
        : []
    },
    async mutate(ns, ops, expectedRevision) {
      calls.mutate.push({ ns, ops, expectedRevision })
      if (failMutate) throw new Error('fbtest mutate failed')
      if (!namespacePresent || ns !== CHILD_MODEL_CONTRACT.settingsNamespace) {
        throw new Error('unknown namespace: ' + ns)
      }
      if (expectedRevision !== currentRevision) {
        throw new Error('revision conflict')
      }
      for (const op of ops) {
        if (op.op === 'set' && Array.isArray(op.path) && op.path.length === 1 && op.path[0] === 'model') {
          currentModel = op.value
        }
      }
      currentRevision += 1
      return { ok: true, revision: currentRevision }
    },
  }
}

/**
 * Invoke registered onboarding HTTP routes directly via `routeContext`.
 * Implements DSH's `ctx.connection.requestRejection({ headers })` contract by default
 * (pass `{ withRequestRejection: false }` to test fail-closed behavior when absent).
 */
export async function onboardingRoutesWorld(sdk, onboarding, { withRequestRejection = true } = {}) {
  const { registerOnboardingRoutes, ONBOARDING_ROUTE } = await onboardingRoutesModule(sdk)
  const rc = routeContext()
  if (withRequestRejection) {
    rc.ctx.connection.requestRejection = ({ headers } = {}) => {
      const readHeader = (name) => (typeof headers?.get === 'function' ? headers.get(name) : headers?.[name])
      const origin = readHeader('origin')
      const host = readHeader('host')
      if (!origin) return undefined
      try {
        return new URL(origin).host === host ? undefined : { status: HTTP.forbidden, reason: 'cross-origin' }
      } catch {
        return { status: HTTP.forbidden, reason: 'invalid-origin' }
      }
    }
  }
  registerOnboardingRoutes(rc.ctx, onboarding)

  async function call(method, routePath, {
    body,
    headers = {},
    host = HTTP.host,
    origin = HTTP.origin,
    secFetchSite = 'same-origin',
  } = {}) {
    const route = rc.routes.find((r) => r.path === routePath)
    assert.ok(route, `route not registered: ${routePath}; registered: ${rc.routes.map((r) => r.path).join(', ')}`)
    const reqHeaders = { host }
    if (origin !== undefined) reqHeaders.origin = origin
    if (secFetchSite !== undefined) reqHeaders['sec-fetch-site'] = secFetchSite
    if (body !== undefined) reqHeaders['content-type'] = 'application/json'
    Object.assign(reqHeaders, headers)
    const rawBody = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    const request = new Request(`http://${host}${routePath}`, {
      method,
      headers: reqHeaders,
      ...(rawBody === undefined ? {} : { body: rawBody }),
    })
    const response = await route.fetch(request)
    const text = await response.text()
    return { status: response.status, json: parseJson(text), headers: response.headers, text }
  }

  return { call, routes: rc.routes, ONBOARDING_ROUTE }
}
