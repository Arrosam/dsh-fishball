/**
 * Boot one disposable DSH (profile `web`, 127.0.0.1, port 0) with the S7b prototype inserted, under
 * <worktree>/.runtime/s7b-<version>-<time>. HOME, DSH_HOME and TMPDIR point there; nothing touches a
 * real DSH home. Optional extra rows (for example a stock `@deepseek-ai/dsh-mcp-client` row) are
 * inserted after the prototype. Stop: stdin EOF (DSH's graceful shutdown), SIGTERM only to the PID
 * this module spawned and only after the grace period. Throwaway spike code.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { S7B } from './constants.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// S7c keeps its throwaway homes under the OS temp dir (S7_RUNTIME); S7b's own runs default to `.runtime/`.
export const RUNTIME = process.env.S7_RUNTIME ?? path.resolve(HERE, '..', '..', '.runtime')
const LAUNCH = Object.freeze({ readyTimeoutMs: 60000, pollMs: 200, stopGraceMs: 15000, profile: 'web' })
// DSH prints its own browser admission ticket on startup; it is never kept, even in throwaway logs.
export const redactTicket = (text) => String(text).replace(/token=[^\s&"']+/g, 'token=<redacted>')

/**
 * Options added for S7c, all defaulting to S7b's behaviour: `baseRows` replaces the S7b prototype row,
 * `readyFile` names the file the inserted plugin writes once ready, `home` reuses an existing home (a
 * restart), and `profilePatch` is YAML text written to the `web` profile's own patch layer before the
 * first start (rows there are editable through DSH's ConfigEditor; `--patch` overlay rows are not).
 */
export async function launch(version, { tls, trustedHosts = [], plugin = {}, extraRows = [], label = '', baseRows, readyFile = S7B.paths.spikeFile, home: reuseHome, profilePatch } = {}) {
  if (!S7B.versions.includes(version)) throw new Error(`unsupported version ${version}`)
  const home = reuseHome ?? path.join(RUNTIME, `s7b-${version}${label ? `-${label}` : ''}-${Date.now()}`)
  mkdirSync(path.join(home, 'tmp'), { recursive: true })
  mkdirSync(path.join(home, 'cwd'), { recursive: true })
  if (profilePatch !== undefined && reuseHome === undefined) {
    mkdirSync(path.join(home, 'profiles', LAUNCH.profile), { recursive: true })
    writeFileSync(path.join(home, 'profiles', LAUNCH.profile, 'cordis.patch.yml'), profilePatch)
  }
  const patch = path.join(home, 's7b.patch.yml')
  // JSON is valid YAML; the loader reads this list as a launch patch overlay.
  // `{__jsExpr: "…"}` (S7c) is written as a YAML `!!js` scalar: flow YAML accepts a tag on a JSON string.
  const jsTags = (text) => text.replace(/\{\s*"__jsExpr":\s*("(?:[^"\\]|\\.)*")\s*\}/g, '!!js $1')
  writeFileSync(patch, jsTags(JSON.stringify([
    { id: 'client-hmr', disabled: true },
    { insert: [
      ...(baseRows ?? [{ id: 'fishball-s7b-oauth-spike', name: path.join(HERE, 'as-plugin.mjs'), config: plugin }]),
      ...extraRows,
    ] },
  ], null, 2)))
  const bin = path.join(S7B.versionsRoot, version, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const args = [bin, '--profile', LAUNCH.profile, '--patch', patch, '--host', S7B.host, '--port', '0', '--no-open']
  for (const host of trustedHosts) args.push('--trusted-host', host)
  if (tls) args.push('--tls-cert', tls.cert, '--tls-key', tls.key)
  const log = []
  const child = spawn(process.execPath, args, {
    cwd: path.join(home, 'cwd'),
    env: { PATH: process.env.PATH, HOME: home, DSH_HOME: home, TMPDIR: path.join(home, 'tmp'), DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (c) => log.push(redactTicket(c)))
  child.stderr.on('data', (c) => log.push(redactTicket(c)))
  const spikeFile = path.join(home, readyFile)
  rmSync(spikeFile, { force: true })   // a restarted home must wait for the new process, not the old file
  const deadline = Date.now() + LAUNCH.readyTimeoutMs
  while (!existsSync(spikeFile)) {
    if (child.exitCode !== null) throw new Error(`DSH ${version} exited early:\n${log.join('').slice(-4000)}`)
    if (Date.now() > deadline) { child.kill('SIGTERM'); throw new Error(`DSH ${version} not ready:\n${log.join('').slice(-4000)}`) }
    await new Promise((r) => setTimeout(r, LAUNCH.pollMs))
  }
  const info = JSON.parse(readFileSync(spikeFile, 'utf8'))
  async function stop() {
    child.stdin.end()
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM') }, LAUNCH.stopGraceMs)
    if (child.exitCode === null && child.signalCode === null) await new Promise((r) => child.once('exit', r))
    clearTimeout(timer)
    writeFileSync(path.join(home, 'dsh.log'), log.join(''), { flag: 'a' })
    return { code: child.exitCode, signal: child.signalCode }
  }
  /** Read a token value the way its owner would: from their own credential store file. */
  const credential = (ref) => {
    const text = readFileSync(path.join(home, '.credentials.yaml'), 'utf8')
    return new RegExp(`^\\s+${ref}:\\s*(\\S+)\\s*$`, 'm').exec(text)?.[1]?.replace(/^["']|["']$/g, '')
  }
  async function control(action, extra = {}) {
    const res = await fetch(info.origin + S7B.paths.control, { method: 'POST', headers: { 'x-s7b-control': info.controlKey }, body: JSON.stringify({ action, ...extra }) })
    return res.json()
  }
  return { version, home, pid: child.pid, ...info, stop, credential, control, log: () => log.join('') }
}
