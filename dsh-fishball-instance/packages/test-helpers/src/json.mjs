/** JSON views of values, for assertion messages, leak sweeps and wire frames. */

export const CLIP = Object.freeze({
  /** A text longer than this is shown clipped. */
  maxChars: 200,
  /** How many characters of its head and of its tail a clipped text keeps. */
  keepChars: 80,
})

/** A value as JSON, for an assertion message or a case title. */
export const show = (value) => JSON.stringify(value)

/** `show` for a text that may be long: past CLIP.maxChars, its head and tail with its length between. */
export const showClipped = (text) => show(text.length > CLIP.maxChars ? text.slice(0, CLIP.keepChars) + '…(' + text.length + ' chars)…' + text.slice(-CLIP.keepChars) : text)

/** A deep text of any value (Buffers as hex), for leak sweeps; '' for undefined. */
export const textOf = (value) => JSON.stringify(value, (_, v) => (Buffer.isBuffer(v) ? v.toString('hex') : v)) ?? ''

/** A JSON text parsed, or undefined when it is not JSON. */
export const parseJson = (text) => { try { return JSON.parse(text) } catch { return undefined } }
