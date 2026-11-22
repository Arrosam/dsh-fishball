/**
 * LOGO-BUTTON's motion and typography rows: the parts that need a real browser. The working mark's
 * animation is a CSS animation on the drawing, and `(prefers-reduced-motion: reduce)` must stop it;
 * a static tree cannot tell a running animation from a class name, so one headless Chromium
 * (fishball-test-helpers/browser `sharedBrowser`) resolves the computed styles under the emulated
 * media preference.
 */
import { BROWSER, chromeBinary, htmlOf, sharedBrowser, stopBrowser } from 'fishball-test-helpers/browser'
import { themedDocument } from '../support/contrast.mjs'
import { HOOK, WORDMARK } from '../support/brand.mjs'

const MEDIA = Object.freeze({ feature: 'prefers-reduced-motion', reduce: 'reduce', none: 'no-preference' })
export const stopMotionBrowser = stopBrowser
export const hasChrome = () => Boolean(chromeBinary())

/**
 * Run `expression` (a function's source, applied to `arg`) in a whole document `html` with the
 * reduced-motion preference emulated; the tab closes afterwards. Shared with avatar.mjs.
 */
export async function evaluateHtml(html, expression, reduced = false, arg) {
  const { devtools } = await sharedBrowser()
  const { targetId } = await devtools.send('Target.createTarget', { url: BROWSER.blank })
  try {
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
    await devtools.send('Page.enable', {}, sessionId)
    await devtools.send('Emulation.setEmulatedMedia', { features: [{ name: MEDIA.feature, value: reduced ? MEDIA.reduce : MEDIA.none }] }, sessionId)
    const { frameTree } = await devtools.send('Page.getFrameTree', {}, sessionId)
    await devtools.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId)
    const result = await devtools.send('Runtime.evaluate', { expression: `(${expression})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
    return result.result.value
  } finally {
    await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

/** The drawing's computed animations, for a tree whose styles are the page's own sheets. */
const MOTION_PROBE = String(function probe(arg) {
  const mark = document.querySelector('[' + arg.mark + ']')
  if (!mark) return { missing: true }
  const animated = []
  for (const el of [mark, ...mark.querySelectorAll('*')]) {
    const style = getComputedStyle(el)
    if (style.animationName && style.animationName !== 'none') animated.push({ tag: el.tagName.toLowerCase(), name: style.animationName, duration: style.animationDuration, iteration: style.animationIterationCount })
  }
  return { animated }
})
const bare = (node, styleText) => `<!doctype html><html><head><meta charset="utf-8"><style>${styleText}</style></head><body>${htmlOf(node, '')}</body></html>`
/** The mark's computed animations with the preference emulated. */
export const measureMotion = (mark, styleText, reduced) => evaluateHtml(bare(mark, styleText), MOTION_PROBE, reduced, { mark: HOOK.mark })

/** The wordmark's and the tag's computed typography in the rendered name occupant. */
const TEXT_PROBE = String(function probe(arg) {
  const root = document.querySelector('[' + arg.name + ']')
  if (!root) return { missing: true }
  const exact = (text) => [...root.querySelectorAll('*')].find((el) => el.textContent.trim() === text)
  const style = (el) => (el ? { text: el.textContent.trim(), weight: getComputedStyle(el).fontWeight, size: parseFloat(getComputedStyle(el).fontSize) } : null)
  return { word: style(exact(arg.word)), tag: style(exact(arg.tag)) }
})
export const measureWords = (name, styleText) => evaluateHtml(bare(name, styleText), TEXT_PROBE, false, { name: HOOK.name, word: WORDMARK.text, tag: WORDMARK.tag })

/** The theme's accent in the drawn brand row: the tag's shadow, the count pill's fill and text colour. */
const ACCENT_PROBE = String(function probe(arg) {
  const tag = [...document.querySelectorAll('[' + arg.name + '] *')].find((el) => el.textContent.trim() === arg.tag)
  const pill = document.querySelector('[' + arg.badge + ']')
  if (!tag || !pill) return { missing: { tag: !tag, pill: !pill } }
  const own = getComputedStyle(pill)
  // "The tag shadow" does not say text or box shadow: both are read, the first one drawn counts.
  const tagStyle = getComputedStyle(tag)
  const shadow = [tagStyle.boxShadow, tagStyle.textShadow].find((value) => value && value !== 'none') ?? 'none'
  return { shadow, fill: own.backgroundColor, text: own.color }
})
/**
 * The accent probe over the whole brand button (mark and name occupants, as DSH's row holds them) in
 * DSH's full document (page styles and theme sheets, light or dark), then the brand's own sheets, so
 * DSH tokens the brand paints with resolve as on a real page.
 */
export const measureAccent = (button, styleText, theme) => evaluateHtml(themedDocument({ tree: [button], sheets: [styleText], theme }), ACCENT_PROBE, false, { name: HOOK.name, badge: HOOK.badge, tag: WORDMARK.tag })
