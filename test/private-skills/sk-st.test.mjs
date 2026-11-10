/**
 * T-SK State Transitions (docs/test-design/private-skills.md §6): ST-09 library lifecycle, ST-10
 * failure and recovery, ST-SK-11 catalog visibility (SK-SEAM decision 3) and ST-SK-12 manager
 * lifecycle (decision 2). Each transition the SK implementation owns runs against it through
 * support/scenarios.mjs; "restart" is a disposed child plus a new one booted over the same home.
 *
 * `SK-ST-*-N` executable premises show, through the installed public provider, the native states
 * the SK oracle rests on: a held candidate rereads its file, and a removed file stops loading.
 */
import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import { it } from 'node:test'
import { SAMPLE } from './support/constants.mjs'
import { perSdk, placeSkill, skCases, skillDocument, skillWorkspace } from './support/fixtures.mjs'
import { openNative } from './support/native-oracle.mjs'
import * as S from './support/scenarios.mjs'

// ST-09 — Absent → Committed → Visible → (restart) Visible → Updated → Visible(new) → Removed → Absent.
const ST_09 = [
  ['SK-ST-09-T1', 'Absent → create: committed and the catalog refreshed; the next list and load show the new body; no approval was inserted.'],
  ['SK-ST-09-T2', 'Visible → child restart or manager resume: the same skill lists and loads unchanged; the worker and main catalogs still do not hold it.'],
  ['SK-ST-09-T3', 'Visible → update: the next load returns the new body; the old body is not reported as current; text already delivered is unchanged.'],
  ['SK-ST-09-T4', 'Visible → remove: the next list and load do not resolve it; nothing claims removed text was erased from earlier context.'],
  ['SK-ST-09-T5', 'Absent (after remove) → create of the same name: allowed, and loads the newly created body, not the removed one.'],
  ['SK-ST-09-X1', 'Invalid transition: update or remove while Absent gives not-found and the state stays Absent (Q5); create while Visible gives a conflict and the state stays Visible.'],
]

// ST-10 — Valid(old) → Attempt → {PreCommitFailure → Valid(old)} | {Committed → RefreshFailed → Reload → Valid(new)}.
const ST_10 = [
  ['SK-ST-10-T1', 'Valid(old) → update with a pre-commit fault: back to Valid(old), byte-identical and loadable; the result says not committed.'],
  ['SK-ST-10-T2', 'Absent → create with a pre-commit fault: stays Absent; no partial or loadable skill and no leftover that blocks a later create.'],
  ['SK-ST-10-T3', 'Valid(old) → update commits → refresh fails: RefreshFailed with a distinct outcome; the file is complete and new; nothing calls it a failed write or no write.'],
  ['SK-ST-10-T4', 'RefreshFailed → explicit reload succeeds: Valid(new); list and load show the new version.'],
  ['SK-ST-10-T5', 'RefreshFailed → reload fails again: still RefreshFailed, reported truthfully; the file is unchanged; a later successful reload still converges.'],
  ['SK-ST-10-T6', 'Attempt → cancelled: the observed state is exactly Valid(old) or Valid(new) as a whole document, and the result matches whichever it is.'],
  ['SK-ST-10-T7', 'Two concurrent attempts on one name: both settle; the final state equals one caller\'s complete document; each result is truthful (Q5).'],
  ['SK-ST-10-X1', 'Forbidden states: a truncated or mixed published document, an outside-root mutation, an ambiguous commit reported as a definite no-write, or an automatic semantic winner policy.'],
]

// ST-SK-11 — catalog visibility (decision 3): Stale → invalidate → Fresh-on-next-call.
const ST_CATALOG = [
  ['SK-ST-11-T1', 'After a successful mutation, the next list and load and the next model step\'s catalog reflect it; no restart or watcher is required.'],
  ['SK-ST-11-T2', 'A body loaded before an update stays as-is in conversation; only future loads see the new body.'],
  ['SK-ST-11-T3', 'The host watcher is off: a bypass edit is not promised to appear until an explicit reload (Q1, "it is what it is"); after reload, the bypass safety rules still apply.'],
  ['SK-ST-11-T4', 'An in-flight model request keeps its inputs; invalidation schedules no wake or turn.'],
  ['SK-ST-11-T5', 'No result claims a native slash-menu refresh; the menu may keep its cached list (decision 3).'],
  ['SK-ST-11-T6', 'An incomplete discovery (rc.5 none published; rc.1 partial with a warning) is never reported as a successful reload.'],
]

// ST-SK-12 — manager lifecycle (decision 2): Unregistered → Registered(manager) → Disposed → Registered(new generation).
const ST_MANAGER = [
  ['SK-ST-12-T1', 'Manager setup: the tool and private provider register for the singleton Fishball manager scope only.'],
  ['SK-ST-12-T2', 'Manager disposal: the registration is released; a stale-generation call cannot list or mutate.'],
  ['SK-ST-12-T3', 'Resume or a new generation: registration happens again exactly once, with no duplicate provider or tool, and earlier skills stay visible.'],
  ['SK-ST-12-T4', 'Throughout, no worker composition, standing preset or main DSH gains the provider or the tool.'],
]

const SCENARIOS = {
  'SK-ST-09-T1': S.createPublishes,
  'SK-ST-09-T2': S.restartKeepsLibrary,
  'SK-ST-09-T3': S.updatePublishes,
  'SK-ST-09-T4': S.removeLeavesOthers,
  'SK-ST-09-T5': S.recreateAfterRemove,
  'SK-ST-09-X1': S.invalidTransitions,
  'SK-ST-10-T1': S.updatePreCommitFault,
  'SK-ST-10-T2': S.createPreCommitFault,
  'SK-ST-10-T3': S.refreshFailure,
  'SK-ST-10-T4': S.refreshFailure,
  'SK-ST-10-T5': S.refreshFailure,
  'SK-ST-10-T6': S.cancellationTruthful,
  'SK-ST-10-T7': S.concurrencyOneWinner,
  'SK-ST-10-X1': S.forbiddenStatesAbsent,
  'SK-ST-11-T1': S.nextCallFresh,
  'SK-ST-11-T2': S.updatePublishes,
  'SK-ST-11-T3': S.watcherOffBypass,
  'SK-ST-11-T4': S.noWakeOnInvalidate,
  'SK-ST-11-T5': S.noUiObligation,
  'SK-ST-11-T6': S.incompleteNeverSuccess,
  'SK-ST-12-T1': S.setupManagerOnly,
  'SK-ST-12-T2': S.disposalFences,
  'SK-ST-12-T3': S.restartKeepsLibrary,
  'SK-ST-12-T4': S.neverOutsideManager,
}

perSdk('T-SK State Transitions (SK-owned)', (version) => skCases(version, [...ST_09, ...ST_10, ...ST_CATALOG, ...ST_MANAGER], SCENARIOS))

perSdk('T-SK ST native-oracle premises', (version) => {
  async function heldCandidate(t) {
    const { root } = await skillWorkspace(t)
    const file = await placeSkill(root, SAMPLE.name, skillDocument(SAMPLE))
    const native = await openNative(version, root)
    t.after(() => native.close())
    const { candidates } = await native.list()
    assert.equal(candidates.length, 1)
    return { native, file, candidate: candidates[0] }
  }

  it('SK-ST-11-T2-N natively, a held candidate rereads its file: a later load sees an updated body', async (t) => {
    const { native, file, candidate } = await heldCandidate(t)
    const replacement = SAMPLE.body + '\nrevised'
    await writeFile(file, skillDocument({ ...SAMPLE, body: replacement }))
    assert.equal((await native.get(candidate)).content, replacement)
  })

  it('SK-ST-09-T4-N natively, a held candidate whose file was removed no longer loads', async (t) => {
    const { native, file, candidate } = await heldCandidate(t)
    await rm(file)
    assert.equal(await native.get(candidate), undefined)
  })
})
