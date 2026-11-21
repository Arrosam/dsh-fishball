/**
 * Fishball's private Skills tool (SK; S1–S8; SK-SEAM decisions 1–4; final scope §4 SK row).
 * Lives in core's manager folder since V3 F-WIRE (the user's decision 2026-11-16), unchanged.
 *
 * The skills are Fishball's own lessons about the user's preferences and ways of working. Fishball
 * writes them on its own or when asked, with no approval, and only Fishball uses them.
 *
 * Composition, all through public SDK seams and only in the manager's own agent scope:
 * - One native FileSystemSkillProvider is registered with `agentCtx.skills.registerProvider`
 *   during manager setup (fishballInstance.manager.registerSetup), so the private catalog joins
 *   the manager's native `skill` tool and model catalog but no other scope. The provider has the
 *   private root as its only root, no default or bundled roots, the host watcher off, and the
 *   confined reader of skills-store.js as its `fs`, so an escaping link is refused before a read.
 * - Six dedicated tools, PRIVATE_SKILL_TOOL, also registered only in that scope. Each checks that
 *   the calling agent is this generation's live manager. Writes go through the trusted store,
 *   never the agent's sandboxed `ctx.fs`, so ordinary write/edit/shell stay read-only.
 * - One prompt section in the same scope tells the model these tools are its single file exception
 *   (the persona otherwise forbids changing files) and that workers get text, not names (S2/S4).
 * - After a committed write the tool invalidates the registration and reads the catalog back. A
 *   refresh affects later loads and the next model catalog only; text already delivered is not
 *   changed, and no native slash menu is claimed to refresh (decision 3).
 *
 * Every tool returns `{ok: true, ...}` or `{ok: false, code, committed, ...}`, never a thrown
 * error, so Fishball decides what to do about a failure itself. `committed` states the known
 * outcome: false means nothing was written; true with SKILL_RESULT.refreshFailed means the write is
 * on disk but the catalog could not be confirmed, and a later reload converges.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { createSkillStore, assertSkillName, SkillError, SKILL_ERROR, FS_SERVICE } from './skills-store.js'
import { renderJson } from '../tool-output.js'

/** Composition names: the registerSetup plugin id, the provider name in the manager's skill layer, services. */
export const PRIVATE_SKILLS = Object.freeze({
  pluginId: 'fishball-private-skills',
  provider: 'fishball-private',
  logger: 'fishball-private-skills',
  skillsService: 'skills',
  promptService: 'systemPrompt',
  profileService: 'profileContext',
  /** The manager-scoped prompt section that states the one file exception (S4). */
  sectionName: 'fishball-private-skills',
  /**
   * Placed right after the persona prefix, whose role text says never to change a file "by any
   * means": S4 makes these six tools the single exception, so the model must read both together.
   */
  sectionAnchor: 'DEPLOYMENT_PERSONA_PREFIX',
  sectionOffset: 1,
})

export const PRIVATE_SKILL_TOOL = Object.freeze({
  list: 'private_skill_list',
  read: 'private_skill_read',
  create: 'private_skill_create',
  update: 'private_skill_update',
  remove: 'private_skill_remove',
  reload: 'private_skill_reload',
})

/** Result codes beyond the store's SKILL_ERROR. */
export const SKILL_RESULT = Object.freeze({
  ...SKILL_ERROR,
  /** Committed on disk; the catalog read-back did not confirm it. Reload, then read back. */
  refreshFailed: 'refresh-failed',
  /** A discovery did not complete, so the catalog it saw is not authoritative. */
  catalogIncomplete: 'catalog-incomplete',
  invalidArguments: 'invalid-arguments',
  /** The caller is not this generation's live Fishball manager. */
  notManager: 'not-manager',
  failed: 'failed',
})

/**
 * Why a catalog could not be confirmed. The manager's catalog also holds the child's other skill
 * sources, and an incomplete discovery anywhere keeps the model catalog from being confirmed
 * (rc.5 publishes no incomplete pre-step catalog at all), so the strict rule stays; the cause
 * tells Fishball whether its own library or another source is the problem.
 */
export const CATALOG_CAUSE = Object.freeze({ privateLibrary: 'private-library', otherSource: 'other-skill-source' })

const ARG = Object.freeze({ name: 'name', document: 'document' })

const TEXT = Object.freeze({
  listDescription: 'List your own private skills: the lessons you keep about the user\'s preferences and ways of working. Only you can see or load them; a worker never can.',
  readDescription: 'Read one of your private skills: its name, description and instruction body. To pass the experience to a worker, put the relevant text in your message to it; never send only the skill name.',
  createDescription: 'Save a new private skill when you judge a pattern worth keeping, on your own or when the user asks. No approval is needed. The document is a complete SKILL.md: YAML front matter between --- lines with name (the same as the name argument) and a nonempty description, then a nonempty instruction body. An existing name is a conflict, never overwritten.',
  updateDescription: 'Replace one of your private skills with a complete new SKILL.md (same rules as create). Text you already sent or loaded is not changed; the next load returns the new version.',
  removeDescription: 'Remove one of your private skills so later loads no longer find it. Text already in a conversation stays there.',
  reloadDescription: 'Refresh your private skill catalog and read it back. Use it after a refresh-failed result, or whenever you need to confirm what is saved.',
  nameArg: 'The skill name: lowercase letters and digits in groups joined by single hyphens, for example preferred-test-cycle. A name, never a path.',
  documentArg: 'The complete SKILL.md text: front matter (name, description) between --- lines, then the body.',
  notManagerScope: 'private skills were not mounted: this agent is not the Fishball manager',
  noRegistry: 'private skills are unavailable: this composition has no skill registry',
  operationFailed: 'private skill operation failed (%s): %s',
  refreshFailed: 'The skill was saved, but the catalog could not be confirmed. Do not repeat the write: reload, then read it back.',
  section: '**Your private skills.** You keep your own skills: lessons about the user\'s preferences and ways of working. The private_skill_* tools are the one exception to never changing a file: with them you create, update and remove your own skills, on your own judgement or when the user asks, with no approval. They write only your own skills folder; every other tool stays read-only. Only you can load them. When a worker needs the experience, read the skill and put the relevant text in your message; a skill name alone is not a handoff. If a call fails, its result says what happened and whether anything was saved; decide yourself whether to retry, revise, reload or leave it.',
})

const STRING = Object.freeze({ type: 'string' })
const JSON_OUTPUT = Object.freeze({
  schema: { type: 'json' },
  render: renderJson,
})

const failure = (code, extra = {}) => ({ ok: false, code, committed: false, ...extra })
const refused = (error) => failure(error.code, error.field === undefined ? {} : { field: error.field })
/** Only the declared parameters: an input carrying a root, path, command or extra file is refused, not ignored (EP-20-10). */
const undeclaredKey = (args, parameters) => Object.keys(args ?? {}).some((key) => !Object.hasOwn(parameters, key))
/** defineTool's own argument error (ToolArgsError) carries the schema `violations`. */
const argumentFailure = (error) => failure(SKILL_RESULT.invalidArguments, Array.isArray(error?.violations) ? { violations: error.violations } : {})

/**
 * One generation's six tools over the shared store. `registry` is the manager scope's skill
 * registry; `invalidate` is the private provider registration's own control.
 */
function definitions({ store, registry, provider, invalidate, lookup, caller, logger }) {
  /** Which source left the last observation incomplete. */
  const cause = () => (provider.complete ? CATALOG_CAUSE.otherSource : CATALOG_CAUSE.privateLibrary)

  /** The private entries of a fresh observation of the manager's catalog. */
  async function catalog(signal) {
    const snapshot = await registry.snapshot(lookup(signal))
    const skills = snapshot.skills.filter((skill) => skill.provider === PRIVATE_SKILLS.provider)
      .map(({ name, description }) => ({ name, description }))
    return snapshot.complete ? { ok: true, skills } : failure(SKILL_RESULT.catalogIncomplete, { skills, cause: cause() })
  }

  /** The private definition of `name` in the manager's catalog, or undefined. */
  async function load(name, signal) {
    const definition = await registry.get(name, lookup(signal))
    return definition?.provider === PRIVATE_SKILLS.provider ? definition : undefined
  }

  /**
   * After a commit: invalidate, then confirm a complete catalog shows `name` present or absent.
   * Anything short of that is the distinct committed-not-refreshed outcome, never a write failure.
   */
  async function confirm(name, present, signal) {
    const refreshFailed = () => ({ ...failure(SKILL_RESULT.refreshFailed, { name, cause: cause(), note: TEXT.refreshFailed }), committed: true })
    try {
      invalidate()
      const listed = await catalog(signal)
      if (!listed.ok || listed.skills.some((skill) => skill.name === name) !== present) return refreshFailed()
      if (present && await load(name, signal) === undefined) return refreshFailed()
      return { ok: true, committed: true, name }
    } catch { return refreshFailed() }
  }

  /**
   * A body's thrown error as a result. Typed refusals keep their code. A write I/O failure or an
   * unexpected error is also logged with its cause, which the model-facing result omits; a
   * cancellation is the caller's own doing and is not logged.
   */
  function outcome(error, signal) {
    if (error instanceof SkillError) {
      if (error.code === SKILL_RESULT.writeFailed) logger.warn(TEXT.operationFailed, error.code, error.cause)
      return refused(error)
    }
    if (signal?.aborted) return failure(SKILL_RESULT.cancelled)
    logger.warn(TEXT.operationFailed, SKILL_RESULT.failed, error)
    return failure(SKILL_RESULT.failed)
  }

  /** Shared boundary: exact argument keys, live-manager identity, typed refusals. */
  const tool = (name, description, parameters, body) => {
    const defined = defineTool({
      name,
      description,
      parameters,
      output: JSON_OUTPUT,
      async execute(args, exec) {
        if (undeclaredKey(args, parameters)) return failure(SKILL_RESULT.invalidArguments)
        if (!caller(exec)) return failure(SKILL_RESULT.notManager)
        try { return await body(args, exec.signal) } catch (error) { return outcome(error, exec.signal) }
      },
    })
    // defineTool rejects a missing or ill-typed argument before calling execute above. That
    // execute never throws, so this catch only sees the argument error.
    return { ...defined, execute: (args, exec) => defined.execute(args, exec).catch(argumentFailure) }
  }
  const nameParameter = { [ARG.name]: { ...STRING, required: true, description: TEXT.nameArg } }
  const documentParameters = { ...nameParameter, [ARG.document]: { ...STRING, required: true, description: TEXT.documentArg } }
  /**
   * A mutation: the store commits (or throws a not-committed SkillError), then the catalog must
   * show the skill as present or absent.
   */
  const mutation = (commit, present) => async (args, signal) => {
    await commit(args, signal)
    return confirm(args.name, present, signal)
  }

  return [
    tool(PRIVATE_SKILL_TOOL.list, TEXT.listDescription, {}, (_args, signal) => catalog(signal)),
    tool(PRIVATE_SKILL_TOOL.read, TEXT.readDescription, nameParameter, async (args, signal) => {
      const definition = await load(assertSkillName(args.name), signal)
      if (definition === undefined) return failure(SKILL_RESULT.notFound)
      return { ok: true, name: definition.name, description: definition.description, body: definition.content }
    }),
    tool(PRIVATE_SKILL_TOOL.create, TEXT.createDescription, documentParameters, mutation((args, signal) => store.create(args.name, args.document, signal), true)),
    tool(PRIVATE_SKILL_TOOL.update, TEXT.updateDescription, documentParameters, mutation((args, signal) => store.update(args.name, args.document, signal), true)),
    tool(PRIVATE_SKILL_TOOL.remove, TEXT.removeDescription, nameParameter, mutation((args, signal) => store.remove(args.name, signal), false)),
    tool(PRIVATE_SKILL_TOOL.reload, TEXT.reloadDescription, {}, (_args, signal) => {
      invalidate()
      return catalog(signal)
    }),
  ]
}

/**
 * Compose the private library into one manager generation's scope (attachPrivateSkills has
 * already checked that the composition has a skill registry).
 */
function mountPrivateSkills(agentCtx, live, { manager, store }) {
  // Singleton identity before anything is exposed (SK-SEAM §4.1, decision 2): a generation whose
  // agent is not THE manager gets neither the provider nor the tools. X1 publishes the manager id
  // only after the factory publishes the agent, so during the first create (and a cold resume) it
  // is still undefined. Setup callbacks are reached only from the chat's own manager composition
  // (extensions.setup is called solely by chat.js composePersona), so that case is the manager
  // being composed. The tools re-check the published id strictly on every call.
  const logger = agentCtx.logger(PRIVATE_SKILLS.logger)
  const managerId = manager.sessionId()
  if (managerId !== undefined && managerId !== live?.id) {
    logger.warn(TEXT.notManagerScope)
    return
  }
  // ctx.get returns the service traced to this scope (no inject needed in a setup callback), so
  // the provider lands in the manager agent's own skill layer: the registry files a
  // registration by its caller's scope.
  const registry = agentCtx.get(PRIVATE_SKILLS.skillsService)
  let active = true
  // Disposal of this generation (resume, restart, row disable) fences every stale call.
  agentCtx.effect(() => () => { active = false })
  // The provider sees only the confined reader and a logger; the manager's own ctx.fs is never
  // replaced, so ordinary tools keep their sandbox (SK-SEAM §5.2.3).
  const providerCtx = Object.freeze({ get: (service) => (service === FS_SERVICE ? store.fileSystem : undefined), logger })
  // registerProvider calls its factory synchronously (SK-SEAM §3.1), so both are bound before
  // the tools below capture them.
  let control
  let provider
  registry.registerProvider((given) => {
    control = given
    provider = new LazyRootProvider(providerCtx, given, store)
    return provider
  })
  // The manager's own view: its scope chain selects the private layer. No cwd: the private
  // provider has no project roots, and the child's other providers have default roots off.
  const lookup = (signal) => ({ signal, scope: live })
  // Identity comes from the live receiving agent, never from names or model arguments.
  const caller = (exec) => active && exec?.agent === live && manager.sessionId() === live.id
  for (const definition of definitions({ store, registry, provider, invalidate: control.invalidate, lookup, caller, logger })) {
    agentCtx.tools.register(definition)
  }
  const prompt = agentCtx.get(PRIVATE_SKILLS.promptService)
  prompt.section({ name: PRIVATE_SKILLS.sectionName, order: prompt.getSectionOrder(PRIVATE_SKILLS.sectionAnchor) + PRIVATE_SKILLS.sectionOffset, text: TEXT.section })
}

/**
 * The native provider over the private root. The root is canonicalized asynchronously, after
 * registration (which must be synchronous), so the native provider is built on the first list.
 * It is still the public FileSystemSkillProvider doing all discovery and parsing.
 */
class LazyRootProvider {
  name = PRIVATE_SKILLS.provider
  /**
   * Whether this provider's own latest discovery completed (CATALOG_CAUSE attribution). One flag
   * for all lookups: overlapping lookups may attribute each other's cause. That affects only the
   * informational `cause`, never `ok` or `committed`.
   */
  complete = true
  #ctx
  #control
  #store
  #native
  // The native provider disposes itself on control.signal; nothing else is owned here.
  constructor(ctx, control, store) {
    this.#ctx = ctx
    this.#control = control
    this.#store = store
  }
  /** A home that cannot be canonicalized fails this lookup (an incomplete catalog) and is retried next time. */
  async #provider() {
    const root = await this.#store.root()
    // Assigned after the await, so concurrent first lookups share one provider. dshHome and
    // agentsHome stay at their defaults: with includeDefaultRoots false they are never read.
    this.#native ??= new FileSystemSkillProvider(this.#ctx, this.#control, {
      providerName: PRIVATE_SKILLS.provider, includeDefaultRoots: false, customSkillDirs: [root], watch: false,
    })
    return this.#native
  }
  async list(options) {
    try {
      const listed = await (await this.#provider()).list(options)
      this.complete = Array.isArray(listed) || listed.complete
      return listed
    } catch (error) {
      this.complete = false
      throw error
    }
  }
  async get(candidate, options) { return (await this.#provider()).get(candidate, options) }
}

/**
 * Register the private library for every manager generation of this child.
 * @param {{registerSetup(pluginId: string, fn: Function): () => void, sessionId(): string|undefined}} manager
 * @param {{home: string}} options - the child's own DSH home.
 * @returns {() => void} disposer.
 */
export function registerPrivateSkills(manager, { home }) {
  const store = createSkillStore({ home })
  return manager.registerSetup(PRIVATE_SKILLS.pluginId, (agentCtx, live) => { mountPrivateSkills(agentCtx, live, { manager, store }) })
}

/**
 * The app row's entry: check the composition once, then register. Without a skill registry (DSH
 * composes one in dsh-base) there is nothing to register into, so private skills stay off with one
 * boot warning instead of a failing setup callback on every manager generation.
 * @param ctx - the app row's context (profileContext and the skill registry).
 * @param manager - fishballInstance.manager.
 * @returns {() => void} disposer.
 */
export function attachPrivateSkills(ctx, manager) {
  // Relies on dsh-base composing the skill registry as a core host service, provided before any
  // profile row applies (both SDKs). If that ever changed, private skills would stay off for this
  // child's life with this warning; the app row deliberately does not inject 'skills' so a
  // composition without it still serves the chat.
  if (typeof ctx.get(PRIVATE_SKILLS.skillsService)?.registerProvider !== 'function') {
    ctx.logger(PRIVATE_SKILLS.logger).warn(TEXT.noRegistry)
    return () => {}
  }
  return registerPrivateSkills(manager, { home: ctx.get(PRIVATE_SKILLS.profileService).home })
}
