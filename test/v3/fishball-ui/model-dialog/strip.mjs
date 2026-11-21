/**
 * UI-POLISH-F §2: the drawn status card (fishball-ui `client.strip.js`), at the component level.
 * fishball-ui's real client and its strip part run unread in the F-SETTINGS scripted page
 * (../../fishball-core/settings/page.mjs); the strip's server-sent stream is a stand-in that
 * delivers frames built by the real pure view `stripView(snapshot, lang)` (fishball-ui
 * src/status/index.js), as the strip route sends them (STRIP-SYS-01: `{lines, control, …}`), on the
 * page's one connection (STRIP_PAGE.route) under STRIP_PAGE.topic (the image-loop fix).
 * Connect / Cancel post to core's routes through the page's fetch (the world's `connect` answers).
 */
import assert from 'node:assert/strict'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { stripView } from '../../fishball-core/status/subject.mjs'
import { createWorld, loadPage, settle } from '../../fishball-core/settings/page.mjs'
import { isPageStream, pageMessage } from '../stream/event-source.mjs'
import { STRIP_PAGE } from './constants.mjs'

class FakeEventSource {
  constructor(url) { this.url = String(url); this.listeners = new Map(); this.onmessage = null }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn) }
  removeEventListener(name, fn) { const list = this.listeners.get(name) ?? []; const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1) }
  close() { this.closed = true }
  deliver(frame) {
    const event = { type: STRIP_PAGE.messageEvent, data: JSON.stringify(frame) }
    this.onmessage?.(event)
    for (const fn of [...(this.listeners.get(STRIP_PAGE.messageEvent) ?? [])]) fn(event)
  }
}

/** A status snapshot with its first line `kind` (the relayed snapshot shape; F-STATUS SNAPSHOT_KEYS). */
export const snapshotOf = (kind, { control = null, contributedTools = null } = {}) => ({
  fishball: STRIP_PAGE.on, link: null, connect: null, line: { kind, code: null }, control, guards: null, set: null, contributedTools,
})

/**
 * The Fishball page with the strip entry mounted. `show(snapshot)` sends the frame of that snapshot.
 * UI-FIX-F: `onDocument(document)` sees the page's document before any script runs.
 */
export async function stripPage(t, sdk, { lang = STRIP_PAGE.langs[0], onDocument } = {}) {
  const opened = []
  const w = createWorld({ sdk, lang })
  w.EventSource = class extends FakeEventSource { constructor(url) { super(url); opened.push(this) } }
  w.onDocument = onDocument
  const page = await loadPage(t, w)
  const entries = w.entries(STRIP_PAGE.slot).filter((e) => (e.options.id ?? e.options.key) === STRIP_PAGE.entryId)
  assert.equal(entries.length, 1, `no ${STRIP_PAGE.slot} entry ${STRIP_PAGE.entryId}: ${JSON.stringify(w.entries(STRIP_PAGE.slot).map((e) => e.options))}`)
  w.shim.mount(STRIP_PAGE.mountKey, () => w.renderEntry(entries[0], { sessionId: STRIP_PAGE.managerSession }))
  await settle()
  const tree = () => w.shim.treeOf(STRIP_PAGE.mountKey)
  const nodes = () => findAll(tree(), () => true)
  return {
    world: w, page, tree, nodes,
    async show(snapshot) {
      const streams = opened.filter((s) => isPageStream(s, w.base) && !s.closed)
      assert.ok(streams.length > 0, `the strip opened no ${STRIP_PAGE.route} stream: ${JSON.stringify(opened.map((s) => s.url))}`)
      const frame = await stripView(sdk, snapshot, lang)
      for (const s of streams) s.deliver(pageMessage(STRIP_PAGE.topic, frame))
      await settle()
      return frame
    },
    root: () => nodes().find((n) => n.props[STRIP_PAGE.hook.root] !== undefined && n.props[STRIP_PAGE.hook.root] !== false),
    byHook: (name, value) => nodes().filter((n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value))),
    text: (node) => textOf(node),
    press: (node) => page.press(node),
  }
}
