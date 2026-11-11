/**
 * CHILD-BOOT fixture host row: stands in for the instance's manager behind the documented child
 * route `api/fishball/session` (docs/integration-v2-nov9-wave2.md: GET 200 {sessionId}, POST ensures
 * and answers 200 {sessionId}). The manager is one real DSH session the SDK's own sessionController
 * creates in a folder of the throwaway home, so fishball-page opens and shows a real conversation.
 * It is test plumbing for the navigation cases (child-boot-nav.test.mjs), not an oracle.
 */
import fs from 'node:fs'
import path from 'node:path'

export const name = 'fbtest-child-manager-session'
export const inject = ['sessionController', 'connection']
const ROUTE = Object.freeze({ path: '/api/fishball/session', methods: Object.freeze(['GET', 'POST']), folder: 'fbtest-manager', requestBody: 'buffered', ok: 200, unavailable: 503 })
const HEADERS = Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' })

export function apply(ctx) {
  let ensured = null
  const ensure = () => {
    ensured ??= (async () => {
      const cwd = path.join(process.env.DSH_HOME, ROUTE.folder)
      fs.mkdirSync(cwd, { recursive: true })
      return (await ctx.sessionController.create({ cwd })).sessionId
    })()
    return ensured
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE.path,
    methods: [...ROUTE.methods],
    requestBody: ROUTE.requestBody,
    async fetch() {
      try { return new Response(JSON.stringify({ sessionId: await ensure() }), { status: ROUTE.ok, headers: HEADERS }) } catch { return new Response('{}', { status: ROUTE.unavailable, headers: HEADERS }) }
    },
  }))
}
