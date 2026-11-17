/**
 * The instance's child-side row, `dsh-instance-child` (I-HOST; requirements 1.39 R-ARCH-05: "talks
 * to the child only through its own child-side row (instance code, a DSH-side plugin in the child)
 * and generic DSH services there"; design §1.0b rows 4 and 5, §4.1, §5.4). The launch overlay
 * inserts it from the instance's lifecycle snapshot, beside the lifecycle row whose `nativeRuntime`
 * it injects, so it runs only in a hosted child. Its config is `{targetUrl}`: the target the
 * instance supplies, which core reads as the setting `dsh-instance-child.targetUrl` (K3a
 * `HOSTED_IMPORT.targetSetting`). It imports no Fishball-side code and calls none:
 * - the hosted token's probe and one import (`mcp-credential`, src/native-runtime/credential.js),
 *   written to the child's credential reference only;
 * - the frame's admission route (design §4.1; spike V3-S4 F1): redeems a single-use ticket and
 *   mints the child's own login cookie through DSH's public `connection.authorizeIndex`; once it is
 *   registered the row publishes the child's web server to the lifecycle row, which is the last of
 *   the child's readiness signals (I-READY, src/native-runtime/child.js childReadiness);
 * - the child half of model sync (src/child/provider-sync-target.js), moved from core.
 * The admin relay's child half is gone (I-READY; the user's answer 2026-11-16: delete it): its only
 * caller was core's V2 settings page.
 */
import Schema from '@deepseek-ai/schemastery'
import { HOSTED, LOOPBACK, TICKET } from './src/native-runtime/constants.js'
import { createCredentialReceiver } from './src/native-runtime/credential.js'
import { mountProviderSyncTarget } from './src/child/provider-sync-target.js'

export const name = HOSTED.childRow
/**
 * The row's settings: the target the instance supplies (written by the launch overlay at every
 * start; blank when there is none). Core reads it by its published name; the owner never edits it.
 *
 * `.volatile()` is what makes it readable at all (E-FIX-1, B1): core reads the target from DSH's
 * `settings.describe()`, which lists only rows with a volatile field (dsh-settings `volatileForm`,
 * the same in 0.2.1-rc.5 and 0.2.2-rc.1). This row reads no config itself, so a live value changes
 * nothing here.
 */
export const Config = Schema.object({
  [HOSTED.targetField]: Schema.string().default('').volatile(),
})
// The provider-sync target's inject list is the one core's row had (no `sessionController`), so
// moving it changed nothing it does; the row gates on no session service. `pluginManager` left
// with the admin relay's child half (I-READY).
export const inject = ['nativeRuntime', 'settings', 'llm', 'credentials', 'configEditor', 'authorization', 'profileContext', 'webServer', 'connection']

const ADMIT = Object.freeze({
  method: 'GET',
  kind: 'exact',
  hostHeader: 'host',
  cookieHeader: 'set-cookie',
  seeOther: 303,
  forbidden: 403,
  methodNotAllowed: 405,
  refused: 'refused',
  // Every answer of the route: never cached, never sent on as a referrer.
  headers: Object.freeze({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }),
  textType: Object.freeze({ 'content-type': 'text/plain; charset=utf-8' }),
  rootPath: '/',
  label: HOSTED.childRow + ': admission route',
})

/** The authorities a ticket may be redeemed under: a served loopback name with the child's own port. */
const audiences = (origin) => LOOPBACK.served.map((hostname) => hostname + ':' + new URL(origin).port)

/**
 * The admission route (design §4.1). A raw web-server route, outside DSH's Connection
 * authentication on purpose: it IS the admission. The browser gets only `Set-Cookie` and a 303 to
 * the page, never the child's launch token, and no ticket or URL is logged.
 */
export function registerAdmission(ctx) {
  const refuse = (res, status) => {
    res.writeHead(status, { ...ADMIT.headers, ...ADMIT.textType })
    res.end(ADMIT.refused)
  }
  return ctx.webServer.register({
    kind: ADMIT.kind,
    path: TICKET.path,
    handler(req, res) {
      if (req.method !== ADMIT.method) return refuse(res, ADMIT.methodNotAllowed)
      const origin = ctx.webServer.getOrigin()
      const host = req.headers[ADMIT.hostHeader]
      if (!audiences(origin).includes(host)) return refuse(res, ADMIT.forbidden)
      const ticket = new URL(req.url, origin).searchParams.get(TICKET.param)
      const claims = ctx.nativeRuntime.redeemTicket(ticket, host)
      if (claims === null) return refuse(res, ADMIT.forbidden)
      const login = new URL(ctx.connection.authenticatedUrl(origin + ADMIT.rootPath))
      const captured = { headers: {} }
      const sink = {
        writeHead(status, headers) { captured.status = status; Object.assign(captured.headers, headers) },
        setHeader(key, value) { captured.headers[key.toLowerCase()] = value },
        end() {},
      }
      ctx.connection.authorizeIndex({ method: ADMIT.method, url: ADMIT.rootPath + login.search, headers: { host } }, sink)
      const cookie = captured.headers[ADMIT.cookieHeader]
      if (captured.status !== ADMIT.seeOther || !cookie) return refuse(res, ADMIT.forbidden)
      const fragment = new URLSearchParams({ [TICKET.fragment.view]: claims.view, [TICKET.fragment.lang]: claims.lang })
      res.writeHead(ADMIT.seeOther, { ...ADMIT.headers, location: TICKET.landing + '#' + fragment, [ADMIT.cookieHeader]: cookie })
      res.end()
    },
  })
}

/**
 * The admission route, then the readiness signal: the web is published only once the route a frame
 * needs is registered, and withdrawn first when the row stops. `webServer.getOrigin()` throws until
 * the server listens, so the lifecycle row reads it per health check (child.js childReadiness).
 * @returns its disposer
 */
export function admitAndPublish(ctx) {
  const unregister = registerAdmission(ctx)
  const unpublish = ctx.nativeRuntime.publishWeb(() => ctx.webServer.getOrigin())
  return () => { unpublish(); unregister() }
}

/** The row's four parts. Each is its own effect, and a part that fails is logged with its code only. */
const PART = Object.freeze({
  credential: HOSTED.childRow + ': credential receiver',
  admission: ADMIT.label,
  sync: HOSTED.childRow + ': provider sync',
  target: HOSTED.childRow + ': target announcement',
  failed: '%s failed (%s)',
})

export function apply(ctx) {
  const logger = ctx.logger(HOSTED.childRow)
  /**
   * Mounts one part without letting it take the others down: the token import and the admission
   * must stay up when, say, model sync cannot load its adapter (they were separate rows before).
   */
  const part = (label, mount) => ctx.effect(() => {
    let dispose
    let ended = false
    const fail = (error) => logger.warn(PART.failed, label, error?.code ?? error?.name ?? typeof error)
    try {
      Promise.resolve(mount()).then((done) => { if (ended) done?.(); else dispose = done }, fail)
    } catch (error) { fail(error) }
    return () => { ended = true; dispose?.() }
  }, label)
  part(PART.credential, () => {
    const receiver = createCredentialReceiver({ credentials: ctx.credentials })
    const off = ctx.nativeRuntime.onCredentialTransport((transport) => receiver.attach(transport))
    return () => { off(); receiver.close() }
  })
  part(PART.admission, () => admitAndPublish(ctx))
  part(PART.sync, () => mountProviderSyncTarget(ctx))
  // Core reads the target once at its own start and again on `settings/document-updated`. DSH
  // emits that event only from inside a `describe()` call, and describe skips a fiber that is still
  // loading (both SDKs). Core can start before this row is active, because this row waits for
  // `nativeRuntime`. So once this fiber is active, one call lists the row and emits the update core
  // follows. Otherwise core sees no target until something else, such as a settings page, calls
  // describe. If the row was already listed, the call emits nothing and changes nothing.
  part(PART.target, () => ctx.fiber.await().then(() => { ctx.settings.describe() }))
}
