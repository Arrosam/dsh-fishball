/**
 * A stand-in row with a guarded or watched row id (dsh-instance, an ordinary other bundle): it
 * only appends "<row> <pid>" to `<DSH_HOME>/standin.log` when it starts, so a case can tell whether
 * the row ran in a given process. A real dsh-instance would start a nested child here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { FIXTURE } from './constants.mjs'

/** The apply of one stand-in row. */
export function standin(row) {
  return function apply() {
    fs.appendFileSync(path.join(process.env.DSH_HOME, FIXTURE.log), row + ' ' + process.pid + '\n')
  }
}
