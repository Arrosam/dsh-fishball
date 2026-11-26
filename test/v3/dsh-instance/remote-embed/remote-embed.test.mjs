import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { parseRemoteEmbedUrl, remoteEmbedAdmission } from '../../../../packages/dsh-instance/src/host/remote-embed.js';
import { createChild, createHost, testData as d } from './fixture.mjs';

const options = { timeout: d.timeoutMs };
const ownerView = Object.freeze({ view: 'chat', lang: 'zh' });
const webRoot = '/ui/';
const assetPath = d.mount + d.file;
const untrustedHost = 'other.example.test:8443';
const bearer = { authorization: d.connectorAuthorization };
const rejectionCases = [
  ['wrong Host', { host: untrustedHost }, 403],
  ['cross-origin hostname', { origin: 'https://' + untrustedHost }, 403],
  ['cross-origin scheme', { origin: d.publicOrigin.replace('https', 'http') }, 403],
  ['cross-origin port', { origin: 'https://' + new URL(d.publicOrigin).hostname }, 403],
  ['opaque Origin', { origin: 'null' }, 403],
  ['missing Origin on unsafe request', { origin: undefined }, 403],
  ['anonymous browser', { cookie: undefined }, 401],
  ['authenticated non-owner', { cookie: d.guestCookie }, 403],
  ['owner principal from a Connector Token without a browser cookie', { ...bearer, cookie: undefined }, 403],
];

// BVA / EP: disabled values, both supported app roots, and invalid URL classes.
test('remoteEmbedUrl is opt-in and validates the HTTPS app root', () => {
  for (const missing of [undefined, '']) {
    assert.equal(parseRemoteEmbedUrl(missing), undefined);
  }
  for (const path of ['/', webRoot, '/custom/dsh/']) {
    const parsed = parseRemoteEmbedUrl(d.publicOrigin + path);
    assert.equal(parsed.origin, d.publicOrigin);
    assert.equal(parsed.pathname, path);
  }
  for (const invalid of [
    'not a URL', '//dsh.example.test', 'http://dsh.example.test',
    'https://account@dsh.example.test',
    d.publicOrigin + '/?option=value', d.publicOrigin + '/#fragment',
  ]) {
    assert.throws(() => parseRemoteEmbedUrl(invalid), invalid);
  }
});

test('admission gives the trusted browser its mounted URL and preserves view and language', () => {
  const authority = new URL(d.publicOrigin).host;
  function admission(value, headers) {
    return remoteEmbedAdmission(parseRemoteEmbedUrl(value), new Request(d.publicOrigin + '/admission', { headers }), ownerView);
  }
  const trusted = { host: authority, origin: d.publicOrigin };
  for (const basePath of ['/', webRoot]) {
    assert.equal(admission(d.publicOrigin + basePath, trusted)?.url,
      d.publicOrigin + basePath + d.mount.slice(1) + '/#view=chat&lang=zh');
  }
  assert.equal(admission(undefined, trusted), undefined);
  assert.equal(admission(d.publicOrigin, { ...trusted, host: untrustedHost }), undefined);
  assert.equal(admission(d.publicOrigin, { ...trusted, origin: 'https://' + untrustedHost }), undefined);
});

test('disabled registration leaves local routes and the mux untouched', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { value: '', initialChild: child });
  assert.equal((await host.http(assetPath)).body.toString(), 'local DSH');
  assert.equal((await host.upgrade()).status, 404);
  assert.deepEqual(child.seen, []);
});

test('bare mount redirects to the configured public path; only the mounted segment is routed', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { value: d.publicOrigin + webRoot, initialChild: child });
  const resolvedMount = d.publicOrigin + webRoot + d.mount.slice(1) + '/';
  const response = await host.http(d.mount);
  assert.equal(response.status, 308);
  assert.equal(new URL(response.headers.location, resolvedMount).href, resolvedMount);
  assert.equal((await host.http(d.mount + 'x/')).body.toString(), 'local DSH');
  assert.equal((await host.upgrade({ path: d.mount + d.mux + 'x' })).status, 404);
  assert.deepEqual(child.seen, []);
  assert.equal((await host.http(d.mount + '/')).status, 200);
  assert.equal(child.seen.at(-1).url, '/');
});

// Decision table: test one false predicate at a time, with a reachable child.
for (const [name, headers, expected] of rejectionCases) {
  test('HTTP/WS deny ' + name + ' without contacting the child', options, async t => {
    const child = await createChild(t);
    const host = await createHost(t, { initialChild: child });
    const http = await host.http(d.mount + d.api, { method: 'POST', headers });
    const ws = await host.upgrade({ headers });
    assert.deepEqual([http.status, ws.status], [expected, expected]);
    assert.deepEqual(child.seen, []);
    assert.deepEqual(host.issuedTickets, []);
  });
}

test('an owner principal whose webpage authorization fails still cannot use HTTP or WS', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { initialChild: child, authorizeIndex: () => false });
  const responses = [await host.http(assetPath), await host.upgrade()];
  for (const { status } of responses) assert.ok(status === 401 || status === 403, 'unexpected status ' + status);
  assert.deepEqual(child.seen, []);
  assert.deepEqual(host.issuedTickets, []);
});

test('owner GET/HEAD can omit Origin; static files and API forward without main credentials', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { initialChild: child });
  const headers = { ...bearer, origin: undefined };
  const file = await host.http(assetPath, { headers });
  assert.equal(file.status, 200);
  assert.equal(file.headers['content-type'], 'application/octet-stream');
  assert.equal(file.headers['set-cookie'], undefined);
  assert.deepEqual(file.body, d.fileBytes);
  const head = await host.http(assetPath, { method: 'HEAD', headers });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);

  const query = '?label=a%20b&item=1&item=2';
  const api = await host.http(d.mount + d.api + query, {
    method: 'POST', headers: { ...bearer, 'content-type': 'application/json' }, body: d.apiBody,
  });
  assert.equal(api.status, 201);
  assert.deepEqual(api.body, d.apiBody);
  const proxied = assertChildCredentials(child);
  assert.deepEqual(proxied.map(({ method, url }) => [method, url]), [
    ['GET', d.file], ['HEAD', d.file], ['POST', d.api + query],
  ]);
  assert.equal(proxied.at(-1).headers['content-type'], 'application/json');
  assert.deepEqual(proxied.at(-1).body, d.apiBody);
  assert.ok(host.issuedTickets.length > 0);
  for (const { audience } of host.issuedTickets) assert.equal(audience, new URL(child.origin).host);
  assert.ok(host.authChecks.length >= proxied.length);
  for (const check of host.authChecks) {
    assert.equal(check.method, 'GET');
    assert.equal(check.url, '/');
    assert.equal(check.headers.cookie, d.ownerCookie);
  }
});

test('the relay does not expose inspector or child admission routes', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { initialChild: child });
  const paths = [
    '/inspector', '/inspector/assets/tool.js', '/api/experimental-inspector',
    '/api/experimental-inspector/status', '/connect', d.admission,
  ];
  for (const path of paths) {
    assert.equal((await host.http(d.mount + path)).status, 404, path);
  }
  assert.deepEqual(child.seen, []);
  assert.deepEqual(host.issuedTickets, []);
  // A neighboring segment is not an inspector route.
  assert.equal((await host.http(d.mount + '/inspector-notes')).status, 200);
});

test('the relay denies service worker script requests without denying ordinary assets', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { initialChild: child });
  const script = d.mount + '/worker.js';
  for (const headers of [{ 'service-worker': 'script' }, { 'sec-fetch-dest': 'serviceworker' }]) {
    assert.equal((await host.http(script, { headers })).status, 404, JSON.stringify(headers));
  }
  assert.deepEqual(child.seen, []);
  assert.deepEqual(host.issuedTickets, []);
  assert.equal((await host.http(script)).status, 200);
});

test('child HTTP redirect stays within the configured public mount and withholds upstream cookies', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { value: d.publicOrigin + webRoot, initialChild: child });
  const publicPrefix = d.publicOrigin + webRoot + d.mount.slice(1);
  const redirect = await host.http(d.mount + d.redirect);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers['set-cookie'], undefined);
  assert.equal(new URL(redirect.headers.location, publicPrefix + d.redirect).href,
    publicPrefix + d.redirectTarget);
});

test('owner mux delivers frames independently in both directions and no upstream Set-Cookie', options, async t => {
  const child = await createChild(t);
  const host = await createHost(t, { initialChild: child });
  const query = '?channel=chat';
  const browser = await host.upgrade({ path: d.mount + d.mux + query, headers: bearer });
  assert.equal(browser.status, 101);
  assert.equal(browser.headers['set-cookie'], undefined);
  assert.equal(await browser.socket.read(), d.wsDown);
  browser.socket.send(d.wsUp);
  assert.equal(await child.socket.read(), d.wsUp);
  assert.deepEqual(assertChildCredentials(child).map(({ method, url }) => [method, url]), [['UPGRADE', d.mux + query]]);
});

// State transitions: same origin stays usable; disappearance closes old streams;
// after recovery, new traffic goes only to the replacement child.
test('readiness controls new requests and invalidates in-flight HTTP and WS on loss', options, async t => {
  const host = await createHost(t);
  async function assertUnavailable() {
    assert.equal((await host.http(assetPath)).status, 503);
    assert.equal((await host.upgrade()).status, 503);
  }
  await assertUnavailable();
  const child = await createChild(t);
  host.setChild(child);
  const browser = await host.upgrade();
  assert.equal(browser.status, 101);
  assert.equal(await browser.socket.read(), d.wsDown);
  const stream = await host.openStream(d.mount + d.stream);
  assert.equal(stream.statusCode, 200);
  assert.equal((await once(stream, 'data', { signal: t.signal }))[0].toString(), d.streamStart);
  // Interrupting an incomplete response can also emit an expected abort error.
  stream.on('error', () => {});
  const streamClosed = new Promise(resolve => stream.once('close', resolve));
  host.setChild(child);
  browser.socket.send(d.wsUp);
  assert.equal(await child.socket.read(), d.wsUp);
  const closed = Promise.all([
    streamClosed, child.streamClosed, browser.socket.waitForClose(), child.socket.waitForClose(),
  ]);
  host.setChild(undefined);
  await closed;
  assert.equal(stream.complete, false, 'the stale HTTP stream was interrupted');
  const previousRequests = child.seen.length;
  await assertUnavailable();
  assert.equal(child.seen.length, previousRequests);

  const replacement = await createChild(t);
  host.setChild(replacement);
  assert.equal((await host.http(assetPath)).status, 200);
  assert.equal((await host.upgrade()).status, 101);
  assert.equal(child.seen.length, previousRequests);
  assert.deepEqual(assertChildCredentials(replacement).map(({ method }) => method), ['GET', 'UPGRADE']);
});

function assertChildCredentials(child) {
  const proxied = [];
  let admitted = false;
  for (const request of child.seen) {
    assert.equal(request.headers.authorization, undefined);
    const url = new URL(request.url, child.origin);
    if (url.pathname === d.admission) {
      assert.equal(request.headers.cookie, undefined);
      assert.equal(url.searchParams.get('ticket'), d.ticket);
      admitted = true;
    } else {
      assert.ok(admitted, 'child admission precedes proxied traffic');
      assert.equal(request.headers.cookie, d.childCookie);
      assert.equal(url.searchParams.has('ticket'), false);
      proxied.push(request);
    }
  }
  assert.ok(admitted, 'the host used a server-side child admission ticket');
  return proxied;
}
