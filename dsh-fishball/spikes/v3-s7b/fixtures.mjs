/**
 * Spike fixtures: a throwaway CA and leaf certificates (openssl), a stand-in public HTTPS host that
 * serves Client ID Metadata Documents, and a local TLS-terminating proxy that plays the user's tunnel.
 * Everything binds 127.0.0.1 on an OS-assigned port. Throwaway spike code.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

/** One CA plus leaf certs for the given DNS names / IPs, written under `dir`. Keys never leave `.runtime/`. */
export function makeCerts(dir, leaves) {
  mkdirSync(dir, { recursive: true })
  const ca = { key: path.join(dir, 'ca.key'), cert: path.join(dir, 'ca.pem') }
  const run = (...args) => execFileSync('openssl', args, { stdio: 'pipe' })
  run('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', '/CN=s7b-spike-ca',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', ca.key, '-out', ca.cert)
  const out = { ca }
  for (const [label, sans] of Object.entries(leaves)) {
    const key = path.join(dir, `${label}.key`)
    const csr = path.join(dir, `${label}.csr`)
    const cert = path.join(dir, `${label}.pem`)
    const ext = path.join(dir, `${label}.ext`)
    writeFileSync(ext, `subjectAltName=${sans.join(',')}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`)
    run('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-subj', `/CN=${label}`, '-keyout', key, '-out', csr)
    run('x509', '-req', '-in', csr, '-CA', ca.cert, '-CAkey', ca.key, '-CAcreateserial', '-days', '2', '-extfile', ext, '-out', cert)
    out[label] = { key, cert }
  }
  return out
}

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

/**
 * Stand-in public client host (`agent.example`, etc.): serves CIMD documents by path over https.
 * `docs` maps path -> {status?, body, headers?} or a function (req, res) for slow/large/redirect cases.
 */
export async function startCimdHost(cert, docs) {
  const hits = []
  const server = https.createServer({ key: readFileSync(cert.key), cert: readFileSync(cert.cert) }, (req, res) => {
    hits.push({ path: req.url, host: req.headers.host })
    const doc = docs[req.url]
    if (typeof doc === 'function') return doc(req, res)
    if (doc === undefined) { res.writeHead(404); res.end(); return }
    res.writeHead(doc.status ?? 200, { 'content-type': 'application/json', ...(doc.headers ?? {}) })
    res.end(typeof doc.body === 'string' ? doc.body : JSON.stringify(doc.body))
  })
  const port = await listen(server)
  return { port, hits, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) }) }
}

/**
 * The user's tunnel, simulated: TLS terminates here for `tunnelHost`, then plain HTTP is forwarded to
 * loopback with the Host header kept. Path routing sends `/authorize*` to the approval listener and the
 * rest to DSH's listener. `injectHeaders` lets a probe add X-Forwarded-Proto and friends, as a real
 * tunnel would, to prove they are ignored.
 */
export async function startTunnel(cert, { dshPort, approvalPort, injectHeaders = {} }) {
  const seen = []
  const server = https.createServer({ key: readFileSync(cert.key), cert: readFileSync(cert.cert) }, (req, res) => {
    const toApproval = req.url.startsWith('/authorize')
    const port = toApproval ? approvalPort() : dshPort
    seen.push({ path: req.url.split('?')[0], to: toApproval ? 'approval' : 'dsh', host: req.headers.host })
    const upstream = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers: { ...req.headers, ...injectHeaders } }, (up) => {
      res.writeHead(up.statusCode, up.headers)
      up.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
    req.pipe(upstream)
  })
  const port = await listen(server)
  return { port, seen, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) }) }
}
