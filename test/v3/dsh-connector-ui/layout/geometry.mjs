/**
 * Layout measurement for the UI-FIX-D rows: a page-side toolkit (installed into the page on each
 * measure) and the node-side box arithmetic the cases assert with. Boxes are viewport CSS pixels
 * {left, top, right, bottom, width, height}.
 *
 * "Painted" boxes judge overlap on what a user sees: an element that clips (overflow other than
 * visible, e.g. an ellipsis) paints inside its own box; one that does not clip paints its text
 * wherever the text runs, so its glyph runs join its box. Either is then cut by every clipping
 * ancestor (DSH clips and fades its header's actions area), and a fully clipped element paints
 * nothing (null).
 */
import { PX } from './constants.mjs'

const INSTALL = `(() => {
  if (window.__uifd) return window.__uifd
  const plain = (b) => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height })
  const make = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top })
  const union = (a, b) => make(Math.min(a.left, b.left), Math.min(a.top, b.top), Math.max(a.right, b.right), Math.max(a.bottom, b.bottom))
  const intersect = (a, b) => { const r = make(Math.max(a.left, b.left), Math.max(a.top, b.top), Math.min(a.right, b.right), Math.min(a.bottom, b.bottom)); return r.width > 0 && r.height > 0 ? r : null }
  const box = (el) => plain(el.getBoundingClientRect())
  const style = (el) => getComputedStyle(el)
  const shown = (el) => { if (!el || !el.isConnected) return false; const b = el.getBoundingClientRect(); const s = style(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const clips = (el) => style(el).overflowX !== 'visible'
  /** rect cut by every clipping element from 'from' up to (and excluding) 'stop'. */
  const cut = (rect, from, stop = null) => { let r = rect; for (let at = from; at && at !== stop && r; at = at.parentElement) if (at instanceof Element && clips(at)) r = intersect(r, box(at)); return r }
  /** Glyph runs (text nodes only: an icon is not text); cut by clipping elements inside el when clipped is true. */
  const textRects = (el, clipped = true) => {
    const out = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const raw of range.getClientRects()) {
        if (raw.width <= 0 || raw.height <= 0) continue
        const r = clipped ? cut(plain(raw), node.parentElement, el.parentElement) : plain(raw)
        if (r) out.push(r)
      }
    }
    return out
  }
  const painted = (el) => { if (!shown(el)) return null; const own = box(el); const base = clips(el) ? own : textRects(el).reduce(union, own); return cut(base, el.parentElement) }
  /** Text lines: glyph runs whose vertical centres differ by more than half the smallest run height start a new line. */
  const lines = (el) => {
    const rects = textRects(el, false)
    if (rects.length === 0) return 0
    const half = Math.min(...rects.map((b) => b.height)) / 2
    const centres = rects.map((b) => (b.top + b.bottom) / 2).sort((a, b) => a - b)
    let count = 1
    for (let i = 1; i < centres.length; i++) if (centres[i] - centres[i - 1] > half) count++
    return count
  }
  const overflows = (el) => el.scrollWidth > el.clientWidth + 1
  /** el and its descendants whose content is wider than their box, with how they end their text. */
  const overflowing = (el) => [el, ...el.querySelectorAll('*')].filter((e) => e.clientWidth > 0 && overflows(e)).map((e) => ({ tag: e.tagName, textOverflow: style(e).textOverflow, clips: clips(e) }))
  /** Whether a click at the visible centre of el lands on el. */
  const hit = (el) => { const v = painted(el); if (!v) return false; const at = document.elementFromPoint((v.left + v.right) / 2, (v.top + v.bottom) / 2); return Boolean(at) && (at === el || el.contains(at)) }
  const centre = (el) => { const v = painted(el) ?? box(el); return { x: (v.left + v.right) / 2, y: (v.top + v.bottom) / 2 } }
  const text = (el) => el.textContent.replace(/\\s+/g, ' ').trim()
  /** The deepest element under root whose collapsed text is exactly t. */
  const byText = (root, t) => [...root.querySelectorAll('*')].filter((e) => text(e) === t).at(-1) ?? null
  const contentBox = (el) => { const b = box(el); const s = style(el); const l = parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth), r = parseFloat(s.paddingRight) + parseFloat(s.borderRightWidth); return make(b.left + l, b.top, b.right - r, b.bottom) }
  /** The nearest block-level box holding el (el included): the column el's text is laid out in. */
  const column = (el) => { for (let at = el; at; at = at.parentElement) { const d = style(at).display; if (d !== 'inline' && d !== 'contents') return contentBox(at) } return null }
  /** The input's accessible name as getByLabel reads it: aria-labelledby, else aria-label, else its labels. */
  const nameOf = (input) => {
    const ids = input.getAttribute('aria-labelledby')
    if (ids) return ids.split(/\\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(text).join(' ')
    if (input.getAttribute('aria-label')) return input.getAttribute('aria-label').trim()
    return [...(input.labels ?? [])].map(text).join(' ')
  }
  /** Everything a row asserts about one element (null when absent). */
  const info = (el) => el ? ({
    shown: shown(el), box: box(el), painted: painted(el), hit: hit(el), lines: lines(el), title: el.getAttribute('title'), text: text(el),
    display: style(el).display, overflows: overflows(el), overflowing: overflowing(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
  }) : null
  window.__uifd = { make, union, intersect, box, shown, clips, cut, textRects, painted, lines, overflows, overflowing, hit, centre, text, byText, contentBox, column, nameOf, info }
  return window.__uifd
})()`

/** Runs `body` (an expression over `U`, the helpers) in the tab; its JSON value comes back. */
export const measure = (tab, body) => tab.evaluate(`(() => { const U = ${INSTALL}; return (${body}) })()`)

const eps = PX.epsilon
/** Whether two boxes overlap with a positive area (sub-pixel contact is not overlap); a null box overlaps nothing. */
export const overlaps = (a, b) => Boolean(a && b) && a.left < b.right - eps && b.left < a.right - eps && a.top < b.bottom - eps && b.top < a.bottom - eps
/** The clear distance between two boxes (0 when they touch or overlap). */
export function gap(a, b) {
  const dx = Math.max(b.left - a.right, a.left - b.right, 0)
  const dy = Math.max(b.top - a.bottom, a.top - b.bottom, 0)
  return Math.max(dx, dy)
}
/** Whether two boxes neither overlap nor touch. */
export const apart = (a, b) => gap(a, b) > eps
/** Whether two boxes share some vertical extent (they sit on one line). */
export const sameLine = (a, b) => a.top < b.bottom - eps && b.top < a.bottom - eps
export const near = (a, b, tolerance = eps) => Math.abs(a - b) <= tolerance
/** A box as short text for assertion messages. */
export const show = (b) => (b ? `[${Math.round(b.left)},${Math.round(b.top)} → ${Math.round(b.right)},${Math.round(b.bottom)}]` : 'none')
