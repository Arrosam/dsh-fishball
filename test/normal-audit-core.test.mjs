// Originally authored under the NI3 static-only lease; root subsequently
// released the promoted schema5 author test lease. Trusted-store fixtures
// they do not establish an installed private native collector or review quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RuntimeStore, reference as r, canonicalDigest as d} from '../src/runtime-store.mjs';
import {ContextAssembler} from '../src/context.mjs';
import {SCHEMA_VERSION} from '../src/ledger.mjs';

const scope={ownerId:'ni3-synthetic-owner',workspaceId:'ni3-synthetic-workspace'};
let sequence=0;
const command=()=>r('ni3-command-'+ ++sequence);
const rejects=(code,fn)=>assert.throws(fn,error=>error.code===code&&error.message===code);

function fixture(options={}){
  const owner={},host={},worker={},advancedReviewer={};
  const config={databasePath:join(mkdtempSync(join(tmpdir(),'df-ni3-author-')),'ledger.db'),encryptionKey:Buffer.alloc(32,57),clock:()=>1000,hostPermission:()=>true,auditExecutionBounds:{inputByteLimit:65536,resultByteLimit:65536},principals:[
    {handle:owner,role:'owner',scope},{handle:host,role:'host',scope},
    {handle:worker,role:'worker',scope,taskRef:r('task'),generationRef:r('unrelated-worker'),sessionRef:r('unrelated-session')},
    {handle:advancedReviewer,role:'reviewer',scope,taskRef:r('task'),generationRef:r('unrelated-reviewer'),readRecordRefs:[]}
  ],...options};
  const store=new RuntimeStore(config);
  store.policy(owner,{commandRef:command(),expectedVersion:1,limits:{maxActive:1,maxTotalAttempts:16},modelPolicy:{version:1,presetRefs:[r('mock-preset')],catalogEvidenceRef:r('mock-catalog')}});
  const task=store.intake(owner,{taskId:'task',provider:'fixture',source:'fixture',eventId:'fixture-event',goal:'synthetic protected goal',commandRef:command()}).task;
  const artifact=store.writeArtifact(owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,artifactRef:r('artifact'),version:1,content:'synthetic artifact'});
  const goal=store.listData(owner,{taskRef:task.taskRef,kind:'goal'})[0],current=artifact.task;
  // Structural protected-context fixture only. Installed NI3 must additionally
  // require its actual current-lifetime MemoryAdapter preparation receipt.
  const text='synthetic protected goal',body={contractVersion:'df.execution-context/v1',materialKind:'execution_context',sourceScope:{ownerRef:task.ownerRef,workspaceRef:task.workspaceRef,taskRef:task.taskRef},sourceTaskVersion:current.version,sourceAuthEpoch:current.authEpoch,generatedAt:1000,sourceRefs:[goal.recordRef],sourceProvenance:[{recordRef:goal.recordRef,digest:goal.digest,taskVersion:goal.taskVersion,authEpoch:goal.authEpoch,createdAt:goal.createdAt}],ledgerSnapshotDigest:r('mock-snapshot'),content:text,inputCounts:{bytes:Buffer.byteLength(text),tokens:4},retainedRefs:[goal.recordRef],droppedRefs:[],verification:'module_prepared_execution_context_only'};
  const context=store.putData(owner,{taskRef:task.taskRef,commandRef:command(),kind:'context',content:JSON.stringify(body),sourceRef:r('mock-preparation'),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch});
  const requirement=store.configureAudit(owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:context.task.version,expectedAuthEpoch:context.task.authEpoch,auditRef:r('audit'),expectedAuditRevision:0,artifactRef:artifact.artifactRef,artifactVersion:artifact.version,digest:artifact.digest,material:[{recordRef:artifact.recordRef,digest:artifact.digest},{recordRef:context.recordRef,digest:context.digest}],contextRecordRef:context.recordRef,policyRef:r('explicit-audit-policy'),blockingSeverities:['blocking'],maxRepairRounds:2});
  return{store,config,owner,host,worker,advancedReviewer,task:requirement.task,artifact,context,requirement};
}
function prepare(x,purpose='audit_review',extra={}){
  const task=x.store.task(x.owner,x.task.taskRef);
  return x.store.prepareAuditInput(x.owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,auditRef:x.requirement.auditRef,expectedAuditRevision:x.requirement.auditRevision,purpose,round:purpose==='audit_review'?x.requirement.round:x.requirement.round+1,...extra});
}
function spec(x,input,kind='review'){
  const policy=x.store.getPolicy(x.owner);
  return{actionRef:command(),kind,role:kind,targetDigest:input.bindingDigest,dataDigest:x.artifact.digest,units:1,charges:{runtimeMs:100,usageUnits:100000,costState:'estimated',costEstimateMicros:0,costProvenanceRef:r('mock-source-zero-cost')},attemptGroupRef:command(),attemptIndex:1,resourcePolicyVersion:policy.version,modelPolicyVersion:policy.modelPolicy.version,model:{presetRef:r('mock-preset'),modelRef:r('mock-'+kind),reasoningRef:r('mock-reasoning'),catalogEvidenceRef:r('mock-catalog')},executor:{mode:'create',generationRef:command(),sessionRef:command(),environmentRef:r('mock-environment'),bindingDigest:r('mock-binding'),toolsDigest:r('empty-tools'),permissionPolicyDigest:r('mock-permission')},executionInput:{recordRef:input.recordRef,digest:input.digest,purpose:input.purpose,auditRef:input.auditRef,bindingDigest:input.bindingDigest,materialDigest:input.materialDigest,...(kind==='repair'?{previousReportRef:input.previousReportRef}:{})}};
}
function claim(x,input,action=spec(x,input),auditRepair){
  const task=x.store.task(x.owner,x.task.taskRef),planned=x.store.planAction(x.owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,spec:action});
  const grant=x.store.grantAction(x.owner,{taskRef:task.taskRef,actionRef:planned.actionRef,actionDigest:planned.actionDigest,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,expiresAt:2000});
  const result=x.store.claimAction(x.host,{taskRef:task.taskRef,actionRef:planned.actionRef,actionDigest:planned.actionDigest,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:grant.authEpoch,...(auditRepair?{auditRepair}:{})});
  x.store.workerObservation(x.host,{taskRef:task.taskRef,claimRef:result.claimRef,generationRef:result.generationRef,sessionRef:action.executor.sessionRef,commandRef:command(),phase:'created',cursor:0,evidenceRef:r('mock-created')});
  return{...result,sessionRef:action.executor.sessionRef};
}
function begin(x,input,held){
  const task=x.store.task(x.owner,x.task.taskRef),reviewer={};
  x.store.bindAuditReviewer(x.host,reviewer,{taskRef:task.taskRef,auditRef:input.auditRef,claimRef:held.claimRef,generationRef:held.generationRef,sessionRef:held.sessionRef});
  const execution=x.store.beginAuditExecution(x.host,{taskRef:task.taskRef,actionRef:held.actionRef,actionDigest:held.actionDigest,claimRef:held.claimRef,generationRef:held.generationRef,inputRecordRef:input.recordRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch});
  const consume={taskRef:task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,actionDigest:held.actionDigest,executionRef:execution.executionRef};
  assert.equal(x.store.assertExecutionCurrent(x.host,consume).admitted,true);
  return{reviewer,execution,consume};
}
function capture(x,input,held,execution,change={}){
  const response={contractVersion:'df.audit-response/v1',bindingDigest:input.bindingDigest,materialDigest:input.materialDigest,inputDigest:input.digest,verdict:'passed',coverageRefs:x.requirement.material.map(m=>m.recordRef),unexaminedRefs:[],findings:[],...change};
  return x.store.captureAuditResult(x.host,{taskRef:x.task.taskRef,commandRef:command(),claimRef:held.claimRef,generationRef:held.generationRef,executionRef:execution.executionRef,sessionRef:held.sessionRef,inputCursor:1,cursor:2,content:JSON.stringify(response),evidenceRef:r('mock-actual-output')});
}
function submit(x,flow,result){return x.store.submitAuditResult(flow.reviewer,{taskRef:x.task.taskRef,commandRef:command(),auditRef:x.requirement.auditRef,executionRef:flow.execution.executionRef,resultRef:result.resultRef});}

test('audit preparation preserves semantic/task versions, includes all immutable material, and replays without new data',()=>{
  const x=fixture(),task=x.store.task(x.owner,x.task.taskRef),before=x.store.snapshot(x.owner,{taskRef:task.taskRef}),input=prepare(x);
  assert.equal(input.task.version,task.version);assert.equal(x.store.snapshot(x.owner,{taskRef:task.taskRef}).semanticRevision,before.semanticRevision);
  const envelope=JSON.parse(x.store.readData(x.owner,{taskRef:task.taskRef,recordRef:input.recordRef}).content);
  assert.equal(envelope.artifact.digest,x.artifact.digest);assert.equal(envelope.contextDigest,x.context.digest);assert.equal(envelope.material.length,2);assert.notEqual(input.digest,x.artifact.digest);
  rejects('UNAUTHORIZED',()=>x.store.readData(x.worker,{taskRef:task.taskRef,recordRef:input.recordRef}));x.store.close();
});
test('no constructor audit bounds permits no preparation and creates no input/receipt',()=>{
  const x=fixture({auditExecutionBounds:undefined}),before=x.store.snapshot(x.owner,{taskRef:x.task.taskRef});
  rejects('AUDIT_EXECUTION_UNAVAILABLE',()=>prepare(x));assert.deepEqual(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),before);x.store.close();
});
test('approved artifact and full native input remain separate, one consume admits and duplicates cannot wake up',()=>{
  const x=fixture(),input=prepare(x),held=claim(x,input),flow=begin(x,input,held);
  assert.equal(flow.execution.dataDigest,x.artifact.digest);assert.equal(flow.execution.inputDigest,input.digest);assert.equal(x.store.assertExecutionCurrent(x.host,flow.consume).admitted,false);
  assert.equal(x.store.assertNativeRequestCurrent(x.host,flow.consume).inputDigest,input.digest);x.store.close();
  const reopened=new RuntimeStore(x.config);assert.equal(reopened.assertExecutionCurrent(x.host,flow.consume).admitted,false);assert.equal(reopened.snapshot(x.owner,{taskRef:x.task.taskRef}).executions[0].state,'unknown');assert.equal(reopened.snapshot(x.owner,{taskRef:x.task.taskRef}).actions[0].releaseEvidenceRef,null);reopened.close();
});
test('actual captured JSON atomically commits report and source-bound artifact verification',()=>{
  const x=fixture(),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),result=capture(x,input,held,flow.execution),answer=submit(x,flow,result);
  assert.equal(answer.report.state,'passed');assert.equal(answer.verification.verdict,'accepted');assert.equal(answer.verification.resultRef,result.resultRef);
  assert.equal(x.store.artifact(x.owner,{taskRef:x.task.taskRef,artifactRef:x.artifact.artifactRef}).verification.reportRef,answer.report.reportRef);
  rejects('AUDIT_RESULT_REQUIRED',()=>x.store.verifyArtifact(flow.reviewer,{taskRef:x.task.taskRef,commandRef:command(),artifactRef:x.artifact.artifactRef,version:1,digest:x.artifact.digest,verdict:'accepted',evidenceRef:r('forged-proof')}));
  x.store.close();const reopened=new RuntimeStore(x.config);assert.equal(reopened.artifact(x.owner,{taskRef:x.task.taskRef,artifactRef:x.artifact.artifactRef}).verification.resultRef,result.resultRef);reopened.close();
});
test('raw owner/native-looking output and an advanced reviewer cannot submit a normal report',()=>{
  const x=fixture(),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),result=capture(x,input,held,flow.execution);
  rejects('UNAUTHORIZED',()=>x.store.submitAuditResult(x.owner,{taskRef:x.task.taskRef,commandRef:command(),auditRef:x.requirement.auditRef,executionRef:flow.execution.executionRef,resultRef:result.resultRef}));
  rejects('UNAUTHORIZED',()=>x.store.submitAuditResult(x.advancedReviewer,{taskRef:x.task.taskRef,commandRef:command(),auditRef:x.requirement.auditRef,executionRef:flow.execution.executionRef,resultRef:result.resultRef}));
  assert.equal(x.store.audit(x.owner,{taskRef:x.task.taskRef,auditRef:x.requirement.auditRef}).state,'pending');x.store.close();
});
test('coverage, unknown, budget and fatal findings produce truthful nonaccepted verification',()=>{
  for(const partition of ['unknown','budget_exhausted','partial','fatal']){
    const x=fixture(),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),change=partition==='partial'?{coverageRefs:[x.requirement.material[0].recordRef],unexaminedRefs:[x.requirement.material[1].recordRef]}:partition==='fatal'?{findings:[{findingRef:r('fatal'),severity:'fatal',code:'permission_bypass',evidenceRef:r('finding-proof'),resolved:true}]}:{verdict:partition};
    const result=capture(x,input,held,flow.execution,change),answer=submit(x,flow,result);
    assert.notEqual(answer.report.state,'passed');assert.equal(answer.verification.verdict,partition==='fatal'?'rejected':'unknown');x.store.close();
  }
});
test('prose, extra response fields, wrong digest and incomplete partitions cannot certify',()=>{
  for(const invalid of ['prose','extra','digest','partition']){
    const x=fixture(),input=prepare(x),held=claim(x,input),flow=begin(x,input,held);
    const response={contractVersion:'df.audit-response/v1',bindingDigest:input.bindingDigest,materialDigest:input.materialDigest,inputDigest:invalid==='digest'?r('wrong-input'):input.digest,verdict:'passed',coverageRefs:invalid==='partition'?[]:x.requirement.material.map(m=>m.recordRef),unexaminedRefs:[],findings:[],...(invalid==='extra'?{approved:true}:{})};
    const result=x.store.captureAuditResult(x.host,{taskRef:x.task.taskRef,commandRef:command(),claimRef:held.claimRef,generationRef:held.generationRef,executionRef:flow.execution.executionRef,sessionRef:held.sessionRef,inputCursor:1,cursor:2,content:invalid==='prose'?'passed':JSON.stringify(response),evidenceRef:r('output')});
    rejects(invalid==='partition'?'AUDIT_BINDING_MISMATCH':'AUDIT_RESPONSE_INVALID',()=>submit(x,flow,result));assert.equal(x.store.audit(x.owner,{taskRef:x.task.taskRef,auditRef:x.requirement.auditRef}).state,'pending');assert.equal(x.store.artifact(x.owner,{taskRef:x.task.taskRef,artifactRef:x.artifact.artifactRef}).verification,null);x.store.close();
  }
});
test('revoke after consume can retain late output but cannot certify or erase held reservations',()=>{
  const x=fixture(),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),current=x.store.task(x.owner,x.task.taskRef);
  x.store.revokeAction(x.owner,{taskRef:x.task.taskRef,commandRef:command(),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch,actionRef:held.actionRef,actionDigest:held.actionDigest});
  const result=capture(x,input,held,flow.execution);rejects('UNAUTHORIZED',()=>submit(x,flow,result));assert.equal(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}).actions[0].releaseEvidenceRef,null);x.store.close();
});
test('selected result byte cap, Unicode and registered secrets reject before any capture association',()=>{
  const x=fixture({auditExecutionBounds:{inputByteLimit:65536,resultByteLimit:16},forbiddenSecrets:['NI3_CANARY']}),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),base={taskRef:x.task.taskRef,commandRef:command(),claimRef:held.claimRef,generationRef:held.generationRef,executionRef:flow.execution.executionRef,sessionRef:held.sessionRef,inputCursor:1,cursor:2,evidenceRef:r('proof')};
  for(const [content,code] of [['x'.repeat(17),'INPUT_TOO_LARGE'],[String.fromCharCode(0xd800),'INVALID_INPUT'],['NI3_CANARY','SECRET_REJECTED']])rejects(code,()=>x.store.captureAuditResult(x.host,{...base,content}));
  assert.equal(x.store.listData(x.owner,{taskRef:x.task.taskRef,kind:'verification'}).length,0);x.store.close();
  for(const file of readdirSync(join(x.config.databasePath,'..')))assert(!readFileSync(join(x.config.databasePath,'..',file)).includes(Buffer.from('NI3_CANARY')));
});
test('before-commit captured-output fault rolls back data, inverse marker and acknowledgement',()=>{
  let armed=false;
  const x=fixture({fixtureMode:true,fixtureFaults:()=>{if(armed)throw Error('fixture-cut');}}),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),before=x.store.snapshot(x.owner,{taskRef:x.task.taskRef});
  armed=true;rejects('FIXTURE_CUT',()=>capture(x,input,held,flow.execution));armed=false;
  assert.deepEqual(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),before);assert.equal(x.store.listData(x.owner,{taskRef:x.task.taskRef,kind:'verification'}).length,0);x.store.close();
});
test('derived audit inputs remain ledger-visible but are excluded before ordinary context reads',async()=>{
  const x=fixture(),input=prepare(x),original=x.store.readData.bind(x.store),reads=[];
  assert.equal(x.store.listData(x.owner,{taskRef:x.task.taskRef}).find(item=>item.recordRef===input.recordRef).auditInputRef,input.recordRef);
  const facade={task:x.store.task.bind(x.store),snapshot:x.store.snapshot.bind(x.store),readData(handle,request){reads.push(request.recordRef);return original(handle,request);}};
  const assembler=new ContextAssembler({store:facade,tokenize:text=>Math.ceil(Buffer.byteLength(text)/4),clock:()=>1000}),current=x.store.task(x.owner,x.task.taskRef);
  const assembled=await assembler.assemble(x.owner,{taskRef:current.taskRef,expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch});
  assert(!reads.includes(input.recordRef));assert(assembled.text.includes('synthetic protected goal'));
  await assert.rejects(assembler.assemble(x.owner,{taskRef:current.taskRef,expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch,recordRefs:[input.recordRef]}),error=>error.code==='SOURCE_UNAVAILABLE');
  x.store.close();
});
test('repair requires atomic bounded prior-report lineage before idle native preparation or consume',()=>{
  const x=fixture(),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),result=capture(x,input,held,flow.execution,{verdict:'failed'}),answer=submit(x,flow,result);
  x.store.workerObservation(x.host,{taskRef:x.task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,commandRef:command(),phase:'stopped',evidenceRef:r('review-stopped')});
  const settled=x.store.settleAction(x.host,{taskRef:x.task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,commandRef:command(),outcome:'completed',evidenceRef:r('review-effect-settled'),terminalEvidenceRef:r('review-stopped'),usage:{state:'actual',units:100}});
  assert.equal(settled.reservationHeld,false);
  rejects('UNAUTHORIZED',()=>x.store.context(flow.reviewer,x.task.taskRef));
  const repairInput={...prepare(x,'audit_repair',{previousReportRef:answer.report.reportRef}),previousReportRef:answer.report.reportRef},repair=spec(x,repairInput,'repair'),current=x.store.task(x.owner,x.task.taskRef);
  const planned=x.store.planAction(x.owner,{taskRef:x.task.taskRef,commandRef:command(),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch,spec:repair});
  const grant=x.store.grantAction(x.owner,{taskRef:x.task.taskRef,commandRef:command(),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch,actionRef:planned.actionRef,actionDigest:planned.actionDigest,expiresAt:2000});
  const request={taskRef:x.task.taskRef,commandRef:command(),expectedTaskVersion:current.version,expectedAuthEpoch:grant.authEpoch,actionRef:planned.actionRef,actionDigest:planned.actionDigest};
  const before=x.store.snapshot(x.owner,{taskRef:x.task.taskRef});
  rejects('AUDIT_BINDING_MISMATCH',()=>x.store.claimAction(x.host,request));assert.deepEqual(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),before);
  const accepted=x.store.claimAction(x.host,{...request,commandRef:command(),auditRepair:{auditRef:x.requirement.auditRef,round:1,previousReportRef:answer.report.reportRef,evidenceRef:r('explicit-repair-lineage')}});
  assert.equal(x.store.audit(x.owner,{taskRef:x.task.taskRef,auditRef:x.requirement.auditRef}).pendingRepair.claimRef,accepted.claimRef);
  x.store.workerObservation(x.host,{taskRef:x.task.taskRef,claimRef:accepted.claimRef,generationRef:accepted.generationRef,sessionRef:repair.executor.sessionRef,commandRef:command(),phase:'created',evidenceRef:r('repair-created')});
  const now=x.store.task(x.owner,x.task.taskRef),execution=x.store.beginAuditExecution(x.host,{taskRef:x.task.taskRef,actionRef:accepted.actionRef,actionDigest:accepted.actionDigest,claimRef:accepted.claimRef,generationRef:accepted.generationRef,inputRecordRef:repairInput.recordRef,commandRef:command(),expectedTaskVersion:now.version,expectedAuthEpoch:now.authEpoch});
  assert.equal(x.store.assertExecutionCurrent(x.host,{taskRef:x.task.taskRef,claimRef:accepted.claimRef,generationRef:accepted.generationRef,actionDigest:accepted.actionDigest,executionRef:execution.executionRef}).admitted,true);x.store.close();
});
test('claim refuses when admitted audit output could exhaust the last data slot',()=>{
  const x=fixture({limits:{maxRecordsPerTask:4}}),input=prepare(x);
  rejects('RECORD_LIMIT',()=>claim(x,input));
  const snapshot=x.store.snapshot(x.owner,{taskRef:x.task.taskRef});
  assert.equal(snapshot.workers.length,0);assert.equal(snapshot.actions[0].attempts,0);assert.equal(snapshot.actions[0].state,'requested');x.store.close();
});

// Genuine source4 is the exact supported keyed-receipt writer preserved by the
// root promotion preflight. Neither these fixtures nor their version headers
// are produced by the new schema5 writer or relabeled with SQL.
const oldSource=new URL('./fixtures/authentic-schema4/',import.meta.url);
const currentSource=new URL('../src/runtime-store.mjs',import.meta.url).href;
let oldModules;
async function genuine4(){
  if(!oldModules){
    const hold=JSON.parse(readFileSync(new URL('source-hold.json',oldSource),'utf8'));
    assert.equal(hold.schemaVersion,4);
    for(const file of hold.files){
      // Preserve the original manifest's origin mapping and all five bytes.
      // Its historical .runtime path remains provenance, not a fixture read.
      const bytes=readFileSync(new URL(file.origin,oldSource));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    }
    oldModules={...await import(new URL('src/runtime-store.mjs',oldSource)),...await import(new URL('src/foundation.mjs',oldSource))};
  }
  return oldModules;
}
function sqlSnapshot(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return {version:db.prepare('PRAGMA user_version').get().user_version,tables:Object.fromEntries(tables.map(({name})=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]))};
  }finally{db.close();}
}
// Schema6/7 migration intentionally appends one empty sealed registry row per
// authenticated scope (initializeMigration). Every genuine source row must remain
// byte-identical and in order; the only additions are exactly these registries.
const MIGRATION_REGISTRIES=['normal_provenance_registry','prepared_context_registry','normal_native_registry'];
function assertMigratedTables(tables,source){
  const added=tables.automation_records.filter(row=>MIGRATION_REGISTRIES.includes(row.kind));
  assert.deepEqual({...tables,automation_records:tables.automation_records.filter(row=>!MIGRATION_REGISTRIES.includes(row.kind))},source);
  const scopes=[...new Map(source.runtime_commands.map(row=>[row.owner+row.workspace,row])).values()];
  assert.equal(scopes.length,1);
  assert.deepEqual(added.map(row=>[row.kind,row.owner,row.workspace,row.id,row.task]),MIGRATION_REGISTRIES.map(kind=>[kind,scopes[0].owner,scopes[0].workspace,scopes[0].workspace,null]));
  for(const row of added){const data=JSON.parse(row.payload).data;for(const key of Object.keys(data).filter(key=>key.endsWith('Count')))assert.equal(data[key],0,row.kind+'.'+key);}
}
async function seedGenuine4(){
  const Old=await genuine4(),directory=mkdtempSync(join(tmpdir(),'df-ni3-genuine4-')),owner={},host={};
  const config={databasePath:join(directory,'ledger.db'),encryptionKey:Buffer.alloc(32,57),clock:()=>1000,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope},{handle:host,role:'host',scope}]};
  const store=new Old.RuntimeStore(config);
  store.policy(owner,{commandRef:command(),expectedVersion:1,limits:{maxActive:1,maxTotalAttempts:16},modelPolicy:{version:1,presetRefs:[r('mock-preset')],catalogEvidenceRef:r('mock-catalog')}});
  const intakeInput={taskId:'genuine-task',provider:'fixture',source:'genuine-source',eventId:'genuine-event',goal:'acknowledged genuine4 encrypted goal',commandRef:command()};
  const intakeReceipt=store.intake(owner,intakeInput);
  const artifact=store.writeArtifact(owner,{taskRef:intakeReceipt.task.taskRef,commandRef:command(),expectedTaskVersion:intakeReceipt.task.version,expectedAuthEpoch:0,artifactRef:r('genuine-artifact'),version:1,content:'acknowledged genuine4 encrypted artifact'});
  const context=store.putData(owner,{taskRef:artifact.task.taskRef,commandRef:command(),expectedTaskVersion:artifact.task.version,expectedAuthEpoch:0,kind:'context',sourceRef:r('genuine-context-source'),content:'acknowledged genuine4 encrypted context'});
  const memoryInput={namespaceRef:r('genuine-memory'),commandRef:command(),expectedRevision:0,content:'acknowledged genuine4 memory revision one',sourceRefs:[r('genuine-memory-source')],requestDigest:r('genuine-memory-request')};
  const memoryReceipt=store.putMemory(owner,memoryInput);
  store.putMemory(owner,{...memoryInput,commandRef:command(),expectedRevision:1,content:'acknowledged genuine4 memory revision two',requestDigest:r('genuine-memory-request-two')});
  store.deleteMemory(owner,{namespaceRef:memoryInput.namespaceRef,commandRef:command(),expectedRevision:2,requestDigest:r('genuine-memory-delete')});
  const task=context.task;
  const action={actionRef:command(),kind:'write',role:'worker',targetDigest:r('genuine-target'),dataDigest:context.digest,units:1,charges:{runtimeMs:100,usageUnits:100000,costState:'estimated',costEstimateMicros:0,costProvenanceRef:r('mock-source-zero-cost')},attemptGroupRef:command(),attemptIndex:1,resourcePolicyVersion:2,modelPolicyVersion:1,model:{presetRef:r('mock-preset'),modelRef:r('mock-worker'),reasoningRef:r('mock-reasoning'),catalogEvidenceRef:r('mock-catalog')},executor:{mode:'create',generationRef:command(),sessionRef:command(),environmentRef:r('mock-environment'),bindingDigest:r('mock-binding'),toolsDigest:r('empty-tools'),permissionPolicyDigest:r('mock-permission')}};
  const plan=store.planAction(owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,spec:action});
  const grant=store.grantAction(owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,actionRef:plan.actionRef,actionDigest:plan.actionDigest,expiresAt:2000});
  const held=store.claimAction(host,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:grant.authEpoch,actionRef:plan.actionRef,actionDigest:plan.actionDigest});
  store.workerObservation(host,{taskRef:task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,sessionRef:action.executor.sessionRef,commandRef:command(),phase:'unknown',evidenceRef:r('genuine-unknown')});
  const snapshot=store.snapshot(owner,{taskRef:task.taskRef});store.close();
  const capability={},foundation=new Old.Foundation({databasePath:config.databasePath,clock:()=>1000,trustedOperators:[{scope,capability}]});
  const tombstoneInput={taskId:'genuine-tombstone',provider:'fixture',source:'genuine-tombstone-source',eventId:'genuine-tombstone-event'};
  const tombstone=foundation.intake(scope,tombstoneInput);
  foundation.deleteTask(capability,scope,tombstoneInput.taskId,{expectedVersion:tombstone.task.version});foundation.close();
  const sourceBytes=readFileSync(config.databasePath),rows=sqlSnapshot(config.databasePath);
  assert.equal(rows.version,4);assert.equal(rows.tables.reservations.length,1);
  return {Old,directory,config,owner,host,task,held,snapshot,intakeInput,intakeReceipt,memoryInput,memoryReceipt,tombstoneInput,sourceBytes,rows};
}

test('genuine supported4 migrates to5 with exact backup, ciphertext, signed historical receipts, grants and tombstone dedup preserved',async()=>{
  const x=await seedGenuine4(),store=new RuntimeStore(x.config),rows=sqlSnapshot(x.config.databasePath);
  assert.equal(rows.version,SCHEMA_VERSION);assert.deepEqual(readFileSync(x.config.databasePath+'.schema-4.backup'),x.sourceBytes);
  assertMigratedTables(rows.tables,x.rows.tables);
  assert.deepEqual(store.intake(x.owner,x.intakeInput),x.intakeReceipt);
  assert.deepEqual(store.memoryCommandReceipt(x.owner,{namespaceRef:x.memoryInput.namespaceRef,commandRef:x.memoryInput.commandRef,requestDigest:x.memoryInput.requestDigest}),x.memoryReceipt);
  assert.equal(store.getMemory(x.owner,{namespaceRef:x.memoryInput.namespaceRef}).deleted,true);
  assert.equal(store.readData(x.owner,{taskRef:x.task.taskRef,recordRef:store.listData(x.owner,{taskRef:x.task.taskRef,kind:'context'})[0].recordRef}).content,'acknowledged genuine4 encrypted context');
  const snapshot=store.snapshot(x.owner,{taskRef:x.task.taskRef});assert.equal(snapshot.actions[0].claimRef,x.held.claimRef);assert.equal(snapshot.actions[0].releaseEvidenceRef,null);assert.equal(snapshot.task.status,'recovery_required');store.close();
  const {Foundation}=await import('../src/foundation.mjs'),foundation=new Foundation({databasePath:x.config.databasePath,clock:()=>1000});
  const dedup=foundation.intake(scope,x.tombstoneInput);assert.equal(dedup.deduplicated,true);assert.equal(dedup.task.status,'deleted');foundation.close();
  const bytes=readFileSync(x.config.databasePath),entries=readdirSync(x.directory);
  rejects('SCHEMA_FUTURE',()=>new x.Old.RuntimeStore(x.config));assert.deepEqual(readFileSync(x.config.databasePath),bytes);assert.deepEqual(readdirSync(x.directory),entries);
});

test('genuine4 wrong-key rejection and exclusive backup collision preserve original store and existing backup',async()=>{
  for(const partition of ['key','collision']){
    const x=await seedGenuine4(),backup=x.config.databasePath+'.schema-4.backup';
    if(partition==='collision')writeFileSync(backup,'synthetic pre-existing backup');
    const entries=readdirSync(x.directory);
    rejects(partition==='key'?'KEY_MISMATCH':'STORAGE_UNAVAILABLE',()=>new RuntimeStore({...x.config,...(partition==='key'?{encryptionKey:Buffer.alloc(32,58)}:{})}));
    assert.deepEqual(readFileSync(x.config.databasePath),x.sourceBytes);assert.deepEqual(readdirSync(x.directory),entries);
    if(partition==='collision')assert.equal(readFileSync(backup,'utf8'),'synthetic pre-existing backup');
    else assert.equal(existsSync(backup),false);
    assert.deepEqual(sqlSnapshot(x.config.databasePath),x.rows);
  }
});

test('genuine4 migration fault rolls back source and leaves a byte-exact source4 recovery backup',async()=>{
  const x=await seedGenuine4();
  rejects('STORAGE_UNAVAILABLE',()=>new RuntimeStore({...x.config,fixtureMode:true,migrationFault:()=>{throw Error('bounded synthetic migration cut');}}));
  assert.deepEqual(readFileSync(x.config.databasePath),x.sourceBytes);assert.deepEqual(sqlSnapshot(x.config.databasePath),x.rows);
  assert.deepEqual(readFileSync(x.config.databasePath+'.schema-4.backup'),x.sourceBytes);
  const backupConfig={...x.config,databasePath:x.config.databasePath+'.schema-4.backup'},old=new x.Old.RuntimeStore(backupConfig);
  assert.deepEqual(old.intake(x.owner,x.intakeInput),x.intakeReceipt);old.close();
});

test('actual subprocess cuts before and after migration commit preserve genuine4 backup and supported reopening semantics',async()=>{
  for(const point of ['before','after']){
    const x=await seedGenuine4();
    const source=`import{DatabaseSync}from'node:sqlite';import{RuntimeStore}from${JSON.stringify(currentSource)};const exec=DatabaseSync.prototype.exec;let target=false;DatabaseSync.prototype.exec=function(sql){if(sql===${JSON.stringify(`PRAGMA user_version=${SCHEMA_VERSION}`)})target=true;if(target&&sql==='COMMIT'){if(${JSON.stringify(point)}==='before')process.exit(73);const result=exec.call(this,sql);process.exit(73);return result;}return exec.call(this,sql);};const owner={},host={};new RuntimeStore({databasePath:${JSON.stringify(x.config.databasePath)},encryptionKey:Buffer.alloc(32,57),clock:()=>1000,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}},{handle:host,role:'host',scope:${JSON.stringify(scope)}}]});`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});assert.equal(child.status,73,child.stderr);
    assert.deepEqual(readFileSync(x.config.databasePath+'.schema-4.backup'),x.sourceBytes);
    const observed=sqlSnapshot(x.config.databasePath);assert.equal(observed.version,point==='before'?4:SCHEMA_VERSION);if(point==='before')assert.deepEqual(observed.tables,x.rows.tables);else assertMigratedTables(observed.tables,x.rows.tables);
    if(point==='before'){const original=new x.Old.RuntimeStore(x.config);assert.deepEqual(original.intake(x.owner,x.intakeInput),x.intakeReceipt);original.close();}
    else{const reopened=new RuntimeStore(x.config);assert.equal(reopened.snapshot(x.owner,{taskRef:x.task.taskRef}).actions[0].releaseEvidenceRef,null);reopened.close();rejects('SCHEMA_FUTURE',()=>new x.Old.RuntimeStore(x.config));}
  }
});

test('genuine4 spilled DELETE journal validates copy first: wrong key preserves bytes, valid5 recovers acknowledged rows and migrates',async()=>{
  const x=await seedGenuine4(),oldURL=new URL('src/runtime-store.mjs',oldSource).href;
  const source=`import{DatabaseSync}from'node:sqlite';import{RuntimeStore,reference}from${JSON.stringify(oldURL)};const owner={};const store=new RuntimeStore({databasePath:${JSON.stringify(x.config.databasePath)},encryptionKey:Buffer.alloc(32,57),clock:()=>1000,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}}]});const exec=DatabaseSync.prototype.exec;let armed=true;DatabaseSync.prototype.exec=function(sql){if(armed&&sql==='BEGIN IMMEDIATE')exec.call(this,'PRAGMA cache_size=1');if(armed&&sql==='COMMIT')process.exit(74);return exec.call(this,sql);};store.intake(owner,{taskId:'unacknowledged-hot-task',provider:'fixture',source:'hot-source',eventId:'hot-event',commandRef:reference('hot-command'),goal:'synthetic-journal-content-'.repeat(2400)});`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});assert.equal(child.status,74,child.stderr);
  const path=x.config.databasePath,journal=path+'-journal';assert(existsSync(journal));
  const mainBytes=readFileSync(path),journalBytes=readFileSync(journal),entries=readdirSync(x.directory);
  assert.deepEqual(journalBytes.subarray(0,8),Buffer.from('d9d505f920a163d7','hex'));assert.notDeepEqual(mainBytes,x.sourceBytes);
  rejects('KEY_MISMATCH',()=>new RuntimeStore({...x.config,encryptionKey:Buffer.alloc(32,58)}));
  assert.deepEqual(readFileSync(path),mainBytes);assert.deepEqual(readFileSync(journal),journalBytes);assert.deepEqual(readdirSync(x.directory),entries);
  const copyPath=join(mkdtempSync(join(tmpdir(),'df-ni3-hot-oracle-')),'ledger.db');copyFileSync(path,copyPath);copyFileSync(journal,copyPath+'-journal');
  const copy=new x.Old.RuntimeStore({...x.config,databasePath:copyPath});copy.close();assert.deepEqual(sqlSnapshot(copyPath),x.rows);
  const restoredBytes=readFileSync(copyPath),store=new RuntimeStore(x.config);
  assert.deepEqual(readFileSync(path+'.schema-4.backup'),restoredBytes);assert.equal(existsSync(journal),false);
  assertMigratedTables(sqlSnapshot(path).tables,x.rows.tables);assert.equal(store.snapshot(x.owner,{taskRef:x.task.taskRef}).actions[0].releaseEvidenceRef,null);rejects('TASK_NOT_FOUND',()=>store.task(x.owner,r('unacknowledged-hot-task')));store.close();
});

test('two already-open independent processes race the same audit final consume: only one receives effect admission',async()=>{
  const x=fixture(),children=[];
  try{
    for(let i=0;i<2;i++){
      const source=`import{RuntimeStore}from${JSON.stringify(currentSource)};const host={};const store=new RuntimeStore({databasePath:${JSON.stringify(x.config.databasePath)},encryptionKey:Buffer.alloc(32,57),clock:()=>1000,hostPermission:()=>true,auditExecutionBounds:{inputByteLimit:65536,resultByteLimit:65536},principals:[{handle:host,role:'host',scope:${JSON.stringify(scope)}}]});process.send({ready:true});process.on('message',input=>{try{process.send({admitted:store.assertExecutionCurrent(host,input).admitted});}catch(error){process.send({error:error.code});}store.close();process.disconnect();});`;
      const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','ignore','pipe','ipc']});
      children.push({child,ready:new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);}),result:new Promise(resolve=>child.on('message',m=>{if(!m.ready)resolve(m);})),closed:new Promise(resolve=>child.once('exit',resolve))});
    }
    await Promise.all(children.map(c=>c.ready));
    const input=prepare(x),held=claim(x,input),task=x.store.task(x.owner,x.task.taskRef);
    const execution=x.store.beginAuditExecution(x.host,{taskRef:task.taskRef,actionRef:held.actionRef,actionDigest:held.actionDigest,claimRef:held.claimRef,generationRef:held.generationRef,inputRecordRef:input.recordRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch});
    const consume={taskRef:task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,actionDigest:held.actionDigest,executionRef:execution.executionRef};
    children.forEach(c=>c.child.send(consume));assert.deepEqual((await Promise.all(children.map(c=>c.result))).map(m=>m.admitted).sort(),[false,true]);
    assert.deepEqual(await Promise.all(children.map(c=>c.closed)),[0,0]);
    const snapshot=x.store.snapshot(x.owner,{taskRef:task.taskRef});assert.equal(snapshot.executions[0].state,'dispatch_intent');assert.equal(snapshot.actions[0].releaseEvidenceRef,null);
  }finally{children.forEach(c=>{if(c.child.exitCode===null)c.child.kill();});x.store.close();}
});

test('audit final consume rechecks exact expiry, revoke, cancellation and policy downshift without dropping held work',()=>{
  for(const partition of ['expiry','revoke','cancel','policy']){
    let now=1000;
    const x=fixture({clock:()=>now}),input=prepare(x),held=claim(x,input),task=x.store.task(x.owner,x.task.taskRef);
    const execution=x.store.beginAuditExecution(x.host,{taskRef:task.taskRef,actionRef:held.actionRef,actionDigest:held.actionDigest,claimRef:held.claimRef,generationRef:held.generationRef,inputRecordRef:input.recordRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch});
    const consume={taskRef:task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,actionDigest:held.actionDigest,executionRef:execution.executionRef};
    if(partition==='expiry')now=2000;
    if(partition==='revoke')x.store.revokeAction(x.owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,actionRef:held.actionRef,actionDigest:held.actionDigest});
    if(partition==='cancel')x.store.control(x.owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,kind:'cancel'});
    if(partition==='policy')x.store.policy(x.owner,{commandRef:command(),expectedVersion:x.store.getPolicy(x.owner).version,limits:{maxActive:0},modelPolicy:x.store.getPolicy(x.owner).modelPolicy});
    rejects(partition==='expiry'?'APPROVAL_INVALID':partition==='policy'?'STALE_POLICY':'CLAIM_REVOKED',()=>x.store.assertExecutionCurrent(x.host,consume));
    const snapshot=x.store.snapshot(x.owner,{taskRef:task.taskRef});assert.equal(snapshot.executions[0].state,'intent_committed');assert.equal(snapshot.actions[0].releaseEvidenceRef,null);assert.equal(snapshot.workers.length,1);x.store.close();
  }
});

test('admitted review protects the last output and report slots from unrelated writes, preserving known reconciliation',()=>{
  const x=fixture({limits:{maxRecordsPerTask:5}}),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),task=x.store.task(x.owner,x.task.taskRef);
  rejects('RECORD_LIMIT',()=>x.store.putData(x.owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,kind:'progress',sourceRef:r('unrelated-progress'),content:'ordinary data cannot take reserved output slot'}));
  const result=capture(x,input,held,flow.execution),answer=submit(x,flow,result);assert.equal(answer.verification.verdict,'accepted');assert.equal(x.store.listData(x.owner,{taskRef:task.taskRef}).length,5);
  x.store.workerObservation(x.host,{taskRef:task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,commandRef:command(),phase:'stopped',evidenceRef:r('protected-stop')});
  assert.equal(x.store.settleAction(x.host,{taskRef:task.taskRef,claimRef:held.claimRef,generationRef:held.generationRef,commandRef:command(),outcome:'completed',evidenceRef:r('protected-settlement')}).reservationHeld,false);x.store.close();
});

test('private reviewer handles have an explicit core32 ceiling and a stopped handle is never rebound or adopted',()=>{
  const x=fixture({limits:{maxActionsPerTask:64,maxEventsPerTask:256,maxUsageUnits:4000000}}),input=prepare(x);
  x.store.policy(x.owner,{commandRef:command(),expectedVersion:x.store.getPolicy(x.owner).version,limits:{maxActive:33,maxTotalAttempts:64,maxUsageUnits:4000000},modelPolicy:x.store.getPolicy(x.owner).modelPolicy});
  const bindings=[];
  for(let i=0;i<33;i++){
    const held=claim(x,input),handle={};
    const bind={taskRef:x.task.taskRef,auditRef:input.auditRef,claimRef:held.claimRef,generationRef:held.generationRef,sessionRef:held.sessionRef};
    if(i===32){
      const before=x.store.snapshot(x.owner,{taskRef:x.task.taskRef});rejects('REVIEWER_LIMIT',()=>x.store.bindAuditReviewer(x.host,handle,bind));assert.deepEqual(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),before);
      const first=bindings[0];x.store.workerObservation(x.host,{taskRef:x.task.taskRef,claimRef:first.held.claimRef,generationRef:first.held.generationRef,commandRef:command(),phase:'stopped',evidenceRef:r('pool-stopped')});
      rejects('UNAUTHORIZED',()=>x.store.context(first.handle,x.task.taskRef));rejects('INVALID_CONFIG',()=>x.store.bindAuditReviewer(x.host,first.handle,bind));
      x.store.bindAuditReviewer(x.host,handle,bind);assert.equal(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}).actions.filter(a=>a.releaseEvidenceRef===null).length,33);
    }else{x.store.bindAuditReviewer(x.host,handle,bind);bindings.push({handle,held});}
  }
  x.store.close();
});

test('migration exclusive lock includes an acknowledged concurrent genuine4 typed write in its exact backup',async()=>{
  const x=await seedGenuine4(),children=[],releasePath=join(x.directory,'release-fixture'),oldURL=new URL('src/runtime-store.mjs',oldSource).href;
  const input={taskId:'concurrent-genuine-task',provider:'fixture',source:'concurrent-source',eventId:'concurrent-event',goal:'acknowledged concurrent genuine4 encrypted goal',commandRef:command()};
  function launch(source){
    const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.on('data',part=>stderr+=part);
    const result={child,messages:[],closed:new Promise(resolve=>child.once('exit',code=>resolve({code,stderr})))};
    child.on('message',message=>result.messages.push(message));children.push(result);return result;
  }
  const config=`databasePath:${JSON.stringify(x.config.databasePath)},encryptionKey:Buffer.alloc(32,57),clock:()=>1000,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}}]`;
  try{
    const writer=launch(`import{existsSync}from'node:fs';import{RuntimeStore}from${JSON.stringify(oldURL)};const owner={};let armed=false;const store=new RuntimeStore({${config},fixtureMode:true,fixtureFaults:point=>{if(armed&&point==='before_commit'){process.send('writer_locked');const wait=new Int32Array(new SharedArrayBuffer(4)),deadline=Date.now()+8000;while(!existsSync(${JSON.stringify(releasePath)})){if(Date.now()>deadline)process.exit(91);Atomics.wait(wait,0,0,10);}}}});armed=true;const receipt=store.intake(owner,${JSON.stringify(input)});store.close();process.send({receipt});process.disconnect();`);
    await new Promise((resolve,reject)=>{writer.child.on('message',m=>{if(m==='writer_locked')resolve();});writer.child.once('exit',code=>{if(code!==null&&code!==0)reject(Error('writer failed '+code));});});
    const migrator=launch(`import{DatabaseSync}from'node:sqlite';import{RuntimeStore}from${JSON.stringify(currentSource)};const original=DatabaseSync.prototype.exec;DatabaseSync.prototype.exec=function(sql){if(sql==='BEGIN EXCLUSIVE')process.send('migration_waiting');return original.call(this,sql);};const owner={};const store=new RuntimeStore({${config}});const task=store.task(owner,${JSON.stringify(r(input.taskId))});store.close();process.send({task});process.disconnect();`);
    await new Promise((resolve,reject)=>{migrator.child.on('message',m=>{if(m==='migration_waiting'){writeFileSync(releasePath,'bounded fixture release');resolve();}});migrator.child.once('exit',code=>{if(code!==null&&code!==0)reject(Error('migration failed '+code));});});
    for(const result of await Promise.all(children.map(c=>c.closed)))assert.equal(result.code,0,result.stderr);
    const writerReceipt=writer.messages.find(m=>m.receipt).receipt,migrated=migrator.messages.find(m=>m.task).task;
    assert.deepEqual(migrated,writerReceipt.task);
    const backup=x.config.databasePath+'.schema-4.backup',backupRows=sqlSnapshot(backup);assert.equal(backupRows.version,4);assert.equal(sqlSnapshot(x.config.databasePath).version,SCHEMA_VERSION);assertMigratedTables(sqlSnapshot(x.config.databasePath).tables,backupRows.tables);
    const old=new x.Old.RuntimeStore({...x.config,databasePath:backup});assert.deepEqual(old.intake(x.owner,input),writerReceipt);old.close();
  }finally{children.forEach(c=>{if(c.child.exitCode===null)c.child.kill();});}
});

test('historical readAuditInput returns exact authenticated association and original data shape with no writes or generic read changes',()=>{
  const x=fixture(),input=prepare(x),request={taskRef:x.task.taskRef,inputRecordRef:input.recordRef};
  const beforeRows=sqlSnapshot(x.config.databasePath),beforeBytes=readFileSync(x.config.databasePath),beforeEntries=readdirSync(join(x.config.databasePath,'..'));
  const generic=x.store.readData(x.host,{taskRef:x.task.taskRef,recordRef:input.recordRef}),list=x.store.listData(x.host,{taskRef:x.task.taskRef}),snapshot=x.store.snapshot(x.host,{taskRef:x.task.taskRef});
  const result=x.store.readAuditInput(x.host,request);
  assert.deepEqual(Object.keys(result).sort(),['association','data']);assert.deepEqual(result.data,generic);
  assert.deepEqual(Object.keys(result.association).sort(),['contractVersion','ownerRef','workspaceRef','taskRef','auditRef','auditRevision','round','purpose','recordRef','digest','byteLength','bindingDigest','materialDigest','artifactRef','artifactVersion','artifactDigest','semanticRevision','sourceTaskVersion','sourceAuthEpoch','contextRecordRef','contextDigest','previousReportRef','material','inputByteLimit','resultByteLimit','createdAt'].sort());
  assert.equal(result.association.contractVersion,'df.audit-input-association/v1');assert.equal(result.association.recordRef,input.recordRef);assert.equal(result.association.digest,input.digest);assert.equal(result.data.auditInputRef,input.recordRef);assert.equal(result.data.kind,'context');
  result.association.material[0].digest=r('mutated-return-only');result.data.content='mutated return only';
  assert.equal(x.store.readAuditInput(x.host,request).data.content,generic.content);
  assert.deepEqual(x.store.listData(x.host,{taskRef:x.task.taskRef}),list);assert.deepEqual(x.store.snapshot(x.host,{taskRef:x.task.taskRef}),snapshot);
  assert.deepEqual(sqlSnapshot(x.config.databasePath),beforeRows);assert.deepEqual(readFileSync(x.config.databasePath),beforeBytes);assert.deepEqual(readdirSync(join(x.config.databasePath,'..')),beforeEntries);x.store.close();
});

test('readAuditInput authorizes only exact original host capability and refuses foreign scope, task and absent associations without bytes',()=>{
  const x=fixture(),input=prepare(x),held=claim(x,input),reviewer={};
  x.store.bindAuditReviewer(x.host,reviewer,{taskRef:x.task.taskRef,auditRef:input.auditRef,claimRef:held.claimRef,generationRef:held.generationRef,sessionRef:held.sessionRef});
  const request={taskRef:x.task.taskRef,inputRecordRef:input.recordRef},before=sqlSnapshot(x.config.databasePath);
  for(const handle of [x.owner,x.worker,x.advancedReviewer,reviewer,{}, {...x.host}])rejects('UNAUTHORIZED',()=>x.store.readAuditInput(handle,request));
  rejects('AUDIT_BINDING_MISMATCH',()=>x.store.readAuditInput(x.host,{...request,taskRef:r('different-task')}));
  rejects('AUDIT_INPUT_REQUIRED',()=>x.store.readAuditInput(x.host,{...request,inputRecordRef:x.context.recordRef}));
  rejects('AUDIT_INPUT_REQUIRED',()=>x.store.readAuditInput(x.host,{...request,inputRecordRef:r('absent-input')}));
  assert.deepEqual(sqlSnapshot(x.config.databasePath),before);x.store.close();
  const foreign={},store=new RuntimeStore({...x.config,principals:[{handle:foreign,role:'host',scope:{ownerId:'different-owner',workspaceId:scope.workspaceId}}]});
  rejects('AUDIT_INPUT_REQUIRED',()=>store.readAuditInput(foreign,request));store.close();
});

test('readAuditInput closes refs and descriptor inputs before getters/proxies or authority flags can reach projection',()=>{
  const x=fixture(),input=prepare(x),request={taskRef:x.task.taskRef,inputRecordRef:input.recordRef};let traps=0;
  const accessor={inputRecordRef:input.recordRef};Object.defineProperty(accessor,'taskRef',{enumerable:true,get(){traps++;throw Error('synthetic accessor error');}});
  const proxy=new Proxy(request,{get(){traps++;throw Error('synthetic proxy error');},getPrototypeOf(){traps++;throw Error('synthetic prototype error');}});
  const hidden={...request};Object.defineProperty(hidden,'authority',{value:true,enumerable:false});
  const symbol={...request,[Symbol('authority')]:true};
  const before=sqlSnapshot(x.config.databasePath);
  for(const invalid of [null,[],accessor,proxy,hidden,symbol,{...request,approved:true},{...request,expectedTaskVersion:1},{...request,taskRef:'raw-task'},{...request,inputRecordRef:input.recordRef+'\n'}])rejects('INVALID_INPUT',()=>x.store.readAuditInput(x.host,invalid));
  assert.equal(traps,0);assert.deepEqual(sqlSnapshot(x.config.databasePath),before);x.store.close();
});

test('readAuditInput remains historical after revoke, cancellation, policy and artifact drift and reopen, without fresh admission',()=>{
  let permissions=0,deny=false;
  const x=fixture({hostPermission:()=>{permissions++;if(deny)throw Error('synthetic denied seam');return true;}}),input=prepare(x),held=claim(x,input),flow=begin(x,input,held),request={taskRef:x.task.taskRef,inputRecordRef:input.recordRef};
  const historical=x.store.readAuditInput(x.host,request),current=x.store.task(x.owner,x.task.taskRef);
  x.store.revokeAction(x.owner,{taskRef:current.taskRef,commandRef:command(),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch,actionRef:held.actionRef,actionDigest:held.actionDigest});
  x.store.policy(x.owner,{commandRef:command(),expectedVersion:x.store.getPolicy(x.owner).version,limits:{maxActive:0},modelPolicy:x.store.getPolicy(x.owner).modelPolicy});
  const revised=x.store.task(x.owner,current.taskRef);
  x.store.writeArtifact(x.owner,{taskRef:revised.taskRef,commandRef:command(),expectedTaskVersion:revised.version,expectedAuthEpoch:revised.authEpoch,artifactRef:x.artifact.artifactRef,version:2,content:'new artifact is not the historical reviewed artifact'});
  const updated=x.store.task(x.owner,current.taskRef);x.store.control(x.owner,{taskRef:updated.taskRef,commandRef:command(),expectedTaskVersion:updated.version,expectedAuthEpoch:updated.authEpoch,kind:'cancel'});
  deny=true;const permissionCalls=permissions,before=sqlSnapshot(x.config.databasePath);
  assert.deepEqual(x.store.readAuditInput(x.host,request),historical);assert.equal(permissions,permissionCalls);assert.deepEqual(sqlSnapshot(x.config.databasePath),before);
  rejects('CLAIM_REVOKED',()=>x.store.assertNativeRequestCurrent(x.host,flow.consume));x.store.close();
  const reopened=new RuntimeStore({...x.config,auditExecutionBounds:undefined});const reopenedRows=sqlSnapshot(x.config.databasePath);assert.deepEqual(reopened.readAuditInput(x.host,request),historical);assert.deepEqual(sqlSnapshot(x.config.databasePath),reopenedRows);assert.equal(reopened.snapshot(x.owner,{taskRef:current.taskRef}).actions[0].releaseEvidenceRef,null);reopened.close();
});
