// Bind source imports to the selected installed DSH SDK without linking or installing dependencies.
import { registerHooks } from 'node:module'
import { realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOST = Object.freeze({
  sdkEnv: 'FBTEST_DSH_RUNTIME',
  scope: '@deepseek-ai/',
  mcp: '@modelcontextprotocol/',
  core: new URL('../', import.meta.url).href,
  shared: new URL('../../shared/package.json', import.meta.url).href,
  modules: 'node_modules',
  manifest: 'package.json',
  entry: 'lib/index.js',
  persistence: 'dsh-session-persistence-jsonl',
  backend: 'json',
  storage: 'storage',
  sessions: 'sessions',
  compression: 'none',
  defaults: Object.freeze([
    'dsh-session', 'dsh-session-projection', 'dsh-agent', 'dsh-system-prompt', 'dsh-tools',
    'dsh-llm', 'dsh-storage', 'dsh-sandbox-policy', 'dsh-user-approval', 'dsh-user-questions',
    'dsh-fs-local', 'dsh-subprocess-local', 'dsh-sandbox-local',
  ]),
  executor: Object.freeze({ native: 'dsh-tool-executor-native', ptc: 'dsh-tool-executor-ptc' }),
})

export const sdkMissing = !process.env[HOST.sdkEnv] && 'Set FBTEST_DSH_RUNTIME to the installed DSH 0.2.2-rc.3 node_modules directory'

export async function openSdk(t) {
  const selected = await realpath(resolve(process.env[HOST.sdkEnv]))
  const root = selected.endsWith('/' + HOST.modules) ? selected : join(selected, HOST.modules)
  const runtimeParent = pathToFileURL(join(root, '..', HOST.manifest)).href
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL?.startsWith(HOST.core)) {
        if (specifier.startsWith(HOST.scope) || specifier.startsWith(HOST.mcp)) {
          return nextResolve(specifier, { ...context, parentURL: runtimeParent })
        }
        if (specifier.startsWith('fishball-shared/')) {
          return nextResolve(specifier, { ...context, parentURL: HOST.shared })
        }
      }
      return nextResolve(specifier, context)
    },
  })
  t.after(() => hook.deregister())
  const host = (name) => import(pathToFileURL(join(root, HOST.scope, name, HOST.entry)).href)
  const { Context } = await host('cordis')
  return { host, Context }
}

/** Real executors, PTC process/runtime, prompt service, agent loop and JSONL sessions. No model or web server. */
export async function openHost(sdk, home, { executor = 'native', scriptedRuntime } = {}) {
  const ctx = new sdk.Context()
  let disposal
  const close = () => disposal ??= ctx.fiber.dispose()
  const mount = async (name, config, named = false) => {
    const mod = await sdk.host(name)
    await ctx.plugin(named ? mod : mod.default, config).await()
  }
  try {
    for (const name of HOST.defaults) await mount(name)
    if (scriptedRuntime === undefined) await mount('dsh-ptc-runtime-node')
    else {
      const { PtcRuntime } = await sdk.host('dsh-ptc-runtime')
      // Stub only the script evaluation carrier. The installed PtcExecutor dispatches the bindings.
      await ctx.plugin(class ScriptedRuntime extends PtcRuntime {
        language = 'typescript'
        programFormat = 'function-body'
        retainsState = false
        get sandboxMode() { return ctx.sandboxPolicy.defaultMode }
        resolve(request) { return { ...request, timeoutMs: null } }
        run(spec) { return scriptedRuntime(spec) }
        release() {}
      }).await()
    }
    await mount(HOST.executor[executor], {}, true)
    await mount('dsh-working-directory', { defaultDirectory: home })
    await mount(HOST.persistence, { root: join(home, HOST.sessions), compression: HOST.compression }, true)
    await mount('dsh-session-checkpoint-policy', {}, true)
    await mount('dsh-agent-loop', { agents: [] })
    await mount('dsh-storage-json', { root: join(home, HOST.storage) }, true)
    await mount('dsh-storage-domain', { backend: HOST.backend }, true)
    await mount('dsh-workspace')
    await mount('dsh-tool-ask-user', {}, true)
    ctx.provide('profileContext', { home })
    // There are no targets or HTTP requests: these required route/transport ports stay inert.
    ctx.provide('settings', { describe: () => [] })
    ctx.provide('connection', { fetch: { register: () => () => {} } })
    ctx.provide('authorization', {})
    ctx.provide('credentials', {})
    return { ctx, close }
  } catch (error) {
    await close()
    throw error
  }
}
