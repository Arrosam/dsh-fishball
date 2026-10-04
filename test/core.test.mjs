import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Foundation, FoundationError } from '../src/foundation.mjs';
import { legacySchemaSql } from '../src/ledger.mjs';
const S={ownerId:'owner',workspaceId:'workspace'}, W={ownerId:'owner',workspaceId:'other'}, O={ownerId:'other',workspaceId:'workspace'};
const D='1'.repeat(64), E='2'.repeat(64);
const MODULE=fileURLToPath(new URL('../src/foundation.mjs',import.meta.url));
function setup(t,options={}) { const dir=mkdtempSync(join(tmpdir(),'df-core-')),databasePath=join(dir,'ledger.db'),capability={};let now=1000;const core=new Foundation({databasePath,clock:()=>now,hostPermission:()=>true,trustedOperators:[{scope:S,capability}],...options});t.after(()=>{core.close();rmSync(dir,{recursive:true,force:true});});return {core,dir,databasePath,capability,setTime:value=>now=value}; }
function intake(core,id='task',scope=S,eventId=id,more={}) {return core.intake(scope,{taskId:id,provider:'fixture',source:'source',eventId,...more});}
function request(core,task='task',action='action',version=core.getTask(S,task).version,more={}) {return core.requestAction(S,task,{actionId:action,kind:'fixture',targetDigest:D,dataDigest:E,limits:{units:1},expectedVersion:version,...more});}
function approved(x,task='task',action='action') {intake(x.core,task);request(x.core,task,action);x.core.grant(x.capability,S,task,action,{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000});}
const rejects=(fn,code)=>assert.throws(fn,error=>error instanceof FoundationError && error.code===code && error.message===code);
function child(code) { return spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000,maxBuffer:16384}); }
function childBase(path,extra='') { return `import {Foundation} from ${JSON.stringify(MODULE)};import{writeFileSync,existsSync}from'node:fs';const scope=${JSON.stringify(S)},cap={};const core=new Foundation({databasePath:${JSON.stringify(path)},clock:()=>1000,hostPermission:()=>true,trustedOperators:[{scope,capability:cap}],${extra}});`; }

test('durable full ingress identity and scoped CAS/history/tombstone survive reopen',t=>{
 const x=setup(t);assert.equal(intake(x.core).task.version,1);assert.equal(intake(x.core,'another',S,'task').deduplicated,true);
 for(const [id,scope,more] of [['source',S,{source:'other'}],['provider',S,{provider:'other'}],['workspace',W,{}],['owner',O,{}]]) assert.equal(intake(x.core,id,scope,'task',more).deduplicated,false);
 assert.equal(intake(x.core,'event',S,'new-event').deduplicated,false);
 rejects(()=>x.core.getTask(W,'task'),'TASK_NOT_FOUND');rejects(()=>x.core.getTask(O,'task'),'TASK_NOT_FOUND');
 rejects(()=>x.core.transition(S,'task',{expectedVersion:1,status:'completed',reason:'progress'}),'ILLEGAL_TRANSITION');
 x.core.transition(S,'task',{expectedVersion:1,status:'waiting',reason:'progress'});
 rejects(()=>x.core.transition(S,'task',{expectedVersion:1,status:'queued',reason:'progress'}),'STALE_VERSION');
 x.core.transition(S,'task',{expectedVersion:2,status:'completed',reason:'progress'});
 rejects(()=>x.core.transition(S,'task',{expectedVersion:3,status:'queued',reason:'progress'}),'TASK_TERMINAL');
 x.core.deleteTask(x.capability,S,'task',{expectedVersion:3});x.core.close();
 const reopened=new Foundation({databasePath:x.databasePath});t.after(()=>reopened.close());
 assert.equal(reopened.getTask(S,'task').status,'deleted');assert.equal(intake(reopened,'task').deduplicated,true);
 rejects(()=>intake(reopened,'task',S,'different'),'TASK_EXISTS');assert.equal(reopened.exportTask(S,'task').history.at(-1).reason,'delete');
 const result=child(childBase(x.databasePath)+`console.log(core.getTask(scope,'event').version);core.close()`);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'1');
});

test('trusted exact capability, scope, expiry, epoch, CAS, host denial and altered binding fail closed',t=>{
 const x=setup(t);approved(x);
 rejects(()=>x.core.grant({},S,'task','action',{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000}),'UNAUTHORIZED');
 rejects(()=>x.core.grant(x.capability,W,'task','action',{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000}),'UNAUTHORIZED');
 rejects(()=>x.core.grant({trusted:true,role:'owner'},S,'task','action',{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000}),'UNAUTHORIZED');
 rejects(()=>x.core.grant(x.capability,S,'task','action',{expectedAuthEpoch:0,expectedVersion:2,expiresAt:2000}),'STALE_VERSION');
 x.setTime(2000);rejects(()=>x.core.claim(S,'task','action',{expectedVersion:1}),'APPROVAL_INVALID');
 x.setTime(1999); const c=x.core.claim(S,'task','action',{expectedVersion:1});assert.equal(c.action.state,'dispatch_intent');
 rejects(()=>x.core.claim(S,'task','action',{expectedVersion:2}),'ACTION_ALREADY_DISPATCHED');
 assert.equal(x.core.settle(S,'task','action',{claimId:c.claimId,outcome:'completed',evidenceDigest:D}).task.status,'running');
 const denied=setup(t,{hostPermission:()=>{throw Error('sk_live_synthetic_secret');}});approved(denied);
 rejects(()=>denied.core.claim(S,'task','action',{expectedVersion:1}),'HOST_DENIED');assert.equal(denied.core.recover().reservationsHeld,0);
 const altered=setup(t);approved(altered);const db=new DatabaseSync(altered.databasePath);t.after(()=>db.close());
 for(const [column,value] of [['target_digest',E],['data_digest',D],['units',2],['task_version',3],['auth_epoch',9],['kind','write']]) {
  const original=db.prepare(`SELECT ${column} AS value FROM grants`).get().value;db.prepare(`UPDATE grants SET ${column}=?`).run(value);
  rejects(()=>altered.core.claim(S,'task','action',{expectedVersion:1}),'APPROVAL_INVALID');db.prepare(`UPDATE grants SET ${column}=?`).run(original);
 }
 altered.core.revoke(altered.capability,S,'task','action');rejects(()=>altered.core.claim(S,'task','action',{expectedVersion:1}),'APPROVAL_INVALID');
 altered.core.grant(altered.capability,S,'task','action',{expectedAuthEpoch:altered.core.getTask(S,'task').authEpoch,expectedVersion:1,expiresAt:2000});altered.core.cancel(S,'task',{expectedVersion:1});rejects(()=>altered.core.claim(S,'task','action',{expectedVersion:2}),'TASK_TERMINAL');
});


test('action completion preserves separate task authority and other requested actions',t=>{
 const x=setup(t);intake(x.core);request(x.core,'task','first');request(x.core,'task','second');x.core.grant(x.capability,S,'task','first',{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000});
 const claim=x.core.claim(S,'task','first',{expectedVersion:1});const settled=x.core.settle(S,'task','first',{claimId:claim.claimId,outcome:'completed',evidenceDigest:D});
 assert.equal(settled.task.status,'running');assert.equal(x.core.exportTask(S,'task').actions.find(action=>action.state==='requested').kind,'fixture');
 x.core.grant(x.capability,S,'task','second',{expectedAuthEpoch:x.core.getTask(S,'task').authEpoch,expectedVersion:settled.task.version,expiresAt:2000});const second=x.core.claim(S,'task','second',{expectedVersion:settled.task.version});x.core.settle(S,'task','second',{claimId:second.claimId,outcome:'completed',evidenceDigest:D});
 const task=x.core.getTask(S,'task');assert.equal(task.status,'running');assert.equal(x.core.transition(S,'task',{expectedVersion:task.version,status:'completed',reason:'operator'}).status,'completed');
});

test('unknown and cancellation keep reservations; termination settles, late evidence preserves newer authority',t=>{
 const x=setup(t,{limits:{maxActive:1}});approved(x);const claim=x.core.claim(S,'task','action',{expectedVersion:1});
 const cancel=x.core.cancel(S,'task',{expectedVersion:2});assert.equal(cancel.status,'cancel_requested');
 rejects(()=>x.core.transition(S,'task',{expectedVersion:3,status:'cancelled',reason:'operator'}),'RESERVATION_HELD');
 rejects(()=>x.core.deleteTask(x.capability,S,'task',{expectedVersion:3}),'RESERVATION_HELD');
 const unknown=x.core.settle(S,'task','action',{claimId:claim.claimId,outcome:'unknown',evidenceDigest:D});assert.equal(unknown.task.status,'cancel_requested');assert.equal(unknown.reservationHeld,true);
 x.core.close();const reopened=new Foundation({databasePath:x.databasePath,hostPermission:()=>true,limits:{maxActive:1}});t.after(()=>reopened.close());
 assert.equal(reopened.recover().reservationsHeld,1);assert.equal(reopened.exportTask(S,'task').actions[0].state,'unknown');
 assert.equal(reopened.settle(S,'task','action',{claimId:claim.claimId,outcome:'completed',evidenceDigest:E}).task.status,'cancel_requested');
 rejects(()=>reopened.settle(S,'task','action',{claimId:claim.claimId,outcome:'terminated',evidenceDigest:E}),'STALE_CLAIM');
 const y=setup(t);approved(y);const c=y.core.claim(S,'task','action',{expectedVersion:1});y.core.revoke(y.capability,S,'task','action');
 assert.equal(y.core.settle(S,'task','action',{claimId:c.claimId,outcome:'completed',evidenceDigest:D}).task.status,'running');
 const z=setup(t);approved(z);const cz=z.core.claim(S,'task','action',{expectedVersion:1});z.core.cancel(S,'task',{expectedVersion:2});assert.equal(z.core.settle(S,'task','action',{claimId:cz.claimId,outcome:'terminated',evidenceDigest:D}).task.status,'cancelled');
});

test('queue, units, attempts and record budgets enforce exact boundaries',t=>{
 const x=setup(t,{limits:{queueCapacity:2,maxActive:2,maxAttempts:2,maxTasks:3,maxActionsPerTask:2,maxEventsPerTask:20}});
 intake(x.core,'one');intake(x.core,'two');rejects(()=>intake(x.core,'three'),'QUEUE_FULL');
 request(x.core,'one','a',1,{limits:{units:2}});x.core.grant(x.capability,S,'one','a',{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000});const c=x.core.claim(S,'one','a',{expectedVersion:1});intake(x.core,'three');rejects(()=>intake(x.core,'four'),'TASK_LIMIT');
 request(x.core,'two','b');x.core.grant(x.capability,S,'two','b',{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000});rejects(()=>x.core.claim(S,'two','b',{expectedVersion:1}),'ACTIVE_FULL');
 x.core.settle(S,'one','a',{claimId:c.claimId,outcome:'unknown',evidenceDigest:D});rejects(()=>x.core.claim(S,'two','b',{expectedVersion:1}),'ACTIVE_FULL');
 x.core.settle(S,'one','a',{claimId:c.claimId,outcome:'terminated',evidenceDigest:D});
 let v=x.core.getTask(S,'one').version;x.core.grant(x.capability,S,'one','a',{expectedAuthEpoch:x.core.getTask(S,'one').authEpoch,expectedVersion:v,expiresAt:2000});const second=x.core.claim(S,'one','a',{expectedVersion:v});x.core.settle(S,'one','a',{claimId:second.claimId,outcome:'terminated',evidenceDigest:D});
 v=x.core.getTask(S,'one').version;request(x.core,'one','review',v);x.core.grant(x.capability,S,'one','review',{expectedAuthEpoch:x.core.getTask(S,'one').authEpoch,expectedVersion:v,expiresAt:2000});rejects(()=>x.core.claim(S,'one','review',{expectedVersion:v}),'ATTEMPT_LIMIT');rejects(()=>request(x.core,'one','overflow',v),'ACTION_LIMIT');
 const h=setup(t,{limits:{maxEventsPerTask:2}});intake(h.core);h.core.transition(S,'task',{expectedVersion:1,status:'waiting',reason:'progress'});rejects(()=>h.core.transition(S,'task',{expectedVersion:2,status:'queued',reason:'progress'}),'HISTORY_LIMIT');assert.equal(h.core.getTask(S,'task').version,2);
});

test('fixture faults and actual abrupt process cuts recover without replay',async t=>{
 for(const cut of ['before_intake_commit','after_intake','pre_receipt','post_effect']) {
  const x=setup(t);x.core.close();
  const marker=join(x.dir,'effect-count');
  const code=childBase(x.databasePath,`fixtureMode:true,fixtureFaults:point=>{if(point===${JSON.stringify(cut)})process.exit(71)}`)+`core.intake(scope,{taskId:'task',provider:'p',source:'s',eventId:'e'});core.requestAction(scope,'task',{actionId:'action',kind:'fixture',targetDigest:'1'.repeat(64),dataDigest:'2'.repeat(64),limits:{units:1},expectedVersion:1});core.grant(cap,scope,'task','action',{expectedAuthEpoch:0,expectedVersion:1,expiresAt:2000});await core.dispatchFixture(scope,'task','action',{expectedVersion:1},async()=>{writeFileSync(${JSON.stringify(marker)},'one');return{outcome:'completed',evidenceDigest:'3'.repeat(64)}});`;
  const result=child(code);assert.equal(result.status,71,result.stderr);
  const reopened=new Foundation({databasePath:x.databasePath});t.after(()=>reopened.close());
  if(cut==='before_intake_commit') {assert.equal(reopened.listTasks(S).length,0);continue;}
  const task=reopened.getTask(S,'task');assert.equal(task.status,cut==='after_intake'?'queued':'recovery_required');
  assert.equal(reopened.recover().reservationsHeld,cut==='after_intake'?0:1);
  assert.equal(existsSync(marker),cut==='post_effect');
  if(cut==='post_effect') {assert.equal(readFileSync(marker,'utf8'),'one');assert.equal(reopened.exportTask(S,'task').actions[0].state,'unknown');}
 }
 const x=setup(t,{fixtureMode:true,fixtureFaults:point=>{if(point==='before_intake_commit')throw Error('SYNTHETIC_SECRET');}});rejects(()=>intake(x.core),'FIXTURE_CUT');assert.equal(x.core.listTasks(S).length,0);
 const y=setup(t,{fixtureMode:true});approved(y);const outcome=await y.core.dispatchFixture(S,'task','action',{expectedVersion:1},async()=>{throw Error('SYNTHETIC_SECRET');});assert.equal(outcome.reservationHeld,true);
 const z=setup(t);approved(z);await assert.rejects(z.core.dispatchFixture(S,'task','action',{expectedVersion:1},async()=>({})),error=>error.code==='FIXTURE_DISABLED');
});

test('migration backs up exact supported schema and failures/future/corrupt/unavailable stores preserve bytes',t=>{
 const dir=mkdtempSync(join(tmpdir(),'df-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const [name,fault] of [['success',false],['failed',true]]) {
  const path=join(dir,name+'.db'),db=new DatabaseSync(path);db.exec(legacySchemaSql);db.close();const original=readFileSync(path);
  if(fault) {rejects(()=>new Foundation({databasePath:path,fixtureMode:true,migrationFault:()=>{throw Error('secret');}}),'STORAGE_UNAVAILABLE');assert.deepEqual(readFileSync(path),original);}
  else {const core=new Foundation({databasePath:path});assert.equal(core.diagnostics().schemaVersion,4);core.close();}
  assert.deepEqual(readFileSync(path+'.schema-1.backup'),original);
 }
 const wal=join(dir,'wal.db'),waldb=new DatabaseSync(wal);waldb.exec(legacySchemaSql);waldb.exec('PRAGMA journal_mode=WAL');waldb.close();const walOriginal=readFileSync(wal);rejects(()=>new Foundation({databasePath:wal}),'SCHEMA_UNSUPPORTED');assert.deepEqual(readFileSync(wal),walOriginal);assert.equal(existsSync(wal+'.schema-1.backup'),false);
 const future=join(dir,'future.db'),db=new DatabaseSync(future);db.exec('PRAGMA user_version=99; CREATE TABLE future(data TEXT)');db.close();const original=readFileSync(future);rejects(()=>new Foundation({databasePath:future}),'SCHEMA_FUTURE');assert.deepEqual(readFileSync(future),original);
 const corrupt=join(dir,'corrupt.db');writeFileSync(corrupt,'synthetic corruption');rejects(()=>new Foundation({databasePath:corrupt}),'STORAGE_UNAVAILABLE');assert.equal(readFileSync(corrupt,'utf8'),'synthetic corruption');
 rejects(()=>new Foundation({databasePath:join(dir,'missing','file.db')}),'STORAGE_UNAVAILABLE');
 const denied=join(dir,'denied.db'),dd=new DatabaseSync(denied);dd.exec(legacySchemaSql);dd.close();chmodSync(denied,0);try{rejects(()=>new Foundation({databasePath:denied}),'STORAGE_UNAVAILABLE');}finally{chmodSync(denied,0o600);}
});

test('actual SQLite full failure rolls back and restricts new durable work',t=>{
 const x=setup(t);x.core.close();const db=new DatabaseSync(x.databasePath);const pages=db.prepare('PRAGMA page_count').get().page_count;db.close();
 const core=new Foundation({databasePath:x.databasePath,limits:{maxTasks:1000,queueCapacity:1000},fixtureMode:true,fixtureMaxPageCount:pages});t.after(()=>core.close());
 let failed=false;for(let i=0;i<1000;i++){try{intake(core,'record-'+i);}catch(error){assert.equal(error.code,'STORAGE_UNAVAILABLE');failed=true;break;}}
 assert.equal(failed,true);assert.equal(core.diagnostics().restricted,true);rejects(()=>intake(core,'next'),'STORAGE_RESTRICTED');
 const actual=new DatabaseSync(x.databasePath);t.after(()=>actual.close());assert.equal(actual.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('all identifiers hash before persistence; unknown fields, getters, proxies and exceptions reveal no synthetic secrets',t=>{
 const secret='sk_live_SYNTHETICSECRETM1',scope={ownerId:secret,workspaceId:secret},dir=mkdtempSync(join(tmpdir(),'df-secret-')),path=join(dir,'ledger.db'),cap={};t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const core=new Foundation({databasePath:path,trustedOperators:[{scope,capability:cap}],hostPermission:()=>{throw Error(secret);}});t.after(()=>core.close());
 core.intake(scope,{taskId:secret,provider:secret,source:secret,eventId:secret});
 core.requestAction(scope,secret,{actionId:secret,kind:'fixture',targetDigest:D,dataDigest:E,limits:{units:1},expectedVersion:1});core.grant(cap,scope,secret,secret,{expectedAuthEpoch:0,expectedVersion:1,expiresAt:Date.now()+10000});
 const errors=[];for(const fn of [()=>core.claim(scope,secret,secret,{expectedVersion:1}),()=>core.intake(scope,{taskId:'t',provider:'p',source:'s',eventId:'e',payload:secret}),()=>core.getTask(new Proxy({}, {get(){throw Error(secret)}}),'t')])try{fn();}catch(error){errors.push(error.message);}
 let invoked=0;const malicious={workspaceId:'w'};Object.defineProperty(malicious,'ownerId',{enumerable:true,get(){invoked++;throw Error(secret);}});rejects(()=>core.getTask(malicious,'t'),'INVALID_INPUT');assert.equal(invoked,0);
 const options={};Object.defineProperty(options,'databasePath',{enumerable:true,get(){invoked++;throw Error(secret);}});rejects(()=>new Foundation(options),'INVALID_INPUT');assert.equal(invoked,0);
 const output=JSON.stringify([core.exportTask(scope,secret),core.diagnostics(),errors]);assert.equal(output.includes(secret),false);core.close();for(const file of readdirSync(dir))assert.equal(readFileSync(join(dir,file)).includes(Buffer.from(secret)),false,file);
});

async function race(path, operations, limits={}) {
 const dir=join(path,'..'),gate=join(dir,'gate-'+Math.random()),children=operations.map((operation,index)=>{
  const ready=gate+'-'+index,code=childBase(path,`limits:${JSON.stringify(limits)}`)+`writeFileSync(${JSON.stringify(ready)},'ready');await new Promise(resolve=>{const timer=setInterval(()=>{if(existsSync(${JSON.stringify(gate)})){clearInterval(timer);resolve();}},5)});try{${operation};console.log('OK')}catch(error){console.log(error.code)}core.close();`;
  const proc=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>proc.kill('SIGKILL'),10000);let stdout='',stderr='';proc.stdout.on('data',chunk=>stdout+=chunk);proc.stderr.on('data',chunk=>stderr+=chunk);return {ready,proc,done:new Promise((resolve,reject)=>{proc.on('error',error=>{clearTimeout(timer);reject(error);});proc.on('close',status=>{clearTimeout(timer);resolve({status,stdout:stdout.trim(),stderr});});})};
 });
 const deadline=Date.now()+5000;while(!children.every(item=>existsSync(item.ready))){if(Date.now()>deadline){for(const item of children)item.proc.kill('SIGKILL');await Promise.allSettled(children.map(item=>item.done));throw Error('race readiness timeout');}await new Promise(resolve=>setTimeout(resolve,5));}writeFileSync(gate,'go');return Promise.all(children.map(item=>item.done));
}
test('independent process last queue and active slot races cannot over-admit',async t=>{
 const x=setup(t,{limits:{queueCapacity:1,maxActive:1}});x.core.close();
 const queue=await race(x.databasePath,[`core.intake(scope,{taskId:'one',provider:'p',source:'s',eventId:'one'})`,`core.intake(scope,{taskId:'two',provider:'p',source:'s',eventId:'two'})`],{queueCapacity:1,maxActive:1});
 assert.deepEqual(queue.map(item=>item.stdout).sort(),['OK','QUEUE_FULL']);assert.equal(queue.every(item=>item.status===0),true);
 const db=new DatabaseSync(x.databasePath);assert.equal(db.prepare("SELECT count(*) AS n FROM tasks WHERE status='queued'").get().n,1);db.close();
 const y=setup(t,{limits:{maxActive:1}});approved(y,'one','a');approved(y,'two','b');y.core.close();
 const active=await race(y.databasePath,[`core.claim(scope,'one','a',{expectedVersion:1})`,`core.claim(scope,'two','b',{expectedVersion:1})`],{maxActive:1});
 assert.deepEqual(active.map(item=>item.stdout).sort(),['ACTIVE_FULL','OK']);assert.equal(active.every(item=>item.status===0),true);
 const reopened=new Foundation({databasePath:y.databasePath,limits:{maxActive:1}});t.after(()=>reopened.close());assert.equal(reopened.recover().reservationsHeld,1);
});

test('history admission reserves bounded recovery, cancellation and settlement capacity',t=>{
 const denied=setup(t,{limits:{maxEventsPerTask:4}});approved(denied);rejects(()=>denied.core.claim(S,'task','action',{expectedVersion:1}),'HISTORY_LIMIT');assert.equal(denied.core.recover().reservationsHeld,0);assert.equal(denied.core.exportTask(S,'task').history.length,3);
 const tooSmall=setup(t,{limits:{maxEventsPerTask:8}});approved(tooSmall);rejects(()=>tooSmall.core.claim(S,'task','action',{expectedVersion:1}),'HISTORY_LIMIT');
 const x=setup(t,{limits:{maxEventsPerTask:9}});approved(x);const claim=x.core.claim(S,'task','action',{expectedVersion:1});
 assert.equal(x.core.revoke(x.capability,S,'task','action').authEpoch,2);for(let i=0;i<10;i++)assert.equal(x.core.revoke(x.capability,S,'task','action').authEpoch,2);
 x.core.cancel(S,'task',{expectedVersion:2});x.core.close();const reopened=new Foundation({databasePath:x.databasePath,limits:{maxEventsPerTask:9}});t.after(()=>reopened.close());assert.equal(reopened.getTask(S,'task').status,'cancel_requested');assert.equal(reopened.recover().reservationsHeld,1);
 for(let i=0;i<20;i++)assert.equal(reopened.settle(S,'task','action',{claimId:claim.claimId,outcome:'unknown',evidenceDigest:D}).reservationHeld,true);
 assert.equal(reopened.exportTask(S,'task').history.length,7);
 const settled=reopened.settle(S,'task','action',{claimId:claim.claimId,outcome:'completed',evidenceDigest:E});assert.equal(settled.task.status,'cancel_requested');assert.equal(reopened.recover().reservationsHeld,0);
 reopened.transition(S,'task',{expectedVersion:settled.task.version,status:'cancelled',reason:'operator'});assert.equal(reopened.exportTask(S,'task').history.length,9);
});

test('corrupt legacy foreign keys and semantic rows reject before migration and preserve exact original',t=>{
 const dir=mkdtempSync(join(tmpdir(),'df-corrupt-legacy-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const kind of ['orphan','invalid-status']){
  const path=join(dir,kind+'.db'),db=new DatabaseSync(path);db.exec(legacySchemaSql);db.exec('PRAGMA foreign_keys=OFF');
  if(kind==='orphan')db.prepare('INSERT INTO ingress VALUES(?,?,?,?,?,?,?)').run(D,D,D,D,D,E,1000);
  else db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)').run(D,D,D,'bad-state',1,0,1000,1000);
  db.close();const original=readFileSync(path);rejects(()=>new Foundation({databasePath:path}),'STORAGE_INVALID');assert.deepEqual(readFileSync(path),original);assert.equal(existsSync(path+'.schema-1.backup'),false);
  const check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,1);check.close();
 }
 const x=setup(t);approved(x);x.core.claim(S,'task','action',{expectedVersion:1});x.core.close();const db=new DatabaseSync(x.databasePath);db.exec('DELETE FROM reservations');db.close();const original=readFileSync(x.databasePath);rejects(()=>new Foundation({databasePath:x.databasePath}),'STORAGE_INVALID');assert.deepEqual(readFileSync(x.databasePath),original);
});


test('old consent cannot restore revoked or replaced approval authority',t=>{
 const x=setup(t);intake(x.core);request(x.core);const oldConsent={expectedVersion:1,expectedAuthEpoch:0,expiresAt:2000};
 x.core.grant(x.capability,S,'task','action',oldConsent);rejects(()=>x.core.grant(x.capability,S,'task','action',oldConsent),'STALE_AUTHORITY');
 x.core.revoke(x.capability,S,'task','action');rejects(()=>x.core.grant(x.capability,S,'task','action',oldConsent),'STALE_AUTHORITY');rejects(()=>x.core.claim(S,'task','action',{expectedVersion:1}),'APPROVAL_INVALID');
 const current=x.core.getTask(S,'task');x.core.grant(x.capability,S,'task','action',{expectedVersion:current.version,expectedAuthEpoch:current.authEpoch,expiresAt:2000});assert.equal(x.core.claim(S,'task','action',{expectedVersion:1}).action.state,'dispatch_intent');
});


test('unsupported crash-left WAL stores reject before SQLite touches main or sidecars',t=>{
 const dir=mkdtempSync(join(tmpdir(),'df-wal-preflight-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const version of [99,1,2,3,4]) {
  const path=join(dir,`schema-${version}.db`);
  if(version===2||version===3||version===4){const core=new Foundation({databasePath:path});core.close();if(version===2){const legacy2=new DatabaseSync(path);for(const row of legacy2.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND (name LIKE 'runtime_%' OR name IN ('workspace_memory','automation_records'))").all())legacy2.exec('DROP TABLE '+row.name);legacy2.exec('PRAGMA user_version=2');legacy2.close();}else if(version===3){const legacy3=new DatabaseSync(path);legacy3.exec('DROP TABLE workspace_memory; DROP TABLE automation_records; PRAGMA user_version=3');legacy3.close();}}
  const seed=version===99 ? 'CREATE TABLE future(value INTEGER); PRAGMA user_version=99;' : version===1 ? legacySchemaSql : '';
  const insert=version===99 ? "db.exec('INSERT INTO future VALUES(1)');" : `db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)').run('${D}','${D}','${D}','queued',1,0,1000,1000);db.prepare('INSERT INTO ingress VALUES(?,?,?,?,?,?,?)').run('${D}','${D}','${D}','${D}','${D}','${D}',1000);db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)').run('${D}','${D}','${D}',1,1,'queued','intake',1000);`;
  const result=child(`import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync(${JSON.stringify(path)});db.exec(${JSON.stringify(seed)});db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');db.exec('BEGIN IMMEDIATE');${insert}db.exec('COMMIT');process.exit(73);`);
  assert.equal(result.status,73,result.stderr);assert.equal(existsSync(path+'-wal'),true);assert.equal(existsSync(path+'-shm'),true);
  const before=new Map(readdirSync(dir).filter(name=>name.startsWith(`schema-${version}.db`)).map(name=>[name,readFileSync(join(dir,name))]));assert.ok(before.get(`schema-${version}.db-wal`).length>32);
  rejects(()=>new Foundation({databasePath:path}),version===99?'SCHEMA_FUTURE':'SCHEMA_UNSUPPORTED');
  assert.deepEqual(readdirSync(dir).filter(name=>name.startsWith(`schema-${version}.db`)).sort(),[...before.keys()].sort());
  for(const [name,bytes] of before)assert.deepEqual(readFileSync(join(dir,name)),bytes,name);
 }
 const persistent=join(dir,'persistent-wal.db'),core=new Foundation({databasePath:persistent});core.close();const db=new DatabaseSync(persistent);db.exec('PRAGMA journal_mode=WAL');db.close();assert.equal(existsSync(persistent+'-wal'),false);assert.equal(existsSync(persistent+'-shm'),false);const original=readFileSync(persistent);assert.equal(original[18],2);rejects(()=>new Foundation({databasePath:persistent}),'SCHEMA_UNSUPPORTED');assert.deepEqual(readFileSync(persistent),original);
});

test('header preflight rejects ambiguous unsupported inputs without recovery or mutation',t=>{
 const x=setup(t);x.core.close();const valid=readFileSync(x.databasePath);
 for(const [name,mutate,code] of [
  ['future-delete',buffer=>buffer.writeInt32BE(99,60),'SCHEMA_FUTURE'],
  ['unsupported-zero',buffer=>buffer.writeInt32BE(0,60),'SCHEMA_UNSUPPORTED'],
  ['unsupported-negative',buffer=>buffer.writeInt32BE(-1,60),'SCHEMA_UNSUPPORTED'],
  ['unknown-read-version',buffer=>{buffer[19]=3;},'SCHEMA_UNSUPPORTED'],
  ['bad-page-size',buffer=>buffer.writeUInt16BE(513,16),'STORAGE_UNAVAILABLE'],
  ['truncated-header',()=>{},'STORAGE_UNAVAILABLE'],
 ]){
  const path=join(x.dir,name+'.db'),bytes=Buffer.from(valid);mutate(bytes);writeFileSync(path,name==='truncated-header'?bytes.subarray(0,80):bytes);const original=readFileSync(path);
  // An unsupported main plus a journal is still rejected before SQLite may try
  // recovery; this deliberately synthetic sidecar is itself preserved exactly.
  const journal=path+'-journal';writeFileSync(journal,'synthetic-unsupported-journal');const journalBytes=readFileSync(journal);
  rejects(()=>new Foundation({databasePath:path}),code);assert.deepEqual(readFileSync(path),original);assert.deepEqual(readFileSync(journal),journalBytes);
 }
 const missing=join(x.dir,'orphan-main.db');writeFileSync(missing+'-wal','synthetic-orphan-wal');rejects(()=>new Foundation({databasePath:missing}),'SCHEMA_UNSUPPORTED');assert.equal(existsSync(missing),false);assert.equal(readFileSync(missing+'-wal','utf8'),'synthetic-orphan-wal');
});


test('supported DELETE hot rollback journal recovers acknowledged facts',t=>{
 const x=setup(t);for(let i=0;i<16;i++)intake(x.core,'hot-'+i);x.core.close();
 const result=child(`import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync(${JSON.stringify(x.databasePath)});db.exec('PRAGMA cache_size=1; BEGIN IMMEDIATE; UPDATE tasks SET auth_epoch=auth_epoch+1; UPDATE events SET at=at+1;');process.exit(74);`);
 assert.equal(result.status,74,result.stderr);const journal=x.databasePath+'-journal';assert.equal(existsSync(journal),true);const bytes=readFileSync(journal);assert.ok(bytes.length>28);assert.notDeepEqual(bytes.subarray(0,8),Buffer.alloc(8),'rollback journal is hot, not only an unflushed empty header');
 const reopened=new Foundation({databasePath:x.databasePath});t.after(()=>reopened.close());const tasks=reopened.listTasks(S);assert.equal(tasks.length,16);assert.equal(tasks.every(task=>task.authEpoch===0&&task.version===1&&task.status==='queued'),true);assert.equal(reopened.exportTask(S,'hot-0').history[0].at,1000);assert.equal(existsSync(journal),false);
});

test('concurrent future version cannot be downgraded during migration or runtime mutation',t=>{
 const dir=mkdtempSync(join(tmpdir(),'df-version-lock-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const legacy=join(dir,'legacy.db'),db=new DatabaseSync(legacy);db.exec(legacySchemaSql);db.close();
 const originalExec=DatabaseSync.prototype.exec;let changed=false;
 DatabaseSync.prototype.exec=function(sql){if(!changed&&sql==='BEGIN EXCLUSIVE'){changed=true;const writer=new DatabaseSync(legacy);writer.exec('PRAGMA user_version=99');writer.close();}return originalExec.call(this,sql);};
 try{rejects(()=>new Foundation({databasePath:legacy}),'SCHEMA_FUTURE');}finally{DatabaseSync.prototype.exec=originalExec;}
 assert.equal(changed,true);assert.equal(existsSync(legacy+'.schema-1.backup'),false);const check=new DatabaseSync(legacy);assert.equal(check.prepare('PRAGMA user_version').get().user_version,99);assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get().n,3);check.close();
 const x=setup(t);intake(x.core);const before=x.core.getTask(S,'task');const writer=new DatabaseSync(x.databasePath);writer.exec('PRAGMA user_version=99');writer.close();const original=readFileSync(x.databasePath);rejects(()=>x.core.transition(S,'task',{expectedVersion:before.version,status:'waiting',reason:'progress'}),'SCHEMA_FUTURE');assert.deepEqual(readFileSync(x.databasePath),original);rejects(()=>intake(x.core,'next'),'SCHEMA_FUTURE');
});
