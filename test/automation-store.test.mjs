import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {RuntimeStore,reference as r,canonicalDigest as d} from '../src/runtime-store.mjs';
const key=Buffer.alloc(32,71),scope={ownerId:'synthetic-owner',workspaceId:'synthetic-workspace'};let seq=0;const command=()=>r('automation-command-'+ ++seq);
function fixture(extra={}){const dir=mkdtempSync(join(tmpdir(),'df-automation-')),owner={},host={},coordinator={},config={databasePath:join(dir,'ledger.db'),encryptionKey:key,principals:[{handle:owner,role:'owner',scope},{handle:host,role:'host',scope},{handle:coordinator,role:'coordinator',scope}],clock:()=>1000,hostPermission:()=>true,...extra},store=new RuntimeStore(config);return{dir,config,store,owner,host,coordinator};}
const error=(code,fn)=>assert.throws(fn,e=>e.code===code&&e.message===code);
const task=x=>x.store.intake(x.owner,{taskId:'task',provider:'fixture',source:'source',eventId:'event',commandRef:command(),goal:'synthetic goal'}).task;
function source(x,kind='internal',routeBinding){return x.store.configureSource(x.owner,{sourceRef:r('source'),commandRef:command(),expectedRevision:0,spec:{kind,enabled:true,identityMode:'unique_id',adapterRef:r('adapter'),permissionPolicyRef:r('permission-policy'),maxEventAgeMs:100,rate:{windowMs:1000,maxEvents:4},...(routeBinding?{routeBinding}:{})}});}
function subscription(x,s,spec={enabled:true,triggerRef:r('trigger'),route:'new_task'}){return x.store.configureSubscription(x.owner,{subscriptionRef:r('subscription'),sourceRef:s.sourceRef,commandRef:command(),expectedRevision:0,expectedSourceRevision:s.revision,spec});}
function ingress(s,u,extra={}){return{sourceRef:s.sourceRef,subscriptionRef:u.subscriptionRef,expectedSourceRevision:s.revision,expectedSubscriptionRevision:u.revision,commandRef:command(),eventRef:r('event'),eventDigest:r('event-digest'),observedAt:1000,receivedAt:1000,taskId:'event-task',providerRef:r('provider'),sourceIdentityRef:r('external-source'),goal:'synthetic event goal',...extra};}
function action(x,t,overrides={}){const policy=x.store.getPolicy(x.owner);if(!policy.modelPolicy)x.store.policy(x.owner,{commandRef:command(),expectedVersion:policy.version,limits:{},modelPolicy:{version:1,presetRefs:[r('preset')],catalogEvidenceRef:r('catalog')}});const version=x.store.getPolicy(x.owner).version;return{actionRef:command(),kind:'write',role:'worker',targetDigest:r('target'),dataDigest:r('data'),units:1,charges:{runtimeMs:10,usageUnits:1,costEstimateMicros:1},attemptGroupRef:r('attempt'),attemptIndex:1,resourcePolicyVersion:version,modelPolicyVersion:1,model:{presetRef:r('preset'),modelRef:r('model'),reasoningRef:r('reasoning'),catalogEvidenceRef:r('catalog')},executor:{mode:'create',generationRef:command(),sessionRef:command(),environmentRef:r('environment'),bindingDigest:r('binding'),toolsDigest:r('tools'),permissionPolicyDigest:r('permission')},...overrides};}
function admitted(x,t,spec){const a=x.store.planAction(x.owner,{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch,spec});const g=x.store.grantAction(x.owner,{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch,actionRef:a.actionRef,actionDigest:a.actionDigest,expiresAt:2000});return x.store.claimAction(x.host,{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:g.authEpoch,actionRef:a.actionRef,actionDigest:a.actionDigest});}

test('schema3 crypto2 migration validates source before exact backup and preserves ciphertext',()=>{for(const corrupt of [false,true]){const x=fixture(),t=task(x);x.store.close();const db=new DatabaseSync(x.config.databasePath);db.exec('DROP TABLE workspace_memory;DROP TABLE automation_records;PRAGMA user_version=3');if(corrupt){const row=db.prepare('SELECT metadata FROM runtime_data').get(),m=JSON.parse(row.metadata);m.generationRef=r('forged');db.prepare('UPDATE runtime_data SET metadata=?').run(JSON.stringify(m));}db.close();const original=readFileSync(x.config.databasePath);if(corrupt){error('STORAGE_INVALID',()=>new RuntimeStore(x.config));assert.deepEqual(readFileSync(x.config.databasePath),original);assert(!readdirSync(x.dir).some(n=>n.endsWith('.backup')));}else{const store=new RuntimeStore(x.config);assert.equal(store.diagnostics().schemaVersion,4);assert.deepEqual(readFileSync(x.config.databasePath+'.schema-3.backup'),original);assert.equal(store.listData(x.owner,{taskRef:t.taskRef})[0].cryptoVersion,2);store.close();}}});

test('encrypted memory CAS, registered secrets, exact replay and tombstone/absence guards',()=>{const secret='SYNTHETIC_MEMORY_SECRET',x=fixture({forbiddenSecrets:[secret]}),namespaceRef=r('namespace'),t=task(x),base={namespaceRef,commandRef:command(),expectedRevision:0,content:'synthetic memory',sourceRefs:[r('source')],requestDigest:r('request')};error('SECRET_REJECTED',()=>x.store.putMemory(x.owner,{...base,content:secret}));const m=x.store.putMemory(x.owner,base);assert.deepEqual(x.store.putMemory(x.owner,base),m);assert.equal(x.store.memoryCommandReceipt(x.owner,{namespaceRef,commandRef:base.commandRef,requestDigest:base.requestDigest}).revision,1);error('IDEMPOTENCY_CONFLICT',()=>x.store.putMemory(x.owner,{...base,content:'changed'}));error('STALE_MEMORY',()=>x.store.putData(x.owner,{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch,kind:'context',content:'context',sourceRef:r('source'),expectedMemory:{namespaceRef,revision:0}}));const gone=x.store.deleteMemory(x.owner,{namespaceRef,commandRef:command(),expectedRevision:1});assert(gone.deleted);assert.equal(x.store.getMemory(x.owner,{namespaceRef}).content,undefined);error('MEMORY_DELETED',()=>x.store.putMemory(x.owner,{...base,commandRef:command(),expectedRevision:2}));x.store.close();for(const file of readdirSync(x.dir)){assert(!readFileSync(join(x.dir,file)).includes(Buffer.from('synthetic memory')));assert(!readFileSync(join(x.dir,file)).includes(key));}const reopened=new RuntimeStore(x.config);assert.equal(reopened.getMemory(x.owner,{namespaceRef}).deleted,true);reopened.close();});

test('atomic event intake/dedup/rate/version faults retain complete ingress and original association',()=>{let armed=false;const x=fixture({fixtureMode:true,fixtureFaults:()=>{if(armed)throw Error('SYNTHETIC_SECRET');}}),s=source(x),u=subscription(x,s),input=ingress(s,u);armed=true;error('FIXTURE_CUT',()=>x.store.ingestEvent(x.host,input));armed=false;assert.equal(x.store.listTasks(x.owner).length,0);assert.equal(x.store.listEventReceipts(x.host,{sourceRef:s.sourceRef,subscriptionRef:u.subscriptionRef}).length,0);const accepted=x.store.ingestEvent(x.host,input);assert.equal(accepted.deduplicated,false);assert.equal(x.store.readData(x.owner,{taskRef:accepted.taskRef,recordRef:accepted.goalRecordRef}).digest,accepted.goalDigest);const duplicate=x.store.ingestEvent(x.host,{...input,commandRef:command(),taskId:'cannot-rebind'});assert.equal(duplicate.task.taskRef,accepted.task.taskRef);assert.equal(duplicate.goalRecordRef,accepted.goalRecordRef);assert.equal(duplicate.goalDigest,accepted.goalDigest);assert(duplicate.deduplicated);error('IDEMPOTENCY_CONFLICT',()=>x.store.ingestEvent(x.host,{...input,commandRef:command(),eventDigest:r('changed')}));error('EVENT_EXPIRED',()=>x.store.ingestEvent(x.host,{...input,commandRef:command(),eventRef:r('expired'),observedAt:899}));error('EVENT_CLOCK_INVALID',()=>x.store.ingestEvent(x.host,{...input,commandRef:command(),eventRef:r('future'),receivedAt:1001}));const next=x.store.configureSource(x.owner,{sourceRef:s.sourceRef,commandRef:command(),expectedRevision:1,spec:{...s.spec,enabled:false}});error('STALE_SOURCE',()=>x.store.ingestEvent(x.host,{...input,commandRef:command()}));error('SOURCE_DISABLED',()=>x.store.ingestEvent(x.host,{...input,expectedSourceRevision:next.revision,commandRef:command()}));x.store.close();const reopened=new RuntimeStore(x.config);assert.equal(reopened.eventReceipt(x.host,{sourceRef:s.sourceRef,subscriptionRef:u.subscriptionRef,eventRef:input.eventRef}).state,'registered');reopened.close();});

test('chat source original private route authorizes read/control but changed pairing and unrelated supplement fail',()=>{const x=fixture(),routeBinding={pairingRef:r('pair'),pairingRevision:1,principalRef:r('peer'),conversationRef:r('conversation'),threadRef:r('thread'),conversationKind:'private'},s=source(x,'chat',routeBinding),u=subscription(x,s),event=x.store.ingestEvent(x.host,ingress(s,u,{routeBinding})),binding={sourceRef:s.sourceRef,subscriptionRef:u.subscriptionRef,expectedSourceRevision:1,expectedSubscriptionRevision:1,taskRef:event.taskRef};assert.equal(x.store.chatTask(x.host,binding).task.taskRef,event.taskRef);const paused=x.store.chatControl(x.host,{...binding,commandRef:command(),expectedTaskVersion:1,expectedAuthEpoch:0,kind:'pause'});assert.equal(paused.control,'paused');const unrelated=task(x),supp=x.store.configureSubscription(x.owner,{subscriptionRef:u.subscriptionRef,sourceRef:s.sourceRef,commandRef:command(),expectedRevision:1,expectedSourceRevision:1,spec:{enabled:true,triggerRef:r('trigger'),route:'supplement',targetTaskRef:unrelated.taskRef}});error('ROUTE_MISMATCH',()=>x.store.ingestEvent(x.host,ingress(s,supp,{routeBinding,eventRef:r('supplement'),targetTaskRef:unrelated.taskRef,expectedTaskVersion:1,expectedAuthEpoch:0})));const changed=x.store.configureSource(x.owner,{sourceRef:s.sourceRef,commandRef:command(),expectedRevision:1,spec:{...s.spec,routeBinding:{...routeBinding,pairingRef:r('other-pair')}}});error('ROUTE_MISMATCH',()=>x.store.chatTask(x.host,{...binding,expectedSourceRevision:changed.revision,expectedSubscriptionRevision:supp.revision}));x.store.close();});

test('missed-run verification cannot advance cursor or ingest before exact private owner approval',()=>{const x=fixture(),s=source(x,'schedule'),u=subscription(x,s),clock={sourceRef:s.sourceRef,subscriptionRef:u.subscriptionRef,expectedSourceRevision:1,expectedSubscriptionRevision:1,clockRef:r('clock'),expectedCursor:null},planDigest=r('plan');const pending=x.store.advanceEventClock(x.host,{...clock,commandRef:command(),through:1000,decision:'verification_required',planDigest});assert.equal(pending.cursor,null);assert.equal(pending.pendingVerification.approved,false);error('VERIFICATION_REQUIRED',()=>x.store.advanceEventClock(x.host,{...clock,commandRef:command(),through:1000,decision:'skipped',planDigest}));error('VERIFICATION_REQUIRED',()=>x.store.ingestEvent(x.host,ingress(s,u,{clockRef:clock.clockRef,expectedCursor:null,scheduledAt:1000,verificationPlanDigest:planDigest})));x.store.approveEventClock(x.owner,{...clock,commandRef:command(),planDigest});x.store.ingestEvent(x.host,ingress(s,u,{clockRef:clock.clockRef,expectedCursor:null,scheduledAt:1000,verificationPlanDigest:planDigest}));assert.equal(x.store.eventClock(x.host,{sourceRef:s.sourceRef,subscriptionRef:u.subscriptionRef,clockRef:clock.clockRef}).cursor,1000);x.store.close();});

test('context wakeup consumes one immutable intent, duplicates/restart never admit again and reservations remain held',()=>{const x=fixture(),t=task(x),data=x.store.putData(x.owner,{taskRef:t.taskRef,commandRef:command(),kind:'context',content:'synthetic complete execution envelope',sourceRef:r('source'),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch}),c=admitted(x,data.task,action(x,data.task,{dataDigest:data.digest}));x.store.workerObservation(x.host,{taskRef:t.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,commandRef:command(),phase:'ready',evidenceRef:r('ready')});const current=x.store.task(x.owner,t.taskRef),input={taskRef:t.taskRef,actionRef:c.actionRef,actionDigest:c.actionDigest,claimRef:c.claimRef,generationRef:c.generationRef,contextRecordRef:data.recordRef,commandRef:command(),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch},begin=x.store.beginContextExecution(x.host,input);assert.equal(begin.deduplicated,false);assert.equal(x.store.beginContextExecution(x.host,input).deduplicated,true);const consume={taskRef:t.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,actionDigest:c.actionDigest,executionRef:begin.executionRef};assert.equal(x.store.assertExecutionCurrent(x.host,consume).admitted,true);assert.equal(x.store.assertExecutionCurrent(x.host,consume).admitted,false);x.store.close();const reopened=new RuntimeStore(x.config);assert.equal(reopened.assertExecutionCurrent(x.host,consume).admitted,false);assert.equal(reopened.beginContextExecution(x.host,input).state,'unknown');assert.equal(reopened.diagnostics().restricted,false);assert.equal(reopened.snapshot(x.owner,{taskRef:t.taskRef}).workers[0].claimRef,c.claimRef);reopened.close();});


test('two already-open independent processes race final context consume and exactly one gets fresh admission',async()=>{
  const x=fixture(),moduleUrl=new URL('../src/runtime-store.mjs',import.meta.url).href;
  const children=Array.from({length:2},()=>{
    const code=`import{RuntimeStore}from${JSON.stringify(moduleUrl)};const host={};const store=new RuntimeStore({databasePath:${JSON.stringify(x.config.databasePath)},encryptionKey:Buffer.alloc(32,71),principals:[{handle:host,role:'host',scope:${JSON.stringify(scope)}}],clock:()=>1000,hostPermission:()=>true});process.send('ready');process.on('message',input=>{let result;try{result=store.assertExecutionCurrent(host,input).admitted;}catch(error){result=error.code;}store.close();process.send(result);process.disconnect();});`;
    const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','ignore','pipe','ipc']});
    return{child,ready:new Promise(resolve=>child.once('message',resolve)),result:new Promise(resolve=>child.on('message',value=>{if(value!=='ready')resolve(value);})),closed:new Promise(resolve=>child.once('exit',resolve))};
  });
  await Promise.all(children.map(c=>c.ready));
  const t=task(x),data=x.store.putData(x.owner,{taskRef:t.taskRef,commandRef:command(),kind:'context',content:'synthetic race execution envelope',sourceRef:r('source'),expectedTaskVersion:t.version,expectedAuthEpoch:0}),c=admitted(x,data.task,action(x,data.task,{dataDigest:data.digest}));
  x.store.workerObservation(x.host,{taskRef:t.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,commandRef:command(),phase:'ready',evidenceRef:r('ready')});
  const now=x.store.task(x.owner,t.taskRef),intent=x.store.beginContextExecution(x.host,{taskRef:t.taskRef,actionRef:c.actionRef,actionDigest:c.actionDigest,claimRef:c.claimRef,generationRef:c.generationRef,contextRecordRef:data.recordRef,commandRef:command(),expectedTaskVersion:now.version,expectedAuthEpoch:now.authEpoch});
  for(const child of children)child.child.send({taskRef:t.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,actionDigest:c.actionDigest,executionRef:intent.executionRef});
  assert.deepEqual((await Promise.all(children.map(c=>c.result))).sort(),[false,true]);await Promise.all(children.map(c=>c.closed));
  assert.equal(x.store.snapshot(x.owner,{taskRef:t.taskRef}).executions[0].state,'dispatch_intent');x.store.close();
});

test('new authenticated workspace routing, memory and once-only inverse markers reject corruption without rewriting originals',()=>{
  for(const target of ['source-payload','memory-metadata','execution-delete','audit-delete']){
    const x=fixture(),t=task(x);let s;
    if(target==='source-payload')s=source(x);
    if(target==='memory-metadata')x.store.putMemory(x.owner,{namespaceRef:r('namespace'),commandRef:command(),expectedRevision:0,content:'synthetic private memory',sourceRefs:[r('source')]});
    if(target==='execution-delete'){
      const data=x.store.putData(x.owner,{taskRef:t.taskRef,commandRef:command(),kind:'context',content:'synthetic context',sourceRef:r('source'),expectedTaskVersion:t.version,expectedAuthEpoch:0}),c=admitted(x,data.task,action(x,data.task,{dataDigest:data.digest}));const now=x.store.task(x.owner,t.taskRef);
      x.store.beginContextExecution(x.host,{taskRef:t.taskRef,actionRef:c.actionRef,actionDigest:c.actionDigest,claimRef:c.claimRef,generationRef:c.generationRef,contextRecordRef:data.recordRef,commandRef:command(),expectedTaskVersion:now.version,expectedAuthEpoch:now.authEpoch});
    }
    if(target==='audit-delete'){
      const artifact=x.store.writeArtifact(x.owner,{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:0,artifactRef:r('artifact'),version:1,content:'synthetic artifact'});
      x.store.configureAudit(x.owner,{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:artifact.task.version,expectedAuthEpoch:0,auditRef:r('audit'),expectedAuditRevision:0,artifactRef:artifact.artifactRef,artifactVersion:1,digest:artifact.digest,material:[{recordRef:artifact.recordRef,digest:artifact.digest}],policyRef:r('audit-policy'),blockingSeverities:[],maxRepairRounds:0});
    }
    x.store.close();const db=new DatabaseSync(x.config.databasePath);
    if(target==='source-payload'){const row=db.prepare("SELECT payload FROM automation_records WHERE kind='source'").get(),payload=JSON.parse(row.payload);payload.data.spec.enabled=false;db.prepare("UPDATE automation_records SET payload=? WHERE kind='source'").run(JSON.stringify(payload));}
    if(target==='memory-metadata'){const row=db.prepare('SELECT metadata FROM workspace_memory').get(),metadata=JSON.parse(row.metadata);metadata.sourceRefs=[r('forged-source')];db.prepare('UPDATE workspace_memory SET metadata=?').run(JSON.stringify(metadata));}
    if(target==='execution-delete')db.exec("DELETE FROM automation_records WHERE kind='execution'");
    if(target==='audit-delete')db.exec("DELETE FROM automation_records WHERE kind='audit'");
    db.close();const before=readFileSync(x.config.databasePath),entries=readdirSync(x.dir);error('STORAGE_INVALID',()=>new RuntimeStore(x.config));assert.deepEqual(readFileSync(x.config.databasePath),before);assert.deepEqual(readdirSync(x.dir),entries);
  }
});


test('complete signed memory receipts retain historical truth and reject live edits, stripping and removed boundaries',()=>{
  for(const mutation of ['revision','mac','digest','operation','task','strip','boundary-delete','legacy-marker-delete']){
    const x=fixture(),namespaceRef=r('receipt-namespace'),input={namespaceRef,commandRef:command(),expectedRevision:0,content:'synthetic memory v1',sourceRefs:[r('receipt-source')],requestDigest:r('receipt-request')};
    const first=x.store.putMemory(x.owner,input);
    x.store.putMemory(x.owner,{...input,commandRef:command(),expectedRevision:1,content:'synthetic memory v2',requestDigest:r('receipt-request-v2')});
    x.store.deleteMemory(x.owner,{namespaceRef,commandRef:command(),expectedRevision:2});
    assert.deepEqual(x.store.putMemory(x.owner,input),first);
    assert.deepEqual(x.store.memoryCommandReceipt(x.owner,{namespaceRef,commandRef:input.commandRef,requestDigest:input.requestDigest}),first);
    const db=new DatabaseSync(x.config.databasePath),row=db.prepare('SELECT * FROM runtime_commands WHERE id=?').get(input.commandRef),envelope=JSON.parse(row.receipt);
    if(mutation==='revision')envelope.data.revision=999;
    if(mutation==='mac')envelope.mac=r('incorrect-mac');
    if(mutation==='strip')db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(envelope.data),input.commandRef);
    else if(['digest','operation','task'].includes(mutation))db.prepare('UPDATE runtime_commands SET '+mutation+'=? WHERE id=?').run(mutation==='operation'?'deleteMemory':r('changed-'+mutation),input.commandRef);
    else if(mutation==='boundary-delete')db.exec("DELETE FROM automation_records WHERE kind='receipt_policy'");
    else if(mutation==='legacy-marker-delete'){// No legacy marker may be forged for a new command.
      db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(envelope.data),input.commandRef);
    }else db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(envelope),input.commandRef);
    db.close();
    error('STORAGE_INVALID',()=>x.store.putMemory(x.owner,input));
    error('STORAGE_INVALID',()=>x.store.memoryCommandReceipt(x.owner,{namespaceRef,commandRef:input.commandRef,requestDigest:input.requestDigest}));
    x.store.close();const original=readFileSync(x.config.databasePath),entries=readdirSync(x.dir);
    error('STORAGE_INVALID',()=>new RuntimeStore(x.config));assert.deepEqual(readFileSync(x.config.databasePath),original);assert.deepEqual(readdirSync(x.dir),entries);
  }
});

test('genuine schema3 plaintext receipt history migrates preserved but never becomes trusted replay',()=>{
  const x=fixture(),input={taskId:'legacy-task',provider:'fixture',source:'legacy-source',eventId:'legacy-event',commandRef:command(),goal:'legacy synthetic goal'},receipt=x.store.intake(x.owner,input);x.store.close();
  const db=new DatabaseSync(x.config.databasePath),row=db.prepare('SELECT receipt FROM runtime_commands WHERE id=?').get(input.commandRef),plain=JSON.stringify(JSON.parse(row.receipt).data);
  db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(plain,input.commandRef);
  db.exec('DROP TABLE workspace_memory;DROP TABLE automation_records;PRAGMA user_version=3');db.close();
  const original=readFileSync(x.config.databasePath),reopened=new RuntimeStore(x.config);
  assert.deepEqual(readFileSync(x.config.databasePath+'.schema-3.backup'),original);
  assert.equal(reopened.task(x.owner,receipt.task.taskRef).version,receipt.task.version);
  error('CRYPTO_LEGACY_RECEIPT_UNVERIFIED',()=>reopened.intake(x.owner,input));
  const writer=new DatabaseSync(x.config.databasePath);assert.equal(writer.prepare('SELECT receipt FROM runtime_commands WHERE id=?').get(input.commandRef).receipt,plain);writer.close();
  reopened.close();const healthy=new RuntimeStore(x.config);assert.equal(healthy.task(x.owner,receipt.task.taskRef).version,receipt.task.version);healthy.close();
  const edit=new DatabaseSync(x.config.databasePath);edit.exec("DELETE FROM automation_records WHERE kind='legacy_command'");edit.close();const before=readFileSync(x.config.databasePath);error('STORAGE_INVALID',()=>new RuntimeStore(x.config));assert.deepEqual(readFileSync(x.config.databasePath),before);
});

function notificationFixture(extra={}){
  let now=1000;const x=fixture({...extra,clock:()=>now});x.setTime=value=>{now=value;};
  x.policySpec={enabled:true,timeZone:'UTC',quietWindows:[],emergencyKinds:[],mergeKinds:['milestone'],mergeWindowMs:0,minIntervalMs:0,frequency:{windowMs:1000,maxClaims:2}};
  x.setNotification=spec=>x.store.configureNotificationPolicy(x.owner,{commandRef:command(),policyRef:r('notification-policy'),expectedRevision:x.notification?.revision||0,spec});
  x.notification=x.setNotification(x.policySpec);
  x.current=taskRef=>x.store.task(x.owner,taskRef);
  x.binding=taskRef=>{const t=x.current(taskRef);return{taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch};};
  x.artifact=taskId=>{
    const t=x.store.intake(x.owner,{taskId,provider:'fixture',source:'notification-source',eventId:'event-'+taskId,commandRef:command()}).task;
    const a=x.store.writeArtifact(x.owner,{...x.binding(t.taskRef),artifactRef:command(),version:1,content:'synthetic notification artifact '+taskId});
    const spec=action(x,a.task,{kind:'review',role:'review',attemptGroupRef:command(),dataDigest:a.digest,charges:{runtimeMs:0,usageUnits:0,costEstimateMicros:0},executor:{mode:'none',generationRef:command(),environmentRef:r('environment'),bindingDigest:r('binding'),toolsDigest:r('tools'),permissionPolicyDigest:r('permission')}}),reviewer={},claim=admitted(x,a.task,spec);
    x.store.bindExecution(x.host,reviewer,{taskRef:t.taskRef,role:'reviewer',generationRef:claim.generationRef,readRecordRefs:[a.recordRef]});
    x.store.verifyArtifact(reviewer,{taskRef:t.taskRef,commandRef:command(),artifactRef:a.artifactRef,version:1,digest:a.digest,verdict:'accepted',evidenceRef:r('review-proof')});
    x.store.settleAction(x.host,{taskRef:t.taskRef,claimRef:claim.claimRef,generationRef:claim.generationRef,commandRef:command(),outcome:'completed',evidenceRef:r('review-proof')});
    return{taskRef:t.taskRef,...a};
  };
  x.progress=(a,content,kind='milestone')=>x.store.writeProgress(x.owner,{...x.binding(a.taskRef),progressRef:command(),kind,content});
  x.delivery=(a,progress,more={})=>{
    const input={...x.binding(a.taskRef),deliveryRef:command(),artifactRef:a.artifactRef,artifactVersion:1,digest:a.digest,recipientRef:r('recipient'),channelRef:r('channel'),notification:{policyRef:x.notification.policyRef,policyRevision:x.notification.revision,progressRefs:progress.map(p=>p.progressRef),mergeKeyRef:r('merge-group')},...more};
    return x.store.recordDelivery(x.owner,{...input,targetDigest:d({ownerRef:r(scope.ownerId),workspaceRef:r(scope.workspaceId),...input})});
  };
  x.approve=delivery=>{
    const t=x.current(delivery.intent.taskRef),spec=action(x,t,{attemptGroupRef:command(),targetDigest:delivery.targetDigest,dataDigest:delivery.digest,charges:{runtimeMs:0,usageUnits:0,costEstimateMicros:0},executor:{mode:'none',generationRef:command(),environmentRef:r('environment'),bindingDigest:r('binding'),toolsDigest:r('tools'),permissionPolicyDigest:r('permission')}});
    const a=x.store.planAction(x.owner,{...x.binding(t.taskRef),spec}),grant=x.store.grantAction(x.owner,{...x.binding(t.taskRef),actionRef:a.actionRef,actionDigest:a.actionDigest,expiresAt:100000000});
    return{taskRef:t.taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:grant.authEpoch,actionRef:a.actionRef,actionDigest:a.actionDigest,delivery:{deliveryRef:delivery.deliveryRef}};
  };
  x.finish=(delivery,claim,state='delivered')=>{
    x.store.deliveryObservation(x.host,{taskRef:claim.task.taskRef,commandRef:command(),deliveryRef:delivery.deliveryRef,claimRef:claim.claimRef,generationRef:claim.generationRef,state,evidenceRef:command(),permissionState:'allowed',openability:'openable',observedAt:now});
    return x.store.settleAction(x.host,{taskRef:claim.task.taskRef,commandRef:command(),claimRef:claim.claimRef,generationRef:claim.generationRef,outcome:state==='failed'?'failed':'completed',evidenceRef:command()});
  };
  return x;
}

test('notification quiet/merge windows, explicit emergency exception and zero frequency gate under claim',()=>{
  for(const boundary of ['quiet','merge-wait','merge-at','emergency','frequency-zero']){
    const x=notificationFixture();
    x.notification=x.setNotification({...x.policySpec,quietWindows:['quiet','emergency'].includes(boundary)?[{startMinute:0,endMinute:1440}]:[],emergencyKinds:boundary==='emergency'?['obstacle']:[],mergeWindowMs:boundary.startsWith('merge')?100:0,frequency:{windowMs:1000,maxClaims:boundary==='frequency-zero'?0:2}});
    const a=x.artifact('task'),p=x.progress(a,'synthetic bounded milestone',boundary==='emergency'?'obstacle':'milestone'),delivery=x.delivery(a,[p]),input=x.approve(delivery);
    if(boundary==='merge-at')x.setTime(1100);
    if(boundary==='quiet')error('NOTIFICATION_QUIET',()=>x.store.claimAction(x.host,input));
    else if(boundary==='merge-wait')error('NOTIFICATION_COALESCING',()=>x.store.claimAction(x.host,input));
    else if(boundary==='frequency-zero')error('NOTIFICATION_FREQUENCY',()=>x.store.claimAction(x.host,input));
    else{const claim=x.store.claimAction(x.host,input);assert.equal(x.store.snapshot(x.owner,{taskRef:a.taskRef}).notifications.length,1);assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef:x.notification.policyRef}).windows[0].count,1);assert(x.finish(delivery,claim).releaseEvidenceRef);}
    x.store.close();
  }
});

test('notification pending group survives revision/new progress/reopen; delivered facts dedup by digest and failed retries require release',()=>{
  for(const outcome of ['delivered','failed']){
    const x=notificationFixture(),a=x.artifact('task'),p=x.progress(a,'synthetic same fact'),delivery=x.delivery(a,[p]),claim=x.store.claimAction(x.host,x.approve(delivery));
    const newer=x.progress(a,'synthetic newer fact'),attempt=x.delivery(a,[newer]),approved=x.approve(attempt);
    error('NOTIFICATION_PENDING',()=>x.store.claimAction(x.host,approved));
    x.notification=x.setNotification({...x.policySpec,frequency:{windowMs:1000,maxClaims:10}});
    x.store.close();x.store=new RuntimeStore(x.config);
    const snap=x.store.snapshot(x.owner,{taskRef:a.taskRef});assert.equal(snap.notifications[0].state,'unknown');assert.equal(snap.notifications[0].released,false);
    x.setTime(1100);assert(x.finish(delivery,claim,outcome).releaseEvidenceRef);
    const same=x.progress(a,'synthetic same fact'),retry=x.delivery(a,[same],outcome==='failed'?{previousDeliveryRef:delivery.deliveryRef}:{}),retryInput=x.approve(retry);
    if(outcome==='delivered')error('NOTIFICATION_DUPLICATE',()=>x.store.claimAction(x.host,retryInput));
    else{const retryClaim=x.store.claimAction(x.host,retryInput);assert(x.finish(retry,retryClaim).releaseEvidenceRef);}
    x.store.close();
  }
});

test('two independent processes atomically compete for last notification frequency slot',async()=>{
  const x=notificationFixture();x.notification=x.setNotification({...x.policySpec,frequency:{windowMs:1000,maxClaims:1}});
  const a=x.artifact('first'),p=x.progress(a,'synthetic first fact'),first=x.approve(x.delivery(a,[p]));
  const b=x.artifact('second'),q=x.progress(b,'synthetic second fact'),second=x.approve(x.delivery(b,[q]));
  const moduleUrl=new URL('../src/runtime-store.mjs',import.meta.url).href;
  const contenders=[first,second].map(input=>{
    const code=`import{RuntimeStore}from${JSON.stringify(moduleUrl)};const host={};const store=new RuntimeStore({databasePath:${JSON.stringify(x.config.databasePath)},encryptionKey:Buffer.alloc(32,71),principals:[{handle:host,role:'host',scope:${JSON.stringify(scope)}}],clock:()=>1000,hostPermission:()=>true});process.send('ready');process.on('message',input=>{let result;try{store.claimAction(host,input);result='admitted';}catch(e){result=e.code;}store.close();process.send(result);process.disconnect();});`;
    const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','ignore','pipe','ipc']});
    return{child,input,ready:new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);}),result:new Promise(resolve=>child.on('message',value=>{if(value!=='ready')resolve(value);})),closed:new Promise(resolve=>child.once('exit',resolve))};
  });
  await Promise.all(contenders.map(contender=>contender.ready));
  for(const contender of contenders)contender.child.send(contender.input);
  assert.deepEqual((await Promise.all(contenders.map(contender=>contender.result))).sort(),['NOTIFICATION_FREQUENCY','admitted']);
  await Promise.all(contenders.map(contender=>contender.closed));
  assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef:x.notification.policyRef}).windows[0].count,1);x.store.close();
});

test('composite handoff branch updates semantic requirements while holding pending ownership',()=>{
  const x=fixture(),t=task(x),claim=admitted(x,t,action(x,t)),before=x.store.snapshot(x.owner,{taskRef:t.taskRef}).semanticRevision,current=x.store.task(x.owner,t.taskRef);
  x.store.putHandoff(x.owner,{taskRef:t.taskRef,claimRef:claim.claimRef,generationRef:claim.generationRef,actionDigest:claim.actionDigest,commandRef:command(),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch,content:'synthetic handoff branch',sourceRef:claim.actionRef});
  const snap=x.store.snapshot(x.owner,{taskRef:t.taskRef});assert.equal(snap.semanticRevision,before+1);assert.equal(snap.workers[0].handoff.state,'pending');assert.equal(snap.actions[0].releaseEvidenceRef,null);x.store.close();
});

test('notification claim faults roll back outbox/counters/ownership and deleted authoritative associations preserve rejection bytes',()=>{
  for(const target of ['before-commit','group-delete','fact-delete','claim-delete','window-tamper']){
    let armed=false;const x=notificationFixture({fixtureMode:true,fixtureFaults:()=>{if(armed)throw Error('SYNTHETIC_SECRET');}}),a=x.artifact('task'),p=x.progress(a,'synthetic accountable notification'),delivery=x.delivery(a,[p]),input=x.approve(delivery);
    if(target==='before-commit'){
      armed=true;error('FIXTURE_CUT',()=>x.store.claimAction(x.host,input));armed=false;
      assert.equal(x.store.getDelivery(x.owner,{taskRef:a.taskRef,deliveryRef:delivery.deliveryRef}).state,'accepted');assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef:x.notification.policyRef}).windows.length,0);assert.equal(x.store.snapshot(x.owner,{taskRef:a.taskRef}).notifications.length,0);
      x.store.claimAction(x.host,input);assert.equal(x.store.getNotificationPolicy(x.owner,{policyRef:x.notification.policyRef}).windows[0].count,1);x.store.close();continue;
    }
    x.store.claimAction(x.host,input);x.store.close();const db=new DatabaseSync(x.config.databasePath);
    if(target==='window-tamper'){const row=db.prepare("SELECT payload FROM automation_records WHERE kind='notification_window'").get(),payload=JSON.parse(row.payload);payload.data.count=0;db.prepare("UPDATE automation_records SET payload=? WHERE kind='notification_window'").run(JSON.stringify(payload));}
    else db.exec("DELETE FROM automation_records WHERE kind='notification_"+target.split('-')[0]+"'");
    db.close();const before=readFileSync(x.config.databasePath),entries=readdirSync(x.dir);error('STORAGE_INVALID',()=>new RuntimeStore(x.config));assert.deepEqual(readFileSync(x.config.databasePath),before);assert.deepEqual(readdirSync(x.dir),entries);
  }
});
