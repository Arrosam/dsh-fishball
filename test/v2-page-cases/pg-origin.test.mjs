import { registerTaskCases } from './support.mjs';

// Requirements-only data: native admission traces need real owned components/browser
// observations. Missing seams remain TODO, never a simulated passing auth model.
const CONTEXT = Object.freeze({
  task: 'PG-ORIGIN',
  source: 'docs/planning/v2-final-scope.md §4 PG-ORIGIN, §4.3(4)-(5); docs/test-design/v2-origin-lite-set-cases.md §1',
  missing: 'PG-ORIGIN: no documented runnable isolated-admission/lifecycle harness or browser-origin/referrer fixture; retain task-named TODO.',
});
const FIXTURE = Object.freeze({
  main: 'http://127.0.0.1:54679',
  childA: 'owned-A at http://127.0.0.1:47131',
  childB: 'owned-B at http://127.0.0.1:47132',
  unrelatedPort: '47133',
  clock: 'Fixture native clock now, delta 1 ms, native configured TTL M; no sleep or production credential.',
});

export const CASES = Object.freeze([
  {
    id: 'ORIGIN-UC-01', title: 'Admit owner to isolated native child and clean final URL', technique: 'Use Case',
    preconditions: ['Actor: authenticated owner; same-host Web.', FIXTURE.childA, 'Relative credential-free launch descriptor; current child ready; no child cookie.'],
    steps: ['Main: open descriptor; broker privately obtains exact owned native access; follow broker 303 then native admission 303 ./; inspect final document/base/transport.', 'Alternative: valid child cookie; continue validated view=settings and lang=zh deliberately after native query cleanup.', 'Exception: authentication, ownership or native-access refusal leaves parent status/Retry available.'],
    expected: ['Final origin is child, not main-origin document proxy; final URL has no launch token.', 'Both admission redirects use no-store/no-referrer and iframe uses referrerPolicy=no-referrer.', 'Native framing defaults retained; main localStorage/shortcuts unchanged; no credential in shared descriptor/status.'],
  },
  {
    id: 'ORIGIN-UC-02', title: 'Retry reacquires replacement generation authority and admission', technique: 'Use Case',
    preconditions: ['Actor: owner; A failed or retiring; parent status/Retry available.', FIXTURE.childA, FIXTURE.childB],
    steps: ['Main: invoke explicit Retry through owned lifecycle; admit/remount B with freshly acquired current access.', 'Alternative: replacement reuses A port; revalidate generation and nonempty origin preferences.', 'Exception: complete old A access/readiness after B exists, or fail restart.'],
    expected: ['Old A cannot authorize or remount; failed restart remains honestly failed and retryable.', 'No stale token/origin reuse, child DOM inspection or secret-bearing status/log.', 'Actual readiness, not frame load or heartbeat, controls availability.'],
  },
  {
    id: 'ORIGIN-UC-03', title: 'Keep graceful status and explicit Retry outside unavailable frame', technique: 'Use Case',
    preconditions: ['Actor: owner; parent authenticated shell reachable; no admitted current child.'],
    steps: ['Main: open Fishball while child unavailable; use parent status then explicit Retry.', 'Alternative: child later becomes ready; reacquire exact current admission.', 'Exception: auth/access/start failure or frame load without child ready.'],
    expected: ['Loading/unavailable/error reason stays visible outside frame and main remains usable.', 'No timer-success, arbitrary redirect, response proxy or fallback navigation.', 'Load alone does not claim admitted application readiness.'],
  },
  {
    id: 'ORIGIN-EP-01', title: 'Refuse unauthenticated main admission and protected actions', technique: 'EP',
    preconditions: [FIXTURE.childA, 'Valid current owned runtime but no main owner authentication.'],
    steps: ['Request launch route and protected status/Retry actions without owner authorization.'],
    expected: ['No launch capability/token or protected lifecycle mutation; observable authentication-safe refusal, not admitted content.'],
  },
  {
    id: 'ORIGIN-EP-02', title: 'Refuse user-controlled external admission target', technique: 'EP',
    preconditions: ['Owner authenticated; owned A otherwise valid.'],
    steps: ['Supply target https://example.invalid/ through any admission target/continuation input.'],
    expected: ['No arbitrary external redirect or credential dispatch; no wildcard CORS workaround.'],
  },
  {
    id: 'ORIGIN-EP-03', title: 'Refuse unowned trusted-loopback authority', technique: 'EP',
    preconditions: ['Owner authenticated; A is exact current allowlisted target.', `Unrelated fixture port ${FIXTURE.unrelatedPort}.`],
    steps: ['Try sibling loopback port instead of owned A.'],
    expected: ['Exact generation-authority allowlist rejects it; trusted same-host cookie scope does not authorize arbitrary target ports.'],
  },
  {
    id: 'ORIGIN-EP-04', title: 'Refuse retired generation admission', technique: 'EP',
    preconditions: [FIXTURE.childA, FIXTURE.childB, 'A access captured before rotation; only B now current.'],
    steps: ['Complete old A admission after replacement ownership established.'],
    expected: ['A cannot authorize redirect or remount; status/Retry remains generation-correct.'],
  },
  {
    id: 'ORIGIN-EP-05', title: 'Reject invalid native token without existing cookie', technique: 'EP',
    preconditions: ['Disposable native auth fixture, correct authority, no valid cookie; generated token only.'],
    steps: ['Change one token character; request native root GET.'],
    expected: ['Native unauthorized result; no new authenticated cookie or protected index. Native token reusability is not changed.'],
  },
  {
    id: 'ORIGIN-EP-06', title: 'Reject duplicate native token query without valid cookie', technique: 'EP',
    preconditions: ['Disposable native auth fixture; no valid cookie.'],
    steps: ['GET native root with two token query values, including the valid generated value.'],
    expected: ['Duplicate query does not authenticate or mint session cookie; native unauthorized result.'],
  },
  {
    id: 'ORIGIN-EP-07', title: 'Reject tampered signed browser cookie', technique: 'EP',
    preconditions: ['Generated valid browser cookie; correct audience and valid time.'],
    steps: ['Change one cookie byte; request protected native document/API.'],
    expected: ['Signature validation rejects; no authenticated content.'],
  },
  {
    id: 'ORIGIN-EP-08', title: 'Reject cross-authority cookie despite host-scoped transport', technique: 'EP',
    preconditions: [FIXTURE.childA, FIXTURE.childB, 'Valid signed A browser cookie.'],
    steps: ['Supply A cookie to B; separately relabel its name to B cookie name while keeping A signed payload.'],
    expected: ['Cookie-name/audience validation prevents B authentication.', 'Do not require browser to withhold matching host cookies across trusted sibling ports.'],
  },
  {
    id: 'ORIGIN-EP-09', title: 'Keep reusable launch credential out of public and persisted sinks', technique: 'EP',
    preconditions: ['Synthetic token/cookie sentinels in disposable success and failure admission flows.'],
    steps: ['Inspect descriptor/status/errors/telemetry/persisted client config and launch-query logging sinks.'],
    expected: ['No token/cookie in public or persisted sinks; launch-query logging redacted.', 'Sensitive browser redirect traces may contain native reusable token; clean final URL is not falsely called trace erasure or one-use admission.'],
  },
  {
    id: 'ORIGIN-EP-10', title: 'Validate non-secret view and language continuation', technique: 'EP',
    preconditions: ['Owner admission to A; native redirect cleans query.'],
    steps: ['Continue intended settings/zh through proven mechanism; separately supply arbitrary URL and unsupported values.'],
    expected: ['Intended allowed view/language survives deliberately, not by assuming native query survival.', 'Invalid input is refused or stays safe; never arbitrary redirect, credential continuation or third-party dispatch.'],
  },
  {
    id: 'ORIGIN-EP-11', title: 'Preserve native framing defaults without response proxy', technique: 'EP',
    preconditions: ['Independent native-default, deployment exact-child-allowing frame-src, and deployment-added frame-src/XFO/CSP blocking fixtures.'],
    steps: ['Admit and attempt native document load; observe response provenance, base, connection destinations and external parent shell for each fixture.'],
    expected: ['Native headers/defaults retained; no old SAMEORIGIN/self proxy restriction copied to cross-origin child.', 'No response proxy or document/HTML/SSE/WS rewrite; no invented exact-main frame-ancestors gate.', 'Deployment blocking never becomes false ready: external parent status/unavailable/Retry stays usable without frame DOM access or bypassing the deployment policy.'],
  },
  {
    id: 'ORIGIN-EP-12', title: 'Preserve accepted trusted-host cookie attributes and distinct names', technique: 'EP',
    preconditions: [FIXTURE.main, FIXTURE.childA, 'Same host/scheme; existing main cookie; optional actual-TLS native fixture.'],
    steps: ['Admit child; inspect native Set-Cookie and retain main cookie.'],
    expected: ['Authority-hashed names differ; main cookie not overwritten; HttpOnly, Path=/, SameSite=Strict.', 'Secure only for actual TLS listener; same-host cross-port cookie sending accepted, not malicious-local-server isolation.'],
  },
  {
    id: 'ORIGIN-EP-13', title: 'Keep absolute origins out of public connector descriptor', technique: 'EP',
    preconditions: ['Current child has direct isolated browser origin.'],
    steps: ['Try public descriptor with absolute child URL instead of relative credential-free admission path.'],
    expected: ['Relative descriptor validation protection retained; no general arbitrary external iframe admission or contract downgrade.'],
  },
  {
    id: 'ORIGIN-EP-14', title: 'Refuse secret-bearing relative descriptor', technique: 'EP',
    preconditions: ['Relative launch path otherwise valid.'],
    steps: ['Add token query carrying synthetic launch credential to public descriptor.'],
    expected: ['Secret-bearing descriptor refused; admitted design retains non-secret relative launch route.'],
  },
  {
    id: 'ORIGIN-BVA-01', title: 'Enforce native browser cookie expiry equality', technique: 'BVA',
    source: `${CONTEXT.source}; immutable rc.5 and rc.1 dsh-client-connection/lib/index.js:559-569 (links in catalogue)`,
    preconditions: [FIXTURE.clock, 'Valid signature/audience/issuance and positive lifetime within M.'],
    steps: ['Independently evaluate now=expiresAt-1 ms, now=expiresAt, now=expiresAt+1 ms.'],
    expected: ['Accepted before expiry; equality and after rejected. No live cookie/clock or invented default TTL.'],
  },
  {
    id: 'ORIGIN-BVA-02', title: 'Enforce native issuance and lifetime bounds independently', technique: 'BVA',
    source: `${CONTEXT.source}; immutable rc.5 and rc.1 dsh-client-connection/lib/index.js:559-569 (links in catalogue)`,
    preconditions: [FIXTURE.clock, 'Valid signature/audience; isolate issuance and upper lifetime bound where feasible.'],
    steps: ['Compare issuedAt=now-1 ms, now, now+1 ms with otherwise positive nonexpired lifetime within M.', 'Compare positive lifetime=M and M+1 ms at issuedAt=now to isolate maximum lifetime.', 'Also test lifetime=0 with nonfuture issuance; acknowledge expiry necessarily overlaps this refusal.'],
    expected: ['Past/current issuance allowed; future issuance refused.', 'M accepted and M+1 ms refused with otherwise valid time guards.', 'Zero lifetime refused but does not independently isolate lifetime validation, because nonfuture issuance makes expiry nonfuture too.'],
  },
  {
    id: 'ORIGIN-DT-01', title: 'Admission R1 refuses unauthenticated request before target access', technique: 'Decision Table',
    preconditions: ['R1: authenticated=false; remaining admission conditions do not matter.'],
    steps: ['Request launch.'], expected: ['Refuse without capability/secret; only authentication-safe shell state.'],
  },
  {
    id: 'ORIGIN-DT-02', title: 'Admission R2 refuses noncurrent ownership and authority', technique: 'Decision Table',
    preconditions: ['R2: authenticated=true; exact current owned generation/authority=false.'],
    steps: ['Request launch to captured noncurrent target.'], expected: ['No redirect/native access; honest status/Retry without credential.'],
  },
  {
    id: 'ORIGIN-DT-03', title: 'Admission R3 holds unavailable until child access ready', technique: 'Decision Table',
    preconditions: ['R3: authenticated=true; exact owned generation/authority=true; native access ready=false.'],
    steps: ['Open launch and observe pending/unavailable; do not fire readiness.'],
    expected: ['No timer-based ready or fabricated admission; parent loading/status/Retry available.'],
  },
  {
    id: 'ORIGIN-DT-04', title: 'Admission R4 follows only exact owned native URL', technique: 'Decision Table',
    preconditions: ['R4: authenticated=true; exact owned target=true; access ready=true; obtained URL still exact owned target.'],
    steps: ['Perform broker and native admission.'],
    expected: ['Broker 303 plus native 303 ./ with no-store/no-referrer; final child document; native cookie validation; status independent of child DOM.'],
  },
  {
    id: 'ORIGIN-DT-05', title: 'Admission R5 refuses obtained redirect that changes authority', technique: 'Decision Table',
    preconditions: ['R5: authenticated=true; initially exact owned target=true; access ready=true; obtained redirect target no longer exact.'],
    steps: ['Complete access result with changed target.'],
    expected: ['Do not follow unowned redirect or dispatch token; visible error/Retry; no permissive redirect fallback.'],
  },
  {
    id: 'ORIGIN-ST-01', title: 'Wait on real current-generation readiness under repeated opens', technique: 'State Transition',
    preconditions: ['Current owned generation waiting; no actual ready/access signal yet.'],
    steps: ['Issue repeated opens; leave readiness absent; then emit actual current readiness.'],
    expected: ['Absent signal remains pending/unavailable; no heartbeat/timer success.', 'After real signal admission can proceed; concurrent waiters do not activate stale generation.'],
  },
  {
    id: 'ORIGIN-ST-02', title: 'Keep frame load distinct from admitted application readiness', technique: 'State Transition',
    preconditions: ['Admission underway; frame document can emit load before protected app readiness.'],
    steps: ['Emit load only, then actual admitted-app readiness through documented final mechanism.'],
    expected: ['Load alone never proves app ready; no generic cross-frame authority.', 'If narrow handshake is chosen later it must validate source, exact origin and generation; no hypothetical API assumed here.'],
  },
  {
    id: 'ORIGIN-ST-03', title: 'Fence stale admission completion after restart', technique: 'State Transition',
    preconditions: [FIXTURE.childA, FIXTURE.childB, 'A admitting with delayed access/ready callback.'],
    steps: ['Restart to B; deliver late A completion; complete current B admission.'],
    expected: ['A invalidated; B reacquired/remounted only with current access; no cross-origin DOM read; stable external status/Retry.'],
  },
  {
    id: 'ORIGIN-ST-04', title: 'Reconcile reused child port without touching main preferences', technique: 'State Transition',
    preconditions: ['A admitted; B replaces A and reuses port; child store has unrelated retained preferences; main shortcut/storage sentinel nonempty.'],
    steps: ['Re-admit replacement generation; allow LITE to reconcile before relevant input.'],
    expected: ['Port equality is not ownership/current-generation proof; no assumption of empty store.', 'Unrelated child preferences preserved; main localStorage byte-identical and no child-caused main storage update; no reset-all/save-restore.'],
  },
].map((entry) => Object.freeze({ ...CONTEXT, ...entry })));

registerTaskCases(CASES);
