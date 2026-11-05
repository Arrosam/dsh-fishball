/**
 * The child app row, fishball-native-app (§2.1, §2.3, §15 T03 and T07).
 *
 * T02 inserts this module as the child profile's required app row. It owns the child's loopback
 * server: the shell document, /ui/*, /api/health and /api/events, all behind the bearer this
 * instance mints (§3.2). The chat row (T07) lives inside this row: createChat owns Fishball's
 * Session, the /api/chat and /api/model routes and the chat SSE event.
 *
 * Contract for the child runtime (T02) and the main-side broker (T04):
 *   ctx.get('fishballApp') -> { origin, bearer }
 * - origin: "http://127.0.0.1:<port>", the address the child bound.
 * - bearer: the parent-only credential, sent as "Authorization: Bearer <token>". Never place it
 *   in a URL, a response body, page storage or a log.
 * The service exists exactly while the listener is up; a missing service means "not ready". The
 * parent's readiness probe makes one authenticated request (GET /api/health) and requires 200
 * (§2.3). The lifecycle row config (mainHome, hostId, instanceId, limits, control) belongs to
 * T02; this row reads the launcher's profileContext for the chat record's home instead.
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
import { createChat } from './chat.js'
import { createImages } from './images.js'
import { createReminders } from './reminders.js'

/** Stable Cordis plugin name; T02's overlay row id is the same string (§2.3). */
export const name = 'fishball-native-app'

const APP = Object.freeze({
  service: 'fishballApp',
  logger: 'fishball-native-app',
  /**
   * The chat row's service (T07): the reminder scheduler's activation owner, the admin service's
   * live-model port and the inbox row's delivery port read it by this name. It exists exactly
   * while this app row runs.
   */
  chatService: 'fishballChat',
  /** T06's image service: the upload route and the chat's attachment blocks read it. */
  imagesService: 'fishballImages',
  /** T09's approval bridge: its cards, labels, answers and the one answer route. */
  approvalsService: 'fishballApprovals',
})

/**
 * The image service is optional at the app row: a composition without the attachment store or
 * the llm still serves the chat and reminders, and only an upload or an attachment is refused.
 * The row is required, so a failure here must not take the child's only page down with it.
 */
function mountImages(ctx) {
  try {
    const images = createImages(ctx)
    ctx.provide(APP.imagesService, images)
    return images
  } catch (error) {
    ctx.logger(APP.logger).warn('the image service is unavailable (%s)', String(error?.code ?? error?.name ?? error))
    return undefined
  }
}

/**
 * Start the loopback server and publish the parent-only service. Listening begins during boot,
 * before appReady, so the parent's readiness probe always has a target; the probe itself decides
 * when core services are up (§2.3). The same bearer authority lives exactly as long as this
 * listener, so a restarted child never accepts the previous instance's token (§3.2).
 */
export async function apply(ctx) {
  const document = await readFile(fileURLToPath(new URL('../ui/shell.html', import.meta.url)))
  const authority = createAuthority()
  // The image service (T06) is created here, not mounted as its own row: the app row owns the
  // loopback upload route and the chat's own store reads, and both share this one store client.
  const images = mountImages(ctx)
  // The approvals row is mounted by the lifecycle row before this one, so its service is
  // provided by now. A composition without it still serves the chat; only /api/approvals is 404.
  const approvals = ctx.get(APP.approvalsService)
  if (approvals === undefined) ctx.logger(APP.logger).warn('the approval bridge is unavailable; /api/approvals is not served')
  // The chat row owns the one Session and publishes the two ports other rows read: the
  // reminder scheduler's resolver and the admin service's live-model applier (T10, T11).
  const chat = createChat(ctx, { images })
  await chat.start()
  ctx.effect(() => () => chat.close(), name + ': chat session')
  ctx.provide(APP.chatService, chat.service)
  // The published chat service is the activation owner; the closure itself is not a property of
  // the chat handle, so T10 must go through the service port.
  const reminders = createReminders(ctx, { resolveAgent: (sessionId, next) => chat.service.resolveAgent(sessionId, next) })
  const server = createAppServer({
    authority,
    document,
    uiDir: fileURLToPath(new URL('../ui/', import.meta.url)),
    reminders,
    chat,
    images,
    approvals,
  })
  await server.start()
  ctx.effect(() => () => server.close(), name + ': loopback server')
  ctx.provide(APP.service, Object.freeze({ origin: server.origin, bearer: authority.token }))
  // The token stays out of logs; the loopback origin alone is diagnostic.
  ctx.logger(APP.logger).info('loopback server listening on %s', server.origin)
}
