/**
 * Small I/O helpers shared by the page's form reader and the CIMD fetch.
 */
import { SECRET_ENCODING } from './constants.js'

/** The logger used when none is injected. */
export const SILENT_LOGGER = Object.freeze({ warn() {} })

/**
 * Reads a byte stream as text, stopping at `maxBytes`.
 * @returns the UTF-8 text, or `undefined` as soon as one byte more than `maxBytes` arrives
 */
export async function readCapped(stream, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > maxBytes) return undefined
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString(SECRET_ENCODING.text)
}
