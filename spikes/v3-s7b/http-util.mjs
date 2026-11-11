/**
 * Small node:http helpers shared by the S7b prototype plugin, the probes and the tunnel proxy.
 * Throwaway spike code.
 */

/** Read a bounded body as a Buffer; undefined when it exceeds the bound. */
export async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return undefined
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

export function sendEmpty(res, status, headers = {}) {
  res.writeHead(status, headers)
  res.end()
}

/** WHATWG Request from a node request whose body was already read (the MCP gate inspects it first). */
export function toRequest(req, res, origin, body) {
  const controller = new AbortController()
  res.on('close', () => controller.abort())
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else if (value !== undefined) headers.set(key, value)
  }
  return new Request(new URL(req.url, origin), { method: req.method, headers, body, signal: controller.signal })
}

/** Stream a WHATWG Response into a node response (listen streams stay open). */
export async function writeResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body === null) { res.end(); return }
  res.flushHeaders()
  const reader = response.body.getReader()
  res.on('close', () => reader.cancel().catch(() => undefined))
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) res.write(chunk.value)
  } catch { /* client went away */ }
  res.end()
}


/** HTML-escape for the server-rendered approval page. */
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
