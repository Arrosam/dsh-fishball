/**
 * Observation layer of the package-icon rows: manifests, the npm pack listing, DSH's own
 * readPluginMeta of each SDK, the SVG as XML and as text, and the icon drawn by a real <img> in
 * Chromium. Black box: no package module is loaded; DSH reads the packages through throwaway
 * node_modules links, so nothing in the checkout is written. Same file in both repositories.
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { CONTAINED, PACK, READER, RENDER, RULE, SIZE, SVG, TEMP } from './constants.mjs'
import { NPM_PATH, PACKAGES, VERSIONS_DIR, walk } from './repo.mjs'

const run = promisify(execFile)
const posix = (p) => p.split(path.sep).join('/')
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep)

// ------------------------------------------------------------------------- throwaway folders

const temps = new Set()
function tempDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), TEMP.prefix)))
  temps.add(dir)
  return dir
}
/** Remove every folder this module made (the cases' after hook). */
export function cleanup() {
  for (const dir of temps) {
    // Guard the recursive delete: only a folder this module created directly under the OS temp dir.
    if (path.dirname(dir) !== fs.realpathSync(os.tmpdir()) || !path.basename(dir).startsWith(TEMP.prefix)) throw new Error('unexpected temp dir ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  }
  temps.clear()
}

// ------------------------------------------------------------------------- manifest and files

export const manifestOf = (pkg) => JSON.parse(fs.readFileSync(path.join(pkg.dir, RULE.manifest), 'utf8'))

/** The declared icon, its package-relative POSIX path and its absolute file (undefined when none is declared). */
export function iconOf(pkg) {
  const declared = manifestOf(pkg)[RULE.field]
  if (typeof declared !== 'string') return { declared }
  const file = path.resolve(pkg.dir, declared)
  return { declared, file, rel: posix(path.relative(pkg.dir, file)) }
}

/** Whether a manifest `files` list names `rel`: the file, a folder holding it, or a glob matching it (npm's forms). */
export function filesName(files, rel) {
  return (files ?? []).filter((e) => !e.startsWith(RULE.negated)).some((entry) => {
    const bare = entry.startsWith(RULE.dotSlash) ? entry.slice(RULE.dotSlash.length) : entry
    const folder = bare.replace(/\/+$/u, '')
    return bare === rel || rel.startsWith(folder + RULE.slash) || path.posix.matchesGlob(rel, bare) || path.posix.matchesGlob(rel, folder + RULE.anyBelow)
  })
}

const packs = new Map()
/** Every path `npm pack --dry-run` would ship from the package (isolated: no user config, own cache, offline). */
export function packedFiles(pkg) {
  if (!packs.has(pkg.dir)) packs.set(pkg.dir, (async () => {
    const root = tempDir()
    for (const f of [TEMP.home, TEMP.cache]) fs.mkdirSync(path.join(root, f))
    for (const f of [TEMP.userrc, TEMP.globalrc]) fs.writeFileSync(path.join(root, f), '')
    const env = { PATH: NPM_PATH, HOME: path.join(root, TEMP.home), npm_config_cache: path.join(root, TEMP.cache), npm_config_userconfig: path.join(root, TEMP.userrc),
      npm_config_globalconfig: path.join(root, TEMP.globalrc), npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' }
    const { stdout } = await run('npm', ['pack', '--dry-run', '--json', PACK.ignoreScripts], { cwd: pkg.dir, env, maxBuffer: PACK.maxStdoutBytes })
    const [report] = JSON.parse(stdout.slice(stdout.search(PACK.jsonStart)))
    return report.files.map((f) => posix(f.path))
  })())
  return packs.get(pkg.dir)
}

// ------------------------------------------------------------------------- DSH's reader

const readers = new Map()
const readerOf = (sdk) => {
  if (!readers.has(sdk)) readers.set(sdk, import(pathToFileURL(path.join(VERSIONS_DIR, sdk, READER.entry)).href).then((m) => m.readPluginMeta))
  return readers.get(sdk)
}

/** A resolution root whose node_modules links each `{name, dir}`, as a profile's install would; returns its parentURL. */
function linkedRoot(pkgs) {
  const root = tempDir()
  fs.writeFileSync(path.join(root, RULE.manifest), '{}')
  for (const p of pkgs) {
    const at = path.join(root, TEMP.modules, p.name)
    fs.mkdirSync(path.dirname(at), { recursive: true })
    fs.symlinkSync(p.dir, at)
  }
  return pathToFileURL(path.join(root, RULE.manifest)).href
}

const roots = new Map()
/** readPluginMeta(name) of `sdk`'s DSH over a root linking every package of this repository's rows. */
export async function metaOf(sdk, pkg) {
  const readPluginMeta = await readerOf(sdk)
  if (!roots.has(sdk)) roots.set(sdk, linkedRoot(Object.values(PACKAGES).flat()))
  return readPluginMeta(pkg.name, roots.get(sdk))
}

/** PI-BVA-01: readPluginMeta of a synthetic package whose icon file is exactly `bytes` bytes long. */
export async function metaOfSize(sdk, bytes) {
  const readPluginMeta = await readerOf(sdk)
  const dir = tempDir()
  const name = SIZE.namePrefix + bytes
  const filler = bytes - Buffer.byteLength(SIZE.svg.head + SIZE.svg.tail)
  const content = SIZE.svg.head + SIZE.svg.pad.repeat(filler) + SIZE.svg.tail
  if (Buffer.byteLength(content) !== bytes) throw new Error('synthetic icon is not ' + bytes + ' bytes')
  fs.writeFileSync(path.join(dir, RULE.manifest), JSON.stringify({ name, [RULE.field]: SIZE.file }))
  fs.writeFileSync(path.join(dir, SIZE.file), content)
  return { meta: readPluginMeta(name, linkedRoot([{ name, dir }])), content }
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

/** The icon at `src` (a data URL) as an <img> under `scheme`; see PROBE. */
export const renderIcon = (browser, scheme, src) =>
  browser.evaluate(scheme, '(' + PROBE + ')(' + JSON.stringify({ src, colorScheme: RENDER.colorScheme, background: RENDER.background, px: RENDER.canvasPx }) + ')')

const L = RENDER.luminance
const channel = (v) => { const s = v / L.max; return s <= L.threshold ? s / L.low : ((s + L.offset) / L.scale) ** L.gamma }
const luminance = ([r, g, b]) => L.r * channel(r) + L.g * channel(g) + L.b * channel(b)
export const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + L.flare) / (lo + L.flare) }
export const rgbOf = (css) => { const m = RENDER.rgb.exec(css); if (!m) throw new Error('not an rgb colour: ' + css); return m.slice(1, 4).map(Number) }

/** How many drawn pixels reach RENDER.minContrast against the page background. */
export function visiblePixels(result) {
  const bg = rgbOf(result.background)
  let n = 0
  for (let i = 0; i < result.pixels.length; i += RENDER.channels) if (contrast(result.pixels.slice(i, i + 3), bg) >= RENDER.minContrast) n++
  return n
}
