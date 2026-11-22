/**
 * The fishball-taskboard.view harness. Two observation levels over the SAME rendered tab:
 * - scripted (structure and interaction): fishball-taskboard's real browser half alone in the
 *   F-SETTINGS scripted page with its React shim (fishball-ui.connections `boardOnlyPage`: no
 *   fishball-ui, so the tab reads its own stream stand-in); board frames are delivered on that
 *   stream, presses call the rendered element's own handlers, requests are the page's recorded
 *   fetches;
 * - rendered (layout and colour): the drawn tree written out as HTML in the contrast suite's full
 *   document (DSH's page styles, DSH's real theme sheets, then the `<style>` sheets the tab itself
 *   mounted), laid out in a real headless Chromium (fishball-ui.contrast `measure`) inside a tab
 *   wrapper of a fixed width; light is `body`, dark `body[data-ds-dark-theme]`.
 * DSH's icons, drawn by the scripted page's stand-in as a bare <svg>, are written with DSH's own
 * default size (dshIconSize), as the real components render them.
 * Nothing of the implementation is read: the hooks are the spec's public markup.
 */
import fs from 'node:fs'
import path from 'node:path'
import { findAll, textOf } from '../../support/rp-recommend.mjs'
import { frontendAssetsOf } from '../fishball-core/settings/constants.mjs'
import { STAND_IN } from '../fishball-core/settings/primitives.mjs'
import { boardOnlyPage } from '../fishball-ui/connections/page.mjs'
import { documentOf, measure, sheetCollector } from '../fishball-ui/contrast/page.mjs'
import { BOUND, FIXTURE, HOOK, STATUS } from './constants.mjs'

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

/**
 * The Task board tab, mounted, in the scripted page.
 * @param options.lang - DSH UI language (en).
 * @param options.answer - `(call) => {status, json}` for the page's other requests (the save route).
 */
export async function boardTab(t, sdk, { lang = 'en', answer } = {}) {
  const sheets = sheetCollector()
  const answers = { next: answer ?? (() => ({ status: 404, text: '' })) }
  const p = await boardOnlyPage(t, sdk, { lang, prepareWorld: (w) => { w.onDocument = sheets.onDocument; w.fetchOther = (call) => answers.next(call) } })
  await p.mountBoard(0)
  const w = p.world
  const tree = () => w.shim.treeOf(FIXTURE.mountKey)
  const all = () => findAll(tree(), () => true)
  const tab = {
    page: p, world: w, sheets,
    tree, all,
    text: () => tree().map(textOf).join(' '),
    /** Set the answer of later requests. */
    answer(fn) { answers.next = fn },
    /** Requests the tab made besides its stream (the save route). */
    requests: () => w.fetches.map((f) => ({ ...f })),
    async deliver(frame) { for (const s of p.sources.opened.filter((x) => !x.closed)) s.deliver(frame); await p.settle() },
    root: () => all().find((n) => has(n, HOOK.root)),
    mode: () => tab.root()?.props[HOOK.root],
    rows: (nodes = tree()) => findAll(nodes, isRow),
    row: (n, nodes = tree()) => tab.rows(nodes).find((r) => r.props[HOOK.task] === FIXTURE.id(n)),
    /** The row ids in document order as task numbers' ids. */
    rowIds: (nodes = tree()) => tab.rows(nodes).map((r) => r.props[HOOK.task]),
    byAttr: (name, value, nodes = tree()) => findAll(nodes, (n) => has(n, name, value)),
    buttons: (nodes = tree()) => findAll(nodes, (n) => n.tag === 'button'),
    /** A button whose text or aria-label is `label`. */
    button: (label, nodes = tree()) => tab.buttons(nodes).find((b) => textOf(b).trim() === label || b.props['aria-label'] === label),
    async press(node) {
      if (!node) throw new Error('nothing to press')
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await p.settle()
    },
    async change(node, value) {
      if (!node) throw new Error('nothing to change')
      const target = { value, checked: value }
      node.props.onChange?.({ target, currentTarget: target, preventDefault() {} })
      await p.settle()
    },
    async remount() { await p.unmountBoard(0); await p.mountBoard(0) },
    /** <html data-fishball-page-brand> on the scripted page (V2). */
    setBrand(value) { if (value === null) w.html.element.removeAttribute(HOOK.brandAttr); else w.html.element.setAttribute(HOOK.brandAttr, value) },
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
 * DSH's own default size of icon `name` on SDK `sdk`: `{width, height}` in CSS px, as its real
 * component renders `<svg width height>` when given no size. Read from the SDK's shipped frontend
 * bundle, which builds icons in one of two ways:
 * - 0.2.2-rc.x: `local=M("<key>","<weight>")`, sized by the table entry `"<key>":{size:N, aspect?:[a,b]}`;
 * - 0.2.1-rc.x: `local=e=>jsx(Inner,…)`, `Inner=({size:e=N,…})`.
 * Why: the scripted Icon stand-in (settings/primitives.mjs) draws a bare `<svg>`, which Chromium lays
 * out at its 300×150 default, so without this the rendered rows would measure an artefact of the
 * harness. Limitation: the stand-in drops a `size` prop the tab may pass, so the default is used.
 */
function dshIconSize(sdk, name) {
  const key = sdk + ':' + name
  if (iconCache.has(key)) return iconCache.get(key)
  const dir = frontendAssetsOf(sdk)
  const source = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => ICON.bundle.test(f))), 'utf8')
  const local = source.match(ICON.exported(name))?.[1]
  if (!local) throw new Error(`the SDK ${sdk} bundle exports no ${name}`)
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
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) throw new Error(`no default size for ${name} in the SDK ${sdk} bundle`)
  iconCache.set(key, size)
  return size
}

const STRINGIFIED = /^(aria|data)-/
/**
 * The drawn tree as React DOM writes it, so the written HTML matches what a browser holds: a
 * numeric style gets `px` unless the property is unitless, and a boolean `aria-*` / `data-*` prop
 * is written as the string "true" / "false" (React stringifies those; contrast's htmlOf alone would
 * drop a false one and write a true one bare).
 */
function reactStyled(nodes, sdk) {
  return nodes.map((n) => {
    if (typeof n === 'string') return n
    const props = Object.fromEntries(Object.entries(n.props ?? {}).map(([k, v]) => [k, STRINGIFIED.test(k) && typeof v === 'boolean' ? String(v) : v]))
    const icon = n.tag === 'svg' && String(props[STAND_IN.primitive] ?? '').startsWith(ICON.prefix) ? props[STAND_IN.primitive] : null
    if (icon && props.width === undefined) Object.assign(props, dshIconSize(sdk, icon))
    const style = props.style
    if (style && typeof style === 'object') props.style = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => [k, typeof v === 'number' && v !== 0 && !UNITLESS.has(k) ? v + 'px' : v]))
    return { ...n, props, children: reactStyled(n.children ?? [], sdk) }
  })
}

/**
 * Lay the tab out in Chromium and run `probe` (a function's source) on it with `arg`.
 * The drawn tree sits in a test-owned wrapper `[data-fbtest-tab]` of `width` CSS px (the right
 * sidebar's tab body); `arg.htmlAttrs` are set on <html> before measuring.
 */
export async function rendered(tab, sdk, { theme, width = BOUND.tabPx, probe, arg = {} }) {
  const wrapper = { tag: 'div', props: { [FIXTURE.tabAttr]: '', style: { width: width + 'px', height: '100vh', overflow: 'hidden' } }, children: reactStyled(tab.tree(), sdk) }
  const html = documentOf(sdk, { tree: [wrapper], sheets: tab.sheets.live(), theme })
  return measure(html, probe, arg, { width: width + BOUND.tabPx, height: 900 })
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
