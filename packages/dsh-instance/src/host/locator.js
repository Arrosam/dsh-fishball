/**
 * The instance's child locator `dshInstanceChild` (K3 `host-services/child.d.ts`, as I-HOST
 * amended it; design §4.1; R-HOST-06). It is built from explicit parts, so every rule here runs
 * without a child: the host row passes its lifecycle, the runtime's origin and ticket mint, the
 * hosted-token rules (hosted.js) and model sync.
 */
import { CHILD_STATE, LOCATOR, LOOPBACK, TICKET, NativeRuntimeError } from '../native-runtime/constants.js'
const reject = (code) => Promise.reject(new NativeRuntimeError(code))

/**
 * @param deps
 * @param deps.lifecycle - `{status() → {state, code, plugin?}, onChange(fn) → dispose, retry() → Promise}`
 *   (`retry` restarts a `failed` child, and nothing else)
 * @param deps.origin - `() => string | undefined`, the ready child's `http://127.0.0.1:<port>`
 * @param deps.ticket - `({audience, view, lang}) => Promise<string>` for the current generation
 * @param deps.hosted - the hosted-token rules (hosted.js)
 * @param deps.providerSync - `{status, check, add}`
 * @returns {object} the K3 `DshInstanceChild`
 */
export function createChildLocator({ lifecycle, origin, ticket, hosted, providerSync }) {
  const ready = () => lifecycle.status().state === CHILD_STATE.ready
  /** The child's origin under a served hostname, or null. */
  function originUnder(hostname) {
    const own = ready() && LOOPBACK.served.includes(hostname) ? origin() : undefined
    if (own === undefined) return null
    const url = new URL(own)
    url.hostname = hostname
    return url.origin
  }
  return Object.freeze({
    apiVersion: LOCATOR.apiVersion,
    status: () => lifecycle.status(),
    onChange: (fn) => lifecycle.onChange(fn),
    origin: originUnder,
    async admit({ view, lang, hostname } = {}) {
      if (!LOOPBACK.all.includes(hostname)) return reject(LOOPBACK.code.hostnameRefused)
      const base = originUnder(hostname)
      if (base === null || !LOOPBACK.views.includes(view) || !LOOPBACK.langs.includes(lang)) return reject(LOOPBACK.code.notReady)
      let minted
      try { minted = await ticket({ audience: new URL(base).host, view, lang }) } catch { return reject(LOOPBACK.code.notReady) }
      const url = new URL(TICKET.path, base)
      url.searchParams.set(TICKET.param, minted)
      return { url: url.href }
    },
    async retry() {
      if (lifecycle.status().state === CHILD_STATE.failed) { await lifecycle.retry(); return }
      // Never a token (R6 = B): a deleted hosted entry only gets the notice.
      hosted.retryNotice()
    },
    async reconnect() {
      if (!ready()) return { ok: false, code: LOOPBACK.code.notReady }
      return hosted.reconnect()
    },
    targetStatus: () => hosted.targetStatus(),
    providerSync,
  })
}
