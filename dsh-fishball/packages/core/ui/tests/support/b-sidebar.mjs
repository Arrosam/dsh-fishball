/**
 * MULTI-3: the sidebar DSH target list on fishball-ui's page (port-ui-b), over ./ui-page.mjs.
 * fishball-ui's real client runs alone in the scripted DSH page with `<html data-fishball-page>` set,
 * as fishball-page sets it. The winner of DSH's single slot `sidebar.workspaces` is mounted the way
 * DSH's slot election picks it (the lowest priority), with the sidebar's owner props
 * (`SidebarSectionOwnerProps`: wide, expandSidebar). The page's one connection is the helpers'
 * EventSource stand-in; the sidebar's frames arrive under the `strip` topic and the ask cards' under
 * `asks` (./page-stream.mjs). Core's target routes are the page's fetch (`answer`).
 *
 * Observation is what a user meets: row buttons are the buttons carrying `aria-expanded`
 * (requirement C); one target's item is the largest subtree around its row button that holds no
 * other row button (plus the element its `aria-controls` names), so details are found wherever the
 * item draws them.
 */
import assert from 'node:assert/strict'
import { findAll, textOf } from 'fishball-test-helpers/react-shim'
import { SCRIPTED } from 'fishball-test-helpers/scripted-page'
import { FIXTURE, SIDEBAR } from './b-targets.mjs'
import { isPageStream, topicView } from './page-stream.mjs'
import { uiPage } from './ui-page.mjs'

const KEY = Object.freeze({ sidebar: FIXTURE.mountKey + 'sidebar', dock: FIXTURE.mountKey + 'dock' })
const has = (n, name) => n.props[name] !== undefined && n.props[name] !== false
const below = (node) => (typeof node === 'string' ? [] : [node, ...(node.children ?? []).flatMap(below)])
export const isRow = (n) => n.tag === 'button' && n.props[SIDEBAR.rowExpanded] !== undefined
export const expanded = (n) => String(n.props[SIDEBAR.rowExpanded])
export const enabled = (n) => n.props.disabled !== true && n.props['aria-disabled'] !== true && n.props['aria-disabled'] !== 'true'
const parsed = (body) => { try { return JSON.parse(body) } catch { return undefined } }

/**
 * The sidebar page.
 * @param options.lang - DSH UI language.
 * @param options.mark - whether `<html data-fishball-page>` is set before the scripts load (default true).
 * @param options.navigation - provide `pluginNavigation` (default true).
 * @param options.answer - `(call, path) => answer | 'reject'` for a POST to a target route (default `{ok: true}`).
 * @param options.dock - also mount every `conversation.input.dock` entry for the manager session.
 * @param options.onDocument - sees the page's document before any script runs (the contrast rows).
 */
export async function sidebarPage(t, { lang = 'en', mark = true, navigation = true, answer, dock = false, onDocument } = {}) {
  const posts = []
  const targetRoutes = new Set(Object.values(SIDEBAR.routePath))
  const p = await uiPage(t, {
    lang, navigation,
    prepareWorld(world) {
      world.onDocument = onDocument
      world.fetchOther = async (call) => {
        posts.push({ ...call, json: parsed(call.body) })
        if (!targetRoutes.has(call.path)) return { status: SCRIPTED.notFound, text: '' }
        return answer ? answer(call, call.path) : { status: SCRIPTED.ok, json: { ok: true } }
      }
      if (mark) world.html.setAttribute(SIDEBAR.pageMark, '')
    },
  })
  const { world: w } = p
  const mountSidebar = () => p.mount(KEY.sidebar, SIDEBAR.slot, { ...SIDEBAR.ownerProps, expandSidebar() {} })
  await mountSidebar()
  if (dock) await p.mountAll(KEY.dock, SIDEBAR.dockSlot, { sessionId: FIXTURE.managerSession })
  const sidebarNodes = () => findAll(w.shim.treeOf(KEY.sidebar), () => true)
  const viewOf = (topic) => () => p.sources.opened.filter((s) => !s.closed && isPageStream(s, w.base)).map((s) => topicView(s, topic))
  const streams = viewOf(SIDEBAR.streamTopic)
  const rows = () => sidebarNodes().filter(isRow)
  const row = (label) => {
    // A row shows the label as one of its own text nodes (or names it): "Office-DSH-1" is not "Office-DSH-12".
    const found = rows().filter((r) => r.props['aria-label'] === label || below(r).some((n) => (n.children ?? []).some((ch) => typeof ch === 'string' && ch.trim() === label)))
    assert.equal(found.length, 1, `rows showing ${JSON.stringify(label)}: ${found.length} (rows: ${JSON.stringify(rows().map(textOf))})`)
    return found[0]
  }
  /** The nodes of one target's item: the largest subtree around its row holding no other row, plus its aria-controls element. */
  const item = (label) => {
    const target = row(label)
    const path = []
    const seek = (node, trail) => { if (typeof node === 'string') return false; if (node === target) { path.push(...trail, node); return true } return (node.children ?? []).some((c) => seek(c, [...trail, node])) }
    w.shim.treeOf(KEY.sidebar).some((r) => seek(r, []))
    const top = path.find((n) => below(n).filter(isRow).length === 1) ?? target
    const controlled = target.props['aria-controls'] ? sidebarNodes().filter((n) => n.props.id === target.props['aria-controls']).flatMap(below) : []
    return [...new Set([...below(top), ...controlled])]
  }
  /** The own text nodes of each element of `among`, joined. */
  const text = (among) => among.filter((n) => typeof n !== 'string').map((n) => (n.children ?? []).filter((c) => typeof c === 'string').join('')).join(' ')
  return {
    world: w, sources: p.sources, posts, nodes: p.nodes, sidebarNodes, rows, row, item, streams, askStreams: viewOf(SIDEBAR.askTopic),
    entries: () => w.entries(SIDEBAR.slot),
    tree: () => w.shim.treeOf(KEY.sidebar),
    async deliver(frame) { const live = streams(); assert.ok(live.length > 0, `no ${SIDEBAR.streamPath} stream: ${JSON.stringify(p.sources.opened.map((s) => s.url))}`); for (const s of live) s.deliver(frame); await p.settle() },
    async fail(closed) { for (const s of streams()) s.fail({ closed }); await p.settle() },
    async toggle(label) { await p.press(row(label)) },
    /** Open `label`'s row unless it is open (rows may open one at a time). */
    async open(label) { if (expanded(row(label)) !== 'true') await p.press(row(label)) },
    press: (node) => p.press(node),
    /** Buttons and links under `among` whose own text is `label`. */
    control: (among, label) => among.filter((n) => (n.tag === 'button' || n.tag === 'a') && textOf(n).trim() === label),
    byHook: (name, among = p.nodes()) => among.filter((n) => has(n, name)),
    text,
    textOf,
    /** Every string the sidebar shows or carries in a prop (title, aria-label, href …). */
    strings(among = sidebarNodes()) { return among.flatMap((n) => [textOf(n), ...Object.values(n.props).filter((v) => typeof v === 'string')]) },
    async tick(among, on = true) {
      const box = among.find((n) => n.tag === 'input' && n.props.type === 'checkbox')
      assert.ok(box, 'no confirmation checkbox in the details')
      box.props.onChange?.({ target: { checked: on }, currentTarget: { checked: on } })
      await p.settle()
    },
    async setMark(on) { if (on) w.html.setAttribute(SIDEBAR.pageMark, ''); else w.html.removeAttribute(SIDEBAR.pageMark); await p.settle() },
    async remount() { await p.unmount(KEY.sidebar); await mountSidebar() },
    settle: () => p.settle(),
  }
}
