import assert from 'node:assert/strict';
import test from 'node:test';
import { registerTaskCases, SDK_VERSIONS } from './support.mjs';
import { createHttpFixtures } from './http-fixtures.mjs';

const PAGE = Object.freeze({
  task: 'PAGE',
  source: 'docs/planning/v2-final-scope.md §2.1, §4 PAGE/READY, §4.2; d41b4e3 extension design X1a; docs/integration-v2-nov9-wave2.md:26 (route response contract only)',
  prerequisite: 'PAGE owner: document an independent native-page driver and real request/activation/session/model-turn observations; no such adapter is documented. READY supplies actual child appReady lifecycle; BROWSER proves integrated UI later.',
  fixtureEnvironment: 'FBTEST_V2_PAGE_HTTP_FIXTURES',
  endpoint: 'api/fishball/session',
  methods: Object.freeze({ get: 'GET', post: 'POST', put: 'PUT', head: 'HEAD' }),
  statuses: Object.freeze({ ok: 200, methodNotAllowed: 405, unavailable: 503 }),
  errors: Object.freeze({ methodNotAllowed: 'METHOD_NOT_ALLOWED', unavailable: 'MANAGER_UNAVAILABLE' }),
  headers: Object.freeze({ cacheControl: 'cache-control', allow: 'allow' }),
  noStore: 'no-store',
  identityKey: 'sessionId',
  freshFixture: 'freshReady',
  existingFixture: 'existingReady',
  unavailableFixture: 'managerUnavailable',
  concurrentRequests: 2,
  titleSeparator: ' | ',
  useCaseTechnique: 'Use Case',
});

function pageCase(id, title, technique, preconditions, steps, expected, missing = PAGE.prerequisite) {
  return Object.freeze({ id, task: PAGE.task, title, technique, source: PAGE.source, preconditions, steps, expected, missing });
}

// These cases need observations that HTTP responses alone cannot establish. They
// stay TODO rather than substituting a fake manager, UI, readiness gate or model.
export const CASES = Object.freeze([
  pageCase('PAGE-UC-02', 'Open an already identified manager from the native page', 'Use Case; EP; Decision Table P1',
    'Ready V2-only child; identity GET returns fixture manager fishball-manager-existing; native page not yet open.',
    'Open Fishball once; observe the initial request, returned identity and intended native session selection.',
    'Identity GET only, no POST; select exactly the returned manager; no activation or model turn caused by identity lookup.'),
  pageCase('PAGE-UC-03', 'Open an unidentified manager through authenticated ensure', 'Use Case; EP; Decision Table P2; State Transition P-T1/P-T2',
    'Fresh V2-only child; no manager, pending notice or unrelated activation; actual child ready signal fired.',
    'Open Fishball; observe GET null, authenticated POST, manager.ensureSession, singleton chat.activate, returned identity and native selection.',
    'One initial GET then one authenticated POST; ensure joins singleton activation, creates/resumes one manager and selects that identity; no model turn.'),
  pageCase('PAGE-UC-04', 'Explicitly retry after POST failure', 'Use Case; Decision Table P4/P7; State Transition P-T3/P-T6',
    'Page-open GET returned null; POST activation failed; manager still absent; repair activation without triggering UI actions.',
    'Observe unavailable state and Retry; issue focus and sessions-list notifications; then press Retry once.',
    'Failure is visible with explicit Retry; passive events never POST; Retry re-GETs, then null authorizes one POST and selects its successful identity.'),
  pageCase('PAGE-UC-05', 'Retry GET failure after a manager becomes available', 'Use Case; Decision Table P3/P6; State Transition P-T3/P-T5',
    'Initial identity GET failed; page unavailable; independently existing manager fishball-manager-existing is now readable.',
    'Press explicit Retry once; inspect GET, POST journal and native selection.',
    'Retry re-GETs; existing nonblank identity is selected with no POST and no page-caused activation/model turn.'),
  pageCase('PAGE-UC-06', 'Refresh identity without permission to create', 'Use Case; EP; Decision Table P5; State Transition P-T4',
    'Page-open activation failed or no manager is present; child has not independently created a manager.',
    'Dispatch one focus event and one sessions-list notification independently; return GET null for both.',
    'Each event may read identity through GET only; neither creates, POSTs, runs a model turn or treats null as a usable manager.'),
  pageCase('PAGE-UC-07', 'Join concurrent page opens', 'Use Case; BVA; State Transition P-T7',
    'Fresh ready child; two native Fishball views; activation completion is independently held.',
    'Open both views before activation completes; release activation; observe both returned identities and manager session creation journal.',
    'Both views resolve to the same manager; one singleton activation/session, no duplicate manager and no model turn.'),
  pageCase('PAGE-EP-06', 'Do not POST after an unavailable identity GET', 'EP; Decision Table P3',
    'Page initial identity GET returns 503 MANAGER_UNAVAILABLE.',
    'Open page; observe error surface, request journal and explicit Retry availability.',
    'Unavailable plus Retry; no speculative POST, fabricated ID, native session selection or automatic retry.'),
  pageCase('PAGE-EP-07', 'Do not select a manager after unavailable POST', 'EP; Decision Table P4',
    'Initial GET null; authenticated ensure POST returns 503 MANAGER_UNAVAILABLE.',
    'Complete the failed page-open request; inspect selection and later passive activity.',
    'Unavailable plus Retry, no guessed/fallback identity or successful selection; no automatic creation retry.'),
  pageCase('PAGE-EP-08', 'Refuse malformed successful GET identities', 'EP',
    'Independent page driver can return successful identity responses with missing sessionId, blank string, whitespace-only string, numeric ID, or invalid JSON separately.',
    'Open a fresh view for each invalid response partition; inspect request and selection journals.',
    'Each malformed GET is unavailable with explicit Retry; it is not treated as the documented null-identity branch and does not authorize POST or guess an ID.'),
  pageCase('PAGE-EP-09', 'Refuse malformed successful POST identities', 'EP',
    'Initial GET null; page driver can return POST success with null, missing, blank, whitespace-only or numeric sessionId, or invalid JSON separately.',
    'Open a fresh view for each invalid POST response partition; inspect selection and failure state.',
    'No invalid identity is selected or reported ready; visible unavailable/Retry, no automatic extra POST.'),
  pageCase('PAGE-EP-10', 'Refuse unauthenticated ensure without activation', 'EP',
    'Fresh ready disposable child; observer can count ensure/activation; request has no valid native admission.',
    'Send POST api/fishball/session without authentication; inspect response and manager/model journals.',
    'Authentication refuses the operation; zero ensure/activation/session/model-turn side effects; exact admission status remains owned by PG-ORIGIN/native SDK.',
    'PAGE + PG-ORIGIN owners: disposable native admission fixture plus manager/activation observation; HTTP authentication shape/status is not invented here.'),
  pageCase('PAGE-DT-01', 'Keep failed-page focus and list recovery GET-only with null', 'Decision Table P5; State Transition P-T4',
    'Page unavailable after failed GET or failed POST; repaired identity service returns null; execute each failure origin separately.',
    'Dispatch focus and sessions-list notifications separately for each failure origin.',
    'GET-only re-reads; no POST/activation/model turn; failure never silently becomes successful session creation.'),
  pageCase('PAGE-DT-02', 'Retry GET failure into the null-identity creation branch', 'Decision Table P7; State Transition P-T6',
    'Initial GET failed; child is now actually ready and identity GET returns null.',
    'Press explicit Retry; complete subsequent POST successfully with fixture manager identity.',
    'Fresh GET precedes one authenticated POST; singleton manager selected without a model turn.'),
  pageCase('PAGE-DT-03', 'Do not create on passive recovery to an existing identity', 'Decision Table P5; State Transition P-T4',
    'Page unavailable after failed GET or POST; another authorized path now owns fishball-manager-existing.',
    'Dispatch focus and sessions-list events independently; allow identity GET to return that manager.',
    'Only GET identity re-reads; no POST or new manager activation. This case does not invent additional passive-navigation UX.'),
  pageCase('PAGE-ST-01', 'Reopen an existing manager without duplicate activation', 'State Transition P-T8',
    'Successful page-open manager exists; lifecycle generation unchanged.',
    'Open another native Fishball view; then dispatch focus/list refresh after successful selection.',
    'All successful identity observations retain the same manager; passive refresh and existing-ID opens never create or POST; no extra model turn.'),
  pageCase('PAGE-ST-02', 'Share authorized notice and page activation in either order', 'State Transition P-T7; Decision Table P8',
    'Fresh ready child; authorized existing notice delivery and page ensure can be independently paused at activation.',
    'Run page ensure before notice, then notice before page ensure in separate fresh fixtures; overlap activation in each.',
    'The page joins the existing singleton activation in both orders; one manager. Any authorized notice turn is distinct; page ensure contributes no additional turn.',
    'PAGE owner: independent ensure/notice overlap journal and turn provenance; retain existing authorized manager work rather than adding a new global readiness policy.'),
  pageCase('PAGE-ST-03', 'Resume persisted manager identity after restart', 'State Transition P-T9',
    'Manager created by page-open; same disposable V2-only child home/session logs survive an authorized restart.',
    'Restart; wait for new actual child readiness; open page and observe identity/ensure/resume plus persisted sessions.',
    'Existing singleton identity is reused/resumed as applicable, not a second manager; mere page open adds no model turn.',
    'PAGE + READY owners: documented same-home restart fixture, persisted identity/session observer and real readiness control.'),
  pageCase('PAGE-ST-04', 'Read identity without ensure and ensure without a model turn', 'State Transition P-T1/P-T2; EP',
    'Fresh ready child; no unrelated waking work; ensure/activation/session/model request journals independently observable.',
    'Read identity while absent, ensure once, read identity while live, ensure again.',
    'Reads never call ensure/activate; both ensure calls return one live manager identity through singleton activation; zero page-caused model calls/turn starts.'),
]);

// The fixture contract is test-owned configuration, not an invented product API.
// Only the documented session route is called. The provider must start disposable
// ready/unavailable fixtures separately; this module never boots or installs DSH.
export const HTTP_CASES = Object.freeze([
  Object.freeze({ ...pageCase('PAGE-UC-01', 'Observe fresh ready HTTP identity then idempotent ensure', 'Use Case; EP; BVA; State Transition P-H1',
    'Explicit synthetic-auth disposable freshReady fixture for this SDK; actual appReady already fired; no manager/unrelated writers.',
    'GET null twice; POST ensure; GET returned ID; repeat POST; issue two overlapping POSTs.',
    'GETs initially null; POST returns a nonblank ID; later GET/repeated/concurrent POSTs return exactly that ID; successful GET identity responses are no-store. HTTP alone proves neither activation count nor no model turn.',
    'PAGE owner: supply separately authorized freshReady loopback fixture and synthetic native-admission cookie; lifecycle/no-turn observations remain PAGE-ST-04 TODO.'), fixture: PAGE.freshFixture }),
  Object.freeze({ ...pageCase('PAGE-EP-01', 'Read an existing HTTP manager identity', 'EP',
    'Explicit existingReady fixture with configured expectedSessionId, synthetic admission, no unrelated writers.',
    'GET api/fishball/session twice.',
    'Both 200 responses contain exactly the configured identity and are no-store; this does not prove internal absence of activation.',
    'PAGE owner: supply existingReady disposable loopback fixture, expectedSessionId and synthetic native-admission cookie.'), fixture: PAGE.existingFixture }),
  Object.freeze({ ...pageCase('PAGE-EP-02', 'Observe unavailable identity HTTP refusal', 'EP; Decision Table P3',
    'Explicit managerUnavailable fixture; authenticated route exists but manager capability unavailable.',
    'GET api/fishball/session.',
    '503 response contains MANAGER_UNAVAILABLE; no error nesting is assumed; side-effect assertions remain TODO.',
    'PAGE owner: supply managerUnavailable disposable loopback fixture with synthetic admission.'), fixture: PAGE.unavailableFixture, method: PAGE.methods.get, status: PAGE.statuses.unavailable, error: PAGE.errors.unavailable }),
  Object.freeze({ ...pageCase('PAGE-EP-03', 'Observe unavailable ensure HTTP refusal', 'EP; Decision Table P4',
    'Explicit managerUnavailable fixture; route exists and authenticated ensure cannot be provided.',
    'POST api/fishball/session.',
    '503 response contains MANAGER_UNAVAILABLE, never a success identity; no invented nested error envelope.',
    'PAGE owner: supply managerUnavailable disposable loopback fixture with synthetic admission.'), fixture: PAGE.unavailableFixture, method: PAGE.methods.post, status: PAGE.statuses.unavailable, error: PAGE.errors.unavailable }),
  Object.freeze({ ...pageCase('PAGE-EP-04', 'Refuse unsupported PUT with documented Allow', 'EP; Decision Table P9',
    'Explicit existingReady disposable fixture with synthetic admission.',
    'PUT api/fishball/session.',
    '405 METHOD_NOT_ALLOWED with exactly GET and POST advertised in Allow; internal no-activation observation remains TODO.',
    'PAGE owner: supply existingReady disposable loopback fixture with synthetic admission.'), fixture: PAGE.existingFixture, method: PAGE.methods.put, status: PAGE.statuses.methodNotAllowed, error: PAGE.errors.methodNotAllowed }),
  Object.freeze({ ...pageCase('PAGE-EP-05', 'Refuse unsupported HEAD with documented Allow', 'EP; Decision Table P9',
    'Explicit existingReady disposable fixture with synthetic admission.',
    'HEAD api/fishball/session.',
    '405 with exactly GET and POST advertised in Allow. HEAD has no response-body oracle.',
    'PAGE owner: supply existingReady disposable loopback fixture with synthetic admission.'), fixture: PAGE.existingFixture, method: PAGE.methods.head, status: PAGE.statuses.methodNotAllowed }),
]);

const fixtures = createHttpFixtures(PAGE.fixtureEnvironment);

function request(fixture, method) {
  return fixtures.request(fixture, PAGE.endpoint, method);
}

async function identity(fixture, method) {
  const response = await request(fixture, method);
  assert.equal(response.status, PAGE.statuses.ok);
  if (method === PAGE.methods.get) {
    const cacheControl = response.headers.get(PAGE.headers.cacheControl);
    assert.ok(cacheControl?.toLowerCase().split(',').map(token => token.trim()).includes(PAGE.noStore), 'Successful identity GET responses must be no-store');
  }
  const body = await response.json();
  assert.ok(body && typeof body === 'object' && !Array.isArray(body), 'Identity response must be a JSON object');
  assert.ok(Object.hasOwn(body, PAGE.identityKey), 'Identity response must provide its documented sessionId field');
  return body[PAGE.identityKey];
}

function assertLiveIdentity(value) {
  assert.equal(typeof value, 'string', 'Ensured manager identity must be a string');
  assert.ok(value.trim(), 'Ensured manager identity must be nonblank; no length/grammar is invented');
}

async function runHttpCase(record, sdk) {
  const fixture = fixtures.fixtureFor(sdk, record.fixture);
  if (record.fixture === PAGE.freshFixture) {
    assert.equal(await identity(fixture, PAGE.methods.get), null);
    assert.equal(await identity(fixture, PAGE.methods.get), null);
    const ensured = await identity(fixture, PAGE.methods.post);
    assertLiveIdentity(ensured);
    assert.equal(await identity(fixture, PAGE.methods.get), ensured);
    assert.equal(await identity(fixture, PAGE.methods.post), ensured);
    const joined = await Promise.all(Array.from({ length: PAGE.concurrentRequests }, () => identity(fixture, PAGE.methods.post)));
    assert.deepEqual(joined, Array.from({ length: PAGE.concurrentRequests }, () => ensured));
    return;
  }
  if (record.method === undefined) {
    assertLiveIdentity(fixture.expectedSessionId);
    assert.equal(await identity(fixture, PAGE.methods.get), fixture.expectedSessionId);
    assert.equal(await identity(fixture, PAGE.methods.get), fixture.expectedSessionId);
    return;
  }
  const response = await request(fixture, record.method);
  assert.equal(response.status, record.status);
  if (record.status === PAGE.statuses.methodNotAllowed) {
    const allowed = response.headers.get(PAGE.headers.allow);
    assert.ok(allowed, 'Method refusal must advertise Allow');
    assert.deepEqual(allowed.split(',').map(method => method.trim()).sort(), [PAGE.methods.get, PAGE.methods.post].sort());
  }
  if (record.error !== undefined) {
    const body = await response.text();
    assert.ok(body.includes(record.error), 'Refusal response must contain its documented error token; no envelope nesting is assumed');
  }
}

function registerHttpCases(records) {
  // Both names label independently supplied fixtures; a run against one SDK must
  // never be represented as dual-SDK verification. Missing fixtures are real TODOs.
  for (const sdk of SDK_VERSIONS) {
    for (const record of records) {
      const title = [record.id, sdk, record.title].join(PAGE.titleSeparator);
      if (fixtures.isMissing(sdk, record.fixture)) {
        test.todo(title, { todo: `${PAGE.task} owner; SDK ${sdk}; ${record.missing} Expected: ${record.expected}` });
      } else {
        test(title, () => runHttpCase(record, sdk));
      }
    }
  }
}

const isUseCase = record => record.technique.startsWith(PAGE.useCaseTechnique);
registerHttpCases(HTTP_CASES.filter(isUseCase));
registerTaskCases(CASES.filter(isUseCase));
registerHttpCases(HTTP_CASES.filter(record => !isUseCase(record)));
registerTaskCases(CASES.filter(record => !isUseCase(record)));
