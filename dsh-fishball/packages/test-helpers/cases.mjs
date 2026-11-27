/**
 * Case names: `<CASE-ID> <row> [DSH <version>] <title>`. The id keeps its technique suffix (EP, BVA,
 * DT, ST, UC); the version says which DSH the result is about, so release logs of several versions
 * stay apart.
 */
import test from 'node:test'
import { DSH_VERSION } from './dsh.mjs'

const NAME = Object.freeze({ rowWord: 'row ', digit: /^\d/ })

/** A part that starts with a digit is a table row (`row 3`); any other (`main 2`, `A4`) is used as it is. */
export function caseName(id, row, title, version = DSH_VERSION) {
  const part = row === undefined || row === null || row === '' ? '' : (NAME.digit.test(String(row)) ? NAME.rowWord + row : String(row)) + ' '
  return `${id} ${part}[DSH ${version}] ${title}`
}

/** Register one case: `caseTest(id, row, title, fn)` or with node:test options `caseTest(id, row, title, options, fn)`. */
export function caseTest(id, row, title, options, fn) {
  if (typeof options === 'function') return test(caseName(id, row, title), options)
  return test(caseName(id, row, title), options, fn)
}
