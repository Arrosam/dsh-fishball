// UNIT_ONLY: synthetic public DTOs exercise assertions, never host authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha, snapshot, goalJoin, dataDetail, receipt, preparedJoin, protectedText } from './public-oracles.mjs';

const GOAL = 'Synthetic NI6 oracle-unit goal. Prepare data only.';
const R = label => sha(`df.ni6-prep01.oracle-unit/v1:${label}`);
function candidate() {
  const beforeTask = {ownerRef:R('owner'),workspaceRef:R('workspace'),taskRef:R('task'),status:'queued',
    version:4,taskVersion:4,authEpoch:0,createdAt:100,updatedAt:200};
  const goal = {recordRef:R('goal'),digest:sha(GOAL),kind:'goal',sourceRef:R('intake'),taskVersion:4,
    authEpoch:0,generationRef:null,createdAt:200,byteLength:Buffer.byteLength(GOAL,'utf8'),cryptoVersion:2};
  const baseline = {schemaVersion:7,observedAt:300,task:{...beforeTask},data:[goal],actions:[],workers:[],
    policy:{version:1,limits:{maxActive:1},modelPolicy:{version:0,presetRefs:[]}},messages:[],artifacts:[],
    deliveries:[],progress:[],reviews:[],control:'active',executions:[],audits:[],semanticRevision:4,
    notificationFacts:[],notifications:[]};
  const afterTask = {...beforeTask,version:5,taskVersion:5,updatedAt:400};
  const memory = {namespaceRef:R('memory'),revision:0};
  const sourceScope = {ownerRef:beforeTask.ownerRef,workspaceRef:beforeTask.workspaceRef,taskRef:beforeTask.taskRef};
  const text = protectedText(baseline,GOAL);
  const inputCounts = {bytes:Buffer.byteLength(text,'utf8'),tokens:Math.ceil(text.length / 4) + 4};
  const workFacts = Object.fromEntries(['actions','workers','control','artifacts','progress','deliveries','reviews','audits','policy']
    .map(name => [name,baseline[name]]));
  const body = {contractVersion:'df.execution-context/v1',materialKind:'execution_context',sourceScope,
    sourceTaskVersion:4,sourceAuthEpoch:0,generatedAt:350,sourceRefs:[goal.recordRef],
    sourceProvenance:[{recordRef:goal.recordRef,digest:goal.digest,taskVersion:4,authEpoch:0,createdAt:200}],
    memory:{...memory,provenance:[]},ledgerSnapshotDigest:sha(JSON.stringify({task:baseline.task,workFacts})),
    content:text,inputCounts,retainedRefs:[],droppedRefs:[],verification:'module_prepared_execution_context_only'};
  const content = JSON.stringify(body);
  const sourceRef = sha(JSON.stringify({sourceScope,sourceTaskVersion:4,sourceAuthEpoch:0,
    sourceRefs:[goal.recordRef],expectedMemory:memory}));
  const prepared = {recordRef:R('context'),digest:sha(content),kind:'context',byteLength:Buffer.byteLength(content,'utf8'),
    cryptoVersion:2,sourceRef,task:{...afterTask},sourceTaskVersion:4,sourceAuthEpoch:0,memory,inputCounts,
    retainedRefs:[],droppedRefs:[],verification:'module_prepared_execution_context_only'};
  const metadata = {recordRef:prepared.recordRef,digest:prepared.digest,kind:'context',sourceRef,taskVersion:5,
    authEpoch:0,generationRef:null,createdAt:400,byteLength:prepared.byteLength,cryptoVersion:2,
    sourceTaskVersion:4,sourceAuthEpoch:0,semanticRevision:5,memoryNamespaceRef:memory.namespaceRef,memoryRevision:0};
  const current = {...baseline,observedAt:401,task:{...afterTask},data:[{...goal},metadata],semanticRevision:5};
  const goalDetail = {task:{...beforeTask},data:{...goal,content:GOAL}};
  const detail = {task:{...afterTask},data:{...metadata,content}};
  return {beforeTask,baseline,prepared,current,goalDetail,detail,body};
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function rejects(run, code) {
  assert.throws(run, error => error instanceof Error && error.message === code);
}
function join(value) { return preparedJoin(value.prepared,value.baseline,value.current,value.detail); }

test('U01 UNIT_ONLY valid ordinary baseline', () => {
  const value = candidate();
  assert.doesNotThrow(() => snapshot(value.baseline,value.beforeTask));
  assert.deepEqual(goalJoin(value.baseline,GOAL),value.baseline.data[0]);
});
test('U02 UNIT_ONLY valid frozen baseline', () => {
  const value = frozen(candidate());
  assert.doesNotThrow(() => snapshot(value.baseline,value.beforeTask));
  assert.equal(dataDetail(value.goalDetail,value.beforeTask,goalJoin(value.baseline,GOAL)),GOAL);
});
test('U03 UNIT_ONLY valid complete prepared transition and details', () => {
  const value = candidate();
  assert.doesNotThrow(() => receipt(value.prepared,value.beforeTask));
  assert.equal(dataDetail(value.goalDetail,value.beforeTask,goalJoin(value.baseline,GOAL)),GOAL);
  assert.deepEqual(join(value),value.body);
});
test('U04 UNIT_ONLY missing snapshot field', () => {
  const value = candidate(); delete value.baseline.notifications;
  rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_DTO_KEYS');
});
test('U05 UNIT_ONLY extra snapshot field', () => {
  const value = candidate(); value.baseline.content = 'synthetic unexpected plaintext';
  rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_DTO_KEYS');
});
test('U06 UNIT_ONLY wrong schema', () => {
  const value = candidate(); value.baseline.schemaVersion = 6;
  rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_SNAPSHOT_SCHEMA_CONTROL');
});
test('U07 UNIT_ONLY wrong control', () => {
  const value = candidate(); value.baseline.control = 'paused';
  rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_SNAPSHOT_SCHEMA_CONTROL');
});
test('U08 UNIT_ONLY invalid semantic unsigned integer', () => {
  const value = candidate(); value.baseline.semanticRevision = -1;
  rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_INTEGER');
});
// Eleven fixed inputs yield eleven flat test cells, without nested tests.
for (const [id,name] of [['U09','actions'],['U10','workers'],['U11','messages'],['U12','artifacts'],
  ['U13','deliveries'],['U14','progress'],['U15','reviews'],['U16','executions'],['U17','audits'],
  ['U18','notificationFacts'],['U19','notifications']]) {
  test(`${id} UNIT_ONLY nonempty ${name}`, () => {
    const value = candidate(); value.baseline[name] = [{synthetic:true}];
    rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_UNEXPECTED_WORK_FACT');
  });
}
test('U20 UNIT_ONLY goal metadata content leak', () => {
  const value = candidate(); value.baseline.data[0].content = GOAL;
  rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_DTO_KEYS');
});
test('U21 UNIT_ONLY missing goal metadata key', () => {
  const value = candidate(); delete value.baseline.data[0].createdAt;
  rejects(() => snapshot(value.baseline,value.beforeTask),'PREP01_DTO_KEYS');
});
test('U22 UNIT_ONLY context metadata content leak', () => {
  const value = candidate(); value.current.data[1].content = 'synthetic leaked context';
  rejects(() => snapshot(value.current,value.prepared.task),'PREP01_DTO_KEYS');
});
test('U23 UNIT_ONLY missing context extension', () => {
  const value = candidate(); delete value.current.data[1].memoryRevision;
  rejects(() => snapshot(value.current,value.prepared.task),'PREP01_DTO_KEYS');
});
test('U24 UNIT_ONLY extra goal-detail data field', () => {
  const value = candidate(); value.goalDetail.data.extra = 'synthetic';
  rejects(() => dataDetail(value.goalDetail,value.beforeTask,value.baseline.data[0]),'PREP01_DTO_KEYS');
});
test('U25 UNIT_ONLY extra context-detail data field', () => {
  const value = candidate(); value.detail.data.extra = 'synthetic';
  rejects(() => join(value),'PREP01_DTO_KEYS');
});
test('U26 UNIT_ONLY context source-task version mismatch', () => {
  const value = candidate(); value.current.data[1].sourceTaskVersion = 5; value.detail.data.sourceTaskVersion = 5;
  rejects(() => join(value),'PREP01_PREPARED_METADATA_VERSIONS');
});
test('U27 UNIT_ONLY missing semantic increment', () => {
  const value = candidate(); value.current.semanticRevision = 4;
  rejects(() => join(value),'PREP01_SEMANTIC_TRANSITION');
});
test('U28 UNIT_ONLY double semantic increment', () => {
  const value = candidate(); value.current.semanticRevision = 6;
  rejects(() => join(value),'PREP01_SEMANTIC_TRANSITION');
});
test('U29 UNIT_ONLY context semantic revision mismatch', () => {
  const value = candidate(); value.current.data[1].semanticRevision = 6; value.detail.data.semanticRevision = 6;
  rejects(() => join(value),'PREP01_CONTEXT_SEMANTIC_JOIN');
});
test('U30 UNIT_ONLY changed first-transition policy', () => {
  const value = candidate(); value.current.policy = {...value.baseline.policy,version:2};
  rejects(() => join(value),'PREP01_POLICY_CHANGED');
});
test('U31 UNIT_ONLY changed retained goal metadata', () => {
  const value = candidate(); value.current.data[0].createdAt++;
  rejects(() => join(value),'PREP01_SOURCE_RECORD_CHANGED');
});
