// Isolated schema6 author fixtures. Trusted-core synthetic observations do not
// establish actual native capture, installed source, review quality or CODE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,readdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {canonical} from '../src/runtime-security.mjs';
import {RuntimeStore as Source5} from '../../source5/src/runtime-store.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RuntimeStore,reference as r,canonicalDigest as d} from '../src/runtime-store.mjs';
const scope={ownerId:'ni6-synthetic-owner',workspaceId:'ni6-synthetic-workspace'};
let seq=0;
const command=()=>r('ni6-command-'+ ++seq);
const denial=(code,fn)=>assert.throws(fn,e=>e.code===code&&e.message===code);
function fixture(t,extra={}){
  const dir=mkdtempSync(join(tmpdir(),'df-ni6-author-')),owner={},host={},foreign={};let now=1000;
  const options={...extra,databasePath:join(dir,'ledger.db'),encryptionKey:Buffer.alloc(32,61),clock:()=>now,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope},{handle:host,role:'host',scope},{handle:foreign,role:'owner',scope:{ownerId:'ni6-other-owner',workspaceId:scope.workspaceId}}]};
  let store=new RuntimeStore(options);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.policy(owner,{commandRef:command(),expectedVersion:1,limits:{maxActive:2,maxTotalAttempts:16},modelPolicy:{version:1,presetRefs:[r('mock-preset')],catalogEvidenceRef:r('mock-catalog')}});
  const task=store.intake(owner,{taskId:'task',provider:'fixture',source:'fixture',eventId:'fixture-event',goal:'synthetic original goal',commandRef:command()}).task;
  const x={get store(){return store;},owner,host,foreign,task,options,dir,now:()=>now,setTime:v=>{now=v;},reopen(){store.close();store=new RuntimeStore(options);}};
  x.bind=()=>{const task=store.task(owner,x.task.taskRef);return{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch};};
  return x;
}
function source(x){
  return x.store.configureSource(x.owner,{commandRef:command(),sourceRef:r('local-source'),expectedRevision:0,spec:{kind:'internal',identityMode:'unique_id',enabled:true,adapterRef:r('local-adapter'),permissionPolicyRef:r('local-permission'),maxEventAgeMs:100,rate:{windowMs:10000,maxEvents:16}}});
}
function pair(x,s){return x.store.configureLocalSubscription(x.owner,{commandRef:command(),sourceRef:s.sourceRef,expectedSourceRevision:s.revision,subscriptionRef:r('local-subscription'),expectedRevision:0,spec:{enabled:true,triggerRef:r('local-trigger'),route:'new_task'}});}
function event(x,s,p,extra={}){return{commandRef:command(),sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef,expectedSourceRevision:s.revision,expectedSubscriptionRevision:p.subscription.revision,adapterRef:s.spec.adapterRef,permissionPolicyRef:s.spec.permissionPolicyRef,providerRef:r('native-provider'),sourceIdentityRef:r('native-source-identity'),eventIdRef:r('original-event'),goal:'synthetic admitted instruction',taskId:'admitted-task',...extra};}
function action(x,kind,targetDigest,dataDigest,generationRef){
  const policy=x.store.getPolicy(x.owner);
  return{actionRef:command(),kind,role:kind==='review'?'review':'worker',targetDigest,dataDigest,units:1,charges:{runtimeMs:0,usageUnits:0,costEstimateMicros:0},attemptGroupRef:command(),attemptIndex:1,resourcePolicyVersion:policy.version,modelPolicyVersion:policy.modelPolicy.version,model:{presetRef:r('mock-preset'),modelRef:r('mock-model'),reasoningRef:r('mock-reasoning'),catalogEvidenceRef:r('mock-catalog')},executor:{mode:'none',generationRef,environmentRef:r('mock-environment'),bindingDigest:r('mock-binding'),toolsDigest:r('empty-tools'),permissionPolicyDigest:r('mock-permission')}};
}
function approved(x,spec){
  const planned=x.store.planAction(x.owner,{...x.bind(),spec});
  x.store.grantAction(x.owner,{...x.bind(),actionRef:planned.actionRef,actionDigest:planned.actionDigest,expiresAt:2000});
  return{...x.bind(),actionRef:planned.actionRef,actionDigest:planned.actionDigest};
}
function advancedArtifact(x){
  const artifact=x.store.writeArtifact(x.owner,{...x.bind(),artifactRef:r('artifact'),version:1,content:'synthetic artifact with no normal native provenance'}),reviewer={},generationRef=r('advanced-review-generation');
  x.store.bindExecution(x.host,reviewer,{taskRef:x.task.taskRef,role:'reviewer',generationRef,readRecordRefs:[artifact.recordRef]});
  const claim=x.store.claimAction(x.host,approved(x,action(x,'review',r('advanced-review-target'),artifact.digest,generationRef)));
  x.store.verifyArtifact(reviewer,{taskRef:x.task.taskRef,commandRef:command(),artifactRef:artifact.artifactRef,version:1,digest:artifact.digest,verdict:'accepted',evidenceRef:r('advanced-evidence')});
  x.store.settleAction(x.host,{taskRef:x.task.taskRef,commandRef:command(),claimRef:claim.claimRef,generationRef:claim.generationRef,outcome:'completed',evidenceRef:r('known-review-effect')});
  return x.store.artifact(x.owner,{taskRef:x.task.taskRef,artifactRef:artifact.artifactRef});
}
function delivery(x,a){
  const intent={...x.bind(),deliveryRef:r('delivery'),artifactRef:a.artifactRef,artifactVersion:a.version,digest:a.digest,recipientRef:r('recipient'),channelRef:r('channel')};
  return x.store.recordDelivery(x.owner,{...intent,targetDigest:d({ownerRef:x.task.ownerRef,workspaceRef:x.task.workspaceRef,...intent})});
}

test('local source/subscription acknowledgement commits exact pair, stale partial config persists across reopen',t=>{
  const x=fixture(t),s=source(x),p=pair(x,s);
  assert.equal(p.subscription.localPairRef,p.pair.pairRef);assert.equal(p.pair.sourceSpecDigest,d(s.spec));assert.equal(p.pair.subscriptionSpecDigest,d(p.subscription.spec));
  assert.equal(x.store.readLocalSourcePair(x.host,{sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef}).currentness,'current');
  const revised=x.store.configureSource(x.owner,{commandRef:command(),sourceRef:s.sourceRef,expectedRevision:1,spec:{...s.spec,maxEventAgeMs:101}});
  denial('STALE_SUBSCRIPTION',()=>x.store.configureLocalSubscription(x.owner,{commandRef:command(),sourceRef:s.sourceRef,expectedSourceRevision:2,subscriptionRef:p.subscription.subscriptionRef,expectedRevision:0,spec:p.subscription.spec}));
  assert.equal(x.store.readLocalSourcePair(x.host,{sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef}).currentness,'stale');
  denial('EVENT_PAIR_STALE',()=>x.store.ingestLocalOwnerEvent(x.host,event(x,revised,p)));
  x.reopen();assert.equal(x.store.readLocalSourcePair(x.host,{sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef}).currentness,'stale');
});
test('normal local ingress keeps first server timestamp and original event association over time/restart',t=>{
  const x=fixture(t),s=source(x),p=pair(x,s),input=event(x,s,p),first=x.store.ingestLocalOwnerEvent(x.host,input);
  assert.equal(first.observedAt,1000);assert.equal(first.deduplicated,false);
  x.setTime(5000);const same=x.store.ingestLocalOwnerEvent(x.host,input);assert.equal(same.deduplicated,true);assert.equal(same.observedAt,first.observedAt);
  x.reopen();const again=x.store.ingestLocalOwnerEvent(x.host,{...input,commandRef:command()});assert.equal(again.deduplicated,true);assert.equal(again.taskRef,first.taskRef);assert.equal(again.observedAt,1000);
  denial('IDEMPOTENCY_CONFLICT',()=>x.store.ingestLocalOwnerEvent(x.host,{...input,commandRef:command(),goal:'changed instruction'}));
});
test('owner cannot approve retained pending clock under newer source revision, with no new acknowledgement',t=>{
  const x=fixture(t),s=source(x),p=pair(x,s),clockRef=r('clock'),planDigest=r('plan');
  x.store.advanceEventClock(x.host,{commandRef:command(),sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef,expectedSourceRevision:1,expectedSubscriptionRevision:1,clockRef,expectedCursor:null,through:1000,decision:'verification_required',planDigest});
  const next=x.store.configureSource(x.owner,{commandRef:command(),sourceRef:s.sourceRef,expectedRevision:1,spec:s.spec});
  const nextPair=x.store.configureLocalSubscription(x.owner,{commandRef:command(),sourceRef:s.sourceRef,expectedSourceRevision:next.revision,subscriptionRef:p.subscription.subscriptionRef,expectedRevision:1,spec:p.subscription.spec});
  const before=x.store.eventClock(x.host,{sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef,clockRef});
  denial('STALE_EVENT_CLOCK',()=>x.store.approveEventClock(x.owner,{commandRef:command(),sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef,expectedSourceRevision:next.revision,expectedSubscriptionRevision:nextPair.subscription.revision,clockRef,expectedCursor:null,planDigest}));
  assert.deepEqual(x.store.eventClock(x.host,{sourceRef:s.sourceRef,subscriptionRef:p.subscription.subscriptionRef,clockRef}),before);
});
test('readonly owner memory command preserves acknowledged historical put after correction and deletion',t=>{
  const x=fixture(t),namespaceRef=r('memory'),input={namespaceRef,commandRef:command(),expectedRevision:0,content:'synthetic memory v1',sourceRefs:[r('memory-source')]},first=x.store.putMemory(x.owner,input);
  x.store.putMemory(x.owner,{...input,commandRef:command(),expectedRevision:1,content:'synthetic memory v2'});x.store.deleteMemory(x.owner,{namespaceRef,commandRef:command(),expectedRevision:2});
  const read={namespaceRef,commandRef:input.commandRef};assert.deepEqual(x.store.readMemoryCommand(x.owner,read),first);x.reopen();assert.deepEqual(x.store.readMemoryCommand(x.owner,read),first);
  denial('IDEMPOTENCY_CONFLICT',()=>x.store.readMemoryCommand(x.owner,{...read,namespaceRef:r('other-memory')}));
  assert.equal(x.store.readMemoryCommand(x.owner,{namespaceRef,commandRef:command()}),null);denial('UNAUTHORIZED',()=>x.store.readMemoryCommand(x.host,read));
  const normalCommand=command();x.store.writeProgress(x.owner,{...x.bind(),commandRef:normalCommand,progressRef:r('raw-progress'),kind:'milestone',content:'synthetic raw report'});denial('IDEMPOTENCY_CONFLICT',()=>x.store.readMemoryCommand(x.owner,{namespaceRef,commandRef:normalCommand}));
});
test('advanced accepted verification stays unavailable in private normal artifact projection; raw progress is unverified',t=>{
  const x=fixture(t),a=advancedArtifact(x),generic=x.store.artifact(x.owner,{taskRef:x.task.taskRef,artifactRef:a.artifactRef}),value=x.store.readLocalArtifact(x.owner,{taskRef:x.task.taskRef,artifactRef:a.artifactRef,version:a.version,digest:a.digest});
  assert.equal(Object.hasOwn(generic,'verificationBinding'),false);assert.equal(value.artifact.verificationBinding.source,'unavailable');assert.equal(value.data.content,'synthetic artifact with no normal native provenance');
  const raw=x.store.writeProgress(x.owner,{...x.bind(),progressRef:r('raw-progress'),kind:'final',content:'{"verificationState":"passed","evidence":"guessed"}'});
  assert.deepEqual(x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:raw.progressRef}),{progress:{progressRef:raw.progressRef,recordRef:raw.recordRef,digest:raw.digest,kind:raw.kind,generationRef:raw.generationRef,at:raw.at},report:null,localReport:null,currentness:'unverified'});
});
test('typed local claim refuses unavailable source/zero charge before mutation while advanced none remains compatible',t=>{
  const x=fixture(t),a=advancedArtifact(x),record=delivery(x,a),input={...approved(x,action(x,'write',record.targetDigest,record.digest,r('delivery-generation'))),delivery:{deliveryRef:record.deliveryRef}},before=x.store.snapshot(x.owner,{taskRef:x.task.taskRef});
  denial('LOCAL_ADMISSION_DENIED',()=>x.store.claimLocalDelivery(x.host,input));assert.deepEqual(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),before);
  const claim=x.store.claimAction(x.host,input);assert.ok(claim.claimRef);assert.equal(x.store.getDelivery(x.owner,{taskRef:x.task.taskRef,deliveryRef:record.deliveryRef}).state,'outbox_committed');
  denial('IDEMPOTENCY_CONFLICT',()=>x.store.claimLocalDelivery(x.host,input));
});
test('typed progress commits source-derived not-run state and fact digest ignores row identity/blocker order',t=>{
  const x=fixture(t),artifact=x.store.writeArtifact(x.owner,{...x.bind(),artifactRef:r('unreviewed-artifact'),version:1,content:'synthetic unreviewed output'}),statements=[];
  for(const text of ['synthetic completed scope','synthetic unfinished scope','synthetic next step','synthetic blocker A','synthetic blocker B'])statements.push(x.store.putData(x.owner,{...x.bind(),kind:'context',content:text,sourceRef:command()}));
  const input={kind:'milestone',artifactRef:artifact.artifactRef,artifactVersion:1,digest:artifact.digest,completedScopeRef:statements[0].recordRef,unfinishedRef:statements[1].recordRef,nextStepRef:statements[2].recordRef,blockerRefs:[statements[3].recordRef,statements[4].recordRef]};
  const first=x.store.writeLocalProgress(x.owner,{...x.bind(),...input,progressRef:r('source-report-one')});
  const second=x.store.writeLocalProgress(x.owner,{...x.bind(),...input,progressRef:r('source-report-two'),blockerRefs:[...input.blockerRefs].reverse()});
  assert.equal(first.report.verificationState,'not_run');assert.equal(first.localReport.verificationBinding,null);assert.equal(first.report.progressDigest,second.report.progressDigest);
  assert.equal(x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:first.progress.progressRef}).currentness,'current');
  x.store.putData(x.owner,{...x.bind(),kind:'constraints',content:'synthetic corrected constraint',sourceRef:command()});
  const historic=x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:first.progress.progressRef});assert.equal(historic.currentness,'stale');assert.equal(historic.report.verificationState,'not_run');
  x.reopen();assert.equal(x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:first.progress.progressRef}).currentness,'stale');
});
test('normal notification marker rejects generic policy downgrade without changing original policy',t=>{
  const x=fixture(t),policyRef=r('normal-policy'),input={commandRef:command(),policyRef,expectedRevision:0,spec:{enabled:true,timeZone:'UTC',quietWindows:[],emergencyKinds:[],mergeKinds:['milestone'],mergeWindowMs:0,minIntervalMs:0,frequency:{windowMs:10000,maxClaims:2}}};
  const policy=x.store.configureLocalNotificationPolicy(x.owner,input);assert.equal(policy.markerRef,policyRef);
  denial('NORMAL_POLICY_REQUIRED',()=>x.store.configureNotificationPolicy(x.owner,{...input,commandRef:command(),expectedRevision:1,spec:{...input.spec,enabled:false}}));
  assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef}).revision,1);x.reopen();assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef}).markerRef,policyRef);
});


const digestBytes=value=>createHash('sha256').update(value).digest('hex');
function encryptedRows(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{return db.prepare('SELECT id,nonce,ciphertext,tag,metadata FROM runtime_data ORDER BY id').all().map(row=>({id:row.id,digest:digestBytes(JSON.stringify(row,(_key,value)=>value instanceof Uint8Array?Buffer.from(value).toString('hex'):value))}));}
  finally{db.close();}
}
function genuine5(t){
  const dir=mkdtempSync(join(tmpdir(),'df-ni6-genuine5-')),owner={},host={};
  const config={databasePath:join(dir,'ledger.db'),encryptionKey:Buffer.alloc(32,63),clock:()=>1000,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope},{handle:host,role:'host',scope}]};
  const old=new Source5(config);t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const intake={taskId:'preserved-task',provider:'fixture',source:'fixture',eventId:'preserved-event',goal:'synthetic genuine5 acknowledged goal',commandRef:command()},ack=old.intake(owner,intake);
  const memoryInput={namespaceRef:r('preserved-memory'),commandRef:command(),expectedRevision:0,content:'synthetic genuine5 memory',sourceRefs:[r('preserved-source')]},memory=old.putMemory(owner,memoryInput);
  const task=old.task(owner,ack.task.taskRef),data=old.putData(owner,{taskRef:task.taskRef,commandRef:command(),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,kind:'constraints',content:'synthetic genuine5 encrypted constraint',sourceRef:r('preserved-data-source')});
  const x={get store(){return old;},owner,host,task:ack.task,bind(){const t=old.task(owner,ack.task.taskRef);return{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch};}};
  old.policy(owner,{commandRef:command(),expectedVersion:1,limits:{maxActive:2,maxTotalAttempts:16},modelPolicy:{version:1,presetRefs:[r('mock-preset')],catalogEvidenceRef:r('mock-catalog')}});
  const held=old.claimAction(host,approved(x,action(x,'write',r('preserved-target'),r('preserved-effect-data'),r('preserved-generation'))));
  old.close();
  return{dir,config,owner,host,intake,ack,memoryInput,memory,data,held,bytes:readFileSync(config.databasePath),cipher:encryptedRows(config.databasePath)};
}
test('genuine5 writer migrates to6 with exact backup/cipher/ack preservation; old5 refuses6 before writes',t=>{
  const x=genuine5(t),current=new RuntimeStore(x.config);
  try{
    assert.equal(current.diagnostics().schemaVersion,6);
    assert.deepEqual(readFileSync(x.config.databasePath+'.schema-5.backup'),x.bytes);
    assert.deepEqual(encryptedRows(x.config.databasePath),x.cipher);
    assert.equal(current.readData(x.owner,{taskRef:x.ack.task.taskRef,recordRef:x.data.recordRef}).content,'synthetic genuine5 encrypted constraint');
    assert.deepEqual(current.putMemory(x.owner,x.memoryInput),x.memory);
    assert.deepEqual(current.intake(x.owner,x.intake),x.ack);
    const task=current.task(x.owner,x.ack.task.taskRef);assert.equal(task.status,'recovery_required');
    assert.equal(current.snapshot(x.owner,{taskRef:task.taskRef}).workers[0].claimRef,x.held.claimRef);
  }finally{current.close();}
  const before=readFileSync(x.config.databasePath),entries=readdirSync(x.dir).sort();
  denial('SCHEMA_FUTURE',()=>new Source5(x.config));
  assert.deepEqual(readFileSync(x.config.databasePath),before);assert.deepEqual(readdirSync(x.dir).sort(),entries);
});
test('genuine5 backup collision and migration fault preserve old bytes and acknowledged public state',t=>{
  for(const mode of ['collision','fault']){
    const x=genuine5(t),backup=x.config.databasePath+'.schema-5.backup';
    if(mode==='collision')writeFileSync(backup,'synthetic occupied backup');
    denial('STORAGE_UNAVAILABLE',()=>new RuntimeStore({...x.config,fixtureMode:true,...(mode==='fault'?{migrationFault:()=>{throw Error('synthetic fixture cut');}}:{})}));
    assert.deepEqual(readFileSync(x.config.databasePath),x.bytes);
    assert.deepEqual(readFileSync(backup),mode==='fault'?x.bytes:Buffer.from('synthetic occupied backup'));
    const old=new Source5(x.config);try{assert.equal(old.diagnostics().schemaVersion,5);assert.deepEqual(old.putMemory(x.owner,x.memoryInput),x.memory);}finally{old.close();}
  }
});
function protectedContext(x){
  const goal=x.store.listData(x.owner,{taskRef:x.task.taskRef,kind:'goal'})[0],task=x.store.task(x.owner,x.task.taskRef),text=x.store.readData(x.owner,{taskRef:task.taskRef,recordRef:goal.recordRef}).content;
  const content=JSON.stringify({contractVersion:'df.execution-context/v1',materialKind:'execution_context',sourceScope:{ownerRef:task.ownerRef,workspaceRef:task.workspaceRef,taskRef:task.taskRef},sourceTaskVersion:task.version,sourceAuthEpoch:task.authEpoch,generatedAt:x.now(),sourceRefs:[goal.recordRef],sourceProvenance:[{recordRef:goal.recordRef,digest:goal.digest,taskVersion:goal.taskVersion,authEpoch:goal.authEpoch,createdAt:goal.createdAt}],ledgerSnapshotDigest:r('synthetic-snapshot'),content:text,inputCounts:{bytes:Buffer.byteLength(text),tokens:4},retainedRefs:[goal.recordRef],droppedRefs:[],verification:'module_prepared_execution_context_only'});
  return x.store.putData(x.owner,{...x.bind(),kind:'context',content,sourceRef:command()});
}
function syntheticNativeReview(x,artifact,{context=protectedContext(x),material=[],response={}}={}){
  const goal=x.store.listData(x.owner,{taskRef:x.task.taskRef,kind:'goal'})[0],items=[artifact,context,goal,...material],unique=[...new Map(items.map(m=>[m.recordRef,{recordRef:m.recordRef,digest:m.digest}])).values()];
  const req=x.store.configureAudit(x.owner,{...x.bind(),auditRef:command(),expectedAuditRevision:0,artifactRef:artifact.artifactRef,artifactVersion:artifact.version,digest:artifact.digest,material:unique,contextRecordRef:context.recordRef,policyRef:r('explicit-synthetic-review-policy'),blockingSeverities:['blocking'],maxRepairRounds:2});
  const input=x.store.prepareAuditInput(x.owner,{...x.bind(),auditRef:req.auditRef,expectedAuditRevision:req.auditRevision,purpose:'audit_review',round:0}),generationRef=command(),sessionRef=command();
  const spec={...action(x,'review',input.bindingDigest,artifact.digest,generationRef),charges:{runtimeMs:100,usageUnits:100000,costState:'estimated',costEstimateMicros:0,costProvenanceRef:r('mock-source-zero-cost')},executor:{...action(x,'review',input.bindingDigest,artifact.digest,generationRef).executor,mode:'create',sessionRef},executionInput:{recordRef:input.recordRef,digest:input.digest,purpose:input.purpose,auditRef:input.auditRef,bindingDigest:input.bindingDigest,materialDigest:input.materialDigest}};
  const held=x.store.claimAction(x.host,approved(x,spec));
  x.store.workerObservation(x.host,{taskRef:x.task.taskRef,claimRef:held.claimRef,generationRef,sessionRef,commandRef:command(),phase:'created',cursor:0,evidenceRef:command()});
  const reviewer={};x.store.bindAuditReviewer(x.host,reviewer,{taskRef:x.task.taskRef,auditRef:req.auditRef,claimRef:held.claimRef,generationRef,sessionRef});
  const execution=x.store.beginAuditExecution(x.host,{...x.bind(),actionRef:held.actionRef,actionDigest:held.actionDigest,claimRef:held.claimRef,generationRef,inputRecordRef:input.recordRef});
  assert.equal(x.store.assertExecutionCurrent(x.host,{taskRef:x.task.taskRef,claimRef:held.claimRef,generationRef,actionDigest:held.actionDigest,executionRef:execution.executionRef}).admitted,true);
  const captured=x.store.captureAuditResult(x.host,{taskRef:x.task.taskRef,commandRef:command(),claimRef:held.claimRef,generationRef,executionRef:execution.executionRef,sessionRef,inputCursor:1,cursor:2,content:JSON.stringify({contractVersion:'df.audit-response/v1',bindingDigest:input.bindingDigest,materialDigest:input.materialDigest,inputDigest:input.digest,verdict:'passed',coverageRefs:req.material.map(m=>m.recordRef),unexaminedRefs:[],findings:[],...response}),evidenceRef:command()});
  const submitted=x.store.submitAuditResult(reviewer,{taskRef:x.task.taskRef,commandRef:command(),auditRef:req.auditRef,executionRef:execution.executionRef,resultRef:captured.resultRef});
  x.store.workerObservation(x.host,{taskRef:x.task.taskRef,claimRef:held.claimRef,generationRef,sessionRef,commandRef:command(),phase:'stopped',cursor:2,evidenceRef:command()});
  assert.equal(x.store.settleAction(x.host,{taskRef:x.task.taskRef,commandRef:command(),claimRef:held.claimRef,generationRef,outcome:'completed',evidenceRef:captured.evidenceRef}).reservationHeld,false);
  return{artifact:x.store.artifact(x.owner,{taskRef:x.task.taskRef,artifactRef:artifact.artifactRef}),context,req,input,captured,submitted};
}
function nativeArtifact(x,options={}){
  const artifact=x.store.writeArtifact(x.owner,{...x.bind(),artifactRef:command(),version:1,content:'synthetic reviewed artifact 😀'});
  return syntheticNativeReview(x,artifact,options);
}
function chargedSpec(x,record,usageUnits){
  return{...action(x,'write',record.targetDigest,record.digest,command()),charges:{runtimeMs:1000,usageUnits,costState:'estimated',costEstimateMicros:0,costProvenanceRef:r('source-owned-synthetic-local-accounting')}};
}
function publication(x,record,held){return{taskRef:x.task.taskRef,commandRef:command(),deliveryRef:record.deliveryRef,claimRef:held.claimRef,generationRef:held.generationRef,actionDigest:held.actionDigest,observedAt:x.now(),evidenceRef:command()};}
function publicationBytes(x,record,a){return Buffer.byteLength(canonical({taskRef:x.task.taskRef,deliveryRef:record.deliveryRef,artifactRef:a.artifactRef,artifactVersion:a.version,digest:a.digest,recipientRef:record.recipientRef,channelRef:record.channelRef,content:x.store.readData(x.owner,{taskRef:x.task.taskRef,recordRef:a.recordRef}).content}));}
const auditBounds={auditExecutionBounds:{inputByteLimit:65536,resultByteLimit:65536}};
test('normal typed native provenance and publication enforce complete UTF8 U-1/U/U+1 reservation before mutation',t=>{
  for(const offset of [-1,0,1]){
    const x=fixture(t,auditBounds),flow=nativeArtifact(x),a=flow.artifact,record=delivery(x,a),units=publicationBytes(x,record,a),input={...approved(x,chargedSpec(x,record,units+offset)),delivery:{deliveryRef:record.deliveryRef}},before=x.store.snapshot(x.owner,{taskRef:x.task.taskRef});
    const projected=x.store.readLocalArtifact(x.owner,{taskRef:x.task.taskRef,artifactRef:a.artifactRef,version:a.version,digest:a.digest});assert.equal(projected.artifact.verificationBinding.source,'native');
    if(offset<0){denial('BUDGET_LIMIT',()=>x.store.claimLocalDelivery(x.host,input));assert.deepEqual(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),before);continue;}
    const held=x.store.claimLocalDelivery(x.host,input),request=publication(x,record,held),sent=x.store.publishLocalDelivery(x.host,request);
    assert.deepEqual(sent,x.store.getDelivery(x.owner,{taskRef:x.task.taskRef,deliveryRef:record.deliveryRef}));assert.equal(sent.state,'sent');assert.equal(Object.hasOwn(sent,'taskRef'),false);assert.equal(sent.intent.taskRef,x.task.taskRef);assert.deepEqual(sent.currentAccess,{permissionState:'allowed',openability:'unknown'});
    assert.deepEqual(x.store.publishLocalDelivery(x.host,request),sent);
    x.reopen();assert.equal(x.store.getDelivery(x.owner,{taskRef:x.task.taskRef,deliveryRef:record.deliveryRef}).state,'unknown');
  }
});
test('normal publication is fenced by revoke/cancel and historical sent access cannot erase newer denial',t=>{
  for(const control of ['revoke','cancel','access']){
    const x=fixture(t,auditBounds),{artifact:a}=nativeArtifact(x),record=delivery(x,a),held=x.store.claimLocalDelivery(x.host,{...approved(x,chargedSpec(x,record,publicationBytes(x,record,a))),delivery:{deliveryRef:record.deliveryRef}}),request=publication(x,record,held);
    if(control==='revoke')x.store.revokeAction(x.owner,{...x.bind(),actionRef:held.actionRef,actionDigest:held.actionDigest});
    if(control==='cancel')x.store.control(x.owner,{...x.bind(),kind:'cancel'});
    if(control!=='access'){denial('CLAIM_REVOKED',()=>x.store.publishLocalDelivery(x.host,request));assert.equal(x.store.getDelivery(x.owner,{taskRef:x.task.taskRef,deliveryRef:record.deliveryRef}).state,'outbox_committed');continue;}
    x.store.publishLocalDelivery(x.host,request);x.setTime(1100);
    const access={taskRef:x.task.taskRef,commandRef:command(),deliveryRef:record.deliveryRef,artifactRef:a.artifactRef,artifactVersion:a.version,digest:a.digest,recipientRef:record.recipientRef,channelRef:record.channelRef,permissionState:'denied',observedAt:1100,evidenceRef:command()},denied=x.store.recordLocalDeliveryAccess(x.host,access);
    assert.equal(denied.state,'sent');assert.deepEqual(denied.currentAccess,{permissionState:'denied',openability:'unknown'});
    denial('STALE_OBSERVATION',()=>x.store.recordLocalDeliveryAccess(x.host,{...access,commandRef:command(),permissionState:'allowed',observedAt:1050}));assert.deepEqual(x.store.getDelivery(x.owner,{taskRef:x.task.taskRef,deliveryRef:record.deliveryRef}),denied);
  }
});

function statementMaterial(x){return ['completed','unfinished','next','blocker'].map(text=>x.store.putData(x.owner,{...x.bind(),kind:'context',content:'synthetic '+text+' statement',sourceRef:command()}));}
function localProgress(x,a,items){return x.store.writeLocalProgress(x.owner,{...x.bind(),progressRef:command(),kind:'milestone',artifactRef:a.artifactRef,artifactVersion:a.version,digest:a.digest,completedScopeRef:items[0].recordRef,unfinishedRef:items[1].recordRef,nextStepRef:items[2].recordRef,blockerRefs:[items[3].recordRef]});}
function notificationFixture(t,{materialCovered=true,changedManifest=false}={}){
  const x=fixture(t,auditBounds),statements=statementMaterial(x),flow=nativeArtifact(x,{material:statements}),report=localProgress(x,flow.artifact,statements);
  const policy=x.store.configureLocalNotificationPolicy(x.owner,{commandRef:command(),policyRef:command(),expectedRevision:0,spec:{enabled:true,timeZone:'UTC',quietWindows:[],emergencyKinds:[],mergeKinds:['milestone'],mergeWindowMs:0,minIntervalMs:0,frequency:{windowMs:10000,maxClaims:2}}});
  const value=x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:report.progress.progressRef});
  const manifest={version:'df.local-notification/v1',taskRef:x.task.taskRef,ownerRef:x.task.ownerRef,workspaceRef:x.task.workspaceRef,progress:[{progressRef:value.progress.progressRef,digest:value.progress.digest,kind:value.progress.kind,report:value.report,localReport:value.localReport}]};
  if(changedManifest)manifest.progress[0].report={...manifest.progress[0].report,goal:'synthetic invented claim'};
  const notice=x.store.writeArtifact(x.owner,{...x.bind(),artifactRef:command(),version:1,content:canonical(manifest)});
  syntheticNativeReview(x,notice,{context:flow.context,material:materialCovered?statements:[]});
  const binding={policyRef:policy.policyRef,policyRevision:policy.revision,progressRefs:[value.progress.progressRef],mergeKeyRef:command()},intent={...x.bind(),deliveryRef:command(),artifactRef:notice.artifactRef,artifactVersion:notice.version,digest:notice.digest,recipientRef:r('normal-recipient'),channelRef:r('normal-channel'),notification:binding};
  const record=x.store.recordDelivery(x.owner,{...intent,targetDigest:d({ownerRef:x.task.ownerRef,workspaceRef:x.task.workspaceRef,...intent})});
  return{x,flow,report,policy,notice,record,binding};
}
test('normal notification exact manifest/current material gates share one claim; later notification audit does not stale selected artifact report',t=>{
  const {x,report,policy,notice,record,binding}=notificationFixture(t);
  assert.equal(x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:report.progress.progressRef}).currentness,'current');
  const states=x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:report.progress.progressRef}).localReport.sourceStates;assert.equal(states.length,1);
  const input={...approved(x,chargedSpec(x,record,publicationBytes(x,record,notice))),delivery:{deliveryRef:record.deliveryRef}},held=x.store.claimLocalDelivery(x.host,input),count=x.store.getNotificationPolicy(x.owner,{policyRef:policy.policyRef}).windows[0].count;
  assert.equal(count,1);
  const sent=x.store.publishLocalDelivery(x.host,{...publication(x,record,held),notification:{policyRef:binding.policyRef,policyRevision:binding.policyRevision}});
  assert.equal(sent.state,'sent');assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef:policy.policyRef}).windows[0].count,count);
  x.reopen();assert.equal(x.store.getDelivery(x.owner,{taskRef:x.task.taskRef,deliveryRef:record.deliveryRef}).state,'unknown');assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef:policy.policyRef}).windows[0].count,1);
});
test('normal notification false manifest or omitted statement coverage rejects before outbox/frequency/reservation mutation',t=>{
  for(const option of [{changedManifest:true},{materialCovered:false}]){
    const {x,notice,record,policy}=notificationFixture(t,option),input={...approved(x,chargedSpec(x,record,publicationBytes(x,record,notice))),delivery:{deliveryRef:record.deliveryRef}},before=x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),policyBefore=x.store.getNotificationPolicy(x.owner,{policyRef:policy.policyRef});
    denial(option.changedManifest?'NOTIFICATION_BINDING_INVALID':'COVERAGE_UNAVAILABLE',()=>x.store.claimLocalDelivery(x.host,input));
    assert.deepEqual(x.store.snapshot(x.owner,{taskRef:x.task.taskRef}),before);assert.deepEqual(x.store.getNotificationPolicy(x.owner,{policyRef:policy.policyRef}),policyBefore);
    denial(option.changedManifest?'NOTIFICATION_BINDING_INVALID':'COVERAGE_UNAVAILABLE',()=>x.store.claimAction(x.host,{...input,commandRef:command()}));
  }
});
test('normal local report preserves unknown/budget/unexamined/fatal findings without passed or not-run substitution',t=>{
  for(const partition of ['unknown','budget_exhausted','unexamined','fatal']){
    const x=fixture(t,auditBounds),items=statementMaterial(x),artifact=x.store.writeArtifact(x.owner,{...x.bind(),artifactRef:command(),version:1,content:'synthetic nonaccepted reviewed artifact'}),context=protectedContext(x),goal=x.store.listData(x.owner,{taskRef:x.task.taskRef,kind:'goal'})[0];
    const all=[artifact,context,goal,...items].map(m=>m.recordRef),response=partition==='unexamined'?{coverageRefs:all.slice(1),unexaminedRefs:[all[0]]}:partition==='fatal'?{findings:[{findingRef:command(),severity:'fatal',code:'permission_bypass',evidenceRef:command(),resolved:true}]}:{verdict:partition};
    const flow=syntheticNativeReview(x,artifact,{context,material:items,response}),value=localProgress(x,flow.artifact,items);
    assert.equal(value.report.verificationState,{unknown:'unknown',budget_exhausted:'budget_limited',unexamined:'unexamined',fatal:'blocked'}[partition]);assert.equal(value.localReport.verificationBinding.source,'native');
    x.reopen();assert.deepEqual(x.store.readLocalProgress(x.owner,{taskRef:x.task.taskRef,progressRef:value.progress.progressRef}).localReport.sourceStates,value.localReport.sourceStates);
  }
});
test('genuine5 abrupt migration cut keeps durable5 backup and original acknowledgements',t=>{
  const x=genuine5(t),source=new URL('../src/runtime-store.mjs',import.meta.url).href;
  const code=`import {RuntimeStore} from ${JSON.stringify(source)};const owner={},host={};new RuntimeStore({databasePath:process.argv[1],encryptionKey:Buffer.alloc(32,63),clock:()=>1000,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}},{handle:host,role:'host',scope:${JSON.stringify(scope)}}],fixtureMode:true,migrationFault:()=>process.exit(77)});`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code,x.config.databasePath],{encoding:'utf8',timeout:10000});assert.equal(child.status,77);assert.deepEqual(readFileSync(x.config.databasePath+'.schema-5.backup'),x.bytes);
  const old=new Source5(x.config);try{assert.equal(old.diagnostics().schemaVersion,5);assert.deepEqual(old.putMemory(x.owner,x.memoryInput),x.memory);}finally{old.close();}
  assert.deepEqual(encryptedRows(x.config.databasePath),x.cipher);
});
test('genuine5 spilled DELETE hot journal recovers only acknowledged memory then migrates6 without lost held claim',t=>{
  const x=genuine5(t),old=new Source5(x.config),large='synthetic-old-memory-'.repeat(150000);
  const acknowledged=old.putMemory(x.owner,{namespaceRef:x.memoryInput.namespaceRef,commandRef:command(),expectedRevision:1,content:large,sourceRefs:[]});old.close();
  const source=new URL('../../source5/src/runtime-store.mjs',import.meta.url).href,childCommand=command();
  const code=`import {RuntimeStore} from ${JSON.stringify(source)};const owner={},host={};const store=new RuntimeStore({databasePath:process.argv[1],encryptionKey:Buffer.alloc(32,63),clock:()=>1000,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}},{handle:host,role:'host',scope:${JSON.stringify(scope)}}],fixtureMode:true,fixtureFaults:point=>{if(point==='before_commit')process.exit(78)}});store.putMemory(owner,{namespaceRef:${JSON.stringify(x.memoryInput.namespaceRef)},commandRef:${JSON.stringify(childCommand)},expectedRevision:2,content:'synthetic-new-memory-'.repeat(150000),sourceRefs:[]});`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code,x.config.databasePath],{encoding:'utf8',timeout:10000});assert.equal(child.status,78);
  const journal=x.config.databasePath+'-journal';assert.ok(existsSync(journal));assert.equal(readFileSync(journal).subarray(0,8).toString('hex'),'d9d505f920a163d7');
  const current=new RuntimeStore(x.config);try{const memory=current.getMemory(x.owner,{namespaceRef:x.memoryInput.namespaceRef});assert.equal(memory.revision,acknowledged.revision);assert.equal(memory.content,large);assert.equal(current.readMemoryCommand(x.owner,{namespaceRef:x.memoryInput.namespaceRef,commandRef:childCommand}),null);assert.equal(current.snapshot(x.owner,{taskRef:x.ack.task.taskRef}).workers[0].claimRef,x.held.claimRef);}finally{current.close();}
  assert.equal(existsSync(journal),false);assert.equal(new Source5({...x.config,databasePath:x.config.databasePath+'.schema-5.backup'}).diagnostics().schemaVersion,5);
});
