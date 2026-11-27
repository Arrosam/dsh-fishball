/**
 * The one place that binds the settings-page cases to the relayed modules (2026-11-16), and nothing
 * else of them is read:
 *
 *   packages/dsh-connector/src/settings-page/index.js
 *     routes({tokens, logger}) → [{path, methods, fetch(request)}]
 *     registerSettingsPage(ctx, {tokens, logger})   registers each route with
 *       ctx.connection.fetch.register({...route, requestBody: 'buffered'}) and nothing else
 *     SETTINGS_PAGE {route: {create, notice}, maxBodyBytes}
 *   packages/dsh-connector/client.js
 *     a classic browser script: window.__ModuleLoader__.load({id: 'dsh-agent-connector', factory(require)})
 *
 * The routes run over the real token registry of ../tokens/world.mjs (a DSH storage domain of the
 * SDK under test), so a page or route row is an integration of page → route → registry.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE, REPO } from 'dsh-connector-test-helpers/legacy'
import { importInstance } from 'dsh-connector-test-helpers/sdk'
import { resolveRuntimePackages } from '../pairs/subject.mjs'
import { SUBJECT } from './constants.mjs'

const modules = new Map()
/** The settings-page module bound to `sdk`. */
export function pageModule(sdk) {
  if (!modules.has(sdk)) {
    modules.set(sdk, (async () => {
      assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(REPO, SUBJECT.entry)} does not exist (C-TOKENS-REVEAL "Owns" packages/dsh-connector/src/settings-page/)`)
      resolveRuntimePackages()
      const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
      for (const name of [SUBJECT.routes, SUBJECT.register]) assert.equal(typeof mod[name], 'function', `the settings-page module exports no ${name}()`)
      assert.ok(mod[SUBJECT.constants], `the settings-page module exports no ${SUBJECT.constants}`)
      return mod
    })())
  }
  return modules.get(sdk)
}

/** The client script's text (the connector's one browser module). */
export function clientSource() {
  assert.ok(fs.existsSync(SUBJECT.client), `${path.relative(REPO, SUBJECT.client)} does not exist (C-TOKENS-REVEAL "Owns" packages/dsh-connector/client.js)`)
  return fs.readFileSync(SUBJECT.client, 'utf8')
}

/** The routes over one tokens world, by path. */
export async function routesOf(sdk, world) {
  const mod = await pageModule(sdk)
  const list = mod[SUBJECT.routes]({ tokens: world.registry, logger: world.logger })
  assert.ok(Array.isArray(list), 'routes() did not return a list')
  return list
}

/**
 * Sends one request to the route list as DSH's Fetch registry would (exact path, listed method),
 * and returns `{status, headers, text, json}`.
 */
export async function send(routes, url, init = {}) {
  const request = new Request(url, init)
  const route = routes.find((r) => r.path === new URL(request.url).pathname && r.methods.map((m) => m.toUpperCase()).includes(request.method))
  assert.ok(route, `no route serves ${request.method} ${new URL(request.url).pathname}`)
  const response = await route.fetch(request)
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, headers: response.headers, text, json }
}
