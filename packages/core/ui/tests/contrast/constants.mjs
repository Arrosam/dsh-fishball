/**
 * Vocabulary for the UI-FIX-F / RESHOOT contrast rows (README.md in this folder).
 *
 * Sources, and only these: the user's UI-FIX-F requirements (2026-11-18: the reason textarea's
 * placeholder at least 4.5:1 against the textarea's own fill, both DSH themes, DSH tokens only,
 * behaviour unchanged) and RESHOOT fix 1 (2026-11-18: the open ask card's warning badge); WCAG 2.x
 * (fishball-test-helpers/wcag); DSH's public theme (dsh-client-ui-theme: light is `body`, dark is
 * `body[data-ds-dark-theme]`) and its web frontend's shipped page. No value comes from the
 * implementation, which these rows never read.
 */

/** The page languages and the placeholder each one shows (the user's words: "理由" in zh, "Reason" in en). */
export const PLACEHOLDER = Object.freeze({ en: 'Reason', zh: '理由' })

/** DSH's own default placeholder colour (the frontend's `::placeholder` rule): the 1.26:1 before UI-FIX-F. */
export const DSH_TOKEN = Object.freeze({ defaultPlaceholder: '--dsw-alias-label-dimmed', warn: '--dsw-alias-state-warn-primary' })

/** The drawn cards' public hooks. */
export const HOOK = Object.freeze({
  /** The DSH Tag holding a badge: the badge itself or its closest ancestor with a tone. */
  tag: '[data-tone]',
  askCard: '[data-fishball-ask]',
  reason: 'textarea',
  /** The sidebar list's measured element: the expanded row's button (only the open row carries aria-expanded in the written HTML: a false prop is dropped). */
  expandedRow: 'button[aria-expanded]',
  body: 'body',
  /** The DSH stand-in's primitive name for a Tag. */
  tagPrimitive: 'Tag',
})

/**
 * RESHOOT fix 1 (the user, 2026-11-18): the badge's contrast and DSH warning Tag styling. The
 * question-card accordion (bdcccc66) replaces the visible waiting words with a count. The existing
 * permission/ask fixtures each represent a single request. Light: at least 4.5:1 against the
 * badge's own fill (previously ≈1.8:1); dark: DSH's warning Tag look unchanged.
 */
export const ASK_BADGE = Object.freeze({
  singleRequestCount: '1',
  openTone: 'warning',
  settledTone: 'neutral',
  cardAttr: 'data-fishball-ask',
  /** Test-owned handles the rows add to the written HTML: the measured badge, and DSH Tags drawn outside the card. */
  marker: 'data-fbtest-ask-badge',
  reference: 'data-fbtest-reference-tag',
  referenceText: 'FBTEST reference Tag',
  /**
   * Two computed colours are the same when every channel and alpha (0–1) differ by less than half
   * of one 8-bit step: Chromium writes one colour as rgb() (0–255) or color(srgb …) (0–1 floats).
   */
  sameColourTolerance: 0.5 / 255,
})

/**
 * The card variants the decision tables draw. The drawn AskCard (ask-card.d.ts) carries no offer
 * type: a permission request and an ask differ by what their descriptor carries, so the two
 * partitions are a permission card with complete arguments and an ask card without arguments.
 */
export const CARD_VARIANT = Object.freeze({
  permission: Object.freeze({ argumentsStatus: 'complete' }),
  ask: Object.freeze({ arguments: null, argumentsStatus: null }),
})

/** Colour-bearing properties a token-only check reads, per measured element. */
export const COLOUR_PROPS = Object.freeze(['color', 'background', 'background-color', 'box-shadow', 'border', 'border-color', 'outline', 'outline-color'])
/** CSS-wide or derived colour words that are not a hard-coded colour value. */
export const NOT_LITERAL = Object.freeze(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'none'])
/** A custom-property declaration (its value may hold a token). */
export const CUSTOM_PROPERTY = '--'
