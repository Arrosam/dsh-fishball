// NI6-PREP01 only. One original authenticated public preparation instance.
import test from 'node:test';
import { existsSync, lstatSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { check, keys, same, ref, uint, sha, task, snapshot, receipt, preparedJoin, protectedText, unchangedSnapshot } from './public-oracles.mjs';
import { preflight } from './preflight.mjs';

const GOAL = 'Synthetic NI6-PREP01 goal: prepare bounded context without execution.';
const R = label => sha(`df.ni6-prep01.synthetic/v1:${label}`);
const ZERO = {agentCreated:0,agentDisposed:0,sessionCreated:0,sessionDisposed:0,sessionEvents:0,streams:0,tools:0};
function storageMetadata(databasePath) {
  const paths = [databasePath,databasePath + '.df-setup',databasePath + '.df-setup/key.bin',databasePath + '.df-setup/state.json'];
  return paths.map((path,index) => {
    const entry = lstatSync(path);
    check(!entry.isSymbolicLink() && entry.uid === process.getuid() && (entry.mode & 0o077) === 0
      && (index === 1 ? entry.isDirectory() : entry.isFile()), 'PREP01_STORAGE_METADATA');
    return {dev:entry.dev,ino:entry.ino,uid:entry.uid,mode:entry.mode}; // No contents, key/cipher hash or raw DB read.
  });
}

test('NI6-PREP01 genuine authenticated preparation, exact repeat, stale CAS and disposal', {timeout:55000}, async t => {
  const inputs = preflight(); // Exact source/descriptor/host pins BEFORE original module imports.
  const deadline = performance.now() + 40000;
  async function bounded(value, code, maximum = 5000) {
    const remaining = Math.min(maximum, deadline - performance.now());
    check(remaining > 0, 'PREP01_GLOBAL_DEADLINE');
    let timer;
    try {
      return await Promise.race([Promise.resolve(value), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), remaining);
      })]);
    } catch {
      throw new Error(code);
    } finally { clearTimeout(timer); }
  }
  // Cleanup retains a separate five-second allowance inside the 55/60-second bounds.
  async function cleanupBounded(value, code, maximum = 5000) {
    let timer;
    try {
      return await Promise.race([Promise.resolve(value), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), maximum);
      })]);
    } catch { throw new Error(code); } finally { clearTimeout(timer); }
  }
  const {createOriginalPreparationFixture} = await bounded(import('./original-bootstrap.mjs'), 'PREP01_ORIGINAL_IMPORT');
  let original, failed = false;
  try {
    original = await createOriginalPreparationFixture({...inputs,bounded,cleanupBounded});
    const transport = original.transport;
    async function rpc(channel, method, payload) {
      original.noNative();
      const result = await bounded(transport.call(channel, method, payload), 'PREP01_PUBLIC_RPC', 2500);
      original.noNative();
      return result;
    }
    original.noNative();
    await bounded(transport.authenticate(), 'PREP01_AUTH_EXCHANGE', 2500);
    original.noNative();
    const setup = await rpc('/df-setup', 'status', {});
    keys(setup, ['phase','executionEnabled','storage']);
    same(setup, {phase:'setup_required',executionEnabled:false,storage:{location:original.databasePath}}, 'PREP01_INITIAL_SETUP');
    check(!existsSync(original.databasePath), 'PREP01_DATABASE_BEFORE_CONFIRM');
    check(!existsSync(original.databasePath + '.df-setup'), 'PREP01_SETUP_NAMESPACE_BEFORE_CONFIRM');
    for (const suffix of ['-wal','-shm','-journal']) check(!existsSync(original.databasePath + suffix), 'PREP01_SIDECAR_BEFORE_CONFIRM');

    const preview = await rpc('/df-setup', 'prepare', {});
    keys(preview, ['previewRef','planDigest','expiresAt','description']);
    ref(preview.previewRef); ref(preview.planDigest); uint(preview.expiresAt);
    check(preview.expiresAt > Date.now() && preview.expiresAt <= Date.now() + 60000, 'PREP01_PREVIEW_EXPIRY');
    same(preview.description, {operation:'create-local-storage',databaseLocation:original.databasePath,
      identityMode:'native-dsh-owner',encrypted:true,permissions:'owner-only',externalExecution:false}, 'PREP01_SETUP_DESCRIPTION');
    check(!existsSync(original.databasePath), 'PREP01_PREVIEW_WROTE_DATABASE');
    check(!existsSync(original.databasePath + '.df-setup'), 'PREP01_PREVIEW_WROTE_SETUP_NAMESPACE');
    for (const suffix of ['-wal','-shm','-journal']) check(!existsSync(original.databasePath + suffix), 'PREP01_PREVIEW_WROTE_SIDECAR');
    const confirmed = await rpc('/df-setup', 'confirm', {previewRef:preview.previewRef,planDigest:preview.planDigest,accept:true});
    const expectedReady = {phase:'ready',executionEnabled:false,storage:{location:original.databasePath}};
    same(confirmed, expectedReady, 'PREP01_CONFIRM_READY');
    same(await rpc('/df-setup', 'status', {}), expectedReady, 'PREP01_SETUP_READY');
    const file = lstatSync(original.databasePath);
    check(file.isFile() && !file.isSymbolicLink() && file.uid === process.getuid() && (file.mode & 0o077) === 0, 'PREP01_DATABASE_OWNERSHIP');
    const preservedStorage = storageMetadata(original.databasePath);
    const diagnostics = original.diagnostics();
    check(diagnostics.schemaVersion === 7 && diagnostics.capabilities.memory === true && diagnostics.capabilities.memoryContinuity === true,
      'PREP01_GENUINE_SCHEMA7_CAPABILITIES');
    check(diagnostics.capabilities.worker === false && diagnostics.capabilities.automation === false
      && diagnostics.capabilities.delivery === false, 'PREP01_UNSELECTED_CAPABILITIES');
    same(await rpc('/df-rpc', 'list', {}), [], 'PREP01_FRESH_TASK_LIST');

    const intake = await rpc('/df-rpc', 'intake', {taskId:'ni6-prep01-task',provider:'synthetic-local',source:'ni6-prep01',
      eventId:'ni6-prep01-event-1',commandRef:R('intake'),goal:GOAL});
    keys(intake, ['deduplicated','task']);
    check(intake.deduplicated === false, 'PREP01_FRESH_INTAKE'); task(intake.task);
    check(intake.task.status === 'queued' && intake.task.authEpoch === 0, 'PREP01_FRESH_TASK_STATUS');
    const addressed = {taskRef:intake.task.taskRef};
    const baseline = await rpc('/df-rpc', 'status', addressed);
    snapshot(baseline, intake.task);
    const baselineExport = await rpc('/df-rpc', 'export', addressed);
    snapshot(baselineExport, intake.task); unchangedSnapshot(baseline, baselineExport);
    check(baseline.data.length === 1 && baseline.data[0].kind === 'goal' && baseline.data[0].digest === sha(GOAL)
      && baseline.data[0].byteLength === Buffer.byteLength(GOAL) && baseline.data[0].cryptoVersion === 2, 'PREP01_ENCRYPTED_GOAL_METADATA');
    const goalDetail = await rpc('/df-rpc', 'detail', {taskRef:intake.task.taskRef,recordRef:baseline.data[0].recordRef,
      expectedTaskVersion:intake.task.version,expectedAuthEpoch:intake.task.authEpoch});
    keys(goalDetail, ['task','data']); same(goalDetail.task, intake.task, 'PREP01_GOAL_DETAIL_TASK');
    same(goalDetail.data, {...baseline.data[0],content:GOAL}, 'PREP01_GOAL_DETAIL_METADATA_AND_CONTENT');

    const request = Object.freeze({taskRef:intake.task.taskRef,commandRef:R('prepare'),expectedTaskVersion:intake.task.version,
      expectedAuthEpoch:intake.task.authEpoch,terms:Object.freeze([]),now:Date.now()});
    const prepared = await rpc('/df-rpc', 'prepareContext', request);
    receipt(prepared, intake.task);
    const current = await rpc('/df-rpc', 'status', addressed);
    snapshot(current, prepared.task);
    const detail = await rpc('/df-rpc', 'detail', {taskRef:prepared.task.taskRef,recordRef:prepared.recordRef,
      expectedTaskVersion:prepared.task.version,expectedAuthEpoch:prepared.task.authEpoch});
    const body = preparedJoin(prepared, baseline, current, detail);
    same(body.content, protectedText(baseline,GOAL), 'PREP01_COMPLETE_PROTECTED_TEXT');
    const preparedExport = await rpc('/df-rpc', 'export', addressed);
    snapshot(preparedExport, prepared.task); unchangedSnapshot(current, preparedExport);

    const repeated = await rpc('/df-rpc', 'prepareContext', request); // Same complete literal once, same now.
    same(repeated, prepared, 'PREP01_EXACT_REPEAT_RECEIPT');
    const afterRepeat = await rpc('/df-rpc', 'status', addressed);
    snapshot(afterRepeat, prepared.task); unchangedSnapshot(current, afterRepeat);
    const stale = Object.freeze({...request,commandRef:R('stale-different')});
    same(await rpc('/df-rpc', 'prepareContext', stale), 'STALE_VERSION', 'PREP01_EXACT_STALE_REFUSAL');
    const afterStale = await rpc('/df-rpc', 'status', addressed);
    snapshot(afterStale, prepared.task); unchangedSnapshot(current, afterStale);
    const staleExport = await rpc('/df-rpc', 'export', addressed);
    snapshot(staleExport, prepared.task); unchangedSnapshot(current, staleExport);

    await bounded(original.disposeEntry(), 'PREP01_ENTRY_DISPOSAL', 5000);
    original.noNative();
    await bounded(transport.afterEntryDisposal(addressed), 'PREP01_DISPOSED_HTTP', 2500);
    original.noNative();
    const requests = transport.counts();
    same(requests, {authExchanges:1,domainRpcAttempts:18,postDisposalHttp:1,httpRequests:20}, 'PREP01_FINAL_HTTP_COUNTS');
    await original.close();
    same(original.historicalCounts(), ZERO, 'PREP01_FINAL_HISTORICAL_COUNTS');
    same(original.historicalInspectionCount(), 44, 'PREP01_FINAL_INSPECTION_COUNT');
    same(storageMetadata(original.databasePath), preservedStorage, 'PREP01_STORAGE_PRESERVED_AFTER_CLOSE');
    // Public refs and finite counts only. Authentication, key, prose and raw bodies are never emitted.
    t.diagnostic(JSON.stringify({contractVersion:'df.ni6-prep01-public-result/v1',requests,
      taskRef:prepared.task.taskRef,contextRecordRef:prepared.recordRef,contextDigest:prepared.digest,
      taskVersion:prepared.task.version,sourceTaskVersion:prepared.sourceTaskVersion,memoryRevision:prepared.memory.revision,
      nativeEvents:original.historicalCounts(),liveRegistryInspections:original.historicalInspectionCount(),entryDisposed:true,rootDisposed:true,
      contextCheckTypedCurrentness:'OUTSIDE_SELECTED_PUBLIC_RPC_SLICE',acceptance:'HOLD'}));
  } catch (error) {
    failed = true;
    // Codes authored by this fixture are safe; underlying original errors never become TAP payloads.
    const message = error?.message;
    throw new Error(typeof message === 'string' && /^PREP01_[A-Z0-9_]+$/.test(message) ? message : 'PREP01_PUBLIC_FIXTURE_FAILED');
  } finally {
    if (original) {
      try { await original.close(); }
      catch { if (!failed) throw new Error('PREP01_ORIGINAL_CLEANUP_FAILED'); }
    }
    // Preserve private-runtime for accountable inspection by root; this test never deletes or reruns it.
  }
});
