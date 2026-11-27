/**
 * The fishball-taskboard view harness. Two observation levels over the SAME rendered tab:
 * - scripted (structure and interaction): fishball-taskboard's real browser half (client.js) ALONE in
 *   fishball-test-helpers/scripted-page, with the right sidebar's two services recorded and one
 *   fishball-test-helpers/event-source stand-in for the stream the tab opens. No fishball-ui is on the
 *   page, so the tab reads its own route (`/api/fishball-taskboard/events`, the standalone path of
 *   docs/plugins/fishball-taskboard.md); board frames are delivered on that stream, presses call the
 *   rendered element's own handlers, requests are the page's recorded fetches;
 * - rendered (layout and colour): the drawn tree written out as HTML in fishball-test-helpers/browser
 *   `documentOf` (DSH's page styles, DSH's real theme sheets, then the `<style>` sheets the tab
 *   itself mounted in the page's document), laid out in a real headless Chromium (`measure`) inside
 *   a tab wrapper of a fixed width; light is `body`, dark `body[data-ds-dark-theme]`.
 * DSH's icons, drawn by the scripted page's stand-in as a bare <svg>, are written with DSH's own
 * default size (dshIconSize), as the real components render them.
 * Nothing of the implementation is read: the hooks are the spec's public markup.
 */
import fs from 'node:fs'
import path from 'node:path'
import { documentOf, measure } from 'fishball-test-helpers/browser'
import { STAND_IN, frontendAssets } from 'fishball-test-helpers/dsh-primitives'
import { eventSourceClass } from 'fishball-test-helpers/event-source'
import { findAll, textOf } from 'fishball-test-helpers/react-shim'
import { createWorld, loadPage } from 'fishball-test-helpers/scripted-page'
import { BOUND, FIXTURE, HARNESS, HOOK, RIGHT_SIDEBAR, STATUS, TASKBOARD } from './constants.mjs'

// ------------------------------------------------------------------------------- board data

/**
 * One task (test data). `n` names it (id and default title); options: parent (n of the parent),
 * status, progress, note, title.
 */
export function task(n, { parent = null, status = STATUS.todo, progress = 0, note = '', title = FIXTURE.title(n) } = {}) {
  return { id: FIXTURE.id(n), parentId: parent === null ? null : FIXTURE.id(parent), title, note, status, progress, createdAt: 1, updatedAt: 1 }
}
export const memo = (n, text) => ({ id: FIXTURE.memoId(n), text, createdAt: 1, updatedAt: 1 })
/** A board document as the stream sends it: `unfinished` counts open tasks at every depth. */
export function board(tasks, memos = [], revision = 1) {
  return { revision, unfinished: tasks.filter((t) => STATUS.open.includes(t.status)).length, tasks, memos }
}

// ------------------------------------------------------------------------------- the tab

const has = (n, name, value) => n.props?.[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value))
const isRow = (n) => n.tag === 'li' && has(n, HOOK.task)
/** Every element below `node` that is not inside a nested task row (the row's own parts). */
export function own(node) {
  const out = []
  const visit = (n) => { for (const c of n.children ?? []) { if (typeof c === 'string') continue; out.push(c); if (!isRow(c)) visit(c) } }
  visit(node)
  return out
}
/** The row's own text (its nested rows' text excluded). */
export function ownText(node) {
  const visit = (n) => (n.children ?? []).map((c) => (typeof c === 'string' ? c : isRow(c) ? '' : visit(c))).join('')
  return visit(node)
}

/** The right sidebar's controller and tab-type registry, recorded (the browser half injects both). */
function rightSidebar(world) {
  world.tabTypes = []
  return {
    [RIGHT_SIDEBAR.controller]: { openTab() {}, openResource() {} },
    [RIGHT_SIDEBAR.tabs]: { register(definition) { world.tabTypes.push(definition); return () => {} } },
  }
}

/** One right-sidebar tab's information as `useTabInfo()` answers it (dsh-client-ui-sidebar-right SidebarRightTabInfo). */
function tabInfo(React, n) {
  const id = FIXTURE.tabId(n)
  const info = {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: id + '-pane', isFloating: false },
    tab: {
      id, kind: TASKBOARD.moduleId, contentId: id + '-content', visible: true,
      navigation: { address: id + '-content', params: undefined, revision: 0 },
      signal: new AbortController().signal,
      actions: { bindCommands: () => () => {}, openResource() {}, openTab() {}, close() {} },
    },
  }
  return () => React.useSyncExternalStore(() => () => {}, () => info)
}

/**
 * The Task board tab, mounted, in the scripted page.
 * @param options.lang - DSH UI language (en).
 * @param options.answer - `(call) => {status, json}` for the page's other requests (the save route).
 */
export async function boardTab(t, { lang = 'en', answer } = {}) {
  const sources = eventSourceClass()
  const answers = { next: answer ?? (() => ({ status: HARNESS.notFound, text: '' })) }
  const w = createWorld({ clients: [{ id: TASKBOARD.moduleId, file: TASKBOARD.client }], lang })
  Object.assign(w.services, rightSidebar(w))
  w.provided.push(RIGHT_SIDEBAR.controller, RIGHT_SIDEBAR.tabs)
  w.EventSource = sources.EventSource
  w.fetchOther = (call) => answers.next(call)
  const page = await loadPage(t, w)
  let mounts = 0
  async function mountBoard() {
    const body = w.entries(TASKBOARD.bodySlot).find((e) => e.options.key === TASKBOARD.moduleId)
    if (!body) throw new Error('fishball-taskboard registered no ' + TASKBOARD.bodySlot + ' body')
    await page.mount(FIXTURE.mountKey, () => w.renderEntry(body, { useTabInfo: tabInfo(w.React, ++mounts) }))
  }
  await mountBoard()
  const tree = () => w.shim.treeOf(FIXTURE.mountKey)
  const all = () => findAll(tree(), () => true)
  const tab = {
    page, world: w, sources,
    tree, all,
    text: () => tree().map(textOf).join(' '),
    /** Set the answer of later requests. */
    answer(fn) { answers.next = fn },
    /** Requests the tab made besides its stream (the save route). */
    requests: () => w.fetches.map((f) => ({ ...f })),
    /** One board frame on the tab's own stream (every open source to its events route). */
    async deliver(frame) {
      const open = sources.at(TASKBOARD.events, w.base)
      if (open.length === 0) throw new Error('the tab opened no stream to ' + TASKBOARD.events + '; sources: ' + JSON.stringify(sources.opened.map((s) => s.url)))
      for (const s of open) s.deliver(frame)
      await page.settled()
    },
    /** The `<style>` sheets the tab mounted in the page's document (and adopted sheets), in order. */
    sheets: () => w.page.styleTexts(),
    root: () => all().find((n) => has(n, HOOK.root)),
    mode: () => tab.root()?.props[HOOK.root],
    rows: (nodes = tree()) => findAll(nodes, isRow),
    row: (n, nodes = tree()) => tab.rows(nodes).find((r) => r.props[HOOK.task] === FIXTURE.id(n)),
    /** The row ids in document order. */
    rowIds: (nodes = tree()) => tab.rows(nodes).map((r) => r.props[HOOK.task]),
    byAttr: (name, value, nodes = tree()) => findAll(nodes, (n) => has(n, name, value)),
    buttons: (nodes = tree()) => findAll(nodes, (n) => n.tag === 'button'),
    /** A button whose text or aria-label is `label`. */
    button: (label, nodes = tree()) => tab.buttons(nodes).find((b) => textOf(b).trim() === label || b.props['aria-label'] === label),
    async press(node) {
      if (!node) throw new Error('nothing to press')
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await page.settled()
    },
    async change(node, value) {
      if (!node) throw new Error('nothing to change')
      const target = { value, checked: value }
      node.props.onChange?.({ target, currentTarget: target, preventDefault() {} })
      await page.settled()
    },
    async remount() { await page.unmount(FIXTURE.mountKey); await mountBoard() },
    /** <html data-fishball-page-brand> on the scripted page (V2). */
    setBrand(value) { if (value === null) w.html.removeAttribute(HOOK.brandAttr); else w.html.setAttribute(HOOK.brandAttr, value) },
  }
  return tab
}

// ------------------------------------------------------------------------------- rendered

/** CSS properties React writes without a unit (React's unitless list, the ones a layout uses). */
const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'lineHeight', 'fontWeight', 'zoom', 'lineClamp', 'WebkitLineClamp', 'aspectRatio', 'columnCount', 'gridRow', 'gridColumn', 'orphans', 'widows', 'tabSize'])
// ------------------------------------------------------------------------------- DSH's icon sizes

const ICON = Object.freeze({
  prefix: 'Icon',
  bundle: /^index-[\w-]+\.js$/,
  exported: (name) => new RegExp('[{,]' + name + ':([\\w$]+)[,}]'),
  escape: (local) => local.replace(/\$/g, '\\$'),
})
const iconCache = new Map()
/**
 * DSH's own default size of icon `name` on the current DSH: `{width, height}` in CSS px, as its real
 * component renders `<svg width height>` when given no size. Read from the current DSH's shipped frontend
 * bundle, which builds icons in one of two ways:
 * - 0.2.2-rc.x: `local=M("<key>","<weight>")`, sized by the table entry `"<key>":{size:N, aspect?:[a,b]}`;
 * - 0.2.1-rc.x: `local=e=>jsx(Inner,…)`, `Inner=({size:e=N,…})`.
 * Why: the scripted Icon stand-in (fishball-test-helpers/dsh-primitives) draws a bare `<svg>`, which Chromium lays
 * out at its 300×150 default, so without this the rendered rows would measure an artefact of the
 * harness. Limitation: the stand-in drops a `size` prop the tab may pass, so the default is used.
 */
function dshIconSize(name) {
  if (iconCache.has(name)) return iconCache.get(name)
  const dir = frontendAssets()
  const source = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => ICON.bundle.test(f))), 'utf8')
  const local = source.match(ICON.exported(name))?.[1]
  if (!local) throw new Error(`the current DSH's bundle exports no ${name}`)
  const def = source.slice(source.search(new RegExp('[,;\\s]' + ICON.escape(local) + '=')), undefined).slice(0, 200)
  let size
  const table = def.match(/=M\("([^"]+)"/)
  if (table) {
    const entry = source.slice(source.indexOf('"' + table[1] + '":{'), undefined).slice(0, 300)
    const n = Number(entry.match(/size:(\d+)/)?.[1])
    const aspect = entry.match(/^[^}]*?aspect:\[(\d+),(\d+)\]/)
    size = { width: aspect ? (n * aspect[1]) / aspect[2] : n, height: n }
  } else {
    const inner = def.match(/jsxs?\(([\w$]+),/)?.[1]
    const at = inner && source.search(new RegExp('[,;\\s]' + ICON.escape(inner) + '=\\(\\{size:\\w=(\\d+)'))
    const n = at > 0 ? Number(source.slice(at).match(/size:\w=(\d+)/)[1]) : NaN
    size = { width: n, height: n }
  }
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) throw new Error(`no default size for ${name} in the current DSH's bundle`)
  iconCache.set(name, size)
  return size
}

const STRINGIFIED = /^(aria|data)-/
/**
 * The drawn tree as React DOM writes it, so the written HTML matches what a browser holds: a
 * numeric style gets `px` unless the property is unitless, and a boolean `aria-*` / `data-*` prop
 * is written as the string "true" / "false" (React stringifies those; contrast's htmlOf alone would
 * drop a false one and write a true one bare).
 */
function reactStyled(nodes) {
  return nodes.map((n) => {
    if (typeof n === 'string') return n
    const props = Object.fromEntries(Object.entries(n.props ?? {}).map(([k, v]) => [k, STRINGIFIED.test(k) && typeof v === 'boolean' ? String(v) : v]))
    const icon = n.tag === 'svg' && String(props[STAND_IN.primitive] ?? '').startsWith(ICON.prefix) ? props[STAND_IN.primitive] : null
    if (icon && props.width === undefined) Object.assign(props, dshIconSize(icon))
    const style = props.style
    if (style && typeof style === 'object') props.style = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => [k, typeof v === 'number' && v !== 0 && !UNITLESS.has(k) ? v + 'px' : v]))
    return { ...n, props, children: reactStyled(n.children ?? []) }
  })
}

/**
 * Lay the tab out in Chromium and run `probe` (a function's source) on it with `arg`.
 * The drawn tree sits in a test-owned wrapper `[data-fbtest-tab]` of `width` CSS px (the right
 * sidebar's tab body); `arg.htmlAttrs` are set on <html> before measuring.
 */
export async function rendered(tab, { theme, width = BOUND.tabPx, probe, arg = {} }) {
  const wrapper = { tag: 'div', props: { [FIXTURE.tabAttr]: '', style: { width: width + 'px', height: '100vh', overflow: 'hidden' } }, children: reactStyled(tab.tree()) }
  const html = documentOf({ tree: [wrapper], sheets: tab.sheets(), dark: theme.dark })
  return measure(html, probe, arg, { width: width + BOUND.tabPx, height: HARNESS.viewportHeight })
}

/**
 * Page-side probe for B1 / V2: every open row's own progress bar (not a nested row's). Returns per
 * row its id, status, aria values, the track's and the fill's rendered box and background colour,
 * and resolved token colours (`arg.tokens`) as the track's parent computes them.
 */
export const BAR_PROBE = String(function probe(arg) {
  for (const [k, v] of Object.entries(arg.htmlAttrs ?? {})) document.documentElement.setAttribute(k, v)
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
  const rows = [...document.querySelectorAll('li[data-fishball-task]')]
  const out = []
  for (const row of rows) {
    const bars = [...row.querySelectorAll('[role=progressbar]')].filter((b) => b.closest('li[data-fishball-task]') === row && !b.hasAttribute('data-fishball-overall'))
    const bar = bars[0]
    const fill = bar?.firstElementChild ?? null
    out.push({
      id: row.getAttribute('data-fishball-task'), status: row.getAttribute('data-status'), bars: bars.length,
      now: bar?.getAttribute('aria-valuenow') ?? null, min: bar?.getAttribute('aria-valuemin') ?? null, max: bar?.getAttribute('aria-valuemax') ?? null,
      track: bar ? { ...box(bar), bg: getComputedStyle(bar).backgroundColor } : null,
      fill: fill ? { ...box(fill), bg: getComputedStyle(fill).backgroundColor } : null,
    })
  }
  const tokens = {}
  const host = document.querySelector('[data-fishball-taskboard]') ?? document.body
  for (const token of arg.tokens ?? []) {
    const el = document.createElement('span'); el.style.color = 'var(' + token + ')'; host.appendChild(el)
    tokens[token] = getComputedStyle(el).color; el.remove()
  }
  return { rows: out, tokens }
})

/**
 * Page-side probe for the other rendered rows. `arg.targets`: {key: {selector, row?}}: the first
 * element matching `selector` (when `row` names a task id, the first one whose own task row is that
 * row, so a nested row's part is never taken). Returns per key its box, the computed colours, borders
 * and shadow, its scroll and client widths, and its first element child's box and background; and
 * resolved `arg.tokens` colours.
 */
export const STYLE_PROBE = String(function probe(arg) {
  for (const [k, v] of Object.entries(arg.htmlAttrs ?? {})) document.documentElement.setAttribute(k, v)
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
  const out = {}
  for (const [key, target] of Object.entries(arg.targets ?? {})) {
    const rowOf = (el) => el.closest('li[data-fishball-task]')
    const el = [...document.querySelectorAll(target.selector)].find((e) => !target.row || rowOf(e)?.getAttribute('data-fishball-task') === target.row)
    if (!el) { out[key] = null; continue }
    const s = getComputedStyle(el)
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({ side, width: parseFloat(s['border' + side + 'Width']), style: s['border' + side + 'Style'], colour: s['border' + side + 'Color'] }))
    const child = el.firstElementChild
    out[key] = {
      box: box(el), color: s.color, bg: s.backgroundColor, boxShadow: s.boxShadow, sides,
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      child: child ? { box: box(child), bg: getComputedStyle(child).backgroundColor } : null,
    }
  }
  const tokens = {}
  const host = document.querySelector('[data-fishball-taskboard]') ?? document.body
  for (const token of arg.tokens ?? []) {
    const el = document.createElement('span'); el.style.color = 'var(' + token + ')'; host.appendChild(el)
    tokens[token] = getComputedStyle(el).color; el.remove()
  }
  return { targets: out, tokens }
})