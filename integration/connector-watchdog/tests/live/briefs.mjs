import fs from 'node:fs'
import path from 'node:path'
import { WD } from './constants.mjs'

/** Every brief in the profile's briefs.json (wherever DSH's home puts the profile). */
export function findBriefs(home) {
  const files = fs.readdirSync(home, { recursive: true }).filter((f) => f.endsWith(path.join(WD.store.dir, WD.store.file)))
  return files.flatMap((f) => { try { return JSON.parse(fs.readFileSync(path.join(home, f), 'utf8')).briefs } catch { return [] } })
}
