/**
 * V3-S6 harness: boots one installed DSH SDK in-process on a throwaway DSH_HOME under the
 * worktree's .runtime/, with a scripted fake model. Every home-like variable (HOME, DSH_HOME,
 * DSH_AGENTS_HOME, npm/pnpm caches and stores) points under .runtime/, so no real DSH home,
 * profile, credential or ~/.npmrc is read. Usage: SDK=<version> node spikes/v3-s6/<scenario>.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import os from 'node:os'

export const SDK = process.env.SDK ?? '0.2.1-rc.5'
/** The real user's home, read once at import, before isolateHome redirects HOME. Used only for read-only SDK and browser paths. */
export const REAL_HOME = process.env.S6_REAL_HOME ?? os.homedir()
export const SDK_ROOT = path.join(REAL_HOME, 'Library', 'Application Support', 'DSH', 'data', 'versions', SDK, 'node_modules')
export const WORKTREE = path.resolve(import.meta.dirname, '..', '..')
export const RUNTIME_DIR = path.join(WORKTREE, '.runtime', 'v3-s6')
export const TARBALLS = path.join(WORKTREE, '.runtime', 'tarballs')
export const RESULTS = path.join(import.meta.dirname, 'results')
export const PROFILE = 's6'
export const FAKE = Object.freeze({ provider: 'fishball-spike', model: 'spike-model' })
/** The guard row ids of the core fixture, in patch order (the report must name exactly these). */
export const CORE_PACKAGES = Object.freeze({ core: 'fishball-core', board: 'fishball-board', instance: 'fishball-instance' })

/** Import a module of the selected SDK by package-relative path, so it is the instance DSH loads. */
export const sdk = (spec) => import(pathToFileURL(path.join(SDK_ROOT, spec)).href)
export const sdkPkg = (name) => sdk(path.join('@deepseek-ai', name, 'lib', 'index.js'))

/** A fresh isolated home; every home-like variable is redirected into it before any SDK import. */
export function isolateHome(id, reuse) {
  const home = reuse ?? path.join(RUNTIME_DIR, `${id}-${SDK}-${Date.now()}`)
  for (const dir of ['dsh', 'agents', 'user', 'npm-cache', 'pnpm-store', 'work']) fs.mkdirSync(path.join(home, dir), { recursive: true })
  Object.assign(process.env, {
    HOME: path.join(home, 'user'),
    DSH_HOME: path.join(home, 'dsh'),
    DSH_AGENTS_HOME: path.join(home, 'agents'),
    npm_config_cache: path.join(home, 'npm-cache'),
    npm_config_userconfig: path.join(home, 'user', '.npmrc'),
    npm_config_store_dir: path.join(home, 'pnpm-store'),
    XDG_CONFIG_HOME: path.join(home, 'user', '.config'),
    XDG_DATA_HOME: path.join(home, 'user', '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, 'user', '.cache'),
    DSH_TELEMETRY_DISABLED: '1',
  })
  return { home, dshHome: process.env.DSH_HOME, profileDir: path.join(process.env.DSH_HOME, 'profiles', PROFILE), cwd: path.join(home, 'work') }
}

/** Initialize the profile from the shipped web template (an ordinary DSH Web profile). */
export async function initProfile(iso) {
  const { initializeProfileFromDefault } = await sdk('@deepseek-ai/dsh/lib/profile-boot.js')
  initializeProfileFromDefault(PROFILE, 'web', iso.dshHome)
}

/** Write a patch-list overlay file (JSON is a YAML subset) and return its path. */
export function writePatch(dir, name, rows) {
  const file = path.join(dir, name)
  fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n')
  return file
}

/** The fake model row and default model, as a --patch overlay (they are spike plumbing, not guards). */
export function spikeOverlay(iso) {
  return writePatch(iso.home, 'spike.patch.yml', [
    { id: 'agent-default-model', config: { provider: FAKE.provider, model: FAKE.model } },
    { insert: [{ id: 'spike-llm', name: path.join(import.meta.dirname, 'fake-llm.mjs') }] },
  ])
}

/** Boot the profile in-process; extra overlay files are applied after the spike overlay (launch overlays). */
export async function boot(iso, { overlays = [], port = '0' } = {}) {
  process.chdir(iso.cwd)
  const { runProfile } = await sdk('@deepseek-ai/dsh/lib/profile-boot.js')
  const { loadLayeredEnv } = await sdkPkg('dsh-app-boot')
  let url
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (http\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }
  const stderr = []
  const writeErr = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk, ...rest) => { stderr.push(String(chunk)); return writeErr(chunk, ...rest) }
  const { ctx, shutdown } = await runProfile({
    environment: loadLayeredEnv('dsh'), profile: PROFILE,
    patchFiles: [spikeOverlay(iso), ...overlays],
    args: ['--no-open', '--host', '127.0.0.1', '--port', port],
  })
  await until(() => url !== undefined, 15000)
  return { ctx, shutdown, url: () => url, stderr }
}

/** Run `dsh plugin --profile s6 <args>` of the selected SDK in a child process (DSH's native install path). */
export async function dshPlugin(args) {
  const { execFileSync } = await import('node:child_process')
  const bin = path.join(SDK_ROOT, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  try {
    return { ok: true, out: execFileSync(process.execPath, [bin, 'plugin', '--profile', PROFILE, ...args], { env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (error) {
    return { ok: false, out: String(error.stdout ?? '') + String(error.stderr ?? '') }
  }
}

/** The profile's own patch layer (what the owner edits). */
export const profilePatchPath = (iso) => path.join(iso.profileDir, 'cordis.patch.yml')

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export async function until(predicate, timeoutMs = 10000, stepMs = 25) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) { if (await predicate()) return true; await sleep(stepMs) }
  return Boolean(await predicate())
}

/** Record one scenario's evidence under results/<id>-<sdk>.json, print it and exit. */
export function record(id, evidence) {
  fs.mkdirSync(RESULTS, { recursive: true })
  const out = { id, sdk: SDK, node: process.version, at: new Date().toISOString(), ...evidence }
  fs.writeFileSync(path.join(RESULTS, `${id}-${SDK}.json`), JSON.stringify(out, null, 2) + '\n')
  console.log('[s6-result]', JSON.stringify(out, null, 2))
}

process.on('exit', (code) => { if (code !== 0) console.error('[s6] exit', code) })
for (const event of ['unhandledRejection', 'uncaughtException']) process.prependListener(event, (reason) => console.error('[s6]', event, reason?.stack ?? reason))
