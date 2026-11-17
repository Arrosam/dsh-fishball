/**
 * The approval page's look (UI-POLISH-D): the one theme file of the page, and its only stylesheet.
 *
 * The page is standalone HTML on its own listener (R-OA-11, R-OA-20), so DSH's theme stylesheet is
 * not there to read. Its colours are therefore copies of DSH's own theme tokens
 * (dsh-client-ui-theme, the same values in 0.2.1-rc.5 and 0.2.2-rc.1), named after the token each
 * copies, so the page looks like DSH in both themes. Light and dark follow the browser's
 * `prefers-color-scheme`, as DSH's "system" appearance does. Revisit when DSH's palette changes.
 *
 * The stylesheet is one inline `<style>` block the CSP admits by its hash alone
 * (APPROVAL_LISTENER.headers `style-src 'sha256-…'`; the user, 2026-11-18): no 'unsafe-inline', no
 * style attribute, no stylesheet route. `PAGE_STYLE` is built once from the constants below and
 * never changes at run time, so its hash is a constant too. **Any edit here changes the hash**: put
 * the new `sha256-` value (base64 of the SHA-256 of `PAGE_STYLE`) in the CSP, or the browser drops
 * the whole style block and the page shows unstyled (still fully usable: no rule here hides a part).
 */

/** DSH's palette as the page copies it (dsh-client-ui-theme `--dsw-static-*` and the alias each feeds). */
const PALETTE = Object.freeze({
  light: Object.freeze({
    page: '#f5f6f7', // --dsw-alias-bg-module-platform (neutral-bluish-60)
    card: '#ffffff', // --dsw-alias-bg-layer-1
    field: '#ffffff', // --dsw-alias-bg-layer-3
    border: '#0000001f', // --dsw-alias-border-l3
    rule: '#0000001a', // --dsw-alias-border-l2
    fieldBorder: '#00000029', // --dsw-alias-border-l4
    label: '#0f1115', // --dsw-alias-label-primary
    secondary: '#61666b', // --dsw-alias-label-secondary
    tertiary: '#81858c', // --dsw-alias-label-tertiary
    focus: '#4176e6', // --dsw-alias-state-business-primary
    error: '#ec1313', // --dsw-alias-state-error-primary
    warn: '#dd8629', // --dsw-alias-state-warn-label (amber-600)
    warnTint: '#f59e0b', // --dsw-alias-state-warn-primary
    primary: '#0f1115', // --dsw-alias-button-primary-fill (brand-primary)
    onPrimary: '#ffffff', // --dsw-alias-label-primary-foreground
    hover: '#2631480f', // --dsw-alias-interactive-bg-hover
    shadow: '0 3px 8px 0 #0000000a, 0 0 20px 0 #0000000d', // --dsw-elevation-prominent
  }),
  dark: Object.freeze({
    page: '#151517', // --dsw-alias-bg-base (neutral-bluish-950)
    card: '#232324', // --dsw-alias-bg-layer-1 (neutral-bluish-875)
    field: '#353638', // --dsw-alias-bg-layer-3 (neutral-bluish-800)
    border: '#ffffff29',
    rule: '#ffffff1f',
    fieldBorder: '#ffffff33',
    label: '#f9fafb',
    secondary: '#cfd3d6',
    tertiary: '#adb2b8',
    focus: '#7aaaff', // deepseek-400
    error: '#f25a5a', // red-400
    warn: '#dd8629',
    warnTint: '#f59e0b',
    primary: '#f9fafb',
    onPrimary: '#0f1115',
    hover: '#ffffff14',
    shadow: '0 8px 24px 0 #00000066', // the card's .5px border is its stroke in dark
  }),
})

/**
 * The connector's mark, drawn as assets/connector-icon.svg draws it on the Plugins card (D22): an
 * ink tile, a paper fish and wrench, and Fishball's one accent, the magenta eye. The same in both
 * themes, as a launcher icon is.
 */
/**
 * The mark: assets/connector-icon.svg's paths on its 24-unit grid (FishMark from the owner's
 * fishball app with the wrench badge; dsh-connector-ui's client.shell.js FISH_MARK and WRENCH_BADGE
 * draw the same; change all three together), its colours and its size. page.js writes them as SVG
 * presentation attributes, which CSP `style-src` does not govern, so the mark keeps its size and
 * colours even if the style block were ever refused.
 */
export const MARK_SHAPE = Object.freeze({
  colors: Object.freeze({ tile: '#101010', paper: '#F2F2EE', accent: '#EC0A6E' }),
  sizePx: 40,
  wrenchStroke: 1.6,
  wrenchCap: 'round',
  viewBox: '0 0 24 24',
  tileSize: 24,
  tileRadius: 5,
  body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
  eye: 'M14.6 7.4 h2 v2 h-2 Z',
  wrench: Object.freeze(['M22.93 17.48 A2 2 0 1 1 21.52 16.07', 'M19.59 19.41 L16.4 22.6']),
})

/** DSH's type, radii and the page's measures (DSH's settings field and modal sizes). */
const METRIC = Object.freeze({
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif', // --dsh-font-family-text-default
  radiusCard: '20px', // --dsw-radius-xl
  radiusField: '12px', // --dsw-radius-md
  radiusNote: '8px', // --dsw-radius-sm
  width: '440px',
  fieldHeight: '36px',
  barPx: '3px',
  tint: Object.freeze({ warn: '12%', error: '8%', frame: '30%' }),
})

/** The page's class names, used by page.js and by the stylesheet below (one definition). */
export const PAGE_CLASS = Object.freeze({
  card: 'card',
  brand: 'brand',
  mark: 'mark',
  eyebrow: 'eyebrow',
  facts: 'facts',
  note: 'note',
  alert: 'alert',
  terms: 'terms',
  field: 'field',
  actions: 'actions',
  primary: 'primary',
  secondary: 'secondary',
})

const C = PAGE_CLASS
/** The custom properties one theme sets (`--<name>` for each PALETTE key). */
const themeVars = (palette) => Object.entries(palette).map(([name, value]) => `--${name}:${value}`).join(';')
const mix = (color, share) => `color-mix(in srgb,var(${color}) ${share},transparent)`

/**
 * The stylesheet, in one line, built from the constants above. Every rule only styles: nothing is
 * hidden or reordered in the DOM (the buttons' visual order is flex `row-reverse`, so Authorize
 * stays the form's first, Enter-key, submit button).
 */
export const PAGE_STYLE = [
  `:root{color-scheme:light dark;${themeVars(PALETTE.light)}}`,
  `@media (prefers-color-scheme:dark){:root{${themeVars(PALETTE.dark)}}}`,
  `*{box-sizing:border-box}`,
  `body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;background:var(--page);color:var(--label);font:14px/22px ${METRIC.font};-webkit-font-smoothing:antialiased}`,
  `.${C.card}{width:100%;max-width:${METRIC.width};display:flex;flex-direction:column;gap:16px;padding:28px;border:.5px solid var(--border);border-radius:${METRIC.radiusCard};background:var(--card);box-shadow:var(--shadow)}`,
  `.${C.brand}{display:flex;align-items:center;gap:12px}`,
  `.${C.mark},.${C.mark} svg{display:block;flex:none}`,
  `.${C.eyebrow}{margin:0;color:var(--tertiary);font-size:12px;line-height:18px;font-weight:500}`,
  `h1{margin:0;font-size:20px;line-height:28px;font-weight:500;overflow-wrap:anywhere}`,
  `p{margin:0}`,
  `.${C.facts}{display:flex;flex-direction:column;border:.5px solid var(--border);border-radius:${METRIC.radiusField};overflow:hidden}`,
  `.${C.facts} p{padding:10px 14px;color:var(--secondary);font-size:13px;line-height:20px;overflow-wrap:anywhere}`,
  `.${C.facts} p+p{border-top:.5px solid var(--rule)}`,
  `.${C.note},.${C.alert}{padding:10px 12px;border-radius:${METRIC.radiusNote};font-size:13px;line-height:20px;overflow-wrap:anywhere}`,
  // The text is the label colour (WCAG AA on the tint in both themes); the state colour is the
  // tint, the frame and a 3px bar at the start edge, so the box still reads as a warning or an error.
  `.${C.note}{border:.5px solid ${mix('--warnTint', METRIC.tint.frame)};border-inline-start:${METRIC.barPx} solid var(--warn);background:${mix('--warnTint', METRIC.tint.warn)};color:var(--label)}`,
  `.${C.alert}{border:.5px solid ${mix('--error', METRIC.tint.frame)};border-inline-start:${METRIC.barPx} solid var(--error);background:${mix('--error', METRIC.tint.error)};color:var(--label)}`,
  `.${C.terms}{display:flex;flex-direction:column;gap:6px;color:var(--secondary);font-size:13px;line-height:20px}`,
  `form{display:flex;flex-direction:column;gap:14px;margin:0;padding-top:4px}`,
  `.${C.field}{display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:20px;font-weight:500}`,
  `input{height:${METRIC.fieldHeight};padding:0 12px;border:.5px solid var(--fieldBorder);border-radius:${METRIC.radiusField};background:var(--field);color:var(--label);font:inherit;font-weight:400}`,
  `input::placeholder{color:var(--tertiary)}`,
  `input:focus-visible{outline:none;border-color:var(--focus)}`,
  `.${C.actions}{display:flex;flex-direction:row-reverse;gap:8px;padding-top:4px}`,
  `button{height:${METRIC.fieldHeight};padding:0 16px;border:.5px solid transparent;border-radius:${METRIC.radiusField};font:inherit;font-weight:500;cursor:pointer}`,
  `button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}`,
  `.${C.primary}{flex:1;background:var(--primary);color:var(--onPrimary)}`,
  `.${C.primary}:hover{opacity:.88}`,
  `.${C.secondary}{border-color:var(--border);background:transparent;color:var(--label)}`,
  `.${C.secondary}:hover{background:var(--hover)}`,
  `b{font-weight:600}`,
].join('')
