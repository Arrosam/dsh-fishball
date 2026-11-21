/**
 * The Fishball page's one live connection (`SEAM_PAGE_STREAM`, fishball-shared's seam, which says
 * why there is only one): an owner-only SSE route on DSH's `connection.fetch`, as core's other
 * routes, carrying every registered topic. Core registers its ask cards here, fishball-ui its strip
 * view, and each amenity its own topics through `fishballInstance.page.register`, so a new panel or
 * amenity is a new topic on the same stream, never a new connection.
 *
 * A topic's provider is `{frame(url), onChange(fn) => dispose}`: `frame(url)` is the topic's view
 * for the reader of that stream (the request URL carries its language and time zone), computed for
 * each open stream; `onChange` says when it may have changed. A topic registered while streams are
 * open is sent to them at once; one withdrawn sends nothing more (a reader keeps its last frame, as
 * after any stream that stops talking).
 */
import { SEAM_PAGE_STREAM } from 'fishball-shared/ui-seam'

export const PAGE_STREAM = Object.freeze({
  ...SEAM_PAGE_STREAM,
  get: 'GET',
  requestBody: 'buffered',
  ok: 200,
  abort: 'abort',
  headers: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  sse: (json) => `data: ${json}\n\n`,
  misuse: Object.freeze({
    topic: 'fishball page stream: a topic is a non-empty string',
    provider: 'fishball page stream: a provider has frame(url) and onChange(fn)',
    taken: (topic) => `fishball page stream: topic ${JSON.stringify(topic)} is already registered`,
  }),
  /** Background log line (printf format): a provider that threw; its topic is skipped for that push. */
  log: 'page stream topic %s failed (%s)',
})

/**
 * @param {object} ctx core's main row context (`connection`)
 * @param {{warn: Function}} [logger]
 * @returns {{register(topic: string, provider: {frame: Function, onChange: Function}): () => void, dispose(): Promise<void>}}
 */
export function createPageStream(ctx, logger) {
  /** topic → provider */
  const topics = new Map()
  /** every open stream: `{push(topic), drop(topic)}` */
  const streams = new Set()

  function register(topic, provider) {
    if (typeof topic !== 'string' || topic === '') throw new TypeError(PAGE_STREAM.misuse.topic)
    if (typeof provider?.frame !== 'function' || typeof provider?.onChange !== 'function') throw new TypeError(PAGE_STREAM.misuse.provider)
    if (topics.has(topic)) throw new Error(PAGE_STREAM.misuse.taken(topic))
    topics.set(topic, provider)
    const off = provider.onChange(() => { for (const stream of [...streams]) stream.push(topic) })
    for (const stream of [...streams]) stream.push(topic)
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      if (topics.get(topic) === provider) topics.delete(topic)
      for (const stream of [...streams]) stream.drop(topic)
      off?.()
    }
  }

  function events(request) {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        // The last frame sent per topic on this stream: an unchanged view is not sent again.
        const sent = new Map()
        const push = (topic) => {
          const provider = topics.get(topic)
          if (provider === undefined) return
          let json
          try {
            json = JSON.stringify({ [PAGE_STREAM.field.topic]: topic, [PAGE_STREAM.field.frame]: provider.frame(request.url) })
          } catch (error) {
            logger?.warn(PAGE_STREAM.log, topic, error?.code ?? error?.name)
            return
          }
          if (sent.get(topic) === json) return
          sent.set(topic, json)
          // A stream the browser already closed throws on enqueue; close it so it never breaks a listener.
          try { controller.enqueue(encoder.encode(PAGE_STREAM.sse(json))) } catch { close() }
        }
        let stream
        close = () => {
          if (!streams.delete(stream)) return
          request.signal?.removeEventListener(PAGE_STREAM.abort, close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        stream = Object.freeze({ push, drop: (topic) => sent.delete(topic), close: () => close() })
        streams.add(stream)
        request.signal?.addEventListener(PAGE_STREAM.abort, close)
        for (const topic of [...topics.keys()]) push(topic)
      },
      cancel: () => close(),
    })
    return new Response(body, { status: PAGE_STREAM.ok, headers: PAGE_STREAM.headers })
  }

  const withdraw = ctx.connection.fetch.register({ path: PAGE_STREAM.route, methods: [PAGE_STREAM.get], requestBody: PAGE_STREAM.requestBody, fetch: events })
  return Object.freeze({
    register,
    async dispose() {
      for (const stream of [...streams]) stream.close()
      await withdraw?.()
    },
  })
}
