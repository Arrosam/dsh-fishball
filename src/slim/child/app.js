/**
 * The child app row, fishball-native-app (§2.1, §2.3, §15 T03).
 *
 * T02 inserts this module as the child profile's required app row. It owns the child's loopback
 * server: the shell document, /ui/*, /api/health and /api/events, all behind the bearer this
 * instance mints (§3.2). The chat API and its UI belong to later tasks.
 *
 * Contract for the child runtime (T02) and the main-side broker (T04):
 *   ctx.get('fishballApp') -> { origin, bearer }
 * - origin: "http://127.0.0.1:<port>", the address the child bound.
 * - bearer: the parent-only credential, sent as "Authorization: Bearer <token>". Never place it
 *   in a URL, a response body, page storage or a log.
 * The service exists exactly while the listener is up; a missing service means "not ready". The
 * parent's readiness probe makes one authenticated request (GET /api/health) and requires 200
 * (§2.3). The lifecycle row config (mainHome, hostId, instanceId, limits, control) belongs to
 * T02; this module needs none of it at T03.
 *
 * The row runs from the child's code snapshot, so T02's copyChildCode must carry this module's
 * whole tree — src/slim/child/*.js, ../contract.js, ../limits.js and every file under ../ui/. A
 * copy that keeps only *.js fails loud here, because the shell document is read before the server
 * starts; the shell's script and stylesheet are read when /ui/* is requested.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAppServer } from './server.js'
import { createAuthority } from './auth.js'
import { createReminders } from './reminders.js'

/** Stable Cordis plugin name; T02's overlay row id is the same string (§2.3). */
export const name = 'fishball-native-app'

const APP = Object.freeze({
  service: 'fishballApp',
  logger: 'fishball-native-app',
  /**
   * T07's chat row will publish the agent resolver the Schedule runtime needs to deliver into
   * Fishball's existing Session (schedule/resolve-agent). It does not exist yet, so the seam is
   * read now and simply absent: reminders still list and cancel, and only a delivery into an
   * existing Session fails until T07 mounts the chat row and provides it.
   */
  chatService: 'fishballChat',
})

/**
 * Start the loopback server and publish the parent-only service. Listening begins during boot,
 * before appReady, so the parent's readiness probe always has a target; the probe itself decides
 * when core services are up (§2.3). The same bearer authority lives exactly as long as this
 * listener, so a restarted child never accepts the previous instance's token (§3.2).
 */
export async function apply(ctx) {
  const document = await readFile(fileURLToPath(new URL('../ui/shell.html', import.meta.url)))
  const authority = createAuthority()
  // The resolver is optional until T07 provides it; createReminders validates what it gets.
  // The wrapper keeps the chat service as `this`, so a Cordis service proxy sees its caller.
  const chat = ctx.get(APP.chatService)
  const resolveAgent = typeof chat?.resolveAgent === 'function' ? (sessionId, next) => chat.resolveAgent(sessionId, next) : undefined
  const reminders = createReminders(ctx, resolveAgent === undefined ? {} : { resolveAgent })
  const server = createAppServer({
    authority,
    document,
    uiDir: fileURLToPath(new URL('../ui/', import.meta.url)),
    reminders,
  })
  await server.start()
  ctx.effect(() => () => server.close(), name + ': loopback server')
  ctx.provide(APP.service, Object.freeze({ origin: server.origin, bearer: authority.token }))
  // The token stays out of logs; the loopback origin alone is diagnostic.
  ctx.logger(APP.logger).info('loopback server listening on %s', server.origin)
}
