import { types } from 'node:util';
import {
  randomUUID, randomBytes, createCipheriv, createDecipheriv
}
from 'node:crypto';
import {
  Ledger, fail, FoundationError, SCHEMA_VERSION
}
from './ledger.mjs';
import {
  RuntimeError, reference, canonicalDigest, canonical, exact, ref, integer, normalizedSpec, hash
}
from './runtime-security.mjs';
export {
  RuntimeError, reference, canonicalDigest
};
const DEFAULTS={
  queueCapacity:32,maxActive:2,maxAttempts:3,maxTotalAttempts:12,maxTasks:1000,maxActionsPerTask:16,maxEventsPerTask:128,maxMetadataBytes:8192,maxDataBytes:65536,maxRecordsPerTask:128,maxCommands:4096,maxRuntimeMs:3600000,maxUsageUnits:1000000,maxCostEstimateMicros:1000000,maxControlCommands:128
};
const TERMINAL=new Set(['completed','failed','cancelled','deleted']);
const DATA_KINDS=['goal','constraints','clarification','branch','context','message','artifact','verification','progress'];
const OWNER=['owner','coordinator'], HOST=['host'], DISPATCH=['owner','coordinator','host'];
const taskRecord=t=>({
  ownerRef:t.owner,workspaceRef:t.workspace,taskRef:t.id,status:t.status,version:t.version,taskVersion:t.version,authEpoch:t.auth_epoch,createdAt:t.created_at,updatedAt:t.updated_at
});
const parse=text=>{
  try{
    return JSON.parse(text);
  }
  catch{
    fail('STORAGE_INVALID');
  }
};
const optKeys=(value,allowed,required)=>exact(value,allowed,required);
function limits(value,base=DEFAULTS,policy=false) {
  exact(value,Object.keys(DEFAULTS),[]);
  const result={
    ...base,...value
  };
  for(const [k,v] of Object.entries(result))integer(v,policy&&['maxActive','maxAttempts','maxTotalAttempts','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros','queueCapacity'].includes(k)?0:k==='maxMetadataBytes'?256:1,k==='maxRuntimeMs'?Number.MAX_SAFE_INTEGER:100000000);
  return result;
}
function modelPolicy(value) {
  exact(value,['version','presetRefs','catalogEvidenceRef']);
  integer(value.version,1);
  ref(value.catalogEvidenceRef);
  canonical(value.presetRefs);
  if(!Array.isArray(value.presetRefs)||value.presetRefs.length>32||value.presetRefs.length===0)fail('INVALID_INPUT');
  for(const v of value.presetRefs)ref(v);
  return JSON.parse(canonical(value));
}
export class RuntimeStore {
  #ledger;
  #key;
  #principals=new WeakMap();
  #clock;
  #permission;
  #secrets;
  #limits;
  #fixture;
  #fault;
  constructor(options) {
    exact(options,['databasePath','encryptionKey','principals','limits','clock','hostPermission','forbiddenSecrets','fixtureMode','fixtureFaults','migrationFault','fixtureMaxPageCount'],['databasePath','encryptionKey','principals']);
    const {
      databasePath,encryptionKey,principals,clock=Date.now,hostPermission=()=>false,forbiddenSecrets=[],fixtureMode=false,fixtureFaults,migrationFault,fixtureMaxPageCount
    }
    =options;
    if(types.isProxy(encryptionKey)||!Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||typeof clock!=='function'||typeof hostPermission!=='function'||typeof fixtureMode!=='boolean'||(!fixtureMode&&(fixtureFaults||migrationFault||fixtureMaxPageCount!==undefined))||(fixtureFaults!==undefined&&typeof fixtureFaults!=='function'))fail('INVALID_CONFIG');
    this.#limits=Object.freeze(limits(options.limits===undefined?{}:options.limits));
    this.#key=Buffer.from(encryptionKey);
    this.#clock=clock;
    this.#permission=hostPermission;
    this.#fixture=fixtureMode;
    this.#fault=fixtureFaults;
    canonical(forbiddenSecrets);
    if(!Array.isArray(forbiddenSecrets)||forbiddenSecrets.length>64||forbiddenSecrets.some(s=>typeof s!=='string'||s.length<4||s.length>256))fail('INVALID_CONFIG');
    this.#secrets=[...forbiddenSecrets];
    if(types.isProxy(principals)||!Array.isArray(principals)||Object.getPrototypeOf(principals)!==Array.prototype||principals.length>64)fail('INVALID_CONFIG');
    // Canonical array descriptors are validated without serializing the opaque handles.
    const descriptors=Object.getOwnPropertyDescriptors(principals);
    if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string'||(k!=='length'&&(! /^(0|[1-9]\d*)$/.test(k)||Number(k)>=principals.length||!descriptors[k].enumerable||!Object.hasOwn(descriptors[k],'value')))))fail('INVALID_CONFIG');
    for(let i=0;
    i<principals.length;
    i++){
      if(!Object.hasOwn(descriptors,String(i)))fail('INVALID_CONFIG');
      this.#bind(principals[i]);
    }
    if(fixtureMaxPageCount!==undefined)integer(fixtureMaxPageCount,1,1000000);
    try {
      this.#ledger=new Ledger(databasePath,{
        migrationFault,maxPageCount:fixtureMaxPageCount,
        validateSnapshot:snapshot=>{
          const original=this.#ledger;
          this.#ledger=snapshot;
          try{this.#validateOpen();}finally{this.#ledger=original;}
        }
      });
      this.#ledger.transaction(()=>{
        this.#validateOpen();
        if(!this.#ledger.one('SELECT key_digest FROM runtime_security WHERE id=1'))this.#ledger.run('INSERT INTO runtime_security VALUES(1,?)',hash(this.#key));
        this.#recover();
      });
    }
    catch(e){
      this.#ledger?.close();
      this.#key.fill(0);
      throw e;
    }
  }
  #bind(entry) {
    exact(entry,['handle','role','scope','taskRef','generationRef','sessionRef','readRecordRefs'],['handle','role','scope']);
    exact(entry.scope,['ownerId','workspaceId']);
    if(!entry.handle||typeof entry.handle!=='object'||this.#principals.has(entry.handle)||!['owner','coordinator','host','worker','reviewer'].includes(entry.role))fail('INVALID_CONFIG');
    const binding={
      role:entry.role,ownerRef:reference(entry.scope.ownerId),workspaceRef:reference(entry.scope.workspaceId)
    };
    for(const k of ['taskRef','generationRef','sessionRef'])if(entry[k]!==undefined)binding[k]=ref(entry[k]);
    if(['worker','reviewer'].includes(entry.role)&&(!binding.taskRef||!binding.generationRef))fail('INVALID_CONFIG');
    if(entry.readRecordRefs!==undefined){
      canonical(entry.readRecordRefs);
      if(!Array.isArray(entry.readRecordRefs)||entry.readRecordRefs.length>128)fail('INVALID_CONFIG');
      binding.readRecordRefs=entry.readRecordRefs.map(ref);
    }
    if(entry.role==='reviewer'&&!binding.readRecordRefs)binding.readRecordRefs=[];
    binding.principalRef=canonicalDigest(binding);
    this.#principals.set(entry.handle,Object.freeze(binding));
  }
  #ctx(handle,taskRef,roles) {
    const c=handle&&typeof handle==='object'?this.#principals.get(handle):null;
    if(!c||roles&&!roles.includes(c.role)||taskRef&&c.taskRef&&c.taskRef!==taskRef)fail('UNAUTHORIZED');
    if(taskRef)ref(taskRef);
    return c;
  }
  context(handle,taskRef) {
    const {
      readRecordRefs,...binding
    }
    =this.#ctx(handle,taskRef);
    return binding;
  }
  bindExecution(host,handle,binding) {
    exact(binding,['taskRef','generationRef','sessionRef','role','readRecordRefs'],['taskRef','generationRef','role']);
    const c=this.#ctx(host,binding.taskRef,HOST);
    exact(binding,['taskRef','generationRef','sessionRef','role','readRecordRefs'],['taskRef','generationRef','role']);
    if(!['worker','reviewer'].includes(binding.role))fail('UNAUTHORIZED');
    this.#task(c,binding.taskRef);
    this.#bind({
      handle,scope:{
        ownerId:'placeholder',workspaceId:'placeholder'
      },...binding
    });
    const old=this.#principals.get(handle);
    const next={
      ...old,ownerRef:c.ownerRef,workspaceRef:c.workspaceRef
    };
    next.principalRef=canonicalDigest(next);
    this.#principals.set(handle,Object.freeze(next));
    return this.context(handle,binding.taskRef);
  }
  #now(){
    try{
      return integer(this.#clock());
    }
    catch{
      fail('CLOCK_UNAVAILABLE');
    }
  }
  #check(value,max=this.#limits.maxMetadataBytes){
    const text=canonical(value);
    if(Buffer.byteLength(text)>max)fail('INPUT_TOO_LARGE');
    if(this.#secrets.some(s=>text.includes(s)))fail('SECRET_REJECTED');
    return text;
  }
  #keys(c,task){
    return [c.ownerRef,c.workspaceRef,task];
  }
  #task(c,id){
    const t=this.#ledger.one('SELECT * FROM tasks WHERE owner=? AND workspace=? AND id=?',...this.#keys(c,id));
    if(!t)fail('TASK_NOT_FOUND');
    return t;
  }
  #cas(c,input){
    const t=this.#task(c,input.taskRef);
    if(t.version!==integer(input.expectedTaskVersion,1))fail('STALE_VERSION');
    if(t.auth_epoch!==integer(input.expectedAuthEpoch))fail('STALE_AUTHORITY');
    if(TERMINAL.has(t.status))fail('TASK_TERMINAL');
    return t;
  }
  #held(c,task){
    return this.#ledger.one('SELECT count(*) AS n FROM reservations WHERE owner=? AND workspace=?'+(task?' AND task=?':''),c.ownerRef,c.workspaceRef,...(task?[task]:[])).n;
  }
  #event(t,reason,protectedEvent=false){
    const keys=[t.owner,t.workspace,t.id],n=this.#ledger.one('SELECT count(*) AS n FROM events WHERE owner=? AND workspace=? AND task=?',...keys).n,held=this.#held({
      ownerRef:t.owner,workspaceRef:t.workspace
    },t.id);
    if(n>=this.#limits.maxEventsPerTask-(protectedEvent?0:held?2*held+3:0))fail('HISTORY_LIMIT');
    this.#ledger.run('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)',...keys,n+1,t.version,t.status,reason,this.#now());
  }
  #update(t,status,reason,epoch=t.auth_epoch,protectedEvent=false){
    t={
      ...t,status,version:integer(t.version+1,1),auth_epoch:integer(epoch),updated_at:this.#now()
    };
    this.#ledger.run('UPDATE tasks SET status=?,version=?,auth_epoch=?,updated_at=? WHERE owner=? AND workspace=? AND id=?',status,t.version,epoch,t.updated_at,t.owner,t.workspace,t.id);
    this.#event(t,reason,protectedEvent);
    return t;
  }
  #mut(handle,input,roles,operation,fn,protectedOp=false){
    exact(input,Object.keys(input));
    const c=this.#ctx(handle,input.taskRef,roles);
    ref(input.commandRef);
    const text=this.#check(input,Math.max(this.#limits.maxMetadataBytes,this.#limits.maxDataBytes+4096)),digest=hash(c.principalRef+operation+text);
    return this.#ledger.transaction(()=>{
      const old=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,input.commandRef);
      if(old){
        if(old.digest!==digest||old.operation!==operation)fail('IDEMPOTENCY_CONFLICT');
        return parse(old.receipt);
      }
      const count=this.#ledger.one('SELECT count(*) AS n FROM runtime_commands').n,held=this.#ledger.one('SELECT count(*) AS n FROM reservations').n;
      const terminalProgress=protectedOp==='terminal'&&this.#terminalProgress(c,input,operation);
      const invalidationProgress=protectedOp===true&&this.#invalidationProgress(c,input,operation);
      if(count>=this.#limits.maxCommands-(terminalProgress?0:invalidationProgress?4*held+1:12*held+this.#limits.maxControlCommands))fail('COMMAND_LIMIT');
      const result=fn(c);
      const receipt=this.#check(result);
      this.#cut('before_commit');
      this.#ledger.run('INSERT INTO runtime_commands VALUES(?,?,?,?,?,?,?)',c.ownerRef,c.workspaceRef,input.commandRef,input.taskRef||c.workspaceRef,digest,operation,receipt);
      return result;
    });
  }
  #invalidationProgress(c,input,operation){
    const task=this.#task(c,input.taskRef);
    if(operation==='control')return input.kind==='cancel'&&task.status!=='cancel_requested';
    if(operation==='revokeAction'){const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,input.taskRef),input.actionRef);return !!grant&&!grant.revoked&&grant.auth_epoch===task.auth_epoch;}
    return false;
  }
  #terminalProgress(c,input,operation){
    if(operation==='control')return input.kind==='confirm_cancel';
    if(operation==='messageObservation'){const message=this.#record(c,input.taskRef,'message',input.messageRef);return !['consumed','rejected'].includes(message.state);}
    if(operation==='deliveryObservation'){const delivery=this.#record(c,input.taskRef,'delivery',input.deliveryRef);return !['delivered','failed'].includes(delivery.state);}
    const {w,a}=this.#claim(c,input);
    if(operation==='workerObservation')return !w.terminalEvidenceRef;
    if(operation==='markHandoff')return w.handoff?.state!=='resolved';
    if(operation==='settleAction'){
      if(!a.metadata.outcome||a.metadata.outcome==='unknown')return true;
      if(!w.terminalEvidenceRef||w.handoff?.state==='pending')return false;
      return !this.#ledger.query("SELECT payload FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind IN ('message','delivery')",...this.#keys(c,input.taskRef)).map(row=>parse(row.payload)).some(record=>record.claimRef===w.claimRef&&!['consumed','rejected','delivered','failed'].includes(record.state));
    }
    return operation==='control'&&input.kind==='confirm_cancel';
  }
  #cut(point){
    if(this.#fixture&&this.#fault){
      try{
        this.#fault(point);
      }
      catch{
        fail('FIXTURE_CUT');
      }
    }
  }
  #managed(t){
    if(!this.#ledger.runtimeManaged([t.owner,t.workspace,t.id])&&this.#ledger.one('SELECT 1 FROM actions WHERE owner=? AND workspace=? AND task=?',t.owner,t.workspace,t.id))fail('RUNTIME_ADOPTION_BLOCKED');
    this.#ledger.run("INSERT OR IGNORE INTO runtime_tasks VALUES(?,?,?,'active')",t.owner,t.workspace,t.id);
  }
  intake(handle,input){
    exact(input,['taskId','provider','source','eventId','commandRef','goal'],['taskId','provider','source','eventId','commandRef']);
    return this.#mut(handle,input,OWNER,'intake',c=>{
      const ingress=[c.ownerRef,c.workspaceRef,reference(input.provider),reference(input.source),reference(input.eventId)],old=this.#ledger.one('SELECT task FROM ingress WHERE owner=? AND workspace=? AND provider=? AND source=? AND event=?',...ingress);
      if(old)return{
        deduplicated:true,task:taskRecord(this.#task(c,old.task))
      };
      const id=reference(input.taskId),at=this.#now();
      let t=this.#ledger.one('SELECT * FROM tasks WHERE owner=? AND workspace=? AND id=?',...this.#keys(c,id));
      if(!t){
        if(this.#ledger.one('SELECT count(*) AS n FROM tasks').n>=this.#limits.maxTasks)fail('TASK_LIMIT');
        if(this.#ledger.one("SELECT count(*) AS n FROM tasks WHERE status='queued'").n>=this.#getPolicy(c).limits.queueCapacity)fail('QUEUE_FULL');
        this.#ledger.run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)',...this.#keys(c,id),'queued',1,0,at,at);
        t=this.#task(c,id);
        this.#event(t,'intake');
      }
      else if(TERMINAL.has(t.status))fail('TASK_TERMINAL');
      this.#ledger.run('INSERT INTO ingress VALUES(?,?,?,?,?,?,?)',...ingress,id,at);
      this.#managed(t);
      if(input.goal!==undefined&&!this.#ledger.one("SELECT 1 FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND kind='goal'",...this.#keys(c,id)))this.#data(c,t,{
        kind:'goal',content:input.goal,sourceRef:reference(input.source),commandRef:input.commandRef
      });
      return{
        deduplicated:false,task:taskRecord(t)
      };
    });
  }
  task(handle,taskRef){
    const c=this.#ctx(handle,taskRef);
    return taskRecord(this.#task(c,taskRef));
  }
  listTasks(handle){
    const c=this.#ctx(handle,undefined,['owner','coordinator','host']);
    return this.#ledger.query('SELECT * FROM tasks WHERE owner=? AND workspace=? ORDER BY created_at,id',c.ownerRef,c.workspaceRef).map(taskRecord);
  }
  #data(c,t,input){
    if(!DATA_KINDS.includes(input.kind)||typeof input.content!=='string'||!input.content.isWellFormed())fail('INVALID_INPUT');
    ref(input.sourceRef);
    if(Buffer.byteLength(input.content)>this.#limits.maxDataBytes)fail('INPUT_TOO_LARGE');
    if(this.#secrets.some(s=>input.content.includes(s)))fail('SECRET_REJECTED');
    const keys=this.#keys(c,t.id);
    if(this.#ledger.one('SELECT count(*) AS n FROM runtime_data WHERE owner=? AND workspace=? AND task=?',...keys).n>=this.#limits.maxRecordsPerTask)fail('RECORD_LIMIT');
    const id=canonicalDigest({
      commandRef:input.commandRef,kind:input.kind
    }),digest=hash(input.content),metadata={
      recordRef:id,digest,kind:input.kind,sourceRef:input.sourceRef,taskVersion:t.version,authEpoch:t.auth_epoch,generationRef:c.generationRef||null,createdAt:this.#now(),byteLength:Buffer.byteLength(input.content),cryptoVersion:2
    };
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#key,nonce);
    cipher.setAAD(Buffer.from(canonical({
      format:'runtime-data/v2',keys,id,kind:input.kind,digest,metadata
    })));
    const ciphertext=Buffer.concat([cipher.update(input.content,'utf8'),cipher.final()]);
    this.#ledger.run('INSERT INTO runtime_data VALUES(?,?,?,?,?,?,?,?,?,?)',...keys,id,input.kind,digest,ciphertext,nonce,cipher.getAuthTag(),canonical(metadata));
    return metadata;
  }
  putData(handle,input){
    exact(input,['taskRef','commandRef','kind','content','sourceRef','expectedTaskVersion','expectedAuthEpoch']);
    return this.#mut(handle,input,['owner','coordinator','host','worker','reviewer'],'putData',c=>{
      const t=this.#cas(c,input);
      if(c.role==='worker'&&!['message','artifact','progress'].includes(input.kind)||c.role==='reviewer'&&!['verification','progress'].includes(input.kind))fail('UNAUTHORIZED');
      const updated=this.#update(t,t.status,'progress');
      this.#managed(updated);
      return{
        ...this.#data(c,updated,input),task:taskRecord(updated)
      };
    });
  }
  #readAllowed(c,m){
    if(c.role==='reviewer'){
      if(!c.readRecordRefs.includes(m.recordRef)&&!(m.generationRef===c.generationRef&&['verification','progress'].includes(m.kind)))fail('UNAUTHORIZED');
    }
    else if(c.role==='worker'&&!(['goal','constraints','context'].includes(m.kind)||m.generationRef===c.generationRef&&['message','artifact','progress'].includes(m.kind)))fail('UNAUTHORIZED');
  }
  // Authenticate metadata before using it for any authorization or association.
  // Legacy producer/source/generation labels cannot be safely resealed as facts.
  #openData(c,row){
    const metadata=parse(row.metadata);
    if(metadata.cryptoVersion!==2)fail('CRYPTO_LEGACY_UNVERIFIED');
    try{
      exact(metadata,['recordRef','digest','kind','sourceRef','taskVersion','authEpoch','generationRef','createdAt','byteLength','cryptoVersion']);
      for(const key of ['recordRef','digest','sourceRef'])ref(metadata[key]);
      if(metadata.generationRef!==null)ref(metadata.generationRef);
      integer(metadata.taskVersion,1);
      integer(metadata.authEpoch);
      integer(metadata.createdAt);
      integer(metadata.byteLength,0,this.#limits.maxDataBytes);
      if(!DATA_KINDS.includes(metadata.kind)||metadata.recordRef!==row.id||metadata.digest!==row.digest||metadata.kind!==row.kind||row.owner!==c.ownerRef||row.workspace!==c.workspaceRef||row.nonce.length!==12||row.tag.length!==16||row.ciphertext.length!==metadata.byteLength)fail('STORAGE_INVALID');
      const decipher=createDecipheriv('aes-256-gcm',this.#key,row.nonce);
      decipher.setAAD(Buffer.from(canonical({
        format:'runtime-data/v2',keys:this.#keys(c,row.task),id:row.id,kind:row.kind,digest:row.digest,metadata
      })));
      decipher.setAuthTag(row.tag);
      const bytes=Buffer.concat([decipher.update(row.ciphertext),decipher.final()]);
      if(bytes.length!==metadata.byteLength||hash(bytes)!==row.digest)fail('STORAGE_INVALID');
      const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
      if(!content.isWellFormed())fail('STORAGE_INVALID');
      return {metadata,content};
    }
    catch{
      fail('STORAGE_INVALID');
    }
  }
  readData(handle,input){
    exact(input,['taskRef','recordRef']);
    const c=this.#ctx(handle,input.taskRef);
    ref(input.recordRef);
    const row=this.#ledger.one('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND id=?',...this.#keys(c,input.taskRef),input.recordRef);
    if(!row)fail('RECORD_NOT_FOUND');
    const {metadata,content}=this.#openData(c,row);
    try{this.#readAllowed(c,metadata);}catch(error){const addressed=metadata.kind==='message'&&['worker','reviewer'].includes(c.role)&&this.#ledger.query("SELECT payload FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind='message'",...this.#keys(c,input.taskRef)).map(r=>parse(r.payload)).some(m=>m.bodyRecordRef===row.id&&m.bodyDigest===row.digest&&['sent','consumed'].includes(m.state)&&m.immutableMetadata.recipientGenerationRef===c.generationRef&&m.immutableMetadata.recipientSessionRef===c.sessionRef);if(!addressed)throw error;}
    return {...metadata,content};
  }
  listData(handle,input){
    exact(input,['taskRef','kind'],['taskRef']);
    const c=this.#ctx(handle,input.taskRef);
    this.#task(c,input.taskRef);
    if(input.kind!==undefined&&!DATA_KINDS.includes(input.kind))fail('INVALID_INPUT');
    return this.#ledger.query('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=?'+(input.kind?' AND kind=?':''),...this.#keys(c,input.taskRef),...(input.kind?[input.kind]:[])).map(r=>this.#openData(c,r).metadata).filter(m=>{
      try{
        this.#readAllowed(c,m);
        return true;
      }
      catch{
        return false;
      }
    });
  }
  revise(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','status','goal','constraints','reason'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','reason']);
    if(!['operator','progress','clarification','branch','context'].includes(input.reason))fail('INVALID_INPUT');
    return this.#mut(handle,input,OWNER,'revise',c=>{
      let t=this.#cas(c,input),status=input.status||t.status;
      if(!['queued','running','waiting','blocked','completed','failed'].includes(status))fail('ILLEGAL_TRANSITION');
      if(['cancel_requested','recovery_required'].includes(t.status))fail('TASK_BLOCKED');
      if(TERMINAL.has(status)&&this.#held(c,t.id))fail('RESERVATION_HELD');
      if(status==='queued'&&t.status!=='queued'&&this.#ledger.one("SELECT count(*) AS n FROM tasks WHERE status='queued'").n>=this.#getPolicy(c).limits.queueCapacity)fail('QUEUE_FULL');
      t=this.#update(t,status,input.reason==='operator'?'operator':'progress');
      this.#managed(t);
      const data=[];
      for(const kind of ['goal','constraints'])if(input[kind]!==undefined)data.push(this.#data(c,t,{
        kind,content:input[kind],sourceRef:c.principalRef,commandRef:input.commandRef
      }));
      return{
        task:taskRecord(t),data
      };
    });
  }
  #getPolicy(c){
    const row=this.#ledger.one('SELECT * FROM runtime_policy WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef);
    if(!row)return{version:1,limits:{...this.#limits},modelPolicy:null};
    try{
      integer(row.version,1);
      const payload=parse(row.payload);
      exact(payload,['limits','modelPolicy']);
      return{version:row.version,limits:limits(payload.limits,this.#limits,true),modelPolicy:modelPolicy(payload.modelPolicy)};
    }catch{fail('STORAGE_INVALID');}
  }
  getPolicy(handle){
    return this.#getPolicy(this.#ctx(handle));
  }
  policy(handle,input){
    exact(input,['commandRef','expectedVersion','limits','modelPolicy']);
    return this.#mut(handle,input,['owner'],'policy',c=>{
      const old=this.#getPolicy(c);
      if(old.version!==integer(input.expectedVersion,1))fail('STALE_POLICY');
      exact(input.limits,['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros'],[]);
      const payload={
        limits:limits(input.limits,this.#limits,true),modelPolicy:modelPolicy(input.modelPolicy)
      };
      const version=integer(old.version+1,1);
      this.#ledger.run('INSERT INTO runtime_policy VALUES(?,?,?,?) ON CONFLICT(owner,workspace) DO UPDATE SET version=excluded.version,payload=excluded.payload',c.ownerRef,c.workspaceRef,version,canonical(payload));
      return{
        version,...payload
      };
    });
  }
  #action(c,task,action){
    ref(action);
    const row=this.#ledger.one('SELECT r.*,a.state,a.claim_id,a.attempts,a.claim_epoch,a.units AS base_units,a.kind AS base_kind,a.target_digest AS base_target,a.data_digest AS base_data FROM runtime_actions r JOIN actions a ON a.owner=r.owner AND a.workspace=r.workspace AND a.task=r.task AND a.id=r.action WHERE r.owner=? AND r.workspace=? AND r.task=? AND r.action=?',...this.#keys(c,task),action);
    if(!row)fail('ACTION_NOT_FOUND');
    const spec=normalizedSpec(parse(row.spec)),metadata=parse(row.metadata);
    if(spec.actionRef!==row.action||spec.units!==row.base_units||spec.kind!==row.base_kind||spec.targetDigest!==row.base_target||spec.dataDigest!==row.base_data||row.digest!==canonicalDigest({ownerRef:row.owner,workspaceRef:row.workspace,taskRef:row.task,taskVersion:metadata.plannedTaskVersion,authEpoch:metadata.plannedAuthEpoch,spec}))fail('STORAGE_INVALID');
    return{...row,spec,metadata};
  }
  planAction(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','spec']);
    const spec=normalizedSpec(input.spec);
    return this.#mut(handle,input,OWNER,'planAction',c=>{
      const t=this.#cas(c,input),keys=this.#keys(c,t.id),policy=this.#getPolicy(c);
      if(policy.version!==spec.resourcePolicyVersion||!policy.modelPolicy||policy.modelPolicy.version!==spec.modelPolicyVersion||!policy.modelPolicy.presetRefs.includes(spec.model.presetRef)||policy.modelPolicy.catalogEvidenceRef!==spec.model.catalogEvidenceRef)fail('MODEL_POLICY_UNAVAILABLE');
      if(['cancel_requested','recovery_required'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...keys)?.control==='paused')fail('TASK_BLOCKED');
      if(this.#ledger.one('SELECT count(*) AS n FROM actions WHERE owner=? AND workspace=? AND task=?',...keys).n>=this.#limits.maxActionsPerTask)fail('ACTION_LIMIT');
      if(this.#ledger.one('SELECT 1 FROM actions WHERE owner=? AND workspace=? AND task=? AND id=?',...keys,spec.actionRef))fail('IDEMPOTENCY_CONFLICT');
      this.#managed(t);
      const digest=canonicalDigest({
        ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,taskVersion:t.version,authEpoch:t.auth_epoch,spec
      });
      this.#ledger.run('INSERT INTO actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...keys,spec.actionRef,spec.kind,spec.targetDigest,spec.dataDigest,spec.units,'requested',0,null,null,null,this.#now(),this.#now());
      this.#ledger.run('INSERT INTO runtime_actions VALUES(?,?,?,?,?,?,?)',...keys,spec.actionRef,digest,canonical(spec),canonical({
        plannedTaskVersion:t.version,plannedAuthEpoch:t.auth_epoch,outcome:null,terminalEvidenceRef:null,releaseEvidenceRef:null
      }));
      this.#event(t,'action_requested');
      return{
        actionRef:spec.actionRef,actionDigest:digest,taskVersion:t.version,authEpoch:t.auth_epoch
      };
    });
  }
  grantAction(handle,input){
    exact(input,['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch','expiresAt']);
    ref(input.actionDigest);
    return this.#mut(handle,input,['owner'],'grantAction',c=>{
      const t=this.#cas(c,input),a=this.#action(c,t.id,input.actionRef),at=this.#now();
      if(a.digest!==input.actionDigest)fail('SPEC_MISMATCH');
      if(a.state!=='requested')fail('ACTION_NOT_GRANTABLE');
      if(a.metadata.plannedTaskVersion!==t.version||a.metadata.plannedAuthEpoch!==t.auth_epoch)fail('STALE_SPEC');
      integer(input.expiresAt,at+1);
      const epoch=t.auth_epoch+1;
      this.#ledger.run('UPDATE tasks SET auth_epoch=? WHERE owner=? AND workspace=? AND id=?',epoch,...this.#keys(c,t.id));
      this.#ledger.run('INSERT INTO grants VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,workspace,task,action) DO UPDATE SET task_version=excluded.task_version,auth_epoch=excluded.auth_epoch,expires_at=excluded.expires_at,revoked=0',...this.#keys(c,t.id),a.action,t.version,epoch,a.spec.targetDigest,a.spec.dataDigest,a.spec.units,a.spec.kind,input.expiresAt,0);
      this.#event(t,'grant');
      return{
        task:taskRecord({
          ...t,auth_epoch:epoch
        }),taskVersion:t.version,authEpoch:epoch,actionRef:a.action,actionDigest:a.digest,expiresAt:input.expiresAt
      };
    });
  }
  revokeAction(handle,input){
    exact(input,['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch']);
    return this.#mut(handle,input,['owner'],'revokeAction',c=>{
      const t=this.#cas(c,input),a=this.#action(c,t.id,input.actionRef);
      if(a.digest!==ref(input.actionDigest))fail('SPEC_MISMATCH');
      const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);
      if(!grant||grant.revoked||grant.auth_epoch!==t.auth_epoch)return{
        task:taskRecord(t),actionRef:a.action,reservationHeld:!!a.claim_id
      };
      const epoch=t.auth_epoch+1;
      this.#ledger.run('UPDATE tasks SET auth_epoch=? WHERE owner=? AND workspace=? AND id=?',epoch,...this.#keys(c,t.id));
      this.#ledger.run('UPDATE grants SET revoked=1 WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);
      this.#event(t,'revoke',true);
      return{
        task:taskRecord({
          ...t,auth_epoch:epoch
        }),actionRef:a.action,reservationHeld:!!a.claim_id
      };
    },true);
  }
  claimAction(handle,input){
    exact(input,['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch','outbox','delivery'],['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch']);
    if(input.outbox&&input.delivery)fail('INVALID_INPUT');
    if(input.outbox)exact(input.outbox,['messageRef']);
    if(input.delivery)exact(input.delivery,['deliveryRef']);
    const result=this.#mut(handle,input,DISPATCH,'claimAction',c=>{
      const t=this.#cas(c,input),a=this.#action(c,t.id,input.actionRef),keys=this.#keys(c,t.id),at=this.#now(),policy=this.#getPolicy(c);
      if(a.digest!==ref(input.actionDigest))fail('SPEC_MISMATCH');
      if(!['queued','running','waiting','blocked'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...keys)?.control!=='active')fail('TASK_BLOCKED');
      if(a.state!=='requested')fail('ACTION_ALREADY_DISPATCHED');
      const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...keys,a.action);
      if(!grant||grant.revoked||grant.auth_epoch!==t.auth_epoch||grant.task_version!==t.version||at>=grant.expires_at||grant.target_digest!==a.spec.targetDigest||grant.data_digest!==a.spec.dataDigest||grant.units!==a.spec.units)fail('APPROVAL_INVALID');
      if(policy.version!==a.spec.resourcePolicyVersion||!policy.modelPolicy||policy.modelPolicy.version!==a.spec.modelPolicyVersion)fail('STALE_POLICY');
      const used=this.#ledger.query('SELECT r.units,a.attempts,x.spec,x.metadata FROM reservations r JOIN actions a ON a.claim_id=r.claim_id LEFT JOIN runtime_actions x ON x.owner=a.owner AND x.workspace=a.workspace AND x.task=a.task AND x.action=a.id');
      let units=0,runtime=0,usage=0,cost=0;
      for(const r of used)units+=r.units;
      const charged=this.#ledger.query('SELECT x.spec,x.metadata FROM runtime_actions x JOIN actions a ON a.owner=x.owner AND a.workspace=x.workspace AND a.task=x.task AND a.id=x.action WHERE a.attempts>0');
      for(const r of charged){
        if(r.spec){
          const s=parse(r.spec);
          runtime+=s.charges.runtimeMs;
          const actual=parse(r.metadata);usage+=Math.max(s.charges.usageUnits,actual.usageState==='actual'?actual.usageUnits||0:0);
          if(s.charges.costState==='unknown')fail('COST_UNKNOWN');
          cost+=s.charges.costEstimateMicros;
          const m=parse(r.metadata);
          if(m.usageState==='unknown'&&(a.spec.charges.usageUnits>0||a.spec.charges.costEstimateMicros>0))fail('USAGE_UNKNOWN');
        }
      }
      const lim=policy.limits;
      if(a.spec.charges.costState==='unknown')fail('COST_UNKNOWN');
      if(units+a.spec.units>lim.maxActive)fail('ACTIVE_FULL');
      if(runtime+a.spec.charges.runtimeMs>lim.maxRuntimeMs||usage+a.spec.charges.usageUnits>lim.maxUsageUnits||cost+a.spec.charges.costEstimateMicros>lim.maxCostEstimateMicros)fail('BUDGET_LIMIT');
      const attempts=this.#ledger.query('SELECT a.attempts,r.spec FROM runtime_actions r JOIN actions a ON a.owner=r.owner AND a.workspace=r.workspace AND a.task=r.task AND a.id=r.action WHERE r.owner=? AND r.workspace=? AND r.task=?',...keys);
      let total=0,group=0;
      for(const r of attempts){
        total+=r.attempts;
        if(parse(r.spec).attemptGroupRef===a.spec.attemptGroupRef)group+=r.attempts;
      }
      if(group>=lim.maxAttempts||total>=lim.maxTotalAttempts||a.spec.attemptIndex!==group+1)fail('ATTEMPT_LIMIT');
      const history=this.#ledger.one('SELECT count(*) AS n FROM events WHERE owner=? AND workspace=? AND task=?',...keys).n;
      if(history+1+2*(this.#held(c,t.id)+1)+3>this.#limits.maxEventsPerTask)fail('HISTORY_LIMIT');
      if(this.#ledger.one('SELECT count(*) AS n FROM runtime_commands').n+12*(this.#ledger.one('SELECT count(*) AS n FROM reservations').n+1)+this.#limits.maxControlCommands>=this.#limits.maxCommands)fail('COMMAND_LIMIT');
      let allowed=false;
      try{
        allowed=this.#permission(Object.freeze({
          ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,actionRef:a.action,actionDigest:a.digest,taskVersion:t.version,authEpoch:t.auth_epoch,spec:JSON.parse(canonical(a.spec))
        }))===true;
      }
      catch{
        fail('HOST_DENIED');
      }
      if(!allowed)fail('HOST_DENIED');
      let record;
      if(input.outbox||input.delivery){
        const kind=input.outbox?'message':'delivery',id=input.outbox?.messageRef||input.delivery.deliveryRef;
        record=this.#record(c,t.id,kind,id);
        if(record.state!=='accepted'||record.targetDigest!==a.spec.targetDigest||(kind==='message'?record.bodyDigest:record.digest)!==a.spec.dataDigest)fail('OUTBOX_SPEC_MISMATCH');
        if(kind==='delivery'){const latest=this.#artifact(c,t.id,record.artifactRef);if(!latest||latest.version!==record.artifactVersion||latest.digest!==record.digest||latest.verification?.verdict!=='accepted')fail('ARTIFACT_UNVERIFIED');}
      }
      const claimId=randomUUID(),claimRef=reference(claimId),reservationRef=canonicalDigest({
        claimRef,actionDigest:a.digest
      });
      this.#ledger.run('INSERT INTO reservations VALUES(?,?,?,?,?,?,?)',claimId,...keys,a.action,a.spec.units,at);
      this.#ledger.run("UPDATE actions SET state='dispatch_intent',attempts=attempts+1,claim_id=?,claim_epoch=?,updated_at=? WHERE owner=? AND workspace=? AND task=? AND id=?",claimId,t.auth_epoch,at,...keys,a.action);
      const metadata={
        ...a.metadata,claimRef,reservationRef,generationRef:a.spec.executor.generationRef,usageState:'estimated',outcome:null
      };
      this.#saveAction(c,t.id,a.action,metadata);
      const worker={
        claimRef,reservationRef,actionRef:a.action,actionDigest:a.digest,generationRef:a.spec.executor.generationRef,sessionRef:a.spec.executor.sessionRef||null,phase:a.spec.executor.mode==='none'?'not_created':'intent',cursor:0,evidenceRef:null,terminalEvidenceRef:a.spec.executor.mode==='none'?canonicalDigest({
          claimRef,executor:'none'
        }):null
      };
      this.#ledger.run('INSERT INTO runtime_workers VALUES(?,?,?,?,?)',...keys,claimRef,canonical(worker));
      if(record)this.#saveRecord(c,t.id,input.outbox?'message':'delivery',input.outbox?.messageRef||input.delivery.deliveryRef,{
        ...record,state:'outbox_committed',claimRef,reservationRef,generationRef:worker.generationRef
      });
      const updated=this.#update(t,'running','dispatch');
      return{
        claimRef,reservationRef,actionRef:a.action,actionDigest:a.digest,generationRef:worker.generationRef,sessionRef:worker.sessionRef,task:taskRecord(updated)
      };
    });
    this.#cut('after_claim');
    return result;
  }
  assertClaimCurrent(handle,input){
    exact(input,['taskRef','claimRef','generationRef','actionDigest']);
    const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      const {
        w,a,t
      }
      =this.#claim(c,input);
      if(a.digest!==ref(input.actionDigest)||a.claim_epoch!==t.auth_epoch||!['queued','running','waiting','blocked'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active')fail('CLAIM_REVOKED');
      const g=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);
      if(!g||g.revoked||g.auth_epoch!==t.auth_epoch||this.#now()>=g.expires_at)fail('APPROVAL_INVALID');
      return{
        claimRef:w.claimRef,actionDigest:a.digest,generationRef:w.generationRef,task:taskRecord(t)
      };
    });
  }
  assertMessageCurrent(handle,input){
    exact(input,['taskRef','messageRef','claimRef','reservationRef','generationRef']);const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{const {a,t,w}=this.#claim(c,input),m=this.#record(c,input.taskRef,'message',input.messageRef);if(m.state!=='outbox_committed'||m.claimRef!==input.claimRef||m.reservationRef!==ref(input.reservationRef)||m.generationRef!==input.generationRef||m.targetDigest!==a.spec.targetDigest||m.bodyDigest!==a.spec.dataDigest||a.claim_epoch!==t.auth_epoch||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active'||['cancel_requested','recovery_required'].includes(t.status))fail('CLAIM_REVOKED');const g=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);if(!g||g.revoked||g.auth_epoch!==t.auth_epoch||this.#now()>=g.expires_at)fail('APPROVAL_INVALID');return{messageRef:m.messageRef,claimRef:w.claimRef,actionDigest:a.digest,reservationRef:w.reservationRef,task:taskRecord(t)};});
  }
  assertWorkerOwned(handle,input){
    exact(input,['taskRef','workerClaimRef','generationRef','sessionRef']);ref(input.sessionRef);const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{const {a,t,w}=this.#claim(c,{...input,claimRef:input.workerClaimRef});if(w.sessionRef!==input.sessionRef||!['created','ready','running'].includes(w.phase)||!['running','blocked','waiting'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active')fail('WORKER_UNAVAILABLE');const grant=this.#ledger.one('SELECT revoked FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);if(!grant||grant.revoked)fail('CLAIM_REVOKED');return{task:taskRecord(t),claimRef:w.claimRef,generationRef:w.generationRef,sessionRef:w.sessionRef,actionDigest:a.digest};});
  }
  #saveAction(c,task,action,metadata){
    this.#ledger.run('UPDATE runtime_actions SET metadata=? WHERE owner=? AND workspace=? AND task=? AND action=?',this.#check(metadata),...this.#keys(c,task),action);
  }
  #claim(c,input){
    ref(input.claimRef);
    ref(input.generationRef);
    const row=this.#ledger.one('SELECT * FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,input.taskRef),input.claimRef);
    if(!row)fail('STALE_CLAIM');
    const w=parse(row.payload);
    if(w.generationRef!==input.generationRef)fail('STALE_GENERATION');
    const a=this.#action(c,input.taskRef,w.actionRef);
    if(a.metadata.claimRef!==input.claimRef||a.metadata.releaseEvidenceRef)fail('STALE_CLAIM');
    return{
      w,a,t:this.#task(c,input.taskRef)
    };
  }
  workerObservation(handle,input){
    exact(input,['taskRef','claimRef','generationRef','commandRef','phase','sessionRef','evidenceRef','cursor'],['taskRef','claimRef','generationRef','commandRef','phase','evidenceRef']);
    if(!['submitted','created','ready','running','unknown','cancel_requested','stopped','not_created'].includes(input.phase))fail('INVALID_INPUT');
    ref(input.evidenceRef);
    if(input.sessionRef)ref(input.sessionRef);
    if(input.cursor!==undefined)integer(input.cursor);
    return this.#mut(handle,input,HOST,'workerObservation',c=>{
      const {
        w,a,t
      }
      =this.#claim(c,input);
      if(['stopped','not_created'].includes(w.phase)&&!['stopped','not_created'].includes(input.phase))fail('STALE_OBSERVATION');
      if(input.cursor!==undefined&&input.cursor<w.cursor)fail('STALE_CURSOR');
      if(w.sessionRef&&input.sessionRef&&w.sessionRef!==input.sessionRef)fail('SESSION_MISMATCH');
      if(['created','ready','running'].includes(input.phase)&&!input.sessionRef&&!w.sessionRef)fail('SESSION_REQUIRED');
      if(input.phase==='not_created'&&['created','ready','running','stopped'].includes(w.phase))fail('STALE_OBSERVATION');
      if(w.terminalEvidenceRef&&['stopped','not_created'].includes(input.phase)){if(w.phase!==input.phase||w.terminalEvidenceRef!==input.evidenceRef)fail('STALE_OBSERVATION');if((input.cursor??w.cursor)===w.cursor)return w;}
      const next={
        ...w,phase:input.phase,sessionRef:input.sessionRef||w.sessionRef,cursor:input.cursor??w.cursor,evidenceRef:input.evidenceRef,terminalEvidenceRef:['stopped','not_created'].includes(input.phase)?input.evidenceRef:w.terminalEvidenceRef
      };
      this.#ledger.run('UPDATE runtime_workers SET payload=? WHERE owner=? AND workspace=? AND task=? AND claim=?',this.#check(next),...this.#keys(c,t.id),w.claimRef);
      if(input.phase==='unknown'){
        this.#saveAction(c,t.id,a.action,{...a.metadata,usageState:'unknown'});
        this.#ledger.run("UPDATE actions SET state='unknown' WHERE owner=? AND workspace=? AND task=? AND id=?",...this.#keys(c,t.id),a.action);
        if(!['cancel_requested','recovery_required'].includes(t.status))this.#update(t,'recovery_required','recovery',t.auth_epoch,true);
      }
      return next;
    },['stopped','not_created'].includes(input.phase)?'terminal':false);
  }
  putHandoff(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','claimRef','generationRef','actionDigest','content','sourceRef']);ref(input.actionDigest);ref(input.sourceRef);
    return this.#mut(handle,input,DISPATCH,'putHandoff',c=>{const task=this.#cas(c,input),{w,a}=this.#claim(c,input);if(a.digest!==input.actionDigest||input.sourceRef!==a.action)fail('SPEC_MISMATCH');if(w.handoff?.state==='pending')fail('HANDOFF_PENDING');const t=this.#update(task,task.status,'progress');const data=this.#data({...c,generationRef:input.generationRef},t,{kind:'branch',content:input.content,sourceRef:input.sourceRef,commandRef:input.commandRef});const handoff={handoffRef:data.recordRef,state:'pending',evidenceRef:canonicalDigest({recordRef:data.recordRef,digest:data.digest,claimRef:w.claimRef,actionDigest:a.digest})};this.#ledger.run('UPDATE runtime_workers SET payload=? WHERE owner=? AND workspace=? AND task=? AND claim=?',this.#check({...w,handoff}),...this.#keys(c,t.id),w.claimRef);return{recordRef:data.recordRef,digest:data.digest,task:taskRecord(t),handoffRef:data.recordRef,claimRef:w.claimRef,generationRef:w.generationRef};});
  }
  markHandoff(handle,input){
    exact(input,['taskRef','claimRef','generationRef','commandRef','handoffRef','state','evidenceRef']);ref(input.handoffRef);ref(input.evidenceRef);if(!['pending','resolved'].includes(input.state))fail('INVALID_INPUT');
    return this.#mut(handle,input,HOST,'markHandoff',c=>{const {w}=this.#claim(c,input);if(w.handoff&&w.handoff.handoffRef!==input.handoffRef)fail('HANDOFF_MISMATCH');if(input.state==='resolved'&&!w.handoff)fail('HANDOFF_MISMATCH');if(w.handoff?.state==='resolved'){if(input.state!=='resolved'||input.evidenceRef!==w.handoff.evidenceRef)fail('STALE_OBSERVATION');return w;}const next={...w,handoff:{handoffRef:input.handoffRef,state:input.state,evidenceRef:input.evidenceRef}};this.#ledger.run('UPDATE runtime_workers SET payload=? WHERE owner=? AND workspace=? AND task=? AND claim=?',this.#check(next),...this.#keys(c,input.taskRef),input.claimRef);return next;},input.state==='resolved'?'terminal':false);
  }
  settleAction(handle,input){
    exact(input,['taskRef','claimRef','generationRef','commandRef','outcome','evidenceRef','terminalEvidenceRef','usage'],['taskRef','claimRef','generationRef','commandRef','outcome','evidenceRef']);
    if(!['completed','failed','unknown','terminated'].includes(input.outcome))fail('INVALID_INPUT');
    ref(input.evidenceRef);
    if(input.terminalEvidenceRef)ref(input.terminalEvidenceRef);
    if(input.usage){
      exact(input.usage,['state','units'],['state']);
      if(!['actual','estimated','unknown'].includes(input.usage.state))fail('INVALID_INPUT');
      if(input.usage.state==='unknown'&&input.usage.units!==undefined||input.usage.state!=='unknown'&&input.usage.units===undefined)fail('INVALID_INPUT');
      if(input.usage.units!==undefined)integer(input.usage.units);
    }
    return this.#mut(handle,input,HOST,'settleAction',c=>{
      const {
        w,a,t
      }
      =this.#claim(c,input);
      if(input.terminalEvidenceRef&&input.terminalEvidenceRef!==w.terminalEvidenceRef)fail('TERMINAL_EVIDENCE_MISMATCH');
      if(a.metadata.outcome&&a.metadata.outcome!=='unknown'&&a.metadata.outcome!==input.outcome)fail('STALE_OUTCOME');
      const metadata={
        ...a.metadata,outcome:input.outcome,outcomeEvidenceRef:input.evidenceRef,usageState:input.usage?.state||(input.outcome==='unknown'?'unknown':a.metadata.usageState),usageUnits:input.usage?.units??null
      };
      const obligations=this.#ledger.query("SELECT payload FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind IN ('message','delivery')",...this.#keys(c,t.id)).map(r=>parse(r.payload)).filter(r=>r.claimRef===w.claimRef&&!['consumed','rejected','delivered','failed'].includes(r.state));
      const release=input.outcome!=='unknown'&&!!w.terminalEvidenceRef&&obligations.length===0&&w.handoff?.state!=='pending';
      if(release){
        metadata.terminalEvidenceRef=w.terminalEvidenceRef;
        metadata.releaseEvidenceRef=canonicalDigest({
          claimRef:w.claimRef,terminal:w.terminalEvidenceRef,outcome:input.evidenceRef
        });
        this.#ledger.run('DELETE FROM reservations WHERE claim_id=?',a.claim_id);
        this.#ledger.run('UPDATE actions SET state=?,evidence_digest=?,updated_at=? WHERE owner=? AND workspace=? AND task=? AND id=?',input.outcome,input.evidenceRef,this.#now(),...this.#keys(c,t.id),a.action);
      }
      else this.#ledger.run("UPDATE actions SET state='unknown',evidence_digest=? WHERE owner=? AND workspace=? AND task=? AND id=?",input.evidenceRef,...this.#keys(c,t.id),a.action);
      this.#saveAction(c,t.id,a.action,metadata);
      let updated=t;
      if(!release&&!['cancel_requested','recovery_required'].includes(t.status))updated=this.#update(t,'recovery_required','settlement',t.auth_epoch,true);
      else if(release&&t.status==='recovery_required')updated=this.#update(t,'blocked','settlement',t.auth_epoch,true);
      return{
        task:taskRecord(updated),claimRef:w.claimRef,reservationRef:w.reservationRef,reservationHeld:!release,outcome:input.outcome,terminalEvidenceRef:metadata.terminalEvidenceRef,releaseEvidenceRef:metadata.releaseEvidenceRef
      };
    },input.outcome!=='unknown'?'terminal':false);
  }
  control(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','kind','actionRef','actionDigest'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','kind']);
    if(!['pause','resume','cancel','revoke','read','confirm_cancel'].includes(input.kind))fail('INVALID_INPUT');
    if(input.kind==='revoke'){
      exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','kind','actionRef','actionDigest']);
      const {
        kind,...revocation
      }
      =input;
      return this.revokeAction(handle,revocation);
    }
    return this.#mut(handle,input,OWNER,'control',c=>{
      let t=this.#cas(c,input);
      this.#managed(t);
      if(input.kind==='read')return{
        task:taskRecord(t),control:this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id)).control
      };
      if(input.kind==='confirm_cancel'){
        if(t.status!=='cancel_requested'||this.#held(c,t.id))fail('RESERVATION_HELD');
        t=this.#update(t,'cancelled','cancel',t.auth_epoch,true);
        return{
          task:taskRecord(t),cancellation:'confirmed'
        };
      }
      const previousControl=this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id)).control;
      if(input.kind==='pause'&&previousControl==='paused'||input.kind==='resume'&&previousControl==='active'||input.kind==='cancel'&&t.status==='cancel_requested')return{task:taskRecord(t),control:previousControl,cancellation:t.status==='cancel_requested'?'requested':null,reservationsHeld:this.#held(c,t.id)};
      if(input.kind==='resume'&&['cancel_requested','recovery_required'].includes(t.status))fail('TASK_BLOCKED');
      const state=input.kind==='pause'?'paused':input.kind==='cancel'?'cancel_requested':'active';
      this.#ledger.run('UPDATE runtime_tasks SET control=? WHERE owner=? AND workspace=? AND task=?',state,...this.#keys(c,t.id));
      if(input.kind!=='resume')this.#ledger.run('UPDATE grants SET revoked=1 WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id));
      t=this.#update(t,input.kind==='cancel'?'cancel_requested':t.status,'cancel',t.auth_epoch+1,input.kind==='cancel');
      return{
        task:taskRecord(t),control:state,cancellation:input.kind==='cancel'?'requested':null,reservationsHeld:this.#held(c,t.id)
      };
    },input.kind==='confirm_cancel'?'terminal':['cancel','revoke'].includes(input.kind));
  }
  #record(c,task,kind,id){
    ref(id);
    if(!['message','artifact','delivery','progress','review'].includes(kind))fail('STORAGE_INVALID');
    const row=this.#ledger.one('SELECT payload,digest FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind=? AND id=?',...this.#keys(c,task),kind,id);
    if(!row)fail('RECORD_NOT_FOUND');
    const payload=parse(row.payload);let original;
    if(kind==='message'){const {evidenceRef,...rest}=payload;original={...rest,state:'accepted',claimRef:null,reservationRef:null,generationRef:null};if(payload.targetDigest!==canonicalDigest(payload.immutableMetadata))fail('STORAGE_INVALID');}
    else if(kind==='delivery'){const {currentAccess,...rest}=payload;original={...rest,state:'accepted',claimRef:null,reservationRef:null,generationRef:null,observations:[]};if(payload.targetDigest!==canonicalDigest({ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,...payload.intent}))fail('STORAGE_INVALID');}
    else if(kind==='artifact')original={...payload,verification:null};
    else original=payload;
    if(row.digest!==canonicalDigest(original))fail('STORAGE_INVALID');return payload;
  }
  #saveRecord(c,task,kind,id,payload){
    this.#ledger.run('UPDATE runtime_records SET payload=? WHERE owner=? AND workspace=? AND task=? AND kind=? AND id=?',this.#check(payload),...this.#keys(c,task),kind,id);
  }
  #newRecord(c,task,kind,id,payload){
    ref(id);
    const keys=this.#keys(c,task);
    if(this.#ledger.one('SELECT count(*) AS n FROM runtime_records WHERE owner=? AND workspace=? AND task=?',...keys).n>=this.#limits.maxRecordsPerTask)fail('RECORD_LIMIT');
    const digest=canonicalDigest(payload),old=this.#ledger.one('SELECT digest FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind=? AND id=?',...keys,kind,id);
    if(old){
      if(old.digest!==digest)fail('IDEMPOTENCY_CONFLICT');
      return this.#record(c,task,kind,id);
    }
    this.#ledger.run('INSERT INTO runtime_records VALUES(?,?,?,?,?,?,?)',...keys,kind,id,digest,this.#check(payload));
    return payload;
  }
  #dataMeta(c,task,id,digest){
    ref(id);
    ref(digest);
    const row=this.#ledger.one('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND id=?',...this.#keys(c,task),id);
    if(!row)fail('RECORD_NOT_FOUND');
    const m=this.#openData(c,row).metadata;
    this.#readAllowed(c,m);
    if(m.digest!==digest)fail('DIGEST_MISMATCH');
    return m;
  }
  enqueueMessage(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','messageRef','recipientRef','bodyRecordRef','bodyDigest','immutableMetadata']);
    const m=input.immutableMetadata;
    exact(m,['senderRef','senderSessionRef','senderGenerationRef','recipientRef','recipientSessionRef','recipientGenerationRef','category','purposeRef','sourceRef','eventRef','originalMessageRef','hopLimit','dedupMode'],['senderRef','senderSessionRef','senderGenerationRef','recipientRef','recipientSessionRef','recipientGenerationRef','category','purposeRef','sourceRef','eventRef','hopLimit']);
    for(const[k,v]of Object.entries(m))if(!['category','hopLimit','dedupMode'].includes(k))ref(v);
    integer(m.hopLimit,0,16);
    if(!['task','direct','broadcast','result','control','question','progress','status','context','review_request','review_result','control_request'].includes(m.category)||m.dedupMode!==undefined&&!['unique_id','unavailable','same_generation','cross_generation'].includes(m.dedupMode))fail('INVALID_INPUT');
    return this.#mut(handle,input,['owner','coordinator','worker','reviewer'],'enqueueMessage',c=>{
      this.#cas(c,input);
      if(['worker','reviewer'].includes(c.role)&&(m.senderGenerationRef!==c.generationRef||m.senderSessionRef!==c.sessionRef))fail('UNAUTHORIZED');
      if(input.recipientRef!==m.recipientRef)fail('RECIPIENT_MISMATCH');
      let body;
      try{
        body=this.#dataMeta(c,input.taskRef,input.bodyRecordRef,input.bodyDigest);
      }
      catch(e){
        if(e.code!=='UNAUTHORIZED'||!m.originalMessageRef)throw e;
        const parent=this.#record(c,input.taskRef,'message',m.originalMessageRef);
        if(parent.state!=='consumed'||parent.bodyRecordRef!==input.bodyRecordRef||parent.bodyDigest!==input.bodyDigest||parent.immutableMetadata.recipientGenerationRef!==c.generationRef||parent.immutableMetadata.recipientSessionRef!==c.sessionRef)fail('UNAUTHORIZED');
        const row=this.#ledger.one('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND id=?',...this.#keys(c,input.taskRef),input.bodyRecordRef);
        if(!row)fail('RECORD_NOT_FOUND');
        body=this.#openData(c,row).metadata;
      }
      if(c.role==='reviewer'&&(m.category!=='review_result'||body.kind!=='verification'||body.generationRef!==c.generationRef))fail('UNAUTHORIZED');if(c.role!=='reviewer'&&body.kind!=='message')fail('INVALID_INPUT');
      if(m.originalMessageRef){
        const parent=this.#record(c,input.taskRef,'message',m.originalMessageRef);
        if(parent.state!=='consumed'||parent.immutableMetadata.purposeRef!==m.purposeRef||m.hopLimit!==parent.immutableMetadata.hopLimit||parent.immutableMetadata.recipientGenerationRef!==m.senderGenerationRef||parent.immutableMetadata.recipientSessionRef!==m.senderSessionRef||parent.immutableMetadata.sourceRef!==m.sourceRef||parent.immutableMetadata.eventRef!==m.eventRef||parent.bodyRecordRef!==input.bodyRecordRef||parent.bodyDigest!==input.bodyDigest)fail('ROUTE_INVALID');
        const visited=[...(parent.route||[]),m.senderGenerationRef];
        if(visited.includes(m.recipientGenerationRef))fail('ROUTE_LOOP');
        if(visited.length>m.hopLimit+1)fail('ROUTE_LIMIT');
        return this.#newRecord(c,input.taskRef,'message',input.messageRef,{
          taskRef:input.taskRef,messageRef:input.messageRef,immutableMetadata:JSON.parse(canonical(m)),recipientRef:input.recipientRef,bodyRecordRef:input.bodyRecordRef,bodyDigest:input.bodyDigest,byteLength:body.byteLength,targetDigest:canonicalDigest(m),state:'accepted',route:visited,claimRef:null,reservationRef:null,generationRef:null
        });
      }
      return this.#newRecord(c,input.taskRef,'message',input.messageRef,{
        taskRef:input.taskRef,messageRef:input.messageRef,immutableMetadata:JSON.parse(canonical(m)),recipientRef:input.recipientRef,bodyRecordRef:input.bodyRecordRef,bodyDigest:input.bodyDigest,byteLength:body.byteLength,targetDigest:canonicalDigest(m),state:'accepted',route:[m.senderGenerationRef],claimRef:null,reservationRef:null,generationRef:null
      });
    });
  }
  getMessage(handle,input){
    exact(input,['taskRef','messageRef']);
    const c=this.#ctx(handle,input.taskRef);
    const m=this.#record(c,input.taskRef,'message',input.messageRef);
    if(['worker','reviewer'].includes(c.role)&&!(m.immutableMetadata.senderGenerationRef===c.generationRef&&m.immutableMetadata.senderSessionRef===c.sessionRef)&&!(m.immutableMetadata.recipientGenerationRef===c.generationRef&&m.immutableMetadata.recipientSessionRef===c.sessionRef))fail('UNAUTHORIZED');
    return m;
  }
  messageObservation(handle,input){
    exact(input,['taskRef','messageRef','commandRef','state','evidenceRef','claimRef','generationRef']);
    if(!['sent','consumed','unknown','rejected'].includes(input.state))fail('INVALID_INPUT');
    ref(input.evidenceRef);
    return this.#mut(handle,input,HOST,'messageObservation',c=>{
      this.#claim(c,input);
      const m=this.#record(c,input.taskRef,'message',input.messageRef);
      if(m.claimRef!==input.claimRef||m.generationRef!==input.generationRef||m.state==='accepted')fail('STALE_CLAIM');
      if(['consumed','rejected'].includes(m.state)){if(m.state!==input.state||m.evidenceRef!==input.evidenceRef)fail('STALE_OBSERVATION');return m;}
      const next={
        ...m,state:input.state,evidenceRef:input.evidenceRef
      };
      this.#saveRecord(c,input.taskRef,'message',input.messageRef,next);
      return next;
    },['consumed','rejected'].includes(input.state)?'terminal':false);
  }
  writeArtifact(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','artifactRef','version','content','producerClaimRef','generationRef'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','artifactRef','version','content']);ref(input.artifactRef);integer(input.version,1);
    return this.#mut(handle,input,['owner','coordinator','worker'],'writeArtifact',c=>{const task=this.#cas(c,input),current=this.#artifact(c,input.taskRef,input.artifactRef);if(input.version!==(current?current.version+1:1))fail('STALE_ARTIFACT');if(c.role==='worker'&&(input.generationRef!==c.generationRef||!input.producerClaimRef))fail('UNAUTHORIZED');if(input.producerClaimRef)this.#claim(c,{...input,claimRef:input.producerClaimRef});const t=this.#update(task,task.status,'progress');this.#managed(t);const data=this.#data(c,t,{kind:'artifact',content:input.content,sourceRef:input.artifactRef,commandRef:input.commandRef});const result=this.#newRecord(c,t.id,'artifact',canonicalDigest({artifactRef:input.artifactRef,version:input.version}),{artifactRef:input.artifactRef,version:input.version,recordRef:data.recordRef,digest:data.digest,producerClaimRef:input.producerClaimRef||null,generationRef:input.generationRef||null,producerRef:c.principalRef,verification:null});return{...result,task:taskRecord(t)};});
  }
  recordArtifact(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','artifactRef','version','recordRef','digest','producerClaimRef','generationRef'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','artifactRef','version','recordRef','digest']);
    integer(input.version,1);
    return this.#mut(handle,input,['owner','coordinator','worker'],'recordArtifact',c=>{
      this.#cas(c,input);
      const m=this.#dataMeta(c,input.taskRef,input.recordRef,input.digest);
      if(m.kind!=='artifact')fail('INVALID_INPUT');
      if(c.role==='worker'&&(input.generationRef!==c.generationRef||!input.producerClaimRef))fail('UNAUTHORIZED');
      if(input.producerClaimRef)this.#claim(c,{
        ...input,claimRef:input.producerClaimRef
      });
      const current=this.#artifact(c,input.taskRef,input.artifactRef);
      if(input.version!==(current?current.version+1:1))fail('STALE_ARTIFACT');
      const payload={
        artifactRef:ref(input.artifactRef),version:input.version,recordRef:ref(input.recordRef),digest:ref(input.digest),producerClaimRef:input.producerClaimRef||null,generationRef:input.generationRef||null,producerRef:c.principalRef,verification:null
      };
      return this.#newRecord(c,input.taskRef,'artifact',canonicalDigest({
        artifactRef:input.artifactRef,version:input.version
      }),payload);
    });
  }
  #artifact(c,task,id,version){
    ref(id);
    return this.#ledger.query("SELECT id,payload FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind='artifact'",...this.#keys(c,task)).map(r=>this.#record(c,task,'artifact',r.id)).filter(r=>r.artifactRef===id&&(version===undefined||r.version===version)).sort((a,b)=>b.version-a.version)[0]||null;
  }
  artifact(handle,input){
    exact(input,['taskRef','artifactRef','version'],['taskRef','artifactRef']);
    const c=this.#ctx(handle,input.taskRef),a=this.#artifact(c,input.taskRef,input.artifactRef,input.version);
    if(!a)fail('RECORD_NOT_FOUND');
    this.#dataMeta(c,input.taskRef,a.recordRef,a.digest);
    return a;
  }
  verifyArtifact(handle,input){
    exact(input,['taskRef','commandRef','artifactRef','version','digest','verdict','evidenceRef']);
    integer(input.version,1);
    ref(input.digest);
    ref(input.evidenceRef);
    if(!['accepted','rejected','unknown'].includes(input.verdict))fail('INVALID_INPUT');
    return this.#mut(handle,input,['reviewer'],'verifyArtifact',c=>{
      const a=this.#artifact(c,input.taskRef,input.artifactRef);
      if(!a||a.version!==input.version||a.digest!==input.digest)fail('STALE_ARTIFACT');
      this.#dataMeta(c,input.taskRef,a.recordRef,a.digest);
      if(a.producerRef===c.principalRef||a.generationRef===c.generationRef)fail('REVIEW_NOT_INDEPENDENT');
      const charged=this.#ledger.query('SELECT x.spec,x.metadata FROM runtime_actions x JOIN reservations r ON r.owner=x.owner AND r.workspace=x.workspace AND r.task=x.task AND r.action=x.action WHERE x.owner=? AND x.workspace=? AND x.task=?',...this.#keys(c,input.taskRef)).some(row=>{const spec=parse(row.spec);return spec.role==='review'&&spec.kind==='review'&&spec.executor.generationRef===c.generationRef&&spec.dataDigest===a.digest;});
      if(!charged)fail('REVIEW_NOT_ADMITTED');
      const result={
        ...a,verification:{
          verdict:input.verdict,evidenceRef:input.evidenceRef,reviewerRef:c.principalRef,generationRef:c.generationRef
        }
      };
      this.#newRecord(c,input.taskRef,'review',input.commandRef,{
        artifactRef:a.artifactRef,version:a.version,digest:a.digest,...result.verification
      });
      this.#saveRecord(c,input.taskRef,'artifact',canonicalDigest({
        artifactRef:a.artifactRef,version:a.version
      }),result);
      return result;
    });
  }
  recordDelivery(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','deliveryRef','artifactRef','artifactVersion','digest','recipientRef','channelRef','targetDigest','previousDeliveryRef'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','deliveryRef','artifactRef','artifactVersion','digest','recipientRef','channelRef','targetDigest']);
    for(const k of ['deliveryRef','artifactRef','digest','recipientRef','channelRef','targetDigest'])ref(input[k]);
    integer(input.artifactVersion,1);
    return this.#mut(handle,input,OWNER,'recordDelivery',c=>{
      this.#cas(c,input);
      const {targetDigest,...intent}=input;if(targetDigest!==canonicalDigest({ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,...intent}))fail('DIGEST_MISMATCH');
      if(input.previousDeliveryRef){
        const prev=this.#record(c,input.taskRef,'delivery',input.previousDeliveryRef);
        if(prev.state!=='failed'||prev.artifactRef!==input.artifactRef||prev.artifactVersion!==input.artifactVersion||prev.digest!==input.digest||prev.recipientRef!==input.recipientRef||prev.channelRef!==input.channelRef)fail('RETRY_UNCONFIRMED');
        const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,input.taskRef),prev.claimRef);
        if(!worker||!this.#action(c,input.taskRef,parse(worker.payload).actionRef).metadata.releaseEvidenceRef)fail('RETRY_UNCONFIRMED');
      }
      const a=this.#artifact(c,input.taskRef,input.artifactRef);
      if(!a||a.version!==input.artifactVersion||a.digest!==input.digest||a.verification?.verdict!=='accepted')fail('ARTIFACT_UNVERIFIED');
      const payload={
        deliveryRef:input.deliveryRef,artifactRef:input.artifactRef,artifactVersion:input.artifactVersion,digest:input.digest,recipientRef:input.recipientRef,channelRef:input.channelRef,targetDigest:input.targetDigest,intent:JSON.parse(canonical(intent)),previousDeliveryRef:input.previousDeliveryRef||null,state:'accepted',claimRef:null,reservationRef:null,generationRef:null,observations:[]
      };
      return this.#newRecord(c,input.taskRef,'delivery',input.deliveryRef,payload);
    });
  }
  deliveryObservation(handle,input){
    exact(input,['taskRef','commandRef','deliveryRef','state','evidenceRef','permissionState','openability','observedAt','claimRef','generationRef']);
    if(!['sent','delivered','failed','unknown'].includes(input.state)||!['allowed','denied','unknown'].includes(input.permissionState)||!['openable','unavailable','unknown'].includes(input.openability))fail('INVALID_INPUT');
    ref(input.evidenceRef);
    integer(input.observedAt);
    return this.#mut(handle,input,HOST,'deliveryObservation',c=>{
      const d=this.#record(c,input.taskRef,'delivery',input.deliveryRef);
      if(d.state!=='delivered')this.#claim(c,input);
      if(d.claimRef!==input.claimRef||d.generationRef!==input.generationRef||d.state==='accepted')fail('STALE_CLAIM');
      if(input.state==='delivered'&&d.state!=='delivered'&&(input.permissionState!=='allowed'||input.openability!=='openable'))fail('DELIVERY_UNCONFIRMED');
      const observation={
        state:input.state,evidenceRef:input.evidenceRef,permissionState:input.permissionState,openability:input.openability,observedAt:input.observedAt
      };
      const prior=d.observations.at(-1);if(prior){if(input.observedAt<prior.observedAt||input.observedAt===prior.observedAt&&canonical(observation)!==canonical(prior))fail('STALE_OBSERVATION');if(canonical(observation)===canonical(prior))return d;}
      if(d.observations.length>=16||['sent','unknown'].includes(input.state)&&(d.observations.length>=15||Buffer.byteLength(canonical({...d,observations:[...d.observations,observation],currentAccess:{permissionState:input.permissionState,openability:input.openability}}))+512>this.#limits.maxMetadataBytes))fail('RECORD_LIMIT');
      const next={
        ...d,state:d.state==='delivered'?'delivered':input.state,observations:[...d.observations,observation],currentAccess:{
          permissionState:input.permissionState,openability:input.openability
        }
      };
      this.#saveRecord(c,input.taskRef,'delivery',input.deliveryRef,next);
      return next;
    },['delivered','failed'].includes(input.state)?'terminal':false);
  }
  getDelivery(handle,input){
    exact(input,['taskRef','deliveryRef']);
    const c=this.#ctx(handle,input.taskRef,['owner','coordinator','host']);
    return this.#record(c,input.taskRef,'delivery',input.deliveryRef);
  }
  writeProgress(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','progressRef','kind','content']);ref(input.progressRef);if(!['milestone','obstacle','question','final'].includes(input.kind))fail('INVALID_INPUT');
    return this.#mut(handle,input,['owner','coordinator','worker'],'writeProgress',c=>{const task=this.#cas(c,input),t=this.#update(task,task.status,'progress');this.#managed(t);const data=this.#data(c,t,{kind:'progress',content:input.content,sourceRef:input.progressRef,commandRef:input.commandRef});const result=this.#newRecord(c,t.id,'progress',input.progressRef,{progressRef:input.progressRef,recordRef:data.recordRef,digest:data.digest,kind:input.kind,generationRef:c.generationRef||null,at:this.#now()});return{...result,task:taskRecord(t)};});
  }
  recordProgress(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','progressRef','recordRef','digest','kind']);
    if(!['milestone','obstacle','question','final'].includes(input.kind))fail('INVALID_INPUT');
    return this.#mut(handle,input,['owner','coordinator','worker'],'recordProgress',c=>{
      this.#cas(c,input);
      const m=this.#dataMeta(c,input.taskRef,input.recordRef,input.digest);
      if(m.kind!=='progress')fail('INVALID_INPUT');
      return this.#newRecord(c,input.taskRef,'progress',input.progressRef,{
        progressRef:input.progressRef,recordRef:input.recordRef,digest:input.digest,kind:input.kind,generationRef:c.generationRef||null,at:this.#now()
      });
    });
  }
  snapshot(handle,input){
    exact(input,['taskRef']);
    const c=this.#ctx(handle,input.taskRef);
    return this.#ledger.transaction(()=>{
      const t=this.#task(c,input.taskRef),keys=this.#keys(c,t.id),data=this.listData(handle,input),actions=this.#ledger.query('SELECT r.action FROM runtime_actions r WHERE owner=? AND workspace=? AND task=?',...keys).map(r=>{
        const a=this.#action(c,t.id,r.action);
        return{
          actionRef:a.action,actionDigest:a.digest,spec:a.spec,state:a.state,attempts:a.attempts,...a.metadata
        };
      }),workers=this.#ledger.query('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=?',...keys).map(r=>parse(r.payload)),records=this.#ledger.query('SELECT kind,id,payload FROM runtime_records WHERE owner=? AND workspace=? AND task=?',...keys);
      const result={
        schemaVersion:SCHEMA_VERSION,observedAt:this.#now(),task:taskRecord(t),data,actions,workers,policy:this.#getPolicy(c),messages:[],artifacts:[],deliveries:[],progress:[],reviews:[],control:this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...keys)?.control||'active'
      };
      for(const r of records){
        const p=this.#record(c,t.id,r.kind,r.id);
        if(['worker','reviewer'].includes(c.role)){
          if(r.kind==='message'&&p.immutableMetadata.senderGenerationRef!==c.generationRef&&p.immutableMetadata.recipientGenerationRef!==c.generationRef)continue;
          if(r.kind==='artifact'&&!data.some(d=>d.recordRef===p.recordRef))continue;
          if(r.kind==='delivery')continue;
          if(r.kind==='review'&&!data.some(d=>d.digest===p.digest))continue;
          if(r.kind==='progress'&&p.generationRef!==c.generationRef)continue;
        }
        result[{
          message:'messages',artifact:'artifacts',delivery:'deliveries',progress:'progress',review:'reviews'
        }
        [r.kind]].push(p);
      }
      if(['worker','reviewer'].includes(c.role)){
        result.actions=result.actions.filter(a=>a.spec.executor.generationRef===c.generationRef);
        result.workers=result.workers.filter(w=>w.generationRef===c.generationRef);
      }
      return result;
    });
  }
  exportTask(handle,input){
    exact(input,['taskRef']);
    this.#ctx(handle,input.taskRef,['owner','coordinator','host']);
    return this.snapshot(handle,input);
  }
  #validateOpen(){
    const existing=this.#ledger.one('SELECT key_digest FROM runtime_security WHERE id=1');
    if(existing&&existing.key_digest!==hash(this.#key))fail('KEY_MISMATCH');
    this.#validate();
  }
  #validate(){
    for(const row of this.#ledger.query('SELECT metadata FROM runtime_data'))if(parse(row.metadata).cryptoVersion!==2)fail('CRYPTO_LEGACY_UNVERIFIED');
    for(const table of ['runtime_commands','runtime_data','runtime_actions','runtime_workers','runtime_records']){
      const rows=this.#ledger.query(`SELECT * FROM ${table}`);
      if(rows.length>this.#limits.maxCommands+this.#limits.maxTasks*this.#limits.maxRecordsPerTask)fail('STORAGE_INVALID');
      for(const r of rows){
        for(const k of ['owner','workspace','task','id','action','claim','digest'])if(r[k]!==undefined)ref(r[k]);
        for(const k of ['receipt','metadata','spec','payload'])if(r[k]!==undefined){
          const obj=parse(r[k]);
          this.#check(obj);
        }
      }
    }
    for(const policyRow of this.#ledger.query('SELECT * FROM runtime_policy'))this.#getPolicy({ownerRef:policyRow.owner,workspaceRef:policyRow.workspace});
    for(const r of this.#ledger.query('SELECT * FROM runtime_records'))this.#record({ownerRef:r.owner,workspaceRef:r.workspace},r.task,r.kind,r.id);
    for(const r of this.#ledger.query('SELECT * FROM runtime_actions')){
      const spec=normalizedSpec(parse(r.spec)),m=parse(r.metadata),action=this.#ledger.one('SELECT * FROM actions WHERE owner=? AND workspace=? AND task=? AND id=?',r.owner,r.workspace,r.task,r.action);
      if(!action||spec.actionRef!==r.action||spec.kind!==action.kind||spec.units!==action.units||spec.targetDigest!==action.target_digest||spec.dataDigest!==action.data_digest||r.digest!==canonicalDigest({ownerRef:r.owner,workspaceRef:r.workspace,taskRef:r.task,taskVersion:m.plannedTaskVersion,authEpoch:m.plannedAuthEpoch,spec}))fail('STORAGE_INVALID');
      if(action.claim_id){if(m.claimRef!==reference(action.claim_id)||m.generationRef!==spec.executor.generationRef)fail('STORAGE_INVALID');const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',r.owner,r.workspace,r.task,m.claimRef);if(!worker)fail('STORAGE_INVALID');const w=parse(worker.payload);if(w.claimRef!==m.claimRef||w.actionRef!==r.action||w.actionDigest!==r.digest||w.reservationRef!==m.reservationRef||w.generationRef!==m.generationRef)fail('STORAGE_INVALID');if(m.releaseEvidenceRef&&['unknown','dispatch_intent'].includes(action.state)||!m.releaseEvidenceRef&&!['unknown','dispatch_intent'].includes(action.state))fail('STORAGE_INVALID');}
    }
    for(const row of this.#ledger.query('SELECT * FROM runtime_data')){
      this.#openData({ownerRef:row.owner,workspaceRef:row.workspace},row);
    }
  }
  #recover(){
    for(const r of this.#ledger.query("SELECT * FROM actions a WHERE state='dispatch_intent' AND EXISTS (SELECT 1 FROM runtime_actions x WHERE x.owner=a.owner AND x.workspace=a.workspace AND x.task=a.task AND x.action=a.id)")){
      const c={
        ownerRef:r.owner,workspaceRef:r.workspace
      },t=this.#task(c,r.task),a=this.#action(c,r.task,r.id);
      this.#saveAction(c,r.task,r.id,{...a.metadata,usageState:'unknown'});
      this.#ledger.run("UPDATE actions SET state='unknown' WHERE owner=? AND workspace=? AND task=? AND id=?",...this.#keys(c,r.task),r.id);
      if(!['cancel_requested','recovery_required'].includes(t.status))this.#update(t,'recovery_required','recovery',t.auth_epoch,true);
      const w=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,r.task),a.metadata.claimRef);
      if(w){
        const payload=parse(w.payload);
        if(!payload.terminalEvidenceRef)this.#ledger.run('UPDATE runtime_workers SET payload=? WHERE owner=? AND workspace=? AND task=? AND claim=?',canonical({
          ...payload,phase:'unknown'
        }),...this.#keys(c,r.task),a.metadata.claimRef);
      }
    }
    for(const r of this.#ledger.query("SELECT * FROM runtime_records WHERE kind IN ('message','delivery')")){
      const p=parse(r.payload);
      if(['outbox_committed','sent'].includes(p.state))this.#saveRecord({
        ownerRef:r.owner,workspaceRef:r.workspace
      },r.task,r.kind,r.id,{
        ...p,state:'unknown'
      });
    }
  }
  diagnostics(){
    return{
      schemaVersion:SCHEMA_VERSION,closed:this.#ledger.closed,restricted:this.#ledger.restricted,limits:{
        ...this.#limits
      }
    };
  }
  close(){
    this.#ledger.close();
    this.#key.fill(0);
  }
}
