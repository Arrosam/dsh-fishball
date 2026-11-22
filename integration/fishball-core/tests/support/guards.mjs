/**
 * Core's frozen guard vocabulary (contracts/guards.d.ts of the sibling dsh-fishball checkout, types
 * only), read as declaration text: the guarded rows, the shipped preset rows and the intended policy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { coreDir } from './compose.mjs'

const FILE = path.join('contracts', 'guards.d.ts')
const blank = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
let cached
export function guards() {
  if (cached) return cached
  const text = blank(fs.readFileSync(path.join(coreDir(), FILE), 'utf8'))
  const alias = (name) => {
    const m = new RegExp('type\\s+' + name + '\\s*=([\\s\\S]*?)(?:\\n\\s*\\n|\\n(?=export|type|interface))').exec(text)
    if (!m) throw new Error('guards.d.ts declares no ' + name)
    return Object.freeze([...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]))
  }
  const body = /interface\s+IntendedPolicy\s*\{([\s\S]*?)\n\}/.exec(text)?.[1]
  if (!body) throw new Error('guards.d.ts declares no IntendedPolicy')
  const policy = {}
  for (const m of body.matchAll(/readonly\s+(\w+)\s*:\s*([^\n]+)/g)) {
    const list = /\[([^\]]*)\]/.exec(m[2])
    policy[m[1]] = list ? [...list[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : /'([^']*)'/.exec(m[2])?.[1]
  }
  cached = Object.freeze({ rows: alias('GuardedRow'), shippedPresets: alias('ShippedPresetRow'), policy: Object.freeze(policy) })
  return cached
}
