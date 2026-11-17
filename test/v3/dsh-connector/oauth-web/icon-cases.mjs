/**
 * ICON-SET rows of the approval page (the user, 2026-11-18; criterion 5): the form page and the
 * error page draw the connector's icon inline in their decorative mark: the tile, the fish body and
 * eye, the ring, the chip and the wrench glyph, with presentation attributes only (no style
 * attribute), and the CSP still admits exactly the page's one `<style>` by its SHA-256.
 *
 * Techniques:
 * - EP over the two pages (form page, error page): each draws the same icon;
 * - a consistency guard: the inline icon equals dsh-connector's assets/connector-icon.svg in its
 *   base, ring, chip, glyph transform and wrench glyph paths (both against the criteria's values);
 * - Decision table for the CSP hash: K1's APPROVAL_LISTENER CSP hash = base64(SHA-256) of the one
 *   served `<style>`, on both pages.
 * Rows that fail on the old design: its page mark drew the old wrench (other paths, no ring, chip
 * or 0.44 glyph group).
 *
 * Level: integration over the fakes of webWorld (subject.mjs), the page read as served HTML and
 * parsed as XML (the mark's `<svg>` is serialized as XML: every element closed).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { open, row } from './cases.mjs'
import { attributes } from './browser.mjs'
import { APPROVAL_LISTENER, FIXTURE, HTTP_STATUS, PARAM, POLISH } from './constants.mjs'
import { ICON, PACKAGES, WRENCH, baseOf, glyphPaths, iconMismatch, parseXml, readIcon, walk } from '../../contract/package-boundaries/icon-set.mjs'

const ID = Object.freeze({ mark: 'ICON-WEB-EP-01', same: 'ICON-WEB-CONSIST', csp: 'ICON-WEB-DT-01' })
const CONNECTOR = PACKAGES.find((p) => p.wrench)
const STYLE_ATTR = 'style'
const SVG_END = '</svg>'

/** The inline `<svg>` of the page's `<span class="mark">`, parsed. */
function markOf(sdk, html) {
  const open = [...html.matchAll(/<span\b([^>]*)>/gi)].find((m) => (attributes(m[1]).class ?? '').split(/\s+/).includes(POLISH.cls.mark))
  assert.ok(open, 'no <span class="mark">')
  const start = html.indexOf('<svg', open.index)
  assert.ok(start > open.index, 'the mark holds no <svg>')
  return parseXml(sdk, html.slice(start, html.indexOf(SVG_END, start) + SVG_END.length))
}
const pages = async (w) => ({
  form: (await open(w)).page,
  error: (await open(w, { overrides: { [PARAM.redirectUri]: FIXTURE.redirectForeign } })).page,
})
const styleText = (html) => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
const cspHashOf = (csp) => POLISH.cspShape.exec(csp)?.[1]

export function registerIconWebCases(sdk) {
  for (const which of ['form', 'error']) {
    row(sdk, ID.mark, which + ' page', `the ${which} page's mark draws the connector icon inline: viewBox 0 0 24 24; tile, body, eye, ring, chip, then the wrench glyph group; no style attribute in it`, async (w) => {
      const page = (await pages(w))[which]
      if (which === 'error') assert.ok(page.status >= HTTP_STATUS.badRequest, 'not an error page: ' + page.status)
      const svg = markOf(sdk, page.body)
      assert.equal(svg.attrs.viewBox, ICON.viewBox)
      assert.deepEqual(iconMismatch(svg), [], 'base and badge')
      assert.deepEqual(glyphPaths(svg), [...WRENCH.paths], 'the glyph is not the wrench')
      assert.deepEqual(walk(svg).filter((e) => STYLE_ATTR in e.attrs).map((e) => e.tag), [], 'an element of the mark has a style attribute')
      assert.deepEqual(walk(svg).filter((e) => WRENCH.attr in e.attrs).map((e) => e.tag), [], 'the mark carries the old wrench hook')
    })
  }
  row(sdk, ID.same, 'page = asset', 'consistency: the form page\'s inline mark has the same base, ring, chip, glyph transform and wrench paths as dsh-connector\'s assets/connector-icon.svg', async (w) => {
    const inline = markOf(sdk, (await pages(w)).form.body)
    const asset = readIcon(sdk, CONNECTOR)
    // Width/height may differ (40 on the page, the asset's own size); the drawing is compared.
    assert.equal(inline.attrs.viewBox, asset.attrs.viewBox)
    assert.deepEqual(baseOf(inline), baseOf(asset), 'the page mark and the asset differ')
    assert.deepEqual(glyphPaths(inline), glyphPaths(asset))
    assert.deepEqual(glyphPaths(inline), [...WRENCH.paths])
  })
  row(sdk, ID.csp, 'both pages', 'APPROVAL_LISTENER.headers CSP = the served CSP on both pages, and its hash is base64(SHA-256) of the one <style>, with the icon drawn', async (w) => {
    const csp = APPROVAL_LISTENER.headers[POLISH.cspHeader]
    const hash = cspHashOf(csp)
    assert.ok(hash, 'APPROVAL_LISTENER CSP has no style hash: ' + csp)
    for (const [which, page] of Object.entries(await pages(w))) {
      assert.equal(page.headers[POLISH.cspHeader], csp, which + ': served CSP')
      const blocks = styleText(page.body)
      assert.equal(blocks.length, 1, which + ': <style> elements')
      assert.equal(createHash(POLISH.hashAlgorithm).update(blocks[0], 'utf8').digest(POLISH.hashEncoding), hash, which + ': the CSP hash is not the <style>\'s')
      assert.doesNotMatch(page.body, /<[a-z][^>]*\sstyle\s*=/i, which + ': a style= attribute')
      assert.deepEqual(iconMismatch(markOf(sdk, page.body)), [], which + ': the icon is not drawn')
    }
  })
}
