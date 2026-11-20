/**
 * C-HTTP cases for the K1 amendment after W2 (mcp-schema index.d.ts `AdmitRequest`,
 * `RequestGate.admit`; README "Request gate": `admit` runs before the MCP body is read). No design
 * case names these rows, so they are K1-AMEND-5.
 *
 * - Boundary Value Analysis (unit, the gate alone): `AdmitRequest.bodyBytes` is optional; absent
 *   (a chunked body) passes the 413 step, exactly ENDPOINT_LIMITS.bodyBytes passes, one more is 413;
 *   an absent length still takes an in-flight slot (ENDPOINT_LIMITS.inFlightPerPrincipal).
 * - Boundary Value Analysis and State Transition (integration, raw HTTP to the route): with
 *   inFlightPerPrincipal uploads of one entry held open mid-body, one more request of that entry is
 *   429 (Retry-After = ceil(REQUEST_GATE.inFlightRetryAfterMs / 1000) s, the limit body) before its
 *   body is read; another entry is not affected; finishing or aborting one held upload frees a
 *   slot. A declared Content-Length over the limit is 413 before the body arrives; a 401 still
 *   beats it. A chunked body at the limit is served; past it, the same 413, and its slot is freed.
 *   An open listen stream still frees its slot.
 *
 * Level and oracles as cases.mjs (whose helpers these rows reuse). Every value is K1's or harness
 * data (constants.mjs UPLOAD, FIXTURE, WAIT).
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import {
  admit, assert401, assertCheck, assertDiscovered, assertLimit, hold, inFlightRefusal, listener, modernRpc, sized, tooLarge, unit, unitCaller, world,
} from './cases.mjs'
import {
  BEARER_CHALLENGE, ENDPOINT_LIMITS, FIXTURE, GATE_SURFACE, HEADER, HTTP_METHOD, HTTP_REFUSAL, HTTP_STATUS, PATHS, RATE_LIMITS,
  REQUEST_GATE, RPC, TIME_UNIT, UPLOAD, WAIT,
} from './constants.mjs'

const ID = 'K1-AMEND-5'
const LIMIT = ENDPOINT_LIMITS.bodyBytes
const MAX_IN_FLIGHT = ENDPOINT_LIMITS.inFlightPerPrincipal
/** The in-flight 429's Retry-After in whole seconds (TIME_UNIT), rounded up. */
const RETRY_AFTER = String(Math.ceil(REQUEST_GATE.inFlightRetryAfterMs / TIME_UNIT.msPerSecond))

/** The MCP request headers of `rpc` (2026-07-28: version and method mirrored), with `token`'s bearer. */
export function mcpHeaders(wire, rpc, token) {
  return {
    [HEADER.contentType]: HEADER.json,
    [HEADER.accept]: [HEADER.json, HEADER.sse].join(HEADER.listSeparator),
    [HEADER.protocolVersion]: rpc.params._meta[wire.versionKey],
    [HEADER.mcpMethod]: rpc.method,
    ...(token === undefined ? {} : { [HEADER.authorization]: BEARER_CHALLENGE.scheme + HEADER.schemeSeparator + token }),
  }
}

/**
 * A raw POST to the route whose body is sent in steps: `declared` is its Content-Length (absent:
 * chunked). Returns {response, write(text), finish(text), abort()}: `response` resolves with
 * {status, headers, text} whenever the route answers, whether or not the body was finished.
 */
export function upload(w, headers, declared) {
  const framing = declared === undefined ? { [UPLOAD.transferEncoding]: UPLOAD.chunked } : { [HEADER.contentLength]: declared }
  let answered = false
  let req
  const response = new Promise((resolve, reject) => {
    req = http.request({
      host: FIXTURE.loopback, port: w.port, method: HTTP_METHOD.post, path: PATHS.mcp, agent: false,
      headers: Object.fromEntries(Object.entries({ ...headers, host: w.host, ...framing }).filter(([, v]) => v !== undefined)),
    }, (res) => {
      answered = true
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    // The route may answer and drop the socket before the body is sent: not the case's concern.
    req.on('error', (error) => { if (!answered) reject(error) })
  })
  // An aborted upload never answers; keep its rejection from being unhandled.
  response.catch(() => undefined)
  req.flushHeaders()
  return {
    response,
    write: (text) => req.write(text),
    finish: (text) => req.end(text),
    abort: () => req.destroy(),
  }
}

/** One full request whose body is `text` (sent whole). */
const send = (w, headers, text, declared = Buffer.byteLength(text)) => {
  const u = upload(w, headers, declared)
  u.finish(text)
  return u.response
}
/** A chunked body of `text`, written in UPLOAD.chunkBytes pieces. */
function sendChunked(w, headers, text) {
  const u = upload(w, headers, undefined)
  for (let at = 0; at < text.length; at += UPLOAD.chunkBytes) u.write(text.slice(at, at + UPLOAD.chunkBytes))
  u.finish()
  return u.response
}
/** Whether `promise` settles within `ms`. */
const settlesWithin = (promise, ms) => Promise.race([promise.then(() => true, () => true), new Promise((resolve) => setTimeout(() => resolve(false), ms))])
/** Waits until `probe()` resolves true; fails after WAIT.eventMs. */
async function eventually(probe, what) {
  const end = Date.now() + WAIT.eventMs
  while (!(await probe())) {
    assert.ok(Date.now() < end, `${what} within ${WAIT.eventMs} ms`)
    await new Promise((resolve) => setTimeout(resolve, WAIT.pollMs))
  }
}

/**
 * `n` uploads of one valid `server/discover` body, each with its Content-Length declared and only
 * its first UPLOAD.heldPrefixBytes sent: held open mid-body. Returns them with their rest.
 */
async function heldUploads(w, wire, token, n) {
  const text = JSON.stringify(modernRpc(wire, RPC.discover))
  const held = Array.from({ length: n }, () => {
    const u = upload(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), token), Buffer.byteLength(text))
    u.write(text.slice(0, UPLOAD.heldPrefixBytes))
    return { ...u, rest: text.slice(UPLOAD.heldPrefixBytes) }
  })
  // Each held upload must have been admitted (its slot taken) before the case goes on: none answers yet.
  assert.equal(await settlesWithin(Promise.race(held.map((h) => h.response)), WAIT.quietMs), false, 'a held upload was answered before its body ended')
  return held
}
/** One small, complete `server/discover` of `token`. */
const discover = (w, wire, token) => send(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), token), JSON.stringify(modernRpc(wire, RPC.discover)))
function assertInFlight429(res) {
  assertLimit(res, HTTP_STATUS.tooManyRequests, HTTP_REFUSAL.rateLimited)
  assert.equal(res.headers[RATE_LIMITS.retryAfterHeader], RETRY_AFTER)
}

export function registerCHttpAmendCases(sdk) {
  // ---- Boundary Value Analysis at the gate: the optional bodyBytes ----
  const u = (part, title, fn) => unit(sdk, ID, part, title, fn)
  const absent = (gate, caller) => gate.admit({ method: HTTP_METHOD.post, path: PATHS.mcp, headers: { [REQUEST_GATE.headers.host]: `${FIXTURE.loopback}:${FIXTURE.dshPort}` } }, GATE_SURFACE.mcp, caller)
  u('BVA 1 (absent)', 'bodyBytes absent (a chunked body): passes the 413 step', ({ gate }) => {
    assert.equal(absent(gate, unitCaller(FIXTURE.idP)).pass, true)
  })
  u('BVA 2 (limit)', 'bodyBytes = limit: pass', ({ gate }) => assert.equal(admit(gate, unitCaller(FIXTURE.idP), LIMIT).pass, true))
  u('BVA 3 (limit + 1)', 'bodyBytes = limit + 1: 413', ({ gate }) => assertCheck(admit(gate, unitCaller(FIXTURE.idP), LIMIT + 1), tooLarge))
  u('BVA 4 (absent takes a slot)', `bodyBytes absent takes an in-flight slot: max − 1 held + one absent, then one more → 429 Retry-After ${RETRY_AFTER}`, ({ gate }) => {
    const caller = unitCaller(FIXTURE.idP)
    hold(gate, caller, MAX_IN_FLIGHT - 1)
    const pass = absent(gate, caller)
    assert.equal(pass.pass, true)
    assertCheck(absent(gate, caller), { ...inFlightRefusal, headers: { [RATE_LIMITS.retryAfterHeader]: RETRY_AFTER } })
    pass.done()
    assert.equal(absent(gate, caller).pass, true, 'done() did not free the slot')
  })

  // ---- End to end: uploads held mid-body hold their slots ----
  const e2e = (part, title, fn) => world(sdk, ID, part, title, fn)
  e2e('E2E 1 (max held)', `${MAX_IN_FLIGHT} uploads of one entry held mid-body: one more is 429 Retry-After ${RETRY_AFTER} with the limit body, before its own body is sent`, async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    await heldUploads(w, wire, token, MAX_IN_FLIGHT)
    const extra = upload(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), token), Buffer.byteLength(JSON.stringify(modernRpc(wire, RPC.discover))))
    extra.write(JSON.stringify(modernRpc(wire, RPC.discover)).slice(0, UPLOAD.heldPrefixBytes))
    assert.ok(await settlesWithin(extra.response, WAIT.eventMs), 'the extra request was not refused before its body ended')
    assertInFlight429(await extra.response)
    extra.abort()
  })
  e2e('E2E 1 (max − 1 held)', `${MAX_IN_FLIGHT - 1} uploads held: one more request of that entry is served`, async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    await heldUploads(w, wire, token, MAX_IN_FLIGHT - 1)
    assertDiscovered(await discover(w, wire, token))
  })
  e2e('E2E 2 (other entry)', `${MAX_IN_FLIGHT} uploads of P held: Q's request is served`, async (w, wire) => {
    const p = w.principal(FIXTURE.idP)
    const q = w.principal(FIXTURE.idQ)
    await heldUploads(w, wire, p.token, MAX_IN_FLIGHT)
    assertDiscovered(await discover(w, wire, q.token))
  })
  e2e('E2E 3 (finished)', 'Held → one held upload finishes its body → it is served, and the entry\'s next request passes', async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    const held = await heldUploads(w, wire, token, MAX_IN_FLIGHT)
    assertInFlight429(await discover(w, wire, token))
    held[0].finish(held[0].rest)
    assertDiscovered(await held[0].response)
    assertDiscovered(await discover(w, wire, token))
  })
  e2e('E2E 3 (aborted)', 'Held → one held upload is aborted by its client → its slot frees: the entry\'s next request passes', async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    const held = await heldUploads(w, wire, token, MAX_IN_FLIGHT)
    held[0].abort()
    await eventually(async () => (await discover(w, wire, token)).status === HTTP_STATUS.ok, 'a slot freed by the aborted upload')
  })
  e2e('E2E 4 (listen stream)', `an open listen stream holds no slot: with it open and ${MAX_IN_FLIGHT - 1} uploads held, one more passes; the next is 429`, async (w, wire) => {
    const { token } = await listener(w, FIXTURE.idP)
    const held = await heldUploads(w, wire, token, MAX_IN_FLIGHT - 1)
    const last = await heldUploads(w, wire, token, 1)
    assertInFlight429(await discover(w, wire, token))
    for (const h of [...held, ...last]) h.abort()
  })

  // ---- End to end: the 413 judges the declared length; a chunked body is read under its slot ----
  e2e('E2E 5 (declared limit + 1)', 'a declared Content-Length of limit + 1: 413 with the limit body before any body byte is sent', async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    const u5 = upload(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), token), LIMIT + 1)
    assert.ok(await settlesWithin(u5.response, WAIT.eventMs), 'no answer before the body')
    assertLimit(await u5.response, HTTP_STATUS.payloadTooLarge, HTTP_REFUSAL.tooLarge)
    u5.abort()
  })
  e2e('E2E 5 (no token beats 413)', 'no bearer and a declared Content-Length of limit + 1: 401, not 413', async (w, wire) => {
    const u5 = upload(w, mcpHeaders(wire, modernRpc(wire, RPC.discover)), LIMIT + 1)
    assert.ok(await settlesWithin(u5.response, WAIT.eventMs), 'no answer before the body')
    assert401(w, await u5.response)
    u5.abort()
  })
  e2e('E2E 5 (invalid token beats 413)', 'an unknown bearer and a declared Content-Length of limit + 1: 401 invalid_token, not 413', async (w, wire) => {
    const u5 = upload(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), FIXTURE.unknownToken), LIMIT + 1)
    assert.ok(await settlesWithin(u5.response, WAIT.eventMs), 'no answer before the body')
    assert401(w, await u5.response, { presented: true })
    u5.abort()
  })
  e2e('E2E 6 (chunked at limit)', 'a chunked body of exactly limit bytes: served', async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    assertDiscovered(await sendChunked(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), token), sized(modernRpc(wire, RPC.discover), LIMIT)))
  })
  e2e('E2E 6 (chunked limit + 1)', 'a chunked body of limit + 1 bytes: the same 413 with the limit body; its slot is freed (max more pass the gate)', async (w, wire) => {
    const { token, caller } = w.principal(FIXTURE.idP)
    const res = await sendChunked(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), token), sized(modernRpc(wire, RPC.discover), LIMIT + 1))
    assertLimit(res, HTTP_STATUS.payloadTooLarge, HTTP_REFUSAL.tooLarge)
    await eventually(async () => {
      const results = Array.from({ length: MAX_IN_FLIGHT }, () => admit(w.gate, caller))
      for (const r of results) if (r.pass) r.done()
      return results.every((r) => r.pass)
    }, 'the 413 chunked upload freed its slot')
  })
  e2e('E2E 6 (chunked held)', 'a chunked upload held mid-body takes a slot like a declared one: max held chunked, one more → 429', async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    const text = JSON.stringify(modernRpc(wire, RPC.discover))
    const held = Array.from({ length: MAX_IN_FLIGHT }, () => {
      const h = upload(w, mcpHeaders(wire, modernRpc(wire, RPC.discover), token), undefined)
      h.write(text.slice(0, UPLOAD.heldPrefixBytes))
      return h
    })
    assert.equal(await settlesWithin(Promise.race(held.map((h) => h.response)), WAIT.quietMs), false, 'a held chunked upload was answered')
    assertInFlight429(await discover(w, wire, token))
    for (const h of held) h.abort()
  })
}
