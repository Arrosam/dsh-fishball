/** Row registration shared by the interactions case files (one test per row, named as every V3 suite names them). */
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { BUDGET } from './constants.mjs'

const T = Object.freeze({ timeout: BUDGET.testMs })

/** A row; `todo` names its owner, `skip` a withdrawal reason (the row stays listed with why). */
export function row(sdk, id, part, title, fn, { todo, skip } = {}) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else if (skip !== undefined) test(name, { skip }, () => {})
  else test(name, T, fn)
}
/** A withdrawn V2 row: listed as skipped with the decision that withdrew it. */
export const withdrawn = (sdk, id, part, title, reason) => row(sdk, id, part, title, null, { skip: 'withdrawn: ' + reason })
