/**
 * The page's light or dark palette (U3, decided 2026-11-07; design §0.5 "Theme").
 *
 * DSH's ThemePresenter (dsh-client-ui-theme) marks dark with `data-ds-dark-theme` on `body`, and
 * ui/dsh-tokens.css keys its dark tokens on the same attribute. The framed page is served under
 * /fishball/embed/ on the main origin, so it is same-origin with the DSH page around it: it reads
 * that page's `body` attribute, sets the same attribute on its own `body`, and follows every
 * change with a MutationObserver, with no reload, so an unsent draft survives a theme switch.
 * Nothing is posted to the parent (D27: no browser message crosses the frame); the page only
 * reads one attribute.
 *
 * When there is no reachable parent (the page opened alone with "Open in a tab", a cross-origin
 * parent, a parent without a body), it follows the OS scheme through matchMedia, live. Every
 * access to the parent is guarded: a cross-origin read throws a SecurityError, which only selects
 * that fallback.
 *
 * The attribute is a DSH-internal name (present in 0.2.1-rc.5 and 0.2.2-rc.1). If DSH renames it,
 * the mirror silently shows light; a test watches the name (design §0.8 R1, R7).
 */
const THEME = Object.freeze({
  darkAttribute: 'data-ds-dark-theme',
  darkQuery: '(prefers-color-scheme: dark)',
  change: 'change',
})

/** The parent page's body when it is another, same-origin document; undefined otherwise. */
function parentBody(view) {
  try {
    const parent = view.parent
    if (parent === null || parent === undefined || parent === view) return undefined
    const body = parent.document?.body
    return body === null || body === undefined ? undefined : body
  } catch {
    return undefined
  }
}

/** Mirror the parent's attribute live; false when the observer could not be attached. */
function mirrorParent(view, own, outer) {
  const copy = () => {
    try { own.toggleAttribute(THEME.darkAttribute, outer.hasAttribute(THEME.darkAttribute)) } catch { /* the parent went away with this frame */ }
  }
  try {
    copy()
    new view.MutationObserver(copy).observe(outer, { attributes: true, attributeFilter: [THEME.darkAttribute] })
    return true
  } catch {
    return false
  }
}

/** Follow the OS scheme live; a browser without matchMedia stays on the light palette. */
function followScheme(view, own) {
  if (typeof view.matchMedia !== 'function') return
  const scheme = view.matchMedia(THEME.darkQuery)
  const apply = () => { own.toggleAttribute(THEME.darkAttribute, scheme.matches) }
  apply()
  scheme.addEventListener(THEME.change, apply)
}

/**
 * Start following the theme for one page window: the parent DSH page's attribute when it is
 * reachable, otherwise the OS scheme. Call once, after `body` exists.
 *
 * @param {Window} view - the page's own window.
 */
export function followTheme(view) {
  const own = view.document.body
  const outer = parentBody(view)
  if (outer !== undefined && mirrorParent(view, own, outer)) return
  followScheme(view, own)
}
