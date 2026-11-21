/**
 * The U-SHELL world: a real host DSH per scenario and SDK process, with embed-UI linked and enabled,
 * the connector and instance bundles deselected (nothing launches a child), and the K3 host-only
 * services replaced by the fakes of fake-services.mjs, inserted through the home's patch file.
 * The scripted main page is R-EMBED's (../embed/page.mjs), opened under the hostname a case names:
 * its requests go to the host's loopback listener with that name in `Host` (node's fetch would
 * rewrite it), and it logs in under that name, as a browser that typed it would.
 *
 * Observation points: the page's slot registrations by serving package, the rendered entries
 * (sidebar entry, the Fishball page, its frame and status), the fakes' call record (admissions with
 * their hostname, view and language; Retry; tool registrations), every DSH log message, the page's
 * storage writes, and the files of the DSH home.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { after } from 'node:test'
import { TEST_HOMES } from '../../../../../test/support/constants.mjs'
import { bootHost, newHome, until } from '../../../../../test/support/host.mjs'
import { findAll, textOf } from '../../../../../test/support/rp-recommend.mjs'
import { runtimeOf } from '../../../../../test/v3/fishball-core/package/constants.mjs'
import { openMainPage } from '../contract/embed/page.mjs'
import { V3 } from '../../../../../test/v3/contract/package-boundaries/constants.mjs'
import { BUDGET, FAKE, HOST, HTTP_OK, INTEGRATION, LISTEN_IP, PAGE_NAME, SCENARIO, SERVICE, SLOT } from './constants.mjs'

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The home patch: the recorder first, then one fake row per service the scenario provides, and the tunnel name trusted. */
function homePatch(scenario) {
  const row = (service, config = {}) => ({ id: FAKE.rowPrefix + service, name: FAKE.module, ...(config.disabled ? { disabled: true } : {}), config: { service, ...config } })
  const services = Object.entries(scenario.services).map(([service, config]) => row(service, config))
  return [
    { insert: [row(FAKE.recorder), ...services] },
    { id: HOST.connectionRow, config: { trustedHosts: [PAGE_NAME.tunnel.header] } },
  ]
}

const hosts = new Map()
/** One booted host per scenario in this SDK process; stopped and removed after the file. */
export function hostFor(sdk, scenario) {
  if (!hosts.has(scenario)) {
    hosts.set(scenario, (async () => {
      // Canonical: the DSH home and the record file sit under the realpath of the test-homes root.
      const home = fs.realpathSync(newHome(INTEGRATION.homeLabel + '-' + scenario.label))
      const record = path.join(path.dirname(home), INTEGRATION.recordPrefix + path.basename(home) + '.jsonl')
      fs.writeFileSync(record, '')
      fs.writeFileSync(path.join(home, HOST.homePatch), JSON.stringify(homePatch(scenario), null, 2))
      const env = {
        FBTEST_DSH_RUNTIME: runtimeOf(sdk),
        FBTEST_LINK: JSON.stringify(scenario.embed === false ? [] : [{ name: V3.embed.name, dir: V3.embed.dir, enabled: true }]),
        ...HOST.pluginOff,
        [FAKE.recordEnv]: record,
      }
      const host = await bootHost(home, { env })
      await until(() => records(record).some((r) => r.kind === FAKE.kind.started), BUDGET.readyMs, BUDGET.pollMs)
      return { home, record, host, scenario }
    })())
  }
  return hosts.get(scenario)
}

export function registerCleanup() {
  after(async () => {
    for (const pending of hosts.values()) {
      const setup = await pending.catch(() => undefined)
      await setup?.host.stop().catch(() => {})
      // Guard the recursive delete: a home this file created directly under the test-homes root.
      if (setup && path.dirname(setup.home) === fs.realpathSync(TEST_HOMES) && path.basename(setup.home).startsWith(INTEGRATION.homeLabel)) {
        fs.rmSync(setup.home, { recursive: true, force: true })
        fs.rmSync(setup.record, { force: true })
      }
    }
    hosts.clear()
  })
}

/** The fakes' record (JSON lines). */
export function records(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}
export const recordsOf = (setup, kind) => records(setup.record).filter((r) => r.kind === kind)
/** Every DSH log message (any level) and the process output, as lines. */
export const logLines = (setup) => [...recordsOf(setup, FAKE.kind.log).map((r) => r.text), ...setup.host.output.split('\n')]
/** Log messages only (the recorder sees each once; stdout may repeat them, so counts use these). */
export const logMessages = (setup) => recordsOf(setup, FAKE.kind.log).map((r) => r.text)

/** The DSH launch token the host printed (`dsh web: …?token=`), which must never reach a frame URL. */
export const launchToken = (setup) => new URL(HOST.urlLine.exec(setup.host.output)[1]).searchParams.get(HOST.tokenParam)

/**
 * A page transport under one hostname: every request to `http://<name>:<port>` goes to the
 * loopback listener with `Host: <header>:<port>` as typed; redirects are followed unless the
 * request asks for `manual`, as a browser fetch does.
 */
function transportFor(port, name) {
  const pageHost = new URL(`http://${name.display}:${port}`).host
  const send = (input, init = {}, hops = 0) => new Promise((resolve, reject) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.host !== pageHost) { fetch(url, init).then(resolve, reject); return }
    const headers = Object.fromEntries(new Headers(init.headers ?? {}).entries())
    const req = http.request({ host: LISTEN_IP, port, method: init.method ?? 'GET', path: url.pathname + url.search, headers: { ...headers, host: `${name.header}:${port}` } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const location = res.headers.location
        if (location && res.statusCode >= 300 && res.statusCode < 400 && init.redirect !== 'manual' && hops < BUDGET.maxRedirects) {
          resolve(send(new URL(location, url), { ...init, method: 'GET', body: undefined }, hops + 1))
          return
        }
        const out = new Headers()
        for (const [key, value] of Object.entries(res.headers)) for (const v of [value].flat()) out.append(key, v)
        const empty = res.statusCode === 204 || res.statusCode === 304
        resolve(new Response(empty ? null : Buffer.concat(chunks), { status: res.statusCode, headers: out }))
      })
    })
    req.on('error', reject)
    if (init.body !== undefined && init.body !== null) req.write(typeof init.body === 'string' ? init.body : Buffer.from(init.body))
    req.end()
  })
  return { origin: `http://${pageHost}`, send }
}

/** Log in under `name` with the host's launch token, as a browser that opened DSH under that name. */
async function loginAs(setup, name) {
  const port = Number(new URL(setup.host.origin).port)
  const { origin, send } = transportFor(port, name)
  const login = await send(origin + '/?' + HOST.tokenParam + '=' + encodeURIComponent(launchToken(setup)), { redirect: 'manual' })
  await login.arrayBuffer()
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('the host set no cookie under ' + name.display + ' (status ' + login.status + ')')
  return { origin, cookie, send }
}

/** The same-origin markers a page's own fetch carries (DSH's browser-trust fence reads them). */
const sameOriginHeaders = (origin) => ({ origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' })

/**
 * One request to embed-UI's host routes as the owner's page under `name` sends it. `hostHeader`
 * replaces the authority's host part (the userinfo / path rows); the cookie is the owner's login.
 * Returns `{status, json}`.
 */
export async function routeCall(setup, name, method, route, body, { hostHeader } = {}) {
  const port = Number(new URL(setup.host.origin).port)
  const owner = await loginAs(setup, name)
  const { send } = hostHeader ? transportFor(port, { ...name, header: hostHeader }) : owner
  const response = await send(owner.origin + route, { method, headers: { cookie: owner.cookie, ...sameOriginHeaders(owner.origin) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, json, text }
}
/** A refusal's code: the routes answer `{ok: false, code}` (V2's sync routes nest it as `error.code`; either is read). */
export const refusalCode = (answer) => answer.json?.code ?? answer.json?.error?.code

/** Recording page storage: what embed-UI's client writes to localStorage, sessionStorage and document.cookie. */
function storageRecorder() {
  const writes = []
  const storage = (area) => {
    const items = new Map()
    return {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem(key, value) { items.set(String(key), String(value)); writes.push({ area, key: String(key), value: String(value) }) },
      removeItem: (key) => { items.delete(key) },
      clear: () => items.clear(),
      key: (i) => [...items.keys()][i] ?? null,
      get length() { return items.size },
    }
  }
  const prepare = (page) => {
    const areas = { localStorage: storage('localStorage'), sessionStorage: storage('sessionStorage') }
    Object.assign(page.sandbox, areas)
    Object.assign(page.window, areas)
    Object.defineProperty(page.document, 'cookie', { configurable: true, get: () => '', set: (value) => { writes.push({ area: 'cookie', key: '', value: String(value) }) } })
  }
  return { writes, prepare }
}

/**
 * The page's EventSource (entries by window, 2026-11-21: the browser half follows the backend's
 * snapshot to draw its sidebar entries). One GET of the events route with the owner's cookie over
 * the page's transport; each `data:` frame of the answer is one `message`. The fake backend ends
 * its answer after one frame; the source then stays open and quiet, as a live stream between frames.
 */
function eventSourceFor(host) {
  return class PageEventSource {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2
    constructor(url) {
      this.url = new URL(String(url), host.origin + '/').href
      this.readyState = PageEventSource.CONNECTING
      this.listeners = new Map()
      this.read()
    }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn) }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
    emit(type, event) {
      if (this.readyState === PageEventSource.CLOSED) return
      this['on' + type]?.(event)
      for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event)
    }
    async read() {
      const response = await host.send(this.url, { headers: { cookie: host.cookie, origin: host.origin, 'sec-fetch-site': 'same-origin' } }).catch(() => undefined)
      if (!response || response.status !== HTTP_OK) { this.emit('error', {}); return }
      this.readyState = PageEventSource.OPEN
      this.emit('open', {})
      for (const frame of (await response.text()).split('\n\n')) {
        const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice('data:'.length).replace(/^ /, '')).join('\n')
        if (data) this.emit('message', { data })
      }
    }
    close() { this.readyState = PageEventSource.CLOSED }
  }
}

/**
 * Open the scripted main page of `setup`'s host under `name` (PAGE_NAME). Returns R-EMBED's page
 * plus `embed()` (embed-UI's registrations), `storage` (its writes) and the page `origin`.
 */
export async function openPage(t, sdk, setup, name = PAGE_NAME.ipv4, options = {}) {
  const host = await loginAs(setup, name)
  const storage = storageRecorder()
  const EventSource = eventSourceFor(host)
  const prepare = (sandbox) => { storage.prepare(sandbox); sandbox.sandbox.EventSource = EventSource; sandbox.window.EventSource = EventSource }
  const page = await openMainPage(t, { sdk, host, prepare, ...options })
  const embed = () => page.registrations.filter((r) => r.owner === V3.embed.name && !r.disposed)
  // The parts are package-local chunks loaded after their fetches: wait for embed-UI's first
  // registration (none comes in some partitions), then a quiet period for the rest.
  await until(() => embed().length > 0, BUDGET.quietMs, BUDGET.pollMs)
  await settle(BUDGET.quietMs)
  return { ...page, embed, storage, origin: host.origin, cookie: host.cookie, send: host.send }
}

export const bySlot = (regs, slot) => regs.filter((r) => r.slot === slot)
// Entries by window (2026-11-21): the window main entries are keyed `fishball:<principalKey>`.
export const pageEntries = (page) => page.embed().filter((r) => r.slot === SLOT.main && String(r.key ?? '').startsWith(SLOT.pageKeyPrefix))
const iframes = (tree) => findAll(tree, (n) => n.tag === 'iframe')
const pressables = (tree) => findAll(tree, (n) => typeof n.props.onClick === 'function')

/** Click `node` as a user does. */
export async function press(node) {
  node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
  await settle(BUDGET.pollMs)
}

/**
 * "The user opens the Fishball entry" (UIM-UC-01 main 2): click embed-UI's sidebar entry, then
 * render the Fishball page (its `main` entry keyed `fishball`) and wait until it shows a frame or
 * `done(text)` holds for its text. Returns `{ view, iframe(), text(), pressables() }`.
 */
export async function openFishball(page, { done = () => false } = {}) {
  const entry = page.entries(SLOT.entry).find((e) => page.embed().some((r) => r.options === e.options))
  if (entry) {
    const fish = await page.mount(entry)
    const target = pressables(fish.tree())[0]
    if (target) await press(target)
  }
  const main = page.entries(SLOT.main).find((e) => pageEntries(page).some((r) => r.options === e.options))
  if (!main) throw new Error('embed-UI registered no Fishball page (main, key fishball:<key>)')
  const view = await page.mount(main)
  const text = () => textOf({ children: view.tree() })
  await until(() => iframes(view.tree()).length > 0 || done(text()), BUDGET.readyMs, BUDGET.pollMs)
  return { view, iframe: () => iframes(view.tree())[0] ?? null, text, pressables: () => pressables(view.tree()) }
}

/**
 * The frame's first navigation target: its `src`, or, when the src is a same-origin embed-UI
 * route, the one redirect it answers (design §4.2: the admit route re-serves the locator's URL).
 */
export async function frameTarget(page, iframe) {
  const src = new URL(iframe.props.src, page.origin)
  if (src.origin !== page.origin) return src
  const answer = await page.send(src.href, { redirect: 'manual', headers: { cookie: page.cookie } })
  await answer.arrayBuffer()
  const location = answer.headers.get('location')
  return location ? new URL(location, src) : src
}

/** Every file under the DSH home whose bytes hold one of `needles` (R-UI-06, UIM-UC-01 postconditions). */
export function homeFilesHolding(home, needles) {
  const hits = []
  for (const rel of fs.readdirSync(home, { recursive: true })) {
    const file = path.join(home, String(rel))
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.size > BUDGET.sweepFileBytes) continue
    const text = fs.readFileSync(file, 'latin1')
    for (const needle of needles) if (text.includes(needle)) hits.push(String(rel))
  }
  return hits
}

export { SCENARIO, SERVICE }
