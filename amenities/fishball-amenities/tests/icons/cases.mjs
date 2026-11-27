/**
 * Package-icon rows: the umbrella and every member it pulls in declare a manifest icon the current
 * DSH's own reader accepts, that ships, is a valid self-contained SVG, shows on light and dark themes
 * in an <img>, differs from every other one's and keeps the ICON-SET base; their library declares
 * none (constants.mjs quotes the requirement).
 *
 * Techniques:
 * - Equivalence Partitioning over the packages (PI-EP-01…06): each subject package is one partition
 *   of every per-icon rule;
 * - Decision tables: package kind × icon (PI-DT-01: a plugin declares one, a library declares none
 *   and DSH reads none); the self-contained rule over synthetic SVGs (PI-DT-02, the oracle's own
 *   check); the visibility measure over controls (PI-DT-03);
 * - Boundary values on DSH's 256 KiB limit through DSH's reader (PI-BVA-01: max - 1, max, max + 1);
 * - State: an <img> under the light and the dark scheme (PI-RENDER-01), each a fresh tab;
 * - a consistency guard (PI-CONSIST): each subject draws the ICON-SET base and badge with its own glyph.
 *
 * Not here (integration rows, README.md): the family reference (fishball-core's icon passing the same
 * rules, and each subject's base equal to it) and the distinctness against fishball-core's and
 * fishball-ui's icons — packages the umbrella does not depend on.
 *
 * Level: unit (manifests and assets read as files), integration (DSH's readPluginMeta of the current
 * DSH; npm pack --dry-run) and system (a real Chromium decoding the data URL DSH produces).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after } from 'node:test'
import { BROWSER, chromeBinary, stopBrowser } from 'fishball-test-helpers/browser'
import { caseTest } from 'fishball-test-helpers/cases'
import { LIBRARY, MEMBERS, UMBRELLA, dirOf, manifestOf } from '../support/packages.mjs'
import { packedFiles } from '../support/pack.mjs'
import { removeTemps } from '../support/temp.mjs'
import { ID, LINT, RENDER, RULE, SIZE, VISIBLE } from './constants.mjs'
import { glyphPaths, iconMismatch, parseXml } from './icon-set.mjs'
import { containmentProblems, drawingOf, filesName, iconOf, metaOf, metaOfSize, renderIcon, rootProblems, visiblePixels } from './observe.mjs'

const json = (v) => JSON.stringify(v)
/** The packages whose icons are this package's concern: the umbrella and the members it ships. */
const SUBJECTS = Object.freeze([UMBRELLA, ...MEMBERS])
/** Every package DSH's reader is given (the subjects and their library). */
const READ = Object.freeze([...SUBJECTS, LIBRARY])
const readSvg = (pkg) => {
  const { file } = iconOf(pkg)
  assert.ok(file, pkg.name + ' declares no icon')
  const text = fs.readFileSync(file, 'utf8')
  return { text, svg: parseXml(text) }
}
const dataUrl = (text) => RULE.dataPrefix + Buffer.from(text).toString('base64')

/** A rendered row: skipped, saying so, where no Chromium exists. */
async function rendered(t, scheme, src) {
  if (!chromeBinary()) { t.skip(BROWSER.skipNoChrome); return null }
  return renderIcon(scheme, src)
}

export function registerPackageIconCases() {
  after(async () => { await stopBrowser(); removeTemps() })

  for (const pkg of SUBJECTS) {
    caseTest(ID.manifest, pkg.name, `${pkg.name}: package.json icon is a relative .svg path with no scheme, a regular file inside the package after realpath`, () => {
      const { declared, file } = iconOf(pkg)
      assert.equal(typeof declared, 'string', pkg.name + ': no manifest icon (' + json(declared) + ')')
      assert.notEqual(declared.trim(), '', 'an empty icon')
      assert.doesNotMatch(declared, RULE.scheme, 'a URL, not a relative path')
      assert.ok(!declared.startsWith(RULE.slash), 'an absolute path')
      assert.ok(declared.toLowerCase().endsWith(RULE.extension), 'not an .svg file: ' + declared)
      assert.ok(fs.existsSync(file), file + ' does not exist')
      assert.ok(fs.statSync(file).isFile(), file + ' is not a regular file')
      assert.ok(fs.realpathSync(file).startsWith(dirOf(pkg) + '/'), 'the icon leaves the package: ' + fs.realpathSync(file))
    })
    caseTest(ID.shipped, pkg.name, `${pkg.name}: its "files" names the icon and npm pack --dry-run ships it`, async () => {
      const { rel } = iconOf(pkg)
      assert.ok(rel, pkg.name + ' declares no icon')
      assert.ok(filesName(manifestOf(pkg)[RULE.files], rel), rel + ' is not in files: ' + json(manifestOf(pkg)[RULE.files]))
      assert.ok((await packedFiles(dirOf(pkg))).includes(rel), 'npm pack does not ship ' + rel)
    })
    caseTest(ID.meta, pkg.name, `DSH's readPluginMeta(${pkg.name}) → no error, a data:image/svg+xml;base64 icon whose bytes are the shipped file, ≤ 256 KiB`, async () => {
      const meta = await metaOf(pkg, READ)
      assert.equal(meta?.error, undefined, pkg.name + ': DSH reported ' + meta?.error)
      assert.equal(typeof meta?.icon, 'string', pkg.name + ': DSH read no icon')
      assert.ok(meta.icon.startsWith(RULE.dataPrefix), 'not an SVG data URL: ' + meta.icon.slice(0, RULE.dataPrefix.length))
      const bytes = Buffer.from(meta.icon.slice(RULE.dataPrefix.length), 'base64')
      assert.ok(bytes.length > 0 && bytes.length <= RULE.maxBytes, bytes.length + ' bytes')
      assert.ok(bytes.equals(fs.readFileSync(iconOf(pkg).file)), "DSH's icon is not the declared file")
    })
    caseTest(ID.svg, pkg.name, `${pkg.name}: the icon is well-formed XML with one <svg> root in the SVG namespace and a viewBox of four numbers, positive width and height`, () => {
      assert.deepEqual(rootProblems(readSvg(pkg).svg), [])
    })
    caseTest(ID.contained, pkg.name, `${pkg.name}: the icon is self-contained for an <img>: no currentColor, no <script> or on* handler, no href / url() / @import leaving the document`, () => {
      const { svg, text } = readSvg(pkg)
      assert.deepEqual(containmentProblems(svg, text), [])
    })
    for (const scheme of RENDER.schemes) {
      caseTest(ID.render, `${pkg.name} ${scheme}`, `${pkg.name}: DSH's data URL decodes in an <img> under the ${scheme} scheme and draws pixels at ≥ ${RENDER.minContrast}:1 against the page`, async (t) => {
        const meta = await metaOf(pkg, READ)
        assert.equal(typeof meta?.icon, 'string', pkg.name + ': DSH read no icon')
        const r = await rendered(t, scheme, meta.icon)
        if (!r) return
        assert.ok(r.decoded, pkg.name + ': the <img> did not decode: ' + r.error)
        assert.ok(visiblePixels(r) >= RENDER.minVisiblePixels, `${pkg.name}: nothing visible on the ${scheme} background ${r.background}`)
      })
    }
    caseTest(ID.family, pkg.name, `${pkg.name}: draws the ICON-SET base (tile, fish, ring, chip, glyph frame) in order and its own glyph`, () => {
      const { svg } = readSvg(pkg)
      assert.deepEqual(iconMismatch(svg), [], 'base and badge')
      assert.ok(glyphPaths(svg).length > 0, 'the badge draws no glyph')
    })
  }

  caseTest(ID.distinct, 'amenities', `the icons of ${SUBJECTS.map((p) => p.name).join(', ')} are pairwise different drawings and glyphs`, () => {
    const drawn = SUBJECTS.map((p) => ({ name: p.name, svg: readSvg(p).svg }))
    const same = []
    drawn.forEach((a, i) => drawn.slice(i + 1).forEach((b) => {
      if (drawingOf(a.svg) === drawingOf(b.svg)) same.push(a.name + ' = ' + b.name + ' (drawing)')
      else if (json(glyphPaths(a.svg)) === json(glyphPaths(b.svg))) same.push(a.name + ' = ' + b.name + ' (glyph)')
    }))
    assert.deepEqual(same, [])
  })

  // Decision table, package kind × icon: rule 1 plugin → declares one (the rows above); rule 2 library → none.
  caseTest(ID.library, 'rule 2 ' + LIBRARY.name, `${LIBRARY.name} (a library, no dsh field) declares no icon, and DSH reads none for it`, async () => {
    const manifest = manifestOf(LIBRARY)
    assert.equal(manifest.dsh, undefined, LIBRARY.name + ' is not a library: it has a dsh field')
    assert.equal(manifest[RULE.field], undefined, LIBRARY.name + ' declares an icon')
    const meta = await metaOf(LIBRARY, READ)
    assert.equal(meta?.error, undefined, 'DSH reported ' + meta?.error)
    assert.equal(meta?.icon, undefined, 'DSH read an icon')
  })
  for (const pkg of SUBJECTS) {
    caseTest(ID.library, 'rule 1 ' + pkg.name, `${pkg.name} is a plugin (it has a dsh field), so it is one of the icon rows`, () => {
      assert.notEqual(manifestOf(pkg).dsh, undefined, pkg.name + ' has no dsh field')
    })
  }

  caseTest(ID.size, 'oracle', 'the boundary rows below are built at exactly their byte counts around 256 KiB', () => {
    assert.deepEqual(SIZE.rows.map((r) => r.bytes - RULE.maxBytes), [...SIZE.offsets])
  })
  for (const r of SIZE.rows) {
    caseTest(ID.size, r.partition, `DSH's readPluginMeta of a synthetic plugin whose icon is ${r.bytes} bytes → ${r.accepted ? 'its data URL' : 'an error and no icon'}`, async () => {
      const { meta, content } = await metaOfSize(r.bytes)
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
    caseTest(ID.lint, c.partition, `oracle: the self-contained rule ${c.flagged ? 'flags' : 'accepts'} an SVG with ${c.partition}`, () => {
      const problems = containmentProblems(parseXml(c.svg), c.svg)
      assert.equal(problems.length > 0, c.flagged, json(problems))
    })
  }
  for (const c of VISIBLE) {
    for (const scheme of RENDER.schemes) {
      caseTest(ID.visible, `${c.partition} ${scheme}`, `oracle: a ${c.partition} reads as ${c[scheme] ? 'visible' : 'invisible'} on the ${scheme} background`, async (t) => {
        const r = await rendered(t, scheme, dataUrl(c.svg))
        if (!r) return
        assert.ok(r.decoded, r.error)
        assert.equal(visiblePixels(r) >= RENDER.minVisiblePixels, c[scheme], 'visible pixels ' + visiblePixels(r) + ' on ' + r.background)
      })
    }
  }
}
