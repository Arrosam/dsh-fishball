import { createHash, randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { Ledger, FoundationError, fail } from './ledger.mjs';
export { FoundationError } from './ledger.mjs';
const DEFAULTS = Object.freeze({queueCapacity:32,maxActive:2,maxAttempts:3,maxTasks:1000,maxActionsPerTask:16,maxEventsPerTask:128,maxMetadataBytes:1024});
const TERMINAL = new Set(['completed','failed','cancelled','deleted']);
const KINDS = new Set(['fixture','read','write','review','repair']);
const REASONS = new Set(['progress','operator','recovery','fixture']);
const TRANSITIONS = {
 queued: ['waiting','blocked','failed'], running:['waiting','blocked','completed','failed'],
 waiting:['queued','blocked','completed','failed'], blocked:['queued','waiting','failed'],
 recovery_required:['blocked','failed'], cancel_requested:['cancelled'],
};
const digest = value => createHash('sha256').update(value).digest('hex');
const id = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) fail('INVALID_INPUT'); return digest(value); };
const number = (value, min=0, max=Number.MAX_SAFE_INTEGER) => { if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_INPUT'); return value; };
const hash = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID_INPUT'); return value; };
function exact(value, allowed, required=allowed) {
  try {
    if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_INPUT');
    const keys=Reflect.ownKeys(value), descriptors=Object.getOwnPropertyDescriptors(value);
    if(keys.some(key=>typeof key!=='string' || !allowed.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key],'value')) || required.some(key=>!Object.hasOwn(descriptors,key))) fail('INVALID_INPUT');
  } catch { fail('INVALID_INPUT'); }
}
function dataArray(value) {
  if(!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length>32) fail('INVALID_CONFIG');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(descriptors).some(key=>typeof key!=='string' || (key!=='length' && (!/^\d+$/.test(key) || !Object.hasOwn(descriptors[key],'value') || !descriptors[key].enumerable)))) fail('INVALID_CONFIG');
  for(let i=0;i<value.length;i++) if(!Object.hasOwn(descriptors,String(i))) fail('INVALID_CONFIG');
  return value;
}
const scoped = scope => { exact(scope,['ownerId','workspaceId']); return [id(scope.ownerId),id(scope.workspaceId)]; };
const taskRecord = row => row && Object.freeze({ownerRef:row.owner,workspaceRef:row.workspace,taskRef:row.id,status:row.status,version:row.version,authEpoch:row.auth_epoch,createdAt:row.created_at,updatedAt:row.updated_at});
const actionRecord = row => row && Object.freeze({actionRef:row.id,kind:row.kind,targetDigest:row.target_digest,dataDigest:row.data_digest,limits:Object.freeze({units:row.units}),state:row.state,attempts:row.attempts,claimId:row.claim_id,claimEpoch:row.claim_epoch,evidenceDigest:row.evidence_digest,createdAt:row.created_at,updatedAt:row.updated_at});

export class Foundation {
  #ledger; #operators; #clock; #hostPermission; #fixtureMode; #fixtureFaults;
  constructor(options={}) {
    exact(options,['databasePath','limits','clock','hostPermission','trustedOperators','fixtureMode','fixtureFaults','migrationFault','fixtureMaxPageCount'],['databasePath']);
    const {databasePath,limits={},clock=Date.now,hostPermission=()=>false,trustedOperators=[],fixtureMode=false,fixtureFaults,migrationFault,fixtureMaxPageCount}=options;
    dataArray(trustedOperators);
    exact(limits,Object.keys(DEFAULTS),[]);
    Object.defineProperty(this,'limits',{value:Object.freeze({...DEFAULTS,...limits}),enumerable:true});
    for (const [key,value] of Object.entries(this.limits)) number(value,key==='maxMetadataBytes'?256:1,key==='maxMetadataBytes'?65536:100000);
    if (this.limits.maxActive>this.limits.maxTasks || this.limits.queueCapacity>this.limits.maxTasks || typeof clock!=='function' || typeof hostPermission!=='function' || !Array.isArray(trustedOperators) || typeof fixtureMode!=='boolean' || (!fixtureMode && (fixtureFaults || migrationFault || fixtureMaxPageCount!==undefined)) || (fixtureFaults!==undefined && typeof fixtureFaults!=='function') || (migrationFault!==undefined && typeof migrationFault!=='function')) fail('INVALID_CONFIG');
    this.#clock=clock; this.#hostPermission=hostPermission; this.#fixtureMode=fixtureMode; this.#fixtureFaults=fixtureFaults;
    this.#operators=new WeakMap();
    for (const entry of trustedOperators) { exact(entry,['scope','capability']); if (!entry.capability || typeof entry.capability!=='object' || this.#operators.has(entry.capability)) fail('INVALID_CONFIG'); this.#operators.set(entry.capability,scoped(entry.scope).join(':')); }
    if(fixtureMaxPageCount!==undefined) number(fixtureMaxPageCount,1,1000000);
    this.#ledger=new Ledger(databasePath,{migrationFault,maxPageCount:fixtureMaxPageCount});
    try { this.recover(); } catch(error) { this.#ledger.close(); throw error; }
  }
  #now() { try { return number(this.#clock()); } catch { fail('CLOCK_UNAVAILABLE'); } }
  #bounded(input) { try { if (Buffer.byteLength(JSON.stringify(input))>this.limits.maxMetadataBytes) fail('INPUT_TOO_LARGE'); } catch(error) { if(error instanceof FoundationError) throw error; fail('INVALID_INPUT'); } }
  #operator(capability,scope) { const pair=scoped(scope); if (!capability || typeof capability!=='object' || this.#operators.get(capability)!==pair.join(':')) fail('UNAUTHORIZED'); return pair; }
  #keys(scope,taskId) { return [...scoped(scope),id(taskId)]; }
  #task(keys) { const row=this.#ledger.one('SELECT * FROM tasks WHERE owner=? AND workspace=? AND id=?',...keys); if(!row) fail('TASK_NOT_FOUND'); return row; }
  #current(keys,version) { number(version,1); const task=this.#task(keys); if(task.version!==version) fail('STALE_VERSION'); if(TERMINAL.has(task.status)) fail('TASK_TERMINAL'); return task; }
  #action(keys,actionId) { const row=this.#ledger.one('SELECT * FROM actions WHERE owner=? AND workspace=? AND task=? AND id=?',...keys,id(actionId)); if(!row) fail('ACTION_NOT_FOUND'); return row; }
  #event(task,status,reason,at) {
    const keys=[task.owner,task.workspace,task.id];
    const count=this.#ledger.one('SELECT count(*) AS n FROM events WHERE owner=? AND workspace=? AND task=?',...keys).n;
    const held=this.#held(keys);
    const protectedEvent=['cancel','revoke','recovery','settlement'].includes(reason);
    const reserve=!protectedEvent && held>0 ? 2*held+3 : 0;
    if(count>=this.limits.maxEventsPerTask-reserve) fail('HISTORY_LIMIT');
    this.#ledger.run('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)',...keys,count+1,task.version,status,reason,at);
  }
  #update(task,status,reason,at,epoch=task.auth_epoch) {
    number(task.version+1,1); number(epoch);
    task={...task,status,version:task.version+1,auth_epoch:epoch,updated_at:at};
    this.#ledger.run('UPDATE tasks SET status=?,version=?,auth_epoch=?,updated_at=? WHERE owner=? AND workspace=? AND id=?',status,task.version,epoch,at,task.owner,task.workspace,task.id);
    this.#event(task,status,reason,at); return task;
  }
  intake(scope,input) {
    exact(input,['taskId','provider','source','eventId']);
    const keys=this.#keys(scope,input.taskId), ingress=[...keys.slice(0,2),id(input.provider),id(input.source),id(input.eventId)], at=this.#now();
    this.#bounded({scope,...input});
    const result=this.#ledger.transaction(()=>{
      const existing=this.#ledger.one('SELECT task FROM ingress WHERE owner=? AND workspace=? AND provider=? AND source=? AND event=?',...ingress);
      if(existing) { const task=this.#task([...keys.slice(0,2),existing.task]); return {deduplicated:true,task:taskRecord(task)}; }
      if(this.#ledger.one('SELECT id FROM tasks WHERE owner=? AND workspace=? AND id=?',...keys)) fail('TASK_EXISTS');
      if(this.#ledger.one('SELECT count(*) AS n FROM tasks').n>=this.limits.maxTasks) fail('TASK_LIMIT');
      if(this.#ledger.one("SELECT count(*) AS n FROM tasks WHERE status='queued'").n>=this.limits.queueCapacity) fail('QUEUE_FULL');
      const task={owner:keys[0],workspace:keys[1],id:keys[2],status:'queued',version:1,auth_epoch:0,created_at:at,updated_at:at};
      this.#ledger.run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)',...keys,'queued',1,0,at,at);
      this.#ledger.run('INSERT INTO ingress VALUES(?,?,?,?,?,?,?)',...ingress,keys[2],at); this.#event(task,'queued','intake',at);
      this.#cut('before_intake_commit'); return {deduplicated:false,task:taskRecord(task)};
    });
    this.#cut('after_intake'); return result;
  }
  getTask(scope,taskId) { return taskRecord(this.#task(this.#keys(scope,taskId))); }
  listTasks(scope) { return this.#ledger.query('SELECT * FROM tasks WHERE owner=? AND workspace=? ORDER BY created_at,id',...scoped(scope)).map(taskRecord); }
  exportTask(scope,taskId) {
    const keys=this.#keys(scope,taskId);
    return this.#ledger.transaction(()=>{
    const task=this.#task(keys);
    const history=this.#ledger.query('SELECT sequence,version,status,reason,at FROM events WHERE owner=? AND workspace=? AND task=? ORDER BY sequence',...keys);
    const ingress=this.#ledger.query('SELECT provider AS providerRef,source AS sourceRef,event AS eventRef,received_at AS receivedAt FROM ingress WHERE owner=? AND workspace=? AND task=?',...keys);
    const actions=this.#ledger.query('SELECT * FROM actions WHERE owner=? AND workspace=? AND task=? ORDER BY created_at,id',...keys).map(actionRecord);
    const grants=this.#ledger.query('SELECT action AS actionRef,task_version AS taskVersion,auth_epoch AS authEpoch,expires_at AS expiresAt,revoked FROM grants WHERE owner=? AND workspace=? AND task=?',...keys);
    return {schemaVersion:2,task:taskRecord(task),ingress,history,actions,grants,deletionScope:'local-ledger-tombstone'};
    });
  }
  #held(keys) { return this.#ledger.one('SELECT count(*) AS n FROM reservations WHERE owner=? AND workspace=? AND task=?',...keys).n; }
  transition(scope,taskId,input) {
    exact(input,['expectedVersion','status','reason']); if(!REASONS.has(input.reason)) fail('INVALID_INPUT'); const keys=this.#keys(scope,taskId),at=this.#now();
    return this.#ledger.transaction(()=>{const task=this.#current(keys,input.expectedVersion); if(!(TRANSITIONS[task.status]||[]).includes(input.status)) fail('ILLEGAL_TRANSITION'); if(this.#held(keys)) fail('RESERVATION_HELD'); if(input.status==='queued' && this.#ledger.one("SELECT count(*) AS n FROM tasks WHERE status='queued'").n>=this.limits.queueCapacity) fail('QUEUE_FULL'); return taskRecord(this.#update(task,input.status,input.reason,at));});
  }
  deleteTask(capability,scope,taskId,input) {
    this.#operator(capability,scope); exact(input,['expectedVersion']); const keys=this.#keys(scope,taskId),at=this.#now();
    return this.#ledger.transaction(()=>{const task=this.#task(keys); number(input.expectedVersion,1); if(task.version!==input.expectedVersion) fail('STALE_VERSION'); if(task.status==='deleted') return taskRecord(task); if(this.#held(keys)) fail('RESERVATION_HELD'); this.#ledger.run('UPDATE grants SET revoked=1 WHERE owner=? AND workspace=? AND task=?',...keys); return taskRecord(this.#update(task,'deleted','delete',at,task.auth_epoch+1));});
  }
  requestAction(scope,taskId,input) {
    exact(input,['actionId','kind','targetDigest','dataDigest','limits','expectedVersion']); exact(input.limits,['units']); if(!KINDS.has(input.kind)) fail('INVALID_INPUT'); hash(input.targetDigest);hash(input.dataDigest); number(input.limits.units,1,this.limits.maxActive);
    const keys=this.#keys(scope,taskId),actionId=id(input.actionId),at=this.#now(); this.#bounded(input);
    return this.#ledger.transaction(()=>{const task=this.#current(keys,input.expectedVersion); if(['cancel_requested','recovery_required'].includes(task.status)) fail('TASK_BLOCKED'); if(this.#ledger.one('SELECT count(*) AS n FROM actions WHERE owner=? AND workspace=? AND task=?',...keys).n>=this.limits.maxActionsPerTask) fail('ACTION_LIMIT'); if(this.#ledger.one('SELECT id FROM actions WHERE owner=? AND workspace=? AND task=? AND id=?',...keys,actionId)) fail('ACTION_EXISTS'); this.#ledger.run('INSERT INTO actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...keys,actionId,input.kind,input.targetDigest,input.dataDigest,input.limits.units,'requested',0,null,null,null,at,at); this.#event(task,task.status,'action_requested',at); return actionRecord(this.#action(keys,input.actionId));});
  }
  grant(capability,scope,taskId,actionId,input) {
    this.#operator(capability,scope); exact(input,['expectedVersion','expectedAuthEpoch','expiresAt']); number(input.expectedAuthEpoch); const keys=this.#keys(scope,taskId),at=this.#now();number(input.expiresAt,at+1);
    return this.#ledger.transaction(()=>{const task=this.#current(keys,input.expectedVersion),action=this.#action(keys,actionId); if(task.auth_epoch!==input.expectedAuthEpoch) fail('STALE_AUTHORITY'); if(['cancel_requested','recovery_required'].includes(task.status)) fail('TASK_BLOCKED'); if(!['requested','failed','terminated'].includes(action.state)) fail('ACTION_NOT_GRANTABLE'); const epoch=number(task.auth_epoch+1); this.#ledger.run('UPDATE tasks SET auth_epoch=? WHERE owner=? AND workspace=? AND id=?',epoch,...keys); this.#ledger.run('INSERT INTO grants VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,workspace,task,action) DO UPDATE SET task_version=excluded.task_version,auth_epoch=excluded.auth_epoch,target_digest=excluded.target_digest,data_digest=excluded.data_digest,units=excluded.units,kind=excluded.kind,expires_at=excluded.expires_at,revoked=0',...keys,action.id,task.version,epoch,action.target_digest,action.data_digest,action.units,action.kind,input.expiresAt,0); this.#event({...task,auth_epoch:epoch},task.status,'grant',at); return {taskVersion:task.version,authEpoch:epoch,expiresAt:input.expiresAt,actionRef:action.id};});
  }
  revoke(capability,scope,taskId,actionId) {
    this.#operator(capability,scope); const keys=this.#keys(scope,taskId),at=this.#now();
    return this.#ledger.transaction(()=>{const task=this.#task(keys),action=this.#action(keys,actionId); if(TERMINAL.has(task.status)) fail('TASK_TERMINAL'); const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...keys,action.id); if(!grant || grant.revoked || grant.auth_epoch!==task.auth_epoch) return {authEpoch:task.auth_epoch,actionRef:action.id,state:action.state}; number(task.auth_epoch+1); this.#ledger.run('UPDATE tasks SET auth_epoch=auth_epoch+1 WHERE owner=? AND workspace=? AND id=?',...keys); this.#ledger.run('UPDATE grants SET revoked=1 WHERE owner=? AND workspace=? AND task=? AND action=?',...keys,action.id); this.#event(task,task.status,'revoke',at); return {authEpoch:task.auth_epoch+1,actionRef:action.id,state:action.state};});
  }
  claim(scope,taskId,actionId,input) {
    exact(input,['expectedVersion']); const keys=this.#keys(scope,taskId);
    return this.#ledger.transaction(()=>{
      const at=this.#now(),task=this.#current(keys,input.expectedVersion),action=this.#action(keys,actionId);
      if(!['queued','running','waiting','blocked'].includes(task.status)) fail('TASK_BLOCKED');
      if(!['requested','failed','terminated'].includes(action.state)) fail('ACTION_ALREADY_DISPATCHED');
      const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...keys,action.id);
      if(!grant || grant.revoked || at>=grant.expires_at || grant.task_version!==task.version || grant.auth_epoch!==task.auth_epoch || grant.target_digest!==action.target_digest || grant.data_digest!==action.data_digest || grant.units!==action.units || grant.kind!==action.kind) fail('APPROVAL_INVALID');
      const attempts=this.#ledger.one('SELECT coalesce(sum(attempts),0) AS n FROM actions WHERE owner=? AND workspace=? AND task=? AND kind=?',...keys,action.kind).n;
      if(attempts>=this.limits.maxAttempts) fail('ATTEMPT_LIMIT');
      if(this.#ledger.one('SELECT coalesce(sum(units),0) AS n FROM reservations').n+action.units>this.limits.maxActive) fail('ACTIVE_FULL');
      const permission=Object.freeze({ownerRef:keys[0],workspaceRef:keys[1],taskRef:keys[2],actionRef:action.id,kind:action.kind,targetDigest:action.target_digest,dataDigest:action.data_digest,limits:Object.freeze({units:action.units}),taskVersion:task.version,authEpoch:task.auth_epoch});
      let allowed=false;try{allowed=this.#hostPermission(permission)===true;}catch{fail('HOST_DENIED');} if(!allowed) fail('HOST_DENIED');
      const claimId=randomUUID();
      this.#ledger.run('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)',claimId,...keys,action.id,action.units,at);
      this.#ledger.run("UPDATE actions SET state='dispatch_intent',attempts=attempts+1,claim_id=?,claim_epoch=?,evidence_digest=NULL,updated_at=? WHERE owner=? AND workspace=? AND task=? AND id=?",claimId,task.auth_epoch,at,...keys,action.id);
      const updated=this.#update(task,'running','dispatch',at);
      return {claimId,task:taskRecord(updated),action:actionRecord(this.#action(keys,actionId))};
    });
  }
  cancel(scope,taskId,input) {
    exact(input,['expectedVersion']);const keys=this.#keys(scope,taskId),at=this.#now();
    return this.#ledger.transaction(()=>{const task=this.#current(keys,input.expectedVersion); if(task.status==='cancel_requested') return taskRecord(task); this.#ledger.run('UPDATE grants SET revoked=1 WHERE owner=? AND workspace=? AND task=?',...keys); return taskRecord(this.#update(task,this.#held(keys)?'cancel_requested':'cancelled','cancel',at,task.auth_epoch+1));});
  }
  settle(scope,taskId,actionId,input) {
    exact(input,['claimId','outcome','evidenceDigest']); if(typeof input.claimId!=='string'||!/^[a-f0-9-]{36}$/.test(input.claimId)||!['completed','failed','unknown','terminated'].includes(input.outcome)) fail('INVALID_INPUT'); hash(input.evidenceDigest);const keys=this.#keys(scope,taskId),at=this.#now();
    return this.#ledger.transaction(()=>{
      const task=this.#task(keys),action=this.#action(keys,actionId);
      if(action.claim_id!==input.claimId || !['dispatch_intent','unknown'].includes(action.state)) fail('STALE_CLAIM');
      const held=this.#ledger.one('SELECT claim_id FROM reservations WHERE claim_id=? AND owner=? AND workspace=? AND task=? AND action=?',input.claimId,...keys,action.id); if(!held) fail('STALE_CLAIM');
      if(action.state==='unknown' && input.outcome==='unknown') return {task:taskRecord(task),action:actionRecord(action),reservationHeld:true};
      this.#ledger.run('UPDATE actions SET state=?,evidence_digest=?,updated_at=? WHERE owner=? AND workspace=? AND task=? AND id=?',input.outcome,input.evidenceDigest,at,...keys,action.id);
      if(input.outcome!=='unknown') this.#ledger.run('DELETE FROM reservations WHERE claim_id=?',input.claimId);
      let updated=task;
      // Reconciliation records the effect, but never erases a newer cancellation or authority epoch.
      if(task.status==='cancel_requested') { if(input.outcome==='terminated'&&!this.#held(keys)) updated=this.#update(task,'cancelled','settlement',at); else this.#event(task,task.status,'settlement',at); }
      else if(input.outcome==='unknown') updated=this.#update(task,'recovery_required','settlement',at);
      else if(action.claim_epoch===task.auth_epoch && !this.#held(keys) && !TERMINAL.has(task.status)) updated=this.#update(task,input.outcome==='terminated'?'blocked':'running','settlement',at);
      else this.#event(task,task.status,'settlement',at);
      return {task:taskRecord(updated),action:actionRecord(this.#action(keys,actionId)),reservationHeld:input.outcome==='unknown'};
    });
  }
  recover() {
    const at=this.#now();
    return this.#ledger.transaction(()=>{
      const pending=this.#ledger.query("SELECT * FROM actions WHERE state='dispatch_intent'");
      for(const action of pending) { const keys=[action.owner,action.workspace,action.task],task=this.#task(keys); this.#ledger.run("UPDATE actions SET state='unknown',updated_at=? WHERE owner=? AND workspace=? AND task=? AND id=?",at,...keys,action.id); if(task.status!=='cancel_requested'&&task.status!=='recovery_required') this.#update(task,'recovery_required','recovery',at); else this.#event(task,task.status,'recovery',at); }
      return {recoveryRequired:pending.length,reservationsHeld:this.#ledger.one('SELECT coalesce(sum(units),0) AS n FROM reservations').n};
    });
  }
  #cut(point) { if(this.#fixtureMode && this.#fixtureFaults) { try { this.#fixtureFaults(point); } catch { fail('FIXTURE_CUT'); } } }
  async dispatchFixture(scope,taskId,actionId,input,fixture) {
    if(!this.#fixtureMode || typeof fixture!=='function') fail('FIXTURE_DISABLED');
    const claimed=this.claim(scope,taskId,actionId,input);this.#cut('pre_receipt');
    let evidence;try{evidence=await fixture(Object.freeze({claimId:claimed.claimId,action:claimed.action}));}catch{ return this.settle(scope,taskId,actionId,{claimId:claimed.claimId,outcome:'unknown',evidenceDigest:digest('fixture-unknown')}); }
    this.#cut('post_effect');
    try { exact(evidence,['outcome','evidenceDigest']); return this.settle(scope,taskId,actionId,{claimId:claimed.claimId,...evidence}); } catch(error) { if(error instanceof FoundationError) throw error; fail('FIXTURE_RESULT_INVALID'); }
  }
  diagnostics() { return {schemaVersion:2,restricted:this.#ledger.restricted,closed:this.#ledger.closed,limits:this.limits}; }
  close() { this.#ledger.close(); }
}
