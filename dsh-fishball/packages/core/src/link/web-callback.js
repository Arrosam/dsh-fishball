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
 *   callback (the default of `./oauth-client.js`);
 * - an `https:` origin whose authority is the request's own `Host` (DSH's connection fence already
 *   refused a foreign Origin; comparing again keeps a forged Host out of the redirect URI): the web
 *   callback at that origin;
 * - anything else (plain http off loopback, R-OA-14 and the user's rule that only loopback may use
 *   http; an origin that is not this request's): `web-callback-insecure`, and nothing is sent.
 *
 * The route is a raw DSH web-server route, outside DSH's connection authentication on purpose: the
 * browser arrives from the connector's page, cross-site, so DSH's `SameSite=Strict` login cookie is
 * not sent (dsh-client-connection). It accepts a callback only with the `state` of a pending
 * web-callback attempt (told by `authorize` through `expect`), and hands its parameters to that
 * attempt alone; anything else is 404 and leaves every attempt pending, so no one else can end it.
 * MULTI-1 (PLAN-MULTI §3.2, Q05): the pending attempts are a registry keyed by `state`, one entry
 * per live attempt, so concurrent Connects of several targets never overwrite each other. The
 * attempt is found from its own stored `state` only, never from a target named in the query; its
 * entry goes at its `close()` (the attempt's end, cancel, removal or URL edit). `authorize` then checks `state` and `iss` again and redeems the code with the
 * attempt's PKCE verifier.
 */
import { OAUTH_CLIENT } from './oauth-client.js'
import { CONNECT, LINK } from '../../contracts/constants.js'
import { WEB_CALLBACK } from './constants.js'

/** The loopback hostnames as URL `hostname`s (`[::1]` keeps its brackets there). */
const isLoopback = (hostname) => LINK.hosts.loopbackNames.includes(hostname)

/** `new URL(text)` or undefined: a malformed header is no origin. */
const urlOf = (text) => (typeof text === 'string' && URL.canParse(text) ? new URL(text) : undefined)

/**
 * The web callback route and its registry of pending listeners.
 * @param {{webServer: {register(route: object): () => void}}} ports DSH's web listener (dsh-host-webserver)
 * @returns {{callbackFor(request: Request): {callback?: Function, refused?: string} | undefined, dispose(): void}}
 *   `callbackFor` is the Connect route's choice for one press (see the module header):
 *   `undefined` for the loopback callback
 */
export function createWebCallback({ webServer }) {
  /** `state` → the listener of the pending attempt that sent it. */
  const pending = new Map()

  /** A listener factory for `authorize` at `origin` (`oauth-client` listener contract). */
  const listenAt = (origin) => async () => {
    const received = Promise.withResolvers()
    const listener = { deliver: received.resolve, state: undefined }
    const forget = () => { if (listener.state !== undefined && pending.get(listener.state) === listener) pending.delete(listener.state) }
    return {
      redirectUrl: new URL(CONNECT.callback.webPath, origin).href,
      received: received.promise,
      expect: (state) => { forget(); listener.state = state; pending.set(state, listener) },
      close: async () => forget(),
    }
  }

  const answer = (res, status, body) => {
    res.writeHead(status, OAUTH_CLIENT.callbackPage.headers)
    res.end(body)
  }

  const disposeRoute = webServer.register({
    kind: WEB_CALLBACK.routeKind,
    path: CONNECT.callback.webPath,
    handler(req, res) {
      const params = new URL(req.url, WEB_CALLBACK.base).searchParams
      const state = params.get(OAUTH_CLIENT.param.state)
      const listener = state === null ? undefined : pending.get(state)
      // The route is open to anyone who reaches the listener, so a request whose `state` is no
      // pending attempt's is answered 404 and changes nothing: nobody else can end an attempt.
      if (req.method !== WEB_CALLBACK.method || listener === undefined) {
        return answer(res, OAUTH_CLIENT.callbackPage.notFound, WEB_CALLBACK.emptyBody)
      }
      // Only the first matching callback counts: a second one while the attempt finishes finds nothing.
      pending.delete(state)
      listener.deliver(params)
      return answer(res, OAUTH_CLIENT.callbackPage.status, OAUTH_CLIENT.callbackPage.body)
    },
  })

  return Object.freeze({
    callbackFor(request) {
      const host = request.headers.get(WEB_CALLBACK.hostHeader)
      const origin = urlOf(request.headers.get(WEB_CALLBACK.originHeader))
      if (origin === undefined) return isLoopback(urlOf(WEB_CALLBACK.scheme + host)?.hostname) ? undefined : { refused: CONNECT.configuration.webCallbackInsecure }
      if (isLoopback(origin.hostname)) return undefined
      // Both authorities parsed the same way, so a default port spelled out (`x:443`) still matches.
      if (origin.protocol === LINK.hosts.remoteScheme && origin.host === urlOf(LINK.hosts.remoteScheme + '//' + host)?.host) return { callback: listenAt(origin.origin) }
      return { refused: CONNECT.configuration.webCallbackInsecure }
    },
    dispose() {
      pending.clear()
      disposeRoute()
    },
  })
}
