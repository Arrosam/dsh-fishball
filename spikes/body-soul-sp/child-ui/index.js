/**
 * SP spike only: the host half of the throwaway child UI row.
 *
 * - Hands the launch-token URL to the launcher over the IPC channel (stand-in for the lifecycle
 *   wire of §0.5), so the token is never printed, written or put in a browser URL.
 * - Creates Fishball's single session once, in its own workspace, and answers its id on an
 *   exact Connection Fetch route. A Fetch route rides Connection's shared `/api` channel, which
 *   DSH mounts with the handler form, so it is the same on 0.2.1-rc.5 and 0.2.2-rc.1 (R3).
 */
import { realpath, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const SP = Object.freeze({
  sessionPath: '/api/fishball-sp/session',
  sessionPrefix: 'session-fishball-',
  workspaceTitle: 'Fishball',
  workspaceDir: 'fishball-workspace',
  pollMs: 50,
})

export const name = 'sp-child-ui'
export const inject = ['agents', 'agentDefaultModel', 'connection', 'webServer', 'workspaceRegistry']

export function apply(ctx) {
  let pending
  const sessionId = () => pending ??= (async () => {
    const cwd = path.join(process.cwd(), SP.workspaceDir)
    await mkdir(cwd, { recursive: true })
    const real = await realpath(cwd)
    const workspace = await ctx.workspaceRegistry.create(real, SP.workspaceTitle)
    // Without agentOptions the agent has no model until the composer's first selectModel, and
    // DSH's persona prefix `{{model}}` then fails the first turn (seen on rc.5 in this spike).
    // DSH's own controller passes the default selection the same way (rc.5 :528, 0.2.2 :440).
    const { provider, model } = ctx.agentDefaultModel.currentSelection()
    const handle = await ctx.agents.create({ sessionId: SP.sessionPrefix + randomUUID(), agentOptions: { provider, model }, meta: { cwd: real } })
    await handle.agent.session?.flush?.()
    await workspace.attachSession(handle.agent.id)
    return handle.agent.id
  })()
  ctx.connection.fetch.register({
    path: SP.sessionPath,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => Response.json({ sessionId: await sessionId() }, { headers: { 'cache-control': 'no-store' } }),
  })
  // The listener binds during service init; poll its port instead of depending on boot internals.
  const timer = setInterval(() => {
    if (ctx.webServer.port === undefined) return
    clearInterval(timer)
    process.send?.({ type: 'auth', url: ctx.connection.authenticatedUrl(ctx.webServer.getOrigin()) })
  }, SP.pollMs)
  ctx.effect(() => () => clearInterval(timer), 'sp auth handoff')
  // The launcher asks for the child's resident memory (R5) without a process-table read.
  const onMessage = (message) => { if (message?.type === 'rss') process.send?.({ type: 'rss-reply', rss: process.memoryUsage().rss, node: process.versions.node, electron: process.versions.electron ?? null }) }
  process.on('message', onMessage)
  ctx.effect(() => () => process.off('message', onMessage), 'sp rss probe')
}
