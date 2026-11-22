/**
 * DSH's route registries as a package's row reaches them, without a server: the Fetch registry
 * (`ctx.connection.fetch.register({path, fetch(Request) → Response})`) and a Node
 * `ServerResponse` for a `webServer` route's `handler(req, res)`.
 */
import assert from 'node:assert/strict'
import { parseJson } from './json.mjs'

/** What a same-origin page request carries. */
export const PAGE_REQUEST = Object.freeze({ contentType: 'application/json', fetchSite: 'same-origin' })

/** DSH's Fetch registry stand-in: `fetch.register(route)` → dispose; `routes` lists what is registered. */
export function fetchRegistry() {
  const routes = []
  const fetch = {
    register(route) {
      routes.push(route)
      return () => { const at = routes.indexOf(route); if (at >= 0) routes.splice(at, 1) }
    },
  }
  return { routes, fetch }
}

/**
 * One request to a route registered on the Fetch registry, as a same-origin page sends it at
 * `origin`: a JSON body (a string is sent as it is) and a `host` header (default: the origin's
 * host). Answers `{status, json, headers, text}`; `json` is undefined when the body is not JSON.
 */
export async function callRoute(routes, method, routePath, { origin, body, host = new URL(origin).host } = {}) {
  const route = routes.find((r) => r.path === routePath)
  assert.ok(route, 'no route registered at ' + routePath + '; registered: ' + routes.map((r) => r.path).join(', '))
  const request = new Request(new URL(routePath, origin).href, {
    method,
    headers: { host, 'content-type': PAGE_REQUEST.contentType, 'sec-fetch-site': PAGE_REQUEST.fetchSite },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
  const response = await route.fetch(request)
  const text = await response.text()
  return { status: response.status, json: parseJson(text), headers: response.headers, text }
}

/** A Node ServerResponse stand-in that records the answer: `done` resolves at `end()`, `result()` is `{status, headers, body}`. */
export function nodeResponse() {
  const headers = {}
  let status
  let body = ''
  let resolve
  const done = new Promise((r) => { resolve = r })
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value },
    getHeader(name) { return headers[String(name).toLowerCase()] },
    writeHead(code, extra = {}) { status = code; for (const [k, v] of Object.entries(extra ?? {})) headers[k.toLowerCase()] = v; return res },
    write(chunk) { body += String(chunk) },
    end(chunk) { if (chunk !== undefined) body += String(chunk); resolve() },
    done,
    result: () => ({ status: status ?? res.statusCode, headers, body }),
  }
  return res
}
