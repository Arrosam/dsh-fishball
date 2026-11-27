/**
 * fishball-core's booted DSH world, parent side: a real standalone DSH (fishball-test-helpers
 * dsh-world) with fishball-core installed as a bundle, fishball-shared beside it as a library
 * (`selected: false`, both linked as DSH's native add links them), the scripted model, and core's
 * world ops (./core-world-ext.mjs). No other Fishball package: a row that needs fishball-ui,
 * fishball-taskboard or the board installed beside core is an integration row.
 *
 * - `corePackages(more)`: the packages list (core's own folder via import.meta.dirname; fishball-shared
 *   by NAME, resolved from core's own dependency, never by its folder).
 * - `bootCore(home, options)`: one boot; `options` as dsh-world's, plus `homePatch` (a patch list
 *   written to the home's cordis.patch.yml before DSH starts), `profileConfig` (initial main-row
 *   settings in the writable profile patch), and `handoff` (the hosted stand-in's DSH_AGENT_TOKEN).
 * - `requestAs(h, route, {authority, origin, body})`: an owner POST over the listener's socket with an
 *   explicit Host (fetch() cannot set Host), signed in on that authority first.
 *
 * Owned by the wire area (packages/core/tests/support/ is port-core-wire's); manager/ and
 * message-user/ use it too.
 */
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { bootWorld, newHome } from 'fishball-test-helpers/dsh-world'
import { CORE_WORLD } from './core-world-names.mjs'

export { CORE_WORLD }
/** fishball-core's own folder (this file is packages/<core>/tests/support/). */
export const CORE_DIR = path.join(import.meta.dirname, '..', '..')
/** fishball-shared's folder, from the module resolution of core's dependency (by name). */
export const SHARED_DIR = path.dirname(createRequire(path.join(CORE_DIR, 'package.json')).resolve(CORE_WORLD.shared + '/package.json'))
export const CORE_EXTENSION = path.join(import.meta.dirname, 'core-world-ext.mjs')

/** The packages of a core world: the library, then core (selected), then `more` (a test's own fixtures). */
export const corePackages = (more = []) => [{ dir: SHARED_DIR, name: CORE_WORLD.shared, selected: false }, { dir: CORE_DIR, name: CORE_WORLD.core }, ...more]

/** A home-level config row for cases that exercise home patch reconciliation. */
export const corePatch = (config) => [{ id: CORE_WORLD.core, name: CORE_WORLD.main, config }]
/** The direct native tool fixture, instead of a model script that calls run_code. */
export const NATIVE_MANAGER = Object.freeze({ ptc: false })

const HTTP = Object.freeze({ get: 'GET', post: 'POST', json: 'application/json', cookieEnd: ';', cookieSeparator: '; ', tokenParam: 'token', encoding: 'utf8' })

/** Environment for one boot (the home patch and the handoff, when given). */
export const coreEnv = ({ homePatch, profileConfig, handoff, env = {} } = {}) => ({
  ...env,
  ...(homePatch === undefined ? {} : { [CORE_WORLD.env.homePatch]: JSON.stringify(homePatch) }),
  ...(profileConfig === undefined ? {} : { [CORE_WORLD.env.profileConfig]: JSON.stringify(profileConfig) }),
  ...(handoff === undefined ? {} : { [CORE_WORLD.env.handoff]: handoff }),
})

/** One DSH process with core on `home` (a newHome when omitted). */
export function bootCore(home, { packages = [], overlay = [], homePatch, profileConfig, handoff, env } = {}) {
  return bootWorld(home ?? newHome(CORE_WORLD.core), { packages: corePackages(packages), overlay, extension: CORE_EXTENSION, env: coreEnv({ homePatch, profileConfig, handoff, env }) })
}

/** One request over the listener's socket with an explicit Host. */
function raw(h, { method, route, authority, headers, body = {} }) {
  const target = new URL(h.origin)
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: target.hostname, port: target.port, path: route, method, headers: { ...headers, host: authority } }, (res) => {
      let text = ''
      res.setEncoding(HTTP.encoding).on('data', (d) => { text += d }).on('end', () => { let json; try { json = JSON.parse(text) } catch { json = undefined } resolve({ status: res.statusCode, headers: res.headers, json, text }) })
    })
    req.on('error', reject)
    req.end(method === HTTP.post ? JSON.stringify(body) : undefined)
  })
}

/**
 * An owner POST from a page at Host `authority` with Origin `origin` (omitted: no Origin header).
 * DSH's browser cookie is bound to the request authority, so the launch token signs this authority in
 * first, as a browser opening that address would; DSH's own fence (dsh-client-connection
 * isTrustedApiRequest) still judges the Host/Origin pair before core.
 */
export async function requestAs(h, route, { authority, origin, body }) {
  h.cookies ??= {}
  if (h.cookies[authority] === undefined) {
    const login = await raw(h, { method: HTTP.get, route: '/?' + HTTP.tokenParam + '=' + encodeURIComponent(h.token), authority, headers: {} })
    h.cookies[authority] = [login.headers['set-cookie'] ?? []].flat().map((c) => c.split(HTTP.cookieEnd)[0]).join(HTTP.cookieSeparator)
  }
  return raw(h, { method: HTTP.post, route, authority, body, headers: { cookie: h.cookies[authority], 'content-type': HTTP.json, ...(origin === undefined ? {} : { origin }) } })
}

/** An owner POST to DSH's web origin (JSON both ways). */
export const post = (h, route, body = {}) => h.request(route, { method: HTTP.post, body })
