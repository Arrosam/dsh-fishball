/**
 * The drawn ask card (F-FIX card detail; the user, 2026-11-17: "Show arguments and reason"), at the
 * component level: fishball-ui's real `client.js` and its `client.asks.js` part, run unread in the
 * F-SETTINGS scripted page (../settings/page.mjs), with the card stream fed by a stand-in
 * `EventSource` that delivers the frames the events route sends (`{managerSessionId, cards}`), on the
 * page's one connection (RENDER.eventsPath) under RENDER.topic since the image-loop fix.
 *
 * Observation is what a user sees: the text of the rendered tree, each element's own text nodes
 * (so markup in a value is seen as text, not as elements), and the buttons with their labels.
 * Nothing of the chunk is read.
 */
import assert from 'node:assert/strict'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { createWorld, loadPage, settle } from '../settings/page.mjs'
import { isPageStream, pageMessage } from '../../fishball-ui/stream/event-source.mjs'
import { RENDER } from './constants.mjs'

/** A server-sent stream the page opens; `deliver(frame)` sends one `message` event. */
class FakeEventSource {
  constructor(url) {
    this.url = String(url)
    this.listeners = new Map()
    this.onmessage = null
  }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn) }
  removeEventListener(name, fn) { const list = this.listeners.get(name) ?? []; const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1) }
  close() { this.closed = true }
  deliver(frame) {
    const event = { type: RENDER.messageEvent, data: JSON.stringify(frame) }
    this.onmessage?.(event)
    for (const fn of [...(this.listeners.get(RENDER.messageEvent) ?? [])]) fn(event)
  }
}

/**
 * A Fishball page with the card dock mounted for Fishball's own conversation. `show(cards)` sends
 * one frame and settles; the handle reads the rendered card of one approvalId.
 * UI-FIX-F: `lang` picks the page language (default en) and `onDocument(document)` sees the page's
 * document before any script runs (the contrast rows collect the mounted style sheets).
 */
export async function cardPage(t, sdk, { lang, onDocument } = {}) {
  const opened = []
  const Source = class extends FakeEventSource { constructor(url) { super(url); opened.push(this) } }
  const w = createWorld({ sdk, lang })
  w.EventSource = Source
  w.onDocument = onDocument
  await loadPage(t, w)
  const docks = w.entries(RENDER.slot)
  assert.ok(docks.length > 0, `no entry in ${RENDER.slot}: fishball-ui's card dock did not register`)
  for (const [i, entry] of docks.entries()) w.shim.mount(RENDER.mountKey + i, () => w.renderEntry(entry, { sessionId: RENDER.managerSession }))
  await settle()
  const tree = () => docks.flatMap((_e, i) => w.shim.treeOf(RENDER.mountKey + i))
  const nodes = () => findAll(tree(), () => true)
  return {
    world: w,
    async show(cards) {
      const streams = opened.filter((s) => isPageStream(s, w.base) && !s.closed)
      assert.ok(streams.length > 0, `the page opened no ${RENDER.eventsPath} stream: ${JSON.stringify(opened.map((s) => s.url))}`)
      for (const s of streams) s.deliver(pageMessage(RENDER.topic, { managerSessionId: RENDER.managerSession, cards }))
      await settle()
    },
    text: () => tree().map(textOf).join(RENDER.join),
    /** Every element in the rendered tree (a value's markup, if interpreted, would appear here). */
    tags: () => nodes().map((n) => n.tag),
    /** The labels of the rendered buttons. */
    buttons: () => nodes().filter((n) => n.tag === RENDER.button).map((n) => textOf(n).trim()),
    /** Every plain string child, as the page shows it. */
    strings: () => nodes().flatMap((n) => (n.children ?? []).filter((c) => typeof c === 'string')),
  }
}
