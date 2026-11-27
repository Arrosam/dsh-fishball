/**
 * An in-process DSH host: a cordis Context of the current DSH (./runtime) with DSH's real
 * `dsh-credentials-local` (its file under `root`, watched as DSH watches it) and
 * `dsh-authorization`, plus any other DSH plugins the caller names, in order. A logger exporter
 * records every line. Observation stays public: the credential store, the authorization seam, the
 * files on disk and the log.
 *
 * `tempRoot(scope, prefix)` makes a fresh folder under the canonical OS temp folder and removes it in
 * `scope`'s cleanup; `cleanups(t)` is that scope for one node:test case (last in, first out, so a
 * host closes before its root is removed).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importRuntime } from './runtime.mjs'

export const DSH_HOST = Object.freeze({
  cordis: 'cordis', credentials: 'dsh-credentials', credentialsLocal: 'dsh-credentials-local',
  authorization: 'dsh-authorization', launchEnvironment: 'dsh-launch-environment',
  /** The launch environment's one layer: an empty process layer, so nothing of this process leaks in. */
  processLayer: 'process',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so nothing logged is missed. */
  allLevels: 3,
  tempPrefix: 'fbtest-dsh-host-',
  refusedRemoval: 'refusing to remove ',
})

/**
 * One extra DSH plugin to load: `{name, export?, config?}` (`name` a DSH package without its
 * scope, `export` its plugin export, the default export by default). DSH's `dsh-system-prompt` is
 * `{name: 'dsh-system-prompt', export: 'SystemPrompt'}`, its tool registry `{name: 'dsh-tools'}`.
 * @typedef {{name: string, export?: string, config?: object}} HostPlugin
 */

const importAll = async (names) => Object.fromEntries(await Promise.all(names.map(async (n) => [n, await importRuntime(n)])))

/** One logger line as plain text. */
const lineOf = (m) => ({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack ?? a.message : JSON.stringify(a) ?? String(a))).join(' ') })

/**
 * Open one host over `root` (an existing folder).
 * @param {string} root - the folder holding `.credentials.yaml` (the credential provider's DSH home).
 * @param {{plugins?: HostPlugin[]}} [options] - more DSH plugins, loaded after credentials and authorization, in order.
 * @returns {Promise<{ctx, logs, credentialsFile, parts, credentialKey, close}>} `parts` holds every imported DSH module by name.
 */
export async function openHost(root, { plugins = [] } = {}) {
  const base = [DSH_HOST.cordis, DSH_HOST.credentials, DSH_HOST.credentialsLocal, DSH_HOST.authorization, DSH_HOST.launchEnvironment]
  const parts = await importAll([...new Set([...base, ...plugins.map((p) => p.name)])])
  const ctx = new parts[DSH_HOST.cordis].Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: DSH_HOST.allLevels }, export: (m) => logs.push(lineOf(m)) })
  const env = parts[DSH_HOST.launchEnvironment]
  ctx.provide(env.DSH_LAUNCH_ENVIRONMENT_KEY, env.createLaunchEnvironmentSnapshot([{ source: DSH_HOST.processLayer, values: {} }]))
  const local = parts[DSH_HOST.credentialsLocal]
  const credentialsFile = path.join(root, local.CREDENTIALS_FILENAME)
  let closed = false
  const close = async () => { if (!closed) { closed = true; await ctx.fiber.dispose() } }
  try {
    await ctx.plugin(local.LocalCredentialProvider, { path: credentialsFile, dshHome: root }).await()
    await ctx.plugin(parts[DSH_HOST.authorization].AuthorizationService).await()
    for (const p of plugins) await ctx.plugin(parts[p.name][p.export ?? 'default'], p.config ?? {}).await()
  } catch (error) {
    await close()
    throw error
  }
  return { ctx, logs, credentialsFile, parts, credentialKey: parts[DSH_HOST.credentials].credentialKey, close }
}

/** The canonical OS temp folder (`/private/var/...` on macOS), with no trailing separator. */
export const canonicalTmp = () => fs.realpathSync(os.tmpdir()).replace(/\/+$/, '')

/** One cleanup stack per test, run last in first out from a single `t.after`; the first error is rethrown. */
export function cleanups(t) {
  const stack = []
  t.after(async () => {
    const errors = []
    for (const fn of stack.reverse()) { try { await fn() } catch (error) { errors.push(error) } }
    if (errors.length > 0) throw errors[0]
  })
  return { defer: (fn) => { stack.push(fn) } }
}

/** A fresh folder under the canonical temp folder, removed by `scope`'s cleanup (the one recursive delete, guarded). */
export function tempRoot(scope, prefix = DSH_HOST.tempPrefix) {
  const base = canonicalTmp()
  const root = fs.mkdtempSync(path.join(base, prefix))
  scope.defer(() => {
    assert.ok(path.dirname(root) === base && path.basename(root).startsWith(prefix), DSH_HOST.refusedRemoval + root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

/** The logger's lines as one text. */
export const logText = (logs) => logs.map((l) => `${l.type} ${l.name} ${l.text}`).join('\n')
