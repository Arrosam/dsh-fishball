/**
 * UI-FIX-F / RESHOOT black-box rows (README.md in this folder): WCAG contrast of the ask card's
 * reason placeholder and of the shared waiting pile's count badge, and the token-only rule, measured in a
 * real headless Chromium on what fishball-ui draws, with DSH's own theme and page styles (page.mjs).
 *
 * Techniques:
 * - Decision table UIFF-ASK-DT-01: card variant (permission, ask) × language × theme → the reason
 *   textarea shows the language's placeholder, painted at least WCAG.text against its own fill;
 * - Decision table RESHOOT-ASKBADGE-DT-01: card variant × language × theme, state open → the badge
 *   shows the shared open-request count, text at least WCAG.text against its own fill;
 * - EP UIFF-TOKENS-EP-01: every declaration of Fishball's own sheets that applies to a measured
 *   element (ask card, sidebar target list, open ask badge) is token-only;
 * - Control UIFF-ORACLE-CTRL-01: the measuring sees the audited defect (DSH's default placeholder
 *   token and DSH's own warning Tag measure below 4.5:1), so a pass is not an artefact of the page.
 * The WCAG arithmetic itself (old UIFF-ORACLE-BVA-01) is fishball-test-helpers' (HLP-WCAG-*).
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { caseTest } from 'fishball-test-helpers/cases'
import { backdrop, over } from 'fishball-test-helpers/wcag'
import { BROWSER, THEME, WCAG, chromeBinary, contrast, parseColour, shown, stopBrowser } from '../support/contrast.mjs'
import { ASK_BADGE, CARD_VARIANT, COLOUR_PROPS, CUSTOM_PROPERTY, DSH_TOKEN, HOOK, PLACEHOLDER } from './constants.mjs'
import { BADGE_TARGET, WARNING_CONTROL_TARGET, askDocument, badgeDocument, probed, sidebarDocument, warningControl } from './page.mjs'

const json = (v) => JSON.stringify(v)
const VARIANTS = Object.freeze(Object.keys(CARD_VARIANT))
const LANGS = Object.freeze(Object.keys(PLACEHOLDER))
const ASK_TARGET = `${HOOK.askCard} ${HOOK.reason}`
const token = (name) => `var(${name})`

/** The placeholder's painted colour and the textarea's painted fill. */
function placeholderPaint(result) {
  const fill = backdrop(result.layers)
  return { fill, ink: over(parseColour(result.placeholder.colour), fill, result.placeholder.opacity) }
}
/** The badge's painted fill and text, and the ratio. */
function badgePaint(result) {
  const fill = backdrop(result.toneLayers)
  const text = over(parseColour(result.text), fill)
  return { fill, text, ratio: contrast(text, fill) }
}
/** A browser row: skipped where no Chromium exists. */
function browserRow(id, row, title, fn) {
  caseTest(id, row, title, async (t) => {
    if (!chromeBinary()) { t.skip(BROWSER.skipNoChrome); return }
    await fn(t)
  })
}

export function registerContrastCases() {
  after(stopBrowser)
  // ======================================================== UIFF-ASK-DT-01: the reason placeholder
  for (const variant of VARIANTS) for (const lang of LANGS) for (const theme of THEME.all()) {
    browserRow('UIFF-ASK-DT-01', `${variant} ${lang} ${theme.id}`, `(${lang}, ${theme.id}) an open ${variant} card's reason textarea shows ${json(PLACEHOLDER[lang])}; its placeholder has at least ${WCAG.text}:1 against the textarea's own fill`, async (t) => {
      const drawn = await askDocument(t, variant, lang)
      const result = await probed(drawn, theme, { target: ASK_TARGET, root: HOOK.askCard })
      assert.equal(result.placeholderAttr, PLACEHOLDER[lang], 'placeholder text')
      const { fill, ink } = placeholderPaint(result)
      const ratio = contrast(ink, fill)
      t.diagnostic(`measured ${shown(ratio)}:1 (placeholder ${result.placeholder.colour} opacity ${result.placeholder.opacity}, fill ${json(result.layers)})`)
      assert.ok(ratio >= WCAG.text, `placeholder contrast ${shown(ratio)}:1 < ${WCAG.text}:1 (${theme.id}; placeholder ${result.placeholder.colour} opacity ${result.placeholder.opacity} over ${json(result.layers)})`)
    })
  }

  // ================================================== RESHOOT-ASKBADGE-DT-01: the shared count badge
  for (const variant of VARIANTS) for (const lang of LANGS) for (const theme of THEME.all()) {
    browserRow('RESHOOT-ASKBADGE-DT-01', `open ${variant} ${lang} ${theme.id}`, `(${lang}, ${theme.id}) the shared badge shows ${json(ASK_BADGE.singleRequestCount)} and meets ${WCAG.text}:1 text contrast`, async (t) => {
      const result = await probed(await badgeDocument(t, variant, lang), theme, { target: BADGE_TARGET, root: HOOK.body })
      assert.equal(result.shownText, ASK_BADGE.singleRequestCount, 'single-request badge count')
      const paint = badgePaint(result)
      t.diagnostic(`measured ${shown(paint.ratio)}:1 (text ${result.text}, badge ${json(result.toneLayers)})`)
      assert.ok(paint.ratio >= WCAG.text, `shared badge text contrast ${shown(paint.ratio)}:1 < ${WCAG.text}:1 (${theme.id})`)
    })
  }

  // ===================================================== UIFF-TOKENS-EP-01: DSH design tokens only
  const tokenRows = [
    ['ask card', (t) => askDocument(t, VARIANTS[0], LANGS[0]), { target: ASK_TARGET, root: HOOK.askCard }],
    // Re-baselined (MULTI-3): the status card is replaced by the sidebar target list.
    ['target list', (t) => sidebarDocument(t, LANGS[0]), { target: HOOK.expandedRow, root: HOOK.body }],
    ['shared badge', (t) => badgeDocument(t, VARIANTS[0], LANGS[0]), { target: BADGE_TARGET, root: HOOK.body }],
  ]
  for (const [label, draw, arg] of tokenRows) for (const theme of THEME.all()) {
    browserRow('UIFF-TOKENS-EP-01', `${label} ${theme.id}`, `(${theme.id}) the ${label}: every colour declaration of Fishball's own sheets on the measured elements uses DSH tokens, no hard-coded colour`, async (t) => {
      const result = await probed(await draw(t), theme, arg)
      const colourDecls = result.declarations.filter((d) => COLOUR_PROPS.includes(d.property) || d.property.startsWith(CUSTOM_PROPERTY))
      assert.ok(colourDecls.length > 0, 'precondition: Fishball\'s sheets colour the measured elements')
      assert.deepEqual(colourDecls.filter((d) => d.literals.length > 0).map((d) => `${d.selector} { ${d.property}: ${d.value} }`), [], 'declarations with hard-coded colours')
    })
  }

  // ======================================================= UIFF-ORACLE-CTRL-01: the defect is seen
  for (const theme of THEME.all()) {
    browserRow('UIFF-ORACLE-CTRL-01', `placeholder ${theme.id}`, `(${theme.id}) control: DSH's default placeholder token ${DSH_TOKEN.defaultPlaceholder} over the same textarea fill is below ${WCAG.text}:1`, async (t) => {
      const colour = token(DSH_TOKEN.defaultPlaceholder)
      const result = await probed(await askDocument(t, VARIANTS[0], LANGS[0]), theme, { target: ASK_TARGET, root: HOOK.askCard, colours: [colour] })
      const { fill } = placeholderPaint(result)
      const ratio = contrast(over(parseColour(result.colours[colour]), fill), fill)
      t.diagnostic(`control measured ${shown(ratio)}:1`)
      assert.ok(ratio < WCAG.text, `the default placeholder token measures ${shown(ratio)}:1, so the oracle cannot tell the audited defect apart`)
    })
  }
  browserRow('UIFF-ORACLE-CTRL-01', 'warning Tag light', `(light) control: DSH's own ${ASK_BADGE.openTone} Tag on the page background, outside the card, measures below ${WCAG.text}:1`, async (t) => {
    const drawn = warningControl(await askDocument(t, VARIANTS[0], LANGS[0]))
    const reference = await probed(drawn, THEME.light, { target: WARNING_CONTROL_TARGET, root: HOOK.body })
    const { ratio } = badgePaint(reference)
    t.diagnostic(`control measured ${shown(ratio)}:1 (text ${reference.text} over ${json(reference.toneLayers)})`)
    assert.ok(ratio < WCAG.text, `DSH's ${ASK_BADGE.openTone} Tag measures ${shown(ratio)}:1, so the oracle cannot tell the audited defect apart`)
  })
}
