import assert from 'node:assert/strict';
import test from 'node:test';
import { registerTaskCases, SDK_VERSIONS } from './support.mjs';
import { createHttpFixtures } from './http-fixtures.mjs';
import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BODY_SOUL, loadInstance } from '../support/body-soul-env.mjs';
import { CASE as ENGINE_CASE, clone, inventory, provider } from '../support/provider-sync-engine.mjs';
import { PREVIEW_LIFE_MS, SYNC_PLANTED, post, routeContext, syncHarness } from '../support/body-soul-sync.mjs';
import { ACTIVE_SDK, parsedFrames, relayLink } from '../support/set-relay.mjs';

// Native settings are the editor. SET owns only lifecycle/notice/links in the child; model sync is
// main-only (user decision 2026-11-11): it runs from the main fishball-instance card's owner routes.
// Component observations need real fixtures, never a fake passing policy model.
const CONTEXT = Object.freeze({
  task: 'SET',
  source: 'docs/planning/v2-final-scope.md §4 SET; docs/planning/v2-set.md; docs/plugins/instance-extension-points.md §11.8; docs/slim-native-design.md §10 (main-only sync, user decision 2026-11-11); docs/test-design/v2-origin-lite-set-cases.md §3',
  missing: 'SET: no documented runnable native slim-panel/lifecycle/sync observation harness with synthetic credentials; retain task-named TODO.',
});
const FIXTURE = Object.freeze({
  providerA: 'provider-missing-a with models alpha-small and alpha-large',
  providerB: 'provider-missing-b with model beta',
  singleFault: 'Single invalid guard only; every other applicable guard valid. No multi-fault error precedence asserted.',
  readonly: 'Effective one-line Read Only notice; stored higher sandbox value does not widen effective agent authority.',
  unchanged: 'Main profile/default model unchanged; existing child providers/keys preserved; chosen additions create-only.',
});

export const CASES = Object.freeze([
  {
    id: 'SET-UC-01', title: 'Use slim settings without duplicating native editors', technique: 'Use Case',
    preconditions: ['Actor: owner; protected child manager and native panel composition.'],
    steps: ['Main: open SET from conversation/connector; see status/Restart/the read-only model sync note pointing to the main card/one-line Read Only/native Settings and Plugins links; explicitly return.', 'Alternative: native Settings edits model/effort/plugins; composer uses native picker.', 'Exception: pending/unavailable/error is visible with meaningful explicit Retry.'],
    expected: ['No model sync control, no duplicated plugin/model/config/recommendation/Watchdog editor or D2 obsolete controls.', FIXTURE.readonly, FIXTURE.unchanged, 'Allowed native destinations and explicit Fishball return work.'],
  },
  {
    id: 'SET-UC-02', title: 'Restart only the exact owned child through existing lifecycle', technique: 'Use Case',
    preconditions: ['Actor: owner; exact current child handle A host-owned; main and unrelated runtime fixtures tracked.'],
    steps: ['Main: invoke existing lifecycle restart; confirm A stopped before starting B; refresh status and re-admit current generation.', 'Alternative: explicit Retry from failed state while main shell remains available.', 'Exception: ownership uncertain, stop/start failure or late A completion.'],
    expected: ['Only exact owned child affected; no unsafe signal/second writer or main/unrelated process change.', 'Failure honestly visible; no stale completion claims ready or replaces B.', FIXTURE.unchanged],
  },
  {
    id: 'SET-UC-03', title: 'Preview and add only selected missing API-key providers', technique: 'Use Case',
    preconditions: ['Actor: owner on the main DSH fishball-instance card (the only sync entry point); ready child; disposable synthetic inventory and credentials only.', FIXTURE.providerA, FIXTURE.providerB, 'Target has separate existing provider/key.'],
    steps: ['Main: Check once; inspect missing provider metadata initially selected; deselect b; Add selected a; inspect per-entry result and fresh check.', 'Alternative: cancel/zero selection writes nothing; present/conflicting target retained.', 'Exception: unsupported auth, stale preview/source/child, concurrent Add, write failure or answer lost.'],
    expected: ['Only chosen provider/profile/key transferred create-only; unit of selection provider, not model.', 'Partial/unknown result truthful; no rollback/auto retry/default-model mutation; native child catalog reflects adds.', 'Browser receives no credentials.', FIXTURE.unchanged],
  },
  {
    id: 'SET-EP-01', title: 'Render truthful current lifecycle status partitions', technique: 'EP',
    preconditions: ['Independent ready, starting, stopped/failed, connector-missing and upgrade-required diagnostic fixtures.'],
    steps: ['Render SET status and action availability for each partition.'],
    expected: ['Truthful current state/reason, not all collapsed to ready; supported explicit Retry accessible outside failed frame.', 'No secret in public status.'],
  },
  {
    id: 'SET-EP-02', title: 'Handle pending and failed status reads with explicit recovery', technique: 'EP',
    preconditions: ['Status request held pending, then rejects; explicit retry fixture succeeds.'],
    steps: ['Open SET; observe pending; complete failure; Retry explicitly.'],
    expected: ['Pending/error/retry visible; no stale success hiding failure or automatic retry loop.'],
  },
  {
    id: 'SET-EP-03', title: 'Show empty missing-provider result without Add authority', technique: 'EP',
    preconditions: ['Ready child; fresh preview missing=[] with present entries allowed.'],
    steps: ['Check for new models.'], expected: ['Nothing-new meaning; no selection list/enabled Add; no write.'],
  },
  {
    id: 'SET-EP-04', title: 'Preserve present and conflicting target providers', technique: 'EP',
    preconditions: ['Independent equal-existing profile/key and same-ID different-profile fixtures.'],
    steps: ['Check; separately let target entry appear between preview and Add.'],
    expected: ['Present excluded; conflict not offered with reason; target race skipped truthfully; never overwritten.', FIXTURE.unchanged],
  },
  {
    id: 'SET-EP-05', title: 'Support selected stored-key env-key and native built-in additions', technique: 'EP',
    preconditions: ['Synthetic supported stored API key, apiKeyEnv resolved by disposable main fixture, built-in route absent/adopted-without-key fixtures.'],
    steps: ['Check each valid variant; select and Add supported missing provider.'],
    expected: ['Preview metadata only; chosen env key resolved at confirmation, not preview; child plain key record with no env reference.', 'Native built-in route adoption/key are create-only; no production credential resolution.', FIXTURE.unchanged],
  },
  {
    id: 'SET-EP-06', title: 'Do not offer or copy OAuth login grants', technique: 'EP',
    preconditions: ['Synthetic OAuth/grant provider; otherwise compatible fixture.'],
    steps: ['Check; separately try selecting its id outside offered missing group.'],
    expected: ['Not offered with auth reason; no grant transfer or silent auth conversion; outside-preview selection refused.'],
  },
  {
    id: 'SET-EP-07', title: 'Do not offer missing or empty environment-backed key', technique: 'EP',
    preconditions: ['Synthetic apiKeyEnv provider; referenced value independently absent/empty.'],
    steps: ['Check against disposable source resolver.'],
    expected: ['Not offered with env-unset reason; no empty child key or environment reference copied.'],
  },
  {
    id: 'SET-EP-08', title: 'Refuse unsupported provider profile fields', technique: 'EP',
    preconditions: ['Synthetic provider with custom header or other unknown field; otherwise compatible.'],
    steps: ['Check inventory.'], expected: ['Unsupported entry not offered; no weakened validation or target mutation.'],
  },
  {
    id: 'SET-EP-09', title: 'Refuse version schema and revision mismatches independently', technique: 'EP',
    preconditions: ['Independent synthetic incompatible version, real schema difference and missing/stale revision fixtures; other guards valid.'],
    steps: ['Check/Add at proper guard for each mismatch.'],
    expected: ['Refuse incompatible entry before unsafe write; no guessed repair; unchanged native schema UID noise alone not a real difference.', FIXTURE.unchanged],
  },
  {
    id: 'SET-EP-10', title: 'Keep provider-sync secrets and forbidden metadata out of browser and logs', technique: 'EP',
    preconditions: ['Disposable key/mask/endpoint/protocol/env-name sentinels across successful and failed sync.'],
    steps: ['Inspect browser preview/result/errors and log sinks.'],
    expected: ['Browser only allowed provider id/name/models/outcome/reason and opaque checkId; no key/mask/endpoint/protocol/env-name or inventory logging.', 'Native model-catalog validation caveat help retained; no real credentials read.'],
  },
  {
    id: 'SET-EP-11', title: 'Remove obsolete D2 controls without rewriting inert saved fields', technique: 'EP',
    preconditions: ['Saved questionMode=user and old approvalAnswerSeconds; native SET and relevant forms.'],
    steps: ['Render current settings surfaces and observe stored values.'],
    expected: ['No mode/seconds control/copy/replacement switch; saved values unchanged.', 'No duplicate plugin/model/config/recommendation editor or Watchdog control.'],
  },
  {
    id: 'SET-EP-12', title: 'Keep native settings links return and effective read-only notice', technique: 'EP',
    preconditions: ['Protected manager; SET links; stored higher sandbox preference fixture.'],
    steps: ['Activate Settings/Plugins with keyboard/mouse; change user preference; return explicitly.'],
    expected: ['Native destinations and explicit Fishball return usable; no permission-mode editor added to SET.', FIXTURE.readonly, 'User setting does not grant generic new/subagent/schedule/write authority.'],
  },
  {
    id: 'SET-EP-13', title: 'Reject unauthenticated or unowned restart and sync', technique: 'EP',
    preconditions: ['Independent absent owner authentication and unrelated runtime ownership fixtures; otherwise valid operation.'],
    steps: ['Invoke restart (child route) and sync (main owner routes) protected actions separately.'],
    expected: ['No lifecycle mutation, key transfer or public capability leak; clear refusal rather than apparent success.'],
  },
  {
    id: 'SET-EP-14', title: 'Refuse every child-initiated sync attempt', technique: 'EP',
    preconditions: ['Ready child; real main sync behind the relay; user decision 2026-11-11: only the main DSH starts a sync.'],
    steps: ['From the child: look up models/check and models/add routes; send relay frames op check/add; call the relay client with check/add.'],
    expected: ['No child models/* route; frames answered invalid-request; client refuses locally and sends nothing; the main sync never runs (no inventory read, key read or write).'],
  },
  {
    id: 'SET-BVA-01', title: 'Select zero one or both provider entries without partial-model writes', technique: 'BVA',
    preconditions: ['Fresh ready-child preview with two missing provider entries.', FIXTURE.providerA, FIXTURE.providerB],
    steps: ['Independently select 0, 1 and 2 entries; inspect provider with two models.'],
    expected: ['Zero disables Add/no write; one selects whole provider/profile/key, not one model; two transfers only chosen two.', 'No unchosen outcomes or implicit default-model change.', FIXTURE.unchanged],
  },
  {
    id: 'SET-DT-01', title: 'Sync R1 unavailable child disables writes', technique: 'Decision Table',
    preconditions: [FIXTURE.singleFault, 'Child not ready/current wire unavailable; no stale preview or other fault exercised.'],
    steps: ['Attempt Check/Add through intended surface.'], expected: ['Disabled with running-state hint; no transfer-key read/write.'],
  },
  {
    id: 'SET-DT-02', title: 'Sync R2 concurrent Add refuses second import', technique: 'Decision Table',
    preconditions: [FIXTURE.singleFault, 'Ready child, live same-child preview, source unchanged, offered selection; first Add pending.'],
    steps: ['Try second Add while first pending.'], expected: ['sync-busy; no second import/key transfer/write; no asserted multi-fault precedence.'],
  },
  {
    id: 'SET-DT-03', title: 'Sync R3 stale or expired preview requires repreview', technique: 'Decision Table',
    preconditions: [FIXTURE.singleFault, 'Ready child, no Add pending, source unchanged, offered selection; preview invalid from child/wire replacement or age.'],
    steps: ['Add with old checkId.'],
    expected: ['Documented repreview-required/preview-expired/sync-closed refusal family as applicable; clear list/check again before transfer-key read/write.'],
  },
  {
    id: 'SET-DT-04', title: 'Sync R4 changed source inventory invalidates preview', technique: 'Decision Table',
    preconditions: [FIXTURE.singleFault, 'Ready child, no Add pending, live same-child preview and offered selection; source inventory alone changed.'],
    steps: ['Add selected entry with stale source inventory.'], expected: ['repreview-required; no transfer-key read/write; explicit fresh check required.'],
  },
  {
    id: 'SET-DT-05', title: 'Sync R5 refuses outside-preview selection before partial add', technique: 'Decision Table',
    preconditions: [FIXTURE.singleFault, 'Ready child, no Add pending, live current preview, source unchanged; selection includes a and not-offered-id.'],
    steps: ['Submit both selected IDs in one Add.'],
    expected: ['invalid-selection; no key read or partial add of a before noticing invalid ID; no assumed multi-fault ordering.'],
  },
  {
    id: 'SET-DT-06', title: 'Sync R6 imports only offered chosen provider', technique: 'Decision Table',
    preconditions: ['All guards valid; ready child, no Add pending, live same-child preview/source unchanged; a and b missing, only a selected.'],
    steps: ['Add selected a.'],
    expected: ['Read/transfer chosen records only; create-only import and truthful per-entry outcome.', 'b neither written/transferred nor reported as an outcome.', FIXTURE.unchanged],
  },
  {
    id: 'SET-ST-01', title: 'Share pending checks and let cancelled preview expire naturally', technique: 'State Transition',
    preconditions: ['Idle sync; ready child; delayed preview result.'],
    steps: ['Repeat Check while pending; return list; Cancel; Check again.'],
    expected: ['Concurrent Check shares in-flight operation; no automatic sync merely opening SET.', 'Cancel clears UI list, writes nothing and does not auto Add; host lets preview expire, no invented checkId revocation.', 'Next Check computes fresh missing entries.'],
  },
  {
    id: 'SET-ST-02', title: 'Reject preview after child source or expiry transition before credential transfer', technique: 'State Transition',
    preconditions: ['Ready preview; independently child restart/disconnect, preview expiry or source-change transition; real component credential-read/write observers required.'],
    steps: ['Invalidate one preview guard then Add; deliver late preview completion from retired generation.'],
    expected: ['No stale transfer-key read or child write; list cleared/check again; stale completion cannot restore actionable selection.', 'This component TODO is not proven by HTTP refusal token alone.'],
  },
  {
    id: 'SET-ST-03', title: 'Report lost Add answer as result unknown without rollback or retry', technique: 'State Transition',
    preconditions: ['Add request with selected synthetic providers in flight; child may have committed subset before wire loss.'],
    steps: ['Lose wire before answer; inspect result; explicitly Check after ready.'],
    expected: ['Every entry in import reported failed/result-unknown; no claim nothing committed, rollback or automatic/same-Add retry.', 'Committed writes stay; fresh preview omits them and offers only still-missing entries.'],
  },
  {
    id: 'SET-ST-04', title: 'Keep partial sync results and ignore stale completion', technique: 'State Transition',
    preconditions: ['Add selected a and b; a commits; b independently fails or is skipped after target race.'],
    steps: ['Complete mixed outcomes; explicitly Check/retry remaining entries; deliver stale prior result after current run.'],
    expected: ['Truthful per-entry partial result, committed a preserved, no rollback or same-Add retry.', 'Unchosen entries absent; stale result cannot replace current run/status.', FIXTURE.unchanged],
  },
].map((entry) => Object.freeze({ ...CONTEXT, ...entry })));

// Direct user decision: exactly 300000 ms is expired. Externally provisioned
// disposable frozen-clock previews are preconditions, not a new clock/seed API.
export const HTTP_CASES = Object.freeze([
  Object.freeze({
    ...CONTEXT,
    id: 'SET-BVA-02', title: 'Enforce preview expiry at 299999 300000 and 300001 milliseconds', technique: 'BVA',
    source: `${CONTEXT.source}; direct user decision during case authoring: valid only age <300000 ms`,
    preconditions: ['Separate fixture per SDK and boundary, explicitly disposable/synthetic owner auth.', 'Preview clock externally frozen until confirm at ages 299999, 300000 and 300001 ms; ready same child/wire, source unchanged, no Add pending, selected supported missing provider.', 'No runtime clock/seed API invented and no real credentials or sleeps.'],
    steps: ['POST documented /api/fishball-instance/models/add with fixture {checkId, ids}.', 'Parse JSON without assuming envelope nesting; locate selected provider id and outcome on the same record object.'],
    expected: ['Age 299999: selected provider record outcome=added.', 'Age 300000 and 300001: exact preview-expired JSON string token; no provider record outcome=added. No undocumented HTTP status oracle.', 'HTTP guard response does not independently prove absence of credential read/write; SET-ST-02 remains component TODO for that observation.'],
    missing: 'SET: supply FBTEST_V2_SET_HTTP_FIXTURES with separate per-SDK disposable synthetic-auth previews frozen at 299999/300000/300001 ms until confirmation.',
  }),
]);

const EXPIRY = Object.freeze({
  environment: 'FBTEST_V2_SET_HTTP_FIXTURES',
  endpoint: 'api/fishball-instance/models/add',
  method: 'POST',
  deadlineAgeMs: 300000,
  boundaryAgesMs: Object.freeze([299999, 300000, 300001]),
  scenarioPrefix: 'previewAge',
  outcomeKey: 'outcome',
  providerIdKey: 'id',
  added: 'added',
  expired: 'preview-expired',
  invalidFixture: 'SET expiry fixture must declare its exact frozen age and one selected synthetic provider; values are not printed',
  invalidJson: 'SET expiry response must be JSON; response text is not printed',
  useCaseTechnique: 'Use Case',
});
const fixtures = createHttpFixtures(EXPIRY.environment);

function scenarioFor(ageMs) {
  return `${EXPIRY.scenarioPrefix}${ageMs}`;
}

function requireExpiryFixture(condition) {
  if (!condition) throw new Error(EXPIRY.invalidFixture);
}

function expiryFixture(sdk, ageMs) {
  const fixture = fixtures.fixtureFor(sdk, scenarioFor(ageMs));
  requireExpiryFixture(fixture.frozenAgeMs === ageMs && fixture.clockFrozenThroughConfirm === true);
  requireExpiryFixture(typeof fixture.checkId === 'string' && Boolean(fixture.checkId.trim()));
  requireExpiryFixture(typeof fixture.providerId === 'string' && Boolean(fixture.providerId.trim()));
  return fixture;
}

function jsonContains(value, predicate) {
  if (predicate(value)) return true;
  return value !== null && typeof value === 'object'
    && Object.values(value).some(child => jsonContains(child, predicate));
}

function isAddedRecord(value, providerId) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && value[EXPIRY.outcomeKey] === EXPIRY.added
    && (providerId === undefined || value[EXPIRY.providerIdKey] === providerId);
}

async function runExpiryBoundary(sdk) {
  // Validate the complete boundary set before making even its first request.
  const boundaries = EXPIRY.boundaryAgesMs.map(ageMs => ({ ageMs, fixture: expiryFixture(sdk, ageMs) }));
  for (const { ageMs, fixture } of boundaries) {
    const response = await fixtures.request(fixture, EXPIRY.endpoint, EXPIRY.method, {
      checkId: fixture.checkId,
      ids: [fixture.providerId],
    });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(EXPIRY.invalidJson);
    }
    if (ageMs < EXPIRY.deadlineAgeMs) {
      // The public per-provider outcome is documented, its enclosing envelope is not.
      assert.ok(jsonContains(body, value => isAddedRecord(value, fixture.providerId)),
        'Before expiry the selected supported missing provider must be reported added');
      assert.ok(!jsonContains(body, value => value === EXPIRY.expired),
        'Before expiry the otherwise valid preview must not be reported expired');
    } else {
      assert.ok(jsonContains(body, value => value === EXPIRY.expired),
        'At and after expiry the response must contain the exact preview-expired reason');
      assert.ok(!jsonContains(body, value => isAddedRecord(value)),
        'At and after expiry no provider may be reported added');
    }
  }
}

function boundaryAvailability(sdk) {
  let missing = false;
  let invalid;
  for (const ageMs of EXPIRY.boundaryAgesMs) {
    if (fixtures.isMissing(sdk, scenarioFor(ageMs))) {
      missing = true;
    } else {
      try {
        expiryFixture(sdk, ageMs);
      } catch (error) {
        invalid = error;
      }
    }
  }
  // A missing neighbour must not conceal an unsafe supplied boundary fixture.
  return { missing, invalid };
}

/* =============================================================================================
 * Executable observations. Expected values come from docs/planning/v2-set.md (public SET
 * contract), docs/slim-native-design.md §10 (retained sync semantics) and the user decisions in
 * the task brief, never from the implementation. Seams, all real product code:
 * - src/slim/settings-relay.js: createSettingsRelayServer / createSettingsRelayClient over an
 *   in-memory transport pair (test-owned, below);
 * - src/child-settings/index.js (fishball-hosted-settings) apply(ctx) with a fake ctx whose registry collects the
 *   child Fetch routes, driven with real Request objects;
 * - model sync is main-only (user decision 2026-11-11): check/add go to the main card's owner routes
 *   (registerProviderSyncRoutes) over the real provider-sync bridge, coordinator, child target and
 *   engine of test/support/body-soul-sync.mjs (official disposable credential stores); the child row
 *   has no sync route and the relay no sync op (SET-EP-14; full set in set-main-only-sync.test.mjs);
 * - src/native-runtime/overlay.js launchOverlay and installation.js copyChildCode.
 * Browser rendering, native Settings/Plugins navigation and the real child lifecycle are not
 * observable here; each case says which remainder stays post-merge e2e.
 * ============================================================================================= */

const SET = Object.freeze({
  route: Object.freeze({
    status: '/api/fishball-instance/status',
    retry: '/api/fishball-instance/retry',
    restart: '/api/fishball-instance/restart',
    check: '/api/fishball-instance/models/check',
    add: '/api/fishball-instance/models/add',
  }),
  method: Object.freeze({ get: 'GET', post: 'POST' }),
  base: 'http://dsh.internal',
  site: Object.freeze({ header: 'sec-fetch-site', same: 'same-origin', cross: 'cross-site' }),
  rowId: 'fishball-settings',
  pageRowId: 'fishball-page',
  rowInject: Object.freeze(['nativeRuntime', 'connection']),
  rowModule: Object.freeze(['child-web', 'fishball-settings', 'index.js']),
  /** V3 R-CORE: the settings Node row with the relay routes, in packages/instance. */
  rowSource: Object.freeze(['src', 'child-settings', 'index.js']),
  sharedChunk: Object.freeze(['src', 'child-settings', 'client.instance.js']),
  panelClient: path.join(BODY_SOUL.core, 'ui', 'fishball-settings', 'client.js'),
  instanceClient: path.join(BODY_SOUL.instance, 'client.js'),
  instanceManifest: path.join(BODY_SOUL.instance, 'package.json'),
  relay: Object.freeze({
    channel: 'instance-settings', version: 1,
    ops: Object.freeze(['status', 'retry', 'restart']),
    unavailable: 'settings-relay-unavailable', disconnected: 'settings-relay-disconnected',
    timeout: 'settings-relay-timeout', closed: 'settings-relay-closed', failed: 'settings-relay-failed',
    invalid: 'invalid-request',
    requestKeys: Object.freeze(['id', 'op', 'payload', 'v']),
    replyKeys: Object.freeze(['error', 'id', 'ok', 'result', 'v']),
    // Small bound so the time-bound cases need no long sleeps.
    shortTimeoutMs: 40,
  }),
  sync: Object.freeze({
    busy: 'sync-busy', selection: 'invalid-selection', repreview: 'repreview-required', expired: 'preview-expired',
    closed: 'sync-closed', unknown: 'result-unknown', conflict: 'provider-conflict', oauth: 'oauth-login',
    added: 'added', skipped: 'skipped', failed: 'failed',
    stale: Object.freeze(['repreview-required', 'preview-expired', 'sync-closed']),
    checkLost: Object.freeze(['child-sync-disconnected', 'sync-closed']),
  }),
  ids: Object.freeze({ a: 'provider-missing-a', b: 'provider-missing-b', existing: 'provider-existing', conflict: 'provider-conflict-fixture', oauth: 'provider-oauth-fixture', notOffered: 'not-offered-id' }),
  models: Object.freeze({ a: Object.freeze(['alpha-small', 'alpha-large']), b: Object.freeze(['beta']) }),
  sentinel: 'SENTINEL-KEY-SET',
  // Round-2 R2.1/R2.3: the status and Retry answers carry `detail` (null when not failed), and the
  // child routes keep the main card's answer shape (docs/planning/v2-set.md "Child Fetch routes").
  status: Object.freeze({
    keys: Object.freeze(['code', 'detail', 'state']),
    failed: 'failed',
    ready: Object.freeze({ state: 'ready', code: null, detail: null }),
    starting: Object.freeze({ state: 'starting', code: null, detail: null }),
    unavailable: Object.freeze({ state: 'unavailable', code: null, detail: null }),
    // Documented states/codes (docs/test-design/instance.md O1, I1-ST-02; §0.6 contract version).
    partitions: Object.freeze([
      Object.freeze({ state: 'ready', code: null }),
      Object.freeze({ state: 'starting', code: null }),
      Object.freeze({ state: 'stopped', code: null }),
      Object.freeze({ state: 'failed', code: 'NATIVE_CHILD_EXITED' }),
      Object.freeze({ state: 'connector-missing' }),
      Object.freeze({ state: 'failed', code: 'NATIVE_CONTRACT_VERSION' }),
    ]),
  }),
  // Identifiers of the moved items (docs/plugins/instance-extension-points.md §11.8 table, D2 amendment).
  obsolete: Object.freeze([/questionMode/, /approvalAnswerSeconds/, /answerSeconds/i, /watchdog/i, /recommend/i,
    /drawModel/, /drawPlugins/, /namespaceForm/, /agent-default-model/, /admin\.plugin/, /admin\.settings/, /sandboxMode/]),
  overlayRows: Object.freeze(['hmr', 'sandbox-policy', 'approval', 'webserver', 'web-runtime']),
  readOnly: 'read-only',
  higherSandbox: 'workspace-write',
  settleMs: 20,
  tempPrefix: 'fbset-',
});
const R = SET.relay;
const S = SET.sync;
const ID = SET.ids;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sortedIds = (list) => list.map((item) => item.id).sort();
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };


/**
 * The child row mounted with a fake ctx, its relay client reaching a real relay server whose
 * lifecycle handlers count calls. Model sync is main-only (user decision 2026-11-11): checkPost /
 * addPost go to the MAIN DSH's owner routes (registerProviderSyncRoutes), whose service is
 * `harness.sync` (syncHarness: the real bridge, coordinator and child engine) unless a case
 * overrides check/add. The child row itself registers no sync route.
 */
async function settingsFixture(t, { harness, status, retry, restart, check, add } = {}) {
  const { createSettingsRelayServer } = await loadInstance('src/slim/settings-relay.js');
  const { registerProviderSyncRoutes } = await loadInstance('src/slim/host/provider-sync-routes.js');
  const row = await loadInstance(SET.rowSource.join('/'));
  const calls = { status: 0, retry: 0, restart: 0, check: 0, add: [] };
  const server = createSettingsRelayServer({
    status: async () => { calls.status++; return status ? status(calls.status) : SET.status.ready; },
    retry: async () => { calls.retry++; return retry ? retry(calls.retry) : SET.status.starting; },
    restart: async () => { calls.restart++; return restart ? restart(calls.restart) : SET.status.starting; },
  });
  const main = routeContext();
  registerProviderSyncRoutes(main.ctx, {
    providerSync: {
      check: async () => { calls.check++; return check ? check(calls.check) : harness.sync.check(); },
      add: async (payload) => { calls.add.push(clone(payload)); return add ? add(payload) : harness.sync.add(payload); },
    },
  });
  const routes = new Map();
  const listeners = new Set();
  const disposers = [];
  const ctx = {
    connection: {
      // DSH's fence: cross-site is refused, same-origin admitted (requestRejection → undefined).
      requestRejection: ({ headers }) => (headers.get?.(SET.site.header) === SET.site.cross ? 403 : undefined),
      fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } },
    },
    nativeRuntime: { onInstanceSettingsTransport(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose; },
  };
  row.apply(ctx);
  const texts = [];
  let current;
  function connect() {
    const link = relayLink();
    server.attach(link.main);
    for (const listener of [...listeners]) listener(link.child);
    current = link;
    return link;
  }
  async function answer(response) {
    const text = await response.text();
    texts.push(text);
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: response.status, json, text };
  }
  async function call(method, routePath, { body, site = SET.site.same } = {}) {
    const route = routes.get(routePath);
    assert.ok(route, 'child route registered: ' + routePath);
    const headers = { 'content-type': 'application/json' };
    if (site) headers[SET.site.header] = site;
    const init = { method, headers };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    return answer(await route.fetch(new Request(SET.base + routePath, init)));
  }
  async function mainPost(routePath, body, site = SET.site.same) {
    const encoded = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const result = await post(main.routes, routePath, encoded, { [SET.site.header]: site, 'content-type': 'application/json' });
    texts.push(result.text);
    return result;
  }
  t.after(() => {
    server.close();
    for (const dispose of disposers.reverse()) { try { dispose(); } catch { /* already gone */ } }
  });
  return {
    row, calls, routes, listeners, disposers, texts, connect, call,
    link: () => current,
    statusRead: () => call(SET.method.get, SET.route.status),
    retryPost: () => call(SET.method.post, SET.route.retry),
    restartPost: () => call(SET.method.post, SET.route.restart),
    /** The main card's owner routes (the only sync entry point). */
    checkPost: (site) => mainPost(SET.route.check, undefined, site),
    addPost: (body, site) => mainPost(SET.route.add, body, site),
  };
}

/** The two-model provider a, the one-model provider b and a separate provider the child already has. */
function profileWith(models) {
  const [template] = ENGINE_CASE.profile.models;
  return { ...clone(ENGINE_CASE.profile), models: models.map((id) => ({ ...clone(template), id, name: id })) };
}
const providerA = () => provider(ID.a, { profile: profileWith(SET.models.a) });
const providerB = () => provider(ID.b, { profile: profileWith(SET.models.b) });
const existing = () => provider(ID.existing);
function standardSync(t, extraSource = [], extraTarget = []) {
  return syncHarness(t, {
    source: inventory(ENGINE_CASE.source, [providerA(), providerB(), existing(), ...extraSource]),
    target: inventory(ENGINE_CASE.target, [existing(), ...extraTarget]),
  });
}
async function syncedFixture(t, harnessPromise) {
  const harness = await harnessPromise;
  const fixture = await settingsFixture(t, { harness });
  fixture.connect();
  return { h: harness, f: fixture };
}
const NOTHING = Object.freeze({ additions: [], imports: [] });
function assertRefused(answer, codes, message) {
  assert.equal(answer.json?.ok, false, message ?? 'refused, never shown as success');
  if (codes !== undefined) assert.ok([codes].flat().includes(answer.json?.error?.code), 'refusal code ' + answer.json?.error?.code + ' not in ' + [codes].flat());
}
function assertNoTransfer(h, message = 'no transfer-key read or child write') {
  assert.deepEqual(h.writes(), NOTHING, message);
  assert.deepEqual(h.sourceReads, [], message);
}
const itemsOf = (answer) => answer.json?.result?.items ?? [];
const outcomes = (answer) => itemsOf(answer).map((item) => [item.id, item.outcome]).sort();

/** Keys must never reach the browser: run every answer text through the harness's planted-value check. */
function assertCleanTexts(h, f) {
  for (const text of f.texts) {
    h.assertClean(text);
    assert.equal(text.includes(SET.sentinel), false, 'sentinel reached a child route answer');
  }
}

async function overlayOperations(rows) {
  const { launchOverlay } = await loadInstance('src/native-runtime/overlay.js');
  const base = path.join(os.tmpdir(), 'fbset-overlay');
  const paths = { home: path.join(base, 'home'), agentsHome: path.join(base, 'agents'), workspace: path.join(base, 'workspace'), mainHome: path.join(base, 'main') };
  const childModule = path.join(BODY_SOUL.instance, 'native-child.js');
  const entries = rows.map((id) => ({ id, name: 'row-' + id, config: id === 'sandbox-policy' ? { mode: SET.higherSandbox } : {} }));
  return { childModule, operations: launchOverlay(paths, { hostId: 'fbset-host', instanceId: randomUUID() }, childModule, {}, {}, entries) };
}
const insertedRows = (operations) => operations.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert);

/* ------------------------------------------------------------------------------ case bodies */

const EXECUTABLE = {
  // Executable remainder: composition + row mounting. Rendering, native destinations and the
  // explicit return stay post-merge e2e: browser panel on both SDKs (docs/planning/v2-set.md "Remaining limits").
  async 'SET-UC-01'(t) {
    const { childModule, operations } = await overlayOperations(SET.overlayRows);
    const rows = insertedRows(operations);
    const at = rows.findIndex((row) => row.id === SET.rowId);
    assert.ok(at >= 0, 'launch overlay inserts the fishball-settings row');
    assert.equal(rows[at].name, path.join(path.dirname(childModule), ...SET.rowModule), 'row loads <snapshot>/child-web/fishball-settings/index.js');
    assert.equal(rows[at - 1]?.id, SET.pageRowId, 'fishball-settings is inserted right after fishball-page');
    const row = await loadInstance(SET.rowSource.join('/'));
    assert.equal(row.name, SET.rowId);
    assert.deepEqual([...row.inject].sort(), [...SET.rowInject].sort(), 'host half needs nativeRuntime and connection');
    // Never mounted in the main DSH: the main package does not declare the child row.
    assert.equal(fs.readFileSync(SET.instanceManifest, 'utf8').includes(SET.rowId), false, 'main package manifest does not mount fishball-settings');
    // The snapshot copy serves the instance card's client.js as the panel's chunk: one source in both processes.
    const { copyChildCode } = await loadInstance('src/native-runtime/installation.js');
    const root = await mkdtemp(path.join(os.tmpdir(), SET.tempPrefix));
    t.after(() => rm(root, { recursive: true, force: true }));
    const profile = path.join(root, 'profile');
    await mkdir(profile, { mode: 0o700 });
    const native = await copyChildCode({ profile }, { instanceId: randomUUID(), hostId: 'fbset-host' });
    const snapshot = path.dirname(native);
    assert.deepEqual(await readFile(path.join(snapshot, ...SET.sharedChunk)), await readFile(SET.instanceClient), 'client.instance.js is a byte copy of the instance client.js');
    assert.ok(fs.existsSync(path.join(snapshot, ...SET.rowModule)), 'snapshot carries the settings row');
  },

  // Executable remainder: relay seam (restart/retry relayed once, failure honest, no retry).
  // Exact-owned-child stop/start ordering and late-A completion stay post-merge e2e: full child DSH boot.
  async 'SET-UC-02'(t) {
    let restartFails = false;
    const f = await settingsFixture(t, {
      restart: () => { if (restartFails) throw new Error('fixture restart refusal'); return SET.status.starting; },
      retry: () => SET.status.starting,
    });
    f.connect();
    const restarted = await f.restartPost();
    assert.deepEqual(restarted.json, { ok: true, result: SET.status.starting }, 'restart answers {ok:true,result:{state,code}}');
    assert.equal(f.calls.restart, 1, 'one restart per press');
    restartFails = true;
    const refused = await f.restartPost();
    assert.equal(refused.json?.ok, false, 'a refused restart is not reported as success');
    assert.equal(typeof refused.json?.error?.code, 'string', 'refusal carries a code for the alert');
    assert.equal(f.calls.restart, 2, 'a refused restart is not retried');
    const retried = await f.retryPost();
    assert.deepEqual(retried.json, SET.status.starting, 'Retry answers the main host status {state, code, detail}');
    assert.equal(f.calls.retry, 1);
    f.link().lose();
    const lost = await f.restartPost();
    assert.equal(lost.json?.ok, false, 'restart with the relay down is refused, never success');
    assert.equal(f.calls.restart, 2, 'nothing reaches the main host while the relay is down');
  },

  // Full chain: child routes → relay → main bridge → coordinator → child target/engine.
  async 'SET-UC-03'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    const checked = await f.checkPost();
    assert.equal(checked.json?.ok, true);
    assert.deepEqual(sortedIds(checked.json.result.missing), [ID.a, ID.b].sort(), 'only what the child lacks is listed');
    const a = checked.json.result.missing.find((item) => item.id === ID.a);
    assert.deepEqual(a.models, [...SET.models.a], 'the entry shows its model ids');
    assert.equal(checked.json.result.present, 1, 'the separate existing provider counts as present');
    assertNoTransfer(h, 'Check writes nothing and reads no key');
    const added = await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] });
    assert.deepEqual(outcomes(added), [[ID.a, S.added]], 'per-entry result for the chosen provider only');
    assert.deepEqual(h.sourceReads, [ID.a], 'only the chosen key is read');
    assert.deepEqual(h.writes(), { additions: [ID.a], imports: [ID.a] }, 'only the chosen provider is written');
    const fresh = await f.checkPost();
    assert.deepEqual(sortedIds(fresh.json.result.missing), [ID.b], 'a fresh check lists only what is still missing');
    assertCleanTexts(h, f);
  },

  // Route-level partitions; the rendered tag/Retry placement stays post-merge e2e: browser.
  async 'SET-EP-01'(t) {
    let index = 0;
    const f = await settingsFixture(t, { status: () => ({ ...SET.status.partitions[index], token: SET.sentinel }) });
    const down = await f.statusRead();
    assert.deepEqual(down.json, SET.status.unavailable, 'relay down → {state:unavailable, code:null, detail:null}');
    f.connect();
    for (; index < SET.status.partitions.length; index++) {
      const expected = SET.status.partitions[index];
      const answer = await f.statusRead();
      assert.deepEqual(Object.keys(answer.json ?? {}).sort(), [...SET.status.keys], 'status answers exactly {state, code, detail}');
      if (expected.state !== SET.status.failed) assert.equal(answer.json.detail, null, 'detail is null when not failed (R2.1)');
      assert.equal(answer.json.state, expected.state, 'truthful state, not collapsed to ready');
      if (Object.hasOwn(expected, 'code')) assert.equal(answer.json.code, expected.code, 'truthful safe code');
      assert.equal(answer.text.includes(SET.sentinel), false, 'no secret in public status');
    }
  },

  // Route-level; the rendered pending/error state stays post-merge e2e: browser.
  async 'SET-EP-02'(t) {
    const gate = deferred();
    const f = await settingsFixture(t, {
      status: async (n) => {
        if (n === 1) return SET.status.ready;
        if (n === 2) { await gate.promise; throw new Error('fixture status failure'); }
        return SET.status.ready;
      },
      retry: () => SET.status.ready,
    });
    f.connect();
    assert.deepEqual((await f.statusRead()).json, SET.status.ready);
    const pending = f.statusRead();
    let settled = false;
    pending.then(() => { settled = true; });
    await delay(SET.settleMs);
    assert.equal(settled, false, 'the status read stays pending while the main host has not answered');
    gate.resolve();
    const failed = await pending;
    assert.notEqual(failed.json?.state, SET.status.ready.state, 'a failed read never shows the stale ready');
    await delay(SET.settleMs);
    assert.equal(f.calls.status, 2, 'no automatic retry loop after a failed read');
    const retried = await f.retryPost();
    assert.deepEqual(retried.json, SET.status.ready, 'explicit Retry recovers');
    assert.equal(f.calls.retry, 1);
    // A throwing main handler answers the relay's typed failure (v2-set.md: settings-relay-failed).
    const { createSettingsRelayServer, createSettingsRelayClient } = await loadInstance('src/slim/settings-relay.js');
    const server = createSettingsRelayServer({ status: () => { throw new Error('boom'); }, retry: () => SET.status.ready, restart: () => SET.status.ready });
    const client = createSettingsRelayClient({ timeoutMs: 1000 });
    const link = relayLink();
    server.attach(link.main);
    client.attach(link.child);
    t.after(() => { client.close(); server.close(); });
    assert.deepEqual(await client.request('status', {}), { ok: false, error: { code: R.failed } });
  },

  // Route-level; "Nothing new to add" copy and the disabled Add stay post-merge e2e: browser.
  async 'SET-EP-03'(t) {
    const { h, f } = await syncedFixture(t, syncHarness(t, { source: inventory(ENGINE_CASE.source, [existing()]), target: inventory(ENGINE_CASE.target, [existing()]) }));
    const checked = await f.checkPost();
    assert.equal(checked.json?.ok, true);
    assert.deepEqual(checked.json.result.missing, [], 'nothing missing → empty list');
    assert.equal(checked.json.result.present, 1, 'present entries are only counted');
    assertNoTransfer(h, 'an empty check writes nothing');
  },

  async 'SET-EP-04'(t) {
    const conflictTarget = provider(ID.conflict, { profile: { ...clone(ENGINE_CASE.profile), baseURL: 'https://other.example.invalid/v1' } });
    const { h, f } = await syncedFixture(t, syncHarness(t, {
      source: inventory(ENGINE_CASE.source, [providerA(), existing(), provider(ID.conflict)]),
      target: inventory(ENGINE_CASE.target, [existing(), conflictTarget]),
    }));
    const checked = await f.checkPost();
    assert.deepEqual(sortedIds(checked.json.result.missing), [ID.a], 'present and conflicting entries are not offered');
    assert.equal(checked.json.result.present, 1);
    assert.equal(checked.json.result.notOffered.find((item) => item.id === ID.conflict)?.reason, S.conflict, 'conflict listed with its reason');
    // Target race: the child gains a key for a between Check and Add (create-only, never overwritten).
    const raced = h.child.credentials.record();
    await h.child.credentials.seed(ID.a, raced);
    const added = await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] });
    assert.deepEqual(outcomes(added), [[ID.a, S.skipped]], 'an entry created meanwhile is skipped');
    await h.child.credentials.assertSame(ID.a, raced);
    assert.equal(h.writes().additions.includes(ID.conflict), false, 'conflicting profile never written');
    assertCleanTexts(h, f);
  },

  // Executable remainder: an OAuth entry is not offered and cannot be forced. Its exact
  // `oauth-login` reason comes from the main host adapter, covered by provider-sync-host tests.
  async 'SET-EP-06'(t) {
    const oauth = provider(ID.oauth, { credential: { configured: true, kind: 'grant', writable: true } });
    const { h, f } = await syncedFixture(t, syncHarness(t, { source: inventory(ENGINE_CASE.source, [providerA(), oauth]), target: inventory(ENGINE_CASE.target, []) }));
    const checked = await f.checkPost();
    assert.deepEqual(sortedIds(checked.json.result.missing), [ID.a], 'an OAuth login is never offered');
    const forced = await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.oauth] });
    assertRefused(forced, S.selection);
    assertNoTransfer(h, 'no grant transfer or silent conversion');
  },

  async 'SET-EP-10'(t) {
    const { h, f } = await syncedFixture(t, syncHarness(t, {
      source: inventory(ENGINE_CASE.source, [providerA(), providerB(), provider('planted-env-provider', { profile: { ...clone(ENGINE_CASE.profile), apiKeyEnv: SYNC_PLANTED.envName } })]),
      target: inventory(ENGINE_CASE.target, []),
    }));
    const logs = [];
    const methods = ['log', 'info', 'warn', 'error', 'debug'];
    const saved = methods.map((name) => console[name]);
    for (const name of methods) console[name] = (...args) => { logs.push(args.map(String).join(' ')); };
    try {
      await f.statusRead();
      const checked = await f.checkPost();
      for (const item of checked.json.result.missing) assert.deepEqual(Object.keys(item).sort(), ['id', 'models', 'name'], 'missing entries carry only id/name/models');
      for (const item of checked.json.result.notOffered) assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'reason'], 'notOffered entries carry only id/name/reason');
      assert.equal(typeof checked.json.result.checkId, 'string', 'opaque checkId');
      await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a, ID.notOffered] });
      await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] });
      await f.addPost({ checkId: 'f'.repeat(64), ids: [ID.b] });
      for (const item of itemsOf(await f.addPost({ checkId: (await f.checkPost()).json.result.checkId, ids: [ID.b] }))) {
        assert.ok(Object.keys(item).every((key) => ['id', 'outcome', 'reason'].includes(key)), 'outcome items carry only id/outcome/reason');
      }
    } finally {
      methods.forEach((name, i) => { console[name] = saved[i]; });
    }
    assertCleanTexts(h, f);
    h.assertClean(logs);
    for (const id of [ID.a, ID.b]) assert.equal(logs.some((line) => line.includes(id)), false, 'the inventory is not logged');
    // Relay replies carry only what the handler returned: the raw reply frames have no extra keys.
    // (The sync answers above came from the main owner routes, never over the relay.)
    for (const frame of parsedFrames(f.link().frames.toChild)) {
      assert.equal(frame.v, R.version);
      assert.ok(Object.keys(frame).every((key) => R.replyKeys.includes(key)), 'reply frame keys');
    }
    const { createSettingsRelayServer, createSettingsRelayClient } = await loadInstance('src/slim/settings-relay.js');
    const server = createSettingsRelayServer({ status: () => SET.status.ready, retry: () => SET.status.ready, restart: () => SET.status.ready });
    const client = createSettingsRelayClient({ timeoutMs: 1000 });
    const link = relayLink();
    server.attach(link.main);
    client.attach(link.child);
    t.after(() => { client.close(); server.close(); });
    assert.deepEqual(await client.request('status', {}), { ok: true, result: SET.status.ready }, 'status reply is the handler result as is');
    // Main-only sync (2026-11-11): the relay carries no sync op; a check request is refused locally.
    assert.deepEqual(await client.request('check', {}), { ok: false, error: { code: R.invalid } }, 'the relay has no check op');
    for (const frame of parsedFrames(link.frames.toMain)) {
      assert.deepEqual(Object.keys(frame).sort(), [...R.requestKeys], 'request frame is {v, id, op, payload}');
      assert.ok(R.ops.includes(frame.op));
    }
  },

  // Static check of the panel bundle only (no component render is available here); the rendered
  // surfaces and the inert saved D2 values stay post-merge e2e: browser panel on both SDKs.
  async 'SET-EP-11'() {
    const source = fs.readFileSync(SET.panelClient, 'utf8');
    for (const pattern of SET.obsolete) assert.doesNotMatch(source, pattern, 'panel bundle must not carry the obsolete/moved control ' + pattern);
  },

  // Executable remainder: the effective sandbox stays read-only whatever the stored row asks for.
  // Link activation, return and the rendered notice stay post-merge e2e: browser.
  async 'SET-EP-12'() {
    const { operations } = await overlayOperations(SET.overlayRows);
    const sandbox = operations.filter((op) => op.id === 'sandbox-policy');
    assert.ok(sandbox.length > 0, 'overlay patches the sandbox-policy row');
    for (const op of sandbox) assert.equal(op.config?.mode, SET.readOnly, 'stored higher sandbox does not widen the child');
    const source = fs.readFileSync(SET.panelClient, 'utf8');
    assert.match(source, /data-fishball-settings-readonly/, 'the panel carries the one-line Read Only notice');
    assert.match(source, /data-fishball-settings-open/, 'the panel carries the Settings/Plugins links');
  },

  // Cross-site and malformed refusals; DSH's owner authentication itself is the native registry's
  // (post-merge e2e: full child DSH boot for an unauthenticated request).
  async 'SET-EP-13'(t) {
    const f = await settingsFixture(t, { check: () => ({ ok: true, result: { checkId: 'fixture-check', missing: [], notOffered: [], present: 0 } }), add: () => ({ ok: true, result: { items: [] } }) });
    f.connect();
    for (const answer of [await f.checkPost(SET.site.cross), await f.addPost({ checkId: 'fixture-check', ids: [ID.a] }, SET.site.cross)]) {
      assert.equal(answer.json?.ok, false, 'cross-site check/add refused');
      assert.notEqual(answer.status, 200, 'refused at admission');
      assert.equal(answer.text.includes('fixture-check'), false, 'no capability leaks');
    }
    for (const body of ['not json', { checkId: 'fixture-check' }, { checkId: 1, ids: [] }, { checkId: 'fixture-check', ids: [1] }, { checkId: 'fixture-check', ids: [], extra: true }]) {
      const answer = await f.addPost(body);
      assert.equal(answer.status, 400, 'a malformed add body is HTTP 400');
      assert.equal(answer.json?.ok, false);
    }
    assert.equal(f.calls.check, 0, 'refused checks never reach the main host');
    assert.deepEqual(f.calls.add, [], 'refused adds never reach the main host');
    // Relay validation: invalid op/payload refused locally; invalid frames answered invalid-request or dropped.
    const { createSettingsRelayServer, createSettingsRelayClient } = await loadInstance('src/slim/settings-relay.js');
    const handled = [];
    const handler = (op) => () => { handled.push(op); return op === 'check' || op === 'add' ? { ok: true, result: {} } : SET.status.ready; };
    // check/add handlers are passed on purpose: the server never calls them (main-only sync).
    const server = createSettingsRelayServer(Object.fromEntries([...R.ops, 'check', 'add'].map((op) => [op, handler(op)])));
    const client = createSettingsRelayClient({ timeoutMs: 1000 });
    const link = relayLink();
    server.attach(link.main);
    client.attach(link.child);
    t.after(() => { client.close(); server.close(); });
    for (const [op, payload] of [['bogus', {}], ['check', {}], ['add', { checkId: 'c', ids: ['a'] }], ['add', { checkId: 'c', ids: [], extra: 1 }], ['status', { extra: 1 }]]) {
      assert.deepEqual(await client.request(op, payload), { ok: false, error: { code: R.invalid } }, 'local refusal of ' + op);
    }
    assert.deepEqual(link.frames.toMain, [], 'locally refused requests send nothing');
    const raw = relayLink();
    server.attach(raw.main);
    const replies = [];
    raw.child.onMessage((text) => replies.push(JSON.parse(text)));
    raw.child.send(JSON.stringify({ v: R.version, id: 'fixture-1', op: 'bogus', payload: {} }));
    raw.child.send(JSON.stringify({ v: R.version, id: 'fixture-2', op: 'add', payload: { checkId: 'c', ids: ['a'] } }));
    raw.child.send(JSON.stringify({ v: R.version, id: 'fixture-3', op: 'check', payload: {} }));
    raw.child.send(JSON.stringify({ v: R.version, op: 'status', payload: { extra: 1 } }));
    await delay(SET.settleMs);
    assert.deepEqual(replies.map((reply) => [reply.id, reply.ok, reply.error?.code]).sort(), [['fixture-1', false, R.invalid], ['fixture-2', false, R.invalid], ['fixture-3', false, R.invalid]], 'invalid frames (including check/add) with an id are answered invalid-request; without an id dropped');
    assert.deepEqual(handled, [], 'no handler runs for an invalid frame');
  },

  // Child-initiated sync is refused everywhere; the main sync never runs (user decision 2026-11-11).
  async 'SET-EP-14'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    for (const gone of [SET.route.check, SET.route.add]) assert.equal(f.routes.has(gone), false, 'the child registers no ' + gone);
    const raw = relayLink();
    const { createSettingsRelayClient } = await loadInstance('src/slim/settings-relay.js');
    const replies = [];
    // Raw frames on the same relay link the child row uses, as code in the child could send them.
    const link = f.link();
    link.child.onMessage((text) => replies.push(JSON.parse(text)));
    link.child.send(JSON.stringify({ v: R.version, id: 'ep14-check', op: 'check', payload: {} }));
    link.child.send(JSON.stringify({ v: R.version, id: 'ep14-add', op: 'add', payload: { checkId: 'fixture-check', ids: [ID.a] } }));
    await delay(SET.settleMs);
    assert.deepEqual(replies.filter((reply) => reply.id?.startsWith('ep14-')).map((reply) => [reply.id, reply.ok, reply.error?.code]).sort(), [['ep14-add', false, R.invalid], ['ep14-check', false, R.invalid]]);
    const client = createSettingsRelayClient({ timeoutMs: 1000 });
    client.attach(raw.child);
    t.after(() => client.close());
    assert.deepEqual(await client.request('check', {}), { ok: false, error: { code: R.invalid } });
    assert.deepEqual(await client.request('add', { checkId: 'fixture-check', ids: [ID.a] }), { ok: false, error: { code: R.invalid } });
    assert.deepEqual(raw.frames.toMain, [], 'the client sends nothing for check/add');
    assert.equal(f.calls.check, 0);
    assert.deepEqual(f.calls.add, []);
    assert.equal(h.child.calls.inventory, 0, 'no check reached the child');
    assertNoTransfer(h);
  },

  async 'SET-BVA-01'(t) {
    for (const selection of [[], [ID.a], [ID.a, ID.b]]) {
      const { h, f } = await syncedFixture(t, standardSync(t));
      const checked = await f.checkPost();
      const answer = await f.addPost({ checkId: checked.json.result.checkId, ids: selection });
      assert.equal(itemsOf(answer).length, selection.length, selection.length + ' chosen → ' + selection.length + ' outcomes');
      assert.deepEqual(outcomes(answer), selection.map((id) => [id, S.added]).sort(), 'only chosen entries reported');
      assert.deepEqual(h.writes(), { additions: [...selection], imports: [...selection] }, 'only chosen entries written');
      assert.deepEqual([...h.sourceReads].sort(), [...selection].sort(), 'only chosen keys read');
      const addedA = h.child.calls.additions.find((addition) => addition.id === ID.a);
      if (selection.includes(ID.a)) assert.deepEqual(addedA.profile.models.map((model) => model.id), [...SET.models.a], 'the whole provider, both models, is the unit');
    }
  },

  async 'SET-DT-01'(t) {
    // Main card, child unavailable: its provider-sync wire is gone (main-only sync, 2026-11-11).
    const h = await standardSync(t);
    const f = await settingsFixture(t, { harness: h });
    f.connect();
    h.lose();
    assertRefused(await f.checkPost(), undefined, 'a check while the child wire is gone is refused');
    assertRefused(await f.addPost({ checkId: 'fixture-check', ids: [ID.a] }), undefined, 'an add while the child wire is gone is refused');
    assertNoTransfer(h);
    // The child's own relay going down never turns into a sync: the child has no sync route at all.
    f.link().lose();
    assert.equal(f.routes.has(SET.route.check), false, 'no child models/check route');
    assert.equal(f.routes.has(SET.route.add), false, 'no child models/add route');
    const { createSettingsRelayClient } = await loadInstance('src/slim/settings-relay.js');
    const client = createSettingsRelayClient({ timeoutMs: 1000 });
    client.close();
    assert.deepEqual(await client.request('status', {}), { ok: false, error: { code: R.closed } }, 'a closed client refuses typed');
  },

  async 'SET-DT-02'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    const first = await f.checkPost();
    const second = await f.checkPost();
    // One child inventory read per check; the third is the running Add's re-check in the child.
    const hold = h.holdInventoryAt(3);
    const running = f.addPost({ checkId: first.json.result.checkId, ids: [ID.a] });
    await hold.arrived;
    const busy = await f.addPost({ checkId: second.json.result.checkId, ids: [ID.b] });
    hold.release();
    await running;
    assertRefused(busy, S.busy);
    assert.equal(h.writes().additions.includes(ID.b), false, 'no second import');
    assert.equal(h.sourceReads.includes(ID.b), false, 'no second key read');
  },

  async 'SET-DT-03'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    const checked = await f.checkPost();
    h.lose();
    h.connect();
    assertRefused(await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] }), S.stale, 'preview of a replaced child refused');
    assertNoTransfer(h);
  },

  async 'SET-DT-04'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    const checked = await f.checkPost();
    h.sourceState.inventory.providers.push(provider('late-provider'));
    assertRefused(await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] }), S.repreview);
    assertNoTransfer(h);
  },

  async 'SET-DT-05'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    const checked = await f.checkPost();
    assertRefused(await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a, ID.notOffered] }), S.selection);
    assertNoTransfer(h, 'no partial add of a before the invalid id is noticed');
  },

  async 'SET-DT-06'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    const checked = await f.checkPost();
    const added = await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] });
    assert.deepEqual(outcomes(added), [[ID.a, S.added]], 'b is not reported');
    assert.deepEqual(h.sourceReads, [ID.a], 'only a is read');
    assert.deepEqual(h.writes(), { additions: [ID.a], imports: [ID.a] }, 'b is not written');
    assertCleanTexts(h, f);
  },

  // Route/service level; the Cancel button clearing the UI list stays post-merge e2e: browser.
  async 'SET-ST-01'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    await f.statusRead();
    await delay(SET.settleMs);
    assert.equal(f.calls.check, 0, 'opening SET starts no sync');
    assert.deepEqual(f.calls.add, []);
    const [one, two] = await Promise.all([f.checkPost(), f.checkPost()]);
    assert.equal(one.json?.result?.checkId, two.json?.result?.checkId, 'concurrent checks share one check in flight');
    assert.equal(h.child.calls.inventory, 1, 'one child preview for concurrent presses');
    await delay(SET.settleMs);
    assertNoTransfer(h, 'Cancel (no Add) writes nothing and never adds automatically');
    const next = await f.checkPost();
    assert.notEqual(next.json.result.checkId, one.json.result.checkId, 'the next check is a fresh preview');
    assert.deepEqual(sortedIds(next.json.result.missing), [ID.a, ID.b].sort(), 'fresh missing entries');
  },

  async 'SET-ST-02'(t) {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    // Late check completion from a retired generation cannot produce an actionable selection.
    const late = await syncedFixture(t, standardSync(t));
    const hold = late.h.holdInventoryAt(1);
    const pending = late.f.checkPost();
    await hold.arrived;
    late.h.lose();
    late.h.connect();
    hold.release();
    const retired = await pending;
    assertRefused(retired, S.checkLost, 'a check of the retired wire fails with its code');
    assert.equal(retired.json?.result?.checkId, undefined, 'no checkId from a retired generation');
    // Expiry: the preview's 5-minute life has passed → refused before any key read.
    const aged = await syncedFixture(t, standardSync(t));
    const checked = await aged.f.checkPost();
    t.mock.timers.tick(PREVIEW_LIFE_MS + 1);
    assertRefused(await aged.f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] }), S.stale);
    assertNoTransfer(aged.h, 'no stale transfer-key read or child write');
    assertNoTransfer(late.h);
  },

  async 'SET-ST-03'(t) {
    const h = await standardSync(t);
    // Main card Add; the child's provider-sync wire is lost after its write committed, before the answer.
    const committed = deferred();
    const gate = deferred();
    t.after(() => gate.resolve());
    const f = await settingsFixture(t, { harness: h });
    f.connect();
    const checked = await f.checkPost();
    h.child.state.importHook = async () => { committed.resolve(); await gate.promise; };
    const pending = f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a] });
    await committed.promise;
    h.lose();
    gate.resolve();
    const lost = await pending;
    h.child.state.importHook = null;
    assert.deepEqual(itemsOf(lost).map((item) => [item.id, item.outcome, item.reason]), [[ID.a, S.failed, S.unknown]], 'every requested id failed/result-unknown, never "nothing added"');
    assert.deepEqual(h.writes(), { additions: [ID.a], imports: [ID.a] }, 'the committed write stays (no rollback)');
    h.connect();
    const fresh = await f.checkPost();
    assert.deepEqual(sortedIds(fresh.json.result.missing), [ID.b], 'the fresh check omits the committed entry');
    assert.equal(f.calls.add.length, 1, 'no automatic or same-Add retry');
    // Relay time bound and disconnect for lifecycle requests, never retried (the relay has no sync op).
    const { createSettingsRelayServer, createSettingsRelayClient } = await loadInstance('src/slim/settings-relay.js');
    const never = deferred();
    t.after(() => never.resolve(SET.status.ready));
    const server = createSettingsRelayServer({ status: () => never.promise, retry: () => never.promise, restart: () => never.promise });
    const client = createSettingsRelayClient({ timeoutMs: R.shortTimeoutMs });
    const slow = relayLink();
    server.attach(slow.main);
    client.attach(slow.child);
    t.after(() => { client.close(); server.close(); });
    assert.deepEqual(await client.request('status', {}), { ok: false, error: { code: R.timeout } }, 'a timed-out request answers settings-relay-timeout');
    assert.deepEqual(await client.request('retry', {}), { ok: false, error: { code: R.timeout } }, 'a timed-out Retry answers settings-relay-timeout');
    await delay(R.shortTimeoutMs * 3);
    assert.equal(parsedFrames(slow.frames.toMain).length, 2, 'timed-out requests are never retried');
    const cut = relayLink();
    client.attach(cut.child);
    server.attach(cut.main);
    const status = client.request('status', {});
    const restart = client.request('restart', {});
    await delay(1);
    cut.lose();
    assert.deepEqual(await status, { ok: false, error: { code: R.disconnected } }, 'a lost status answer is settings-relay-disconnected');
    assert.deepEqual(await restart, { ok: false, error: { code: R.disconnected } }, 'a lost restart answer is settings-relay-disconnected');
    assert.equal(parsedFrames(cut.frames.toMain).length, 2, 'no retry after disconnect');
  },

  // Service/route level; the stale-result-vs-current-run UI ordering stays post-merge e2e: browser.
  async 'SET-ST-04'(t) {
    const { h, f } = await syncedFixture(t, standardSync(t));
    const checked = await f.checkPost();
    await h.child.credentials.seed(ID.b, h.child.credentials.record());
    const mixed = await f.addPost({ checkId: checked.json.result.checkId, ids: [ID.a, ID.b] });
    assert.deepEqual(outcomes(mixed), [[ID.a, S.added], [ID.b, S.skipped]].sort(), 'truthful per-entry partial result');
    assert.ok(await h.child.credentials.read(ID.a), 'committed a preserved (no rollback)');
    assert.equal(h.writes().imports.filter((id) => id === ID.b).length <= 1, true, 'no same-Add retry');
    assert.equal(itemsOf(mixed).some((item) => item.id === ID.existing), false, 'unchosen entries absent');
    const fresh = await f.checkPost();
    assert.equal(sortedIds(fresh.json.result.missing).includes(ID.a), false, 'fresh check omits committed a');
    assertCleanTexts(h, f);
  },
};

/** Cases that still lack an observable seam here; each reason names the missing evidence. */
const TODO_REASON = Object.freeze({
  'SET-EP-05': 'fixture: env-key resolution at confirm and built-in route adoption live in the main host adapter (provider-sync-host.js); a disposable main-host resolver composed behind the relay is not built here, so this is not re-proven through SET (engine/host suites cover the rules).',
  'SET-EP-07': 'fixture: an unset/empty apiKeyEnv is decided by the main host adapter with a disposable resolver; no such resolver is composed behind the relay here.',
  'SET-EP-08': 'fixture: unsupported profile fields are refused by the main host adapter (provider-sync-host.js); planting the refusal in a fake source inventory would test the fixture, not the product.',
  'SET-EP-09': 'fixture: version/schema/revision guards need independent real host-adapter and engine fixtures per mismatch behind the relay; not composed here.',
});

for (const record of CASES) {
  const body = EXECUTABLE[record.id];
  if (body === undefined) {
    registerTaskCases([{ ...record, missing: TODO_REASON[record.id] ?? 'post-merge e2e: no unit/integration seam' }]);
    continue;
  }
  for (const sdk of SDK_VERSIONS) {
    const title = `${CONTEXT.task} ${record.id} [${sdk}] ${record.title}`;
    if (sdk === ACTIVE_SDK) test(title, body);
    else test.todo(`${title} — owner SET: executable; run this file with FBTEST_DSH_RUNTIME of ${sdk} (this run: ${ACTIVE_SDK ?? 'unsupported runtime'})`);
  }
}
for (const sdk of SDK_VERSIONS) {
  for (const record of HTTP_CASES) {
    const title = `${CONTEXT.task} ${record.id} [${sdk}] ${record.title}`;
    const availability = boundaryAvailability(sdk);
    if (availability.invalid) {
      test(title, () => { throw availability.invalid; });
    } else if (availability.missing) {
      test.todo(`${title} — owner SET: ${record.missing}`);
    } else {
      test(title, () => runExpiryBoundary(sdk));
    }
  }
}
