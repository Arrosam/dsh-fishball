/**
 * ICON-SET rows of the four DSH-side packages' icons (the user, 2026-11-18; icon-set.mjs). Each
 * package declares a manifest `icon`, a relative SVG under assets/ that it ships; DSH reads it as a
 * base64 SVG data URL of at most 256 KiB; the four SVGs share one base (the FishMark on the ink tile)
 * and each draws its own badge in front of the fish, the wrench only on dsh-connector's.
 *
 * Techniques:
 * - EP over the four packages (connector, connector-ui, instance, adapter) for every per-icon rule:
 *   the manifest path, the files entry and the packed listing, well-formed XML, the base and badge;
 * - BVA on the badge's geometry: the ring's extent against the tile's edges (0 and 24) and against
 *   the old wrench's span (16.4–22.93); the glyph's coordinates against its 16-unit grid (0 and 16);
 * - Decision table, package × wrench: the glyph is exactly the wrench iff the package is
 *   dsh-connector; no other glyph holds a wrench path, and no element carries the old wrench hook;
 * - EP over DSH's reader on both SDKs: a data URL of the right type, within 256 KiB, whose bytes are
 *   the shipped file and parse as XML;
 * - a consistency guard: the four bases are identical to each other, element by element.
 * Rows that fail on the old design: three packages had no icon, and the connector's wrench was the
 * old one (other paths, no ring or chip).
 *
 * Level: unit (manifests and assets read as files) and integration (DSH's own `readPluginMeta` of
 * each SDK; `npm pack --dry-run` through observe()).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseTest } from './cases.mjs'
import { SDK } from './constants.mjs'
import { ICON, ICON_ORDER, ICON_PATH, META, PACKAGES, WRENCH, baseOf, glyphPaths, iconMismatch, parseXml, readIcon, walk } from './icon-set.mjs'
import { observe, readManifest } from './packages.mjs'

const ID = Object.freeze({ manifest: 'ICON-EP-01', svg: 'ICON-EP-02', meta: 'ICON-EP-03', distinct: 'ICON-EP-04', geometry: 'ICON-BVA-01', wrench: 'ICON-DT-01', same: 'ICON-CONSIST' })
const NUMBER = /-?\d*\.?\d+(?:e-?\d+)?/gi
/** The manifest icon as a files entry (no leading ./). */
const asFile = (icon) => icon.slice(ICON_PATH.dotSlash.length)
/** A `files` entry that ships `file`: the file itself, or its folder (with or without a trailing slash). */
const ships = (files, file) => (files ?? []).some((f) => f === file || f.replace(/\/$/, '') === path.posix.dirname(file))
const readBoot = (sdk) => import(pathToFileURL(path.join(SDK.versionsDir, sdk, META.appBoot)).href)

export function registerIconSetCases(sdk) {
  // ---------------------------------------------------------------- EP over the packages: manifest, files, packed
  for (const p of PACKAGES) {
    caseTest(sdk, ID.manifest, p.glyph, `${p.name}: package.json icon is ${p.icon} (relative, under assets/, .svg), listed in files and in the packed tarball`, async () => {
      const manifest = readManifest(p.pkg.dir)
      assert.equal(manifest?.icon, p.icon, `${p.name}: manifest icon`)
      assert.match(manifest.icon, ICON_PATH.shape, 'not a relative SVG path under assets/')
      assert.ok(!manifest.icon.split('/').includes(ICON_PATH.parent), 'the icon path leaves the package')
      assert.ok(ships(manifest.files, asFile(p.icon)), `${asFile(p.icon)} is not in files: ${JSON.stringify(manifest.files)}`)
      assert.ok(fs.statSync(p.file).isFile(), p.file + ' is missing')
      const { packed } = await observe()
      assert.ok(packed[p.name]?.includes(asFile(p.icon)), `${p.name}'s tarball does not ship ${asFile(p.icon)}`)
    })
    caseTest(sdk, ID.svg, p.glyph, `${p.name}: the icon is well-formed XML, an <svg> of viewBox 0 0 24 24 drawing tile, fish body, eye, then ring, chip and glyph group in front`, () => {
      const svg = readIcon(sdk, p)
      assert.equal(svg.tag, 'svg')
      assert.equal(svg.attrs.viewBox, ICON.viewBox)
      assert.deepEqual(iconMismatch(svg), [], `${p.name}: base and badge`)
      assert.ok(glyphPaths(svg).length > 0, 'the glyph group draws no path')
    })
    caseTest(sdk, ID.geometry, p.glyph, `${p.name}: the badge lies inside the tile (ring 11.4–23.8 within 0–24), spans more than the old wrench (16.4–22.93), and the glyph's numbers stay on its 0–16 grid`, () => {
      const svg = readIcon(sdk, p)
      const [ring, chip] = [svg.children[ICON_ORDER.indexOf('ring')], svg.children[ICON_ORDER.indexOf('chip')]]
      const extent = (c) => [Number(c.attrs.cx) - Number(c.attrs.r), Number(c.attrs.cx) + Number(c.attrs.r), Number(c.attrs.cy) - Number(c.attrs.r), Number(c.attrs.cy) + Number(c.attrs.r)]
      for (const [what, c] of [['ring', ring], ['chip', chip]]) {
        const [x0, x1, y0, y1] = extent(c)
        assert.ok(x0 >= ICON.tileMin && y0 >= ICON.tileMin && x1 <= ICON.tileMax && y1 <= ICON.tileMax, `${what} leaves the tile: ${[x0, x1, y0, y1]}`)
      }
      const [x0, x1] = extent(ring)
      assert.ok(x1 - x0 > WRENCH.old.to - WRENCH.old.from, `the ring (${x1 - x0}) is not larger than the old wrench (${WRENCH.old.to - WRENCH.old.from})`)
      assert.ok(x0 < WRENCH.old.from, 'the badge does not reach further into the tile than the old wrench')
      const glyphSpan = ICON.glyphGrid * ICON.glyphScale
      assert.ok(glyphSpan > WRENCH.old.to - WRENCH.old.from, `the glyph box (${glyphSpan}) is not larger than the old wrench`)
      assert.ok(ICON.glyphTranslate + glyphSpan <= ICON.tileMax, 'the glyph box leaves the tile')
      const off = glyphPaths(svg).flatMap((d) => (d.match(NUMBER) ?? []).map(Number)).filter((n) => n < 0 || n > ICON.glyphGrid)
      assert.deepEqual(off, [], 'glyph coordinates outside its 16-unit grid')
    })
    // Decision table, package × wrench: rule 1 (dsh-connector) → exactly the wrench; rules 2–4 → no wrench path.
    caseTest(sdk, ID.wrench, `rule ${PACKAGES.indexOf(p) + 1} ${p.glyph}`, `${p.name} → ${p.wrench ? 'its glyph is exactly the wrench' : 'no wrench path in its glyph'}; no element carries ${WRENCH.attr}`, () => {
      const svg = readIcon(sdk, p)
      const paths = glyphPaths(svg)
      if (p.wrench) assert.deepEqual(paths, [...WRENCH.paths], 'the connector glyph is not the wrench')
      else assert.deepEqual(paths.filter((d) => WRENCH.paths.includes(d)), [], `${p.name} draws a wrench path`)
      assert.deepEqual(walk(svg).filter((e) => WRENCH.attr in e.attrs).map((e) => e.tag), [], 'an element still carries the old wrench hook')
    })
  }

  // ---------------------------------------------------------------- the four glyphs differ; the four bases are one
  caseTest(sdk, ID.distinct, 'four glyphs', 'the four badge glyphs (wrench, window, server, plug) are pairwise different drawings', () => {
    const glyphs = PACKAGES.map((p) => ({ name: p.name, key: JSON.stringify(glyphPaths(readIcon(sdk, p))) }))
    const same = glyphs.flatMap((a, i) => glyphs.slice(i + 1).filter((b) => b.key === a.key).map((b) => `${a.name} = ${b.name}`))
    assert.deepEqual(same, [], 'two packages draw the same glyph')
  })
  caseTest(sdk, ID.same, 'base', 'consistency: the four SVGs share an identical base element by element (tile, body, eye, ring, chip, glyph transform and stroke)', () => {
    const bases = PACKAGES.map((p) => ({ name: p.name, base: baseOf(readIcon(sdk, p)) }))
    for (const b of bases.slice(1)) assert.deepEqual(b.base, bases[0].base, `${b.name}'s base differs from ${bases[0].name}'s`)
  })

  // ---------------------------------------------------------------- DSH's reader (both SDKs)
  for (const p of PACKAGES) {
    caseTest(sdk, ID.meta, p.glyph, `DSH ${sdk} readPluginMeta(${p.name}) → icon is a data:image/svg+xml;base64 URL ≤ 256 KiB whose bytes are ${p.icon} and parse as XML`, async () => {
      const { readPluginMeta } = await readBoot(sdk)
      const meta = readPluginMeta(p.name, META.parentURL)
      assert.equal(meta?.error, undefined, `${p.name}: DSH reported ${meta?.error}`)
      assert.equal(typeof meta?.icon, 'string', `${p.name}: DSH read no icon`)
      assert.ok(meta.icon.startsWith(META.dataPrefix), `${p.name}: not an SVG data URL: ${meta.icon.slice(0, META.dataPrefix.length)}`)
      const bytes = Buffer.from(meta.icon.slice(META.dataPrefix.length), 'base64')
      assert.ok(bytes.length > 0 && bytes.length <= META.maxBytes, `${p.name}: ${bytes.length} bytes`)
      assert.ok(bytes.equals(fs.readFileSync(p.file)), `${p.name}: DSH's icon is not the shipped file`)
      assert.equal(parseXml(sdk, bytes.toString('utf8')).tag, 'svg')
    })
  }
}
