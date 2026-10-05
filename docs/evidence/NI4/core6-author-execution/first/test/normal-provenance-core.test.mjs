// Drafted under SOURCE-ONLY schema6 lease. NOT EXECUTED. These trusted-core
// synthetic fixtures do not establish native capture, installed source or CODE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RuntimeStore,reference as r,canonicalDigest as d} from '../src/runtime-store.mjs';
const scope={ownerId:'ni6-synthetic-owner',workspaceId:'ni6-synthetic-workspace'};
let seq=0;
const command=()=>r('ni6-command-'+ ++seq);
const denial=(code,fn)=>assert.throws(fn,e=>e.code===code&&e.message===code);
function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'df-ni6-author-')),owner={},host={},foreign={};let now=1000;
  const options={databasePath:join(dir,'ledger.db'),encryptionKey:Buffer.alloc(32,61),clock:()=>now,hostPermission:()=>true,principals:[{handle:owner,role:'owner',scope},{handle:host,role:'host',scope},{handle:foreign,role:'owner',scope:{ownerId:'ni6-other-owner',workspaceId:scope.workspaceId}}]};
  let store=new RuntimeStore(options);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  store.policy(owner,{commandRef:command(),expectedVersion:1,limits:{maxActive:2,maxTotalAttempts:16},modelPolicy:{version:1,presetRefs:[r('mock-preset')],catalogEvidenceRef:r('mock-catalog')}});
  const task=store.intake(owner,{taskId:'task',provider:'fixture',source:'fixture',eventId:'fixture-event',goal:'synthetic original goal',commandRef:command()}).task;
  const x={get store(){return store;},owner,host,foreign,task,now:()=>now,setTime:v=>{now=v;},reopen(){store.close();store=new RuntimeStore(options);}};
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
