/**
 * One spike "world": throwaway certificates, the stand-in public client host serving CIMD documents,
 * a disposable DSH with the S7b prototype, and optionally the simulated tunnel (a local
 * TLS-terminating proxy for `fb.example`, in DSH's --trusted-host list). Throwaway spike code.
 */
import path from 'node:path'
import { S7B } from './constants.mjs'
import { makeCerts, startCimdHost, startTunnel } from './fixtures.mjs'
import { launch, RUNTIME } from './launch.mjs'

export const CB_PATH = '/cb'
export const REGISTERED_CB_PORT = 7777
export const TUNNEL_HOST = 'fb.example'
const CLIENT_HOST = 'agent.example'

export const clientIdFor = (p) => `https://${CLIENT_HOST}${p}`
const docFor = (p, extra = {}) => ({
  client_id: clientIdFor(p), client_name: 'Agent W', redirect_uris: [`http://127.0.0.1:${REGISTERED_CB_PORT}${CB_PATH}`],
  grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', ...extra,
})

/** Documents for the validation and SSRF tables (AUTH-DT-07, AUTH-EP-08). */
function cimdDocuments() {
  return {
    '/cimd.json': { body: docFor('/cimd.json'), headers: { 'cache-control': 'max-age=60' } },
    '/https-redirect.json': { body: docFor('/https-redirect.json', { redirect_uris: ['https://app.agent.example/cb'] }) },
    '/bad-http.json': { body: docFor('/bad-http.json', { redirect_uris: ['http://agent.example/cb'] }) },
    '/mismatch.json': { body: { ...docFor('/mismatch.json'), client_id: clientIdFor('/other.json') } },
    '/no-name.json': { body: { client_id: clientIdFor('/no-name.json'), redirect_uris: ['http://127.0.0.1:7777/cb'] } },
    '/not-json.json': { body: 'hello', headers: { 'content-type': 'text/plain' } },
    '/secret.json': { body: docFor('/secret.json', { token_endpoint_auth_method: 'client_secret_basic' }) },
    '/big.json': { body: docFor('/big.json', { padding: 'x'.repeat(S7B.cimd.maxBytes) }) },
    '/slow.json': (req, res) => setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(docFor('/slow.json'))) }, S7B.cimd.timeoutMs + 1000),
    '/redirect.json': (req, res) => { res.writeHead(302, { location: 'https://private.example/cimd.json' }); res.end() },
  }
}

/** Throwaway PKI: one CA, a leaf for the client host and a leaf for the tunnel host. */
export const makeWorldCerts = (dir = path.join(RUNTIME, `s7b-pki-${Date.now()}`)) => makeCerts(dir, {
  agent: ['DNS:agent.example', 'DNS:other.example', 'DNS:private.example'],
  tunnel: [`DNS:${TUNNEL_HOST}`, 'DNS:evil.example'],
})

export async function startWorld(version, { label, tunnel = false, tunnelInject = {}, certs = makeWorldCerts() } = {}) {
  const cimdHost = await startCimdHost(certs.agent, cimdDocuments())
  const dsh = await launch(version, {
    label,
    trustedHosts: tunnel ? [TUNNEL_HOST] : [],
    plugin: {
      cimdCaFile: certs.ca.cert,
      // Simulated DNS for the plugin's CIMD fetcher; every answer still passes the private-address check.
      cimdHosts: {
        [CLIENT_HOST]: { address: '93.184.216.34', port: cimdHost.port },   // documentation stand-in for a public host
        'private.example': { address: '10.0.0.7', port: cimdHost.port },
        'loop.example': { address: '127.0.0.1', port: cimdHost.port },
        'linklocal.example': { address: '169.254.10.10', port: cimdHost.port },
        'ula.example': { address: 'fd00::1', port: cimdHost.port },
      },
    },
  })
  let tunnelProxy
  // `forwardApproval = false` stands in for "the user forwarded only DSH's listener" (AUTH-EP-10 row 5).
  const routing = { forwardApproval: true }
  if (tunnel) {
    tunnelProxy = await startTunnel(certs.tunnel, { dshPort: dsh.port, approvalPort: () => (routing.forwardApproval ? dsh.approvalPort : 1), injectHeaders: tunnelInject })
  }
  async function close() {
    const exit = await dsh.stop()
    await cimdHost.close()
    await tunnelProxy?.close()
    return exit
  }
  return { dsh, certs, cimdHost, routing, tunnel: tunnelProxy, tunnelOrigin: tunnelProxy ? `https://${TUNNEL_HOST}:${tunnelProxy.port}` : undefined, close }
}
