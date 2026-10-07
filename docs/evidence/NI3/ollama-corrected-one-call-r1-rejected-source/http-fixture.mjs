import { request } from 'node:http';
import { bounds } from './admission.mjs';
import { requireFact, fail, safeFailure, digest } from './safe-facts.mjs';

export function createHTTP({ signal }) {
  const counters = { controlHTTP: 0, dfRPC: 0, metadataHTTP: 0,
    controlRequestBytes: 0, controlResponseBytes: 0, metadataResponseBytes: 0 };
  let base, cookie, rpcSerial = 0;
  const controlSteps = [], metadataSteps = [];
  async function transport({ url, method, body, headers, category, step, timeoutMs, maxBytes }) {
    signal.throwIfAborted();
    const parsed = new URL(url);
    requireFact(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && !parsed.username && !parsed.password);
    if (category === 'control') {
      requireFact(base && parsed.origin === base.origin);
      requireFact(counters.controlHTTP < bounds.controlHTTP, 'RESOURCE_LIMIT'); counters.controlHTTP++;
      requireFact(!controlSteps.includes(step)); controlSteps.push(step);
    } else {
      requireFact(parsed.port === '11434');
      requireFact(counters.metadataHTTP < bounds.metadataHTTP, 'RESOURCE_LIMIT'); counters.metadataHTTP++;
      requireFact(!metadataSteps.includes(step)); metadataSteps.push(step);
    }
    const encoded = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    requireFact((encoded?.length ?? 0) <= bounds.controlRequestBytes);
    if (category === 'control') counters.controlRequestBytes += encoded?.length ?? 0;
    return new Promise((resolve, reject) => {
      let settled = false, timer, responseBytes = 0;
      const finish = (error, value) => {
        if (settled) return; settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      };
      const options = { protocol: parsed.protocol, hostname: parsed.hostname,
        port: parsed.port, path: parsed.pathname + parsed.search, method,
        headers: { ...headers, ...(encoded ? { 'content-length': encoded.length } : {}) },
        agent: false, signal };
      const req = request(options, res => {
        const pieces = [];
        res.on('data', chunk => {
          responseBytes += chunk.length;
          if (category === 'control') counters.controlResponseBytes += chunk.length;
          else counters.metadataResponseBytes += chunk.length;
          if (responseBytes > maxBytes) {
            const error = new Error('RESOURCE_LIMIT'); error.code = 'RESOURCE_LIMIT';
            res.destroy(error); req.destroy(error); finish(error); return;
          }
          pieces.push(Buffer.from(chunk));
        });
        res.on('error', () => finish(Object.assign(new Error('ORIGINAL_OPERATION_DENIED'), { code: 'ORIGINAL_OPERATION_DENIED' })));
        res.on('aborted', () => finish(Object.assign(new Error('ORIGINAL_OPERATION_DENIED'), { code: 'ORIGINAL_OPERATION_DENIED' })));
        res.on('end', () => finish(null, { status: res.statusCode,
          headers: res.headers, bytes: Buffer.concat(pieces, responseBytes) }));
      });
      req.on('error', () => finish(Object.assign(new Error('ORIGINAL_OPERATION_DENIED'), { code: 'ORIGINAL_OPERATION_DENIED' })));
      timer = setTimeout(() => {
        const error = new Error('DEADLINE_UNKNOWN'); error.code = 'DEADLINE_UNKNOWN';
        req.destroy(error); finish(error);
      }, timeoutMs);
      req.end(encoded);
    });
  }
  const envelope = (rpcId, method, payload) => ({ type: 'client-request', rpcId, method, payload });
  function parsedJSON(bytes) {
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { fail('ORIGINAL_OPERATION_DENIED'); }
  }
  async function fences(connection, port) {
    requireFact(!base && Number.isInteger(port) && port > 0 && port <= 65535 && port !== 3080);
    base = new URL(`http://127.0.0.1:${port}/`);
    const first = await transport({ url: base.href, method: 'GET', category: 'control', step: 'H01',
      timeoutMs: bounds.httpMs, maxBytes: bounds.controlResponseBytes });
    requireFact(first.status === 401);
    const unauth = await transport({ url: new URL('/df-setup/v1/status', base).href, method: 'POST',
      body: envelope('live02-denied', 'v1/status', {}), headers: { origin: base.origin, 'content-type': 'application/json' },
      category: 'control', step: 'H02', timeoutMs: bounds.httpMs, maxBytes: bounds.controlResponseBytes });
    requireFact(unauth.status === 401);
    // This URL and its query exist solely in this private request scope.
    const launchURL = connection.authenticatedUrl(base.href);
    const exchanged = await transport({ url: launchURL, method: 'GET', category: 'control', step: 'H03',
      timeoutMs: bounds.httpMs, maxBytes: bounds.controlResponseBytes });
    requireFact(exchanged.status === 303 && exchanged.headers.location === './');
    const received = exchanged.headers['set-cookie'];
    requireFact(Array.isArray(received) && received.length === 1 && received[0].length <= 4096);
    requireFact(/;\s*HttpOnly(?:;|$)/iu.test(received[0]) && /;\s*SameSite=Strict(?:;|$)/iu.test(received[0]));
    cookie = received[0].split(';', 1)[0];
    requireFact(/^[^\s;=]+=[^\s;]+$/u.test(cookie));
    const clean = await transport({ url: base.href, method: 'GET', headers: { cookie }, category: 'control', step: 'H04',
      timeoutMs: bounds.httpMs, maxBytes: bounds.controlResponseBytes });
    requireFact(clean.status === 200);
    const crossOrigin = await transport({ url: new URL('/df-setup/v1/status', base).href, method: 'POST',
      body: envelope('live02-origin-denied', 'v1/status', {}),
      headers: { cookie, origin: 'http://127.0.0.1:1', 'content-type': 'application/json' },
      category: 'control', step: 'H05', timeoutMs: bounds.httpMs, maxBytes: bounds.controlResponseBytes });
    requireFact(crossOrigin.status === 403);
    return { noCookieIndex: 401, noCookieRPC: 401, originalExchange: 303, cookieIndex: 200, wrongOriginRPC: 403 };
  }
  async function call(step, name, payload = {}, channel = '/df-rpc') {
    signal.throwIfAborted();
    requireFact(base && cookie && /^P(?:0[1-9]|[12][0-9]|30)$/u.test(step));
    requireFact(counters.dfRPC < bounds.dfRPC, 'RESOURCE_LIMIT'); counters.dfRPC++;
    requireFact(channel === '/df-rpc' || channel === '/df-setup');
    const rpcId = `live02-${++rpcSerial}`, method = `v1/${name}`;
    requireFact(/^v1\/[A-Za-z0-9]+$/u.test(method));
    const reply = await transport({ url: new URL(`${channel}/${method}`, base).href, method: 'POST',
      body: envelope(rpcId, method, payload), headers: { cookie, origin: base.origin, 'content-type': 'application/json' },
      category: 'control', step, timeoutMs: name === 'workerExecute' ? bounds.executeHTTPMs : bounds.httpMs,
      maxBytes: bounds.controlResponseBytes });
    requireFact(reply.status === 200, 'ORIGINAL_OPERATION_DENIED');
    const decoded = parsedJSON(reply.bytes);
    requireFact(decoded && decoded.type === 'server-response' && decoded.rpcId === rpcId && decoded.result &&
      typeof decoded.result.ok === 'boolean', 'ORIGINAL_OPERATION_DENIED');
    if (decoded.result.ok !== true) fail(safeFailure(decoded.result.error, name === 'workerExecute' ? 'execute' : 'rpc'));
    return decoded.result.value;
  }
  async function metadata() {
    const origin = 'http://127.0.0.1:11434';
    const get = async (step, path, method = 'GET', body) => {
      const value = await transport({ url: origin + path, method, body,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        category: 'metadata', step, timeoutMs: bounds.httpMs, maxBytes: bounds.metadataResponseBytes });
      requireFact(value.status === 200, 'MODEL_UNAVAILABLE');
      return { value: parsedJSON(value.bytes), responseDigest: digest(value.bytes), responseBytes: value.bytes.length };
    };
    const version = await get('M01', '/api/version'); requireFact(version.value.version === '0.40.0', 'MODEL_UNAVAILABLE');
    const tags = await get('M02', '/api/tags'); requireFact(Array.isArray(tags.value.models), 'MODEL_UNAVAILABLE');
    const show = await get('M03', '/api/show', 'POST', { model: 'deepseek-v4.1-flash:cloud' });
    requireFact(Array.isArray(show.value.capabilities) && show.value.capabilities.includes('completion'), 'MODEL_UNAVAILABLE');
    requireFact(Array.isArray(show.value.thinking?.values) && show.value.thinking.values.includes(false), 'MODEL_UNAVAILABLE');
    requireFact(show.value.model_info?.['deepseek_v41.context_length'] === 1048576, 'MODEL_UNAVAILABLE');
    return { versionMatched: true, localTagCount: tags.value.models.length,
      exactShowObserved: true, completion: true, thinkFalse: true, contextWindow: 1048576,
      responseDigests: [version.responseDigest, tags.responseDigest, show.responseDigest],
      responseBytes: [version.responseBytes, tags.responseBytes, show.responseBytes] };
  }
  return Object.freeze({ fences, call, metadata,
    snapshot: () => ({ ...counters, controlSteps: [...controlSteps], metadataSteps: [...metadataSteps] }) });
}
