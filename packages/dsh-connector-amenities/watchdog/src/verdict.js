/** Reading the judge's answer: one JSON object `{verdict, reason}` (judge.js). */
import { VERDICT } from './constants.js'

export const PASS = Object.freeze({ verdict: VERDICT.pass, reason: '' })

/** The first `{…}` of a model answer as `{verdict, reason}`, or PASS. */
export function parseVerdict(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return PASS
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    return typeof value?.verdict === 'string' ? { verdict: value.verdict, reason: typeof value.reason === 'string' ? value.reason : '' } : PASS
  } catch {
    return PASS
  }
}
