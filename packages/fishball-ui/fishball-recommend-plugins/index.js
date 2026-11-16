import { recommendedList } from '../src/recommended.js'

/**
 * Node half of the Fishball Recommended tab (V2 RP). fishball-ui's patch mounts it wherever
 * fishball-ui and core are bundles (a hosted child, or a standalone Fishball DSH); without core the
 * row stays off (Q-G2), and a main DSH that hosts an instance has neither. Its one job is serving
 * the fixed curated list from src/recommended.js, so the browser half carries no second copy of it.
 */
export const name = 'fishball-recommend-plugins'
export const inject = ['connection']

const ROUTE = Object.freeze({
  path: '/api/fishball/recommended',
  method: 'GET',
  requestBody: 'buffered',
  ok: 200,
  headers: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
})

/**
 * GET /api/fishball/recommended -> 200 {highlighted, categories} (recommendedList()). Native
 * authentication precedes the handler; only the child's own owner Peers reach it.
 */
export function apply(ctx) {
  ctx.connection.fetch.register({
    path: ROUTE.path,
    methods: [ROUTE.method],
    requestBody: ROUTE.requestBody,
    async fetch() {
      return new Response(JSON.stringify(recommendedList()), { status: ROUTE.ok, headers: ROUTE.headers })
    },
  })
}
