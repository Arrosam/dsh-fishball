/**
 * Package-icon rows: every plugin package of this repository's amenities declares a manifest icon
 * DSH's own reader accepts, that ships, is a valid self-contained SVG, shows on light and dark
 * themes in an <img>, differs from every other package's, and keeps the family's base; the
 * libraries declare none (constants.mjs quotes the requirement). Same file in both repositories.
 *
 * Techniques:
 * - Equivalence Partitioning over the packages (PI-EP-01…06): each subject package is one
 *   partition of every per-icon rule; the reference package (the family's existing icon) passes
 *   the same rules, a guard that the rules themselves are right;
 * - Decision tables: package kind × icon (PI-DT-01: a plugin declares one, a library declares none
 *   and DSH reads none); the self-contained rule over synthetic SVGs (PI-DT-02, the oracle's own
 *   check); the visibility measure over controls (PI-DT-03);
 * - Boundary values on DSH's 256 KiB limit through DSH's reader (PI-BVA-01: max - 1, max, max + 1);
 * - State: an <img> under the light and the dark scheme (PI-RENDER-01), each a fresh tab;
 * - a consistency guard (PI-CONSIST): each subject keeps the reference icon's base.
 *
 * Level: unit (manifests and assets read as files), integration (DSH's readPluginMeta of the SDK
 * under test; npm pack --dry-run) and system (a real Chromium decoding the data URL DSH produces).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, test } from 'node:test'
import { ID, LINT, RENDER, RULE, SIZE, VISIBLE } from './constants.mjs'
import {
  cleanup, containmentProblems, drawingOf, filesName, iconOf, manifestOf, metaOf, metaOfSize, packedFiles, renderIcon, rootProblems, visiblePixels,
} from './observe.mjs'
import { PACKAGES, baseOf, caseName, glyphPaths, iconMismatch, openBrowser, parseXml } from './repo.mjs'

const json = (v) => JSON.stringify(v)
/** Every package that draws an icon here: the subjects, the reference and the other packages' shipped icons. */
const ICON_PACKAGES = Object.freeze([...PACKAGES.subjects, PACKAGES.reference, ...PACKAGES.others])
/** The icon a package draws: its manifest icon, else (an inner package of PACKAGES.others) the asset it ships. */
const readSvg = (sdk, pkg) => {
  const file = iconOf(pkg).file ?? pkg.asset
  assert.ok(file, pkg.name + ' declares no icon')
  const text = fs.readFileSync(file, 'utf8')
  return { text, svg: parseXml(sdk, text) }
}
const dataUrl = (text) => RULE.dataPrefix + Buffer.from(text).toString('base64')

let browser
/** One Chromium per file, started on first use; null when none is installed (the render rows skip, saying so). */
const browserOnce = () => (browser ??= openBrowser())
async function rendered(t, scheme, src) {
  const b = await browserOnce()
  if (!b) { t.skip(RENDER.noBrowser); return null }
  return renderIcon(b, scheme, src)
}

export function registerPackageIconCases(sdk) {
  const row = (id, part, title, fn) => test(caseName(sdk, id, part, title), fn)
  after(async () => { await (await browser)?.stop(); cleanup() })

  for (const pkg of [...PACKAGES.subjects, PACKAGES.reference]) {
    const who = pkg === PACKAGES.reference ? pkg.name + ' (reference)' : pkg.name
    row(ID.manifest, who, `${pkg.name}: package.json icon is a relative .svg path with no scheme, a regular file inside the package after realpath`, () => {
      const { declared, file } = iconOf(pkg)
      assert.equal(typeof declared, 'string', pkg.name + ': no manifest icon (' + json(declared) + ')')
      assert.notEqual(declared.trim(), '', 'an empty icon')
      assert.doesNotMatch(declared, RULE.scheme, 'a URL, not a relative path')
      assert.ok(!declared.startsWith(RULE.slash), 'an absolute path')
      assert.ok(declared.toLowerCase().endsWith(RULE.extension), 'not an .svg file: ' + declared)
      assert.ok(fs.existsSync(file), file + ' does not exist')
      assert.ok(fs.statSync(file).isFile(), file + ' is not a regular file')
      const real = fs.realpathSync(file)
      const root = fs.realpathSync(pkg.dir)
      assert.ok(real.startsWith(root + '/'), 'the icon leaves the package: ' + real)
    })
    row(ID.shipped, who, `${pkg.name}: its "files" names the icon and npm pack --dry-run ships it`, async () => {
      const { rel } = iconOf(pkg)
      assert.ok(rel, pkg.name + ' declares no icon')
      assert.ok(filesName(manifestOf(pkg)[RULE.files], rel), rel + ' is not in files: ' + json(manifestOf(pkg)[RULE.files]))
      assert.ok((await packedFiles(pkg)).includes(rel), 'npm pack does not ship ' + rel)
    })
    row(ID.meta, who, `DSH ${sdk} readPluginMeta(${pkg.name}) → no error, a data:image/svg+xml;base64 icon whose bytes are the shipped file, ≤ 256 KiB`, async () => {
      const meta = await metaOf(sdk, pkg)
      assert.equal(meta?.error, undefined, pkg.name + ': DSH reported ' + meta?.error)
      assert.equal(typeof meta?.icon, 'string', pkg.name + ': DSH read no icon')
      assert.ok(meta.icon.startsWith(RULE.dataPrefix), 'not an SVG data URL: ' + meta.icon.slice(0, RULE.dataPrefix.length))
      const bytes = Buffer.from(meta.icon.slice(RULE.dataPrefix.length), 'base64')
      assert.ok(bytes.length > 0 && bytes.length <= RULE.maxBytes, bytes.length + ' bytes')
      assert.ok(bytes.equals(fs.readFileSync(iconOf(pkg).file)), "DSH's icon is not the declared file")
    })
    row(ID.svg, who, `${pkg.name}: the icon is well-formed XML with one <svg> root in the SVG namespace and a viewBox of four numbers, positive width and height`, () => {
      assert.deepEqual(rootProblems(readSvg(sdk, pkg).svg), [])
    })
    row(ID.contained, who, `${pkg.name}: the icon is self-contained for an <img>: no currentColor, no <script> or on* handler, no href / url() / @import leaving the document`, () => {
      const { svg, text } = readSvg(sdk, pkg)
      assert.deepEqual(containmentProblems(svg, text), [])
    })
    for (const scheme of RENDER.schemes) {
      row(ID.render, `${who} ${scheme}`, `${pkg.name}: DSH's data URL decodes in an <img> under the ${scheme} scheme and draws pixels at ≥ ${RENDER.minContrast}:1 against the page`, async (t) => {
        const meta = await metaOf(sdk, pkg)
        assert.equal(typeof meta?.icon, 'string', pkg.name + ': DSH read no icon')
        const r = await rendered(t, scheme, meta.icon)
        if (!r) return
        assert.ok(r.decoded, pkg.name + ': the <img> did not decode: ' + r.error)
        assert.ok(visiblePixels(r) >= RENDER.minVisiblePixels, `${pkg.name}: nothing visible on the ${scheme} background ${r.background}`)
      })
    }
  }

  for (const pkg of PACKAGES.subjects) {
    row(ID.family, pkg.name, `${pkg.name}: keeps the family base of ${PACKAGES.reference.name}'s icon (tile, fish, ring, chip, glyph frame) and draws its own glyph`, () => {
      const { svg } = readSvg(sdk, pkg)
      const reference = readSvg(sdk, PACKAGES.reference).svg
      assert.deepEqual(iconMismatch(svg), [], 'base and badge')
      assert.deepEqual(baseOf(svg), baseOf(reference), "the base or the glyph frame differs from the reference's")
      assert.ok(glyphPaths(svg).length > 0, 'the badge draws no glyph')
    })
  }

  row(ID.distinct, 'all icons', `the icons of ${ICON_PACKAGES.map((p) => p.name).join(', ')} are pairwise different drawings and glyphs`, () => {
    const drawn = ICON_PACKAGES.map((p) => ({ name: p.name, svg: readSvg(sdk, p).svg }))
    const same = []
    drawn.forEach((a, i) => drawn.slice(i + 1).forEach((b) => {
      if (drawingOf(a.svg) === drawingOf(b.svg)) same.push(a.name + ' = ' + b.name + ' (drawing)')
      else if (json(glyphPaths(a.svg)) === json(glyphPaths(b.svg))) same.push(a.name + ' = ' + b.name + ' (glyph)')
    }))
    assert.deepEqual(same, [])
  })

  // Decision table, package kind × icon: rule 1 plugin → declares one (the rows above); rule 2 library → none.
  for (const lib of PACKAGES.libraries) {
    row(ID.library, 'rule 2 ' + lib.name, `${lib.name} (a library, no dsh field) declares no icon, and DSH ${sdk} reads none for it`, async () => {
      const manifest = manifestOf(lib)
      assert.equal(manifest.dsh, undefined, lib.name + ' is not a library: it has a dsh field')
      assert.equal(manifest[RULE.field], undefined, lib.name + ' declares an icon')
      const meta = await metaOf(sdk, lib)
      assert.equal(meta?.error, undefined, 'DSH reported ' + meta?.error)
      assert.equal(meta?.icon, undefined, 'DSH read an icon')
    })
  }
  for (const pkg of PACKAGES.subjects) {
    row(ID.library, 'rule 1 ' + pkg.name, `${pkg.name} is a plugin (it has a dsh field), so it is one of the icon rows`, () => {
      assert.notEqual(manifestOf(pkg).dsh, undefined, pkg.name + ' has no dsh field')
    })
  }

  row(ID.size, 'oracle', 'the boundary rows below are built at exactly their byte counts around 256 KiB', () => {
    assert.deepEqual(SIZE.rows.map((r) => r.bytes - RULE.maxBytes), [...SIZE.offsets])
  })
  for (const r of SIZE.rows) {
    row(ID.size, r.partition, `DSH ${sdk} readPluginMeta of a synthetic plugin whose icon is ${r.bytes} bytes → ${r.accepted ? 'its data URL' : 'an error and no icon'}`, async () => {
      const { meta, content } = await metaOfSize(sdk, r.bytes)
      if (r.accepted) {
        assert.equal(meta?.error, undefined, 'DSH reported ' + meta?.error)
        assert.equal(meta?.icon, dataUrl(content))
      } else {
        assert.equal(meta?.icon, undefined, 'DSH read an oversize icon')
        assert.match(String(meta?.error), /256 KiB/u)
      }
    })
  }

  for (const c of LINT) {
    row(ID.lint, c.partition, `oracle: the self-contained rule ${c.flagged ? 'flags' : 'accepts'} an SVG with ${c.partition}`, () => {
      const problems = containmentProblems(parseXml(sdk, c.svg), c.svg)
      assert.equal(problems.length > 0, c.flagged, json(problems))
    })
  }
  for (const c of VISIBLE) {
    for (const scheme of RENDER.schemes) {
      row(ID.visible, `${c.partition} ${scheme}`, `oracle: a ${c.partition} reads as ${c[scheme] ? 'visible' : 'invisible'} on the ${scheme} background`, async (t) => {
        const r = await rendered(t, scheme, dataUrl(c.svg))
        if (!r) return
        assert.ok(r.decoded, r.error)
        assert.equal(visiblePixels(r) >= RENDER.minVisiblePixels, c[scheme], 'visible pixels ' + visiblePixels(r) + ' on ' + r.background)
      })
    }
  }
}
