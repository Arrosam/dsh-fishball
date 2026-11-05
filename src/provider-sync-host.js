/**
 * Host-only official-SDK boundary for one-shot provider migration. Inventory never
 * reads credential values; only the coordinator's confirmed readRecord call does.
 * Neither configuration files nor ambient credential references are accessed here.
 */
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { isVolatile } from '@deepseek-ai/cosmokit'
import { Config, recordKeyFor, supportedProtocols } from '@deepseek-ai/dsh-llm-pi-ai'

export const PROVIDER_SYNC_HOST = Object.freeze({
  owner: '@deepseek-ai/dsh-llm-pi-ai', activeState: 2, minimumRevision: 0, uniqueCount: 1, firstIndex: 0,
  providers: 'providers', set: 'set', apiKey: 'api-key', grant: 'grant',
  imported: 'imported', exists: 'exists', https: 'https:', empty: '',
  outcome: Object.freeze({ config: 'configOutcome', key: 'keyOutcome', added: 'added', unknown: 'unknown' }),
  referenceField: 'apiKeyEnv', query: '?', fragment: '#',
  hashAlgorithm: 'sha256', hashEncoding: 'hex',
  identityKeys: Object.freeze(['runtimeId', 'profileId', 'schemaVersion', 'version']),
  profileFields: Object.freeze(['displayName', 'api', 'baseURL', 'models']),
  modelFields: Object.freeze(['id', 'name', 'contextWindow', 'maxTokens', 'input']),
  numericModelFields: Object.freeze(['contextWindow', 'maxTokens']),
  modalities: Object.freeze(['text', 'image']),
  recordFields: Object.freeze(['kind', 'key']),
  defaultRoute: 'fishball-sync-default', defaultModel: 'fishball-sync-default-model',
  route: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  identifier: /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/,
  template: /[{}$]|%7b|%7d/i,
  errorMessage: 'Provider sync host refused the operation.',
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
const fingerprint = (schema) => createHash(H.hashAlgorithm).update(JSON.stringify(canonical(schema))).digest(H.hashEncoding)
const unwrap = (value) => isVolatile(value) ? unwrap(value.get()) : Array.isArray(value) ? value.map(unwrap)
  : plain(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrap(item)])) : value

export class ProviderSyncHostError extends Error {
  constructor(code) { super(H.errorMessage); this.code = code }
}
const refuse = (code) => { throw new ProviderSyncHostError(code) }
const outcomeError = (error, field, outcome) => {
  const sanitized = new ProviderSyncHostError(error instanceof ProviderSyncHostError ? error.code : E.write)
  sanitized[field] = outcome
  return sanitized
}
const protect = async (code, operation) => {
  try { return await operation() } catch (error) {
    // SDK validation errors can echo configuration or credentials; never retain a cause.
    if (error instanceof ProviderSyncHostError) throw error
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
function endpointIsSafe(value) {
  if (!text(value) || H.template.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === H.https && !url.username && !url.password && !url.search && !url.hash
      && !value.includes(H.query) && !value.includes(H.fragment)
  } catch { return false }
}
function safeProfile(value, declared, defaults, protocols) {
  const result = projectFields(value, H.profileFields, defaults.profile)
  if (result.displayName !== undefined && !text(result.displayName)) refuse(E.profile)
  if (result.api !== undefined && !protocols.has(result.api)) refuse(E.profile)
  if (result.baseURL !== undefined && !endpointIsSafe(result.baseURL)) refuse(E.profile)
  if (result.models !== undefined) {
    if (!Array.isArray(result.models)) refuse(E.profile)
    const ids = new Set()
    result.models = result.models.map((value) => {
      const model = projectFields(value, H.modelFields, defaults.model)
      if (!text(model.id) || ids.has(model.id) || (model.name !== undefined && !text(model.name))) refuse(E.profile)
      ids.add(model.id)
      if (H.numericModelFields.some((key) => model[key] !== undefined
        && (!Number.isSafeInteger(model[key]) || model[key] <= H.minimumRevision))) refuse(E.profile)
      if (model.input !== undefined && (!Array.isArray(model.input) || model.input.length === H.minimumRevision
        || model.input.some((item) => !H.modalities.includes(item)))) refuse(E.profile)
      return { ...model, ...(model.input === undefined ? {} : { input: [...model.input] }) }
    })
  }
  if (declared && (!text(result.api) || !text(result.baseURL) || !result.models?.length)) refuse(E.profile)
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
 * A built-in route keyed by its API-key record alone: no settings override and an api-key sign-in
 * method. Its key may be copied without a profile (src/provider-sync.js builtinKey).
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
  let last
  let defaults
  let protocols
  const added = new Map()
  const configuration = () => {
    defaults ??= defaultsOf()
    protocols ??= new Set(supportedProtocols())
  }
  async function describeCredential(id) {
    if (!routeId(id)) refuse(E.invalid)
    const info = await ctx.credentials.describeRecord(recordKeyFor(id))
    if (typeof info?.configured !== 'boolean' || typeof info?.writable !== 'boolean'
      || (info.kind !== undefined && info.kind !== H.apiKey && info.kind !== H.grant)) refuse(E.describe)
    return { configured: info.configured, ...(info.kind === undefined ? {} : { kind: info.kind }), writable: info.writable }
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
    for (const [id, group] of routes) {
      const item = group.find((candidate) => descriptors.some((descriptor) => descriptor.ns === candidate.settingsNs
        && validPath(candidate.settingsPath, id) && present(descriptor, id))) ?? group[H.firstIndex]
      const ns = item.settingsNs
      const namespace = namespaces.get(ns)
      const descriptor = descriptors.find((candidate) => candidate.ns === ns)
      const configured = validPath(item.settingsPath, id) && present(descriptor, id)
      let reason
      let profile = null
      let credential = emptyCredential()
      let apiKeyMethod = false
      if (group.length !== H.uniqueCount) reason = E.ambiguous
      else if (!namespace) reason = E.owner
      else if (!validPath(item.settingsPath, id)) reason = E.path
      else if (typeof item.declared !== 'boolean') reason = E.profile
      if (configured) {
        try { profile = safeProfile(descriptor.value.providers[id], item.declared, defaults, protocols) }
        catch (error) { reason ??= error instanceof ProviderSyncHostError ? error.code : E.profile }
      }
      if (!routeId(id)) reason ??= E.credential
      else {
        const key = recordKeyFor(id)
        try {
          credential = await describeCredential(id)
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
        ...(text(item.displayName) ? { label: item.displayName } : {}), endpointFromEnv,
        schema: namespace?.schema ?? H.empty, ownerGeneration: namespace?.ownerGeneration ?? H.empty,
        declared: item.declared === true, configured, profile, credential, supported: reason === undefined,
        ...(reason === undefined ? {} : { reason }), apiKeyMethod })
    }
    return { namespaces, providers, descriptors }
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
    describeRecord: (id) => protect(E.describe, () => describeCredential(id)),
    inventory: () => protect(E.inventory, async () => {
      const state = await snapshot()
      last = state
      const namespaces = [...state.namespaces.values()].map(({ ns, schema, ownerGeneration }) => ({ ns, schema, ownerGeneration }))
      return { identity: runtimeIdentity,
        revision: Object.fromEntries([...state.namespaces].map(([ns, value]) => [ns, value.descriptor.revision])),
        schemas: Object.fromEntries(namespaces.map(({ ns, schema }) => [ns, schema])),
        owners: Object.fromEntries(namespaces.map(({ ns, ownerGeneration }) => [ns, ownerGeneration])),
        providers: structuredClone(state.providers), namespaces }
    }),
    readRecord: (id, { signal } = {}) => protect(E.read, async () => {
      checkSignal(signal)
      if (!last) refuse(E.preview)
      const previous = trustedProvider(last, id)
      const state = await snapshot()
      const provider = trustedProvider(state, id)
      currentNamespace(state, provider.settingsNs, last.namespaces.get(previous.settingsNs))
      if (!keyedRoute(provider) || !provider.credential.configured || provider.credential.kind !== H.apiKey) refuse(E.credential)
      checkSignal(signal)
      const record = await ctx.credentials.readRecord(recordKeyFor(id))
      checkSignal(signal)
      return safeRecord(record)
    }),
    addProvider: (id, profile, expectedRevision, namespace, { signal } = {}) => protect(E.write, async () => {
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
      const normalized = safeProfile(profile, provider?.declared ?? true, defaults, protocols)
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
    importRecord: (id, record, { signal, expected: approved } = {}) => protect(E.write, async () => {
      checkSignal(signal)
      if (!last) refuse(E.preview)
      const normalized = safeRecord(record)
      const state = await snapshot()
      const provider = trustedProvider(state, id)
      const previous = added.get(id) ?? last.namespaces.get(provider.settingsNs)
      currentNamespace(state, provider.settingsNs, previous)
      if (!keyedRoute(provider) || !provider.credential.writable) refuse(E.credential)
      // A built-in key was approved for a route with no override; one appearing since then would
      // send the key somewhere else, so it voids the approval like a changed profile does.
      const sameRoute = (descriptor) => approved.profile === null
        ? !present(descriptor, id)
        : present(descriptor, id) && isDeepStrictEqual(safeProfile(descriptor.value.providers[id], provider.declared, defaults, protocols), approved.profile)
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
    verify: (id) => protect(E.verify, async () => {
      const state = await snapshot()
      findProvider(state, id)
      const catalog = await ctx.sessionController.modelCatalog()
      if (!Array.isArray(catalog?.groups)) refuse(E.verify)
      return { catalogAdvertised: catalog.groups.some((group) => group.id === id && Array.isArray(group.models) && group.models.length > H.minimumRevision) }
    }),
  })
}
