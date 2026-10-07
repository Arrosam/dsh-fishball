// SOURCE fixture only: import/DB/test execution requires a separate root lease.
// Genuine original6 writers only. No SQL/private row edits, tamper, native or provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RuntimeStore as Original6 } from '../original/runtime-store.mjs';
import { MemoryAdapter as OriginalMemory } from '../original/memory.mjs';
import { ContextAssembler as OriginalAssembler } from '../original/context.mjs';
import { RuntimeStore,reference,assertPreparationSourceBinding } from '../src/runtime-store.mjs';
import { ContextAssembler,assertAssemblerPreparationBinding } from '../src/context.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { normalizedSpec,canonicalDigest } from '../src/runtime-security.mjs';
const scope={ownerId:'schema7-fixture-owner',workspaceId:'schema7-fixture-workspace'};
const key=Buffer.alloc(32,47),namespaceRef=reference('schema7-fixture-memory');
const principals=()=>{const owner={},coordinator={},host={};return{owner,coordinator,host,entries:[{handle:owner,role:'owner',scope},{handle:coordinator,role:'coordinator',scope},{handle:host,role:'host',scope}]};};
const error=code=>e=>e?.code===code;
function options(databasePath,p){return{databasePath,encryptionKey:key,principals:p.entries,clock:()=>1000};}
function input(task,command){return{taskRef:task.taskRef,commandRef:reference(command),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,terms:[],now:1000};}
function installMemory(store,p,capability,tokenize,onPreparedCommit){const assembler=new ContextAssembler({store,tokenize,clock:()=>1000,preparationBinding:{capability,handle:p.coordinator}});return new MemoryAdapter({store,handle:p.coordinator,namespaceRef,contextAssembler:assembler,tokenize,preparationCapability:capability,...(onPreparedCommit?{onPreparedCommit}:{})});}

test('genuine6 migration preserves backup and old generic prepared context; new warm/cold preparation replays before tokenizer',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'df-schema7-core-')),databasePath=join(directory,'ledger.sqlite');
  let old,current;
  try{
    const p6=principals();old=new Original6(options(databasePath,p6));
    let task=old.intake(p6.owner,{taskId:'fixture-task',provider:'fixture',source:'fixture',eventId:'one',commandRef:reference('fixture-intake'),goal:'Complete the bounded source fixture.'}).task;
    const oldMemory=new OriginalMemory({store:old,handle:p6.coordinator,namespaceRef,contextAssembler:new OriginalAssembler({store:old,tokenize:t=>Buffer.byteLength(t),clock:()=>1000}),tokenize:t=>Buffer.byteLength(t)});
    const oldPrepared=await oldMemory.prepareExecutionContext(input(task,'old-generic-preparation'));
    task=old.task(p6.owner,task.taskRef);const oldBody=old.readData(p6.owner,{taskRef:task.taskRef,recordRef:oldPrepared.recordRef});
    old.close();old=null;const originalBytes=readFileSync(databasePath);
    const p7=principals(),capability={};current=new RuntimeStore({...options(databasePath,p7),preparationPrincipals:[{capability,ownerHandle:p7.owner,namespaceRef}]});
    assert.equal(current.diagnostics().schemaVersion,7);
    assert.deepEqual(readFileSync(databasePath+'.schema-6.backup'),originalBytes);
    assert.deepEqual(current.readData(p7.owner,{taskRef:task.taskRef,recordRef:oldPrepared.recordRef}),oldBody);
    assert.throws(()=>current.readPreparedContextCheck(p7.owner,{taskRef:task.taskRef,contextRecordRef:oldPrepared.recordRef,expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch}),error('PREPARED_CONTEXT_UNAVAILABLE'));
    let tokenCalls=0,newEvents=0;const memory=installMemory(current,p7,capability,t=>{tokenCalls++;return Buffer.byteLength(t);},event=>{assert.equal(event.commitDisposition,'new');newEvents++;});
    const request=input(task,'new-protected-preparation'),prepared=await memory.prepareExecutionContext(request),calls=tokenCalls;
    assert.ok(calls>0);assert.equal(newEvents,1);
    assert.deepEqual(await memory.prepareExecutionContext(request),prepared);assert.equal(tokenCalls,calls);assert.equal(newEvents,1);
    const checked=current.readPreparedContextCheck(p7.owner,{taskRef:task.taskRef,contextRecordRef:prepared.recordRef,expectedTaskVersion:prepared.task.version,expectedAuthEpoch:prepared.task.authEpoch});
    assert.equal(checked.check.contextDigest,prepared.digest);assert.equal(checked.currentness.instructionsCurrent,true);assert.equal(checked.currentness.memoryCurrent,true);assert.equal(checked.currentness.taskSnapshotCurrent,true);
    const beforeRead=readFileSync(databasePath),q={taskRef:task.taskRef,actionRef:reference('unacknowledged-action'),claimRef:reference('unacknowledged-claim'),generationRef:reference('unacknowledged-generation'),executionRef:reference('unacknowledged-execution'),commandRef:reference('unacknowledged-finish'),expectedTaskVersion:1,expectedAuthEpoch:0};
    assert.equal(current.readNormalNativeFinish(p7.owner,q),null);assert.deepEqual(readFileSync(databasePath),beforeRead);
    assert.throws(()=>current.preparedContextCommandReceipt({}, {request}),error('UNAUTHORIZED'));
    assert.throws(()=>current.preparedContextCommandReceipt(capability,{request:{...request,now:1001}}),error('IDEMPOTENCY_CONFLICT'));
    current.close();current=null;
    const pCold=principals(),coldCapability={};current=new RuntimeStore({...options(databasePath,pCold),preparationPrincipals:[{capability:coldCapability,ownerHandle:pCold.owner,namespaceRef}]});
    const coldMemory=installMemory(current,pCold,coldCapability,()=>{throw new Error('historical replay called tokenizer');},()=>{throw new Error('historical replay called observer');});
    assert.deepEqual(await coldMemory.prepareExecutionContext(request),prepared);current.close();current=null;
    const beforeOld=readFileSync(databasePath);assert.throws(()=>new Original6(options(databasePath,principals())),error('SCHEMA_FUTURE'));assert.deepEqual(readFileSync(databasePath),beforeOld);
  }finally{old?.close();current?.close();rmSync(directory,{recursive:true,force:true});}
});

test('genuine6 pending generic claim stays unknown/charged; cold normal absence cannot adopt or finish it',()=>{
  const directory=mkdtempSync(join(tmpdir(),'df-schema7-hold-')),databasePath=join(directory,'ledger.sqlite');let old,current;
  try{
    const p6=principals();old=new Original6({...options(databasePath,p6),hostPermission:()=>true});const task=old.intake(p6.owner,{taskId:'hold-task',provider:'fixture',source:'fixture',eventId:'hold',commandRef:reference('hold-intake'),goal:'Retain the original accountable hold.'}).task;
    const model={version:1,presetRefs:[reference('generic-preset')],catalogEvidenceRef:reference('generic-catalog')},policy=old.policy(p6.owner,{commandRef:reference('hold-policy'),expectedVersion:1,limits:{maxActive:1},modelPolicy:model});
    const spec={actionRef:reference('hold-action'),kind:'write',role:'worker',targetDigest:reference('hold-target'),dataDigest:reference('hold-data'),units:1,charges:{runtimeMs:1000,usageUnits:10,costEstimateMicros:0,costState:'estimated',costProvenanceRef:reference('generic-cost')},attemptGroupRef:reference('hold-group'),attemptIndex:1,resourcePolicyVersion:policy.version,modelPolicyVersion:1,model:{presetRef:reference('generic-preset'),modelRef:reference('generic-model'),reasoningRef:reference('generic-reasoning'),catalogEvidenceRef:model.catalogEvidenceRef},executor:{mode:'none',generationRef:reference('hold-generation'),environmentRef:reference('hold-environment'),bindingDigest:reference('hold-binding'),toolsDigest:reference('hold-tools'),permissionPolicyDigest:reference('hold-permission')}};
    const action=old.planAction(p6.owner,{taskRef:task.taskRef,commandRef:reference('hold-plan'),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,spec}),grant=old.grantAction(p6.owner,{taskRef:task.taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,commandRef:reference('hold-grant'),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,expiresAt:2000});
    const claim=old.claimAction(p6.host,{taskRef:task.taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,commandRef:reference('hold-claim'),expectedTaskVersion:grant.taskVersion,expectedAuthEpoch:grant.authEpoch});old.close();old=null;
    const p7=principals();current=new RuntimeStore(options(databasePath,p7));const snap=current.snapshot(p7.owner,{taskRef:task.taskRef}),held=snap.actions.find(a=>a.actionRef===action.actionRef);
    assert.equal(held.state,'unknown');assert.equal(held.usageState,'unknown');assert.equal(held.releaseEvidenceRef,null);assert.equal(held.claimRef,claim.claimRef);
    const q={taskRef:task.taskRef,actionRef:action.actionRef,claimRef:claim.claimRef,generationRef:claim.generationRef,executionRef:reference('never-admitted-execution'),commandRef:reference('cold-hold-finish'),expectedTaskVersion:1,expectedAuthEpoch:0},before=readFileSync(databasePath);
    assert.equal(current.readNormalNativeFinish(p7.owner,q),null);assert.deepEqual(readFileSync(databasePath),before);assert.equal(current.snapshot(p7.owner,{taskRef:task.taskRef}).actions.find(a=>a.actionRef===action.actionRef).releaseEvidenceRef,null);
    const marked={...spec,executor:{...spec.executor,mode:'create',sessionRef:reference('marked-session')},nativeOriginBinding:{sourceRef:reference('marked-source'),createConfigDigest:reference('marked-config'),backendRef:reference('marked-backend'),sessionRef:reference('marked-session')}};
    assert.equal(normalizedSpec(marked).nativeOriginBinding.sourceRef,marked.nativeOriginBinding.sourceRef);
    assert.throws(()=>current.planAction(p7.owner,{taskRef:task.taskRef,commandRef:reference('generic-marked-plan'),expectedTaskVersion:snap.task.version,expectedAuthEpoch:snap.task.authEpoch,spec:marked}),error('UNAUTHORIZED'));
  }finally{old?.close();current?.close();rmSync(directory,{recursive:true,force:true});}
});

test('closed source brands reject fake, cloned and foreign bindings without invoking fake methods',()=>{
  let calls=0;const fake={snapshot(){calls++;},task(){calls++;},readData(){calls++;}};
  assert.throws(()=>assertPreparationSourceBinding(fake,{},{}),error('UNAUTHORIZED'));
  assert.throws(()=>assertAssemblerPreparationBinding({assembleForPreparation(){calls++;}},fake,{},{}),error('CONTEXT_SCOPE'));
  assert.equal(calls,0);
  assert.throws(()=>normalizedSpec({}),error('INVALID_INPUT'));
  assert.equal(canonicalDigest({commandRef:reference('kind-recipe'),kind:'native_identity'}).length,64);
});
