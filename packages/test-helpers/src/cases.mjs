/**
 * Case naming: every case is registered once per SDK and named
 * "<case id> <part> [SDK <version>] <what it checks>", so a report line says which partition, rule
 * or transition failed on which SDK. A part that starts with a digit is a table row ("row 3").
 */
import test from 'node:test'
import { SDK } from './constants.mjs'

export function caseName(sdk, id, part, title) {
  const label = /^\d/.test(String(part)) ? 'row ' + part : part
  return `${id} ${label} [SDK ${sdk}] ${title}`
}

/** One case; `options` are node:test's (skip, todo, timeout). */
export function caseTest(sdk, id, part, title, fn, options = {}) {
  test(caseName(sdk, id, part, title), options, fn)
}

/** Register `register(sdk)` for every supported SDK. */
export function eachSdk(register) {
  for (const sdk of SDK.versions) register(sdk)
}
