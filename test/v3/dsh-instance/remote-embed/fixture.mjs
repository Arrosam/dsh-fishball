import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { buffer } from 'node:stream/consumers';
import { parseRemoteEmbedUrl, registerRemoteEmbed } from '../../../../packages/dsh-instance/src/host/remote-embed.js';

export const testData = Object.freeze({
  publicOrigin: 'https://dsh.example.test:8443',
  mount: '/fishball',
  mux: '/api/remote.mux',
  file: '/files/test.bin',
  api: '/api/check',
  redirect: '/api/redirect',
  redirectTarget: '/files/test.bin?v=2#asset',
  stream: '/api/stream',
  admission: '/api/dsh-instance/admit',
  ownerCookie: 'web-session=main-owner-test',
  guestCookie: 'web-session=main-guest-test',
  childCookie: 'dsh_web_session=child-owner-test',
  upstreamSetCookie: 'upstream-only=must-not-escape; Path=/',
  connectorAuthorization: 'Bearer test-connector-token',
  ticket: 'test-server-side-admission-ticket',
  fileBytes: Buffer.from([0x00, 0xff, 0x80, 0x0a]),
  apiBody: Buffer.from('{"message":"来自浏览器"}'),
  streamStart: 'first chunk',
  wsDown: 'child sends first',
  wsUp: 'browser reply',
  loopback: '127.0.0.1',
  timeoutMs: 5_000,
});

const d = testData;
const WS = Object.freeze({
  guid: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
  shortFrameLimit: 126,
  textFrame: 0x81,
  maskBit: 0x80,
  maskingKeyBytes: 4,
  handshakeKeyBytes: 16,
});

async function listen(t, server) {
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  server.listen(0, d.loopback);
  await once(server, 'listening', { signal: t.signal });
  return 'http://' + d.loopback + ':' + server.address().port;
}

export async function createChild(t) {
  const seen = [];
  const streamClosed = Promise.withResolvers();
  let childSocket;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + d.loopback);
    const entry = { method: req.method, url: req.url, headers: req.headers };
    seen.push(entry);
    if (url.pathname === d.admission) {
      const accepted = url.searchParams.get('ticket') === d.ticket;
      if (accepted) {
        res.writeHead(303, { location: '/', 'set-cookie': d.childCookie + '; Path=/; HttpOnly' });
      } else {
        res.writeHead(403);
      }
      res.end();
      return;
    }
    if (req.headers.cookie !== d.childCookie) {
      res.writeHead(401).end();
      return;
    }
    if (url.pathname === d.stream) {
      res.on('close', streamClosed.resolve);
      res.writeHead(200).write(d.streamStart);
      return;
    }
    if (url.pathname === d.redirect) {
      res.writeHead(302, { location: d.redirectTarget, 'set-cookie': d.upstreamSetCookie }).end();
      return;
    }
    entry.body = await buffer(req);
    if (url.pathname === d.api) {
      res.writeHead(201, { 'content-type': 'application/json' }).end(entry.body);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'set-cookie': d.upstreamSetCookie });
    res.end(d.fileBytes);
  });
  server.on('upgrade', (req, socket, head) => {
    seen.push({ method: 'UPGRADE', url: req.url, headers: req.headers });
    if (req.headers.cookie !== d.childCookie) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + WS.guid).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Connection: Upgrade',
      'Upgrade: websocket',
      'Sec-WebSocket-Accept: ' + accept,
      'Set-Cookie: ' + d.upstreamSetCookie,
      '', '',
    ].join('\r\n'));
    childSocket = textSocket(socket, head, false);
    childSocket.send(d.wsDown);
  });
  const origin = await listen(t, server);
  return { origin, seen, get socket() { return childSocket; }, streamClosed: streamClosed.promise };
}

export async function createHost(t, {
  value = d.publicOrigin, initialChild,
  authorizeIndex = req => req.headers.cookie === d.ownerCookie,
} = {}) {
  const publicUrl = parseRemoteEmbedUrl(value);
  const headers = { host: new URL(d.publicOrigin).host, origin: d.publicOrigin, cookie: d.ownerCookie };
  const httpRoutes = new Map();
  const upgrades = new Map();
  const watchers = new Set();
  const authChecks = [];
  const issuedTickets = [];
  let child = initialChild;
  const server = createServer((req, res) => {
    const path = new URL(req.url, d.publicOrigin).pathname;
    for (const [prefix, handler] of httpRoutes) {
      if (path === prefix || path.startsWith(prefix + '/')) return handler(req, res);
    }
    res.writeHead(200).end('local DSH');
  });
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url, d.publicOrigin).pathname;
    if (upgrades.has(path)) return upgrades.get(path)(req, socket, head);
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  });
  const origin = await listen(t, server);
  const webServer = {
    register({ kind, path, handler }) {
      assert.equal(kind, 'prefix');
      httpRoutes.set(path, handler);
      return () => httpRoutes.delete(path);
    },
    registerUpgrade({ path, handler }) {
      upgrades.set(path, handler);
      return () => upgrades.delete(path);
    },
  };
  const connection = {
    admit({ headers }) {
      if (headers.cookie === d.ownerCookie || headers.authorization === d.connectorAuthorization) {
        return { peer: { principal: { kind: 'owner' } } };
      }
      if (headers.cookie === d.guestCookie) return { peer: { principal: { kind: 'guest' } } };
      return { rejection: 401 };
    },
    authorizeIndex(req) {
      authChecks.push({ url: req.url, method: req.method, headers: req.headers });
      return authorizeIndex(req);
    },
  };
  const dispose = registerRemoteEmbed({ webServer, connection }, {
    publicUrl,
    childOrigin: () => child?.origin,
    onChange(callback) {
      watchers.add(callback);
      return () => watchers.delete(callback);
    },
    ticket(input) {
      issuedTickets.push(input);
      return d.ticket;
    },
  });
  t.after(() => dispose?.());
  return {
    authChecks, issuedTickets, dispose,
    setChild(next) {
      child = next;
      for (const watcher of watchers) watcher();
    },
    async http(path, { method = 'GET', headers: overrides, body } = {}) {
      const res = await send(t, origin, path, { method, headers: makeHeaders(headers, overrides), body });
      return { status: res.statusCode, headers: res.headers, body: await buffer(res) };
    },
    openStream(path) {
      return send(t, origin, path, { headers });
    },
    upgrade({ path = d.mount + d.mux, headers: overrides } = {}) {
      return send(t, origin, path, { headers: makeHeaders({
        ...headers, connection: 'Upgrade', upgrade: 'websocket',
        'sec-websocket-key': randomBytes(WS.handshakeKeyBytes).toString('base64'), 'sec-websocket-version': '13',
      }, overrides), upgrade: true });
    },
  };
}

function makeHeaders(defaults, overrides) {
  return Object.fromEntries(Object.entries({ ...defaults, ...overrides }).filter(([, value]) => value !== undefined));
}

function send(t, origin, path, { method, headers, body, upgrade }) {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, origin), { method, headers, signal: t.signal, agent: false });
    req.on('error', reject);
    req.on('response', res => {
      if (!upgrade) return resolve(res);
      res.resume();
      resolve({ status: res.statusCode, headers: res.headers });
    });
    if (upgrade) {
      req.on('upgrade', (res, socket, head) => {
        socket.on('error', () => {});
        t.after(() => socket.destroy());
        resolve({ status: res.statusCode, headers: res.headers, socket: textSocket(socket, head, true) });
      });
    }
    req.end(body);
  });
}

// A short single text frame in each direction suffices to observe the tunnel.
// Node's builtin WebSocket client won't let the fixture supply the public Host.
function textSocket(socket, head, client) {
  const chunks = socket[Symbol.asyncIterator]();
  let pending = head;
  async function take(length) {
    while (pending.length < length) {
      const { value, done } = await chunks.next();
      assert.equal(done, false, 'WebSocket closed before the expected text frame');
      pending = Buffer.concat([pending, value]);
    }
    const bytes = pending.subarray(0, length);
    pending = pending.subarray(length);
    return bytes;
  }
  return {
    async waitForClose() {
      // Drain via the same iterator so the upgraded socket consumes TCP EOF.
      try {
        while (!(await chunks.next()).done) { /* discard shutdown bytes */ }
      } catch (error) {
        // Stale tunnels may be ended normally or reset by the proxy.
        if (error.code !== 'ECONNRESET') throw error;
      }
    },
    send(text) {
      const bytes = Buffer.from(text);
      assert.ok(bytes.length < WS.shortFrameLimit);
      const mask = client ? randomBytes(WS.maskingKeyBytes) : undefined;
      const header = Buffer.from([WS.textFrame, bytes.length | (mask ? WS.maskBit : 0)]);
      socket.write(mask ? Buffer.concat([header, mask, unmask(bytes, mask)]) : Buffer.concat([header, bytes]));
    },
    async read() {
      const [kind, size] = await take(2);
      assert.equal(kind, WS.textFrame);
      assert.equal(Boolean(size & WS.maskBit), !client);
      const length = size & ~WS.maskBit;
      assert.ok(length < WS.shortFrameLimit);
      const mask = client ? undefined : await take(WS.maskingKeyBytes);
      const bytes = await take(length);
      return (mask ? unmask(bytes, mask) : bytes).toString();
    },
  };
}

function unmask(bytes, mask) {
  return bytes.map((byte, offset) => byte ^ mask[offset % mask.length]);
}
