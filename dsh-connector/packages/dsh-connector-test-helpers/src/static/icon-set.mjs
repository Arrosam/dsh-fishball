/**
 * ICON-SET vocabulary and the SVG reader the ICON-SET rows share (the user, 2026-11-18: "把Fishball
 * 底下的小扳手去掉，那个小扳手是connector插件的图标，只有connector插件的设置页的图标带有这个小扳手，
 * 然后每个插件的右下角都要有个各自的图标，大一些，浮在鱼图标前面。"; the acceptance criteria relayed
 * that day, and the lead's correction of the same day: dsh-instance's badge is a server, two stacked
 * rounded units, not a box). Every value here comes from those criteria, never from an implementation.
 *
 * Users: package-boundaries/icon-cases.mjs (manifests, assets, DSH's manifest reader),
 * dsh-connector-ui/draw/icon-cases.mjs (the sidebar fish), dsh-connector/tests/marks (the managed-row marks) and
 * dsh-connector/oauth-web/icon-cases.mjs (the approval page's inline icon).
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { versionsDir } from '../config.mjs'
import { REPO } from '../repo.mjs'
import { PRODUCT } from './constants.mjs'

/** The FishMark both the sidebar fish and every package icon draw (criteria 1 and 3). */
export const FISH = Object.freeze({
  body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
  eye: 'M14.6 7.4 h2 v2 h-2 Z',
})

/** The wrench: the old sidebar badge's hook, and the connector's new glyph (criteria 1 and 4). */
export const WRENCH = Object.freeze({
  /** The old design's wrench element carried this attribute; nothing may carry it now. */
  attr: 'data-fishball-wrench',
  /** dsh-connector's glyph paths, in order (criterion 4). */
  paths: Object.freeze(['M14.24 6.24A3.5 3.5 0 1 1 9.76 1.76', 'M9.53 6.47L3 13']),
  /** The old wrench (criterion 3): its paths spanned about 16.4–22.93 at stroke 1.6. */
  old: Object.freeze({ from: 16.4, to: 22.93, stroke: 1.6 }),
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

/** DSH's manifest-icon reading (criterion 2; dsh-app-boot `readPluginMeta`, both SDKs). */
export const META = Object.freeze({
  dataPrefix: 'data:image/svg+xml;base64,',
  maxBytes: 256 * 1024,
  appBoot: path.join('node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'),
  /** The resolution base DSH would use: the checkout's root (its node_modules links every workspace). */
  parentURL: new URL('file://' + path.join(REPO, 'package.json')).href,
})

/** The product packages that draw a plugin icon and the icon each declares (criteria 2 and 4); `wrench` only for the connector. */
const iconOf = (pkg, icon, glyph, wrench) => Object.freeze({ pkg, name: pkg.name, icon, file: path.join(pkg.dir, icon), glyph, wrench })
export const PACKAGES = Object.freeze([
  iconOf(PRODUCT.connector, './assets/connector-icon.svg', 'wrench', true),
  iconOf(PRODUCT.ui, './assets/connector-ui-icon.svg', 'window', false),
  iconOf(PRODUCT.adapter, './assets/adapter-icon.svg', 'plug', false),
])
/** A manifest icon path: relative, under assets/, an SVG, never leaving the folder. */
export const ICON_PATH = Object.freeze({ shape: /^\.\/assets\/[^/]+\.svg$/, parent: '..', dotSlash: './' })

// --------------------------------------------------------------------------------------------- the reader

const SAXES = 'saxes'
/** saxes, the XML parser the installed SDK ships (no XML parser is installed in this checkout). */
const saxesOf = (sdk) => createRequire(path.join(versionsDir, sdk, 'package.json'))(SAXES)

/**
 * Parse `text` as well-formed XML (throws on any error, e.g. an unterminated comment) into
 * `{tag, attrs, children}` elements; text and comments are dropped.
 */
export function parseXml(sdk, text) {
  const { SaxesParser } = saxesOf(sdk)
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

export const readIcon = (sdk, entry) => parseXml(sdk, fs.readFileSync(entry.file, 'utf8'))

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