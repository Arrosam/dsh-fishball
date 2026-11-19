/**
 * UI-FIX-F black-box rows (USE-CASES.md in this folder): WCAG contrast of the ask card's reason
 * placeholder and of the status card's connected badge, measured in a real headless Chromium on
 * the cards fishball-ui draws, with DSH's own theme and page styles (page.mjs says how and why).
 *
 * Techniques:
 * - Decision table UIFF-ASK-DT-01: card type (permission, ask) × language (en, zh) × theme (light,
 *   dark) → the reason textarea shows the language's placeholder, and the placeholder's painted
 *   colour has at least WCAG.text (4.5:1) against the textarea's own painted fill;
 * - UIFF-STRIP-DT-01 (withdrawn by MULTI-3: no status card; the sidebar target list replaces it and
 *   is checked token-only in UIFF-TOKENS-EP-01);
 * - Decision table RESHOOT-ASKBADGE-DT-01 (RESHOOT fix 1): card type × language × theme, state
 *   open → the card's state badge reads the open words in a `warning` DSH Tag, its text at least
 *   WCAG.text against its own painted fill; dark: text and fill equal DSH's own warning Tag drawn
 *   outside the card, and the text equals `--dsw-alias-state-warn-primary` (DSH's look unchanged);
 * - State transitions RESHOOT-ASKBADGE-ST-01: open → answered / closed × theme → the badge is a
 *   `neutral` DSH Tag that looks exactly as DSH's own neutral Tag (out of fix 1's scope);
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
import { sidebarPage, snapshotOf as snapshotOfTargets, targetView, viewModule, withSource } from '../model-dialog/targets.mjs'
import { FIXTURE as TARGET_FIXTURE, SEAM_TARGETS, WITHDRAWN } from '../model-dialog/targets-constants.mjs'
import { withdrawnRow } from '../model-dialog/withdrawn.mjs'
import { chromeBinary } from '../../../v2-page-cases/lite-browser.mjs'
import { ASK_BADGE, COLOUR_PROPS, DSH_FILES, HARNESS, HOOK, NOT_LITERAL, PLACEHOLDER, THEME, WCAG } from './constants.mjs'
import { PROBE, documentOf, dshSheetCount, holds, measure, sheetCollector, stopBrowser } from './page.mjs'
import { backdrop, contrast, over, parseColour, shown } from './wcag.mjs'
import { STAND_IN } from '../../fishball-core/settings/primitives.mjs'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'

const json = (v) => JSON.stringify(v)
const CARD_TYPES = Object.freeze([EVENT_TYPE.permission, EVENT_TYPE.ask])
const LANGS = Object.freeze(Object.keys(PLACEHOLDER))
const DEFAULT_PLACEHOLDER = `var(${DSH_FILES.defaultPlaceholderToken})`

// ------------------------------------------------------------------------------- the two pages

/** One open card of `type` in Fishball's conversation dock, drawn in `lang`: its tree and live sheets. */
async function askDocument(t, sdk, type, lang) {
  const sheets = sheetCollector()
  const page = await cardPage(t, sdk, { lang, onDocument: sheets.onDocument })
  await page.show([withSource(expectedCard(askEvent({ type }), K3.state.open))])
  return { tree: page.world.shim.tree(), sheets: sheets.live() }
}

/**
 * MULTI-3: the sidebar target list on Fishball's page (requirement G: DSH tokens only, light and
 * dark), one target per public state, the connected one expanded: its tree and live sheets.
 */
async function sidebarDocument(t, sdk, lang) {
  const sheets = sheetCollector()
  const page = await sidebarPage(t, sdk, { lang, onDocument: sheets.onDocument })
  const states = Object.values(SEAM_TARGETS.state)
  const { targetsView } = await viewModule(sdk)
  const frame = targetsView(snapshotOfTargets(states.map((state, i) => targetView(i, { state }))), lang, TARGET_FIXTURE.zones[0])
  await page.deliver(frame)
  await page.toggle(frame.targets[0].name)
  assert.equal(page.rows().length, states.length, 'precondition: one row per state')
  return { tree: page.world.shim.treeOf(TARGET_FIXTURE.mountKey + 'sidebar'), sheets: sheets.live() }
}

const ASK_TARGET = `${HOOK.askCard} ${HOOK.reason}`
/**
 * The sidebar list's measured element: the expanded row's button and everything up to the body.
 * page.mjs writes a `true` prop as a bare attribute and drops a `false` one, so only the open row
 * carries `aria-expanded` in the written HTML.
 */
const SIDEBAR_TARGET = 'button[aria-expanded]'

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

// ------------------------------------------------------------- RESHOOT fix 1: the ask card's badge

const isTag = (n) => n.props?.[STAND_IN.primitive] === HOOK.tagPrimitive
/** A copy of `nodes` with `attr` added to every element `pick` accepts (the written HTML's handle). */
const marked = (nodes, pick, attr) => nodes.map((n) => (typeof n === 'string' ? n
  : { ...n, props: pick(n) ? { ...n.props, [attr]: '' } : n.props, children: marked(n.children ?? [], pick, attr) }))
/** DSH Tags of `tones` drawn straight in the page body, outside every card: DSH's own Tag look. */
const referenceTags = (tones) => tones.map((tone) => ({ tag: 'span', props: { [STAND_IN.primitive]: HOOK.tagPrimitive, 'data-tone': tone, [ASK_BADGE.reference]: tone }, children: [ASK_BADGE.referenceText] }))
const BADGE_TARGET = `${HOOK.askCard} [${ASK_BADGE.marker}]`
const referenceTarget = (tone) => `[${ASK_BADGE.reference}="${tone}"]`

/**
 * One card of `type` in `state`, drawn in `lang`, its state badge marked (the first DSH Tag inside
 * the card root: DSH's Tag forwards no hook of its own), with reference warning and neutral Tags
 * beside the card. Returns the drawn document and the badge's rendered node.
 */
async function badgeDocument(t, sdk, type, lang, state) {
  const sheets = sheetCollector()
  const page = await cardPage(t, sdk, { lang, onDocument: sheets.onDocument })
  await page.show([withSource(expectedCard(askEvent({ type }), state))])
  const tree = page.world.shim.tree()
  const card = findAll(tree, (n) => n.props?.[ASK_BADGE.cardAttr] !== undefined)[0]
  assert.ok(card, 'precondition: the dock draws an ask card')
  const badge = findAll([card], isTag)[0]
  assert.ok(badge, 'precondition: the ask card draws a DSH Tag (its state badge)')
  const tags = referenceTags([ASK_BADGE.openTone, ASK_BADGE.settledTone])
  return { drawn: { tree: [...marked(tree, (n) => n === badge, ASK_BADGE.marker), ...tags], sheets: sheets.live() }, badge }
}

/** The badge's computed text, its painted fill and text, and the ratio. */
function askBadgePaint(result) {
  const fill = backdrop(result.toneLayers)
  const text = over(parseColour(result.text), fill)
  return { fill, text, ratio: contrast(text, fill) }
}

/** Whether two computed colours are the same colour (every channel and alpha within ASK_BADGE.sameColourTolerance). */
function sameColour(a, b) {
  const [x, y] = [parseColour(a), parseColour(b)]
  return ['r', 'g', 'b', 'a'].every((c) => Math.abs(x[c] - y[c]) < ASK_BADGE.sameColourTolerance)
}

/** The measured badge and the reference Tag of `tone` in one document. */
async function badgeAndReference(sdk, drawn, theme, tone) {
  const badge = await probed(sdk, drawn, theme, { target: BADGE_TARGET, tone: HOOK.tag, root: HOOK.askCard })
  const reference = await probed(sdk, drawn, theme, { target: referenceTarget(tone), tone: HOOK.tag, root: ASK_BADGE.pageRoot })
  return { badge, reference }
}

/** Assert the badge looks as DSH's own Tag of the same tone (text colour and own background). */
function assertDshTagLook(badge, reference, what) {
  assert.ok(sameColour(badge.text, reference.text), `${what}: badge text ${badge.text} is not DSH's Tag text ${reference.text}`)
  assert.ok(sameColour(badge.toneLayers[0], reference.toneLayers[0]), `${what}: badge background ${badge.toneLayers[0]} is not DSH's Tag background ${reference.toneLayers[0]}`)
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

  // ================================================== UIFF-STRIP-DT-01 (withdrawn)
  // Re-baselined (MULTI-3 requirement D): the status card is gone, so its badge rows are withdrawn;
  // the sidebar list's colours are checked token-only below (UIFF-TOKENS-EP-01 target list).
  for (const lang of LANGS) for (const theme of THEME.all()) withdrawnRow(sdk, 'UIFF-STRIP-DT-01', `connected ${lang} ${theme.id}`, `(${lang}, ${theme.id}) connected status badge contrast`, WITHDRAWN.strip)

  // ====================================== RESHOOT-ASKBADGE-DT-01: the open ask card's warning badge
  const WARN_TOKEN = `var(${ASK_BADGE.warnToken})`
  for (const type of CARD_TYPES) {
    for (const lang of LANGS) {
      for (const theme of THEME.all()) {
        const dark = theme === THEME.dark
        browserRow(sdk, 'RESHOOT-ASKBADGE-DT-01', `open ${type} ${lang} ${theme.id}`, `(${lang}, ${theme.id}) an open ${type} card's badge reads ${json(ASK_BADGE.open[lang])} in a ${ASK_BADGE.openTone} DSH Tag; its text has at least ${WCAG.text}:1 against the badge's own fill${dark ? `; dark: the text is DSH's own ${ASK_BADGE.openTone} Tag colour (${ASK_BADGE.warnToken}) and the fill DSH's, unchanged` : ''}`, async (t) => {
          const { drawn, badge } = await badgeDocument(t, sdk, type, lang, K3.state.open)
          assert.equal(textOf(badge).trim(), ASK_BADGE.open[lang], 'badge words')
          assert.equal(badge.props['data-tone'], ASK_BADGE.openTone, 'badge tone')
          const { badge: result, reference } = await badgeAndReference(sdk, drawn, theme, ASK_BADGE.openTone)
          const paint = askBadgePaint(result)
          t.diagnostic(`measured ${shown(paint.ratio)}:1 (text ${result.text}, badge ${json(result.toneLayers)}; DSH ${ASK_BADGE.openTone} Tag text ${reference.text} ${shown(askBadgePaint(reference).ratio)}:1)`)
          assert.ok(paint.ratio >= WCAG.text, `ask badge text contrast ${shown(paint.ratio)}:1 < ${WCAG.text}:1 (${theme.id}, SDK ${sdk}; text ${result.text} over ${json(result.toneLayers)})`)
          if (dark) {
            assertDshTagLook(result, reference, `dark, DSH's ${ASK_BADGE.openTone} Tag`)
            const withToken = await probed(sdk, drawn, theme, { target: BADGE_TARGET, tone: HOOK.tag, root: HOOK.askCard, colours: [WARN_TOKEN] })
            assert.ok(sameColour(result.text, withToken.colours[WARN_TOKEN]), `dark: badge text ${result.text} is not ${ASK_BADGE.warnToken} (${withToken.colours[WARN_TOKEN]})`)
          }
        })
      }
    }
  }

  // ======================== RESHOOT-ASKBADGE-ST-01: an answered / closed card's badge is unchanged
  for (const state of [K3.state.answered, K3.state.closed]) {
    for (const theme of THEME.all()) {
      browserRow(sdk, 'RESHOOT-ASKBADGE-ST-01', `${state} ${theme.id}`, `(${theme.id}) a card moved to ${state}: its badge is a ${ASK_BADGE.settledTone} DSH Tag that looks as DSH's own ${ASK_BADGE.settledTone} Tag (text and fill unchanged)`, async (t) => {
        const { drawn, badge } = await badgeDocument(t, sdk, EVENT_TYPE.permission, LANGS[0], state)
        assert.equal(badge.props['data-tone'], ASK_BADGE.settledTone, 'badge tone')
        assert.notEqual(textOf(badge).trim(), ASK_BADGE.open[LANGS[0]], 'a settled card does not say it is waiting')
        const { badge: result, reference } = await badgeAndReference(sdk, drawn, theme, ASK_BADGE.settledTone)
        t.diagnostic(`badge text ${result.text} on ${result.toneLayers[0]}; DSH ${ASK_BADGE.settledTone} Tag ${reference.text} on ${reference.toneLayers[0]}`)
        assertDshTagLook(result, reference, `${theme.id}, DSH's ${ASK_BADGE.settledTone} Tag`)
      })
    }
  }

  // ===================================================== UIFF-TOKENS-EP-01: DSH design tokens only
  const tokenRows = [
    ['ask card', (t) => askDocument(t, sdk, EVENT_TYPE.permission, LANGS[0]), { target: ASK_TARGET, root: HOOK.askCard }],
    // Re-baselined (MULTI-3): the status card is replaced by the sidebar target list.
    ['target list', (t) => sidebarDocument(t, sdk, LANGS[0]), { target: SIDEBAR_TARGET, root: 'body' }],
    // RESHOOT fix 1: the open ask card's badge, its colours drawn from DSH tokens only.
    ['open ask badge', async (t) => (await badgeDocument(t, sdk, EVENT_TYPE.permission, LANGS[0], K3.state.open)).drawn, { target: BADGE_TARGET, tone: HOOK.tag, root: HOOK.askCard }],
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
  // Re-baselined (MULTI-3): the control of the withdrawn status-badge rows is withdrawn with them.
  withdrawnRow(sdk, 'UIFF-ORACLE-CTRL-01', 'success tone light', '(light) control: DSH\'s plain success colour over the status badge fill', WITHDRAWN.strip)

  browserRow(sdk, 'UIFF-ORACLE-CTRL-01', 'warning Tag light', `(light) control: DSH's own ${ASK_BADGE.openTone} Tag on the page background, outside the card, measures below ${WCAG.text}:1`, async (t) => {
    const { drawn } = await badgeDocument(t, sdk, EVENT_TYPE.permission, LANGS[0], K3.state.open)
    const { reference } = await badgeAndReference(sdk, drawn, THEME.light, ASK_BADGE.openTone)
    const { ratio } = askBadgePaint(reference)
    t.diagnostic(`control measured ${shown(ratio)}:1 (text ${reference.text} over ${json(reference.toneLayers)})`)
    assert.ok(ratio < WCAG.text, `DSH's ${ASK_BADGE.openTone} Tag measures ${shown(ratio)}:1, so the oracle cannot tell the audited defect apart`)
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

