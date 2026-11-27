/**
 * Observation layer of the family icon rows (a copy of fishball-amenities' tests/icons/observe.mjs;
 * packages' tests are never imported): manifests, the npm pack listing, the current DSH's own
 * readPluginMeta, the SVG as XML and as text, and the icon drawn by a real <img> in Chromium. Black
 * box: no package module is loaded; DSH reads the packages through throwaway node_modules links, so
 * nothing in the checkout is written. The packages are this package's dependencies (by name).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sharedBrowser } from 'fishball-test-helpers/browser'
import { importDsh } from 'fishball-test-helpers/dsh'
import { contrast } from 'fishball-test-helpers/wcag'
import { MANIFEST_FILE, dirOf, manifestOf } from '../support/packages.mjs'
import { tempDir } from '../support/temp.mjs'
import { CONTAINED, READER, RENDER, RULE, SVG, TEMP } from './constants.mjs'
import { walk } from './icon-set.mjs'

const posix = (p) => p.split(path.sep).join('/')

// ------------------------------------------------------------------------- manifest and files

/** The declared icon, its package-relative POSIX path and its absolute file (undefined when none is declared). */
export function iconOf(pkg) {
  const declared = manifestOf(pkg)[RULE.field]
  if (typeof declared !== 'string') return { declared }
  const file = path.resolve(dirOf(pkg), declared)
  return { declared, file, rel: posix(path.relative(dirOf(pkg), file)) }
}

/** Whether a manifest `files` list names `rel`: the file, a folder holding it, or a glob matching it (npm's forms). */
export function filesName(files, rel) {
  return (files ?? []).filter((e) => !e.startsWith(RULE.negated)).some((entry) => {
    const bare = entry.startsWith(RULE.dotSlash) ? entry.slice(RULE.dotSlash.length) : entry
    const folder = bare.replace(/\/+$/u, '')
    return bare === rel || rel.startsWith(folder + RULE.slash) || path.posix.matchesGlob(rel, bare) || path.posix.matchesGlob(rel, folder + RULE.anyBelow)
  })
}

// ------------------------------------------------------------------------- DSH's reader

/** A resolution root whose node_modules links each `{name, dir}`, as a profile's install would; returns its parentURL. */
function linkedRoot(pkgs) {
  const root = tempDir(TEMP.prefix)
  fs.writeFileSync(path.join(root, MANIFEST_FILE), '{}')
  for (const p of pkgs) {
    const at = path.join(root, TEMP.modules, p.name)
    fs.mkdirSync(path.dirname(at), { recursive: true })
    fs.symlinkSync(p.dir, at)
  }
  return pathToFileURL(path.join(root, MANIFEST_FILE)).href
}

let reader
const readPluginMeta = async () => (reader ??= importDsh(READER.package).then((m) => m.readPluginMeta))
let root
/** readPluginMeta(name) of the current DSH over a root linking `all` (the packages these rows read). */
export async function metaOf(pkg, all) {
  const read = await readPluginMeta()
  root ??= linkedRoot(all.map((p) => ({ name: p.name, dir: dirOf(p) })))
  return read(pkg.name, root)
}

// ------------------------------------------------------------------------- the SVG

/** The local name of a qualified XML name (`xlink:href` → `href`). */
const local = (name) => name.slice(name.lastIndexOf(SVG.qualified) + 1)

/** What is wrong with the root as an SVG an <img> renders: the svg tag, its namespace and a viewBox of four numbers with a positive size. */
export function rootProblems(svg) {
  const out = []
  if (svg.tag !== SVG.root) out.push('root is <' + svg.tag + '>')
  if (svg.attrs[SVG.xmlnsAttr] !== SVG.namespace) out.push('xmlns is ' + JSON.stringify(svg.attrs[SVG.xmlnsAttr]))
  const box = (svg.attrs[SVG.viewBox] ?? '').trim().split(SVG.listSeparator).filter(Boolean).map(Number)
  if (box.length !== SVG.viewBoxNumbers || !box.every(Number.isFinite)) out.push('viewBox is ' + JSON.stringify(svg.attrs[SVG.viewBox]))
  else if (!(box[2] > 0 && box[3] > 0)) out.push('viewBox has no positive size: ' + box.join(' '))
  return out
}

const isLocal = (ref) => CONTAINED.local.some((prefix) => ref.trim().startsWith(prefix))
/**
 * Why the icon is not self-contained in an <img> (none: it is): a currentColor, a script or event
 * handler, an href or CSS url()/@import leaving the document, or an xml-stylesheet instruction.
 * `text` is the raw source; comments are dropped first (they draw nothing), so only markup counts.
 */
export function containmentProblems(svg, text) {
  const markup = text.replace(/<!--[\s\S]*?-->/gu, '')
  const out = []
  if (CONTAINED.currentColor.test(markup)) out.push('uses currentColor')
  if (CONTAINED.cssImport.test(markup)) out.push('uses @import')
  if (CONTAINED.stylesheet.test(markup)) out.push('has an xml-stylesheet instruction')
  for (const [, , ref] of markup.matchAll(CONTAINED.cssUrl)) if (!isLocal(ref)) out.push('url(' + ref + ')')
  for (const el of walk(svg)) {
    if (local(el.tag) === CONTAINED.script) out.push('<' + el.tag + '>')
    for (const [name, value] of Object.entries(el.attrs)) {
      if (CONTAINED.eventAttr.test(local(name))) out.push(el.tag + ' ' + name)
      if (CONTAINED.hrefAttrs.includes(local(name)) && !isLocal(value)) out.push(el.tag + ' ' + name + '=' + JSON.stringify(value))
    }
  }
  return out
}

/** The drawing: every element under the root, tag and attributes (comments and whitespace are not drawn). */
const canonical = (el) => ({ tag: el.tag, attrs: Object.fromEntries(Object.entries(el.attrs).sort(([a], [b]) => (a < b ? -1 : 1))), children: el.children.map(canonical) })
export const drawingOf = (svg) => JSON.stringify(svg.children.map(canonical))

// ------------------------------------------------------------------------- the <img>

/** Runs in the page: Canvas behind, the data URL in an <img>, decoded, then drawn over the background on a canvas. */
const PROBE = String(async function probe(arg) {
  document.documentElement.style.colorScheme = arg.colorScheme
  document.body.style.background = arg.background
  const background = getComputedStyle(document.body).backgroundColor
  const img = new Image()
  img.src = arg.src
  document.body.append(img)
  try { await img.decode() } catch (error) { return { decoded: false, error: String(error), background } }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = arg.px
  const g = canvas.getContext('2d')
  g.fillStyle = background
  g.fillRect(0, 0, arg.px, arg.px)
  g.drawImage(img, 0, 0, arg.px, arg.px)
  return { decoded: true, natural: [img.naturalWidth, img.naturalHeight], background, pixels: Array.from(g.getImageData(0, 0, arg.px, arg.px).data) }
})

/**
 * The icon at `src` (a data URL) as an <img> in a fresh blank tab of the shared Chromium whose
 * prefers-color-scheme is `scheme` (fishball-test-helpers/browser `measure` emulates no media, so
 * the tab is driven here); see PROBE.
 */
export async function renderIcon(scheme, src) {
  const { devtools } = await sharedBrowser()
  const { targetId } = await devtools.send('Target.createTarget', { url: RENDER.blank })
  try {
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
    await devtools.send('Emulation.setDeviceMetricsOverride', { ...RENDER.viewport, deviceScaleFactor: 1, mobile: false }, sessionId)
    await devtools.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, sessionId)
    const expression = '(' + PROBE + ')(' + JSON.stringify({ src, colorScheme: RENDER.colorScheme, background: RENDER.background, px: RENDER.canvasPx }) + ')'
    const r = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (r.exceptionDetails) throw new Error('page evaluation failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
    return r.result.value
  } finally {
    await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

const rgbOf = (css) => { const m = RENDER.rgb.exec(css); if (!m) throw new Error('not an rgb colour: ' + css); return m.slice(1, 4).map(Number) }
const unit = ([r, g, b]) => ({ r: r / RENDER.channelMax, g: g / RENDER.channelMax, b: b / RENDER.channelMax })

/** How many drawn pixels reach RENDER.minContrast against the page background (WCAG 2.1 SC 1.4.11). */
export function visiblePixels(result) {
  const bg = unit(rgbOf(result.background))
  let n = 0
  for (let i = 0; i < result.pixels.length; i += RENDER.channels) if (contrast(unit(result.pixels.slice(i, i + 3)), bg) >= RENDER.minContrast) n++
  return n
}
