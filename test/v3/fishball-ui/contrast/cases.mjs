/**
 * UI-FIX-F black-box rows (USE-CASES.md in this folder): WCAG contrast of the ask card's reason
 * placeholder and of the status card's connected badge, measured in a real headless Chromium on
 * the cards fishball-ui draws, with DSH's own theme and page styles (page.mjs says how and why).
 *
 * Techniques:
 * - Decision table UIFF-ASK-DT-01: card type (permission, ask) × language (en, zh) × theme (light,
 *   dark) → the reason textarea shows the language's placeholder, and the placeholder's painted
 *   colour has at least WCAG.text (4.5:1) against the textarea's own painted fill;
 * - Decision table UIFF-STRIP-DT-01: language × theme, state connected → badge text at least 4.5:1
 *   against the badge's own painted fill; badge shape (fill or outline) at least WCAG.shape (3:1)
 *   against the heading row behind it;
 * - Equivalence partitions UIFF-TOKENS-EP-01: every declaration of Fishball's own sheets that
 *   applies to a measured element (the textarea and its card; the badge's Tag, its heading row and
 *   card) is token-only: no hard-coded colour (hex, colour function, named colour);
 * - Boundary values UIFF-ORACLE-BVA-01 (no browser): the WCAG oracle at its edges — 1:1, 21:1,
 *   #767676 / #777777 on white either side of 4.5, alpha compositing, Chromium's two colour syntaxes;
 * - Control UIFF-ORACLE-CTRL-01: the measuring itself sees the audited defect — DSH's default
 *   placeholder token (`--dsw-alias-label-dimmed`) over the same textarea fill and DSH's plain
 *   success colour over the badge's light-theme fill are both below 4.5:1, so a pass above is not
 *   an artefact of the page.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { cardPage } from '../../fishball-core/asks/render.mjs'
import { EVENT_TYPE, K3 } from '../../fishball-core/asks/constants.mjs'
import { askEvent, expectedCard } from '../../fishball-core/asks/world.mjs'
import { snapshotOf, stripPage } from '../model-dialog/strip.mjs'
import { chromeBinary } from '../../../v2-page-cases/lite-browser.mjs'
import { COLOUR_PROPS, DSH_FILES, HARNESS, HOOK, NOT_LITERAL, PLACEHOLDER, THEME, WCAG } from './constants.mjs'
import { PROBE, documentOf, dshSheetCount, holds, measure, sheetCollector, stopBrowser } from './page.mjs'
import { backdrop, contrast, over, parseColour, shown } from './wcag.mjs'

const json = (v) => JSON.stringify(v)
const CARD_TYPES = Object.freeze([EVENT_TYPE.permission, EVENT_TYPE.ask])
const LANGS = Object.freeze(Object.keys(PLACEHOLDER))
/** The success tone's colour token (the DSH Tag's `success` tone colour, before UI-FIX-F). */
const SUCCESS_TOKEN = 'var(--dsw-alias-state-success-primary)'
const DEFAULT_PLACEHOLDER = `var(${DSH_FILES.defaultPlaceholderToken})`

// ------------------------------------------------------------------------------- the two pages

/** One open card of `type` in Fishball's conversation dock, drawn in `lang`: its tree and live sheets. */
async function askDocument(t, sdk, type, lang) {
  const sheets = sheetCollector()
  const page = await cardPage(t, sdk, { lang, onDocument: sheets.onDocument })
  await page.show([expectedCard(askEvent({ type }), K3.state.open)])
  return { tree: page.world.shim.tree(), sheets: sheets.live() }
}

/** The status card in the connected state, drawn in `lang`: its tree and live sheets. */
async function stripDocument(t, sdk, lang) {
  const sheets = sheetCollector()
  const page = await stripPage(t, sdk, { lang, onDocument: sheets.onDocument })
  await page.show(snapshotOf(HOOK.connected))
  assert.equal(page.root()?.props[HOOK.stripState], HOOK.connected, 'precondition: the card is in the connected state')
  return { tree: page.tree(), sheets: sheets.live() }
}

const ASK_TARGET = `${HOOK.askCard} ${HOOK.reason}`
const STRIP_TARGET = `${HOOK.strip}[${HOOK.stripState}="${HOOK.connected}"] ${HOOK.badge}`

/** Draw, write the document for `theme`, and probe `arg` in Chromium. */
async function probed(sdk, drawn, theme, arg) {
  const html = documentOf(sdk, { ...drawn, theme })
  const result = await measure(html, PROBE, { ownSheetsFrom: dshSheetCount(sdk), notLiteral: NOT_LITERAL, ...arg })
  assert.equal(result.missing, undefined, `no element ${json(result.missing)} in the drawn card`)
  return result
}

/** The placeholder's painted colour and the textarea's painted fill. */
function placeholderPaint(result) {
  const fill = backdrop(result.layers)
  return { fill, ink: over(parseColour(result.placeholder.colour), fill, result.placeholder.opacity) }
}

/** The badge's painted text and fill, the heading row's painted fill, and the shape's best ratio. */
function badgePaint(result) {
  const fill = backdrop(result.toneLayers)
  const row = backdrop(result.behindLayers)
  const text = over(parseColour(result.text), backdrop(result.layers))
  const shapes = [{ kind: 'fill', ratio: contrast(fill, row) }, ...result.outlines.map((o) => ({ kind: o.kind, ratio: contrast(over(parseColour(o.colour), fill), row) }))]
  const best = shapes.reduce((a, b) => (b.ratio > a.ratio ? b : a))
  return { fill, row, text, textRatio: contrast(text, fill), shapes, best }
}

/** A browser row: skipped (as the LITE rows are) where no Chromium exists. */
function browserRow(sdk, id, row, title, fn) {
  caseTest(sdk, id, row, title, async (t) => {
    if (!chromeBinary()) { t.skip(HARNESS.skipNoChrome); return }
    await fn(t)
  })
}

export function registerContrastCases(sdk) {
  after(stopBrowser)
  // ======================================================== UIFF-ASK-DT-01: the reason placeholder
  for (const type of CARD_TYPES) {
    for (const lang of LANGS) {
      for (const theme of THEME.all()) {
        browserRow(sdk, 'UIFF-ASK-DT-01', `${type} ${lang} ${theme.id}`, `(${lang}, ${theme.id}) an open ${type} card's reason textarea shows ${json(PLACEHOLDER[lang])}; its placeholder has at least ${WCAG.text}:1 against the textarea's own fill`, async (t) => {
          const drawn = await askDocument(t, sdk, type, lang)
          assert.ok(holds(drawn.tree, (n) => n.tag === HOOK.reason), 'precondition: the card draws a reason textarea')
          const result = await probed(sdk, drawn, theme, { target: ASK_TARGET, root: HOOK.askCard })
          assert.equal(result.placeholderAttr, PLACEHOLDER[lang], 'placeholder text')
          const { fill, ink } = placeholderPaint(result)
          const ratio = contrast(ink, fill)
          t.diagnostic(`measured ${shown(ratio)}:1 (placeholder ${result.placeholder.colour} opacity ${result.placeholder.opacity}, fill ${json(result.layers)})`)
          assert.ok(ratio >= WCAG.text, `placeholder contrast ${shown(ratio)}:1 < ${WCAG.text}:1 (${theme.id}, SDK ${sdk}; placeholder ${result.placeholder.colour} opacity ${result.placeholder.opacity} over ${json(result.layers)})`)
        })
      }
    }
  }

  // ================================================== UIFF-STRIP-DT-01: the connected state badge
  for (const lang of LANGS) {
    for (const theme of THEME.all()) {
      browserRow(sdk, 'UIFF-STRIP-DT-01', `connected ${lang} ${theme.id}`, `(${lang}, ${theme.id}) connected: the badge text has at least ${WCAG.text}:1 against the badge's own fill; the badge's fill or outline has at least ${WCAG.shape}:1 against the heading row behind it`, async (t) => {
        const drawn = await stripDocument(t, sdk, lang)
        assert.ok(holds(drawn.tree, (n) => n.props['data-primitive'] === HOOK.tagPrimitive), 'precondition: the card draws a DSH Tag')
        const result = await probed(sdk, drawn, theme, { target: STRIP_TARGET, tone: HOOK.tag, behind: 'parent', root: HOOK.strip })
        assert.ok(result.shownText.length > 0, 'precondition: the badge shows a word')
        const paint = badgePaint(result)
        t.diagnostic(`measured text ${shown(paint.textRatio)}:1, shape ${paint.best.kind} ${shown(paint.best.ratio)}:1 (all shapes ${json(paint.shapes.map((s) => [s.kind, shown(s.ratio)]))}; text ${result.text}, badge ${json(result.toneLayers)}, row ${json(result.behindLayers)}, outlines ${json(result.outlines)})`)
        assert.ok(paint.textRatio >= WCAG.text, `badge text contrast ${shown(paint.textRatio)}:1 < ${WCAG.text}:1 (${theme.id}, SDK ${sdk}; text ${result.text} over ${json(result.toneLayers)})`)
        assert.ok(paint.best.ratio >= WCAG.shape, `badge shape contrast ${shown(paint.best.ratio)}:1 < ${WCAG.shape}:1 against the heading row (${theme.id}, SDK ${sdk}; ${json(paint.shapes.map((s) => [s.kind, shown(s.ratio)]))})`)
      })
    }
  }

  // ===================================================== UIFF-TOKENS-EP-01: DSH design tokens only
  const tokenRows = [
    ['ask card', (t) => askDocument(t, sdk, EVENT_TYPE.permission, LANGS[0]), { target: ASK_TARGET, root: HOOK.askCard }],
    ['status card', (t) => stripDocument(t, sdk, LANGS[0]), { target: STRIP_TARGET, tone: HOOK.tag, behind: 'parent', root: HOOK.strip }],
  ]
  for (const [label, draw, arg] of tokenRows) {
    for (const theme of THEME.all()) {
      browserRow(sdk, 'UIFF-TOKENS-EP-01', `${label} ${theme.id}`, `(${theme.id}) the ${label}: every colour declaration of Fishball's own sheets on the measured elements uses DSH tokens, no hard-coded colour`, async (t) => {
        const result = await probed(sdk, await draw(t), theme, arg)
        const colourDecls = result.declarations.filter((d) => COLOUR_PROPS.includes(d.property) || d.property.startsWith('--'))
        assert.ok(colourDecls.length > 0, 'precondition: Fishball\'s sheets colour the measured elements')
        const literal = colourDecls.filter((d) => d.literals.length > 0)
        assert.deepEqual(literal.map((d) => `${d.selector} { ${d.property}: ${d.value} }`), [], 'declarations with hard-coded colours')
      })
    }
  }

  // ======================================================= UIFF-ORACLE-CTRL-01: the defect is seen
  for (const theme of THEME.all()) {
    browserRow(sdk, 'UIFF-ORACLE-CTRL-01', `placeholder ${theme.id}`, `(${theme.id}) control: DSH's default placeholder token ${DSH_FILES.defaultPlaceholderToken} over the same textarea fill is below ${WCAG.text}:1`, async (t) => {
      const result = await probed(sdk, await askDocument(t, sdk, EVENT_TYPE.permission, LANGS[0]), theme, { target: ASK_TARGET, root: HOOK.askCard, colours: [DEFAULT_PLACEHOLDER] })
      const { fill } = placeholderPaint(result)
      const ratio = contrast(over(parseColour(result.colours[DEFAULT_PLACEHOLDER]), fill), fill)
      t.diagnostic(`control measured ${shown(ratio)}:1`)
      assert.ok(ratio < WCAG.text, `the default placeholder token measures ${shown(ratio)}:1, so the oracle cannot tell the audited defect apart`)
    })
  }
  browserRow(sdk, 'UIFF-ORACLE-CTRL-01', 'success tone light', `(light) control: DSH's plain success colour as the badge text over the badge's own fill is below ${WCAG.text}:1`, async (t) => {
    const result = await probed(sdk, await stripDocument(t, sdk, LANGS[0]), THEME.light, { target: STRIP_TARGET, tone: HOOK.tag, behind: 'parent', root: HOOK.strip, colours: [SUCCESS_TOKEN] })
    const { fill } = badgePaint(result)
    const ratio = contrast(over(parseColour(result.colours[SUCCESS_TOKEN]), fill), fill)
    t.diagnostic(`control measured ${shown(ratio)}:1`)
    assert.ok(ratio < WCAG.text, `the plain success colour measures ${shown(ratio)}:1, so the oracle cannot tell the audited defect apart`)
  })

  // ========================================================= UIFF-ORACLE-BVA-01: the WCAG oracle
  const WHITE = 'rgb(255, 255, 255)'
  const oracleRows = [
    ['same colour', 'rgb(118, 118, 118)', 'rgb(118, 118, 118)', (r) => assert.equal(shown(r), shown(1))],
    ['black on white', 'rgb(0, 0, 0)', WHITE, (r) => assert.equal(shown(r), shown(21))],
    ['#767676 on white (just above 4.5)', 'rgb(118, 118, 118)', WHITE, (r) => assert.ok(r >= WCAG.text, shown(r))],
    ['#777777 on white (just below 4.5)', 'rgb(119, 119, 119)', WHITE, (r) => assert.ok(r < WCAG.text, shown(r))],
    ['color(srgb) syntax equals rgb()', 'color(srgb 0 0 0)', WHITE, (r) => assert.equal(shown(r), shown(21))],
    ['fully transparent ink is the backdrop', 'rgba(0, 0, 0, 0)', WHITE, (r) => assert.equal(shown(r), shown(1))],
  ]
  for (const [row, ink, ground, check] of oracleRows) {
    caseTest(sdk, 'UIFF-ORACLE-BVA-01', row, `the WCAG oracle: ${row}`, () => {
      const fill = backdrop([ground])
      check(contrast(over(parseColour(ink), fill), fill))
    })
  }
  caseTest(sdk, 'UIFF-ORACLE-BVA-01', 'alpha compositing', 'the WCAG oracle: 50% black over white paints mid grey; a translucent layer over an opaque one composites; no opaque layer throws', () => {
    const grey = over(parseColour('rgba(0, 0, 0, 0.5)'), parseColour(WHITE))
    assert.deepEqual([grey.r, grey.g, grey.b].map((c) => c.toFixed(WCAG.digits)), ['0.50', '0.50', '0.50'])
    assert.deepEqual(backdrop(['rgba(0, 0, 0, 0)', 'color(srgb 0 0 0 / 0.5)', WHITE]), grey)
    assert.throws(() => backdrop(['rgba(0, 0, 0, 0)']), /no opaque background/)
  })
}

