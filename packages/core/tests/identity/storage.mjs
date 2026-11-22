/**
 * One DSH storage stack of the current DSH over `root`: the cordis context a core row would have
 * (dsh-storage, its JSON backend in `root`, the domain layer), for core's pairing records port
 * (`openRecords(ctx, {defineDomain, domainTable})`). It replaces the old
 * test/v3/dsh-connector/pairs/subject.mjs storageContext (gone with the connector, 6b7c53bf); the
 * same three DSH plugins, bound by name through fishball-test-helpers/dsh. Shared with link-save.
 */
import path from 'node:path'
import { importDsh } from 'fishball-test-helpers/dsh'
import { STORAGE } from './constants.mjs'

export async function storageContext(root) {
  const [cordis, storage, json, domain] = await Promise.all([STORAGE.cordis, STORAGE.storage, STORAGE.storageJson, STORAGE.storageDomain].map((n) => importDsh(n)))
  const ctx = new cordis.Context()
  await ctx.plugin(storage.default ?? storage).await()
  await ctx.plugin(json, { root: path.join(root, STORAGE.domainDir) }).await()
  await ctx.plugin(domain, { backend: STORAGE.backend, routes: {} }).await()
  return { ctx, helpers: { defineDomain: domain.defineDomain, domainTable: domain.domainTable } }
}
