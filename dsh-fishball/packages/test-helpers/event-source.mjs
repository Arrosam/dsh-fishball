/**
 * A stand-in for the browser's `EventSource` with the health a real one has, for a page run in
 * node:vm (./browser-sandbox `EventSource` option, ./scripted-page `world.EventSource`).
 *
 * `readyState` follows the WHATWG states (SOURCE_STATE; also the static CONNECTING/OPEN/CLOSED). A
 * source starts CONNECTING; `open()` makes it OPEN and fires `open`; `deliver(frame)` sends one
 * `message` event whose `data` is the frame as JSON, `deliverRaw(text)` any text, `deliverEvent(type,
 * frame)` a named event (both make it OPEN, as a message only arrives on an open stream);
 * `fail({closed})` fires one `error`, leaving it CLOSED when the failure is terminal (the browser
 * gave up) or CONNECTING when the browser reconnects by itself. `close()` (the page's) makes it
 * CLOSED and silent: nothing more is fired on a closed source. Both the `on<event>` property and
 * `addEventListener` receivers are called, as a browser calls them. Every source is kept in `opened`.
 *
 * A package whose page multiplexes several views on one stream layers its own message vocabulary on
 * top, e.g. a view that wraps each frame under its topic:
 *   const view = (source, topic) => ({ deliver: (frame) => source.deliver({ topic, frame }), fail: (o) => source.fail(o) })
 * and finds its stream with `sources.at(pathname, base)`. Such vocabularies are the package's.
 */
export const SOURCE_STATE = Object.freeze({ connecting: 0, open: 1, closed: 2 })
const EVENT = Object.freeze({ message: 'message', error: 'error', open: 'open' })

/** A fresh EventSource class and the sources it made: `{EventSource, opened, live(part), at(pathname, base)}`. */
export function eventSourceClass() {
  const opened = []
  class FakeEventSource {
    static CONNECTING = SOURCE_STATE.connecting
    static OPEN = SOURCE_STATE.open
    static CLOSED = SOURCE_STATE.closed
    constructor(url, init = {}) {
      this.url = String(url)
      this.withCredentials = Boolean(init.withCredentials)
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
      if (this.closed) return
      this['on' + name]?.(event)
      for (const fn of [...(this.listeners.get(name) ?? [])]) fn(event)
    }
    open() {
      if (this.closed) return
      this.readyState = SOURCE_STATE.open
      this.emit(EVENT.open, { type: EVENT.open })
    }
    deliverEvent(type, frame) { this.deliverRawEvent(type, JSON.stringify(frame)) }
    deliverRawEvent(type, data) {
      if (this.closed) return
      this.readyState = SOURCE_STATE.open
      this.emit(type, { type, data })
    }
    deliverRaw(data) { this.deliverRawEvent(EVENT.message, data) }
    deliver(frame) { this.deliverRaw(JSON.stringify(frame)) }
    fail({ closed = false } = {}) {
      if (this.closed) return
      this.readyState = closed ? SOURCE_STATE.closed : SOURCE_STATE.connecting
      this.emit(EVENT.error, { type: EVENT.error })
    }
  }
  return {
    EventSource: FakeEventSource,
    opened,
    /** Sources not closed by the page whose URL contains `part`. */
    live: (part) => opened.filter((s) => s.url.includes(part) && !s.closed),
    /** Sources not closed by the page whose URL, resolved against `base`, has `pathname` (any query). */
    at: (pathname, base) => opened.filter((s) => !s.closed && new URL(s.url, base).pathname === pathname),
  }
}
