import assert from 'node:assert/strict';
import {DTO, clone, ok} from './public-dtos.mjs';
import {deferred} from './finite-deferred.mjs';

const preparation = new Set(['v1/prepareContext','v1/workerPlan','v1/workerGrant','v1/workerCreate']);
const readonly = new Map([
  ['/df-rpc:v1/list','task'], ['/df-rpc:v1/status','task'],
  ['/df-setup:v1/workerStatus','workerStatus'],
  ['/df-rpc:v1/workerPreview','preview'], ['/df-rpc:v1/workerQuery','workerQuery'],
]);
const ref = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function exactKeys(value, keys) { assert.deepEqual(Object.keys(value).sort(), [...keys].sort()); }

// This is a UNIT_ONLY synthetic endpoint, never an original Connection/Gateway service.
// Every entry is counted before validation or release, including unexpected attempts.
export function createPublicCarrier(caseId) {
  const counters = {S:0,P:0,E:0,C:0,R:0,workerStatus:0,preview:0,workerQuery:0,task:0,other:0,unexpected:0};
  const trace = [], commandRefs = new Set(), barriers = [];
  let stage = 0, executionCount = 0, holdStatus = null;
  const executeEntered = deferred(`${caseId}:execute-entered`);
  const executeReply = deferred(`${caseId}:execute-reply`);
  barriers.push(executeEntered, executeReply);
  let enteredExecute = null;
  const taskA = () => clone(stage === 0 ? DTO.taskListInitial[0] : stage < 3 ? DTO.taskStatusAfterPrepare.task : DTO.taskStatusAfterGrantAndCreate.task);
  const taskB = () => clone(DTO.taskListInitial[1]);
  const status = taskRef => {
    assert.ok(taskRef === DTO.references.taskA || taskRef === DTO.references.taskB);
    return {task:taskRef === DTO.references.taskA ? taskA() : taskB(),data:[],actions:[],workers:taskRef === DTO.references.taskA && stage >= 4 ? [clone(DTO.workerCreate.worker)] : [],control:'active'};
  };
  function count(channel, method, payload, signal) {
    const route = `${channel}:${method}`, category = readonly.get(route);
    if (channel === '/df-rpc' && (preparation.has(method) || method === 'v1/workerExecute' || method === 'v1/workerPolicyConfirm' || ['v1/workerCapture','v1/workerFinish'].includes(method))) {
      counters.S++;
      if (preparation.has(method)) counters.P++;
      if (method === 'v1/workerExecute') counters.E++;
    } else if (route === '/df-rpc:v1/control') counters.C++;
    else if (category) { counters.R++; counters[category]++; }
    else { counters.unexpected++; }
    trace.push(Object.freeze({classification:'UNIT_ONLY',entry:trace.length+1,channel,method,taskRef:ref(payload?.taskRef)?payload.taskRef:null,commandRef:ref(payload?.commandRef)?payload.commandRef:null,expectedTaskVersion:payload?.expectedTaskVersion??null,expectedAuthEpoch:payload?.expectedAuthEpoch??null,signalPresent:signal instanceof AbortSignal,counts:Object.freeze({...counters})}));
    assert.ok(signal instanceof AbortSignal, 'original public carrier must receive its AbortSignal');
    assert.ok(counters.S <= 5 && counters.P <= 4 && counters.E <= 1 && counters.C === 0 && counters.R <= 32 && counters.workerStatus <= 8 && counters.preview <= 2 && counters.workerQuery <= 2 && counters.task <= 16 && counters.other <= 4 && counters.unexpected === 0, 'finite public carrier budget exceeded');
    if (channel === '/df-rpc' && payload?.commandRef) {
      assert.ok(ref(payload.commandRef)); assert.equal(commandRefs.has(payload.commandRef), false, 'no new/reused command hidden');
      commandRefs.add(payload.commandRef);
    }
  }
  function cas(payload, additions) {
    exactKeys(payload,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch',...additions]);
    const current = taskA();
    assert.equal(payload.taskRef,current.taskRef); assert.equal(payload.expectedTaskVersion,current.version); assert.equal(payload.expectedAuthEpoch,current.authEpoch);
    assert.ok(ref(payload.commandRef));
  }
  const rpc = Object.freeze({
    async call(channel, method, payload, signal) {
      count(channel,method,payload,signal);
      if (channel === '/df-setup' && method === 'v1/workerStatus') { exactKeys(payload,[]); return ok(DTO.workerStatus); }
      assert.equal(channel,'/df-rpc');
      if (method === 'v1/list') { exactKeys(payload,[]); return ok([taskA(),taskB()]); }
      if (method === 'v1/status') {
        exactKeys(payload,['taskRef']); const value = status(payload.taskRef);
        if (holdStatus) { const hold=holdStatus; holdStatus=null; hold.entered.resolve({taskRef:payload.taskRef,signal}); return await hold.reply.promise; }
        return ok(value);
      }
      if (method === 'v1/prepareContext') { assert.equal(stage,0); cas(payload,['terms','now']); assert.deepEqual(payload.terms,[]); assert.equal(payload.now,DTO.clock); stage=1; return ok(DTO.prepareContext); }
      if (method === 'v1/workerPlan') { assert.equal(stage,1); cas(payload,['contextRecordRef']); assert.equal(payload.contextRecordRef,DTO.references.contextRecord); stage=2; return ok(DTO.workerPlan); }
      if (method === 'v1/workerPreview') {
        assert.equal(stage,2); exactKeys(payload,['taskRef','actionRef','actionDigest','recordRef','expectedTaskVersion','expectedAuthEpoch']);
        assert.deepEqual(payload,{taskRef:DTO.references.taskA,actionRef:DTO.references.action,actionDigest:DTO.references.actionDigest,recordRef:DTO.references.contextRecord,expectedTaskVersion:2,expectedAuthEpoch:0});
        return ok(DTO.workerPreview);
      }
      if (method === 'v1/workerGrant') {
        assert.equal(stage,2); cas(payload,['actionRef','actionDigest','expiresAt','previewRef','accept']);
        assert.equal(payload.actionRef,DTO.references.action); assert.equal(payload.actionDigest,DTO.references.actionDigest); assert.equal(payload.previewRef,DTO.references.preview); assert.equal(payload.expiresAt,DTO.grantExpiresAt); assert.equal(payload.accept,true);
        stage=3; return ok(DTO.workerGrant);
      }
      if (method === 'v1/workerCreate') {
        assert.equal(stage,3); cas(payload,['actionRef','actionDigest']); assert.equal(payload.actionRef,DTO.references.action); assert.equal(payload.actionDigest,DTO.references.actionDigest);
        stage=4; return ok(DTO.workerCreate);
      }
      if (method === 'v1/workerExecute') {
        assert.equal(stage,4); cas(payload,['actionRef','claimRef','generationRef','actionDigest','contextRecordRef']);
        for (const [key,name] of [['actionRef','action'],['claimRef','claim'],['generationRef','generation'],['actionDigest','actionDigest'],['contextRecordRef','contextRecord']]) assert.equal(payload[key],DTO.references[name]);
        executionCount++; assert.equal(executionCount,1);
        enteredExecute={commandRef:payload.commandRef,taskRef:payload.taskRef,signal}; executeEntered.resolve(enteredExecute);
        if (caseId === 'EP04') { executeReply.resolve(ok(DTO.workerExecuteUnknown)); return await executeReply.promise; }
        assert.notEqual(caseId,'EP03','EP03 must never enter execute transport');
        // Deliberately ignore abort while the finite lost reply barrier is pending.
        return await executeReply.promise;
      }
      if (method === 'v1/workerQuery') {
        exactKeys(payload,['taskRef','actionRef','claimRef','generationRef']);
        assert.deepEqual(payload,{taskRef:DTO.references.taskA,actionRef:DTO.references.action,claimRef:DTO.references.claim,generationRef:DTO.references.generation});
        return ok(DTO.workerQueryReady); // Existence only; no execution-absence/receipt field.
      }
      throw new Error('UNIT_ONLY_UNDECLARED_ROUTE');
    },
  });
  return Object.freeze({
    rpc, executeEntered, executeReply,
    get enteredExecute() { return enteredExecute; },
    counts:() => Object.freeze({...counters}), trace:() => [...trace], commands:() => [...commandRefs],
    holdNextStatus() {
      assert.equal(holdStatus,null); const hold={entered:deferred(`${caseId}:status-entered`),reply:deferred(`${caseId}:status-reply`)};
      barriers.push(hold.entered,hold.reply); holdStatus=hold; return Object.freeze(hold);
    },
    currentStatus:taskRef => ok(status(taskRef)),
    close() { for (const barrier of barriers) barrier.close(); holdStatus=null; },
    barrierInventory:() => barriers.map(b => ({label:b.label,settled:b.settled,releases:b.releases})),
  });
}
