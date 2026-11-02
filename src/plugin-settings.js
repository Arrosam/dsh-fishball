/**
 * Settings for the plugins Fishball runs in its own private tree (DESIGN §10d "Settings for
 * Fishball"): your values (or Fishball's, after you allow them) per row, stored in table
 * `plugin_settings`, never in the DSH profile.
 *
 * - A row's config is its bundle patch config with the stored values deep-merged on top
 *   (`overlay`, called by the catalog's idle-phase apply, so a change never lands mid-turn).
 *   A mid-turn listing mount reuses the values of the last idle-phase apply (review H1).
 * - The form and the tools read each row's schema from its module's `Config` export, imported
 *   the way the private tree imports it (spike S29). Secret values are removed with DSH's own
 *   `redactSecrets` before anything leaves the Host: the page, the tools, the prompt and the
 *   schema's error messages, which echo the rejected data (review H2, H3).
 * - Every save is checked against the row's schema, inside a per-plugin queue, against the
 *   values stored at that moment. This is required, not a courtesy: a row mounted with an
 *   invalid config is not reported by DSH's row audit and silently keeps its old values (S30).
 * - A plugin on in DSH runs once for every session, so its settings are DSH's: nothing here
 *   applies to it. Values stored earlier are kept, unused (Q-manager-stale).
 */
import { isVolatile } from '@deepseek-ai/cosmokit'
import { redactSecrets } from '@deepseek-ai/dsh-settings'
import { PLUGIN_ACTION, PLUGIN_CHANGE_OK, PLUGIN_ERROR, PLUGIN_MANAGER } from './constants.js'
import { diagnosticOf } from './errors.js'

/** A settings request refused with a stable PLUGIN_ERROR code (and the failing `path` for invalid). */
export class SettingsError extends Error {
  constructor(code, path) {
    super(code)
    this.code = code
    if (path !== undefined) this.path = path
  }
}

const ROW_ERROR = PLUGIN_MANAGER.rowError
const UNSAFE_KEYS = new Set(PLUGIN_MANAGER.unsafeKeys)

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype

/** A schema's output with each `.volatile()` field's live reference read (cosmokit Volatile). */
const unwrapVolatile = (value) => {
  if (isVolatile(value)) return unwrapVolatile(value.get())
  if (Array.isArray(value)) return value.map(unwrapVolatile)
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, unwrapVolatile(inner)]))
  return value
}

/** Detached JSON copy (schema output can hold class instances; the wire takes plain JSON). */
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

/**
 * Deep merge: plain objects merge key by key; arrays and every other value replace (DESIGN §10d).
 * The result shares no plain object with `over`; prototype keys are skipped (review L11).
 */
export function deepMerge(base, over) {
  if (!isPlainObject(over)) return over === undefined ? base : over
  const out = isPlainObject(base) ? { ...base } : {}
  for (const [key, value] of Object.entries(over)) {
    if (!UNSAFE_KEYS.has(key)) out[key] = deepMerge(out[key], value)
  }
  return out
}

/** A copy of `value` without the field at `path`; parents left empty are removed too. `[]` removes everything. */
function withoutPath(value, path) {
  if (path.length === 0 || !isPlainObject(value)) return path.length === 0 ? {} : value
  const [head, ...rest] = path
  if (!Object.hasOwn(value, head)) return value
  const out = { ...value }
  if (rest.length === 0) delete out[head]
  else {
    const inner = withoutPath(out[head], rest)
    if (isPlainObject(inner) && Object.keys(inner).length === 0) delete out[head]
    else out[head] = inner
  }
  return out
}

/** The value at `path`, or undefined. */
const valueAt = (value, path) => path.reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), value)

/** Leaf paths of a plain-object tree; arrays and non-objects are leaves. */
function leafPaths(value, at = []) {
  if (!isPlainObject(value)) return [at]
  const keys = Object.keys(value)
  return keys.length === 0 ? [] : keys.flatMap((key) => leafPaths(value[key], [...at, key]))
}

/** Whether two paths overlap: one is the other or lies under it. */
const overlaps = (a, b) => a.slice(0, b.length).every((key, i) => key === b[i]) || b.slice(0, a.length).every((key, i) => key === a[i])

/** The field path Schemastery's error names (`$.a.b[2] expected …` -> ['a','b','2']); [] when none. */
export function errorPath(error) {
  const match = PLUGIN_MANAGER.errorPath.exec(String(error?.message ?? ''))
  if (match === null) return []
  return [...match[1].matchAll(PLUGIN_MANAGER.errorSegment)].map((segment) => segment[1] ?? segment[2])
}

/** A schema error's message without the rejected data it echoes (which can hold a secret). */
function safeMessage(error) {
  const message = String(error?.message ?? '')
  const cut = message.indexOf(PLUGIN_MANAGER.errorDataMarker)
  return (cut < 0 ? message : message.slice(0, cut)).trim()
}

/** Every leaf row of a row list, group children included (only leaf rows have settings). */
const leafRows = (rows) => rows.flatMap((row) => (row.group && Array.isArray(row.config) ? leafRows(row.config) : row.group ? [] : [row]))

/**
 * Leaf fields of a live schema with their kind, for get_plugin_settings. Objects and
 * intersections are walked; everything else is one field. Hidden fields are left out.
 */
function fieldsOf(schema, at = []) {
  if (!schema || schema.meta?.hidden) return []
  if (schema.type === 'object') return Object.entries(schema.dict ?? {}).flatMap(([key, inner]) => fieldsOf(inner, [...at, key]))
  if (schema.type === 'intersect') return (schema.list ?? []).flatMap((inner) => fieldsOf(inner, at))
  const choices = schema.type === 'union' && (schema.list ?? []).every((branch) => branch.type === 'const') ? schema.list.map((branch) => branch.value) : undefined
  return [{ path: at, kind: schema.type, description: schema.meta?.description ?? null, secret: schema.meta?.role === PLUGIN_MANAGER.secretRole, ...(choices ? { choices } : {}) }]
}

/** A structured copy, or the value itself when it holds something that cannot be copied (a function from a `!!js` value). */
function copyOf(value) {
  try { return structuredClone(value) } catch { return value }
}

/**
 * Redacted copy of a value under a schema, and its secret slots. Fails closed: a value the
 * redaction cannot walk is not sent at all.
 */
function redact(schema, value) {
  try {
    const { value: stripped, secrets } = redactSecrets(schema, value)
    return { value: plain(stripped) ?? {}, secrets, failed: false }
  } catch {
    return { value: {}, secrets: [], failed: true }
  }
}

/**
 * One row's values worked out with its schema: its own resolved config, the resolved config with
 * your values, and (when that is invalid) the raw merged config and the schema's error.
 */
function resolveRow(schema, base, user) {
  const check = (config) => {
    try { return { value: unwrapVolatile(schema(copyOf(config))) } } catch (error) { return { error } }
  }
  const own = check(base)
  const merged = check(deepMerge(base, user))
  return { own: own.value ?? base, current: merged.value ?? deepMerge(base, user), error: merged.error }
}

export class PluginSettings {
  #store
  #rowsOf
  #loadModule
  #resolveConfig
  #isFixedRow
  #onSaved
  #audit
  #logger
  /** module name -> Promise<schema | null> (Node caches modules; a reload needs a restart, DESIGN §4). */
  #schemas = new Map()
  /** Stored rows per plugin as the last idle-phase apply mounted them, and the ones being applied now. */
  #applied = new Map()
  #staged = new Map()
  /** Per-plugin tail of settings changes, so each one sees the values the one before saved (review M1). */
  #queues = new Map()

  /**
   * @param store - Store (pluginSettings table).
   * @param deps.rowsOf - (key) => { shared, rows } (catalog.settingsRows: unprefixed rows, module
   *   names as the private tree imports them); throws CatalogError(unknownPlugin).
   * @param deps.loadModule - async (name) => the plugin module as the private tree imports it.
   * @param deps.resolveConfig - (config) => config with `!!js` values evaluated as the tree does.
   * @param deps.isFixedRow - (key, rowId) => whether the row's config is owned elsewhere (the
   *   Compaction engine row: the context window sets it, DESIGN §6).
   * @param deps.onSaved - called after stored values changed (schedule the apply, publish).
   * @param deps.audit - (plugin, action, by, outcome) => Promise (catalog.audit).
   * @param deps.logger - plugin logger (codes only).
   */
  constructor(store, { rowsOf, loadModule, resolveConfig, isFixedRow, onSaved, audit, logger }) {
    this.#store = store
    this.#rowsOf = rowsOf
    this.#loadModule = loadModule
    this.#resolveConfig = resolveConfig
    this.#isFixedRow = isFixedRow
    this.#onSaved = onSaved
    this.#audit = audit
    this.#logger = logger
  }

  /** Whether any values are stored for the plugin. */
  has(key) {
    return this.#store.pluginSettings.get(key) !== undefined
  }

  /**
   * The rows with stored values merged into their config (leaf rows, group children included).
   * Used by the catalog before it prefixes ids. An idle-phase apply takes the values stored now
   * and stages them; a mid-turn listing mount (`purpose.listing`) takes the values of the last
   * confirmed apply, so a save never reaches a running plugin mid-turn (review H1). A plugin not
   * mounted by that apply (the one being listed) takes the values stored now.
   */
  overlay(key, rows, purpose = {}) {
    let stored
    if (purpose.listing && this.#applied.has(key)) stored = this.#applied.get(key)
    else {
      stored = this.#store.pluginSettings.get(key)?.rows
      if (!purpose.listing) this.#staged.set(key, stored)
    }
    if (stored === undefined) return rows
    const apply = (row) => {
      if (row.group && Array.isArray(row.config)) return { ...row, config: row.config.map(apply) }
      const values = stored[row.id]
      return values === undefined || row.group ? row : { ...row, config: deepMerge(row.config ?? {}, values) }
    }
    return rows.map(apply)
  }

  /** The idle-phase apply mounted what it staged: that is now what a listing mount reuses. */
  confirmApplied() {
    this.#applied = this.#staged
    this.#staged = new Map()
  }

  /** The row's schema, or null when its module declares none; rejects when the module cannot load. */
  #schemaOf(name) {
    let pending = this.#schemas.get(name)
    if (pending === undefined) {
      pending = this.#loadModule(name).then((plugin) => {
        const schema = plugin?.Config ?? plugin?.schema
        // A global symbol marks Schemastery schemas, so a plugin's own copy of the library counts too.
        return schema?.[PLUGIN_MANAGER.schemaMark] === true ? schema : null
      })
      // A failed import is not cached: it may work after the package is fixed.
      pending.catch(() => this.#schemas.delete(name))
      this.#schemas.set(name, pending)
    }
    return pending
  }

  /**
   * Every leaf row of the plugin with its live schema and values (internal shape). A row whose
   * module cannot load or whose `!!js` config cannot be evaluated carries an error and no
   * schema, so the other rows still work (review M5).
   * @throws CatalogError(unknownPlugin) from rowsOf.
   */
  async #rows(key) {
    const { shared, rows } = this.#rowsOf(key)
    const out = []
    for (const row of leafRows(rows)) {
      let schema = null
      let error = null
      let base = {}
      try {
        schema = await this.#schemaOf(row.name)
      } catch (failure) {
        this.#logger.warn('settings of %s#%s unreadable (%s)', key, row.id, diagnosticOf(failure))
        error = ROW_ERROR.moduleUnavailable
      }
      try {
        // Not cloned: a `!!js` value is a loader object; interpolate returns new values.
        base = this.#resolveConfig(row.config ?? {})
      } catch (failure) {
        this.#logger.warn('settings of %s#%s: config not evaluated (%s)', key, row.id, diagnosticOf(failure))
        schema = null
        error = ROW_ERROR.configUnresolved
      }
      // A copy: the schema check may write adapted values into what it is given (review L10).
      const user = copyOf(this.#store.pluginSettings.get(key)?.rows?.[row.id] ?? {})
      out.push({ row: row.id, module: row.name, schema, base, user, error, editable: !shared && schema !== null && !this.#isFixedRow(key, row.id) })
    }
    return { shared, rows: out }
  }

  /**
   * The plugin page's rows (DESIGN §10d "Host API"): schema JSON, the row's own values, your
   * values and the resolved ones, each without secret values, and the secret slots (`stored`:
   * you set it, so Clear can drop it).
   */
  async describe(key) {
    const { shared, rows } = await this.#rows(key)
    return {
      shared,
      rows: rows.map(({ row, module, schema, base, user, error, editable }) => {
        const empty = { row, module, schema: null, base: {}, user: {}, value: {}, secrets: [], error, editable: false }
        if (schema === null) return empty
        let json
        // A schema toJSON cannot serialize leaves no form, not a failed page (review L12).
        try { json = plain(schema.toJSON()) } catch { return { ...empty, error: ROW_ERROR.schemaUnreadable } }
        const values = resolveRow(schema, base, user)
        const current = redact(schema, values.current)
        const yours = redact(schema, user)
        const stored = new Set(yours.secrets.filter((slot) => slot.set).map((slot) => JSON.stringify(slot.path)))
        return {
          row,
          module,
          schema: json,
          base: redact(schema, values.own).value,
          user: yours.value,
          value: current.value,
          secrets: current.secrets.map((slot) => ({ ...slot, stored: stored.has(JSON.stringify(slot.path)) })),
          error: values.error ? safeMessage(values.error) : error,
          editable,
        }
      }),
    }
  }

  /**
   * Fields of each editable row for get_plugin_settings: path (dotted), kind, description, the
   * plugin's value and the current one (both redacted), whether you changed it; a secret shows
   * only `set`. Rows that cannot be edited report only their error.
   */
  async fields(key) {
    const { shared, rows } = await this.#rows(key)
    return {
      shared,
      rows: rows.filter((row) => row.editable || row.error !== null).map(({ row, schema, base, user, error, editable }) => {
        if (!editable) return { row, error, fields: [] }
        const values = resolveRow(schema, base, user)
        const current = redact(schema, values.current)
        const own = redact(schema, values.own).value
        const set = (path) => current.secrets.some((slot) => JSON.stringify(slot.path) === JSON.stringify(path) && slot.set)
        return {
          row,
          error: values.error ? safeMessage(values.error) : null,
          fields: fieldsOf(schema).map(({ path, kind, description, secret, choices }) => {
            const field = { path: path.join('.'), kind, description, changed: valueAt(user, path) !== undefined, secret, ...(choices ? { choices } : {}) }
            return secret ? { ...field, set: set(path) } : { ...field, pluginValue: valueAt(own, path) ?? null, value: valueAt(current.value, path) ?? null }
          }),
        }
      }),
    }
  }

  /**
   * Work out one change without saving it: the refusals of DESIGN §10d in order, the new stored
   * values, and the changed fields with old and new values. Values come from redacted configs,
   * and a change on or around a secret field shows no values (review H2).
   * @param change - { values?, reset? }; @param options.secrets - whether secret fields may be
   *   touched (you, yes; Fishball, no: any path on, above or under a secret slot is refused).
   * @throws SettingsError(sharedWithDsh | unknownRow | noSettings | secretField | invalidSettings).
   */
  async plan(key, rowId, { values, reset = [] }, { secrets }) {
    const { shared, rows } = await this.#rows(key)
    if (shared) throw new SettingsError(PLUGIN_ERROR.sharedWithDsh)
    const row = rows.find((candidate) => candidate.row === rowId)
    if (row === undefined) throw new SettingsError(PLUGIN_ERROR.unknownRow)
    if (!row.editable) throw new SettingsError(PLUGIN_ERROR.noSettings)
    let next = values === undefined ? row.user : deepMerge(row.user, values)
    for (const path of reset) next = withoutPath(next, path)
    const touched = [...(values === undefined ? [] : leafPaths(values)), ...reset]
    const before = resolveRow(row.schema, row.base, row.user)
    const after = resolveRow(row.schema, row.base, next)
    const walks = [redact(row.schema, before.current), redact(row.schema, after.current), redact(row.schema, values ?? {})]
    const slots = [...walks[0].secrets, ...walks[1].secrets, ...walks[2].secrets.filter((slot) => slot.set)]
    const nearSecret = (path) => slots.some((slot) => overlaps(path, slot.path))
    // Fishball may touch nothing near a secret; when the secrets cannot be found at all, it touches nothing.
    if (!secrets && (walks.some((walk) => walk.failed) || touched.some(nearSecret))) throw new SettingsError(PLUGIN_ERROR.secretField)
    // Removing all your values cannot make a row worse than its own patch config, even when that
    // config is invalid on its own (S29), so "Reset all" is never refused (A118).
    if (after.error && Object.keys(next).length > 0) throw new SettingsError(PLUGIN_ERROR.invalidSettings, errorPath(after.error))
    const shown = { old: redact(row.schema, before.current).value, new: redact(row.schema, after.current).value }
    const changes = touched
      .map((path) => (nearSecret(path)
        ? { path, secret: true, differs: JSON.stringify(valueAt(before.current, path)) !== JSON.stringify(valueAt(after.current, path)) }
        : { path, old: plain(valueAt(shown.old, path)), new: plain(valueAt(shown.new, path)) }))
      .filter((change) => (change.secret ? change.differs : JSON.stringify(change.old) !== JSON.stringify(change.new)))
      .map(({ differs, ...change }) => change)
    return { plugin: key, row: rowId, next, changes }
  }

  /**
   * Plan and save one change in the plugin's queue, against the values stored at that moment,
   * so a change made while a prompt was open is kept and the saved config is always the one
   * checked (review M1). A change that changes nothing saves nothing (review L2).
   * @returns the plan that was saved (changes empty when nothing was saved).
   * @throws SettingsError as plan() does.
   */
  save(key, rowId, change, options, by) {
    const run = (this.#queues.get(key) ?? Promise.resolve()).then(async () => {
      const plan = await this.plan(key, rowId, change, options)
      if (plan.changes.length > 0) await this.#commit(plan, by)
      return plan
    })
    this.#queues.set(key, run.catch(() => {}))
    return run
  }

  /** Store a planned change and audit it. */
  async #commit({ plugin, row, next }, by) {
    const record = this.#store.pluginSettings.get(plugin)
    const rows = { ...(record?.rows ?? {}) }
    if (Object.keys(next).length === 0) delete rows[row]
    else rows[row] = next
    if (Object.keys(rows).length === 0) await this.#store.pluginSettings.delete(plugin)
    else await this.#store.pluginSettings.put(plugin, { rows, changedBy: by, changedAt: new Date().toISOString() })
    await this.#audit(plugin, PLUGIN_ACTION.settings, by, PLUGIN_CHANGE_OK)
    this.#onSaved()
  }
}
