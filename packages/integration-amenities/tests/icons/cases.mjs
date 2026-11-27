/**
 * The package-icon family across packages (integration rows the fishball-amenities port left out,
 * .runtime/port/port-amenities-mapping.tsv): fishball-core's icon is the family reference and passes
 * the same rules as the amenities' (PI-EP-01…05, PI-RENDER-01: a guard that the rules themselves are
 * right on an icon that predates them), every amenity keeps that reference's base exactly
 * (PI-CONSIST), and the amenities', fishball-core's and fishball-ui's icons are pairwise different
 * (PI-EP-06). The per-amenity rows and the oracles' self-checks are fishball-amenities' own tests.
 *
 * Techniques: EP (the reference is one more partition of every per-icon rule; PI-EP-06 over all
 * six icons pairwise), state (light and dark scheme), consistency (base equality with the reference).
 * Level: unit (manifests and SVGs), integration (DSH's readPluginMeta, npm pack --dry-run), system
 * (a real Chromium decoding DSH's data URL). Values: constants.mjs.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after } from 'node:test'
import { BROWSER, chromeBinary, stopBrowser } from 'fishball-test-helpers/browser'
import { caseTest } from 'fishball-test-helpers/cases'
import { PKG, REFERENCE, SUBJECTS, dirOf, manifestOf } from '../support/packages.mjs'
import { packedFiles } from '../support/pack.mjs'
import { removeTemps } from '../support/temp.mjs'
import { ID, RENDER, RULE } from './constants.mjs'
import { baseOf, glyphPaths, iconMismatch, parseXml } from './icon-set.mjs'
import { containmentProblems, drawingOf, filesName, iconOf, metaOf, renderIcon, rootProblems, visiblePixels } from './observe.mjs'

const json = (v) => JSON.stringify(v)
/** Every package DSH's reader is given: the reference and the subjects (and the library they bundle). */
const READ = Object.freeze([REFERENCE, ...SUBJECTS, PKG.shared])
/** Every drawn icon of the family: the subjects, the reference and fishball-ui's shipped asset. */
const DRAWN = Object.freeze([...SUBJECTS, REFERENCE, PKG.ui])
const REF_LABEL = REFERENCE.name + ' (reference)'

/** The icon a package draws: its manifest icon, else (fishball-ui) the asset it ships. */
function readSvg(pkg) {
  const file = iconOf(pkg).file ?? (pkg.asset === undefined ? undefined : path.join(dirOf(pkg), pkg.asset))
  assert.ok(file, pkg.name + ' declares no icon')
  const text = fs.readFileSync(file, 'utf8')
  return { text, svg: parseXml(text) }
}

async function rendered(t, scheme, src) {
  if (!chromeBinary()) { t.skip(BROWSER.skipNoChrome); return null }
  return renderIcon(scheme, src)
}

export function registerFamilyIconCases() {
  after(async () => { await stopBrowser(); removeTemps() })
  const pkg = REFERENCE

  caseTest(ID.manifest, REF_LABEL, `${pkg.name}: package.json icon is a relative .svg path with no scheme, a regular file inside the package after realpath`, () => {
    const { declared, file } = iconOf(pkg)
    assert.equal(typeof declared, 'string', pkg.name + ': no manifest icon (' + json(declared) + ')')
    assert.notEqual(declared.trim(), '', 'an empty icon')
    assert.doesNotMatch(declared, RULE.scheme, 'a URL, not a relative path')
    assert.ok(!declared.startsWith(RULE.slash), 'an absolute path')
    assert.ok(declared.toLowerCase().endsWith(RULE.extension), 'not an .svg file: ' + declared)
    assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), file + ' is not a regular file')
    assert.ok(fs.realpathSync(file).startsWith(dirOf(pkg) + '/'), 'the icon leaves the package: ' + fs.realpathSync(file))
  })
  caseTest(ID.shipped, REF_LABEL, `${pkg.name}: its "files" names the icon and npm pack --dry-run ships it`, async () => {
    const { rel } = iconOf(pkg)
    assert.ok(rel, pkg.name + ' declares no icon')
    assert.ok(filesName(manifestOf(pkg)[RULE.files], rel), rel + ' is not in files: ' + json(manifestOf(pkg)[RULE.files]))
    assert.ok((await packedFiles(dirOf(pkg))).includes(rel), 'npm pack does not ship ' + rel)
  })
  caseTest(ID.meta, REF_LABEL, `DSH's readPluginMeta(${pkg.name}) → no error, a data:image/svg+xml;base64 icon whose bytes are the shipped file, ≤ 256 KiB`, async () => {
    const meta = await metaOf(pkg, READ)
    assert.equal(meta?.error, undefined, pkg.name + ': DSH reported ' + meta?.error)
    assert.equal(typeof meta?.icon, 'string', pkg.name + ': DSH read no icon')
    assert.ok(meta.icon.startsWith(RULE.dataPrefix), 'not an SVG data URL')
    const bytes = Buffer.from(meta.icon.slice(RULE.dataPrefix.length), 'base64')
    assert.ok(bytes.length > 0 && bytes.length <= RULE.maxBytes, bytes.length + ' bytes')
    assert.ok(bytes.equals(fs.readFileSync(iconOf(pkg).file)), "DSH's icon is not the declared file")
  })
  caseTest(ID.svg, REF_LABEL, `${pkg.name}: the icon is well-formed XML with one <svg> root in the SVG namespace and a viewBox of four numbers, positive width and height`, () => {
    assert.deepEqual(rootProblems(readSvg(pkg).svg), [])
  })
  caseTest(ID.contained, REF_LABEL, `${pkg.name}: the icon is self-contained for an <img>: no currentColor, no <script> or on* handler, no href / url() / @import leaving the document`, () => {
    const { svg, text } = readSvg(pkg)
    assert.deepEqual(containmentProblems(svg, text), [])
  })
  for (const scheme of RENDER.schemes) {
    caseTest(ID.render, REF_LABEL + ' ' + scheme, `${pkg.name}: DSH's data URL decodes in an <img> under the ${scheme} scheme and draws pixels at ≥ ${RENDER.minContrast}:1 against the page`, async (t) => {
      const meta = await metaOf(pkg, READ)
      assert.equal(typeof meta?.icon, 'string', pkg.name + ': DSH read no icon')
      const r = await rendered(t, scheme, meta.icon)
      if (!r) return
      assert.ok(r.decoded, pkg.name + ': the <img> did not decode: ' + r.error)
      assert.ok(visiblePixels(r) >= RENDER.minVisiblePixels, `${pkg.name}: nothing visible on the ${scheme} background ${r.background}`)
    })
  }

  for (const subject of SUBJECTS) {
    caseTest(ID.family, subject.name, `${subject.name}: keeps the family base of ${REFERENCE.name}'s icon (tile, fish, ring, chip, glyph frame) and draws its own glyph`, () => {
      const { svg } = readSvg(subject)
      assert.deepEqual(iconMismatch(svg), [], 'base and badge')
      assert.deepEqual(baseOf(svg), baseOf(readSvg(REFERENCE).svg), "the base or the glyph frame differs from the reference's")
      assert.ok(glyphPaths(svg).length > 0, 'the badge draws no glyph')
    })
  }

  caseTest(ID.distinct, 'all icons', `the icons of ${DRAWN.map((p) => p.name).join(', ')} are pairwise different drawings and glyphs`, () => {
    const drawn = DRAWN.map((p) => ({ name: p.name, svg: readSvg(p).svg }))
    const same = []
    drawn.forEach((a, i) => drawn.slice(i + 1).forEach((b) => {
      if (drawingOf(a.svg) === drawingOf(b.svg)) same.push(a.name + ' = ' + b.name + ' (drawing)')
      else if (json(glyphPaths(a.svg)) === json(glyphPaths(b.svg))) same.push(a.name + ' = ' + b.name + ' (glyph)')
    }))
    assert.deepEqual(same, [])
  })
}
