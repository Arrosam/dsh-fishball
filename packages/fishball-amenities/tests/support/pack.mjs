/**
 * What `npm pack --dry-run` would ship from a package folder: its JSON listing, scripts ignored (so the
 * checkout is never written), offline. The runner already gives npm a throwaway HOME, cache and no
 * user config (fishball-test-helpers/runner isolatedEnv).
 */
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PACK = Object.freeze({
  command: 'npm',
  args: Object.freeze(['pack', '--dry-run', '--json', '--ignore-scripts']),
  env: Object.freeze({ npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' }),
  /** A lifecycle line could precede npm's JSON report; the report starts at the first "[". */
  jsonStart: /^\[/m,
  maxStdoutBytes: 16 * 1024 * 1024,
})
const posix = (p) => p.split(path.sep).join('/')

const packs = new Map()
/** Every package-relative POSIX path the package at `dir` ships (cached per folder for the file). */
export function packedFiles(dir) {
  if (!packs.has(dir)) {
    packs.set(dir, run(PACK.command, [...PACK.args], { cwd: dir, env: { ...process.env, ...PACK.env }, maxBuffer: PACK.maxStdoutBytes }).then(({ stdout }) => {
      const [report] = JSON.parse(stdout.slice(stdout.search(PACK.jsonStart)))
      return report.files.map((f) => posix(f.path)).sort()
    }))
  }
  return packs.get(dir)
}
