/**
 * What the succession cases observe and do in a real hosted setup (a host DSH with the sibling
 * checkout's connector and this checkout's instance, which launches a real child): the connector's
 * own owner-only routes, DSH's own session API, the instance's hosted.json (README "The hosted
 * token": `<DSH_HOME>/fishball/hosted.json`, format in src/host/hosted-record.js JSDoc) and the
 * instance's shipped uninstall.js (README "Uninstall"). Nothing of the connector or the instance is
 * imported.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { untilValue } from '@dsh-instance/test-helpers/host-dsh'
import { INSTANCE } from './constants.mjs'

/** The connector's and DSH's routes these cases use (connector src/settings-page and src/ui constants; DSH dsh-client-connection). */
export const ROUTE = Object.freeze({
  /** GET → {ok, entries: [{key, label, enabled, paired, id, name, connected, …}]} in settings order. */
  tokens: '/api/dsh-connector/settings/state',
  /** GET → {ok, state: {marks: [{sessionId, principal: {key, name, id}}], targets, …}}. */
  ui: '/api/dsh-connector/ui/state',
  /** POST {sessionId, principalKey} → {ok, principal}. */
  handOver: '/api/dsh-connector/ui/handover',
  /** DSH's own Connection RPC for session.create (what its browser page calls). */
  sessionCreate: '/api/session/create',
  sessionMethod: 'session/create',
})
export const HOSTED_LABEL = 'Fishball (hosted)'
/** The default name a hosted Fishball pairs with (connector README: the default "Fishball"). */
export const DEFAULT_NAME = 'Fishball'
export const POLL_MS = 100

export const hostedFile = (home) => path.join(home, 'fishball', 'hosted.json')
export const readHosted = (home) => JSON.parse(fs.readFileSync(hostedFile(home), 'utf8'))
/** Rewrite hosted.json while the host is down (keeps its private mode). */
export function writeHosted(home, edit) {
  const record = readHosted(home)
  edit(record)
  fs.writeFileSync(hostedFile(home), JSON.stringify(record))
}

export const tokenEntries = async (host) => (await host.get(ROUTE.tokens)).json?.entries ?? []
export const uiState = async (host) => (await host.get(ROUTE.ui)).json?.state
/** Wait (no deadline) until the token entries satisfy `test`; answers them. */
export const entriesWhen = (host, test) => untilValue(async () => { const e = await tokenEntries(host); return test(e) && e }, POLL_MS)

/** A new ordinary session of the host DSH, created as its page creates one. */
export async function newSession(host, cwd) {
  fs.mkdirSync(cwd, { recursive: true })
  const r = await host.post(ROUTE.sessionCreate, { type: 'client-request', rpcId: randomUUID(), method: ROUTE.sessionMethod, payload: { args: { request: { cwd } } } })
  const id = r.json?.result?.value?.sessionId
  if (typeof id !== 'string') throw new Error('harness: session.create answered ' + r.status + ' ' + r.text.slice(0, 300))
  return id
}

/** The principal a token entry's pair has, as the UI backend lists its targets (matched by the pair's id). */
export async function principalOf(host, entry) {
  const target = (await uiState(host))?.targets?.find((t) => t.id === entry.id)
  if (!target) throw new Error('harness: no Hand over target for entry ' + entry.key)
  return target.key
}

/** Hand `sessionId` over to `principalKey` (the connector's Hand over route). */
export async function handOver(host, sessionId, principalKey) {
  const r = await host.post(ROUTE.handOver, { sessionId, principalKey })
  if (r.json?.ok !== true) throw new Error('harness: handover answered ' + r.status + ' ' + r.text.slice(0, 300))
}

/** The manager mark of `sessionId` in the UI snapshot, or undefined. */
export const markOf = async (host, sessionId) => (await uiState(host))?.marks?.find((m) => m.sessionId === sessionId)

/** A reinstall as the user does it: the instance's uninstall.js with DSH quit (it removes the child runtime only). */
export function uninstall(home) {
  execFileSync(process.execPath, [INSTANCE.uninstall, '--home', home], { stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * Every distinct hosted.json text seen while `fn` runs, sampled every millisecond (the host is
 * another process, so this loop is free to run); for a short-lived state such as a pending succession.
 */
export async function watchHosted(home, fn) {
  const seen = []
  const timer = setInterval(() => {
    try { const t = fs.readFileSync(hostedFile(home), 'utf8'); if (seen.at(-1) !== t) seen.push(t) } catch { /* between writes */ }
  }, 1)
  try { await fn() } finally { clearInterval(timer) }
  return seen.map((t) => { try { return JSON.parse(t) } catch { return null } }).filter(Boolean)
}
