/**
 * Host-only official-SDK boundary for one-shot provider migration. Inventory never
 * reads credential values (a profile's apiKeyEnv is only described); only the
 * coordinator's confirmed readRecord call reads one. Configuration files are not accessed here.
 */
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { isVolatile } from '@deepseek-ai/cosmokit'
import { Config, recordKeyFor } from '@deepseek-ai/dsh-llm-pi-ai'
import { redact } from './native-runtime/stderr-log.js'
import { unsafeProfileReason } from './provider-sync.js'

export const PROVIDER_SYNC_HOST = Object.freeze({
  owner: '@deepseek-ai/dsh-llm-pi-ai', activeState: 2, minimumRevision: 0, uniqueCount: 1, firstIndex: 0,
  providers: 'providers', set: 'set', apiKey: 'api-key', grant: 'grant',
  imported: 'imported', exists: 'exists', empty: '',
  outcome: Object.freeze({ config: 'configOutcome', key: 'keyOutcome', added: 'added', unknown: 'unknown' }),
  referenceField: 'apiKeyEnv',
  /** dsh-credentials' CredentialRef grammar (a POSIX shell identifier), as `credentialRef()` checks it. */
  referenceName: /^[A-Za-z_][A-Za-z0-9_]*$/,
  hashAlgorithm: 'sha256', hashEncoding: 'hex',
  /** Schemastery's serialised form: the root uid, the node table, and the fields that hold a node uid. */
  schemaRefs: Object.freeze({ uid: 'uid', refs: 'refs', single: Object.freeze(['sKey', 'inner']), list: 'list', dict: 'dict' }),
  identityKeys: Object.freeze(['runtimeId', 'profileId', 'schemaVersion', 'version']),
  profileFields: Object.freeze(['displayName', 'api', 'baseURL', 'models']),
  modelFields: Object.freeze(['id', 'name', 'contextWindow', 'maxTokens', 'input']),
  recordFields: Object.freeze(['kind', 'key']),
  defaultRoute: 'fishball-sync-default', defaultModel: 'fishball-sync-default-model',
  route: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  identifier: /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/,
  errorMessage: 'Provider sync host refused the operation.',
  /**
   * The host log for a wrapped failure's cause (B9: a missing inject hid behind inventory-failed).
   * The cause's text is logged, redacted and cut, only for the codes whose operation never holds a
   * key value (inventory describes records, never reads them); any other code logs its class only.
   */
  diagnostic: Object.freeze({ logger: 'fishball-provider-sync', maxChars: 240, unknown: 'Error' }),
  code: Object.freeze({
    invalid: 'provider-sync-invalid', inventory: 'provider-sync-inventory-failed',
    owner: 'provider-sync-unsupported-owner', schema: 'provider-sync-unsupported-schema',
    path: 'provider-sync-unsupported-path', ambiguous: 'provider-sync-ambiguous-route',
    profile: 'provider-sync-unsupported-profile', reference: 'provider-sync-unsupported-reference',
    auth: 'provider-sync-api-key-unavailable', credential: 'provider-sync-unsupported-credential',
    describe: 'provider-sync-credential-unavailable', unknown: 'provider-sync-unknown-provider',
    preview: 'provider-sync-preview-required', stale: 'provider-sync-stale', cancelled: 'provider-sync-cancelled',
    exists: 'provider-exists', credentialExists: 'credential-exists', read: 'provider-sync-read-failed',
    write: 'provider-sync-write-failed', verify: 'provider-sync-verify-failed',
  }),
})
const H = PROVIDER_SYNC_HOST
const E = H.code
const ownerTokens = new WeakMap()
const plain = (value) => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const text = (value) => typeof value === 'string' && value.trim().length > H.empty.length
const routeId = (value) => typeof value === 'string' && H.route.test(value)
const namespaceId = (value) => typeof value === 'string' && H.identifier.test(value)
const revision = (value) => Number.isSafeInteger(value) && value >= H.minimumRevision
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
/**
 * A described schema's structure with Schemastery's uids renumbered by a fixed walk.
 *
 * `settings.describe()` serialises a schema as `{uid, refs}`, where every node's uid comes from
 * a process-global counter (`globalThis.__schemastery_index__`) and every describe builds fresh
 * nodes. The raw JSON therefore differs between two describes in one process, and between the
 * main DSH and the child, for an identical schema; hashing it made every namespace look
 * incompatible or stale. Renumbering by the walk the library itself uses to rebuild a schema
 * (sKey, inner, list, dict: Schemastery 3.18.5 and 3.19.0, `new Schema({refs})`) keeps every
 * real difference and drops only the counter. Any other shape is hashed raw, as before.
 */
function structuralSchema(schema) {
  const S = H.schemaRefs
  if (!Number.isSafeInteger(schema[S.uid]) || !plain(schema[S.refs])) return schema
  const refs = schema[S.refs]
  const order = new Map()
  const children = (node) => [
    ...S.single.map((key) => node[key]).filter((uid) => uid !== undefined && uid !== null),
    ...(Array.isArray(node[S.list]) ? node[S.list] : []),
    ...(plain(node[S.dict]) ? Object.keys(node[S.dict]).sort().map((key) => node[S.dict][key]) : []),
  ]
  const pending = [schema[S.uid]]
  while (pending.length > H.minimumRevision) {
    const uid = pending.shift()
    if (order.has(uid)) continue
    const node = refs[uid]
    // A dangling reference is not a shape this walk knows: hash the raw form, which can only
    // make the namespace look incompatible (a skip), never equal to another.
    if (!plain(node)) return schema
    order.set(uid, order.size)
    pending.push(...children(node))
  }
  const renumber = (uid) => order.get(uid)
  return [...order.keys()].map((uid) => {
    const node = { ...refs[uid] }
    for (const key of S.single) if (node[key] !== undefined && node[key] !== null) node[key] = renumber(node[key])
    if (Array.isArray(node[S.list])) node[S.list] = node[S.list].map(renumber)
    if (plain(node[S.dict])) node[S.dict] = Object.fromEntries(Object.entries(node[S.dict]).map(([key, uid]) => [key, renumber(uid)]))
    return node
  })
}
const fingerprint = (schema) => createHash(H.hashAlgorithm).update(JSON.stringify(canonical(structuralSchema(schema)))).digest(H.hashEncoding)
const unwrap = (value) => isVolatile(value) ? unwrap(value.get()) : Array.isArray(value) ? value.map(unwrap)
  : plain(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrap(item)])) : value

export class ProviderSyncHostError extends Error {
  /** @param profileReason the shared profile verdict when this refusal is one (src/provider-sync.js). */
  constructor(code, profileReason) { super(H.errorMessage); this.code = code; this.profileReason = profileReason }
}
const refuse = (code) => { throw new ProviderSyncHostError(code) }
/**
 * A refused profile keeps the host's provider-sync-unsupported-profile code, while the shared
 * verdict travels with it as profileReason so the preview can report the exact reason.
 */
const refuseProfile = (profileReason) => { throw new ProviderSyncHostError(E.profile, profileReason) }
const outcomeError = (error, field, outcome) => {
  const sanitized = new ProviderSyncHostError(error instanceof ProviderSyncHostError ? error.code : E.write)
  sanitized[field] = outcome
  return sanitized
}
/** A wrapped failure's cause for the host log only; see H.diagnostic for what may be logged. */
const causeOf = (code, error) => code === E.inventory || code === E.describe
  ? redact(String(error?.message ?? H.diagnostic.unknown)).slice(H.firstIndex, H.diagnostic.maxChars)
  : error?.name ?? H.diagnostic.unknown
const protect = async (code, operation, logger) => {
  try { return await operation() } catch (error) {
    // SDK validation errors can echo configuration or credentials: the refusal never carries a
    // cause, and only the redacted host log keeps one.
    if (error instanceof ProviderSyncHostError) throw error
    try { logger?.warn('%s (%s)', code, causeOf(code, error)) } catch { /* logging never changes the refusal */ }
    refuse(code)
  }
}
function ownerToken(entry) {
  let fibers = ownerTokens.get(entry)
  if (!fibers) { fibers = new WeakMap(); ownerTokens.set(entry, fibers) }
  let activation = fibers.get(entry.fiber)
  // Cordis restart() reuses the Entry/Fiber/runtime but replaces its public store on
  // every activation. A completed same-config restart must still expire old consent.
  if (!activation || activation.store !== entry.fiber.store) {
    activation = { store: entry.fiber.store, token: randomUUID() }; fibers.set(entry.fiber, activation)
  }
  return activation.token
}
function identityOf(identity) {
  if (!plain(identity) || !H.identityKeys.every((key) => typeof identity[key] === 'string' && H.identifier.test(identity[key]))) refuse(E.invalid)
  return Object.freeze(Object.fromEntries(H.identityKeys.map((key) => [key, identity[key]])))
}
function defaultsOf() {
  // Settings.value is resolved Config, not raw user input. Compare with the official
  // callable root Config so generated arrays/maps/timers are not mistaken for edits.
  const providers = unwrap(Config({ providers: { [H.defaultRoute]: {} } })).providers
  const modelProviders = unwrap(Config({ providers: { [H.defaultRoute]: { models: [{ id: H.defaultModel }] } } })).providers
  const { id: _id, ...model } = modelProviders[H.defaultRoute].models.at(H.firstIndex)
  return { profile: providers[H.defaultRoute], model }
}
function projectFields(value, allowed, defaults) {
  if (!plain(value)) refuse(E.profile)
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === H.referenceField) refuse(E.reference)
    // Only an actual canonical default is dispensable, never an unknown nondefault
    // field (headers, reasoning, compat, etc.), even if settings redacted its secrets.
    if (Object.hasOwn(defaults, key) && isDeepStrictEqual(item, defaults[key])) continue
    if (!allowed.includes(key)) refuse(E.profile)
    result[key] = item
  }
  return result
}
/**
 * A route profile's apiKeyEnv split from its transferable fields. The user asked on 2026-11-06 for
 * Refresh models to bring a provider whose key comes from apiKeyEnv over with its key: the child's
 * environment differs, so the reference itself is never written there (safeProfile still refuses
 * it); readRecord resolves it here and the child stores the value as a plain API-key record.
 */
function splitReference(value) {
  if (!plain(value) || !Object.hasOwn(value, H.referenceField)) return { profile: value }
  const { [H.referenceField]: reference, ...profile } = value
  if (typeof reference !== 'string' || !H.referenceName.test(reference)) refuse(E.reference)
  return { profile, reference }
}
function safeProfile(value, declared, defaults) {
  const result = projectFields(value, H.profileFields, defaults.profile)
  // Models are projected like the profile so canonical defaults are dropped before the shared
  // rule sees them; it then owns every safety check, including the https-only endpoint.
  if (result.models !== undefined) {
    if (!Array.isArray(result.models)) refuse(E.profile)
    result.models = result.models.map((model) => projectFields(model, H.modelFields, defaults.model))
  }
  const refusal = unsafeProfileReason(result, declared)
  if (refusal !== undefined) refuseProfile(refusal)
  // Detach each model's input list from the settings value the descriptor still owns.
  if (result.models !== undefined) result.models = result.models.map((model) => ({ ...model, ...(model.input === undefined ? {} : { input: [...model.input] }) }))
  return result
}
function safeRecord(record) {
  if (!plain(record) || record.kind !== H.apiKey || !text(record.key)
    || Object.keys(record).some((key) => !H.recordFields.includes(key))) refuse(E.credential)
  return { kind: H.apiKey, key: record.key }
}
const providerPath = (id) => [H.providers, id]
const validPath = (path, id) => Array.isArray(path) && isDeepStrictEqual(path, providerPath(id))
const present = (descriptor, id) => plain(descriptor?.value?.providers) && Object.hasOwn(descriptor.value.providers, id)
const emptyCredential = () => ({ configured: false, writable: false })
const checkSignal = (signal) => { if (signal?.aborted) refuse(E.cancelled) }
/**
 * A dormant built-in route keyed by its API-key record alone: no settings entry, an api-key
 * sign-in method and a fixed endpoint. Its key may be read for the sync (src/provider-sync.js
 * builtinKey); the target adopts the route with an empty profile before writing it.
 */
const builtinKeyRoute = (provider) => provider.declared === false && provider.configured === false
  && provider.profile === null && provider.apiKeyMethod === true && provider.endpointFromEnv === false
/** A route whose record this adapter may read (source) or create (target): a profile, or a built-in key. */
const keyedRoute = (provider) => (provider.configured && provider.profile !== null) || builtinKeyRoute(provider)
const activeOwner = (entry) => entry.options?.name === H.owner && entry.disabled !== true
  && entry.options?.disabled !== true && entry.fiber !== null && typeof entry.fiber === 'object'
  && entry.fiber.state === H.activeState && entry.fiber.runtime !== null && typeof entry.fiber.runtime === 'object'

/**
 * createProviderSyncHost(ctx, {identity}) -> trusted host adapter. The coordinator
 * owns user confirmation and identity/revision plan fencing; no method is a tool or
 * browser secret-read RPC. addProvider's optional namespace must come from inventory.
 */
export function createProviderSyncHost(ctx, { identity } = {}) {
  const runtimeIdentity = identityOf(identity)
  const logger = typeof ctx.logger === 'function' ? ctx.logger(H.diagnostic.logger) : undefined
  const guarded = (code, operation) => protect(code, operation, logger)
  let last
  let defaults
  const added = new Map()
  const configuration = () => { defaults ??= defaultsOf() }
  async function describeCredential(id) {
    if (!routeId(id)) refuse(E.invalid)
    const info = await ctx.credentials.describeRecord(recordKeyFor(id))
    if (typeof info?.configured !== 'boolean' || typeof info?.writable !== 'boolean'
      || (info.kind !== undefined && info.kind !== H.apiKey && info.kind !== H.grant)) refuse(E.describe)
    return { configured: info.configured, ...(info.kind === undefined ? {} : { kind: info.kind }), writable: info.writable }
  }
  /**
   * The key an apiKeyEnv reference supplies, described without its value: `configured` is false
   * while the reference resolves to nothing (DSH treats an empty value as unset). pi-ai prefers
   * the reference over the route's record, so the record is not described, and `writable` is
   * false: a record written under this route would be shadowed by the reference.
   */
  async function describeReference(reference) {
    const info = await ctx.credentials.describe(reference)
    if (typeof info?.configured !== 'boolean') refuse(E.describe)
    return { configured: info.configured, kind: H.apiKey, writable: false }
  }
  /**
   * The reference's current value as an API-key record, resolved by DSH's credentials service
   * exactly as pi-ai resolves apiKeyEnv in this process (llm-pi-ai resolveApiKey: the managed
   * store, then the process environment, then .env files). Only the value is kept; nothing here
   * logs or returns the resolution's source.
   */
  async function referenceRecord(reference) {
    const hit = await ctx.credentials.resolve(reference)
    return hit === undefined ? undefined : { kind: H.apiKey, key: hit.value }
  }
  function namespaceDescriptors(descriptors, entries) {
    const namespaces = new Map()
    for (const descriptor of descriptors) {
      const ns = descriptor.ns
      if (!namespaceId(ns) || descriptors.filter((item) => item.ns === ns).length !== H.uniqueCount) continue
      const owners = entries.filter((entry) => entry.options?.id === ns)
      if (owners.length !== H.uniqueCount || !activeOwner(owners[H.firstIndex]) || !revision(descriptor.revision) || !plain(descriptor.schema)) continue
      const entry = owners[H.firstIndex]
      namespaces.set(ns, { ns, schema: fingerprint(descriptor.schema), ownerGeneration: ownerToken(entry), descriptor })
    }
    return namespaces
  }
  async function snapshot() {
    configuration()
    const [directory, descriptors, entries] = await Promise.all([
      ctx.llm.listConfigurableProviders(), ctx.settings.describe({ redactSecrets: true }), ctx.configEditor.entries(),
    ])
    if (!Array.isArray(directory) || !Array.isArray(descriptors) || !Array.isArray(entries)) refuse(E.inventory)
    const namespaces = namespaceDescriptors(descriptors, entries)
    const routes = new Map()
    for (const item of directory) {
      if (!text(item?.provider)) continue
      const group = routes.get(item.provider) ?? []
      group.push(item); routes.set(item.provider, group)
    }
    const providers = []
    // Host-only: the apiKeyEnv name of each route keyed by one. readRecord resolves it; the
    // inventory says only that the key comes from a reference (keyFromEnv), never which one.
    const references = new Map()
    for (const [id, group] of routes) {
      const item = group.find((candidate) => descriptors.some((descriptor) => descriptor.ns === candidate.settingsNs
        && validPath(candidate.settingsPath, id) && present(descriptor, id))) ?? group[H.firstIndex]
      const ns = item.settingsNs
      const namespace = namespaces.get(ns)
      const descriptor = descriptors.find((candidate) => candidate.ns === ns)
      const configured = validPath(item.settingsPath, id) && present(descriptor, id)
      let reason
      let profileReason
      let profile = null
      let credential = emptyCredential()
      let apiKeyMethod = false
      if (group.length !== H.uniqueCount) reason = E.ambiguous
      else if (!namespace) reason = E.owner
      else if (!validPath(item.settingsPath, id)) reason = E.path
      else if (typeof item.declared !== 'boolean') reason = E.profile
      let reference
      if (configured) {
        try {
          const split = splitReference(descriptor.value.providers[id])
          reference = split.reference
          profile = safeProfile(split.profile, item.declared, defaults)
        } catch (error) {
          reason ??= error instanceof ProviderSyncHostError ? error.code : E.profile
          profileReason = error instanceof ProviderSyncHostError ? error.profileReason : undefined
        }
      }
      if (reference !== undefined) references.set(id, reference)
      // A route id outside the record grammar cannot hold a record in the target either, so a
      // reference-keyed one stays unsupported too.
      if (!routeId(id)) reason ??= E.credential
      else {
        const key = recordKeyFor(id)
        try {
          credential = reference === undefined ? await describeCredential(id) : await describeReference(reference)
          if (credential.configured && credential.kind !== H.apiKey) reason ??= E.credential
        } catch { reason ??= E.describe }
        try { apiKeyMethod = (await ctx.authorization.describe(key))?.methods?.some((method) => method.id === H.apiKey) === true }
        catch { if (!item.declared) reason ??= E.auth }
        if (!item.declared && !apiKeyMethod) reason ??= E.auth
      }
      // The directory's diagnostics are untrusted error text; only its presence is used.
      if (item.error !== undefined) reason ??= E.profile
      // A route whose endpoint is built from environment variables may point elsewhere in the
      // other home, so its key is never copied without a profile (src/provider-sync.js builtinKey).
      const endpointFromEnv = Array.isArray(item.baseURLEnv) && item.baseURLEnv.length > H.minimumRevision
      providers.push({ id, settingsNs: ns, settingsPath: providerPath(id), owner: H.owner,
        ...(text(item.displayName) ? { label: item.displayName } : {}), endpointFromEnv, keyFromEnv: reference !== undefined,
        ...(profileReason === undefined ? {} : { profileReason }),
        schema: namespace?.schema ?? H.empty, ownerGeneration: namespace?.ownerGeneration ?? H.empty,
        declared: item.declared === true, configured, profile, credential, supported: reason === undefined,
        ...(reason === undefined ? {} : { reason }), apiKeyMethod })
    }
    return { namespaces, providers, descriptors, references }
  }
  const findProvider = (state, id) => {
    if (!routeId(id)) refuse(E.invalid)
    const provider = state.providers.find((item) => item.id === id)
    if (!provider) refuse(E.unknown)
    return provider
  }
  const trustedProvider = (state, id) => {
    const provider = findProvider(state, id)
    if (!provider.supported) refuse(provider.reason)
    return provider
  }
  const currentNamespace = (state, ns, previous) => {
    const current = state.namespaces.get(ns)
    if (!current || !previous || current.ns !== previous.ns || current.schema !== previous.schema || current.ownerGeneration !== previous.ownerGeneration) refuse(E.stale)
    return current
  }
  return Object.freeze({
    identity: runtimeIdentity,
    describeRecord: (id) => guarded(E.describe, () => describeCredential(id)),
    inventory: () => guarded(E.inventory, async () => {
      const state = await snapshot()
      last = state
      const namespaces = [...state.namespaces.values()].map(({ ns, schema, ownerGeneration }) => ({ ns, schema, ownerGeneration }))
      return { identity: runtimeIdentity,
        revision: Object.fromEntries([...state.namespaces].map(([ns, value]) => [ns, value.descriptor.revision])),
        schemas: Object.fromEntries(namespaces.map(({ ns, schema }) => [ns, schema])),
        owners: Object.fromEntries(namespaces.map(({ ns, ownerGeneration }) => [ns, ownerGeneration])),
        providers: structuredClone(state.providers), namespaces }
    }),
    readRecord: (id, { signal } = {}) => guarded(E.read, async () => {
      checkSignal(signal)
      if (!last) refuse(E.preview)
      const previous = trustedProvider(last, id)
      const state = await snapshot()
      const provider = trustedProvider(state, id)
      currentNamespace(state, provider.settingsNs, last.namespaces.get(previous.settingsNs))
      if (!keyedRoute(provider) || !provider.credential.configured || provider.credential.kind !== H.apiKey) refuse(E.credential)
      checkSignal(signal)
      // The fresh snapshot names the reference, so a profile edited since preview is read as it
      // is now; a reference unset since describe resolves to nothing and safeRecord refuses it.
      const reference = state.references.get(id)
      const record = reference === undefined ? await ctx.credentials.readRecord(recordKeyFor(id)) : await referenceRecord(reference)
      checkSignal(signal)
      return safeRecord(record)
    }),
    addProvider: (id, profile, expectedRevision, namespace, { signal } = {}) => guarded(E.write, async () => {
      checkSignal(signal)
      if (!last) refuse(E.preview)
      if (!routeId(id) || !revision(expectedRevision)) refuse(E.invalid)
      const known = last.providers.find((item) => item.id === id)
      const ns = namespace ?? known?.settingsNs
      if (!namespaceId(ns)) refuse(E.invalid)
      const state = await snapshot()
      const current = currentNamespace(state, ns, last.namespaces.get(ns))
      if (current.descriptor.revision !== expectedRevision) refuse(E.stale)
      // Presence is checked in resolved settings, including inherited/base profiles.
      if (state.descriptors.some((descriptor) => present(descriptor, id))) refuse(E.exists)
      const provider = state.providers.find((item) => item.id === id)
      if (provider && (!provider.supported || provider.settingsNs !== ns)) refuse(provider.reason ?? E.ambiguous)
      const normalized = safeProfile(profile, provider?.declared ?? true, defaults)
      // Orphan records are not in the model directory. Never fill a configuration onto
      // existing authentication merely because the route is absent from that directory.
      if ((await describeCredential(id)).configured) refuse(E.credentialExists)
      checkSignal(signal)
      let configOutcome = H.outcome.unknown
      try {
        await ctx.settings.mutate(ns, [{ op: H.set, path: providerPath(id), value: normalized }], expectedRevision)
        configOutcome = H.outcome.added
        const after = await snapshot()
        const updated = currentNamespace(after, ns, current)
        const written = after.providers.find((item) => item.id === id)
        if (!present(updated.descriptor, id) || !written?.supported || !isDeepStrictEqual(written.profile, normalized)) refuse(E.write)
        added.set(id, { ns, schema: updated.schema, ownerGeneration: updated.ownerGeneration })
        return { revision: updated.descriptor.revision }
      } catch (error) { throw outcomeError(error, H.outcome.config, configOutcome) }
    }),
    importRecord: (id, record, { signal, expected: approved } = {}) => guarded(E.write, async () => {
      checkSignal(signal)
      if (!last) refuse(E.preview)
      const normalized = safeRecord(record)
      const state = await snapshot()
      const provider = trustedProvider(state, id)
      const previous = added.get(id) ?? last.namespaces.get(provider.settingsNs)
      currentNamespace(state, provider.settingsNs, previous)
      if (!keyedRoute(provider) || !provider.credential.writable) refuse(E.credential)
      const sameRoute = (descriptor) => present(descriptor, id)
        && isDeepStrictEqual(safeProfile(descriptor.value.providers[id], provider.declared, defaults), approved.profile)
      const checkApproved = (namespaces) => {
        if (approved === undefined) return
        const namespace = namespaces.get(provider.settingsNs)
        if (!plain(approved) || !namespace || approved.namespace !== provider.settingsNs
          || approved.schema !== namespace.schema || approved.ownerGeneration !== namespace.ownerGeneration
          || !revision(approved.revision) || approved.revision !== namespace.descriptor.revision
          || !sameRoute(namespace.descriptor)) refuse(E.stale)
      }
      checkApproved(state.namespaces)
      let inserted = false
      let keyOutcome = H.outcome.unknown
      // modifyRecord's raw return can contain an existing grant/key. Discard it;
      // only our lock-held callback knows whether this operation inserted anything.
      checkSignal(signal)
      try {
        await ctx.credentials.modifyRecord(recordKeyFor(id), async (current) => {
          checkSignal(signal)
          if (current !== undefined) { keyOutcome = H.exists; return undefined }
          if (approved !== undefined) {
            // Never recurse into describeRecord while its store lock is held. This
            // official settings recheck narrows, but cannot close, the cross-store gap.
            const [descriptors, entries] = await Promise.all([
              ctx.settings.describe({ redactSecrets: true }), ctx.configEditor.entries(),
            ])
            checkApproved(namespaceDescriptors(descriptors, entries))
          }
          checkSignal(signal)
          inserted = true
          return normalized
        })
        return { status: inserted ? H.imported : H.exists }
      } catch (error) { throw outcomeError(error, H.outcome.key, keyOutcome) }
    }),
    verify: (id) => guarded(E.verify, async () => {
      const state = await snapshot()
      findProvider(state, id)
      const catalog = await ctx.sessionController.modelCatalog()
      if (!Array.isArray(catalog?.groups)) refuse(E.verify)
      return { catalogAdvertised: catalog.groups.some((group) => group.id === id && Array.isArray(group.models) && group.models.length > H.minimumRevision) }
    }),
  })
}
