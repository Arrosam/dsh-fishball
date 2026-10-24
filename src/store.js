/**
 * Fishball's durable state in its own storage domain (`$DSH_HOME/storages/fishball.json`,
 * spike S8). The domain is versioned and fails closed: DSH refuses to open a stored
 * version or record this code does not understand, and the lifecycle then reports
 * `store-unreadable` instead of overwriting anything.
 *
 * P2 owns only the assistant record; later phases add their own tables to this spec.
 */
import { z } from 'zod'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { DOMAIN } from './constants.js'

const assistantRecord = z.object({
  /** The one assistant session; null before the first successful creation. */
  sessionId: z.string().min(1).nullable(),
  workspaceId: z.string().min(1).nullable(),
  cwd: z.string().min(1).nullable(),
  createdAt: z.string().nullable(),
})

/** Domain spec. Adding a table later must bump `version` or list compatible versions. */
export const fishballDomain = defineDomain({
  name: DOMAIN.main,
  version: DOMAIN.version,
  global: { schema: assistantRecord, initial: { sessionId: null, workspaceId: null, cwd: null, createdAt: null } },
  tables: {},
})

/**
 * Thin owner of the open domain handle.
 * Contract: open() resolves or rejects (DomainError codes pass through); the handle is
 * closed when the owning plugin context is disposed.
 */
export class Store {
  #domain

  /** @param ctx - plugin context with `storageDomain`. */
  static async open(ctx) {
    const store = new Store()
    store.#domain = await ctx.storageDomain.open(fishballDomain)
    ctx.effect(() => () => store.#domain.close(), 'fishball: store')
    return store
  }

  /** @returns the assistant record (synchronous, from memory). */
  assistant() {
    return this.#domain.global.get()
  }

  /** Durably replace the assistant record. */
  setAssistant(record) {
    return this.#domain.global.set(record)
  }
}
