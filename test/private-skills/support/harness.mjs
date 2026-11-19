/**
 * In-process Fishball child for the executable T-SK cases, run once per installed SDK.
 *
 * The composition uses the real public SDK services of that version: Cordis, `SkillRegistry`,
 * `ToolsService`/`ToolRuntime`, `SystemPrompt`, and a `SandboxedFileSystem` in read-only mode as the
 * child's ordinary `ctx.fs`. It also has an approval service that only records requests. The manager
 * is one `createScope` generation keyed by its live agent object. The instance's public
 * `registerPrivateSkills(manager, { home })` is the only entry point: the fake manager records the
 * setup and the harness replays it for each generation, which is how DSH calls manager setups.
 * Workers are other scope keys. The global view is a lookup with no scope.
 *
 * Observation points are public only: tool results, the registry views per scope, tool
 * visibility per scope, the files under a /private/tmp fixture home, the stock native oracle, and
 * the fs trace. Nothing here reads or imitates the SK implementation.
 */
import assert from 'node:assert/strict'
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm } from 'node:fs/promises'
import path from 'node:path'
import { tempPath } from '../../support/temp-path.mjs'
import { CONTRACT, HARNESS, LAYOUT, SDK_PACKAGES } from './constants.mjs'
import { traced } from './fs-trace.mjs'
import { importInstance, importSdk } from './sdk.mjs'

const TOOL_NAMES = Object.freeze(Object.values(CONTRACT.tool))
/** rc.1 ToolExecutor for prompt assembly only: declares each tool's schema, executes nothing. */
const DESCRIBE_ONLY_EXECUTOR = Object.freeze({
  describe: (definitions) => ({ schemas: definitions.map(({ name, description, parameters }) => ({ name, description, parameters })), knownNames: definitions.map((definition) => definition.name) }),
  execute: () => Promise.reject(new Error('fbtest: prompt-assembly executor does not execute tools')),
})
/** Services an agent's scoped context can reach (the manager setup's needs plus the ordinary fs). */
const HOST_INJECT = Object.freeze(['skills', 'tools', 'systemPrompt', 'fs', 'sandboxPolicy', 'approval'])

/** The SK modules and the SDK services of one version, imported once per process. */
const modules = new Map()
export function skModules(version) {
  if (!modules.has(version)) {
    modules.set(version, (async () => {
      const [skills, store, overlay, cordis, scope, tools, systemPrompt, fsSandbox, registry] = await Promise.all([
        importInstance(version, CONTRACT.modules.skills), importInstance(version, CONTRACT.modules.store),
        importInstance(version, CONTRACT.modules.overlay), importSdk(version, SDK_PACKAGES.cordis),
        importSdk(version, SDK_PACKAGES.scope), importSdk(version, SDK_PACKAGES.tools),
        importSdk(version, SDK_PACKAGES.systemPrompt), importSdk(version, SDK_PACKAGES.fsSandbox),
        importSdk(version, '@deepseek-ai/dsh-skill'),
      ])
      return { skills, store, overlay, cordis, scope, tools, systemPrompt, fsSandbox, registry }
    })())
  }
  return modules.get(version)
}

/** A read-only `ctx.sandboxPolicy`: the child's fixed policy (overlay POLICY.sandboxMode). */
function readOnlyPolicy(workspaceRoot) {
  const policy = Object.freeze({ mode: CONTRACT.sandbox.readOnly, workspaceRoot })
  return { defaultMode: policy.mode, workspaceRoot, resolve: () => policy, sessionMode: () => undefined }
}

/**
 * A fixture base under /private/tmp with `home/` (the child DSH home, `skills/` NOT created),
 * `outside/` and `main/`. Removed after the test; owner permissions are restored first so a chmod
 * fault cannot block the cleanup.
 */
export async function childBase(t) {
  const base = tempPath(await mkdtemp(LAYOUT.tempPrefix))
  const dirs = {
    base,
    home: path.join(base, HARNESS.homeDirectory),
    outside: path.join(base, HARNESS.outsideDirectory),
    main: path.join(base, HARNESS.mainDirectory),
  }
  for (const dir of [dirs.home, dirs.outside, dirs.main]) await mkdir(dir)
  dirs.root = path.join(dirs.home, LAYOUT.root)
  t.after(async () => {
    await restoreModes(base)
    await rm(tempPath(base), { recursive: true, force: true })
  })
  return dirs
}

async function restoreModes(dir) {
  const stat = await lstat(dir).catch(() => undefined)
  if (!stat?.isDirectory()) return
  await chmod(dir, HARNESS.mode.owner)
  for (const entry of await readdir(dir)) await restoreModes(path.join(dir, entry))
}

/**
 * Boot one in-process child over `dirs.home` and mount generation 1 of the manager.
 * @returns the child handle; `restart()` returns a new child over the same home.
 */
export async function bootChild(t, version, dirs) {
  const m = await skModules(version)
  const root = new m.cordis.Context()
  const fibers = []
  const approvals = []
  fibers.push(await root.plugin(m.systemPrompt.SystemPrompt, {}))
  fibers.push(await root.plugin(m.registry.SkillRegistry))
  fibers.push(await root.plugin(m.tools.default))
  // rc.1 assembles tool declarations through the selected executor. A pass-through describer lets
  // `systemPrompt.assemble` run. Nothing is executed through it; rc.5 has no executor seam.
  const tools = root.get('tools')
  if (typeof tools.setExecutor === 'function') fibers.push({ dispose: tools.setExecutor(DESCRIBE_ONLY_EXECUTOR) })
  root.provide('approval')
  root.set('approval', { request: async (...request) => (approvals.push(request), 'rejected') })
  root.provide('sandboxPolicy')
  root.set('sandboxPolicy', readOnlyPolicy(dirs.home))
  fibers.push(await root.plugin(m.fsSandbox.default, {}))
  // A scope inherits the dependency API of the plugin that mints it, so the manager and worker
  // scopes are minted from a host plugin that injects what an agent composition has.
  let host
  fibers.push(await root.plugin({ name: 'fbtest-agent-host', inject: [...HOST_INJECT], apply: (ctx) => { host = ctx } }))

  const setups = []
  const releases = []
  const managerReads = []
  let current
  // The manager facade the instance sees. Every property read is recorded, so a case can show that a
  // mutation never reaches for a wake or turn (notify, ensureSession, …): those are absent here.
  const manager = new Proxy(Object.freeze({
    // X1: undefined until the generation's id is published (`published`), then that id.
    sessionId: () => (current?.published ? current.sessionId ?? current.live.id : undefined),
    registerSetup(pluginId, fn) {
      setups.push({ pluginId, fn })
      return () => releases.push(pluginId)
    },
  }), { get: (target, key) => (managerReads.push(key), target[key]) })
  const unregister = m.skills.registerPrivateSkills(manager, { home: dirs.home })
  const registry = root.get('skills')
  const toolsService = root.get('tools')
  const generations = []
  const workers = []

  /**
   * One manager generation: a new live agent object (same session id) and a new scope.
   * `parent` places it under a standing-preset scope key; `sessionId` makes the facade report a
   * different singleton session than this agent's id; `live` supplies the agent object itself.
   * `publish` (X1) is when `manager.sessionId()` starts reporting the id: 'before' the setup runs
   * (a resume of a known session), 'after' it (the production first create / cold resume, where the
   * agent factory publishes the agent only after setup), or 'never' (the caller publishes later
   * with `generation.publish()`).
   */
  async function mount({ id = HARNESS.sessionId, live = Object.freeze({ id }), parent, sessionId, publish = HARNESS.publish.before } = {}) {
    const scope = m.scope.createScope(host, live, parent === undefined ? undefined : { parent })
    const generation = {
      live, scope, sessionId, disposed: false, tools: {}, published: publish === HARNESS.publish.before,
      publish() { generation.published = true },
      async dispose() {
        if (generation.disposed) return
        generation.disposed = true
        await scope.dispose()
      },
    }
    current = generation
    generations.push(generation)
    for (const setup of setups) await setup.fn(scope.ctx, live)
    generation.tools = Object.fromEntries(TOOL_NAMES.map((name) => [name, toolsService.get(name, live)]))
    if (publish === HARNESS.publish.after) generation.publish()
    return generation
  }

  /** A worker or side agent: a different scope key, optionally with its own skill provider roots. */
  function worker(id = HARNESS.workerIds.subagent, { parent } = {}) {
    const live = Object.freeze({ id })
    const scope = m.scope.createScope(host, live, parent === undefined ? undefined : { parent })
    workers.push(scope)
    return { live, scope }
  }

  const child = {
    version, dirs, root, registry, toolsService, approvals, setups, releases, managerReads, modules: m, manager, closed: false,
    get current() { return current },
    mount,
    worker,
    /** Execute one dedicated operation of `generation` (default: the current one). */
    async call(op, args = {}, options = {}) {
      const { generation = current, signal = new AbortController().signal, extra = {} } = options
      // `agent: undefined` is a real caller (no agent), so only an omitted key defaults to the manager.
      const agent = 'agent' in options ? options.agent : generation.live
      const definition = generation.tools[CONTRACT.tool[op]]
      assert.ok(definition, `${CONTRACT.tool[op]} is not registered for the manager`)
      return definition.execute(args, { agent, signal, ...extra })
    },
    /** The same call inside a filesystem trace window. */
    tracedCall(op, args, options) {
      return traced(() => child.call(op, args, options))
    },
    /** Registry view: the manager's (default), a worker's (`scope: key`) or the global (`scope: null`). */
    catalog(scope = current.live, options = {}) {
      return registry.snapshot(scope === null ? options : { ...options, scope })
    },
    load(name, scope = current.live, options = {}) {
      return registry.get(name, scope === null ? options : { ...options, scope })
    },
    /** The sections the real SystemPrompt assembles for a scope (`null` = the global view). */
    async promptSections(scope = current.live) {
      const assembly = await root.get('systemPrompt').assemble(scope === null ? {} : { scope })
      return assembly.sections
    },
    /** Tool names visible to a scope through the real tools service. */
    visibleTools(scope) {
      return TOOL_NAMES.filter((name) => toolsService.get(name, scope ?? undefined) !== undefined)
    },
    /** How many times each dedicated tool name occurs among a scope's schemas. */
    toolOccurrences(scope) {
      const names = toolsService.schemas(scope).map((schema) => schema.name)
      return Object.fromEntries(TOOL_NAMES.map((name) => [name, names.filter((each) => each === name).length]))
    },
    /**
     * A second provider in the manager's own layer whose discovery can fail on demand, so the
     * manager catalog becomes incomplete (refresh failure) without touching the private files.
     */
    installFault(generation = current) {
      const fault = { mode: HARNESS.faultMode.ok }
      generation.scope.ctx.get('skills').registerProvider(() => ({
        name: HARNESS.faultProvider,
        async list() {
          if (fault.mode === HARNESS.faultMode.throws) throw new Error(HARNESS.faultProvider)
          return fault.mode === HARNESS.faultMode.incomplete ? { candidates: [], complete: false } : []
        },
        get: async () => undefined,
      }))
      return fault
    },
    /** Dispose everything this child composed (generations, workers, services); idempotent. */
    async close() {
      if (child.closed) return
      child.closed = true
      for (const generation of generations) await generation.dispose()
      for (const scope of workers) await scope.dispose()
      unregister?.()
      for (const fiber of fibers.reverse()) await fiber.dispose()
    },
    /** A child restart: this child closes and a new one boots over the same home. */
    async restart() {
      await child.close()
      return bootChild(t, version, dirs)
    },
  }
  t.after(() => child.close())
  await mount()
  return child
}

/** Fixture base plus a booted child: the usual start of an executable case. */
export async function freshChild(t, version) {
  return bootChild(t, version, await childBase(t))
}

/** `<root>/<name>/SKILL.md` of a child. */
export function skillFile(child, name) {
  return path.join(child.dirs.root, name, LAYOUT.file)
}

/** Every entry below `dir`, not following links: { relative: content | '->target' | '<dir>' }. */
export async function tree(dir) {
  const out = {}
  async function walk(current, prefix) {
    let entries
    try {
      entries = await readdir(current)
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries.sort()) {
      const full = path.join(current, entry)
      const relative = prefix ? path.join(prefix, entry) : entry
      const stat = await lstat(full)
      if (stat.isSymbolicLink()) out[relative] = '->' + await readlink(full)
      else if (stat.isDirectory()) {
        out[relative] = '<dir>'
        await walk(full, relative)
      } else if (stat.isFile()) out[relative] = (await readFile(full)).toString('base64')
      else out[relative] = '<special>'
    }
  }
  await walk(dir, '')
  return out
}

/** True when `target` is `dir` or inside it (lexically; both are already canonical fixture paths). */
export function within(dir, target) {
  return target === dir || target.startsWith(dir + path.sep)
}

/** Ancestors of `dir` up to the filesystem root (a path walk may stat them). */
function ancestors(dir) {
  const out = []
  for (let next = path.dirname(dir); next !== dir && !out.includes(next); dir = next, next = path.dirname(dir)) out.push(next)
  return out
}

/**
 * Traced calls that touched a path outside the skills root (other than metadata of the root's own
 * ancestors, which any anchored path walk reads). Writes outside are always reported.
 */
export function escapingCalls(calls, root) {
  const parents = ancestors(root)
  return calls.filter((call) => [call.path, call.to].some((target) => target !== undefined &&
    !within(root, target) && (call.write || !parents.includes(target))))
}

/**
 * Successful traced content reads through `link` (readFile/readdir/streams), or a successful open
 * of the foreign inode itself. A refused attempt (e.g. a no-follow open that fails) is not a read.
 */
export function readsThrough(calls, link, foreignInodes) {
  const contentOps = ['readFile', 'readdir', 'opendir', 'createReadStream']
  return calls.filter((call) => call.ok && ((call.inode !== undefined && foreignInodes.includes(call.inode)) ||
    (contentOps.includes(call.op) && call.path !== undefined && within(link, call.path))))
}

/** The `name`s of a list/reload/snapshot result. */
export const names = (skills) => skills.map((skill) => skill.name).sort()

/** Private-provider entries of a registry snapshot. */
export const privateEntries = (snapshot) => snapshot.skills.filter((skill) => skill.provider === CONTRACT.provider)

/** Assert a failure result shape: `{ ok: false, code, committed }` (+ field when given). */
export function assertFailure(result, code, { committed = false, field } = {}) {
  assert.equal(result?.ok, false, 'expected a failure result, got ' + JSON.stringify(result))
  if (Array.isArray(code)) assert.ok(code.includes(result.code), `code ${result.code} not in ${code.join(', ')}`)
  else assert.equal(result.code, code, 'result ' + JSON.stringify(result))
  assert.equal(result.committed, committed, 'committed flag of ' + JSON.stringify(result))
  if (field !== undefined) assert.equal(result.field, field, 'field of ' + JSON.stringify(result))
}

/** Assert a committed mutation success naming the skill. */
export function assertCommitted(result, name) {
  assert.deepEqual({ ok: result?.ok, committed: result?.committed, name: result?.name }, { ok: true, committed: true, name }, JSON.stringify(result))
}

/** Every text the tool returned or would render to the model, for claim scans. */
export function resultText(child, op, args, result) {
  const definition = child.current.tools[CONTRACT.tool[op]]
  const rendered = definition.output.render(args, result)
  return JSON.stringify(result) + JSON.stringify(rendered)
}

export { TOOL_NAMES }
