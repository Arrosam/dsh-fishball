/** Public filesystem and host-row fixtures for the permissions and notice cases. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { callRoute, fetchRegistry } from '@dsh-instance/test-helpers/routes'
import { modeOf, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { swapWorlds } from '@dsh-instance/test-helpers/swap'
import { until } from '@dsh-instance/test-helpers/wait'
import { MODULE, ROW_CONFIG, TOKENS } from '../support/constants.mjs'
import { fakeChildCredentials, fakeTokens } from '../support/fakes.mjs'
import { PACKAGE_DIR, importInstance, packageFile } from '../support/instance.mjs'
import { EXPORTS, HARNESS, MODES, MODULES, ROUTES, TASK } from './constants.mjs'

const worlds = swapWorlds(HARNESS.worldParam, {
  root: PACKAGE_DIR,
  replace: { [packageFile(MODULE.runtime)]: path.join(import.meta.dirname, 'fake-runtime.mjs') },
})

export const octal = (mode) => '0o' + (mode & MODES.mask).toString(8).padStart(3, '0')

/** Loads a `packages/dsh-instance` module bound to `sdk` and verifies required exports. */
async function requireModule(sdk, relative, exports) {
  const mod = await importInstance(sdk, relative)
  for (const name of exports) {
    assert.ok(name in mod, `${TASK}: ${relative} must export ${name}`)
  }
  return mod
}

export const filesModule = (sdk) => requireModule(sdk, MODULES.files, EXPORTS.files)
export const constantsModule = (sdk) => requireModule(sdk, MODULES.constants, EXPORTS.constants)
export const hostedRecordModule = (sdk) => requireModule(sdk, MODULES.hostedRecord, EXPORTS.hostedRecord)
export const routesModule = (sdk) => requireModule(sdk, MODULES.routes, EXPORTS.routes)
export const syncRoutesModule = (sdk) => requireModule(sdk, MODULES.syncRoutes, EXPORTS.syncRoutes)

/**
 * Restores owner rwx on directories under `root` (without following symlinks)
 * so cleanup never fails with EACCES on 0o500/0o555 fixtures.
 */
function restoreRemovableModes(root) {
  let stat
  try { stat = fs.lstatSync(root) } catch { return }
  if (!stat.isDirectory()) return
  try { fs.chmodSync(root, MODES.privateDir) } catch { /* best effort */ }
  let entries = []
  try { entries = fs.readdirSync(root) } catch { return }
  for (const name of entries) {
    restoreRemovableModes(path.join(root, name))
  }
}

/**
 * Creates an isolated scratch root under OS tmpdir with a canonical, symlinked (`alias`),
 * or symlinked-ancestor (`ancestor`) mainHome. Automatically cleaned up after test.
 */
export function tempHome(scope, kind = 'canonical') {
  const base = tempRoot(scope, HARNESS.tempPrefix)
  scope.defer(() => restoreRemovableModes(base))
  const real = path.join(base, 'real-home')
  fs.mkdirSync(real, { mode: MODES.privateDir })
  if (kind === 'canonical') return { home: real, real, base }
  if (kind === 'alias') {
    const alias = path.join(base, 'alias-home')
    fs.symlinkSync(real, alias)
    return { home: alias, real, base }
  }
  if (kind === 'ancestor') {
    const ancestorLink = path.join(base, 'ancestor-link')
    fs.symlinkSync(real, ancestorLink)
    const nested = path.join(real, 'home')
    fs.mkdirSync(nested, { mode: MODES.privateDir })
    return { home: path.join(ancestorLink, 'home'), real: nested, base }
  }
  throw new Error('unknown tempHome kind: ' + kind)
}

/** Sets exact mode via chmodSync (bypassing process umask) and verifies the precondition. */
export function createDirWithMode(dirPath, mode) {
  fs.mkdirSync(dirPath)
  fs.chmodSync(dirPath, mode)
  assert.equal(modeOf(dirPath), mode, `fixture chmod failed on ${dirPath}`)
}

/** Creates a file with exact mode via chmodSync (bypassing process umask) and verifies it. */
export function createFileWithMode(filePath, content, mode) {
  fs.writeFileSync(filePath, content, 'utf8')
  fs.chmodSync(filePath, mode)
  assert.equal(modeOf(filePath), mode, `fixture chmod failed on ${filePath}`)
}

/**
 * Boots the real `packages/dsh-instance/host.js` over a fake DSH ctx + fake native runtime,
 * while capturing real registered Fetch routes so tests can query `GET /api/dsh-instance/status`
 * and `POST /api/dsh-instance/retry` end-to-end against real disk state under `home`.
 */
export async function hostRowWorld(scope, sdk, { home, enabled = true, startError = null } = {}) {
  const { RUNTIME_LIMITS } = await constantsModule(sdk)
  const { createCredentialReceiver } = await importInstance(sdk, MODULE.credential)
  const tokens = fakeTokens({ fixture: HARNESS.tokens })
  const ctl = { runtimeLimits: RUNTIME_LIMITS, createCredentialReceiver, credentials: fakeChildCredentials(), startError }
  const id = worlds.open(ctl)
  scope.defer(() => worlds.close(id))
  const host = await worlds.importIn(id, packageFile(MODULE.host), { [SDK.versionTag]: sdk })
  const contexts = []
  const logs = []

  function makeCtx() {
    const effects = []
    const readyCallbacks = new Set()
    const { routes, fetch } = fetchRegistry()
    const ctx = {
      profileContext: { home, installAnchor: '', packageManager: undefined },
      workspaceRegistry: { list: () => [] },
      appReady: {
        onReady(fn) {
          readyCallbacks.add(fn)
          return () => readyCallbacks.delete(fn)
        },
      },
      connection: { fetch },
      webServer: { getOrigin: () => HARNESS.hostOrigin },
      logger: (name) => Object.fromEntries(
        ['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => logs.push({ name, level, args })]),
      ),
      effect(fn) {
        const dispose = fn()
        if (typeof dispose === 'function') effects.push(dispose)
        return dispose
      },
      provide() {},
      on: () => () => {},
      get: (name) => (name === TOKENS.service ? tokens : undefined),
    }
    return {
      ctx,
      routes,
      fireReady() {
        for (const fn of [...readyCallbacks]) fn()
        readyCallbacks.clear()
      },
      async dispose() { for (const fn of effects.splice(0).reverse()) await fn() },
    }
  }

  return {
    async apply() {
      const c = makeCtx()
      contexts.push(c)
      scope.defer(() => c.dispose())
      await host.apply(c.ctx, { [ROW_CONFIG.enabled]: { get: () => enabled } })
      return c
    },
    async dispose(c = contexts.at(-1)) {
      await c.dispose()
    },
    fireReady: () => contexts.at(-1).fireReady(),
    setStartError(error) { ctl.startError = error },
    getStatus: () => callRoute(contexts.at(-1).routes, 'GET', ROUTES.status, { origin: HARNESS.hostOrigin }),
    postRetry: () => callRoute(contexts.at(-1).routes, 'POST', ROUTES.retry, { origin: HARNESS.hostOrigin }),
    warns: () => logs.filter((entry) => entry.level === 'warn'),
    async until(predicate) { await until(predicate); return true },
  }
}
