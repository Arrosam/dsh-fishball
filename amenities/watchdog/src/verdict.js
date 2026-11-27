/** Reading the judge's answer: one JSON object `{verdict, reason}` (judge.js), and its failures. */
import { JUDGE_FAILURE } from './constants.js'

const FAILURE_CODES = new Set(Object.values(JUDGE_FAILURE))

/** An Error whose `code` is a JUDGE_FAILURE word (the connector reports the code to the manager). */
export const judgeFailure = (code, cause) => Object.assign(new Error(code, cause === undefined ? undefined : { cause }), { code })

/** Whether `error` is already a judgement failure (it keeps its own code). */
export const isJudgeFailure = (error) => FAILURE_CODES.has(error?.code)

/**
 * The first `{…}` of a model answer as `{verdict, reason}` (reason '' when it is not a string), or
 * undefined when there is no such object: an unreadable answer is the judge's failure, not a pass
 * (core.js JUDGE_FAILURE.unreadable).
 */
export function parseVerdict(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    return typeof value?.verdict === 'string' ? { verdict: value.verdict, reason: typeof value.reason === 'string' ? value.reason : '' } : undefined
  } catch {
    return undefined
  }
}
