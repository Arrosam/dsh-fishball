/**
 * MULTI-3: the one place that binds the target rows to the code under test, and the sidebar page.
 *
 * - `viewModule(sdk)`: fishball-ui `src/status/index.js` (`targetsView`, `TARGET_LINE`, `STATUS_TEXT`)
 *   and `src/pairing/index.js` (`pairingView`), bound to the SDK; only exports are read.
 * - `targetView(i, overrides)` / `snapshotOf(targets, globals)`: core's `TargetView` and status
 *   snapshot as the frozen contracts shape them (targets.d.ts, ui-seam SEAM_TARGETS' comment).
 * - `sidebarPage(t, sdk, options)`: fishball-ui's real client in the F-SETTINGS scripted page
 *   (../../fishball-core/settings/page.mjs) with `<html data-fishball-page>` set, as fishball-page
 *   sets it. The winner of DSH's single slot `sidebar.workspaces` is mounted the way DSH's slot
 *   election picks it (the lowest priority among the entries), with the sidebar's owner props
 *   (`SidebarSectionOwnerProps`: wide, expandSidebar). The page's one connection is the health-aware
 *   EventSource stand-in (../stream/event-source.mjs), carrying the sidebar's frames under
 *   SIDEBAR.streamTopic and the ask cards' under ASK.eventsTopic; the target routes are the page's fetch.
 *
 * Observation is what a user meets: row buttons are the buttons carrying `aria-expanded`
 * (requirement C); one target's item is the largest subtree around its row button that holds no
 * other row button (plus the element its `aria-controls` names, if any), so details are found
 * wherever the item draws them.
 */
import assert from 'node:assert/strict'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { importBound } from '../../dsh-connector-adapter/oauth-client/subject.mjs'
import { createWorld, loadPage, settle } from '../../fishball-core/settings/page.mjs'
import { coreView } from '../pairing/subject.mjs'
import { STATE as PAIR_STATE } from '../pairing/constants.mjs'
import { eventSourceClass, isPageStream, topicView } from '../stream/event-source.mjs'
import { ASK, FIXTURE, SEAM_STATUS, SEAM_TARGETS, SIDEBAR, SUBJECT } from './targets-constants.mjs'

export async function viewModule(sdk) {
  const view = await importBound(sdk, SUBJECT.view)
  const pairing = await importBound(sdk, SUBJECT.pairing)
  for (const name of Object.values(SUBJECT.exports)) assert.notEqual(view[name], undefined, `fishball-ui src/status/index.js exports no ${name}`)
  assert.equal(typeof pairing[SUBJECT.pairingExport], 'function', 'fishball-ui src/pairing/index.js exports no pairingView')
  return { targetsView: view[SUBJECT.exports.view], TARGET_LINE: view[SUBJECT.exports.line], STATUS_TEXT: view[SUBJECT.exports.text], pairingView: pairing[SUBJECT.pairingExport] }
}

export const plain = (v) => JSON.parse(JSON.stringify(v))

/** One core `TargetView` (targets.d.ts); `name` defaults to a unique name per index. */
export function targetView(i, overrides = {}) {
  const name = Object.hasOwn(overrides, 'name') ? overrides.name : `${FIXTURE.names.plain}-${i}`
  return {
    targetId: FIXTURE.ids[i] ?? `t-fbtest${String(i).padStart(10, 'a')}`,
    endpointEpoch: FIXTURE.epoch,
    serverName: name,
    name,
    kind: SEAM_TARGETS.kind.remote,
    url: FIXTURE.url(i),
    order: i + 1,
    duplicateSuffix: null,
    state: SEAM_TARGETS.state.connected,
    connecting: false,
    link: { state: SEAM_STATUS.link.connected, code: null },
    connect: null,
    line: { kind: SEAM_STATUS.link.connected, code: null },
    control: null,
    pairing: coreView(PAIR_STATE.paired),
    identity: SEAM_TARGETS.identity.live,
    contributedTools: 3,
    removable: true,
    urlEditable: true,
    ...overrides,
  }
}

/** Core's status snapshot with the targets beside the global members (SEAM_TARGETS' comment). */
export const snapshotOf = (targets, { fishball = SEAM_STATUS.fishball.on, guards = null, set = null, brand } = {}) => ({
  fishball, guards, set, targets: { version: SEAM_TARGETS.snapshotVersion, targets }, ...(brand === undefined ? {} : { brand }),
})

/** The test process's own zone: the scripted page's `Intl` is Node's. */
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

const has = (n, name) => n.props[name] !== undefined && n.props[name] !== false
const below = (node) => (typeof node === 'string' ? [] : [node, ...(node.children ?? []).flatMap(below)])
export const isRow = (n) => n.tag === 'button' && n.props['aria-expanded'] !== undefined

/**
 * The sidebar page.
 * @param options.lang - DSH UI language.
 * @param options.mark - whether `<html data-fishball-page>` is set before the scripts load (default true).
 * @param options.navigation - provide `pluginNavigation` (default true).
 * @param options.answer - `(call) => answer | 'reject'` for a POST to a target route (default `{ok: true}`).
 * @param options.dock - also mount every `conversation.input.dock` entry for the manager session.
 * @param options.onDocument - sees the page's document before any script runs (the contrast rows).
 */
export async function sidebarPage(t, sdk, { lang = 'en', mark = true, navigation = true, answer, dock = false, onDocument } = {}) {
  const sources = eventSourceClass()
  const w = createWorld({ sdk, lang, navigation })
  w.EventSource = sources.EventSource
  w.onDocument = onDocument
  const posts = []
  const targetRoutes = new Set(Object.values(SIDEBAR.routePath))
  w.fetchOther = async (call) => {
    const at = new URL(call.url).pathname
    posts.push({ ...call, path: at, json: (() => { try { return JSON.parse(call.body) } catch { return undefined } })() })
    if (!targetRoutes.has(at)) return { status: 404, text: '' }
    return answer ? answer(call, at) : { status: SEAM_TARGETS.http.ok, json: { ok: true } }
  }
  if (mark) w.html.element.setAttribute(SIDEBAR.pageMark, '')
  const page = await loadPage(t, w)
  const sidebarEntries = () => w.entries(SIDEBAR.slot)
  /** DSH's election: the lowest priority wins a single slot (dsh-client-ui-renderer registry.d.ts). */
  const winner = () => [...sidebarEntries()].sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0]
  const keys = []
  const mountSidebar = () => {
    keys.push(FIXTURE.mountKey + 'sidebar')
    w.shim.mount(FIXTURE.mountKey + 'sidebar', () => { const e = winner(); return e ? w.renderEntry(e, { ...SIDEBAR.ownerProps, expandSidebar() {} }) : null })
  }
  mountSidebar()
  if (dock) for (const [i, entry] of w.entries('conversation.input.dock').entries()) { keys.push(FIXTURE.mountKey + 'dock' + i); w.shim.mount(FIXTURE.mountKey + 'dock' + i, () => w.renderEntry(entry, { sessionId: FIXTURE.managerSession })) }
  await settle()
  const tree = () => keys.flatMap((k) => w.shim.treeOf(k))
  const nodes = () => findAll(tree(), () => true)
  const sidebarNodes = () => findAll(w.shim.treeOf(FIXTURE.mountKey + 'sidebar'), () => true)
  /** One view of every open page connection: the sidebar's (streams) and the ask cards' (askStreams). */
  const viewOf = (topic) => () => sources.opened.filter((s) => !s.closed && isPageStream(s, w.base)).map((s) => topicView(s, topic))
  const streams = viewOf(SIDEBAR.streamTopic)
  const askStreams = viewOf(ASK.eventsTopic)
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
    const roots = w.shim.treeOf(FIXTURE.mountKey + 'sidebar')
    const path = []
    const seek = (node, trail) => { if (typeof node === 'string') return false; if (node === target) { path.push(...trail, node); return true } return (node.children ?? []).some((c) => seek(c, [...trail, node])) }
    roots.some((r) => seek(r, []))
    const top = path.find((n) => below(n).filter(isRow).length === 1) ?? target
    const own = below(top)
    const controlled = target.props['aria-controls'] ? sidebarNodes().filter((n) => n.props.id === target.props['aria-controls']).flatMap(below) : []
    return [...new Set([...own, ...controlled])]
  }
  const text = (among) => among.filter((n) => typeof n !== 'string').map((n) => (n.children ?? []).filter((c) => typeof c === 'string').join('')).join(' ')
  const handle = {
    world: w, sources, posts, nodes, sidebarNodes, rows, row, item, tree, streams, askStreams, winner, sidebarEntries,
    async deliver(frame) { const live = streams(); assert.ok(live.length > 0, `no ${SIDEBAR.streamPath} stream: ${JSON.stringify(sources.opened.map((s) => s.url))}`); for (const s of live) s.deliver(frame); await settle() },
    async fail(closed) { for (const s of streams()) s.fail({ closed }); await settle() },
    async toggle(label) { await page.press(row(label)) },
    press: (node) => page.press(node),
    /** Buttons and links under `among` whose own text is `label`. */
    control: (among, label) => among.filter((n) => (n.tag === 'button' || n.tag === 'a') && textOf(n).trim() === label),
    byHook: (name, among = nodes()) => among.filter((n) => has(n, name)),
    text,
    textOf,
    /** Every string the sidebar shows or carries in a prop (title, aria-label, href …). */
    strings(among = sidebarNodes()) { return among.flatMap((n) => [textOf(n), ...Object.values(n.props).filter((v) => typeof v === 'string')]) },
    async tick(among, on = true) {
      const box = among.find((n) => n.tag === 'input' && n.props.type === 'checkbox')
      assert.ok(box, 'no confirmation checkbox in the details')
      box.props.onChange?.({ target: { checked: on }, currentTarget: { checked: on } })
      await settle()
    },
    async setMark(on) { if (on) w.html.element.setAttribute(SIDEBAR.pageMark, ''); else w.html.element.removeAttribute(SIDEBAR.pageMark); await settle() },
    remount: async () => { w.shim.unmountRoot(FIXTURE.mountKey + 'sidebar'); keys.splice(keys.indexOf(FIXTURE.mountKey + 'sidebar'), 1); mountSidebar(); await settle() },
    settle,
  }
  return handle
}

let handles = 0
/**
 * MULTI-0's `AskCard` (ask-card.d.ts): F-ASKCARD's card shape (fishball-core/asks/world.mjs
 * `expectedCard`, MULTI-1's to change) plus the opaque `handle` and the trusted `source`. Each call
 * makes a fresh handle, so cards stay distinct.
 */
export function withSource(card, { handle, name = FIXTURE.names.plain, targetId = FIXTURE.ids[0] } = {}) {
  handles += 1
  return { ...card, handle: handle ?? `fbtest-handle-${handles}`, source: { targetId, endpointEpoch: FIXTURE.epoch, serverName: name, name } }
}
