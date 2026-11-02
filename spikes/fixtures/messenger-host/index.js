/**
 * S24b/S25/S26 fixture host half: serves the nested messenger package's browser file (as
 * dsh-fishball would serve packages/messenger/client.js) and the assistant session id.
 */
import fs from 'node:fs'
import path from 'node:path'
export const name = 'fishball-spike-messenger-host'
export const inject = ['connection']
const MESSENGER_CLIENT = path.join(import.meta.dirname, 'packages', 'messenger', 'client.js')
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/fishball-spike/messenger.js', methods: ['GET'], requestBody: 'buffered',
    fetch: async () => new Response(fs.readFileSync(MESSENGER_CLIENT), { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } }),
  }), 'spike messenger client route')
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/fishball-spike/state', methods: ['GET'], requestBody: 'buffered',
    fetch: async () => new Response(JSON.stringify({ sessionId: globalThis.__spikeAssistantId ?? null }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }),
  }), 'spike state route')
}
