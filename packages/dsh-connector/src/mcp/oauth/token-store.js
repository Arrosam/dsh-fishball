/**
 * The one OAuth token store (K1 `OAuthTokenStore`, ownership K1a; R-OA-05, R-OA-06, R-OA-14,
 * R-OA-16; design §5.5, §5.5a). C-OAUTH's client-credentials grant and bearer verifier and
 * C-OAUTH-WEB's code and refresh grants share this one instance.
 *
 * Everything is keyed by the digest of the opaque value (`./digest.js`), never the value.
 * - Access tokens and codes are in memory only (TQ-5 A, R-OA-14): a restart loses them.
 * - Refresh tokens persist as digests with their chain id and entry generation (Q-S7B-3 A), in
 *   the `refresh` table. One `chains` record per chain keeps, across a restart, the entry, the
 *   generation and whether it was revoked, so a revoked chain stays revoked. A chain record stays
 *   until the entry is deleted (`forgetEntry`).
 * - No chain ends by age (R-OA-23, requirements 1.32 R14: K1d withdrew the maximum chain lifetime
 *   and `chainsOf`). Spent refresh records stay while their chain lives, because reuse detection
 *   needs them (R-OA-16 (2): RT1 presented after RT3 must be recognised as spent, AUTH-ST-05 row 3);
 *   once a chain is revoked its refresh records are deleted at once. So the records of one chain
 *   grow with its rotations (about one per access-token lifetime while the client works) until the
 *   chain is revoked or its entry is disabled or deleted. Bounding them would need a rule the
 *   design does not give (dropping old spent records turns their reuse into a plain unknown token).
 *
 * Revocation is visible at once, before its durable write lands: `revokedChains` and
 * `generationFloor` are read by every getter, so the next request after a revocation is refused
 * (R-TOK-05) whatever the storage is doing. Durable writes run one at a time on this store's own
 * queue, and each decides at its slot: a revocation picks its chains there, so it also catches a
 * chain whose `putRefresh` was queued before it, and a `putRefresh` queued after a revocation
 * writes nothing.
 *
 * What the store does not know: entry state (C-TOKENS). A revocation that happened while the
 * connector was down is caught by the generation comparisons of the verifier and C-OAUTH-WEB's
 * refresh grant against `TokenRegistry`, not by a startup sweep (Fishball
 * 2026-11-14): a sweep run while the registry is still loading could revoke every chain.
 */
import { z } from 'zod'
import { LIFETIME, REVOCATION_KIND } from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { LOG, MISUSE, NO_GENERATION_FLOOR, OAUTH_STORE, SILENT_LOGGER } from './constants.js'
import { digestOf } from './digest.js'
import { createSweptMap } from './swept-map.js'

const time = z.number().int()
const key = z.string().min(1)
const generation = z.number().int().nonnegative()

const refreshRecord = z.object({
  chainId: key,
  entryKey: key,
  clientId: key,
  audience: key,
  generation,
  spentAt: time.optional(),
}).strict()

const chainRecord = z.object({
  chainId: key,
  entryKey: key,
  generation,
  revoked: z.boolean(),
}).strict()

/**
 * The storage key of a refresh record. Callers key by the token's digest (lowercase hex SHA-256,
 * the convention shared with C-OAUTH-WEB), but K1 types the key as any string, and a per-record
 * key must be path-safe; hashing the given key once more makes any string one, at no cost to the
 * convention.
 */
const refreshKeyOf = (digest) => digestOf(digest)
const chainKeyOf = (chainId) => digestOf(chainId)

const isExpiredAt = (lifetimeMs) => (record, now) => now >= record.issuedAt + lifetimeMs

/**
 * The store over the two tables of the `dsh_connector_oauth` domain. It logs nothing: each failure
 * rejects to its caller.
 * @param tables - `{refresh, chains}`, DSH storage-domain KvTables (`get`, `entries`, `put`, `delete`)
 * @returns the K1 `OAuthTokenStore`, plus `forgetEntry(entryKey)` (an entry was deleted: drop
 *   every record of it, so nothing of a key that may never come back is kept).
 */
export function createOAuthTokenStore(tables) {
  const access = createSweptMap(isExpiredAt(LIFETIME.accessTokenMs))
  const codes = createSweptMap(isExpiredAt(LIFETIME.codeMs))
  /** chainId → chain record, mirroring the `chains` table (loaded at open, kept in step). */
  const chains = new Map()
  for (const [, chain] of tables.chains.entries()) chains.set(chain.chainId, chain)
  /**
   * Every revoked chain: the durable marks loaded at open, plus each revocation of this life from
   * the moment it is asked for (the durable mark lands later). The one revoked test of the reads.
   */
  const revokedChains = new Set([...chains.values()].filter((chain) => chain.revoked).map((chain) => chain.chainId))
  /** entryKey → the generation below which every token of the entry is revoked (this life). */
  const generationFloor = new Map()

  let tail = Promise.resolve()
  /** Runs `write` after every earlier durable write of this store, settled or not. */
  function serial(write) {
    const run = tail.then(write)
    tail = run.catch(() => {})
    return run
  }

  const belowFloor = (entryKey, at) => at < (generationFloor.get(entryKey) ?? NO_GENERATION_FLOOR)
  const isRevoked = (record) => belowFloor(record.entryKey, record.generation) || (record.chainId !== undefined && revokedChains.has(record.chainId))

  function dropAccess(drop) {
    for (const [digest, token] of [...access.map]) if (drop(token)) access.map.delete(digest)
  }

  /** Codes carry no generation, so a revocation of the entry drops all of them (Fishball 2026-11-14). */
  function dropCodes(entryKey) {
    for (const [digest, code] of [...codes.map]) if (code.entryKey === entryKey) codes.map.delete(digest)
  }

  /** Deletes the stored refresh records matching `match` (inside a `serial` slot). */
  async function deleteRefresh(match) {
    const keys = [...tables.refresh.entries()].filter(([, record]) => match(record)).map(([stored]) => stored)
    for (const stored of keys) await tables.refresh.delete(stored)
  }

  /** Marks the chains durably revoked and deletes their refresh records (inside a `serial` slot). */
  async function persistRevocation(chainIds) {
    for (const chainId of chainIds) {
      const chain = chains.get(chainId)
      if (chain === undefined || chain.revoked) continue
      const revoked = Object.freeze({ ...chain, revoked: true })
      await tables.chains.put(chainKeyOf(chainId), revoked)
      chains.set(chainId, revoked)
    }
    const ids = new Set(chainIds)
    await deleteRefresh((record) => ids.has(record.chainId))
  }

  return Object.freeze({
    putAccess(digest, token) {
      // A token issued from an already revoked chain or generation is never stored: a race of a
      // grant with a revocation must not leave a live token behind (R-OA-06, R-OA-16 (2)).
      if (isRevoked(token)) return
      access.set(digest, Object.freeze({ ...token }), token.issuedAt)
    },

    getAccess(digest) {
      const token = access.map.get(digest)
      return token === undefined || isRevoked(token) ? undefined : token
    },

    putCode(digest, code) {
      codes.set(digest, Object.freeze({ ...code }), code.issuedAt)
    },

    takeCode(digest) {
      const code = codes.map.get(digest)
      codes.map.delete(digest)
      return code
    },

    async putRefresh(digest, record) {
      let parsed
      try { parsed = Object.freeze(refreshRecord.parse(record)) } catch { throw new TypeError(MISUSE.refreshRecord) }
      await serial(async () => {
        // Decided at the write slot: a revocation queued before this write wins.
        if (isRevoked(parsed)) return
        if (!chains.has(parsed.chainId)) {
          const chain = Object.freeze({ chainId: parsed.chainId, entryKey: parsed.entryKey, generation: parsed.generation, revoked: false })
          // The chain record is written first, so no refresh record ever exists without its chain.
          await tables.chains.put(chainKeyOf(parsed.chainId), chain)
          chains.set(parsed.chainId, chain)
        }
        await tables.refresh.put(refreshKeyOf(digest), parsed)
      })
    },

    getRefresh(digest) {
      const record = tables.refresh.get(refreshKeyOf(digest))
      return record === undefined || isRevoked(record) ? undefined : Object.freeze({ ...record })
    },

    async revokeChain(chainId) {
      revokedChains.add(chainId)
      dropAccess((token) => token.chainId === chainId)
      await serial(() => persistRevocation([chainId]))
    },

    async revokeEntry(entryKey, below) {
      generationFloor.set(entryKey, Math.max(below, generationFloor.get(entryKey) ?? NO_GENERATION_FLOOR))
      dropAccess((token) => token.entryKey === entryKey && token.generation < below)
      dropCodes(entryKey)
      await serial(() => {
        // Picked at the slot, so a chain whose `putRefresh` was queued earlier is revoked too.
        const revoked = [...chains.values()].filter((chain) => chain.entryKey === entryKey && chain.generation < below).map((chain) => chain.chainId)
        for (const chainId of revoked) revokedChains.add(chainId)
        return persistRevocation(revoked)
      })
    },

    async forgetEntry(entryKey) {
      dropAccess((token) => token.entryKey === entryKey)
      dropCodes(entryKey)
      await serial(async () => {
        await deleteRefresh((record) => record.entryKey === entryKey)
        for (const chain of [...chains.values()]) {
          if (chain.entryKey !== entryKey) continue
          await tables.chains.delete(chainKeyOf(chain.chainId))
          chains.delete(chain.chainId)
          revokedChains.delete(chain.chainId)
        }
      })
    },
  })
}

/**
 * Applies C-TOKENS' revocations to the store (R-OA-06, R-TOK-05): `onRevoked` passes the entry's
 * new generation (checked against C-TOKENS `registry.js`, Fishball 2026-11-14), so every token
 * issued under an older one is revoked. A delete then forgets the entry's chains, freeing its key,
 * even when the revocation's durable write failed: the in-memory revocation has already taken
 * effect, and the forget removes what the failed write would have marked. Each failure is logged.
 * @returns the unsubscribe function
 */
export function followRevocations(tokenRegistry, store, { logger = SILENT_LOGGER } = {}) {
  const logged = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  return tokenRegistry.onRevoked((entryKey, kind, generation) => {
    const revoked = store.revokeEntry(entryKey, generation).catch(logged(LOG.revokeFailed))
    if (kind === REVOCATION_KIND.deleted) revoked.then(() => store.forgetEntry(entryKey)).catch(logged(LOG.forgetFailed))
  })
}

/**
 * Opens the `dsh_connector_oauth` domain and its store.
 * @param ctx - a Cordis context providing `ctx.storageDomain`
 * @param storageDomain - `{defineDomain, domainTable}` of `@deepseek-ai/dsh-storage-domain`, passed
 *   in by the connector row (as the pair store and the mailbox), so this module imports no host package
 * @returns `{store, close}`; the caller owns `close`
 */
export async function openOAuthTokenStore(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: OAUTH_STORE.domain,
    version: OAUTH_STORE.version,
    layout: OAUTH_STORE.layout,
    tables: { [OAUTH_STORE.table.refresh]: domainTable(refreshRecord), [OAUTH_STORE.table.chains]: domainTable(chainRecord) },
  }))
  const tables = { refresh: domain.table(OAUTH_STORE.table.refresh), chains: domain.table(OAUTH_STORE.table.chains) }
  return { store: createOAuthTokenStore(tables), close: () => domain.close() }
}
