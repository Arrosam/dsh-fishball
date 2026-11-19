/**
 * WCAG 2.x colour arithmetic for the UI-FIX-F rows: parse a computed CSS colour, composite a colour
 * with alpha over an opaque backdrop (source-over in sRGB, as a browser paints it), relative
 * luminance and the contrast ratio. Pure; the oracle the rows compare against WCAG.text / WCAG.shape.
 */
import { WCAG } from './constants.mjs'

const CHANNEL_MAX = 255
const OPAQUE = 1
/** Computed colour syntaxes Chromium serialises: rgb()/rgba() in 0–255, and color(srgb r g b [/ a]) in 0–1. */
const RGB = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
const SRGB = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/

const alphaOf = (text) => (text === undefined ? OPAQUE : text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text))

/** `{r, g, b, a}` (channels and alpha in 0–1) of a computed colour string; throws on any other syntax. */
export function parseColour(text) {
  const value = String(text).trim()
  const rgb = RGB.exec(value)
  if (rgb) return { r: rgb[1] / CHANNEL_MAX, g: rgb[2] / CHANNEL_MAX, b: rgb[3] / CHANNEL_MAX, a: alphaOf(rgb[4]) }
  const srgb = SRGB.exec(value)
  if (srgb) return { r: Number(srgb[1]), g: Number(srgb[2]), b: Number(srgb[3]), a: alphaOf(srgb[4]) }
  throw new Error('not a computed colour this oracle reads: ' + JSON.stringify(text))
}

/** `top` (with alpha, times `opacity`) painted over the opaque `bottom`: an opaque colour. */
export function over(top, bottom, opacity = OPAQUE) {
  const a = top.a * opacity
  const mix = (channel) => top[channel] * a + bottom[channel] * (1 - a)
  return { r: mix('r'), g: mix('g'), b: mix('b'), a: OPAQUE }
}

/**
 * The opaque colour a stack of backgrounds paints, `layers` from the element outwards (the
 * element's own background first). Painting starts at the innermost opaque layer; a stack with no
 * opaque layer has no defined backdrop, so it throws instead of guessing the canvas.
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

/** WCAG 2.x contrast ratio of two opaque colours (1 to 21). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + WCAG.flare) / (lo + WCAG.flare)
}

/** A ratio as the audit reports it (two decimals). */
export const shown = (ratio) => ratio.toFixed(WCAG.digits)
