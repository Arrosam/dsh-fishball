/**
 * LOGO-BUTTON's motion rows: the only part that needs a real browser. The working mark's animation
 * is a CSS animation on the drawing, and `(prefers-reduced-motion: reduce)` must stop it; a static
 * tree cannot tell a running animation from a class name, so one headless Chromium resolves the
 * computed `animation-name` under both media values (the contrast suite's browser).
 */
import { documentOf, htmlOf } from '../contrast/page.mjs'
import { chromeBinary, launchChromium } from '../../../v2-page-cases/lite-browser.mjs'

const PAGE = Object.freeze({ blank: 'about:blank' })
let browser = null
const chromium = () => (browser ??= launchChromium().then((started) => {
  if (!started) throw new Error('no Chromium binary')
  return started
}))
export async function stopMotionBrowser() {
  const started = await browser?.catch(() => null)
  browser = null
  await started?.stop()
}
export const hasChrome = () => Boolean(chromeBinary())

/** The drawing's computed animations, for a tree whose styles are the page's own sheets. */
const PROBE = String(function probe() {
  const mark = document.querySelector('[data-fishball-logo-mark]')
  if (!mark) return { missing: true }
  const animated = []
  for (const el of [mark, ...mark.querySelectorAll('*')]) {
    const style = getComputedStyle(el)
    if (style.animationName && style.animationName !== 'none') animated.push({ tag: el.tagName.toLowerCase(), name: style.animationName, duration: style.animationDuration, iteration: style.animationIterationCount })
  }
  return { animated }
})

const evaluate = (mark, styleText, expression, reduced) =>
  evaluateHtml(`<!doctype html><html><head><meta charset="utf-8"><style>${styleText}</style></head><body>${htmlOf(mark, '')}</body></html>`, expression, reduced)
/** Run `expression` (a function's source) in a whole document `html` with the media preference emulated; shared with avatar.mjs. */
export async function evaluateHtml(html, expression, reduced = false) {
  const { devtools } = await chromium()
  const { targetId } = await devtools.send('Target.createTarget', { url: PAGE.blank })
  try {
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
    await devtools.send('Page.enable', {}, sessionId)
    await devtools.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] }, sessionId)
    const { frameTree } = await devtools.send('Page.getFrameTree', {}, sessionId)
    await devtools.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId)
    const result = await devtools.send('Runtime.evaluate', { expression: `(${expression})()`, awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
    return result.result.value
  } finally {
    await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}
/** Run the motion probe over `mark`'s serialized subtree with the media preference emulated. */
export const measureMotion = (mark, styleText, reduced) => evaluate(mark, styleText, PROBE, reduced)

/** The wordmark's and the tag's computed typography in the rendered mark. */
const TEXT_PROBE = String(function probe() {
  const root = document.querySelector('[data-fishball-logo-name]')
  if (!root) return { missing: true }
  const exact = (text) => [...root.querySelectorAll('*')].find((el) => el.textContent.trim() === text)
  const word = exact('FISHBALL')
  const tag = exact('Deepseek Harness')
  const style = (el) => (el ? { text: el.textContent.trim(), weight: getComputedStyle(el).fontWeight, size: parseFloat(getComputedStyle(el).fontSize) } : null)
  return { word: style(word), tag: style(tag) }
})
export const measureWords = (mark, styleText) => evaluate(mark, styleText, TEXT_PROBE, false)

/** The theme's accent in the drawn brand row: the tag's text shadow, the count pill's fill and text colour. */
const ACCENT_PROBE = String(function probe() {
  const tag = [...document.querySelectorAll('[data-fishball-logo-name] *')].find((el) => el.textContent.trim() === 'Deepseek Harness')
  const pill = document.querySelector('[data-fishball-logo-badge]')
  if (!tag || !pill) return { missing: { tag: !tag, pill: !pill } }
  const own = getComputedStyle(pill)
  // "The tag shadow" does not say text or box shadow: both are read, the first one drawn counts.
  const tagStyle = getComputedStyle(tag)
  const shadow = [tagStyle.boxShadow, tagStyle.textShadow].find((value) => value && value !== 'none') ?? 'none'
  return { shadow, fill: own.backgroundColor, text: own.color }
})
/**
 * Run the accent probe over the whole brand button (mark and name occupants, as DSH's row holds them)
 * in the contrast suite's full document: DSH's page styles and theme sheets (light or dark), then the
 * brand's own sheets, so DSH tokens the brand paints with resolve as on a real page.
 */
export const measureAccent = (sdk, button, styleText, theme) => evaluateHtml(documentOf(sdk, { tree: [button], sheets: [styleText], theme }), ACCENT_PROBE)
