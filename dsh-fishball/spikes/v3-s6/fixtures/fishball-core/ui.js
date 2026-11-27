/**
 * V3-S6 probe: the Node half of the fishball-ui component, as a second row of the SAME package
 * (`fishball-core/ui`). It serves the recommended list route; its browser half is the package's
 * one `dsh.client` entry (client.js).
 */
export const name = 'fishball-ui'
export const inject = ['connection']
const ROUTE = Object.freeze({ path: '/api/fishball/recommended', ok: 200, headers: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' }) })

export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE.path, methods: ['GET'], requestBody: 'buffered',
    fetch: async () => new Response(JSON.stringify({ highlighted: [], categories: [], source: 'fishball-core/ui' }), { status: ROUTE.ok, headers: ROUTE.headers }),
  }), 'fishball-ui: recommended route')
}
