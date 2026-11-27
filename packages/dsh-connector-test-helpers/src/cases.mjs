/**
 * Case naming and registration shared by every package. A test is named
 * "<case id> <row> [SDK <DSH version>] <title>", so a run shows which DSH a row ran on and a
 * regression row can be found by its id. A `row` that does not start with a digit (a use-case
 * flow such as "main 2", or a partition such as "BVA max") is used as written.
 */
import test from 'node:test'
import { versions } from './sdk.mjs'

export function caseName(version, id, row, title) {
  const part = /^\d/.test(String(row)) ? 'row ' + row : row
  return `${id} ${part} [SDK ${version}] ${title}`
}

/** One case. `todo` (a string naming the owner) registers it as a TODO instead of running it. */
export function caseTest(version, id, row, title, fn, todo) {
  const name = caseName(version, id, row, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, fn)
}

/**
 * A case that boots a host DSH, run only when `gate.env` is `gate.on` (an integration run);
 * otherwise registered as skipped under the same name with `gate.skip`, so every run lists it.
 */
export function integrationCase(version, id, row, title, fn, gate) {
  const name = caseName(version, id, row, title)
  if (process.env[gate.env] === gate.on) test(name, fn)
  else test(name, { skip: gate.skip }, () => {})
}

export { dshInspect } from './dsh/inspect.mjs'

/** A row a later decision withdrew, kept visible as skipped with its reason. */
export function withdrawnCase(version, id, row, title, reason) {
  test(caseName(version, id, row, title), { skip: reason }, () => {})
}

/**
 * Register a suite once per DSH version of this run: day to day the current DSH only, at release
 * once per matrix version (DSH_TEST_MATRIX). `register(version)` adds the suite's cases.
 */
export function forEachVersion(register) {
  for (const version of versions()) register(version)
}