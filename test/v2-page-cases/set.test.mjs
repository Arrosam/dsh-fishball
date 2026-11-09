import assert from 'node:assert/strict';
import test from 'node:test';
import { registerTaskCases, SDK_VERSIONS } from './support.mjs';
import { createHttpFixtures } from './http-fixtures.mjs';

// Native settings are the editor. SET owns only lifecycle/sync/notice/links;
// component observations need real fixtures, never a fake passing policy model.
const CONTEXT = Object.freeze({
  task: 'SET',
  source: 'docs/planning/v2-final-scope.md §4 SET; docs/plugins/instance-extension-points.md §11.8; docs/slim-native-design.md §10 retained sync semantics; docs/test-design/v2-origin-lite-set-cases.md §3',
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
    steps: ['Main: open SET from conversation/connector; see status/Restart/model-provider check-and-select sync/one-line Read Only/native Settings and Plugins links; explicitly return.', 'Alternative: native Settings edits model/effort/plugins; composer uses native picker.', 'Exception: pending/unavailable/error is visible with meaningful explicit Retry.'],
    expected: ['No duplicated plugin/model/config/recommendation/Watchdog editor or D2 obsolete controls.', FIXTURE.readonly, FIXTURE.unchanged, 'Allowed native destinations and explicit Fishball return work.'],
  },
  {
    id: 'SET-UC-02', title: 'Restart only the exact owned child through existing lifecycle', technique: 'Use Case',
    preconditions: ['Actor: owner; exact current child handle A host-owned; main and unrelated runtime fixtures tracked.'],
    steps: ['Main: invoke existing lifecycle restart; confirm A stopped before starting B; refresh status and re-admit current generation.', 'Alternative: explicit Retry from failed state while main shell remains available.', 'Exception: ownership uncertain, stop/start failure or late A completion.'],
    expected: ['Only exact owned child affected; no unsafe signal/second writer or main/unrelated process change.', 'Failure honestly visible; no stale completion claims ready or replaces B.', FIXTURE.unchanged],
  },
  {
    id: 'SET-UC-03', title: 'Preview and add only selected missing API-key providers', technique: 'Use Case',
    preconditions: ['Actor: owner; ready child; disposable synthetic inventory and credentials only.', FIXTURE.providerA, FIXTURE.providerB, 'Target has separate existing provider/key.'],
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
    steps: ['Invoke restart and sync protected actions separately.'],
    expected: ['No lifecycle mutation, key transfer or public capability leak; clear refusal rather than apparent success.'],
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

// Use Cases precede the supporting BVA registration for each task.
const isUseCase = record => record.technique === EXPIRY.useCaseTechnique;
registerTaskCases(CASES.filter(isUseCase));
registerTaskCases(CASES.filter(record => !isUseCase(record)));
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
