// Original authenticated node:http transport only; no captured RPC handler.
import { request } from 'node:http';
import { check, keys } from './public-oracles.mjs';

export const ROUTES = Object.freeze([
  ['/df-setup','status'], ['/df-setup','prepare'], ['/df-setup','confirm'],
  ['/df-setup','status'], ['/df-rpc','list'],
  ['/df-rpc','intake'], ['/df-rpc','status'], ['/df-rpc','export'],
  ['/df-rpc','detail'], ['/df-rpc','prepareContext'], ['/df-rpc','status'],
  ['/df-rpc','detail'], ['/df-rpc','export'], ['/df-rpc','prepareContext'],
  ['/df-rpc','status'], ['/df-rpc','prepareContext'], ['/df-rpc','status'],
  ['/df-rpc','export'], ['/df-rpc','status'],
]);

export function createPublicTransport(connection, port) {
  check(Number.isSafeInteger(port) && port > 0 && port <= 65535 && port !== 3080, 'PREP01_LOOPBACK_PORT');
  const authority = `127.0.0.1:${port}`;
  let cookie, exchanges = 0, posts = 0, total = 0, active = true;
  async function send(method, path, body, authenticated) {
    check(active && ++total <= 20, 'PREP01_HTTP_CAPACITY');
    check(path.startsWith('/') && !path.includes('\r') && !path.includes('\n'), 'PREP01_HTTP_PATH');
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    check(bytes === undefined || bytes.length <= 2048, 'PREP01_HTTP_REQUEST_BOUND');
    return new Promise((resolve, reject) => {
      let settled = false, timer;
      const fail = code => { if (settled) return; settled = true; clearTimeout(timer); reject(new Error(code)); };
      const headers = {Host:authority, Origin:`http://${authority}`};
      if (authenticated) { check(typeof cookie === 'string', 'PREP01_COOKIE_MISSING'); headers.Cookie = cookie; }
      if (bytes) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = bytes.length; }
      const req = request({hostname:'127.0.0.1',port,method,path,headers,agent:false}, res => {
        const chunks = []; let count = 0;
        res.on('data', chunk => {
          count += chunk.length;
          if (count > 65536) { res.destroy(); req.destroy(); fail('PREP01_HTTP_RESPONSE_BOUND'); }
          else chunks.push(chunk);
        });
        res.on('error', () => fail('PREP01_HTTP_RESPONSE_FAILED'));
        res.on('end', () => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)});
        });
      });
      req.on('error', () => fail('PREP01_HTTP_REQUEST_FAILED'));
      timer = setTimeout(() => { req.destroy(); fail('PREP01_HTTP_TIMEOUT'); }, 2000);
      req.end(bytes);
    });
  }
  function decode(response, id) {
    check(response.status === 200, 'PREP01_RPC_HTTP_STATUS');
    check(response.headers['content-type']?.split(';')[0] === 'application/json', 'PREP01_RPC_CONTENT_TYPE');
    let message;
    try { message = JSON.parse(response.bytes.toString('utf8')); } catch { throw new Error('PREP01_RPC_JSON'); }
    keys(message, ['type','rpcId','result']);
    check(message.type === 'server-response' && message.rpcId === id, 'PREP01_RPC_CORRELATION');
    const result = message.result;
    check(result && typeof result.ok === 'boolean', 'PREP01_RPC_RESULT');
    keys(result, result.ok ? ['ok','value'] : ['ok','error']);
    if (!result.ok) {
      keys(result.error, ['code','message','details']);
      // Only this selected finite domain refusal is an expected negative.
      check(result.error.code === 'STALE_VERSION' && result.error.message === 'STALE_VERSION', 'PREP01_UNEXPECTED_RPC_REFUSAL');
      keys(result.error.details, []);
    }
    return result;
  }
  return Object.freeze({
    async authenticate() {
      check(++exchanges === 1 && posts === 0, 'PREP01_AUTH_EXCHANGE_COUNT');
      const url = new URL(connection.authenticatedUrl(`http://${authority}/`));
      check(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === String(port) && url.pathname === '/', 'PREP01_AUTH_URL');
      const response = await send('GET', url.pathname + url.search, undefined, false);
      check(response.status === 303 && response.headers.location === './', 'PREP01_AUTH_REDIRECT');
      const cookies = response.headers['set-cookie'];
      check(Array.isArray(cookies) && cookies.length === 1, 'PREP01_AUTH_COOKIE_COUNT');
      cookie = cookies[0].split(';', 1)[0];
      check(cookie.length > 0 && Buffer.byteLength(cookie) <= 4096 && !/[\r\n]/.test(cookie), 'PREP01_AUTH_COOKIE');
      check(response.bytes.length === 0, 'PREP01_AUTH_BODY');
    },
    async call(channel, name, payload) {
      check(exchanges === 1 && posts < 18, 'PREP01_RPC_CAPACITY');
      const expected = ROUTES[posts];
      check(channel === expected[0] && name === expected[1], 'PREP01_RPC_ORDER');
      const id = `ni6-prep01-${++posts}`, method = `v1/${name}`;
      const result = decode(await send('POST', `${channel}/${method}`, {type:'client-request',rpcId:id,method,payload}, true), id);
      if (posts !== 16) check(result.ok === true, 'PREP01_EXPECTED_RPC_SUCCESS');
      else check(result.ok === false, 'PREP01_EXPECTED_STALE_REFUSAL');
      return result.ok ? result.value : result.error.code;
    },
    async afterEntryDisposal(payload) {
      check(posts === 18 && exchanges === 1, 'PREP01_POST_DISPOSAL_ORDER');
      posts++;
      const response = await send('POST', '/df-rpc/v1/status', {type:'client-request',rpcId:'ni6-prep01-19',method:'v1/status',payload}, true);
      check(response.status === 404 && response.bytes.length === 0, 'PREP01_ROUTE_NOT_REMOVED');
    },
    counts() { return Object.freeze({authExchanges:exchanges,domainRpcAttempts:Math.min(posts,18),postDisposalHttp:Math.max(posts-18,0),httpRequests:total}); },
    close() { active = false; cookie = undefined; },
  });
}
