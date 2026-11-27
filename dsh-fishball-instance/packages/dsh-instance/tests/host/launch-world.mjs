/** The real host row and native runtime on a scratch home, with the DSH Fetch registry in memory. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { callRoute, fetchRegistry } from '@dsh-instance/test-helpers/routes'
import { swapWorlds } from '@dsh-instance/test-helpers/swap'
import { installAnchor } from '../placement/subject.mjs'
import { PACKAGE_DIR, importInstance, packageFile } from '../support/instance.mjs'
import { ROW as SUPPORT_ROW } from '../support/constants.mjs'
import { K3, MODULE, RECORD, ROUTE, ROW } from './constants.mjs'
import { LAUNCH_WORLD } from './launch-runtime.mjs'
import { ROUTE_ORIGIN, scopeOf } from './worlds.mjs'

export const LAUNCH = Object.freeze({
  methods: Object.freeze({ get: 'GET', post: 'POST' }),
  row: 'dsh-instance',
  startWarn: 'start failed (%s)',
  startFailed: 'NATIVE_START_FAILED',
  preflightManifest: 'PREFLIGHT_MANIFEST',
  childExited: 'CHILD_EXITED',
  lifecycleDir: 'runtime',
  lifecycleLog: 'lifecycle.log',
  lifecycleFailed: 'FAILED',
  spawnObserved: 'FBTEST_SPAWN_OBSERVED',
})

const worlds = swapWorlds(LAUNCH_WORLD, {
  root: PACKAGE_DIR,
  replace: { 'node:child_process': path.join(import.meta.dirname, 'launch-runtime.mjs') },
})

/** The endpoint shape shared by GET status and POST Retry. */
export function statusRoutes(call) {
  const invoke = async (method, route) => {
    const answer = await call(method, route)
    assert.equal(answer.status, ROUTE.ok)
    assert.match(answer.headers.get('content-type') ?? '', ROUTE.json)
    assert.deepEqual(Object.keys(answer.json).sort(), [...ROUTE.statusKeys].sort())
    return answer.json
  }
  return {
    status: () => invoke(LAUNCH.methods.get, ROUTE.status),
    retry: () => invoke(LAUNCH.methods.post, ROUTE.retry),
  }
}

export function startWarns(logs) {
  return logs.filter(({ name, level, args }) => name === LAUNCH.row && level === ROW.warnLevel && args[0] === LAUNCH.startWarn)
    .map(({ args }) => args)
}

export function lifecycle(home) {
  const file = path.join(home, RECORD.dir, LAUNCH.lifecycleDir, LAUNCH.lifecycleLog)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
}

/** Verify appReady kicked off a start before joining it; don't let the fixture initiate a missing start. */
export function startOnReady(fireReady, service) {
  fireReady()
  assert.equal(service.status().state, K3.state.starting, 'appReady starts the instance')
  return service.start()
}

export async function nativeLaunchWorld(t, sdk, home) {
  // The swap hook must be installed after the SDK hook so both tags propagate through host imports.
  await importInstance(sdk, MODULE.constants)
  const scope = scopeOf(t)
  const spawns = []
  const id = worlds.open({ spawn(...args) {
    spawns.push(args)
    // The canonical control can reach the OS boundary, but no case can start a subprocess.
    throw Object.assign(new Error(LAUNCH.spawnObserved), { code: LAUNCH.spawnObserved })
  } })
  scope.defer(() => worlds.close(id))
  const host = await worlds.importIn(id, packageFile(MODULE.host), { [SDK.versionTag]: sdk })
  const registry = fetchRegistry()
  const services = new Map()
  const effects = []
  const logs = []
  let ready
  const ctx = {
    profileContext: { home, dir: home, installAnchor: installAnchor(sdk) },
    workspaceRegistry: { list: () => [] },
    appReady: { onReady(fn) { ready = fn; return () => { ready = undefined } } },
    connection: { fetch: registry.fetch },
    webServer: { getOrigin: () => ROUTE_ORIGIN },
    logger: (name) => Object.fromEntries(SUPPORT_ROW.logLevels.map(level => [level, (...args) => logs.push({ name, level, args })])),
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
    provide: (name, value) => services.set(name, value),
    on: () => () => {},
    get: (name) => services.get(name) ?? ctx[name],
  }
  const dispose = async () => { for (const fn of effects.splice(0).reverse()) await fn() }
  scope.defer(dispose)
  await host.apply(ctx, { [ROW.enabled]: { get: () => true } })
  const routes = statusRoutes((method, route) => callRoute(registry.routes, method, route, { origin: ROUTE_ORIGIN }))
  return {
    ...routes, dispose, spawns, logs,
    async start() {
      await startOnReady(ready, services.get(SUPPORT_ROW.service))
      return routes.status()
    },
  }
}
