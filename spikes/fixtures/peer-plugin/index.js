/** S8 fixture: bare peer imports resolved through DSH's runtime resolution for a linked package. */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { createScope } from '@deepseek-ai/dsh-scope'
import Schema from '@deepseek-ai/schemastery'
export const name = 'fishball-spike-peer'
export const inject = ['storageDomain']
const spec = defineDomain({ name: 'fishball_spike', version: 1, tables: { items: domainTable(z.object({ n: z.number() })) } })
export const Config = Schema.object({ limit: Schema.natural().min(1).default(5).volatile() })
export async function apply(ctx, config) {
  const domain = await ctx.storageDomain.open(spec)
  ctx.effect(() => () => domain.close(), 'spike domain')
  await domain.table('items').put('a', { n: 1 })
  globalThis.__spikePeerApplies = (globalThis.__spikePeerApplies ?? 0) + 1
  globalThis.__spikePeer = { ok: typeof createScope === 'function', read: domain.table('items').get('a'), config }
}
