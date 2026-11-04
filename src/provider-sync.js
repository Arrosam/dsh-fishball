/** One-shot provider additions. Only safe inventory crosses preview; secret records arrive at confirm. */
import { createHash, randomBytes } from 'node:crypto'

export const PROVIDER_SYNC = Object.freeze({
  ttlMs: 300000, tokenBytes: 32, maxItems: 100, maxPreviews: 16, maxIncomplete: 100, mask: '••••••••', owner: '@deepseek-ai/dsh-llm-pi-ai',
  profileFields: Object.freeze(['displayName', 'api', 'baseURL', 'models']),
  modelFields: Object.freeze(['id', 'name', 'contextWindow', 'maxTokens', 'input']),
  protocols: Object.freeze(['openai-completions', 'openai-responses', 'anthropic-messages']),
  unsafe: Object.freeze(['__proto__', 'prototype', 'constructor']),
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
const dto = (entry, reason) => ({ id: entry.id, name: entry.profile?.displayName ?? entry.id,
  ...(entry.profile?.api === undefined ? {} : { api: entry.profile.api }),
  models: entry.profile?.models?.map((model) => model.id) ?? [],
  ...(entry.profile?.baseURL === undefined ? {} : { endpoint: entry.profile.baseURL }),
  keyMask: PROVIDER_SYNC.mask, ...(reason === undefined ? {} : { reason }),
})
const freshPeer = (source, peer) => identity(peer) && same(source.identity, peer)
const versionMatch = (a, b) => a.version === b.version && a.schemaVersion === b.schemaVersion
const recordValid = (record) => plain(record) && record.kind === 'api-key' && text(record.key)
  && Object.keys(record).every((key) => ['kind', 'key'].includes(key))

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
    for (const entry of source.providers.filter((entry) => entry.profile !== null || entry.configured)) {
      // Never send unknown-profile fields into a preview; only whitelisted metadata is eligible.
      const safe = safeSyncProfile(entry.profile, entry.declared)
      const display = safe ? entry : { ...entry, profile: null }
      if (sameProfile) { groups.existsSkip.push(dto(display, 'same-profile')); continue }
      if (!versionMatch(source.identity, target.identity)) { groups.unsupported.push(dto(display, 'version-mismatch')); continue }
      if (!safe || !entry.supported || entry.owner !== PROVIDER_SYNC.owner || entry.credential?.kind !== 'api-key'
        || !entry.credential.configured || (!entry.declared && !entry.apiKeyMethod)) {
        groups.unsupported.push(dto(display, 'unsupported-provider')); continue
      }
      const existing = target.providers.find((candidate) => candidate.id === entry.id)
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
