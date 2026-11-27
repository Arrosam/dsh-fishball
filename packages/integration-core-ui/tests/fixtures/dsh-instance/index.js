/** A stand-in row (guards fixture): records "<row> <pid>" in <DSH_HOME>/standin.log when it starts, nothing else. */
import fs from 'node:fs'
import path from 'node:path'

export const name = "dsh-instance"
export function apply() {
  fs.appendFileSync(path.join(process.env.DSH_HOME, 'standin.log'), "dsh-instance" + ' ' + process.pid + '\n')
}
