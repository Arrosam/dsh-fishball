/** Public route effect fixture. All profile, inventory, transport, and credential dependencies are in memory. */
import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FIXTURE } from './provider-sync-official.mjs'
import { PAGE } from './provider-sync-page-data.mjs'

async function serviceModule() {
  const runtimeRequire = createRequire(path.join(FIXTURE.runtime, '__provider_sync_route_fixture__.cjs'))
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) throw error
      return { url: pathToFileURL(runtimeRequire.resolve(specifier)).href, shortCircuit: true }
    }
  } })
  try { return await import('../../src/provider-sync-service.js') } finally { hooks.deregister() }
}

export async function routeFixture(t, { failHost = false, deferHost = false } = {}) {
  const { registerProviderSync } = await serviceModule()
  const calls = { host: PAGE.zero, channel: PAGE.zero, closed: PAGE.zero, credentials: [], gets: [] }
  const disposers = []
  let registration
  let releaseHost
  let hostStarted
  const started = new Promise((resolve) => { hostStarted = resolve })
  let status = { state: 'ready', identity: PAGE.source }
  const credentialBoundary = (operation) => () => { calls.credentials.push(operation); throw new Error(PAGE.errorMarker) }
  const ctx = {
    connection: { fetch: { register(value) { registration = value; return () => undefined } } },
    get(name) { calls.gets.push(name); throw new Error(PAGE.errorMarker) },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose },
  }
  const createHost = () => {
    calls.host++
    hostStarted()
    if (failHost) throw new Error(PAGE.errorMarker)
    const host = {
      inventory: async () => ({ identity: PAGE.source, revision: {}, schemas: {}, owners: {}, namespaces: [], providers: [] }),
      readRecord: credentialBoundary('readRecord'), addProvider: credentialBoundary('addProvider'),
      importRecord: credentialBoundary('importRecord'), verify: credentialBoundary('verify'),
      close: () => undefined,
    }
    return deferHost ? new Promise((resolve) => { releaseHost = () => resolve(host) }) : host
  }
  const createChannel = () => {
    calls.channel++
    return {
      async start() { return status }, invitation: () => PAGE.invitation,
      status: () => status,
      async beginPair(invitation) { assert.equal(invitation, PAGE.invitation); return { pairId: PAGE.pairId, identity: PAGE.target, expiresAt: Date.now() + PAGE.expiresInMs } },
      approvePair(pairId) { assert.equal(pairId, PAGE.pairId); status = { state: 'approvedSource', identity: PAGE.target, peer: PAGE.source, pairId }; return status },
      async finishPair(pairId) { assert.equal(pairId, PAGE.pairId); status = { state: 'paired', role: 'source', identity: PAGE.source, peer: PAGE.target, pairId }; return { identity: PAGE.target, pairId } },
      peer: () => null,
      async close() { calls.closed++; status = { state: 'closed' } },
    }
  }
  const service = registerProviderSync(ctx, { createHost, createChannel, identity: PAGE.source })
  t.after(async () => { await service?.close?.(); while (disposers.length) await disposers.pop()() })
  assert.ok(registration, 'service registers the public owner POST endpoint')
  const post = async (body, { raw = false, headers = {} } = {}) => {
    const request = new Request(PAGE.origin + PAGE.api, {
      method: PAGE.method, headers: { origin: PAGE.origin, 'content-type': PAGE.contentType, ...headers },
      body: raw ? body : JSON.stringify(body),
    })
    const response = await registration.fetch(request)
    const text = await response.text()
    let json
    try { json = JSON.parse(text) } catch { /* assertions keep malformed responses observable */ }
    return { status: response.status, text, json }
  }
  const assertRefused = (response) => {
    assert.equal(response.json?.ok, false, 'refused owner action cannot succeed')
    assert.deepEqual(response.json, { ok: false, code: PAGE.refused }, 'refusal body is static, never input/raw error data')
    assert.notEqual(response.status, PAGE.statusOk)
    for (const marker of [...PAGE.forbidden, PAGE.errorMarker]) assert.equal(response.text.includes(marker), false)
  }
  return { registration, service, calls, post, assertRefused, started, releaseHost: () => releaseHost?.() }
}
