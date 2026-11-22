/**
 * Colour rows' shared parts: DSH's two themes, the WCAG arithmetic (fishball-test-helpers/wcag) and
 * a full DSH document for a rendered tree (fishball-test-helpers/browser `documentOf`: DSH's page
 * styles, its theme sheets, then the page's own sheets), measured in one shared headless Chromium.
 * DSH's light theme is `body`'s rules, the dark one `body[data-ds-dark-theme]` (dsh-client-ui-theme).
 */
import { documentOf } from 'fishball-test-helpers/browser'

export { WCAG, contrast, parseColour, shown } from 'fishball-test-helpers/wcag'
export { BROWSER, PROBE, chromeBinary, dshSheetCount, measure, stopBrowser } from 'fishball-test-helpers/browser'

export const THEME = Object.freeze({
  light: Object.freeze({ id: 'light', dark: false }),
  dark: Object.freeze({ id: 'dark', dark: true }),
  all: () => [THEME.light, THEME.dark],
})

/** DSH's page in `theme` holding `tree` (rendered host nodes) and `sheets` (the page's own, after DSH's). */
export const themedDocument = ({ tree = [], sheets = [], theme = THEME.light, body = '' } = {}) => documentOf({ tree, sheets, body, dark: theme.dark })
