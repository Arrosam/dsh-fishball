/** One-shot provider additions. Only safe inventory crosses preview; secret records arrive at confirm. */
import { createHash, randomBytes } from 'node:crypto'

export const PROVIDER_SYNC = Object.freeze({
  ttlMs: 300000, tokenBytes: 32, maxItems: 100, maxPreviews: 16, maxIncomplete: 100, mask: '••••••••', owner: '@deepseek-ai/dsh-llm-pi-ai',
  profileFields: Object.freeze(['displayName', 'api', 'baseURL', 'models']),
  modelFields: Object.freeze(['id', 'name', 'contextWindow', 'maxTokens', 'input']),
  protocols: Object.freeze(['openai-completions', 'openai-responses', 'anthropic-messages']),
  unsafe: Object.freeze(['__proto__', 'prototype', 'constructor']),
  /** The DSH credential kind of a login (OAuth/subscription) record; never copied. */
  grantKind: 'grant',
  reason: Object.freeze({ oauth: 'oauth-login', noKey: 'no-api-key', envUnset: 'api-key-env-unset', unsupported: 'unsupported-provider', credentialExists: 'credential-exists',
    incompatible: 'incompatible-owner-or-schema', conflict: 'provider-conflict', notWritable: 'credential-not-writable',
    revision: 'missing-revision' }),
})
export class ProviderSyncError extends Error {
  constructor(code) { super(code); this.code = code }
}
const fail = (code) => { throw new ProviderSyncError(code) }
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
export const syncFingerprint = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const same = (a, b) => syncFingerprint(a) === syncFingerprint(b)
const identifier = (value) => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
const text = (value) => typeof value === 'string' && value.trim().length > 0
const identity = (value) => plain(value) && ['runtimeId', 'profileId', 'schemaVersion', 'version'].every((key) => text(value[key]))

/** Conservative transferable subset; reject unknown behavior instead of silently dropping it. */
export function safeSyncProfile(profile, declared) {
  if (!plain(profile) || Object.keys(profile).some((key) => !PROVIDER_SYNC.profileFields.includes(key))) return false
  if (profile.displayName !== undefined && !text(profile.displayName)) return false
  if (profile.api !== undefined && !PROVIDER_SYNC.protocols.includes(profile.api)) return false
  if (profile.baseURL !== undefined) {
    try {
      const url = new URL(profile.baseURL)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
        || /[{}$]/.test(profile.baseURL)) return false
    } catch { return false }
  }
  if (profile.models !== undefined && (!Array.isArray(profile.models) || profile.models.some((model) =>
    !plain(model) || !text(model.id) || Object.keys(model).some((key) => !PROVIDER_SYNC.modelFields.includes(key))
    || (model.name !== undefined && !text(model.name))
    || ['contextWindow', 'maxTokens'].some((key) => model[key] !== undefined && (!Number.isSafeInteger(model[key]) || model[key] <= 0))
    || (model.input !== undefined && (!Array.isArray(model.input) || model.input.some((value) => !['text', 'image'].includes(value))))))) return false
  return !declared || (text(profile.api) && text(profile.baseURL) && profile.models?.length > 0)
}
const validateInventory = (inventory) => {
  if (!plain(inventory) || !identity(inventory.identity) || !Array.isArray(inventory.providers)
    || !Array.isArray(inventory.namespaces) || !plain(inventory.revision) || !plain(inventory.schemas) || !plain(inventory.owners)
    || inventory.providers.length > PROVIDER_SYNC.maxItems) fail('invalid-inventory')
  const ids = new Set()
  for (const entry of inventory.providers) {
    if (!identifier(entry.id) || ids.has(entry.id)) fail('invalid-inventory')
    ids.add(entry.id)
  }
}
const dto = (entry, reason) => ({ id: entry.id, name: entry.profile?.displayName ?? (text(entry.label) ? entry.label : entry.id),
  ...(entry.profile?.api === undefined ? {} : { api: entry.profile.api }),
  models: entry.profile?.models?.map((model) => model.id) ?? [],
  ...(entry.profile?.baseURL === undefined ? {} : { endpoint: entry.profile.baseURL }),
  keyMask: PROVIDER_SYNC.mask, ...(reason === undefined ? {} : { reason }),
})
const freshPeer = (source, peer) => identity(peer) && same(source.identity, peer)
const versionMatch = (a, b) => a.version === b.version && a.schemaVersion === b.schemaVersion
const recordValid = (record) => plain(record) && record.kind === 'api-key' && text(record.key)
  && Object.keys(record).every((key) => ['kind', 'key'].includes(key))
/**
 * Why a provider with no copyable key is skipped. Since 2026-11-06 (user decision) a key from the
 * profile's apiKeyEnv is copied like a stored one (src/provider-sync-host.js resolves it in the
 * main process); while that variable is unset or empty there it gets its own reason, so the page
 * can say which variable-side fix is needed instead of "no key".
 */
const missingKeyReason = (entry) => entry.credential?.configured ? PROVIDER_SYNC.reason.unsupported
  : entry.keyFromEnv === true ? PROVIDER_SYNC.reason.envUnset : PROVIDER_SYNC.reason.noKey
/** A login (grant record) is never copied; its own reason lets the page say "log in inside Fishball". */
const oauthLogin = (entry) => entry.credential?.configured === true && entry.credential.kind === PROVIDER_SYNC.grantKind
/**
 * A built-in route (shipped by the adapter, not declared in settings) with an API-key sign-in
 * method and a fixed endpoint. A route whose endpoint comes from environment variables is
 * excluded: the other home's environment differs, so the key could reach another endpoint.
 */
const builtinRoute = (entry) => entry.declared === false && entry.apiKeyMethod === true && entry.endpointFromEnv === false
/**
 * DSH's own "use the catalog route" profile: the Models page adopts a built-in route by writing
 * `providers.<route> = {}` (dsh-client-ui-settings-models, materializesNativeProfile). The host
 * reports it with every canonical default stripped, so it reads as an empty object here.
 */
const ADOPTED = Object.freeze({})
const adopted = (entry) => entry.configured === true && plain(entry.profile) && Object.keys(entry.profile).length === 0
/** No settings entry at all: pi-ai registers only routes in `providers`, so the route is dormant. */
const dormant = (entry) => entry.configured === false && entry.profile === null
/**
 * The user asked for keys on built-in routes to come over too (2026-11-06): a source key record
 * on a built-in route with no override, whether dormant or adopted. Both go through
 * #builtinKeyPlan, so an adopted target that lacks the key still receives it.
 */
const builtinKey = (entry) => builtinRoute(entry) && (dormant(entry) || adopted(entry))

export class ProviderSyncEngine {
  #host; #ttl; #now; #plans = new Map(); #incomplete = new Map(); #busy = false; #abort = new AbortController()
  constructor({ host, ttlMs = PROVIDER_SYNC.ttlMs, now = Date.now }) { this.#host = host; this.#ttl = ttlMs; this.#now = now }

  async preview(source, peerIdentity) {
    if (this.#abort.signal.aborted) fail('sync-closed')
    validateInventory(source)
    if (!freshPeer(source, peerIdentity)) fail('peer-mismatch')
    const target = await this.#host.inventory()
    validateInventory(target)
    if (this.#abort.signal.aborted) fail('sync-closed')
    if (this.#plans.size >= PROVIDER_SYNC.maxPreviews) this.#plans.delete(this.#plans.keys().next().value)
    const groups = { add: [], existsSkip: [], conflictSkip: [], unsupported: [] }
    const operations = new Map()
    const sameProfile = source.identity.profileId === target.identity.profileId
    // A provider with only a credential (a login, or a key on a built-in route) is listed too: a
    // built-in key may be added, and a login is named so the user can sign in inside Fishball.
    for (const entry of source.providers.filter((entry) => entry.profile !== null || entry.configured || entry.credential?.configured)) {
      // Never send unknown-profile fields into a preview; only whitelisted metadata is eligible.
      const safe = safeSyncProfile(entry.profile, entry.declared)
      const display = safe ? entry : { ...entry, profile: null }
      if (sameProfile) { groups.existsSkip.push(dto(display, 'same-profile')); continue }
      if (!versionMatch(source.identity, target.identity)) { groups.unsupported.push(dto(display, 'version-mismatch')); continue }
      const keyOnlyRoute = builtinKey(entry)
      if ((!safe && !keyOnlyRoute) || !entry.supported || entry.owner !== PROVIDER_SYNC.owner || entry.credential?.kind !== 'api-key'
        || !entry.credential.configured || (!entry.declared && !entry.apiKeyMethod)) {
        if (!oauthLogin(entry)) {
          groups.unsupported.push(dto(display, missingKeyReason(entry)))
          continue
        }
        // Already signed in inside the target: nothing to do there, so it reads as present.
        const signedIn = target.providers.some((candidate) => candidate.id === entry.id && candidate.credential?.configured)
        if (signedIn) groups.existsSkip.push(dto(display, PROVIDER_SYNC.reason.credentialExists))
        else groups.unsupported.push(dto(display, PROVIDER_SYNC.reason.oauth))
        continue
      }
      const existing = target.providers.find((candidate) => candidate.id === entry.id)
      if (keyOnlyRoute) {
        const verdict = this.#builtinKeyPlan(entry, existing, target)
        if (verdict.group !== 'add') { groups[verdict.group].push(dto(entry, verdict.reason)); continue }
        operations.set(entry.id, verdict.operation)
        groups.add.push(dto(entry))
        continue
      }
      if (!existing && this.#host.describeRecord) {
        const credential = await this.#host.describeRecord(entry.id)
        if (credential.configured) { groups.existsSkip.push(dto(entry, 'credential-exists')); continue }
        if (!credential.writable) { groups.unsupported.push(dto(entry, 'credential-not-writable')); continue }
      }
      const namespaces = target.namespaces.filter((candidate) => candidate.schema === entry.schema)
      const namespace = namespaces.find((candidate) => candidate.ns === entry.settingsNs)
        ?? (namespaces.length === 1 ? namespaces[0] : undefined)
      if (namespace === undefined || (existing && (!existing.supported || existing.owner !== entry.owner
        || existing.declared !== entry.declared || (!entry.declared && !existing.apiKeyMethod)))) {
        groups.conflictSkip.push(dto(entry, 'incompatible-owner-or-schema')); continue
      }
      const retry = this.#incomplete.get(entry.id)
      if (retry && retry.expiresAt <= this.#now()) this.#incomplete.delete(entry.id)
      const retryKey = existing?.profile && !existing.credential?.configured && retry
        && retry.expiresAt > this.#now() && retry.namespace === namespace.ns && same(retry.profile, existing.profile) && same(retry.profile, entry.profile)
        && retry.ownerGeneration === namespace.ownerGeneration
      if ((existing?.profile || existing?.configured) && !retryKey) {
        const category = same(existing.profile, entry.profile) ? groups.existsSkip : groups.conflictSkip
        category.push(dto(entry, category === groups.existsSkip ? 'provider-exists' : 'provider-conflict')); continue
      }
      if (existing?.credential?.configured) { groups.existsSkip.push(dto(entry, 'credential-exists')); continue }
      if (existing?.credential?.writable === false) { groups.unsupported.push(dto(entry, 'credential-not-writable')); continue }
      if (!Number.isSafeInteger(target.revision[namespace.ns])) { groups.unsupported.push(dto(entry, 'missing-revision')); continue }
      operations.set(entry.id, { id: entry.id, profile: entry.profile, namespace: namespace.ns, ownerGeneration: namespace.ownerGeneration,
        keyOnly: Boolean(retryKey) })
      groups.add.push(dto(entry, retryKey ? 'retry-key' : undefined))
    }
    // Bound unconfirmed state; plans expire without reading credentials or touching configuration.
    for (const [token, plan] of this.#plans) if (plan.expiresAt <= this.#now()) this.#plans.delete(token)
    const token = randomBytes(PROVIDER_SYNC.tokenBytes).toString('hex')
    const sourceFingerprint = syncFingerprint(source)
    const expiresAt = this.#now() + this.#ttl
    this.#plans.set(token, { source: structuredClone(source), target: structuredClone(target), sourceFingerprint,
      operations: new Map([...operations].map(([id, operation]) => [id, structuredClone(operation)])),
      expiresAt, peerIdentity: structuredClone(peerIdentity) })
    return { token, source: source.identity, target: target.identity, sourceFingerprint, expiresAt, groups }
  }

  /**
   * Where a built-in key goes. The target must have the same built-in route from the same owner and
   * schema, either dormant or adopted with no override; an existing target key is kept. A key
   * record alone leaves a dormant route unregistered, so a dormant target is adopted the way DSH's
   * Models page does it (`providers.<route> = {}`, a create-only revision-checked add) before the
   * create-only key write; an adopted target gets the key only.
   */
  #builtinKeyPlan(entry, existing, target) {
    const R = PROVIDER_SYNC.reason
    const namespace = existing && target.namespaces.find((candidate) => candidate.ns === existing.settingsNs && candidate.schema === entry.schema)
    if (!namespace || !existing.supported || existing.owner !== entry.owner) return { group: 'conflictSkip', reason: R.incompatible }
    if (existing.credential?.configured) return { group: 'existsSkip', reason: R.credentialExists }
    // Fishball overrides this route itself: the key could reach a different endpoint, so keep it.
    if (!dormant(existing) && !adopted(existing)) return { group: 'conflictSkip', reason: R.conflict }
    if (!builtinRoute(existing)) return { group: 'conflictSkip', reason: R.incompatible }
    if (existing.credential?.writable === false) return { group: 'unsupported', reason: R.notWritable }
    if (!Number.isSafeInteger(target.revision[namespace.ns])) return { group: 'unsupported', reason: R.revision }
    return { group: 'add', operation: { id: entry.id, profile: { ...ADOPTED }, namespace: namespace.ns,
      ownerGeneration: namespace.ownerGeneration, keyOnly: adopted(existing) } }
  }

  async confirm({ token, sourceFingerprint, items }, peerIdentity, { signal } = {}) {
    signal = signal ? AbortSignal.any([signal, this.#abort.signal]) : this.#abort.signal
    if (signal.aborted) fail('cancelled')
    const plan = this.#plans.get(token)
    if (!plan || plan.expiresAt <= this.#now()) { this.#plans.delete(token); fail('preview-expired') }
    if (!same(plan.peerIdentity, peerIdentity)) fail('peer-mismatch')
    if (this.#busy) fail('sync-busy')
    // Consume BEFORE any await: repeated or concurrent confirmations cannot repeat secret writes.
    this.#plans.delete(token)
    if (sourceFingerprint !== plan.sourceFingerprint || !Array.isArray(items) || items.length > PROVIDER_SYNC.maxItems) fail('repreview-required')
    const ids = new Set()
    for (const item of items) {
      if (!plain(item) || ids.has(item.id) || !plan.operations.has(item.id)) fail('invalid-selection')
      ids.add(item.id)
    }
    let expected = plan.target
    const results = []
    this.#busy = true
    try {
      if (!same(await this.#host.inventory(), expected)) fail('repreview-required')
      for (const item of items) {
        const operation = plan.operations.get(item.id)
        const result = { id: item.id, config: operation.keyOnly ? 'unchanged' : 'failed', key: 'not-attempted', status: 'failed' }
        let keyAttempted = false
        if (signal?.aborted || !recordValid(item.record)) { results.push(result); continue }
        if (!same(await this.#host.inventory(), expected)) {
          results.push({ ...result, reason: 'repreview-required' }); break
        }
        try {
          if (signal.aborted) throw new ProviderSyncError('cancelled')
          if (!operation.keyOnly) {
            await this.#host.addProvider(item.id, operation.profile, expected.revision[operation.namespace], operation.namespace, { signal })
            result.config = 'added'
            if (this.#incomplete.size >= PROVIDER_SYNC.maxIncomplete) this.#incomplete.delete(this.#incomplete.keys().next().value)
            this.#incomplete.set(item.id, { ...operation, expiresAt: this.#now() + this.#ttl })
          }
          // Capture our own revision advance; unrelated concurrent mutations must not be silently rebased.
          const after = await this.#host.inventory()
          const created = after.providers.find((provider) => provider.id === item.id)
          if (!created || !same(created.profile, operation.profile) || created.ownerGeneration !== operation.ownerGeneration) {
            result.status = result.config === 'added' ? 'partial' : 'failed'; result.reason = 'repreview-required'; results.push(result); break
          }
          const beforeWithout = { ...expected, revision: { ...expected.revision }, providers: expected.providers.filter((provider) => provider.id !== item.id) }
          const afterWithout = { ...after, revision: { ...after.revision }, providers: after.providers.filter((provider) => provider.id !== item.id) }
          delete beforeWithout.revision[operation.namespace]; delete afterWithout.revision[operation.namespace]
          if (!same(beforeWithout, afterWithout) || after.revision[operation.namespace] !== expected.revision[operation.namespace] + (operation.keyOnly ? 0 : 1)) {
            result.status = result.config === 'added' ? 'partial' : 'failed'; result.reason = 'repreview-required'; results.push(result); break
          }
          expected = after
          if (signal?.aborted) throw new ProviderSyncError('cancelled')
          keyAttempted = true
          const outcome = await this.#host.importRecord(item.id, item.record, { signal, expected: { namespace: operation.namespace,
            revision: expected.revision[operation.namespace], profile: operation.profile, schema: expected.schemas[operation.namespace], ownerGeneration: operation.ownerGeneration } })
          result.key = outcome.status === 'imported' ? 'imported' : 'exists'
          result.status = result.key === 'imported' ? 'succeeded' : 'partial'
          if (result.key === 'imported') this.#incomplete.delete(item.id)
          const afterImport = await this.#host.inventory()
          const stripCredential = (inventory) => ({ ...inventory, providers: inventory.providers.map((provider) => provider.id === item.id
            ? { ...provider, credential: null } : provider) })
          if (!same(stripCredential(expected), stripCredential(afterImport))) {
            result.reason = 'repreview-required'; results.push(result); break
          }
          expected = afterImport
          try { Object.assign(result, await this.#host.verify(item.id)) } catch { result.catalogAdvertised = false }
        } catch (cause) {
          if (['provider-exists', 'credential-exists'].includes(cause?.code)) { result.config = 'unchanged'; result.status = 'skipped'; results.push(result); continue }
          if (['added', 'unknown'].includes(cause?.configOutcome)) result.config = cause.configOutcome
          if (!['imported', 'exists'].includes(result.key)) result.key = ['unknown', 'exists'].includes(cause?.keyOutcome) ? cause.keyOutcome
            : keyAttempted ? 'failed' : 'not-attempted'
          result.status = result.config === 'unknown' || result.key === 'unknown' ? 'unknown'
            : result.config === 'added' ? 'partial' : 'failed'
          if (result.config === 'added') {
            if (this.#incomplete.size >= PROVIDER_SYNC.maxIncomplete) this.#incomplete.delete(this.#incomplete.keys().next().value)
            this.#incomplete.set(item.id, { ...operation, expiresAt: this.#now() + this.#ttl })
          }
          // No credential/config deletion: a concurrent user owns anything we did not create.
        }
        results.push(result)
      }
    } finally { this.#busy = false }
    for (const item of items) if (!results.some((result) => result.id === item.id)) results.push({ id: item.id, config: 'unchanged', key: 'not-attempted', status: 'skipped', reason: 'repreview-required' })
    return { results, complete: results.length === items.length && results.every((result) => result.status === 'succeeded') }
  }
  close() { this.#abort.abort(); this.#plans.clear(); this.#incomplete.clear() }
}
