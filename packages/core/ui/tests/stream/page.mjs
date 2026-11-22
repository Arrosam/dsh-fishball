/**
 * R-FIX-FUI F3 / F9: every fishball-ui `conversation.input.dock` entry mounted for Fishball's own
 * conversation in fishball-ui's page world (../support/ui-page.mjs), over the page's one connection
 * (../support/page-stream.mjs): a case fails it and sees what the ask cards draw, and sees which
 * streams a Reconnect reopens.
 */
import { PAGE_STREAM } from '../support/page-stream.mjs'
import { ASK_FIXTURE } from '../support/ask-card.mjs'
import { uiPage } from '../support/ui-page.mjs'
import { DOCK } from './constants.mjs'

/**
 * @param options.lang - the DSH UI locale.
 * @param options.onSandbox - sees the page realm before any script runs (F9 forces its default locale).
 */
export async function dockPage(t, { lang = 'en', onSandbox } = {}) {
  const p = await uiPage(t, { lang, prepareWorld: (w) => { w.onSandbox = onSandbox } })
  const owner = { sessionId: ASK_FIXTURE.managerSession }
  const mount = () => p.mountAll(DOCK.mountKey, DOCK.slot, owner)
  await mount()
  return {
    ...p,
    /** The asks topic on every open connection, and the connection's health. */
    deliverAsks: (frame) => p.deliver(PAGE_STREAM.topic.asks, frame),
    deliverAsksRaw: (text) => p.deliverRaw(PAGE_STREAM.topic.asks, text),
    root: () => p.nodes().find((n) => n.props[DOCK.root] !== undefined && n.props[DOCK.root] !== false),
    remount: mount,
    unmountDock: () => p.unmount(DOCK.mountKey),
  }
}
