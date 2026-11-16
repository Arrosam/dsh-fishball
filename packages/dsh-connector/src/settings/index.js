/**
 * The connector row's V3 settings (task C-WIRE; design §5.1, §5.9; R-CON-10, R-TOK-08, R-ROUTE-04,
 * R-OA-20 Q-OA-7 A; K1d `SettingsWriter`).
 *
 * - `SETTINGS_SCHEMA` (schema.js): the V3 fields of the row's Config.
 * - `createSettings({ctx, config, tokens, logger})` → `{read, onChange, writer, restoreTokens, follow}`:
 *   - `read()`: the live `{agentToken?, maxQueuedInputs?, approvalPort, maxMessageBytes}`; the
 *     shape routing, revocation and the hosted service take as their `settings.get`;
 *   - `onChange(fn) → dispose`: fires after every applied change, **after `TokenRegistry.apply`
 *     of it has resolved** (the routing contract, routing/index.js: a re-enable, an added or a
 *     removed entry reaches routing and revocation only through this port);
 *   - `writer`: the K1d SettingsWriter (`addToken`, `removeToken`, `setDesignated`), one write
 *     after another, each resolving once DSH has saved it and the registry has applied it;
 *   - `restoreTokens(previous)`: the registry's write-back of a refused save;
 *   - `follow()`: subscribes to the row's volatile updates (DSH's loader event) for the row's life.
 *
 * **One owner of the sync.** Every change of the token list, whoever made it, reaches the registry
 * through `syncNow` here, on one serial chain. Each loader event is marked, **when it fires**, as
 * the connector's own (`SYNC_REASON.own`: never refused, never the user saving) or a user save
 * (`settings`). DSH's config editor runs one edit at a time under its profile lock, and the
 * loader's volatile update fires inside that edit, before the settings service resolves
 * (dsh-config-editor `edit`, dsh-app-boot `reconcileProfilePatches`, both SDKs). An event is the
 * connector's own when one of its saves is in flight **and** the token list the event carries is
 * exactly the list that save writes (computed before the save); any other event is a user's, so a
 * user save that waited on the lock behind (or ahead of) an own save is still judged as a save.
 * The registry thus learns who made a change from the connector itself, never by guessing from the
 * previous list (the C-TOKENS limit: a second user save made before a refused save's restore
 * completed was taken for the restore). Revisit if DSH ever applies a save outside the edit.
 */
import { AsyncResource } from 'node:async_hooks'
import { APPROVAL_LISTENER } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { serialChain } from '../routing/support.js'
import { SYNC_REASON } from '../tokens/index.js'
import { LOG, MISUSE, PATH_OP, SETTING, SETTINGS_SERVICE } from './constants.js'

export { SETTING } from './constants.js'
export { SETTINGS_SCHEMA } from './schema.js'

/** A volatile field arrives as a live reference (`.get()`); a plain value (direct construction in tests) reads the same. */
function liveAt(config, path) {
  const raw = path.reduce((node, key) => node?.[key], config)
  return raw !== null && typeof raw === 'object' && typeof raw.get === 'function' ? raw.get() : raw
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * @param {object} deps
 * @param deps.ctx - the connector row's context (`on`, `get`, `effect`)
 * @param deps.config - the row's Config as Cordis passed it to apply()
 * @param deps.namespace - the row id, the settings namespace DSH's settings service writes
 * @param deps.limits - `() => {maxQueuedInputs, maxMessageBytes, …}` (src/config.js readLimits)
 * @param deps.volatileEvent - DSH's loader event after a volatile-only change
 * @param deps.logger - `{warn}`
 * @returns see the module comment; `bind(tokens)` must run once before `follow()` and any write
 */
export function createSettings({ ctx, config, namespace, limits, volatileEvent, logger }) {
  const chain = serialChain()
  const listeners = new Set()
  let tokens
  /** The token list as last applied, so a loader event that changes nothing else does no sync. */
  let applied

  const tokenList = () => liveAt(config, SETTING.tokens) ?? []
  const read = () => Object.freeze({
    agentToken: liveAt(config, SETTING.agentToken),
    maxQueuedInputs: limits().maxQueuedInputs,
    maxMessageBytes: limits().maxMessageBytes,
    approvalPort: liveAt(config, SETTING.approvalPort) ?? APPROVAL_LISTENER.defaultPort,
  })

  function fire() {
    for (const listener of [...listeners]) {
      try { listener() } catch (error) { logger.warn(LOG.format, LOG.listenerFailed, diagnosticOf(error)) }
    }
  }

  /**
   * Applies the list now in the config with `reason` (skipped when it is the one already applied
   * and the reason is not the start's), then tells the listeners. Runs inside the chain.
   * @returns the registry's answer, or undefined when nothing was applied
   */
  async function syncNow(reason) {
    const list = tokenList()
    let answer
    if (reason === SYNC_REASON.start || !sameJson(list, applied)) {
      applied = structuredClone(list)
      answer = await tokens.apply(list, reason)
    }
    fire()
    return answer
  }

  const settingsService = () => {
    const service = ctx.get(SETTINGS_SERVICE.settings)
    if (service === undefined) throw new Error(MISUSE.noSettings)
    return service
  }

  /**
   * The async context the row was applied in. DSH runs a settings save and the loader's volatile
   * update it triggers inside one HMR transaction, held in an AsyncLocalStorage context
   * (dsh-hmr `runExclusive`, both SDKs), and refuses a save started from inside it ("HMR
   * transactions cannot be nested"). The connector's own saves are often started from inside that
   * event (a refused save's write-back, a delete's `setDesignated(undefined)` from revocation), so
   * each runs in the row's own context instead: it then queues behind the running edit, as any
   * other save does, and never nests in it.
   */
  const outside = new AsyncResource(SETTINGS_SERVICE.asyncResource)
  /** The token lists the connector's own saves in flight write, one per save (see the module comment). */
  const ownLists = []
  /**
   * One save of the connector's own. `list` is the token list the document holds once `ops` is
   * saved; the loader event that carries exactly it is this save's.
   */
  async function ownSave(ops, list) {
    const mark = structuredClone(list)
    ownLists.push(mark)
    try { await outside.runInAsyncScope(() => settingsService().mutate(namespace, ops)) } finally {
      const at = ownLists.indexOf(mark)
      if (at >= 0) ownLists.splice(at, 1)
    }
  }
  /** Whether the list now in the config is an own save's in flight; consumes that mark. */
  function takeOwnMark() {
    const at = ownLists.findIndex((list) => sameJson(list, tokenList()))
    if (at < 0) return false
    ownLists.splice(at, 1)
    return true
  }

  /**
   * One own write: DSH saves `ops` (which updates the row's live config before it resolves, as
   * dsh-config-editor reconciles the profile in the same edit), then the registry applies the
   * result as the connector's own. It rejects when the save fails, with the document unchanged.
   * The registry never refuses an own sync (SYNC_REASON.own), so K1d's "the sync refuses it" case
   * cannot arise here: an own write adds no item without a record (C-TOKENS writes the record
   * first) and never a second item of one key (keys are random).
   */
  // `planOf(list)` is read inside the step, so an index into the list is taken after every earlier
  // write (K1d-3: writes run in call order). It answers `{ops, list}` (the list after the save) or
  // undefined for a no-op.
  function write(planOf) {
    return chain(async () => {
      const plan = planOf(tokenList())
      if (plan === undefined) return
      await ownSave(plan.ops, plan.list)
      await syncNow(SYNC_REASON.own)
    })
  }

  const writer = Object.freeze({
    addToken: (item) => write((list) => {
      const added = { label: item.label, enabled: item.enabled, key: item.key }
      return { ops: [{ op: PATH_OP.set, path: [...SETTING.tokens, String(list.length)], value: added }], list: [...list, added] }
    }),
    /** Absent key: resolves with nothing changed (K1d-3). */
    removeToken: (entryKey) => write((list) => {
      const at = list.findIndex((item) => item.key === entryKey)
      return at < 0 ? undefined : { ops: [{ op: PATH_OP.unset, path: [...SETTING.tokens, String(at)] }], list: list.filter((_, index) => index !== at) }
    }),
    setDesignated: (entryKey) => write((list) => ({
      ops: [entryKey === undefined ? { op: PATH_OP.unset, path: SETTING.agentToken } : { op: PATH_OP.set, path: SETTING.agentToken, value: entryKey }],
      list,
    })),
  })

  /**
   * The registry's write-back of a refused save. It runs inside the registry's own queue (an apply
   * this chain is awaiting), so it only saves: its loader event, marked own when it fires, is
   * applied by the step it queues behind the current one.
   */
  async function restoreTokens(previous) {
    try {
      await ownSave([{ op: PATH_OP.set, path: SETTING.tokens, value: previous }], previous)
    } catch (error) {
      logger.warn(LOG.format, LOG.restoreFailed, diagnosticOf(error))
      throw error
    }
  }

  /** A volatile update of the row: a user's save in DSH's form, or the echo of an own save. */
  function onVolatileUpdate() {
    const reason = takeOwnMark() ? SYNC_REASON.own : SYNC_REASON.settings
    chain(() => syncNow(reason)).catch((error) => logger.warn(LOG.format, LOG.applyFailed, diagnosticOf(error)))
  }

  return Object.freeze({
    read,
    onChange(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    writer,
    restoreTokens,
    /** Binds the registry this module syncs; once, before `start` and `follow`. */
    bind(registry) { tokens = registry },
    /** The start sync (SYNC_REASON.start), on the chain. */
    start: () => chain(() => syncNow(SYNC_REASON.start)),
    /** Follows the row's volatile updates for the row's life. */
    follow: () => ctx.on(volatileEvent, onVolatileUpdate),
    /** Resolves once every queued sync has run. */
    drain: () => chain(async () => {}),
  })
}
