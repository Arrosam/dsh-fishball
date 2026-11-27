/**
 * The ICON-SET reader and base shapes (a copy of fishball-amenities' tests/icons/icon-set.mjs, plus
 * `baseOf` for the family-reference row; packages' tests are never imported). Values come from the ICON-SET criteria (the user, 2026-11-18):
 * every package icon draws the FishMark on the ink tile, then a paper chip in an ink ring holding its
 * own 16-unit glyph scaled 0.44. The XML parser is the saxes the current DSH ships (nothing is
 * installed in this checkout).
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { DSH_RUNTIME } from 'fishball-test-helpers/dsh'
import { READER } from './constants.mjs'

/** The FishMark both the sidebar fish and every package icon draw (criteria 1 and 3). */
export const FISH = Object.freeze({
  body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
  eye: 'M14.6 7.4 h2 v2 h-2 Z',
})

/** The shared base and the badge of every package icon, in drawing order (criterion 3). */
export const ICON = Object.freeze({
  viewBox: '0 0 24 24',
  tile: Object.freeze({ tag: 'rect', width: 24, height: 24, rx: 5, fill: '#101010' }),
  body: Object.freeze({ tag: 'path', d: FISH.body, fill: '#F2F2EE' }),
  eye: Object.freeze({ tag: 'path', d: FISH.eye, fill: '#EC0A6E' }),
  ring: Object.freeze({ tag: 'circle', cx: 17.6, cy: 17.6, r: 6.2, fill: '#101010' }),
  chip: Object.freeze({ tag: 'circle', cx: 17.6, cy: 17.6, r: 5, fill: '#F2F2EE' }),
  glyph: Object.freeze({ tag: 'g', transform: 'translate(14.08 14.08) scale(0.44)', stroke: '#101010' }),
  /** The glyph group's numbers (its transform) and the grid its paths are drawn on (DSH's 16-unit icons). */
  glyphTranslate: 14.08,
  glyphScale: 0.44,
  glyphGrid: 16,
  /** The tile's own extent: the badge must lie inside it. */
  tileMin: 0,
  tileMax: 24,
})
/** The six top-level drawing elements in order: the fish first, then the badge in front of it. */
export const ICON_ORDER = Object.freeze(['tile', 'body', 'eye', 'ring', 'chip', 'glyph'])
/** The numeric attributes compared as numbers (so `5` and `5.0` are one value). */
export const NUMERIC = Object.freeze(['width', 'height', 'rx', 'cx', 'cy', 'r'])

// --------------------------------------------------------------------------------------------- the reader

/** A require resolving from the current DSH's runtime folder (`versions/<v>/node_modules`). */
const dshRequire = createRequire(path.join(DSH_RUNTIME, READER.package, 'package.json'))

/**
 * Parse `text` as well-formed XML (throws on any error, e.g. an unterminated comment) into
 * `{tag, attrs, children}` elements; text and comments are dropped.
 */
export function parseXml(text) {
  const { SaxesParser } = dshRequire(READER.saxes)
  const parser = new SaxesParser()
  const root = { tag: null, attrs: {}, children: [] }
  const stack = [root]
  let failure = null
  parser.on('error', (e) => { failure ??= e })
  parser.on('opentag', (node) => {
    const el = { tag: node.name, attrs: { ...node.attributes }, children: [] }
    stack.at(-1).children.push(el)
    stack.push(el)
  })
  parser.on('closetag', () => { stack.pop() })
  parser.write(text).close()
  if (failure) throw failure
  if (root.children.length !== 1) throw new Error('not one root element: ' + root.children.length)
  return root.children[0]
}


/** Every element under `el`, depth first, `el` included. */
export const walk = (el) => [el, ...el.children.flatMap(walk)]

/** The differences between element `el` and the expected shape `want` (`tag` plus attributes). */
export function shapeMismatch(el, want, what) {
  const out = []
  if (el?.tag !== want.tag) return [`${what}: <${el?.tag}> where <${want.tag}> was expected`]
  for (const [k, v] of Object.entries(want)) {
    if (k === 'tag') continue
    const got = el.attrs[k]
    const same = NUMERIC.includes(k) ? Number(got) === v : got === v
    if (!same) out.push(`${what}: ${k}=${JSON.stringify(got)}, want ${JSON.stringify(v)}`)
  }
  return out
}

/** The base-and-badge differences of one icon's top-level drawing (criterion 3): order, shapes, nothing else. */
export function iconMismatch(svg) {
  const drawn = svg.children
  const out = drawn.length === ICON_ORDER.length ? [] : [`${drawn.length} top-level elements (${drawn.map((e) => e.tag).join(', ')}), want ${ICON_ORDER.length}`]
  ICON_ORDER.forEach((key, i) => out.push(...shapeMismatch(drawn[i], ICON[key], key)))
  return out
}


/** An icon's base, element by element: tag and attributes, the glyph group by its frame (transform, stroke) only. */
export const baseOf = (svg) => svg.children.map((e) => ({ tag: e.tag, attrs: e.tag === ICON.glyph.tag ? { transform: e.attrs.transform, stroke: e.attrs.stroke } : e.attrs }))

/** The glyph group's path data, in order. */
export const glyphPaths = (svg) => (svg.children.find((e) => e.tag === ICON.glyph.tag)?.children ?? []).filter((e) => e.tag === 'path').map((e) => e.attrs.d)