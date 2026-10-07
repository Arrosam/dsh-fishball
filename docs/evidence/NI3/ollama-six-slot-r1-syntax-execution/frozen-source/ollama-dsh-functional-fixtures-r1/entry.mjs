import { stableErrorCode } from './stable-error-code.mjs';
// SOURCE ONLY. Direct invocation requires a separate root-authored concrete GO.
// Imports are themselves held effects until root authorizes graph/module checks.
import assert from 'node:assert/strict';
import { readFileSync, openSync, writeSync, fsyncSync, closeSync, mkdirSync,
  lstatSync, realpathSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { bounds } from './admission.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const capsule = fileURLToPath(new URL('./', import.meta.url));
function privateRead(path) {
  const stat = lstatSync(path); assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.uid, process.getuid()); assert.equal(stat.mode & 0o077, 0); assert.ok(stat.size <= 262144);
  assert.equal(realpathSync(path), path); return readFileSync(path);
}
function exclusiveRecord(path, data) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeSync(fd, JSON.stringify(data, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
export async function runFunctional() {
  // Root creates this file after all pending reviews and exact command approval.
  const go = JSON.parse(privateRead(join(capsule, 'root-execution-go.json')));
  assert.equal(go.contractVersion, 'df.ollama-functional-root-go/v1'); assert.equal(go.executionAuthorized, true);
  assert.equal(go.sourceReviewAccepted, true); assert.equal(go.FOL01AffectedReviewAccepted, true);
  assert.equal(go.fixtureLiteralReviewAccepted, true); assert.equal(go.hostGraphChecksAccepted, true);
  assert.equal(go.memoryContinuitySourceReviewAccepted, true); assert.equal(go.memoryContinuityDesignFollowupAccepted, true);
  assert.equal(go.independentDesignSha256, '45db6968d99ca1c2d9af031bcc714b7e54d774b63c8552666f70e3277aa883b4');
  assert.equal(go.authoritativeInferenceCountBefore, 0); assert.equal(go.maxCalls, 6);
  assert.equal(go.liveWindowMs, bounds.liveWindowMs); assert.equal(go.interruptWindowMs, bounds.interruptWindowMs);
  assert.equal(go.endpoint, 'http://127.0.0.1:11434/api/chat'); assert.equal(go.model, 'deepseek-v4.1-flash:cloud');
  assert.equal(go.authorizationRef, 'fb5a5178e165a1e40427bae17953baa6cac46f3446035d22a24e1510da3be4cb');
  assert.equal(go.metadataRevalidated, true);
  const freezeBytes = readFileSync(join(capsule, 'fixture-freeze.json')); assert.equal(digest(freezeBytes), go.fixtureFreezeSha256);
  const freeze = JSON.parse(freezeBytes);
  for (const member of freeze.files) assert.equal(digest(readFileSync(member.path)), member.sha256, 'frozen source drift');
  assert.equal(process.version, 'v22.22.2'); assert.equal(digest(readFileSync(process.execPath)), freeze.nodeSha256);
  // Refuse both the original and successor histories before bootstrap.
  const positions = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06'];
  for (const history of [capsule, fileURLToPath(new URL('../ollama-dsh-functional-fixtures/', import.meta.url))]) {
    for (const marker of ['preflight-attempt.json', 'position-ledger/realm-reserved.json',
      ...positions.map(slot => `position-ledger/${slot}-consumed.json`)]) {
      assert.equal(lstatSync(join(history, marker), { throwIfNoEntry: false }), undefined, 'existing attempt or live marker');
    }
  }
  exclusiveRecord(join(capsule, 'preflight-attempt.json'), {
    contractVersion: 'df.ollama-functional-preflight-attempt/v1',
    rootGoSha256: digest(privateRead(join(capsule, 'root-execution-go.json'))),
    attemptedAt: Date.now(), rerunAllowed: false, livePositionsReserved: false });
  const observations = join(capsule, 'private-observations');
  mkdirSync(observations, { mode: 0o700 });
  const observationStat = lstatSync(observations);
  assert.ok(observationStat.isDirectory() && !observationStat.isSymbolicLink());
  assert.equal(observationStat.uid, process.getuid()); assert.equal(observationStat.mode & 0o777, 0o700);
  assert.equal(realpathSync(observations), observations);
  const ledger = join(capsule, 'position-ledger');
  let checkpointIndex = 0, position = 0, cleanup, fixture, within, liveReservationsCreated = false, liveReservationState = 'not-attempted';
  const checkpoint = data => exclusiveRecord(join(observations, `observation-${String(++checkpointIndex).padStart(3, '0')}.json`),
    { contractVersion: 'df.ollama-functional-observation/v1', observedAt: Date.now(), ...data });
  const hardDeadline = setTimeout(() => {
    try {
      checkpoint({ state: 'HOLD', reasonCode: 'HARD_WINDOW_EXPIRED', processExit: true,
        pendingLocalWork: 'unknown', remoteTermination: 'unproved', reservationRelease: 'unproved' });
    } finally { process.exit(2); } // deadline only; never termination/effect proof
  }, bounds.liveWindowMs);
  const consumePosition = slot => {
    assert.equal(liveReservationsCreated, true);
    assert.equal(slot, 'R0' + (position + 1)); assert.ok(position < 6);
    exclusiveRecord(join(ledger, `${slot}-consumed.json`), { slot, admittedAt: Date.now(),
      disposition: 'consumed-before-original-execute', retryOrReplenishment: false });
    position++;
  };
  try {
    // Model-capable dependency imports follow the complete source gate and marker.
    const native = await import('./native-fixture.mjs'); within = native.within;
    const { createSixPositionSequence } = await import('./scenarios.mjs');
    fixture = await within(native.createNativeFixture({ checkpoint, registerCleanup: value => { cleanup = value; } }),
      bounds.rpcWindowMs, 'DEADLINE_UNKNOWN');
    const sequence = createSixPositionSequence(fixture, { consumePosition, checkpoint });
    await within(sequence.preflight(), bounds.rpcWindowMs, 'DEADLINE_UNKNOWN');
    // The retained original R01 idle worker is the first live mapping below.
    fixture.binding.assertCurrent(); const audit = fixture.binding.audit();
    assert.equal(audit.attempted, 0); assert.equal(audit.active, false); assert.equal(audit.uncertainHold, false);
    assert.equal(audit.calls.length, 0); assert.equal(fixture.observer.rows.length, 0);
    mkdirSync(ledger, { recursive: true, mode: 0o700 });
    const parent = openSync(capsule, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(parent); } finally { closeSync(parent); }
    const ledgerStat = lstatSync(ledger); assert.ok(ledgerStat.isDirectory() && !ledgerStat.isSymbolicLink());
    assert.equal(ledgerStat.uid, process.getuid()); assert.equal(ledgerStat.mode & 0o777, 0o700);
    assert.equal(realpathSync(ledger), ledger);
    liveReservationState = 'write-started/unknown';
    exclusiveRecord(join(ledger, 'realm-reserved.json'), { contractVersion: 'df.ollama-six-position-ledger/v1',
      rootGoSha256: digest(privateRead(join(capsule, 'root-execution-go.json'))), reserved: positions,
      initialAuthoritativeCalls: 0, allowanceReplenishedOnRestart: false, unusedPositionsExpire: true });
    liveReservationsCreated = true; liveReservationState = 'reserved';
    checkpoint({ phase: 'six-live-positions-reserved-after-preflight', adapterAudit: audit });
    await sequence.run();
    checkpoint({ state: 'sequence-ended', consumedPositions: position, adapterAudit: fixture.binding.audit(),
      UI: 'HOLD', authoritativeAudit: 'HOLD', originalAcceptance: 'unchanged/HOLD', remoteTermination: 'unproved' });
  } catch (error) {
    checkpoint({ state: 'HOLD', reasonCode: stableErrorCode(error, 'entry'),
      consumedPositions: position, livePositionsReserved: liveReservationsCreated,
      liveReservationState, followingPositions: liveReservationsCreated ? 'expired'
        : liveReservationState === 'not-attempted' ? 'not-reserved' : 'unknown/HOLD', adapterAudit: fixture?.binding.audit(),
      remoteTermination: 'unproved', reservationRelease: 'unproved' });
    process.exitCode = 2;
  } finally {
    fixture?.observer.release();
    try {
      if (cleanup) await within(Promise.resolve().then(cleanup), bounds.cleanupWindowMs, 'LOCAL_CLEANUP_UNKNOWN');
      checkpoint({ phase: cleanup ? 'original-context-disposal-resolved' : 'original-context-not-created', remoteTermination: 'unproved', scratchRetained: true });
      clearTimeout(hardDeadline);
    } catch {
      checkpoint({ state: 'HOLD', phase: 'original-context-disposal-unknown', remoteTermination: 'unproved',
        reservationRelease: 'unproved', scratchRetained: true }); process.exitCode = 2;
      // Hard deadline remains armed when original disposal is unresolved.
    }
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await runFunctional();
