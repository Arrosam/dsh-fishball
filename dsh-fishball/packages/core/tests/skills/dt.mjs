/**
 * T-SK Decision Tables (docs/test-design/private-skills.md §5). DT-09 is the requirement table;
 * DT-SK-01 to 04 expand its conditions into full rule sets. Every rule runs against the SK
 * implementation (owner SK) through scenarios.mjs, on the current DSH. SK-DT-09-R5 (a live
 * manager→worker delivery) is not registered (README.md).
 */
import { skCases } from './fixtures.mjs'
import * as S from './scenarios.mjs'

// DT-09 — the settled requirement table (UC-25–28; S1–S8).
const DT_09 = [
  ['SK-DT-09-R1', 'Fishball list/read/load of its own skill in read-only mode: available through the confined tool and native loader, with no write approval.'],
  ['SK-DT-09-R2', 'Fishball create/update of a valid child skill: complete confined publication and catalog refresh, no user approval.'],
  ['SK-DT-09-R3', 'Fishball removes its own skill: gone from future loads; prior conversation text is untouched.'],
  ['SK-DT-09-R4', 'Ordinary agent write, or a target outside the skills root: read-only or confinement refusal, nothing outside mutated, no discretion to bypass.'],
  ['SK-DT-09-R6', 'A write fails before commit: clear error, no partial file, the old update target intact.'],
  ['SK-DT-09-R7', 'Commit succeeds and reload fails: explicit persisted-not-refreshed outcome, complete file intact.'],
  ['SK-DT-09-R8', 'User rejection, sensitive data, duplicate, contradiction or stale note: no prescribed classification or result; any write actually made stays confined and complete.'],
]

// DT-SK-01 — caller x route. Conditions: caller (singleton manager / worker / nested dispatch from a
// worker) and route (dedicated skill tool / ordinary write-edit-shell).
const DT_CALLER = [
  ['SK-DT-01-R1', 'manager + dedicated tool: allowed on its own root without approval.'],
  ['SK-DT-01-R2', 'manager + ordinary write/edit/shell on the skills root: denied by read-only, no approval offered.'],
  ['SK-DT-01-R3', 'worker (native subagent or managed session) + dedicated tool: not available, or refused before any read or write.'],
  ['SK-DT-01-R4', 'worker + ordinary route: read-only and its own sandbox apply; the private library is not in its skill catalog.'],
  ['SK-DT-01-R5', 'a dispatch nested inside a worker turn that names the dedicated operation: refused; identity comes from the live receiving agent, not from names or model-supplied flags.'],
]

// DT-SK-02 — operation x target state x input validity. Valid name and document unless stated.
const DT_OPERATION = [
  ['SK-DT-02-R1', 'create + absent + valid: committed; one new native-loadable skill.'],
  ['SK-DT-02-R2', 'create + present + valid: conflict; the existing bytes are unchanged.'],
  ['SK-DT-02-R3', 'create + any state + invalid name or document: validation error; nothing written.'],
  ['SK-DT-02-R4', 'update + present + valid: committed; the complete new version loads.'],
  ['SK-DT-02-R5', 'update + absent + valid: not-found (Q5); nothing created.'],
  ['SK-DT-02-R6', 'update + present + invalid document: validation error; the old version is byte-identical.'],
  ['SK-DT-02-R7', 'remove + present: committed; it no longer resolves, other skills and the root remain.'],
  ['SK-DT-02-R8', 'remove + absent: not-found (Q5); nothing changed.'],
  ['SK-DT-02-R9', 'read + present: the current complete document; no write.'],
  ['SK-DT-02-R10', 'read + absent: not-found; no fallback to another root.'],
  ['SK-DT-02-R11', 'read, update or remove + invalid name: validation error before any filesystem access.'],
  ['SK-DT-02-R12', 'reload + any library: a fresh complete catalog of the valid private skills; succeeds with an empty library.'],
]

// DT-SK-03 — commit x refresh x delivery. Conditions: commit (no / yes), refresh (n/a / ok / failed),
// result delivery (delivered / cancelled).
const DT_OUTCOME = [
  ['SK-DT-03-R1', 'no commit (validation, I/O, permission or cancellation before commit): result "not committed" naming the operation; the prior state is exact.'],
  ['SK-DT-03-R2', 'commit + refresh ok + delivered: success; the next list/load shows it.'],
  ['SK-DT-03-R3', 'commit + refresh failed + delivered: distinct committed-not-refreshed; never "write failed" and never plain success.'],
  ['SK-DT-03-R4', 'commit + any refresh + cancelled delivery: the committed state is kept (no silent rollback), and a later list/read/reload reports it as committed.'],
  ['SK-DT-03-R5', 'commit + refresh failed, then an explicit reload: the reload succeeds and the catalog shows the committed state; a retried create reports a conflict, not a duplicate.'],
]

// DT-SK-04 — safety for bypass-produced states (Q1/Q2: "it is what it is" except these safety rules).
const DT_BYPASS = [
  ['SK-DT-04-R1', 'SKILL.md is a symlink escaping the root: list/read/load refuse before reading the target; update/remove never write through it; the target is byte-identical.'],
  ['SK-DT-04-R2', 'the <name> directory is a symlink escaping the root: same as R1; remove never deletes the target\'s contents.'],
  ['SK-DT-04-R3', 'a symlink that stays inside the root: no oracle beyond "nothing outside is read or written".'],
  ['SK-DT-04-R4', '<name>/ holds extra files besides SKILL.md and is removed: nothing outside <root>/<name>/ is touched (Q2); what happens to the extras is unspecified.'],
  ['SK-DT-04-R5', 'a hand-corrupted, name-mismatched, non-regular or hardlinked SKILL.md: the manager and tool stay usable, other skills still list and load, nothing outside is written; the entry\'s own result is unspecified.'],
]

const SCENARIOS = {
  'SK-DT-09-R1': S.ownSkillAvailable,
  'SK-DT-09-R2': S.all(S.createPublishes, S.updatePublishes),
  'SK-DT-09-R3': S.removeLeavesOthers,
  'SK-DT-09-R4': S.ordinaryOrOutsideRefused,
  'SK-DT-09-R6': S.all(S.updatePreCommitFault, S.createPreCommitFault),
  'SK-DT-09-R7': S.refreshFailure,
  'SK-DT-09-R8': S.semanticNotPoliced,
  'SK-DT-01-R1': S.ownSkillAvailable,
  'SK-DT-01-R2': S.ordinaryRouteDenied,
  'SK-DT-01-R3': S.workerIsolated,
  'SK-DT-01-R4': S.workerIsolated,
  'SK-DT-01-R5': S.nonManagerRefused,
  'SK-DT-02-R1': S.createPublishes,
  'SK-DT-02-R2': S.createConflict,
  'SK-DT-02-R3': S.createInvalidAnyState,
  'SK-DT-02-R4': S.updatePublishes,
  'SK-DT-02-R5': S.mutateAbsentNotFound,
  'SK-DT-02-R6': S.updateInvalidKeepsOld,
  'SK-DT-02-R7': S.removeLeavesOthers,
  'SK-DT-02-R8': S.mutateAbsentNotFound,
  'SK-DT-02-R9': S.readCurrent,
  'SK-DT-02-R10': S.absentNotFound,
  'SK-DT-02-R11': S.pathNamesRefused(),
  'SK-DT-02-R12': S.all(S.reloadFresh, S.emptyLibrary),
  'SK-DT-03-R1': S.all(S.updatePreCommitFault, S.createPreCommitFault, S.invalidDocuments('emptyBody'), S.cancellationTruthful),
  'SK-DT-03-R2': S.createPublishes,
  'SK-DT-03-R3': S.refreshFailure,
  'SK-DT-03-R4': S.cancellationTruthful,
  'SK-DT-03-R5': S.refreshFailure,
  'SK-DT-04-R1': S.escapingSymlink('file'),
  'SK-DT-04-R2': S.all(S.escapingSymlink('dir'), S.removeWithExtras),
  'SK-DT-04-R3': S.bypassShapesSafe,
  'SK-DT-04-R4': S.removeWithExtras,
  'SK-DT-04-R5': S.bypassShapesSafe,
}

export function registerSkillDtCases() {
  skCases([...DT_09, ...DT_CALLER, ...DT_OPERATION, ...DT_OUTCOME, ...DT_BYPASS], SCENARIOS)
}
