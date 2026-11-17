/**
 * The drawn pairing card (R-FIX-FUI F1, F3), at the component level: fishball-ui's real client and
 * its parts run unread in the F-SETTINGS scripted page (../../fishball-core/settings/page.mjs); the
 * stream is the health-aware EventSource stand-in (../stream/event-source.mjs) fed frames built by the
 * real pure `pairingView`. The choose route is the page's fetch (`world.fetchOther`).
 */
import assert from 'node:assert/strict'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { createWorld, loadPage, settle } from '../../fishball-core/settings/page.mjs'
import { eventSourceClass } from '../stream/event-source.mjs'
import { FIXTURE, HOOK, ROUTE } from './constants.mjs'

/**
 * @param options.lang - the DSH UI locale id (`en`, `zh`, `zh-CN`, …).
 * @param options.choose - `(call) => answer | 'reject'` for a POST to the choose route.
 */
export async function pairingPage(t, sdk, { lang = 'en', choose } = {}) {
  const sources = eventSourceClass()
  const w = createWorld({ sdk, lang })
  w.EventSource = sources.EventSource
  const posts = []
  w.fetchOther = async (call) => {
    if (call.url !== new URL(ROUTE.relativeChoose, w.base).href) return { status: 404, text: '' }
    posts.push(call)
    return choose ? choose(call) : { status: ROUTE.ok, json: { ok: true } }
  }
  const page = await loadPage(t, w)
  const docks = w.entries(HOOK.slot)
  assert.ok(docks.length > 0, `no ${HOOK.slot} entry`)
  const mount = () => { for (const [i, entry] of docks.entries()) w.shim.mount(FIXTURE.mountKey + i, () => w.renderEntry(entry, { sessionId: FIXTURE.managerSession })) }
  mount()
  await settle()
  const tree = () => docks.flatMap((_e, i) => w.shim.treeOf(FIXTURE.mountKey + i))
  const nodes = () => findAll(tree(), () => true)
  const has = (n, name) => n.props[name] !== undefined && n.props[name] !== false
  const handle = {
    world: w, sources, posts, nodes,
    /** The open streams of the pairing route. */
    streams: () => sources.live(ROUTE.relativeStream).filter((s) => !s.url.includes(ROUTE.relativeChoose)),
    stream() { const [s] = handle.streams().slice(-1); assert.ok(s, `no ${ROUTE.relativeStream} stream: ${JSON.stringify(sources.opened.map((x) => x.url))}`); return s },
    async show(frame) { handle.stream().deliver(frame); await settle() },
    root: () => nodes().find((n) => has(n, HOOK.root)),
    byHook: (name, value) => nodes().filter((n) => has(n, name) && (value === undefined || String(n.props[name]) === String(value))),
    choice: (choice) => nodes().find((n) => n.tag === 'button' && String(n.props[HOOK.choice]) === choice),
    /** The confirm checkbox input: the one inside the `[data-fishball-pairing-confirm]` element, or that element itself. */
    confirmBox() {
      const [holder] = handle.byHook(HOOK.confirm)
      if (!holder) return undefined
      return holder.tag === 'input' ? holder : findAll([holder], (n) => n.tag === 'input' && n.props.type === 'checkbox')[0]
    },
    async tick(on = true) {
      const box = handle.confirmBox()
      assert.ok(box, 'no confirm checkbox')
      box.props.onChange?.({ target: { checked: on }, currentTarget: { checked: on } })
      await settle()
    },
    press: (node) => page.press(node),
    text: () => tree().map(textOf).join(' '),
    textOf,
    async unmount() { for (const [i] of docks.entries()) w.shim.unmountRoot(FIXTURE.mountKey + i); await settle() },
  }
  return handle
}
