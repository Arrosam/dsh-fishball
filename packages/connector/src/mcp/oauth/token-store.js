/**
 * The one OAuth token store (K1 `OAuthTokenStore`, ownership K1a; R-OA-05, R-OA-06, R-OA-14,
 * R-OA-16; design §5.5, §5.5a). C-OAUTH's client-credentials grant and bearer verifier and
 * C-OAUTH-WEB's code and refresh grants share this one instance.
 *
 * Everything is keyed by the digest of the opaque value (`./digest.js`), never the value.
 * - Access tokens and codes are in memory only (TQ-5 A, R-OA-14): a restart loses them.
 * - Refresh tokens persist as digests with their chain id and entry generation (Q-S7B-3 A), in
 *   the `refresh` table. One `chains` record per chain keeps what `chainsOf` needs after a restart:
 *   the entry, the generation, the chain's start and whether it was revoked. A revoked chain's
 *   record stays until the entry is deleted (`forgetEntry`), so a revocation is never forgotten
 *   (K1 `chainsOf`: "the end reason of a chain is kept with it until the entry is deleted").
 *
 * Revocation is visible at once, before its durable write lands: `revokedChains` and
 * `generationFloor` are read by every getter, so the next request after a revocation is refused
 * (R-TOK-05) whatever the storage is doing. Durable writes run one at a time on this store's own
 * queue, so a late `putRefresh` can never write a chain record over the revoked mark that a
 * concurrent revocation wrote.
 *
 * What the store does not know: entry state (C-TOKENS). A revocation that happened while the
 * connector was down is caught by the generation comparisons of the verifier, `chainsOf` and
 * C-OAUTH-WEB's refresh grant against `TokenRegistry`, not by a startup sweep (Fishball
 * 2026-11-14): a sweep run while the registry is still loading could revoke every chain.
 */
import { z } from 'zod'
import { LIFETIME } from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { CHAINS_STATE, LOG, MISUSE, OAUTH_STORE, REVOCATION_KIND, SWEEP } from './constants.js'
import { digestOf, isDigest } from './digest.js'

const time = z.number().int()
const key = z.string().min(1)

const refreshRecord = z.object({
  chainId: key,
  entryKey: key,
  clientId: key,
  audience: key,
  generation: z.number().int().nonnegative(),
  chainStartedAt: time,
  spentAt: time.optional(),
}).strict()

const chainRecord = z.object({
  chainId: key,
  entryKey: key,
  generation: z.number().int().nonnegative(),
  chainStartedAt: time,
  revoked: z.boolean(),
}).strict()

const SILENT_LOGGER = Object.freeze({ warn() {} })

function requireDigest(digest) {
  if (!isDigest(digest)) throw new TypeError(MISUSE.digest)
}

/** A map that drops entries `isStale(record, now)` once it doubled since the last sweep (SWEEP). */
function sweptMap(isStale) {
  const map = new Map()
  let sweepAt = SWEEP.floor
  return Object.freeze({
    map,
    /** `now` is the newest record's issue time: the store has no clock of its own. */
    set(digest, record, now) {
      map.set(digest, record)
      if (map.size < sweepAt) return
      for (const [stored, value] of [...map]) if (isStale(value, now)) map.delete(stored)
      sweepAt = Math.max(SWEEP.floor, map.size * SWEEP.growthFactor)
    },
  })
}

const isExpiredAt = (lifetimeMs) => (record, now) => now >= record.issuedAt + lifetimeMs

/**
 * The store over the two tables of the `fishball_oauth` domain.
 * @param tables - `{refresh, chains}`, DSH storage-domain KvTables (`get`, `entries`, `put`, `delete`)
 * @returns the K1 `OAuthTokenStore`, plus `forgetEntry(entryKey)` (an entry was deleted: drop
 *   every record of it, so `chainsOf` answers `none` for a key that may never come back).
 */
export function createOAuthTokenStore(tables) {
  const access = sweptMap(isExpiredAt(LIFETIME.accessTokenMs))
  const codes = sweptMap(isExpiredAt(LIFETIME.codeMs))
  /** chainId → chain record, mirroring the `chains` table (loaded at open, kept in step). */
  const chains = new Map()
  for (const [, chain] of tables.chains.entries()) chains.set(chain.chainId, chain)
  /** Chains revoked in this life, before or after their durable mark. */
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

  const belowFloor = (entryKey, generation) => generation < (generationFloor.get(entryKey) ?? 0)
  const isRevoked = (record) => belowFloor(record.entryKey, record.generation) || (record.chainId !== undefined && revokedChains.has(record.chainId))

  /** Drops every in-memory access token matching `drop`. */
  function dropAccess(drop) {
    for (const [digest, token] of [...access.map]) if (drop(token)) access.map.delete(digest)
  }

  /** The refresh digests of the stored records matching `match`. */
  const refreshDigests = (match) => [...tables.refresh.entries()].filter(([, record]) => match(record)).map(([digest]) => digest)

  /** Marks the chains durably revoked and deletes their refresh records (one queued write). */
  function persistRevocation(chainIds) {
    return serial(async () => {
      for (const chainId of chainIds) {
        const chain = chains.get(chainId)
        if (chain === undefined || chain.revoked) continue
        const revoked = { ...chain, revoked: true }
        await tables.chains.put(digestOf(chainId), revoked)
        chains.set(chainId, revoked)
      }
      const ids = new Set(chainIds)
      for (const digest of refreshDigests((record) => ids.has(record.chainId))) await tables.refresh.delete(digest)
    })
  }

  return Object.freeze({
    putAccess(digest, token) {
      requireDigest(digest)
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
      requireDigest(digest)
      codes.set(digest, Object.freeze({ ...code }), code.issuedAt)
    },

    takeCode(digest) {
      const code = codes.map.get(digest)
      codes.map.delete(digest)
      return code
    },

    async putRefresh(digest, record) {
      requireDigest(digest)
      let parsed
      try { parsed = refreshRecord.parse(record) } catch { throw new TypeError(MISUSE.refreshRecord) }
      await serial(async () => {
        // Decided at the write slot: a revocation queued before this write wins.
        if (isRevoked(parsed) || chains.get(parsed.chainId)?.revoked) return
        if (!chains.has(parsed.chainId)) {
          const chain = Object.freeze({
            chainId: parsed.chainId, entryKey: parsed.entryKey, generation: parsed.generation, chainStartedAt: parsed.chainStartedAt, revoked: false,
          })
          // The chain record is written first, so no refresh record ever exists without its chain.
          await tables.chains.put(digestOf(parsed.chainId), chain)
          chains.set(parsed.chainId, chain)
        }
        await tables.refresh.put(digest, parsed)
      })
    },

    getRefresh(digest) {
      const record = tables.refresh.get(digest)
      return record === undefined || isRevoked(record) || chains.get(record.chainId)?.revoked ? undefined : record
    },

    async revokeChain(chainId) {
      revokedChains.add(chainId)
      dropAccess((token) => token.chainId === chainId)
      await persistRevocation([chainId])
    },

    async revokeEntry(entryKey, generation) {
      generationFloor.set(entryKey, Math.max(generation, generationFloor.get(entryKey) ?? 0))
      dropAccess((token) => token.entryKey === entryKey && token.generation < generation)
      // Codes carry no generation, so every unredeemed code of the entry goes (Fishball 2026-11-14):
      // a disable must not leave a pending code that mints a token later.
      for (const [digest, code] of [...codes.map]) if (code.entryKey === entryKey) codes.map.delete(digest)
      const revoked = [...chains.values()].filter((chain) => chain.entryKey === entryKey && chain.generation < generation).map((chain) => chain.chainId)
      for (const chainId of revoked) revokedChains.add(chainId)
      await persistRevocation(revoked)
    },

    chainsOf(entryKey, generation, now) {
      const own = [...chains.values()].filter((chain) => chain.entryKey === entryKey)
      if (own.length === 0) return CHAINS_STATE.none
      // Revoked wins over everything (the user's decision, 2026-11-13: such an entry never renews),
      // including a chain from an older generation whose revocation this life never saw.
      if (own.some((chain) => chain.revoked || revokedChains.has(chain.chainId) || chain.generation < generation)) return CHAINS_STATE.revoked
      return own.some((chain) => now < chain.chainStartedAt + LIFETIME.refreshChainMaxMs) ? CHAINS_STATE.live : CHAINS_STATE.ended
    },

    async forgetEntry(entryKey) {
      dropAccess((token) => token.entryKey === entryKey)
      for (const [digest, code] of [...codes.map]) if (code.entryKey === entryKey) codes.map.delete(digest)
      await serial(async () => {
        for (const digest of refreshDigests((record) => record.entryKey === entryKey)) await tables.refresh.delete(digest)
        for (const chain of [...chains.values()]) {
          if (chain.entryKey !== entryKey) continue
          await tables.chains.delete(digestOf(chain.chainId))
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
 * issued under an older one is revoked. A delete then forgets the entry's chains, freeing its key.
 * A failed durable write is logged; the in-memory revocation has already taken effect.
 * @returns the unsubscribe function
 */
export function followRevocations(tokenRegistry, store, { logger = SILENT_LOGGER } = {}) {
  return tokenRegistry.onRevoked((entryKey, kind, generation) => {
    const revoked = store.revokeEntry(entryKey, generation)
    const done = kind === REVOCATION_KIND.deleted ? revoked.then(() => store.forgetEntry(entryKey)) : revoked
    done.catch((error) => logger.warn(LOG.format, LOG.revokeFailed, diagnosticOf(error)))
  })
}

/**
 * Opens the `fishball_oauth` domain and its store.
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
