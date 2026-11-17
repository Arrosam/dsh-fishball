/**
 * Vocabulary for the UI-FIX-F contrast rows (USE-CASES.md in this folder).
 *
 * Sources, and only these: the user's UI-FIX-F requirements (2026-11-18: the reason textarea's
 * placeholder at least 4.5:1 against the textarea's own fill, the connected badge's text at least
 * 4.5:1 against its own fill and its shape at least 3:1 against the heading row, both DSH themes,
 * DSH tokens only, behaviour unchanged); WCAG 2.x (relative luminance, contrast ratio, 1.4.3 and
 * 1.4.11 thresholds); DSH's public theme (dsh-client-ui-theme: light is `body`, dark is
 * `body[data-ds-dark-theme]`) and its web frontend's shipped page (dsh-web-frontend/dist). No value
 * comes from the UI-FIX-F implementation, which these rows never read.
 */
import path from 'node:path'
import { SDK } from '../../contract/package-boundaries/constants.mjs'

/** WCAG 2.x: 1.4.3 (text) and 1.4.11 (non-text shape) minimum ratios, and the luminance formula's constants. */
export const WCAG = Object.freeze({
  text: 4.5,
  shape: 3,
  /** sRGB channel linearisation: c <= 0.04045 → c / 12.92, else ((c + 0.055) / 1.055) ^ 2.4. */
  srgb: Object.freeze({ knee: 0.04045, slope: 12.92, offset: 0.055, scale: 1.055, gamma: 2.4 }),
  /** Relative luminance weights (R, G, B) and the ratio's flare term. */
  weights: Object.freeze([0.2126, 0.7152, 0.0722]),
  flare: 0.05,
  /** Ratios are reported to two decimals (the screenshot audit's precision). */
  digits: 2,
})

/** DSH's themes: the light one is the theme's `body` rules, the dark one `body[data-ds-dark-theme]`. */
export const THEME = Object.freeze({
  light: Object.freeze({ id: 'light', darkAttribute: false }),
  dark: Object.freeze({ id: 'dark', darkAttribute: true }),
  attribute: 'data-ds-dark-theme',
  all: () => [THEME.light, THEME.dark],
})

/** The page languages and the placeholder each one shows (the user's words: "理由" in zh, "Reason" in en). */
export const PLACEHOLDER = Object.freeze({ en: 'Reason', zh: '理由' })

/** DSH's installed packages these rows read (both SDKs ship them). */
export const DSH_FILES = Object.freeze({
  theme: (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules', '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js'),
  frontendDist: (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist'),
  indexHtml: 'index.html',
  /** The stylesheet links of DSH's page, in document order. */
  stylesheetLink: /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  /** DSH's Tag rule names its tones (`.<class>[data-tone=success]{…}`): the class the real Tag renders. */
  tagClass: /\.([\w-]+)\[data-tone=success\]/,
  /** The label the theme gives each of its sheet effects (`ui-theme: <name> stylesheet`). */
  themeSheetLabel: /stylesheet$/,
  /** DSH's own default placeholder colour (the frontend's `::placeholder` rule): the 1.26:1 before UI-FIX-F. */
  defaultPlaceholderToken: '--dsw-alias-label-dimmed',
})

/** The drawn cards' public hooks (SPEC §2 hooks; the ask card's DOM as drawn). */
export const HOOK = Object.freeze({
  strip: '[data-fishball-strip]',
  stripState: 'data-fishball-strip-state',
  connected: 'connected',
  badge: '[data-fishball-strip-badge]',
  /** The DSH Tag holding the badge: the badge itself or its closest ancestor with a tone. */
  tag: '[data-tone]',
  askCard: '[data-fishball-ask]',
  reason: 'textarea',
  /** The DSH stand-in's primitive name for a Tag (settings/primitives.mjs STAND_IN.primitive). */
  tagPrimitive: 'Tag',
})

/**
 * RESHOOT fix 1 (the user, 2026-11-18): the ask card's state badge, a DSH Tag. An open card's Tag
 * reads the `open` words in `warning` tone; an answered or closed card's Tag is `neutral` (out of
 * the fix's scope, so it must look as DSH's own neutral Tag does). Light theme: the open badge's
 * text at least WCAG.text against its own fill (it was #F59E0B on #FDEACC, ≈1.8:1); dark theme: DSH's
 * warning Tag look unchanged (text the Tag's default warning colour, `--dsw-alias-state-warn-primary`).
 */
export const ASK_BADGE = Object.freeze({
  open: Object.freeze({ en: 'Fishball is waiting for your answer', zh: 'Fishball 正在等你回答' }),
  openTone: 'warning',
  settledTone: 'neutral',
  /** DSH's own warning Tag colour token (dsh-web-frontend's `[data-tone=warning]` rule, both SDKs). */
  warnToken: '--dsw-alias-state-warn-primary',
  /** The ask card root's attribute (HOOK.askCard as a prop name in the drawn tree). */
  cardAttr: 'data-fishball-ask',
  /** Test-owned handles the rows add to the written HTML: the measured badge, and DSH Tags drawn outside the card. */
  marker: 'data-fbtest-ask-badge',
  reference: 'data-fbtest-reference-tag',
  referenceText: 'FBTEST reference Tag',
  /** The reference Tags sit straight in the page body, outside every card. */
  pageRoot: 'body',
  /**
   * Two computed colours are the same when every channel and alpha (0–1) differ by less than half
   * of one 8-bit step: Chromium writes one colour as rgb() (0–255) or color(srgb …) (0–1 floats).
   */
  sameColourTolerance: 0.5 / 255,
})

/** Colour-bearing properties a token-only check reads, per measured element. */
export const COLOUR_PROPS = Object.freeze(['color', 'background', 'background-color', 'box-shadow', 'border', 'border-color', 'outline', 'outline-color'])
/** CSS-wide or derived colour words that are not a hard-coded colour value. */
export const NOT_LITERAL = Object.freeze(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'none'])

/** Harness only, never an oracle: why a browser row is skipped. */
export const HARNESS = Object.freeze({ skipNoChrome: 'no Chromium (FBTEST_CHROME or the Playwright headless shell) on this machine' })
