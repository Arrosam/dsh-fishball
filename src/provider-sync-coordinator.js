/**
 * Source-side coordinator: previews against the target, then reads and sends the selected records.
 * The caller (src/provider-sync-service.js) gets opaque preview ids and fixed metadata, never records.
 * The channel's `peer()` names the connected target; its `connectionId` changes when the target
 * reconnects, which voids a preview taken on the old connection.
 */
import { randomBytes } from 'node:crypto'
import { PROVIDER_SYNC, ProviderSyncError, syncFingerprint } from './provider-sync.js'

const error = (code) => { throw new ProviderSyncError(code) }
export class ProviderSyncCoordinator {
  #host; #channel; #ttl; #now; #previews = new Map(); #busy = false; #abort = new AbortController()
  constructor({ host, channel, ttlMs = PROVIDER_SYNC.ttlMs, now = Date.now }) {
    this.#host = host; this.#channel = channel; this.#ttl = ttlMs; this.#now = now
  }
  async preview() {
    if (this.#abort.signal.aborted) error('sync-closed')
    const peer = this.#channel.peer()
    if (!peer) error('target-unavailable')
    const source = await this.#host.inventory()
    if (this.#abort.signal.aborted) error('sync-closed')
    const plan = await peer.request('inventory', { source }, { signal: this.#abort.signal })
    if (this.#abort.signal.aborted) error('sync-closed')
    if (plan.sourceFingerprint !== syncFingerprint(source)
      || syncFingerprint(plan.target) !== syncFingerprint(peer.identity)) error('peer-mismatch')
    const previewId = randomBytes(PROVIDER_SYNC.tokenBytes).toString('hex')
    const expiresAt = Math.min(plan.expiresAt, this.#now() + this.#ttl)
    for (const [id, prior] of this.#previews) if (prior.expiresAt <= this.#now()) this.#previews.delete(id)
    if (this.#previews.size >= PROVIDER_SYNC.maxPreviews) this.#previews.delete(this.#previews.keys().next().value)
    this.#previews.set(previewId, { plan: structuredClone(plan), source: structuredClone(source),
      peer: { identity: structuredClone(peer.identity), connectionId: peer.connectionId }, expiresAt })
    return { previewId, source: plan.source, target: plan.target, groups: plan.groups, expiresAt }
  }
  async confirm({ previewId, ids, confirmed }, { signal } = {}) {
    signal = signal ? AbortSignal.any([signal, this.#abort.signal]) : this.#abort.signal
    if (signal.aborted) error('cancelled')
    if (confirmed !== true) error('confirmation-required')
    if (this.#busy) error('sync-busy')
    const preview = this.#previews.get(previewId)
    if (!preview || preview.expiresAt <= this.#now()) { this.#previews.delete(previewId); error('preview-expired') }
    this.#previews.delete(previewId)
    if (!Array.isArray(ids) || ids.length > PROVIDER_SYNC.maxItems || new Set(ids).size !== ids.length
      || ids.some((id) => !preview.plan.groups.add.some((item) => item.id === id))) error('invalid-selection')
    const peer = this.#channel.peer()
    if (!peer || peer.connectionId !== preview.peer.connectionId || syncFingerprint(peer.identity) !== syncFingerprint(preview.peer.identity)) error('repreview-required')
    this.#busy = true
    const items = []
    const failures = []
    try {
      // Recheck source before secret read. User consent covers the current key of these exact
      // records; DSH does not expose a non-secret credential revision/CAS token.
      if (syncFingerprint(await this.#host.inventory()) !== syncFingerprint(preview.source)) error('repreview-required')
      for (const id of ids) {
        if (signal?.aborted) error('cancelled')
        try {
          const record = await this.#host.readRecord(id, { signal })
          if (signal.aborted) error('cancelled')
          if (record?.kind !== 'api-key' || typeof record.key !== 'string' || !record.key.trim()
            || Object.keys(record).some((key) => !['kind', 'key'].includes(key))) throw new Error()
          items.push({ id, record })
        } catch {
          failures.push({ id, config: 'unchanged', key: 'not-attempted', status: 'failed', reason: 'unsupported-record' })
        }
      }
      if (signal?.aborted) error('cancelled')
      // Source configuration may change during credential IO too. No target write on mismatch.
      if (syncFingerprint(await this.#host.inventory()) !== syncFingerprint(preview.source)) error('repreview-required')
      if (signal.aborted) error('cancelled')
      const result = await peer.request('import', {
        token: preview.plan.token, sourceFingerprint: preview.plan.sourceFingerprint, items,
      }, { signal })
      return { results: [...result.results, ...failures], complete: result.complete && failures.length === 0 }
    } catch (cause) {
      if (cause instanceof ProviderSyncError) throw cause
      // A lost response cannot be called failure or retried: official writes may already have
      // committed. A new explicit preview is the only retry path; no secret values in errors.
      return { results: [...items.map(({ id }) => ({ id, config: 'unknown', key: 'unknown', status: 'unknown' })), ...failures], complete: false }
    } finally {
      for (const item of items) item.record = undefined
      items.length = 0
      this.#busy = false
    }
  }
  close() { this.#abort.abort(); this.#previews.clear() }
}
