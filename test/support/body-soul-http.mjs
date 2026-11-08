/**
 * A loopback HTTP harness for the main-side embed broker (body-soul I9 503 page and the
 * inst-OQ-11 admission order). The broker is mounted on a real http.Server on port 0 of
 * 127.0.0.1, the main DSH's admission service is a stand-in that refuses `Sec-Fetch-Site:
 * cross-site` with 403 the way DSH's `connection.requestRejection` does (design §18.5 inst-OQ-11),
 * and the lifecycle service is a stand-in whose status the test sets.
 */
import http from 'node:http'
import { loadInstance } from './body-soul-env.mjs'

/** Values planted in the stand-ins; none may ever reach a browser answer (§11). */
export const PLANTED = Object.freeze({
  bearer: 'fbtest-planted-bearer-9b1f6c2e7d',
  origin: 'http://127.0.0.1:59999',
  path: '/Users/fbtest/private/fishball/runtime',
  detail: 'fbtest-planted-detail-launch-failure',
})

export const DSH_CROSS_SITE = Object.freeze({ header: 'sec-fetch-site', crossSite: 'cross-site', status: 403 })

/**
 * Start the broker. `status` is the lifecycle status the stand-in answers (a value, or a function
 * that may throw); `afterRestart` replaces it when the Retry calls restart().
 */
export async function embedHarness(t, { status, afterRestart } = {}) {
  const { createEmbedBroker } = await loadInstance('src/slim/host/embed.js')
  const calls = { restart: 0, access: 0, rejection: 0 }
  let current = status
  const service = {
    status: () => (typeof current === 'function' ? current() : current),
    async embedAccess() { calls.access++; return { origin: PLANTED.origin, bearer: PLANTED.bearer } },
    async restart() { calls.restart++; if (afterRestart !== undefined) current = afterRestart },
  }
  const connection = {
    requestRejection({ headers }) {
      calls.rejection++
      return headers[DSH_CROSS_SITE.header] === DSH_CROSS_SITE.crossSite ? DSH_CROSS_SITE.status : undefined
    },
  }
  const broker = createEmbedBroker({ service, connection })
  const server = http.createServer((request, response) => { broker.handle(request, response) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { broker.close(); server.close(resolve) }))
  const port = server.address().port
  /** One raw request; headers default to a same-origin page fetch. */
  function send(target, { method = 'GET', headers = { 'sec-fetch-site': 'same-origin' }, body } = {}) {
    return new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, method, path: target, headers: { ...headers, ...(body === undefined ? {} : { 'content-length': Buffer.byteLength(body) }) } }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }))
      })
      request.on('error', reject)
      request.end(body)
    })
  }
  return { send, calls, port, setStatus: (value) => { current = value } }
}
