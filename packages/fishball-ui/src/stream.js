/**
 * fishball-ui's live view routes (F-WIRE; R-FIX-FUI): one owner-only SSE stream on DSH's
 * authenticated exact-route channel, serving what fishball-ui draws from one of core's services.
 * Each frame is `frame(snapshot, url)`: the first at once, then one per change of the source's
 * snapshot, and one when the service itself arrives, is replaced or leaves (then
 * `frame(undefined, url)`). An identical frame is not sent twice. The status strip
 * (src/status/route.js) and the pairing card (src/pairing/route.js) are its two users; a browser
 * press never goes through here.
 */
export const VIEW_STREAM = Object.freeze({
  method: 'GET',
  requestBody: 'buffered',
  ok: 200,
  headers: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  frame: (json) => `data: ${json}\n\n`,
  /** Cordis's event for a service provided, replaced or withdrawn (both SDKs), with its name. */
  serviceEvent: 'internal/service',
  abort: 'abort',
})

/**
 * One query parameter of a request whose allowed values are a dictionary's keys (`en`, `zh`); any
 * other value is `fallback`.
 */
export function queryKey(url, name, dictionary, fallback) {
  const value = new URL(url).searchParams.get(name)
  return Object.hasOwn(dictionary, value) ? value : fallback
}

/**
 * @param {object} ctx fishball-ui's row context (`get`, `on`, `connection`)
 * @param {object} options
 * @param {string} options.path the route's exact path
 * @param {string} options.service the Cordis service the view follows
 * @param {(service: unknown) => {read: () => unknown, onChange?: (fn: () => void) => () => void} | undefined} options.source
 *   the readable part of the service, or undefined when the service is absent or not the expected shape
 * @param {(snapshot: unknown, url: string) => unknown} options.frame the JSON frame drawn for a snapshot
 * @returns {() => void} withdraws the route and closes every open stream
 */
export function registerViewStream(ctx, { path, service, source, frame }) {
  const streams = new Set()

  function stream(request) {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        let offSnapshot = () => {}
        let last
        const push = () => {
          const json = JSON.stringify(frame(source(ctx.get(service))?.read(), request.url))
          if (json === last) return
          last = json
          try { controller.enqueue(encoder.encode(VIEW_STREAM.frame(json))) } catch { close() }
        }
        const follow = () => {
          offSnapshot()
          const onChange = source(ctx.get(service))?.onChange
          offSnapshot = typeof onChange === 'function' ? onChange(push) : () => {}
          push()
        }
        const offService = ctx.on(VIEW_STREAM.serviceEvent, (name) => { if (name === service) follow() })
        close = () => {
          if (!streams.delete(close)) return
          offSnapshot()
          offService()
          request.signal?.removeEventListener(VIEW_STREAM.abort, close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        streams.add(close)
        request.signal?.addEventListener(VIEW_STREAM.abort, close)
        follow()
      },
      cancel: () => close(),
    })
    return new Response(body, { status: VIEW_STREAM.ok, headers: VIEW_STREAM.headers })
  }

  const withdraw = ctx.connection.fetch.register({ path, methods: [VIEW_STREAM.method], requestBody: VIEW_STREAM.requestBody, fetch: stream })
  return () => {
    for (const close of [...streams]) close()
    return withdraw?.()
  }
}
