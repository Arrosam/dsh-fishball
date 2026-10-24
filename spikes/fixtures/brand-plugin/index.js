/** S14 fixture host half: serves the assistant session id the brand button opens. */
export const name = 'fishball-spike-brand'
export const inject = ['connection']
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/fishball-spike/state', methods: ['GET'], requestBody: 'buffered',
    fetch: async () => new Response(JSON.stringify({ sessionId: globalThis.__spikeAssistantId ?? null }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }),
  }), 'spike state route')
}
