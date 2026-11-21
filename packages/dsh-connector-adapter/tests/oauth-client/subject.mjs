/**
 * The one place that binds these cases to the code under test, and the in-process DSH host they run
 * in. Shared with the adapter suite, which builds on `openHost`, `tempRoot` and the leak sweep.
 *
 * - `libraryModule(sdk)`: `packages/dsh-connector-adapter/src/oauth-client.js` (C-WIRE-2, R-ARCH-08 strict), bound to `sdk` (the
 *   `?fbsdk=` tag of test/private-skills/support/sdk.mjs), with the relayed exports required. A missing
 *   module fails the case with a message that names the owning task.
 * - `mcpSdk(sdk)`: the MCP SDK `@modelcontextprotocol/client` 2.2.0 installed with that SDK. The caller
 *   hands it to the library, so the library takes no package edge.
 * - `openHost(sdk, root, {tools})`: a cordis Context of that SDK with the real `dsh-credentials-local`
 *   (file `<root>/.credentials.yaml`, watched as DSH watches it), `dsh-authorization`, and optionally
 *   `dsh-system-prompt` and `dsh-tools`. A logger exporter records every line.
 *
 * Nothing here reads or imitates the code under test. Observation is public only: the credential
 * store, the authorization seam, the fake connector's records, the logger and the files on disk.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { INSTANCE } from '../../../../test/support/constants.mjs'
import { importInstance, importSdk } from '../../../../test/private-skills/support/sdk.mjs'
import { DSH, FIXTURE, LIBRARY, SDK } from './constants.mjs'

/** Imports a repository module bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
export function importBound(sdk, file) {
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/** A module the brief relays, imported once per SDK, with its named exports required. */
export async function requireModule(sdk, { entry, exports, task }) {
  assert.ok(fs.existsSync(entry), `${path.relative(process.cwd(), entry)} does not exist yet (owned by ${task})`)
  const mod = await importBound(sdk, entry)
  for (const name of exports) assert.notEqual(mod[name], undefined, `${path.basename(entry)} exports no ${name}`)
  return mod
}

export const libraryModule = (sdk) => requireModule(sdk, LIBRARY)

/** The MCP client SDK installed with `sdk` (the one both hosts ship). */
export const mcpSdk = (sdk) => import(pathToFileURL(path.join(SDK.versionsDir, sdk, SDK.nodeModules, SDK.mcpClient.name, SDK.mcpClient.entry)).href)

const parts = new Map()
/** DSH's packages of one SDK, imported once. */
export function hostParts(sdk) {
  if (!parts.has(sdk)) {
    const names = [DSH.cordis, DSH.credentials, DSH.credentialsLocal, DSH.authorization, DSH.launchEnvironment, DSH.systemPrompt, DSH.tools, DSH.mcpClient]
    parts.set(sdk, Promise.all(names.map((n) => importSdk(sdk, n))).then((mods) => Object.fromEntries(names.map((n, i) => [n, mods[i]]))))
  }
  return parts.get(sdk)
}

/** One logger line as plain text (cordis message args joined the way the tokens suite does). */
const lineOf = (m) => ({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack ?? a.message : JSON.stringify(a) ?? String(a))).join(' ') })

/**
 * One in-process DSH host over `root`. `tools: true` adds the system prompt and the tool registry
 * (the adapter registers its sign-in tool there and the stock MCP client its tools).
 */
export async function openHost(sdk, root, { tools = false } = {}) {
  const p = await hostParts(sdk)
  const ctx = new p[DSH.cordis].Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => logs.push(lineOf(m)) })
  const env = p[DSH.launchEnvironment]
  ctx.provide(env.DSH_LAUNCH_ENVIRONMENT_KEY, env.createLaunchEnvironmentSnapshot([{ source: DSH.processLayer, values: {} }]))
  const credentialsFile = path.join(root, p[DSH.credentialsLocal].CREDENTIALS_FILENAME)
  await ctx.plugin(p[DSH.credentialsLocal].LocalCredentialProvider, { path: credentialsFile, dshHome: root }).await()
  await ctx.plugin(p[DSH.authorization].AuthorizationService).await()
  if (tools) {
    await ctx.plugin(p[DSH.systemPrompt].SystemPrompt, {}).await()
    await ctx.plugin(p[DSH.tools].default).await()
  }
  let closed = false
  return {
    ctx, logs, credentialsFile, parts: p,
    credentialKey: p[DSH.credentials].credentialKey,
    async close() {
      if (closed) return
      closed = true
      await ctx.fiber.dispose()
    },
  }
}

/** The canonical OS temp dir (`/private/var/...` on macOS), with no trailing separator. */
export const canonicalTmp = () => fs.realpathSync(os.tmpdir()).replace(/\/+$/, '')

/**
 * One cleanup stack per test, run last-in first-out from a single `t.after`, so a host closes before
 * its connector stops and before its temp root is removed.
 */
export function cleanups(t) {
  const stack = []
  t.after(async () => {
    const errors = []
    for (const fn of stack.reverse()) { try { await fn() } catch (error) { errors.push(error) } }
    if (errors.length > 0) throw errors[0]
  })
  return { defer: (fn) => { stack.push(fn) } }
}

/** A fresh temp root removed by `scope`'s cleanup (the one recursive delete, guarded). */
export function tempRoot(scope, prefix = FIXTURE.tempPrefix) {
  const base = canonicalTmp()
  const root = fs.mkdtempSync(path.join(base, prefix))
  scope.defer(() => {
    assert.ok(path.dirname(root) === base && path.basename(root).startsWith(prefix), 'refusing to remove ' + root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

/**
 * Every regular file under `dir` (not following links), as `[path, latin1 text]`. A file that
 * vanishes during the walk is skipped: other suites running at the same time may share a temp HOME
 * and create and delete their own scratch trees under it.
 *
 * The walk is explicit because `fs.readdirSync(dir, { recursive: true })` descends into symlinked
 * directories: a temp HOME holding a pnpm store has link cycles, so that walk never ends. A dirent
 * describes the entry itself (lstat semantics), so a symlink is neither descended into nor read;
 * anything reached only through a link lies outside the swept tree.
 */
export function filesUnder(dir) {
  if (!dir || !fs.existsSync(dir)) return []
  const files = []
  const pending = [dir]
  while (pending.length > 0) {
    const current = pending.pop()
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const f = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(f)
      else if (entry.isFile()) { try { files.push([f, fs.readFileSync(f, 'latin1')]) } catch { /* vanished */ } }
    }
  }
  return files
}

/**
 * The temp HOME to sweep as well (R-SEC-02: no secret in any home file), only when it is a dedicated
 * directory below the canonical temp dir, never the temp dir itself, so a shared TMPDIR's unrelated
 * trees are not swept.
 */
export function sweepableHome() {
  const home = process.env.HOME
  const base = canonicalTmp()
  return home !== undefined && home.startsWith(base + path.sep) ? [home] : []
}

/**
 * R-TOK-04 / R-SEC-02 / AUTH-EP-13: where any planted value appears. `places` maps a place name to
 * text; `dirs` are swept file by file except the `allowed` files (the credential store).
 */
export function leakHits(planted, { places = {}, dirs = [], allowed = [] }) {
  const hits = []
  const values = [...planted].filter((v) => typeof v === 'string' && v.length > 0)
  for (const [place, text] of Object.entries(places)) for (const v of values) if (String(text).includes(v)) hits.push(`${place}: ${v.slice(0, 24)}…`)
  for (const dir of dirs) {
    for (const [file, text] of filesUnder(dir)) {
      if (allowed.includes(file)) continue
      for (const v of values) if (text.includes(v)) hits.push(`file ${file}: ${v.slice(0, 24)}…`)
    }
  }
  return hits
}

/** The file mode bits of `file` (R-OA-21 rule 9: 0600). */
export const modeOf = (file) => fs.statSync(file).mode & DSH.modeBits
/** The logger's lines as one text. */
export const logText = (logs) => logs.map((l) => `${l.type} ${l.name} ${l.text}`).join('\n')
