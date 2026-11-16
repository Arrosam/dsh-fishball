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
 *   mints the child's own login cookie through DSH's public `connection.authorizeIndex`;
 * - the child halves of the admin relay and of model sync (src/child/), moved from core.
 */
import Schema from '@deepseek-ai/schemastery'
import { HOSTED, LOOPBACK, TICKET } from './src/native-runtime/constants.js'
import { createCredentialReceiver } from './src/native-runtime/credential.js'
import { mountAdmin } from './src/child/admin.js'
import { mountProviderSyncTarget } from './src/child/provider-sync-target.js'

export const name = HOSTED.childRow
/**
 * The row's settings: the target the instance supplies (written by the launch overlay at every
 * start; blank when there is none). Core reads it by its published name; the owner never edits it.
 */
export const Config = Schema.object({
  [HOSTED.targetField]: Schema.string().default(''),
})
// The provider-sync target's inject list is the one core's row had (no `sessionController`), so
// moving it changed nothing it does; the row gates on no session service.
export const inject = ['nativeRuntime', 'settings', 'pluginManager', 'llm', 'credentials', 'configEditor', 'authorization', 'profileContext', 'webServer', 'connection']

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

/** The row's four parts. Each is its own effect, and a part that fails is logged with its code only. */
const PART = Object.freeze({
  credential: HOSTED.childRow + ': credential receiver',
  admission: ADMIT.label,
  admin: HOSTED.childRow + ': admin',
  sync: HOSTED.childRow + ': provider sync',
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
  part(PART.admission, () => registerAdmission(ctx))
  part(PART.admin, () => mountAdmin(ctx))
  part(PART.sync, () => mountProviderSyncTarget(ctx))
}
