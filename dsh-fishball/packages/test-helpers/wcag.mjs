/**
 * WCAG 2.x colour arithmetic: parse a computed CSS colour (as Chromium serialises it), composite a
 * colour with alpha over an opaque backdrop (source-over in sRGB, as a browser paints it), relative
 * luminance and the contrast ratio, and the 1.4.3 / 1.4.11 minimum ratios. Pure.
 */

/** WCAG 2.x: 1.4.3 (text) and 1.4.11 (non-text shape) minimum ratios, and the luminance formula's constants. */
export const WCAG = Object.freeze({
  text: 4.5,
  /** 1.4.3 large text and 1.4.11 user-interface components and graphics. */
  large: 3,
  shape: 3,
  /** 1.4.6 (AAA) normal text. */
  enhanced: 7,
  /** sRGB channel linearisation: c <= 0.04045 → c / 12.92, else ((c + 0.055) / 1.055) ^ 2.4. */
  srgb: Object.freeze({ knee: 0.04045, slope: 12.92, offset: 0.055, scale: 1.055, gamma: 2.4 }),
  /** Relative luminance weights (R, G, B) and the ratio's flare term. */
  weights: Object.freeze([0.2126, 0.7152, 0.0722]),
  flare: 0.05,
  /** Ratios are reported to two decimals. */
  digits: 2,
})

const CHANNEL_MAX = 255
const OPAQUE = 1
const PERCENT = 100
/** Computed colour syntaxes Chromium serialises: rgb()/rgba() in 0–255, and color(srgb r g b [/ a]) in 0–1. */
const RGB = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
const SRGB = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const alphaOf = (text) => (text === undefined ? OPAQUE : text.endsWith('%') ? Number(text.slice(0, -1)) / PERCENT : Number(text))

/** `{r, g, b, a}` (channels and alpha in 0–1) of a computed colour or a hex colour; throws on any other syntax. */
export function parseColour(text) {
  const value = String(text).trim()
  const rgb = RGB.exec(value)
  if (rgb) return { r: rgb[1] / CHANNEL_MAX, g: rgb[2] / CHANNEL_MAX, b: rgb[3] / CHANNEL_MAX, a: alphaOf(rgb[4]) }
  const srgb = SRGB.exec(value)
  if (srgb) return { r: Number(srgb[1]), g: Number(srgb[2]), b: Number(srgb[3]), a: alphaOf(srgb[4]) }
  const hex = HEX.exec(value)
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g)
    const [r, g, b, a = 'ff'] = digits.map((d) => parseInt(d, 16) / CHANNEL_MAX)
    return { r, g, b, a: typeof a === 'string' ? OPAQUE : a }
  }
  throw new Error('not a colour this oracle reads: ' + JSON.stringify(text))
}

/** `top` (with alpha, times `opacity`) painted over the opaque `bottom`: an opaque colour. */
export function over(top, bottom, opacity = OPAQUE) {
  const a = top.a * opacity
  const mix = (channel) => top[channel] * a + bottom[channel] * (1 - a)
  return { r: mix('r'), g: mix('g'), b: mix('b'), a: OPAQUE }
}

/**
 * The opaque colour a stack of backgrounds paints, `layers` (colour strings) from the element
 * outwards. Painting starts at the innermost opaque layer; a stack with no opaque layer has no
 * defined backdrop, so it throws instead of guessing the canvas.
 */
export function backdrop(layers) {
  const colours = layers.map(parseColour)
  const base = colours.findIndex((c) => c.a >= OPAQUE)
  if (base < 0) throw new Error('no opaque background behind the element: ' + JSON.stringify(layers))
  return colours.slice(0, base).reduceRight((under, layer) => over(layer, under), colours[base])
}

const linear = (c) => (c <= WCAG.srgb.knee ? c / WCAG.srgb.slope : ((c + WCAG.srgb.offset) / WCAG.srgb.scale) ** WCAG.srgb.gamma)
/** WCAG 2.x relative luminance of an opaque sRGB colour. */
export const luminance = ({ r, g, b }) => [r, g, b].map(linear).reduce((sum, c, i) => sum + c * WCAG.weights[i], 0)

/** WCAG 2.x contrast ratio of two opaque colours (`{r,g,b}` or colour strings), 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [a, b].map((c) => luminance(typeof c === 'string' ? parseColour(c) : c)).sort((x, y) => y - x)
  return (hi + WCAG.flare) / (lo + WCAG.flare)
}

/** Whether a ratio meets a minimum (`WCAG.text`, `WCAG.shape`, …). Unrounded, as WCAG compares. */
export const meets = (ratio, minimum) => ratio >= minimum

/** A ratio as an audit reports it (two decimals). */
export const shown = (ratio) => ratio.toFixed(WCAG.digits)
