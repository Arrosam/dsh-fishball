/**
 * Test-owned opt-in configuration, not a new product API. A provisioner must
 * separately authorize and prepare disposable SDK fixtures. No child is started,
 * no credential file is read and there is deliberately no default URL.
 */
const HTTP = Object.freeze({
  protocol: 'http:',
  rootPath: '/',
  loopbackHosts: Object.freeze(['127.0.0.1', '[::1]']),
  reservedLivePorts: Object.freeze(['7713', '3081', '54679']),
  cookieHeader: 'Cookie',
  contentTypeHeader: 'Content-Type',
  jsonType: 'application/json',
  credentials: 'omit',
  redirects: 'error',
  // Harness transport budget only: never a product readiness/expiry oracle.
  requestBudgetMs: 30000,
  printableAscii: /^[\x20-\x7e]+$/,
  invalidConfiguration: 'Invalid disposable HTTP fixture configuration; values are not printed',
  failedTransport: 'Disposable fixture HTTP request failed; sensitive transport details are not printed',
});

function requireFixture(condition) {
  if (!condition) throw new Error(HTTP.invalidConfiguration);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createHttpFixtures(environmentName) {
  const raw = process.env[environmentName];
  let configuration;
  let invalid = false;
  if (raw !== undefined) {
    try {
      configuration = JSON.parse(raw);
    } catch {
      invalid = true;
    }
  }

  function isMissing(sdk, scenario) {
    if (raw === undefined) return true;
    if (invalid || !isRecord(configuration)) return false;
    if (configuration[sdk] === undefined) return true;
    if (!isRecord(configuration[sdk])) return false;
    return configuration[sdk][scenario] === undefined;
  }

  function fixtureFor(sdk, scenario) {
    requireFixture(!invalid && isRecord(configuration));
    const group = configuration[sdk];
    requireFixture(isRecord(group));
    const fixture = group[scenario];
    requireFixture(isRecord(fixture));
    requireFixture(fixture.disposable === true && fixture.syntheticAuth === true);
    requireFixture(typeof fixture.baseUrl === 'string');
    let origin;
    try {
      origin = new URL(fixture.baseUrl);
    } catch {
      // ERR_INVALID_URL can echo .input, including a mistakenly supplied secret.
      throw new Error(HTTP.invalidConfiguration);
    }
    requireFixture(origin.protocol === HTTP.protocol && HTTP.loopbackHosts.includes(origin.hostname));
    requireFixture(Boolean(origin.port) && !HTTP.reservedLivePorts.includes(origin.port));
    requireFixture(origin.pathname === HTTP.rootPath);
    requireFixture(!origin.username && !origin.password && !origin.search && !origin.hash);
    requireFixture(typeof fixture.cookie === 'string' && Boolean(fixture.cookie.trim()));
    // Undici header-validation errors can echo malformed input. Refuse it first.
    requireFixture(HTTP.printableAscii.test(fixture.cookie));
    return { ...fixture, origin };
  }

  async function request(fixture, endpoint, method, body) {
    let target;
    try {
      target = new URL(endpoint, fixture.origin);
    } catch {
      throw new Error(HTTP.invalidConfiguration);
    }
    requireFixture(target.origin === fixture.origin.origin);
    const headers = { [HTTP.cookieHeader]: fixture.cookie };
    if (body !== undefined) headers[HTTP.contentTypeHeader] = HTTP.jsonType;
    try {
      return await fetch(target, {
        method,
        headers,
        credentials: HTTP.credentials,
        redirect: HTTP.redirects,
        signal: AbortSignal.timeout(HTTP.requestBudgetMs),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      // No raw URL, cookie, payload or nested transport cause in test diagnostics.
      throw new Error(HTTP.failedTransport);
    }
  }

  return Object.freeze({ isMissing, fixtureFor, request });
}
