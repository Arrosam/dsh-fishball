/**
 * R-FIX-FUI F3: a stand-in for the browser's `EventSource` with the health a real one has.
 * `readyState` follows the WHATWG states (CONNECTING 0, OPEN 1, CLOSED 2, also the static
 * constants); `deliver(frame)` sends one `message` event with the frame as JSON; `deliverRaw(data)`
 * sends any text (a frame the page must refuse); `fail({closed})` fires one `error` event, with
 * `readyState` CLOSED when the failure is terminal (the browser gave up) or CONNECTING when it is
 * reconnecting by itself. Both the `on<event>` property and `addEventListener` receivers are called,
 * as a browser calls them. `close()` marks it closed. Every source made is kept in `opened`.
 */
export const SOURCE_STATE = Object.freeze({ connecting: 0, open: 1, closed: 2 })

/**
 * The image-loop fix (relayed by the lead, 2026-11-22): every live view of the Fishball page arrives
 * on ONE EventSource, `api/fishball/page/events?lang=<en|zh>&tz=<IANA zone>`, as default messages
 * `{topic, frame}` whose frame is exactly what the view's old route sent. Its health is every view's.
 * The topics are the requirement's names; a view's old route is no longer opened by the page.
 */
export const PAGE_STREAM = Object.freeze({
  relative: 'api/fishball/page/events',
  path: '/api/fishball/page/events',
  param: Object.freeze({ lang: 'lang', tz: 'tz' }),
  topic: Object.freeze({ strip: 'strip', asks: 'asks', taskboard: 'fishball-taskboard' }),
})

/** One wire message of the page connection: a view's own frame under its topic. */
export const pageMessage = (topic, frame) => ({ topic, frame })

/** Whether a source is the page connection (its path, whatever its query). */
export const isPageStream = (source, base) => new URL(source.url, base).pathname === PAGE_STREAM.path

/**
 * One view of the page connection as the per-view harnesses used to see their own route's source:
 * `deliver(frame)` sends the view's frame under its topic; `deliverRaw(text)` puts the text where the
 * frame goes, so text that is not JSON makes the whole message unreadable, as it made the old frame;
 * `fail`, `url`, `closed` and `readyState` are the one connection's (its health is every view's).
 */
export function topicView(source, topic) {
  return {
    source,
    get url() { return source.url },
    get closed() { return source.closed },
    get readyState() { return source.readyState },
    deliver: (frame) => source.deliver(pageMessage(topic, frame)),
    deliverRaw: (text) => source.deliverRaw('{"topic":' + JSON.stringify(topic) + ',"frame":' + text + '}'),
    fail: (options) => source.fail(options),
  }
}
const EVENT = Object.freeze({ message: 'message', error: 'error', open: 'open' })

export function eventSourceClass() {
  const opened = []
  class FakeEventSource {
    static CONNECTING = SOURCE_STATE.connecting
    static OPEN = SOURCE_STATE.open
    static CLOSED = SOURCE_STATE.closed
    constructor(url) {
      this.url = String(url)
      this.listeners = new Map()
      this.onmessage = null
      this.onerror = null
      this.onopen = null
      this.readyState = SOURCE_STATE.connecting
      this.closed = false
      opened.push(this)
    }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn) }
    removeEventListener(name, fn) { const list = this.listeners.get(name) ?? []; const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1) }
    close() { this.closed = true; this.readyState = SOURCE_STATE.closed }
    emit(name, event) {
      this['on' + name]?.(event)
      for (const fn of [...(this.listeners.get(name) ?? [])]) fn(event)
    }
    deliverRaw(data) {
      this.readyState = SOURCE_STATE.open
      this.emit(EVENT.message, { type: EVENT.message, data })
    }
    deliver(frame) { this.deliverRaw(JSON.stringify(frame)) }
    fail({ closed = false } = {}) {
      this.readyState = closed ? SOURCE_STATE.closed : SOURCE_STATE.connecting
      this.emit(EVENT.error, { type: EVENT.error })
    }
  }
  return { EventSource: FakeEventSource, opened, live: (part) => opened.filter((s) => s.url.includes(part) && !s.closed) }
}
