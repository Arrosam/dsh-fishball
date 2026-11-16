/**
 * Connect's web callback for a browser on another machine (requirements 1.33 Q-A3 = B: "也允许在别的
 * 电脑上连，通过 Fishball 的 https 网址完成"; design §6.3a; R-OA-14; K3a `CONNECT.callback.webPath`,
 * `CONNECT.configuration.webCallbackInsecure`).
 *
 * The loopback callback only works for a browser on Fishball's own machine: the connector's page
 * redirects the user's browser to `http://127.0.0.1:<port>/callback`, which on another machine is
 * that machine. From another machine Connect redirects to Fishball's own https address plus
 * `CONNECT.callback.webPath` instead; the user's CIMD document must list that URI too.
 *
 * Which callback a press uses is decided from the page's own origin (`callbackFor`):
 * - a loopback host (`LINK.hosts.loopbackNames`), or no `Origin` with a loopback `Host`: the loopback
 *   callback (the default of `fishball-shared/oauth-client`);
 * - an `https:` origin whose authority is the request's own `Host` (DSH's connection fence already
 *   refused a foreign Origin; comparing again keeps a forged Host out of the redirect URI): the web
 *   callback at that origin;
 * - anything else (plain http off loopback, R-OA-14 and the user's rule that only loopback may use
 *   http; an origin that is not this request's): `web-callback-insecure`, and nothing is sent.
 *
 * The route is a raw DSH web-server route, outside DSH's connection authentication on purpose: the
 * browser arrives from the connector's page, cross-site, so DSH's `SameSite=Strict` login cookie is
 * not sent (dsh-client-connection). It accepts a callback only while one web-callback attempt is
 * pending and hands its parameters to that attempt alone; `oauth-client`'s `authorize` then checks
 * `state` and `iss` and redeems the code with the attempt's PKCE verifier, so a forged or replayed
 * callback ends that attempt without a grant and grants nothing. With nothing pending it answers 404.
 */
import { OAUTH_CLIENT } from 'fishball-shared/oauth-client'
import { CONNECT, LINK } from '../../contracts/constants.js'
import { WEB_CALLBACK } from './constants.js'

/** The loopback hostnames as URL `hostname`s (`[::1]` keeps its brackets there). */
const isLoopback = (hostname) => LINK.hosts.loopbackNames.includes(hostname)

/** `new URL(text)` or undefined: a malformed header is no origin. */
const urlOf = (text) => (typeof text === 'string' && URL.canParse(text) ? new URL(text) : undefined)

/**
 * The web callback route and the one pending listener.
 * @param {{webServer: {register(route: object): () => void}}} ctx core's main row context
 * @returns {{callbackFor(request: Request): {callback?: Function, refused?: string} | undefined, dispose(): void}}
 *   `callbackFor` is the Connect route's choice for one press (see the module header):
 *   `undefined` for the loopback callback
 */
export function createWebCallback(ctx) {
  let pending

  /** A listener factory for `authorize` at `origin` (`oauth-client` listener contract). */
  const listenAt = (origin) => async () => {
    let deliver
    const received = new Promise((resolve) => { deliver = resolve })
    const listener = { deliver }
    pending = listener
    return {
      redirectUrl: new URL(CONNECT.callback.webPath, origin).href,
      received,
      close: async () => { if (pending === listener) pending = undefined },
    }
  }

  const answer = (res, status, body) => {
    res.writeHead(status, OAUTH_CLIENT.callbackPage.headers)
    res.end(body)
  }

  const disposeRoute = ctx.webServer.register({
    kind: WEB_CALLBACK.routeKind,
    path: CONNECT.callback.webPath,
    handler(req, res) {
      const listener = pending
      if (req.method !== WEB_CALLBACK.method || listener === undefined) return answer(res, OAUTH_CLIENT.callbackPage.notFound, '')
      // Only the first callback counts: a second request while the attempt finishes finds nothing.
      pending = undefined
      listener.deliver(new URL(req.url, WEB_CALLBACK.base).searchParams)
      return answer(res, OAUTH_CLIENT.callbackPage.status, OAUTH_CLIENT.callbackPage.body)
    },
  })

  return Object.freeze({
    callbackFor(request) {
      const host = request.headers.get(WEB_CALLBACK.hostHeader)
      const origin = urlOf(request.headers.get(WEB_CALLBACK.originHeader))
      if (origin === undefined) return isLoopback(urlOf(WEB_CALLBACK.scheme + host)?.hostname) ? undefined : { refused: CONNECT.configuration.webCallbackInsecure }
      if (isLoopback(origin.hostname)) return undefined
      if (origin.protocol === LINK.hosts.remoteScheme && origin.host === host) return { callback: listenAt(origin.origin) }
      return { refused: CONNECT.configuration.webCallbackInsecure }
    },
    dispose() {
      pending = undefined
      disposeRoute()
    },
  })
}
