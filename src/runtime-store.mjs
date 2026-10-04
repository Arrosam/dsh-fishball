import { types } from 'node:util';
import {
  randomUUID, randomBytes, createCipheriv, createDecipheriv, createHmac
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
import { validateExecutionContext } from './context.mjs';
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
  #auditBounds=null;
  #auditBindings=new Map();
  constructor(options) {
    exact(options,['databasePath','encryptionKey','principals','limits','clock','hostPermission','forbiddenSecrets','fixtureMode','fixtureFaults','migrationFault','fixtureMaxPageCount','auditExecutionBounds'],['databasePath','encryptionKey','principals']);
    const {
      databasePath,encryptionKey,principals,clock=Date.now,hostPermission=()=>false,forbiddenSecrets=[],fixtureMode=false,fixtureFaults,migrationFault,fixtureMaxPageCount
    }
    =options;
    if(types.isProxy(encryptionKey)||!Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||typeof clock!=='function'||typeof hostPermission!=='function'||typeof fixtureMode!=='boolean'||(!fixtureMode&&(fixtureFaults||migrationFault||fixtureMaxPageCount!==undefined))||(fixtureFaults!==undefined&&typeof fixtureFaults!=='function'))fail('INVALID_CONFIG');
    this.#limits=Object.freeze(limits(options.limits===undefined?{}:options.limits));
    if(options.auditExecutionBounds!==undefined){
      exact(options.auditExecutionBounds,['inputByteLimit','resultByteLimit']);
      this.#auditBounds=Object.freeze({
        inputByteLimit:integer(options.auditExecutionBounds.inputByteLimit,1,Math.min(65536,this.#limits.maxDataBytes)),
        resultByteLimit:integer(options.auditExecutionBounds.resultByteLimit,1,Math.min(65536,this.#limits.maxDataBytes))
      });
    }
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
        validateMigration:source=>{const original=this.#ledger;this.#ledger=source;try{this.#validateOpen();}finally{this.#ledger=original;}},
        initializeMigration:(source,version)=>{const original=this.#ledger;this.#ledger=source;try{if(version<4)this.#initializeReceiptPolicies();}finally{this.#ledger=original;}},
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
    if(c.auditClaimRef){
      const binding=this.#auditBindings.get(c.auditClaimRef);
      const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,c.taskRef),c.auditClaimRef);
      const t=this.#task(c,c.taskRef);
      if(!binding||binding.principalRef!==c.principalRef||!worker||parse(worker.payload).generationRef!==c.generationRef||parse(worker.payload).terminalEvidenceRef||t.auth_epoch!==c.auditAuthEpoch||TERMINAL.has(t.status)||['cancel_requested','recovery_required'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,c.taskRef))?.control!=='active'||!this.#ledger.one('SELECT 1 FROM reservations WHERE owner=? AND workspace=? AND task=? AND claim_id=?',...this.#keys(c,c.taskRef),binding.claimId))fail('UNAUTHORIZED');
    }
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
    const material={...input};let changed=false;
    for(const key of ['content','goal','constraints'])if(typeof material[key]==='string'){
      if(!material[key].isWellFormed())fail('INVALID_INPUT');
      if(Buffer.byteLength(material[key])>this.#limits.maxDataBytes)fail('INPUT_TOO_LARGE');
      if(this.#secrets.some(s=>material[key].includes(s)))fail('SECRET_REJECTED');
      material[key]={contentDigest:hash(material[key]),byteLength:Buffer.byteLength(material[key])};changed=true;
    }
    const text=this.#check(material),digest=hash(c.principalRef+operation+text);
    let legacyDigest;
    if(changed){try{legacyDigest=hash(c.principalRef+operation+this.#check(input,Math.max(this.#limits.maxMetadataBytes,this.#limits.maxDataBytes+4096)));}catch(error){if(error.code!=='INPUT_TOO_LARGE')throw error;}}

    return this.#ledger.transaction(()=>{
      if(['chatControl','ingestEvent','advanceEventClock','approveEventClock'].includes(operation))this.#eventBinding(c,input);
      const old=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,input.commandRef);
      if(old){
        const receipt=this.#commandReceipt(old);
        if(old.digest!==digest&&old.digest!==legacyDigest||old.operation!==operation)fail('IDEMPOTENCY_CONFLICT');
        if(['beginContextExecution','beginAuditExecution'].includes(operation))return{...this.#auto(c,'execution',receipt.claimRef),deduplicated:true};
        if(['prepareAuditInput','captureAuditResult'].includes(operation))return{...receipt,deduplicated:true};
        if(operation==='ingestEvent')return{...receipt,deduplicated:true,task:taskRecord(this.#task(c,receipt.taskRef))};
        return receipt;
      }
      const count=this.#ledger.one('SELECT count(*) AS n FROM runtime_commands').n,held=this.#ledger.one('SELECT count(*) AS n FROM reservations').n;
      const terminalProgress=protectedOp==='terminal'&&this.#terminalProgress(c,input,operation);
      const invalidationProgress=protectedOp===true&&this.#invalidationProgress(c,input,operation);
      if(count>=this.#limits.maxCommands-(terminalProgress?0:invalidationProgress?4*held+1:12*held+this.#limits.maxControlCommands))fail('COMMAND_LIMIT');
      const result=fn(c);
      this.#ensureReceiptPolicy(c);
      const row={owner:c.ownerRef,workspace:c.workspaceRef,id:input.commandRef,task:input.taskRef||c.workspaceRef,digest,operation};
      this.#check(result);
      const receipt=this.#check({format:'command-receipt/v1',data:result,mac:this.#receiptMac(row,result)},this.#limits.maxMetadataBytes+512);
      this.#cut('before_commit');
      this.#ledger.run('INSERT INTO runtime_commands VALUES(?,?,?,?,?,?,?)',c.ownerRef,c.workspaceRef,input.commandRef,input.taskRef||c.workspaceRef,digest,operation,receipt);
      return result;
    });
  }
  #receiptMac(row,data){
    return createHmac('sha256',this.#key).update(canonical({
      format:'command-receipt/v1',ownerRef:row.owner,workspaceRef:row.workspace,
      commandRef:row.id,taskRef:row.task,commandDigest:row.digest,operation:row.operation,data
    })).digest('hex');
  }
  #receiptIdentity(row){
    return {commandRef:row.id,taskRef:row.task,commandDigest:row.digest,operation:row.operation};
  }
  #receiptPolicy(c){
    const policy=this.#auto(c,'receipt_policy',c.workspaceRef);
    if(!policy)fail('STORAGE_INVALID');
    const legacy=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='legacy_command' ORDER BY id",c.ownerRef,c.workspaceRef).map(row=>row.id);
    if(policy.legacyCount!==legacy.length||policy.legacyDigest!==canonicalDigest(legacy))fail('STORAGE_INVALID');
    return policy;
  }
  #ensureReceiptPolicy(c){
    if(this.#auto(c,'receipt_policy',c.workspaceRef)){this.#receiptPolicy(c);return;}
    // A workspace with existing commands needs a migration-authenticated boundary.
    if(this.#ledger.one('SELECT 1 FROM runtime_commands WHERE owner=? AND workspace=? LIMIT 1',c.ownerRef,c.workspaceRef))fail('STORAGE_INVALID');
    this.#saveAuto(c,'receipt_policy',c.workspaceRef,null,{legacyCount:0,legacyDigest:canonicalDigest([])});
  }
  #initializeReceiptPolicies(){
    const scopes=new Map();
    for(const row of this.#ledger.query('SELECT * FROM runtime_commands')){
      const c={ownerRef:row.owner,workspaceRef:row.workspace},scope=row.owner+row.workspace;
      if(!scopes.has(scope))scopes.set(scope,{c,ids:[]});
      const envelope=parse(row.receipt);
      if(envelope.format==='command-receipt/v1'){
        this.#commandReceipt(row,true);
      }else{
        // IDs/command bindings establish a format boundary only. The old receipt
        // contents are deliberately not authenticated or returned as facts.
        this.#saveAuto(c,'legacy_command',row.id,null,this.#receiptIdentity(row));
        scopes.get(scope).ids.push(row.id);
      }
    }
    for(const {c,ids} of scopes.values())this.#saveAuto(c,'receipt_policy',c.workspaceRef,null,{legacyCount:ids.length,legacyDigest:canonicalDigest(ids.sort())});
  }
  #commandReceipt(row,migration=false,history=false){
    const c={ownerRef:row.owner,workspaceRef:row.workspace},envelope=parse(row.receipt);
    const current=this.#ledger.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'");
    if(current&&!migration)this.#receiptPolicy(c);
    if(envelope.format==='command-receipt/v1'){
      try{
        exact(envelope,['format','data','mac']);
        if(envelope.mac!==this.#receiptMac(row,envelope.data))fail('STORAGE_INVALID');
        return envelope.data;
      }catch{fail('STORAGE_INVALID');}
    }
    if(!current||migration){
      // Prior schema3 S2 history may be migrated, never replayed as authority.
      if(!['intake','putData','revise','policy','planAction','grantAction','revokeAction','claimAction','workerObservation','putHandoff','markHandoff','settleAction','control','enqueueMessage','messageObservation','writeArtifact','recordArtifact','verifyArtifact','recordDelivery','deliveryObservation','writeProgress','recordProgress'].includes(row.operation))fail('STORAGE_INVALID');
      return null;
    }
    const legacy=this.#auto(c,'legacy_command',row.id);
    if(!legacy||canonical(legacy)!==canonical(this.#receiptIdentity(row)))fail('STORAGE_INVALID');
    if(history)return null;
    fail('CRYPTO_LEGACY_RECEIPT_UNVERIFIED');
  }
  #invalidationProgress(c,input,operation){
    const task=this.#task(c,input.taskRef);
    if(operation==='control'||operation==='chatControl')return input.kind==='cancel'&&task.status!=='cancel_requested';
    if(operation==='revokeAction'){const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,input.taskRef),input.actionRef);return !!grant&&!grant.revoked&&grant.auth_epoch===task.auth_epoch;}
    return false;
  }
  #terminalProgress(c,input,operation){
    if(operation==='reportAudit'||operation==='submitAuditResult'){const req=this.#auto(c,'audit',input.auditRef);return !!req&&!req.reportRef;}
    if(operation==='beginContextExecution'||operation==='beginAuditExecution')return !this.#auto(c,'execution',input.claimRef);
    if(operation==='captureAuditResult')return !this.#auto(c,'audit_result',input.executionRef);
    if(operation==='control'||operation==='chatControl')return input.kind==='confirm_cancel';
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
  #auditReserve(c,task,reviewOnly=false){
    return this.#ledger.query('SELECT x.spec FROM runtime_actions x JOIN reservations r ON r.owner=x.owner AND r.workspace=x.workspace AND r.task=x.task AND r.action=x.action WHERE x.owner=? AND x.workspace=? AND x.task=?',...this.#keys(c,task)).filter(row=>{
      const spec=normalizedSpec(parse(row.spec));
      return spec.executionInput&&(!reviewOnly||spec.kind==='review');
    }).length;
  }
  #data(c,t,input,protectedWrite=false){
    if(!DATA_KINDS.includes(input.kind)||typeof input.content!=='string'||!input.content.isWellFormed())fail('INVALID_INPUT');
    ref(input.sourceRef);
    if(Buffer.byteLength(input.content)>this.#limits.maxDataBytes)fail('INPUT_TOO_LARGE');
    if(this.#secrets.some(s=>input.content.includes(s)))fail('SECRET_REJECTED');
    const keys=this.#keys(c,t.id);
    if(this.#ledger.one('SELECT count(*) AS n FROM runtime_data WHERE owner=? AND workspace=? AND task=?',...keys).n>=this.#limits.maxRecordsPerTask-(protectedWrite?0:this.#auditReserve(c,t.id)))fail('RECORD_LIMIT');
    const id=canonicalDigest({
      commandRef:input.commandRef,kind:input.kind
    }),digest=hash(input.content),metadata={
      recordRef:id,digest,kind:input.kind,sourceRef:input.sourceRef,taskVersion:t.version,authEpoch:t.auth_epoch,generationRef:c.generationRef||null,createdAt:this.#now(),byteLength:Buffer.byteLength(input.content),cryptoVersion:2,...(input.kind==='context'?{sourceTaskVersion:input.expectedTaskVersion??t.version,sourceAuthEpoch:input.expectedAuthEpoch??t.auth_epoch,semanticRevision:this.#semantic(c,t.id),...(input.expectedMemory?{memoryNamespaceRef:input.expectedMemory.namespaceRef,memoryRevision:input.expectedMemory.revision}:{})}:{}),...(input.auditInput?{auditInputRef:id}:{}),...(input.auditResultRef?{auditResultRef:ref(input.auditResultRef)}:{})
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
    exact(input,['taskRef','commandRef','kind','content','sourceRef','expectedTaskVersion','expectedAuthEpoch','expectedMemory'],['taskRef','commandRef','kind','content','sourceRef','expectedTaskVersion','expectedAuthEpoch']);
    return this.#mut(handle,input,['owner','coordinator','host','worker','reviewer'],'putData',c=>{
      const t=this.#cas(c,input);
      if(input.expectedMemory)this.#memoryGuard(c,input.expectedMemory);
      if(c.role==='worker'&&!['message','artifact','progress'].includes(input.kind)||c.role==='reviewer'&&!['verification','progress'].includes(input.kind))fail('UNAUTHORIZED');
      const updated=this.#update(t,t.status,'progress');
      this.#managed(updated);
      if(['goal','constraints','clarification','branch','context'].includes(input.kind))this.#bumpSemantic(c,t.id);
      return{
        ...this.#data(c,updated,input),task:taskRecord(updated)
      };
    });
  }
  #readAllowed(c,m){
    if(m.auditInputRef&&!['owner','coordinator','host'].includes(c.role)){
      if(c.role==='reviewer'){
        if(c.auditInputRecordRef!==m.recordRef||!c.auditClaimRef)fail('UNAUTHORIZED');
      }else{
        const admitted=this.#ledger.query('SELECT x.spec,x.metadata FROM runtime_actions x JOIN reservations r ON r.owner=x.owner AND r.workspace=x.workspace AND r.task=x.task AND r.action=x.action WHERE x.owner=? AND x.workspace=? AND x.task=?',...this.#keys(c,c.taskRef)).some(row=>{
          const spec=normalizedSpec(parse(row.spec));
          return spec.executionInput?.recordRef===m.recordRef&&spec.kind==='repair'&&spec.executor.generationRef===c.generationRef&&spec.executor.sessionRef===c.sessionRef;
        });
        if(c.role!=='worker'||!admitted)fail('UNAUTHORIZED');
      }
    }
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
      exact(metadata,['recordRef','digest','kind','sourceRef','taskVersion','authEpoch','generationRef','createdAt','byteLength','cryptoVersion','sourceTaskVersion','sourceAuthEpoch','semanticRevision','memoryNamespaceRef','memoryRevision','auditInputRef','auditResultRef'],['recordRef','digest','kind','sourceRef','taskVersion','authEpoch','generationRef','createdAt','byteLength','cryptoVersion']);
      for(const key of ['recordRef','digest','sourceRef'])ref(metadata[key]);
      if(metadata.generationRef!==null)ref(metadata.generationRef);
      for(const k of ['sourceTaskVersion','semanticRevision'])if(metadata[k]!==undefined)integer(metadata[k],1);if(metadata.sourceAuthEpoch!==undefined)integer(metadata.sourceAuthEpoch);if(metadata.memoryNamespaceRef!==undefined){ref(metadata.memoryNamespaceRef);integer(metadata.memoryRevision);}else if(metadata.memoryRevision!==undefined)fail('STORAGE_INVALID');if(metadata.kind!=='context'&&['sourceTaskVersion','sourceAuthEpoch','semanticRevision','memoryNamespaceRef','memoryRevision'].some(k=>metadata[k]!==undefined))fail('STORAGE_INVALID');
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
      if(metadata.auditInputRef!==undefined){
        if(metadata.auditInputRef!==row.id||metadata.kind!=='context'||metadata.auditResultRef!==undefined)fail('STORAGE_INVALID');
        const input=this.#auto(c,'audit_input',metadata.auditInputRef);
        if(!input||input.taskRef!==row.task||input.recordRef!==row.id||input.digest!==row.digest)fail('STORAGE_INVALID');
      }
      if(metadata.auditResultRef!==undefined){
        ref(metadata.auditResultRef);
        if(metadata.kind!=='verification')fail('STORAGE_INVALID');
        const result=this.#auto(c,'audit_result',metadata.auditResultRef);
        if(!result||result.taskRef!==row.task||result.recordRef!==row.id||result.digest!==row.digest)fail('STORAGE_INVALID');
      }
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
      if(status==='completed')this.#auditGate(c,t.id);
      if(TERMINAL.has(status)&&this.#held(c,t.id))fail('RESERVATION_HELD');
      if(status==='queued'&&t.status!=='queued'&&this.#ledger.one("SELECT count(*) AS n FROM tasks WHERE status='queued'").n>=this.#getPolicy(c).limits.queueCapacity)fail('QUEUE_FULL');
      if(input.goal!==undefined||input.constraints!==undefined||['clarification','branch','context'].includes(input.reason))this.#bumpSemantic(c,t.id);
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
      if(spec.executionInput){
        this.#auditSpec(c,t.id,spec,true);
        if(this.#ledger.query('SELECT spec FROM runtime_actions WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef).some(row=>{
          const other=normalizedSpec(parse(row.spec));
          return other.executor.generationRef===spec.executor.generationRef||other.executor.sessionRef===spec.executor.sessionRef;
        }))fail('REVIEW_NOT_INDEPENDENT');
      }
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
    exact(input,['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch','outbox','delivery','auditRepair'],['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch']);
    if([input.outbox,input.delivery,input.auditRepair].filter(Boolean).length>1)fail('INVALID_INPUT');
    if(input.outbox)exact(input.outbox,['messageRef']);
    if(input.delivery)exact(input.delivery,['deliveryRef']);
    if(input.auditRepair)exact(input.auditRepair,['auditRef','round','previousReportRef','evidenceRef']);
    const result=this.#mut(handle,input,DISPATCH,'claimAction',c=>{
      const t=this.#cas(c,input),a=this.#action(c,t.id,input.actionRef),keys=this.#keys(c,t.id),at=this.#now(),policy=this.#getPolicy(c);
      if(a.digest!==ref(input.actionDigest))fail('SPEC_MISMATCH');
      if(!['queued','running','waiting','blocked'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...keys)?.control!=='active')fail('TASK_BLOCKED');
      if(a.state!=='requested')fail('ACTION_ALREADY_DISPATCHED');
      if(a.spec.executionInput)this.#auditSpec(c,t.id,a.spec,true);
      if(a.spec.executionInput){
        const dataCount=this.#ledger.one('SELECT count(*) AS n FROM runtime_data WHERE owner=? AND workspace=? AND task=?',...keys).n;
        const recordCount=this.#ledger.one('SELECT count(*) AS n FROM runtime_records WHERE owner=? AND workspace=? AND task=?',...keys).n;
        if(dataCount+this.#auditReserve(c,input.taskRef)+1>this.#limits.maxRecordsPerTask||a.spec.kind==='review'&&recordCount+this.#auditReserve(c,input.taskRef,true)+1>this.#limits.maxRecordsPerTask)fail('RECORD_LIMIT');
      }
      if(input.auditRepair)this.#repairBinding(c,{...input,...input.auditRepair},a);
      else if(a.spec.kind==='repair'&&this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='audit'",...keys).some(r=>this.#auto(c,'audit',r.id).bindingDigest===a.spec.targetDigest))fail('AUDIT_BINDING_MISMATCH');
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
      let record,notificationAdmission;
      if(input.outbox||input.delivery){
        const kind=input.outbox?'message':'delivery',id=input.outbox?.messageRef||input.delivery.deliveryRef;
        record=this.#record(c,t.id,kind,id);
        if(record.state!=='accepted'||record.targetDigest!==a.spec.targetDigest||(kind==='message'?record.bodyDigest:record.digest)!==a.spec.dataDigest)fail('OUTBOX_SPEC_MISMATCH');
        if(kind==='delivery'){const latest=this.#artifact(c,t.id,record.artifactRef);if(!latest||latest.version!==record.artifactVersion||latest.digest!==record.digest||latest.verification?.verdict!=='accepted')fail('ARTIFACT_UNVERIFIED');if(record.notification)notificationAdmission=this.#notificationAdmission(c,t.id,record,at);}
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
      if(input.auditRepair)this.#commitRepair(c,{...input,...input.auditRepair},a,claimRef,worker.generationRef);
      if(record)this.#saveRecord(c,t.id,input.outbox?'message':'delivery',input.outbox?.messageRef||input.delivery.deliveryRef,{
        ...record,state:'outbox_committed',claimRef,reservationRef,generationRef:worker.generationRef
      });
      if(notificationAdmission)this.#commitNotification(c,t.id,record,notificationAdmission,claimRef,reservationRef,at);
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
      if(a.spec.kind==='repair'&&this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='audit'",...this.#keys(c,t.id)).some(r=>this.#auto(c,'audit',r.id).bindingDigest===a.spec.targetDigest)&&!this.#auto(c,'repair',w.claimRef))fail('AUDIT_BINDING_MISMATCH');
      if(a.digest!==ref(input.actionDigest)||a.claim_epoch!==t.auth_epoch||!['queued','running','waiting','blocked'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active')fail('CLAIM_REVOKED');
      const g=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);
      if(!g||g.revoked||g.auth_epoch!==t.auth_epoch||this.#now()>=g.expires_at)fail('APPROVAL_INVALID');
      if(a.spec.executionInput){
        const material=this.#auditSpec(c,t.id,a.spec,true);
        if(material.purpose==='audit_repair'){
          const repair=this.#auto(c,'repair',w.claimRef);
          if(!repair||repair.auditRef!==material.auditRef||repair.previousReportRef!==material.previousReportRef||repair.round!==material.round)fail('AUDIT_BINDING_MISMATCH');
        }
      }
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
    return this.#mut(handle,input,DISPATCH,'putHandoff',c=>{
      const task=this.#cas(c,input),{w,a}=this.#claim(c,input);
      if(a.digest!==input.actionDigest||input.sourceRef!==a.action)fail('SPEC_MISMATCH');
      if(w.handoff?.state==='pending')fail('HANDOFF_PENDING');
      this.#bumpSemantic(c,task.id);
      const t=this.#update(task,task.status,'progress');
      const data=this.#data({...c,generationRef:input.generationRef},t,{kind:'branch',content:input.content,sourceRef:input.sourceRef,commandRef:input.commandRef});
      const handoff={handoffRef:data.recordRef,state:'pending',evidenceRef:canonicalDigest({recordRef:data.recordRef,digest:data.digest,claimRef:w.claimRef,actionDigest:a.digest})};
      this.#ledger.run('UPDATE runtime_workers SET payload=? WHERE owner=? AND workspace=? AND task=? AND claim=?',this.#check({...w,handoff}),...this.#keys(c,t.id),w.claimRef);
      return{recordRef:data.recordRef,digest:data.digest,task:taskRecord(t),handoffRef:data.recordRef,claimRef:w.claimRef,generationRef:w.generationRef};
    });
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
      const execution=this.#auto(c,'execution',w.claimRef);if(execution)this.#saveAuto(c,'execution',w.claimRef,t.id,{...execution,state:input.outcome==='unknown'||!w.terminalEvidenceRef?'unknown':input.outcome,outcomeEvidenceRef:input.evidenceRef,terminalEvidenceRef:w.terminalEvidenceRef});
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
    return this.#mut(handle,input,OWNER,'control',c=>this.#control(c,input),input.kind==='confirm_cancel'?'terminal':['cancel','revoke'].includes(input.kind));
  }
  #control(c,input){
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
  }

  #record(c,task,kind,id){
    ref(id);
    if(!['message','artifact','delivery','progress','review'].includes(kind))fail('STORAGE_INVALID');
    const row=this.#ledger.one('SELECT payload,digest FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind=? AND id=?',...this.#keys(c,task),kind,id);
    if(!row)fail('RECORD_NOT_FOUND');
    const payload=parse(row.payload);let original;
    if(kind==='message'){const {evidenceRef,...rest}=payload;original={...rest,state:'accepted',claimRef:null,reservationRef:null,generationRef:null};if(payload.targetDigest!==canonicalDigest(payload.immutableMetadata))fail('STORAGE_INVALID');}
    else if(kind==='delivery'){if(payload.notification&&canonical(payload.notification)!==canonical(payload.intent.notification))fail('STORAGE_INVALID');const {currentAccess,...rest}=payload;original={...rest,state:'accepted',claimRef:null,reservationRef:null,generationRef:null,observations:[]};if(payload.targetDigest!==canonicalDigest({ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,...payload.intent}))fail('STORAGE_INVALID');}
    else if(kind==='artifact')original={...payload,verification:null};
    else original=payload;
    if(row.digest!==canonicalDigest(original))fail('STORAGE_INVALID');
    if(kind==='artifact')this.#validateArtifactVerification(c,task,payload);
    return payload;
  }
  #saveRecord(c,task,kind,id,payload){
    this.#ledger.run('UPDATE runtime_records SET payload=? WHERE owner=? AND workspace=? AND task=? AND kind=? AND id=?',this.#check(payload),...this.#keys(c,task),kind,id);
  }
  #newRecord(c,task,kind,id,payload,protectedWrite=false){
    ref(id);
    const keys=this.#keys(c,task);
    if(this.#ledger.one('SELECT count(*) AS n FROM runtime_records WHERE owner=? AND workspace=? AND task=?',...keys).n>=this.#limits.maxRecordsPerTask-(protectedWrite?0:this.#auditReserve(c,task,true)))fail('RECORD_LIMIT');
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
      if(c.auditClaimRef||a.verification?.resultRef||this.#ledger.query('SELECT spec FROM runtime_actions WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,input.taskRef)).some(row=>{
        const spec=normalizedSpec(parse(row.spec));
        return spec.executionInput&&spec.executor.generationRef===c.generationRef;
      }))fail('AUDIT_RESULT_REQUIRED');
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
  #notificationSpec(spec){
    exact(spec,['enabled','timeZone','quietWindows','emergencyKinds','mergeKinds','mergeWindowMs','minIntervalMs','frequency']);
    if(typeof spec.enabled!=='boolean'||typeof spec.timeZone!=='string'||spec.timeZone.length>64||! /^[A-Za-z0-9_+\/-]+$/.test(spec.timeZone))fail('INVALID_INPUT');
    try{new Intl.DateTimeFormat('en-GB',{timeZone:spec.timeZone}).format(0);}catch{fail('TIMEZONE_INVALID');}
    canonical(spec.quietWindows);
    if(!Array.isArray(spec.quietWindows)||spec.quietWindows.length>8)fail('INVALID_INPUT');
    for(const window of spec.quietWindows){
      exact(window,['startMinute','endMinute']);
      integer(window.startMinute,0,1439);integer(window.endMinute,0,1440);
      if(window.startMinute===window.endMinute)fail('INVALID_INPUT');
    }
    for(const key of ['emergencyKinds','mergeKinds']){
      canonical(spec[key]);
      if(!Array.isArray(spec[key])||spec[key].length>4||new Set(spec[key]).size!==spec[key].length||spec[key].some(kind=>!['milestone','obstacle','question','final'].includes(kind)))fail('INVALID_INPUT');
    }
    integer(spec.mergeWindowMs,0,8640000000000000);integer(spec.minIntervalMs,0,8640000000000000);
    exact(spec.frequency,['windowMs','maxClaims']);integer(spec.frequency.windowMs,1,8640000000000000);integer(spec.frequency.maxClaims,0,4096);
    return JSON.parse(canonical(spec));
  }
  configureNotificationPolicy(handle,input){
    exact(input,['commandRef','policyRef','expectedRevision','spec']);
    ref(input.policyRef);integer(input.expectedRevision);
    const spec=this.#notificationSpec(input.spec);
    return this.#mut(handle,input,['owner'],'configureNotificationPolicy',c=>{
      const old=this.#auto(c,'notification_policy',input.policyRef);
      if((old?.revision||0)!==input.expectedRevision)fail('STALE_NOTIFICATION_POLICY');
      if(!old&&this.#autoCount(c,'notification_policy')>=16)fail('NOTIFICATION_LIMIT');
      return this.#saveAuto(c,'notification_policy',input.policyRef,null,{policyRef:input.policyRef,revision:input.expectedRevision+1,spec});
    });
  }
  getNotificationPolicy(handle,input){
    exact(input,['policyRef']);
    const c=this.#ctx(handle,undefined,['owner','coordinator','host']);
    const policy=this.#auto(c,'notification_policy',input.policyRef);
    if(!policy)fail('NOTIFICATION_POLICY_UNAVAILABLE');
    this.#notificationSpec(policy.spec);
    const windows=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='notification_window'",c.ownerRef,c.workspaceRef).map(row=>this.#auto(c,'notification_window',row.id)).filter(window=>window.policyRef===policy.policyRef);
    return{...policy,windows};
  }
  #notificationBinding(value){
    exact(value,['policyRef','policyRevision','progressRefs','mergeKeyRef']);
    ref(value.policyRef);ref(value.mergeKeyRef);integer(value.policyRevision,1);
    canonical(value.progressRefs);
    if(!Array.isArray(value.progressRefs)||value.progressRefs.length===0||value.progressRefs.length>16||new Set(value.progressRefs).size!==value.progressRefs.length)fail('INVALID_INPUT');
    value.progressRefs.forEach(ref);
  }
  #notificationReleased(c,task,delivery){
    if(!delivery.claimRef)return false;
    const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,task),delivery.claimRef);
    if(!worker)fail('STORAGE_INVALID');
    return !!this.#action(c,task,parse(worker.payload).actionRef).metadata.releaseEvidenceRef;
  }
  #notificationAdmission(c,task,delivery,at){
    const binding=delivery.notification;this.#notificationBinding(binding);
    const policy=this.#auto(c,'notification_policy',binding.policyRef);
    if(!policy)fail('NOTIFICATION_POLICY_UNAVAILABLE');
    if(policy.revision!==binding.policyRevision)fail('STALE_NOTIFICATION_POLICY');
    const spec=this.#notificationSpec(policy.spec);
    if(!spec.enabled)fail('NOTIFICATION_DISABLED');
    const progress=binding.progressRefs.map(id=>{
      const record=this.#record(c,task,'progress',id);
      const data=this.#dataMeta(c,task,record.recordRef,record.digest);
      if(data.kind!=='progress'||data.sourceRef!==record.progressRef)fail('STORAGE_INVALID');
      return record;
    });
    const emergency=progress.some(record=>spec.emergencyKinds.includes(record.kind));
    if(progress.length>1&&progress.some(record=>!spec.mergeKinds.includes(record.kind)))fail('NOTIFICATION_MERGE_DENIED');
    if(!emergency&&progress.every(record=>spec.mergeKinds.includes(record.kind))&&at<Math.min(...progress.map(record=>record.at))+spec.mergeWindowMs)fail('NOTIFICATION_COALESCING');
    let minute;
    try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:spec.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);minute=Number(parts.find(part=>part.type==='hour').value)*60+Number(parts.find(part=>part.type==='minute').value);}catch{fail('NOTIFICATION_CLOCK_INVALID');}
    if(!emergency&&spec.quietWindows.some(window=>window.startMinute<window.endMinute?minute>=window.startMinute&&minute<window.endMinute:minute>=window.startMinute||minute<window.endMinute))fail('NOTIFICATION_QUIET');
    const endpoint={taskRef:task,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef};
    const groupId=canonicalDigest({...endpoint,mergeKeyRef:binding.mergeKeyRef}),group=this.#auto(c,'notification_group',groupId);
    const priorClaims=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='notification_claim'",...this.#keys(c,task)).map(row=>this.#auto(c,'notification_claim',row.id));
    if(!group&&priorClaims.some(prior=>prior.groupId===groupId))fail('STORAGE_INVALID');
    if(group){const prior=this.#record(c,task,'delivery',group.deliveryRef);if(!['delivered','failed'].includes(prior.state)||!this.#notificationReleased(c,task,prior))fail('NOTIFICATION_PENDING');}
    if(!group&&this.#autoCount(c,'notification_group',task)>=this.#limits.maxRecordsPerTask)fail('NOTIFICATION_LIMIT');
    const facts=progress.map(record=>({id:canonicalDigest({...endpoint,digest:record.digest}),record}));
    for(const fact of facts){
      const ownership=this.#auto(c,'notification_fact',fact.id);
      if(!ownership){if(priorClaims.some(prior=>prior.factIds.includes(fact.id)))fail('STORAGE_INVALID');continue;}
      const prior=this.#record(c,task,'delivery',ownership.deliveryRef);
      if(prior.state==='delivered')fail('NOTIFICATION_DUPLICATE');
      if(prior.state!=='failed'||!this.#notificationReleased(c,task,prior))fail('NOTIFICATION_PENDING');
      if(delivery.previousDeliveryRef!==prior.deliveryRef)fail('RETRY_UNCONFIRMED');
    }
    if(this.#autoCount(c,'notification_fact',task)+facts.filter(fact=>!this.#auto(c,'notification_fact',fact.id)).length>this.#limits.maxRecordsPerTask*16)fail('NOTIFICATION_LIMIT');
    const windowId=canonicalDigest({policyRef:binding.policyRef,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef}),old=this.#auto(c,'notification_window',windowId);
    if(old&&(at<old.windowStart||at<old.lastClaimAt))fail('NOTIFICATION_CLOCK_INVALID');
    if(old&&at-old.lastClaimAt<spec.minIntervalMs)fail('NOTIFICATION_INTERVAL');
    const windowStart=!old||at-old.windowStart>=spec.frequency.windowMs?at:old.windowStart;
    const count=old&&windowStart===old.windowStart?old.count:0;
    if(count>=spec.frequency.maxClaims)fail('NOTIFICATION_FREQUENCY');
    if(!old&&this.#autoCount(c,'notification_window')>=128)fail('NOTIFICATION_LIMIT');
    return{binding,groupId,facts,windowId,windowStart,count};
  }
  #commitNotification(c,task,delivery,admission,claimRef,reservationRef,at){
    const {binding,groupId,facts,windowId,windowStart,count}=admission;
    const ownership={taskRef:task,deliveryRef:delivery.deliveryRef,claimRef,reservationRef,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef,policyRef:binding.policyRef,policyRevision:binding.policyRevision,claimedAt:at};
    this.#saveAuto(c,'notification_claim',delivery.deliveryRef,task,{...ownership,groupId,factIds:facts.map(fact=>fact.id)});
    this.#saveAuto(c,'notification_window',windowId,null,{policyRef:binding.policyRef,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef,windowStart,count:count+1,lastClaimAt:at});
    this.#saveAuto(c,'notification_group',groupId,task,{...ownership,mergeKeyRef:binding.mergeKeyRef,progressRefs:[...binding.progressRefs]});
    for(const {id,record} of facts)this.#saveAuto(c,'notification_fact',id,task,{...ownership,progressRef:record.progressRef,digest:record.digest});
  }
  recordDelivery(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','deliveryRef','artifactRef','artifactVersion','digest','recipientRef','channelRef','targetDigest','previousDeliveryRef','notification'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','deliveryRef','artifactRef','artifactVersion','digest','recipientRef','channelRef','targetDigest']);
    for(const k of ['deliveryRef','artifactRef','digest','recipientRef','channelRef','targetDigest'])ref(input[k]);
    integer(input.artifactVersion,1);
    if(input.notification)this.#notificationBinding(input.notification);
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
        deliveryRef:input.deliveryRef,artifactRef:input.artifactRef,artifactVersion:input.artifactVersion,digest:input.digest,recipientRef:input.recipientRef,channelRef:input.channelRef,targetDigest:input.targetDigest,intent:JSON.parse(canonical(intent)),previousDeliveryRef:input.previousDeliveryRef||null,...(input.notification?{notification:JSON.parse(canonical(input.notification))}:{}),state:'accepted',claimRef:null,reservationRef:null,generationRef:null,observations:[]
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
    return this.#ledger.transaction(()=>this.#snapshot(c,input.taskRef,handle));
  }
  #snapshot(c,taskRef,handle){
    const input={taskRef};
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
      result.executions=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='execution'",...keys).map(r=>this.#auto(c,'execution',r.id)).filter(r=>!['worker','reviewer'].includes(c.role)||r.generationRef===c.generationRef);
      result.audits=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='audit'",...keys).map(r=>this.#auto(c,'audit',r.id)).filter(req=>!['worker','reviewer'].includes(c.role)||c.role==='reviewer'&&req.material.every(m=>c.readRecordRefs.includes(m.recordRef))||c.role==='worker'&&result.actions.some(a=>a.spec.targetDigest===req.bindingDigest));
      result.semanticRevision=this.#semantic(c,t.id);
      result.notificationFacts=['owner','coordinator','host'].includes(c.role)?this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='notification_fact'",...keys).map(row=>{const fact=this.#auto(c,'notification_fact',row.id),delivery=this.#record(c,t.id,'delivery',fact.deliveryRef);return{...fact,state:delivery.state,released:this.#notificationReleased(c,t.id,delivery)};}):[];
      result.notifications=['owner','coordinator','host'].includes(c.role)?this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='notification_group'",...keys).map(row=>{const group=this.#auto(c,'notification_group',row.id),delivery=this.#record(c,t.id,'delivery',group.deliveryRef);return{...group,state:delivery.state,released:this.#notificationReleased(c,t.id,delivery)};}):[];
      return result;
  }

  exportTask(handle,input){
    exact(input,['taskRef']);
    this.#ctx(handle,input.taskRef,['owner','coordinator','host']);
    return this.snapshot(handle,input);
  }
  #auto(c,kind,id){
    ref(id);
    const row=this.#ledger.one('SELECT * FROM automation_records WHERE owner=? AND workspace=? AND kind=? AND id=?',c.ownerRef,c.workspaceRef,kind,id);
    if(!row)return null;
    const envelope=parse(row.payload);
    try{
      exact(envelope,['version','data','mac']);
      if(envelope.version!==1||envelope.mac!==this.#seal(c,kind,id,row.task,envelope.data))fail('STORAGE_INVALID');
      return envelope.data;
    }catch{
      fail('STORAGE_INVALID');
    }
  }
  #seal(c,kind,id,task,data){
    return createHmac('sha256',this.#key).update(canonical({
      format:'automation-record/v1',ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,kind,id,task,data
    })).digest('hex');
  }
  #saveAuto(c,kind,id,task,data){
    const payload=this.#check({
      version:1,data,mac:this.#seal(c,kind,id,task,data)
    });
    this.#ledger.run('INSERT INTO automation_records VALUES(?,?,?,?,?,?) ON CONFLICT(owner,workspace,kind,id) DO UPDATE SET task=excluded.task,payload=excluded.payload',c.ownerRef,c.workspaceRef,kind,id,task,payload);
    return data;
  }
  #semantic(c,task){
    return this.#auto(c,'semantic',task)?.revision||1;
  }
  #bumpSemantic(c,task){
    return this.#saveAuto(c,'semantic',task,task,{
      ...this.#auto(c,'semantic',task),revision:integer(this.#semantic(c,task)+1,1)
    }).revision;
  }
  memoryBinding(handle){
    const c=this.#ctx(handle,undefined,['owner','coordinator','host']);
    return {
      ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,role:c.role
    };
  }
  #memory(c,id){
    ref(id);
    const row=this.#ledger.one('SELECT * FROM workspace_memory WHERE owner=? AND workspace=? AND namespace=?',c.ownerRef,c.workspaceRef,id);
    if(!row)return null;
    try{
      const m=parse(row.metadata);
      exact(m,['ownerRef','workspaceRef','namespaceRef','revision','digest','recordRef','deleted','createdAt','updatedAt','sourceRefs','byteLength','cryptoVersion','requestDigest'],['ownerRef','workspaceRef','namespaceRef','revision','digest','recordRef','deleted','createdAt','updatedAt','sourceRefs','byteLength','cryptoVersion']);
      if(m.ownerRef!==c.ownerRef||m.workspaceRef!==c.workspaceRef||m.namespaceRef!==id||m.revision!==row.revision||m.digest!==row.digest||m.cryptoVersion!==2||typeof m.deleted!=='boolean'||row.nonce.length!==12||row.tag.length!==16)fail('STORAGE_INVALID');
      integer(m.revision,1);
      integer(m.byteLength,0,4194304);
      integer(m.createdAt);
      integer(m.updatedAt);
      ref(m.digest);
      ref(m.recordRef);
      canonical(m.sourceRefs);
      if(!Array.isArray(m.sourceRefs)||m.sourceRefs.length>16||new Set(m.sourceRefs).size!==m.sourceRefs.length)fail('STORAGE_INVALID');
      m.sourceRefs.forEach(ref);
      const d=createDecipheriv('aes-256-gcm',this.#key,row.nonce);
      d.setAAD(Buffer.from(canonical({
        format:'workspace-memory/v1',ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,namespaceRef:id,metadata:m
      })));
      d.setAuthTag(row.tag);
      const bytes=Buffer.concat([d.update(row.ciphertext),d.final()]);
      if(bytes.length!==m.byteLength||m.deleted&&bytes.length!==0||!m.deleted&&hash(bytes)!==m.digest)fail('STORAGE_INVALID');
      const content=new TextDecoder('utf-8',{
        fatal:true,ignoreBOM:true
      }).decode(bytes);
      return m.deleted?m:{
        ...m,content
      };
    }catch{
      fail('STORAGE_INVALID');
    }
  }
  #memoryGuard(c,expected){
    exact(expected,['namespaceRef','revision']);
    ref(expected.namespaceRef);
    integer(expected.revision);
    const current=this.#memory(c,expected.namespaceRef);
    if(expected.revision===0?current!==null:!current||current.deleted||current.revision!==expected.revision)fail('STALE_MEMORY');
    return current;
  }
  getMemory(handle,input){
    exact(input,['namespaceRef']);
    return this.#memory(this.#ctx(handle,undefined,['owner','coordinator','host']),input.namespaceRef);
  }
  listMemory(handle){
    const c=this.#ctx(handle,undefined,['owner','coordinator','host']);
    return this.#ledger.query('SELECT namespace FROM workspace_memory WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef).map(r=>{
      const{
        content,...m
      }=this.#memory(c,r.namespace);
      return m;
    });
  }
  memoryCommandReceipt(handle,input){
    exact(input,['namespaceRef','commandRef','requestDigest']);
    ref(input.namespaceRef);
    ref(input.commandRef);
    ref(input.requestDigest);
    const c=this.#ctx(handle,undefined,['owner','coordinator']);
    const row=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,input.commandRef);
    if(!row)return null;
    const receipt=this.#commandReceipt(row);
    if(!['putMemory','deleteMemory'].includes(row.operation)||receipt.namespaceRef!==input.namespaceRef||receipt.requestDigest!==input.requestDigest)fail('IDEMPOTENCY_CONFLICT');
    return receipt;
  }
  putMemory(handle,input){
    exact(input,['namespaceRef','commandRef','expectedRevision','content','sourceRefs','requestDigest'],['namespaceRef','commandRef','expectedRevision','content','sourceRefs']);
    if(typeof input.content!=='string'||!input.content.isWellFormed())fail('INVALID_INPUT');
    const byteLength=Buffer.byteLength(input.content);
    if(byteLength>4194304)fail('MEMORY_LIMIT');
    if(this.#secrets.some(s=>input.content.includes(s)))fail('SECRET_REJECTED');
    canonical(input.sourceRefs);
    if(!Array.isArray(input.sourceRefs)||input.sourceRefs.length>16||new Set(input.sourceRefs).size!==input.sourceRefs.length)fail('INVALID_INPUT');
    input.sourceRefs.forEach(ref);
    const {
      content,...binding
    }=input;
    return this.#mut(handle,{
      ...binding,contentDigest:hash(content)
    },OWNER,'putMemory',c=>this.#writeMemory(c,input,false));
  }
  deleteMemory(handle,input){
    exact(input,['namespaceRef','commandRef','expectedRevision','requestDigest'],['namespaceRef','commandRef','expectedRevision']);
    return this.#mut(handle,input,['owner'],'deleteMemory',c=>this.#writeMemory(c,input,true));
  }
  #writeMemory(c,input,deleted){
    ref(input.namespaceRef);
    integer(input.expectedRevision);
    if(input.requestDigest!==undefined)ref(input.requestDigest);
    const old=this.#memory(c,input.namespaceRef);
    if(old?.deleted)fail('MEMORY_DELETED');
    if((old?.revision||0)!==input.expectedRevision||deleted&&!old)fail('STALE_MEMORY');
    const rows=this.#ledger.query('SELECT namespace,length(ciphertext) AS n FROM workspace_memory WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef);
    if(!old&&rows.length>=16||rows.reduce((sum,r)=>sum+(r.namespace===input.namespaceRef?0:r.n),0)+Buffer.byteLength(deleted?'':input.content)>67108864)fail('MEMORY_LIMIT');
    const at=this.#now(),metadata={
      ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,namespaceRef:input.namespaceRef,revision:input.expectedRevision+1,digest:deleted?old.digest:hash(input.content),recordRef:canonicalDigest({
        namespaceRef:input.namespaceRef,commandRef:input.commandRef
      }),deleted,createdAt:old?.createdAt??at,updatedAt:at,sourceRefs:deleted?old.sourceRefs:[...input.sourceRefs],byteLength:Buffer.byteLength(deleted?'':input.content),cryptoVersion:2,...(input.requestDigest?{
        requestDigest:input.requestDigest
      }:{
      })
    };
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#key,nonce);
    cipher.setAAD(Buffer.from(canonical({
      format:'workspace-memory/v1',ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,namespaceRef:input.namespaceRef,metadata
    })));
    const ciphertext=Buffer.concat([cipher.update(deleted?'':input.content,'utf8'),cipher.final()]);
    this.#ledger.run('INSERT INTO workspace_memory VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,workspace,namespace) DO UPDATE SET revision=excluded.revision,digest=excluded.digest,ciphertext=excluded.ciphertext,nonce=excluded.nonce,tag=excluded.tag,metadata=excluded.metadata',c.ownerRef,c.workspaceRef,input.namespaceRef,metadata.revision,metadata.digest,ciphertext,nonce,cipher.getAuthTag(),canonical(metadata));
    return metadata;
  }
  #route(value){
    exact(value,['pairingRef','pairingRevision','principalRef','conversationRef','threadRef','conversationKind'],['pairingRef','pairingRevision','principalRef','conversationRef','conversationKind']);
    for(const k of ['pairingRef','principalRef','conversationRef'])ref(value[k]);
    if(value.threadRef!==undefined)ref(value.threadRef);
    integer(value.pairingRevision,1);
    if(!['private','group'].includes(value.conversationKind))fail('INVALID_INPUT');
    return JSON.parse(canonical(value));
  }
  configureSource(handle,input){
    exact(input,['commandRef','sourceRef','expectedRevision','spec']);
    ref(input.sourceRef);
    integer(input.expectedRevision);
    const s=input.spec;
    exact(s,['kind','identityMode','enabled','adapterRef','permissionPolicyRef','maxEventAgeMs','rate','routeBinding'],['kind','identityMode','enabled','adapterRef','permissionPolicyRef','maxEventAgeMs','rate']);
    if(!['schedule','webhook','chat','internal'].includes(s.kind)||!['unique_id','unavailable'].includes(s.identityMode)||typeof s.enabled!=='boolean')fail('INVALID_INPUT');
    ref(s.adapterRef);
    ref(s.permissionPolicyRef);
    integer(s.maxEventAgeMs,0,8640000000000000);
    exact(s.rate,['windowMs','maxEvents']);
    integer(s.rate.windowMs,1,8640000000000000);
    integer(s.rate.maxEvents,0,4096);
    if(s.kind==='chat')this.#route(s.routeBinding);
    else if(s.routeBinding!==undefined)fail('INVALID_INPUT');
    return this.#mut(handle,input,['owner'],'configureSource',c=>{
      const old=this.#auto(c,'source',input.sourceRef);
      if((old?.revision||0)!==input.expectedRevision)fail('STALE_SOURCE');
      if(!old&&this.#autoCount(c,'source')>=32)fail('EVENT_LIMIT');
      return this.#saveAuto(c,'source',input.sourceRef,null,{
        sourceRef:input.sourceRef,revision:input.expectedRevision+1,spec:JSON.parse(canonical(s)),rateWindowStart:old?.rateWindowStart??null,rateCount:old?.rateCount||0
      });
    });
  }
  #autoCount(c,kind){
    return this.#ledger.one('SELECT count(*) AS n FROM automation_records WHERE owner=? AND workspace=? AND kind=?',c.ownerRef,c.workspaceRef,kind).n;
  }
  configureSubscription(handle,input){
    exact(input,['commandRef','subscriptionRef','sourceRef','expectedRevision','expectedSourceRevision','spec']);
    ref(input.subscriptionRef);
    ref(input.sourceRef);
    integer(input.expectedRevision);
    integer(input.expectedSourceRevision,1);
    const s=input.spec;
    exact(s,['enabled','triggerRef','route','targetTaskRef','goalNamespaceRef'],['enabled','triggerRef','route']);
    if(typeof s.enabled!=='boolean'||!['new_task','supplement'].includes(s.route))fail('INVALID_INPUT');
    ref(s.triggerRef);
    if(s.route==='supplement')ref(s.targetTaskRef);
    else if(s.targetTaskRef!==undefined)fail('INVALID_INPUT');
    if(s.goalNamespaceRef!==undefined)ref(s.goalNamespaceRef);
    return this.#mut(handle,input,['owner'],'configureSubscription',c=>{
      const source=this.#auto(c,'source',input.sourceRef);
      if(!source||source.revision!==input.expectedSourceRevision)fail('STALE_SOURCE');
      const old=this.#auto(c,'subscription',input.subscriptionRef);
      if((old?.revision||0)!==input.expectedRevision)fail('STALE_SUBSCRIPTION');
      if(old&&old.sourceRef!==input.sourceRef)fail('ROUTE_MISMATCH');
      if(!old&&this.#autoCount(c,'subscription')>=128)fail('EVENT_LIMIT');
      return this.#saveAuto(c,'subscription',input.subscriptionRef,null,{
        subscriptionRef:input.subscriptionRef,sourceRef:input.sourceRef,revision:input.expectedRevision+1,spec:JSON.parse(canonical(s))
      });
    });
  }
  source(handle,input){
    exact(input,['sourceRef']);
    return this.#auto(this.#ctx(handle,undefined,['owner','coordinator','host']),'source',input.sourceRef);
  }
  subscription(handle,input){
    exact(input,['subscriptionRef']);
    return this.#auto(this.#ctx(handle,undefined,['owner','coordinator','host']),'subscription',input.subscriptionRef);
  }
  listSources(handle){
    const c=this.#ctx(handle,undefined,['owner','coordinator','host']);
    return this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='source'",c.ownerRef,c.workspaceRef).map(r=>this.#auto(c,'source',r.id));
  }
  listSubscriptions(handle){
    const c=this.#ctx(handle,undefined,['owner','coordinator','host']);
    return this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='subscription'",c.ownerRef,c.workspaceRef).map(r=>this.#auto(c,'subscription',r.id));
  }
  #eventBinding(c,input){
    const source=this.#auto(c,'source',ref(input.sourceRef)),subscription=this.#auto(c,'subscription',ref(input.subscriptionRef));
    if(!source||source.revision!==integer(input.expectedSourceRevision,1))fail('STALE_SOURCE');
    if(!subscription||subscription.revision!==integer(input.expectedSubscriptionRevision,1))fail('STALE_SUBSCRIPTION');
    if(subscription.sourceRef!==source.sourceRef)fail('ROUTE_MISMATCH');
    if(!source.spec.enabled)fail('SOURCE_DISABLED');
    if(!subscription.spec.enabled)fail('SUBSCRIPTION_DISABLED');
    return{
      source,subscription
    };
  }
  #routeAssociation(c,source,subscription,task){
    if(source.spec.kind!=='chat'||source.spec.routeBinding.conversationKind!=='private')fail('ROUTE_MISMATCH');
    const digest=canonicalDigest(source.spec.routeBinding);
    const rows=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='event'",...this.#keys(c,task));
    if(!rows.some(r=>{
      const event=this.#auto(c,'event',r.id);
      return event.sourceRef===source.sourceRef&&event.subscriptionRef===subscription.subscriptionRef&&event.routeBindingDigest===digest;
    }))fail('ROUTE_MISMATCH');
  }
  ingestEvent(handle,input){
    exact(input,['commandRef','sourceRef','subscriptionRef','expectedSourceRevision','expectedSubscriptionRevision','eventRef','eventDigest','observedAt','receivedAt','taskId','providerRef','sourceIdentityRef','routeBinding','targetTaskRef','expectedTaskVersion','expectedAuthEpoch','goal','clockRef','expectedCursor','scheduledAt','verificationPlanDigest'],['commandRef','sourceRef','subscriptionRef','expectedSourceRevision','expectedSubscriptionRevision','eventRef','eventDigest','observedAt','receivedAt','providerRef','sourceIdentityRef']);
    for(const k of ['eventRef','eventDigest','providerRef','sourceIdentityRef'])ref(input[k]);
    integer(input.observedAt,0,8640000000000000);
    integer(input.receivedAt,0,8640000000000000);
    return this.#mut(handle,input,HOST,'ingestEvent',c=>{
      const{
        source,subscription
      }=this.#eventBinding(c,input),now=this.#now(),id=canonicalDigest({
        providerRef:input.providerRef,sourceIdentityRef:input.sourceIdentityRef,eventRef:input.eventRef
      });
      if(source.spec.kind==='chat'){
        if(canonical(this.#route(input.routeBinding))!==canonical(source.spec.routeBinding))fail('ROUTE_MISMATCH');
      }else if(input.routeBinding!==undefined)fail('INVALID_INPUT');
      const old=this.#auto(c,'event',id);
      if(!old&&this.#ledger.one('SELECT 1 FROM ingress WHERE owner=? AND workspace=? AND provider=? AND source=? AND event=?',c.ownerRef,c.workspaceRef,input.providerRef,input.sourceIdentityRef,input.eventRef))fail('STORAGE_INVALID');
      if(old){
        if(old.eventDigest!==input.eventDigest)fail('IDEMPOTENCY_CONFLICT');
        if(source.spec.kind==='chat'&&old.routeBindingDigest!==canonicalDigest(source.spec.routeBinding))fail('ROUTE_MISMATCH');
        return{
          ...old,deduplicated:true,task:taskRecord(this.#task(c,old.taskRef))
        };
      }       if(input.observedAt>input.receivedAt||input.receivedAt>now)fail('EVENT_CLOCK_INVALID');
      if(now-input.observedAt>source.spec.maxEventAgeMs)fail('EVENT_EXPIRED');
      if(this.#autoCount(c,'event')>=4096)fail('EVENT_LIMIT');
      const start=source.rateWindowStart===null||now-source.rateWindowStart>=source.spec.rate.windowMs?now:source.rateWindowStart,count=start===source.rateWindowStart?source.rateCount:0;
      if(now<start)fail('EVENT_CLOCK_INVALID');
      if(count>=source.spec.rate.maxEvents)fail('RATE_LIMIT');
      let t;
      if(subscription.spec.route==='supplement'){
        if(input.targetTaskRef!==subscription.spec.targetTaskRef)fail('ROUTE_MISMATCH');
        t=this.#cas(c,{
          ...input,taskRef:input.targetTaskRef
        });
        if(source.spec.kind==='chat')this.#routeAssociation(c,source,subscription,t.id);
        this.#bumpSemantic(c,t.id);
        t=this.#update(t,t.status,'progress');
      }else{
        const taskId=reference(input.taskId);
        if(this.#ledger.one('SELECT 1 FROM tasks WHERE owner=? AND workspace=? AND id=?',...this.#keys(c,taskId)))fail('TASK_EXISTS');
        if(this.#ledger.one('SELECT count(*) AS n FROM tasks').n>=this.#limits.maxTasks)fail('TASK_LIMIT');
        if(this.#ledger.one("SELECT count(*) AS n FROM tasks WHERE status='queued'").n>=this.#getPolicy(c).limits.queueCapacity)fail('QUEUE_FULL');
        this.#ledger.run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)',...this.#keys(c,taskId),'queued',1,0,now,now);
        t=this.#task(c,taskId);
        this.#event(t,'intake');
      }       this.#ledger.run('INSERT INTO ingress VALUES(?,?,?,?,?,?,?)',c.ownerRef,c.workspaceRef,input.providerRef,input.sourceIdentityRef,input.eventRef,t.id,now);
      this.#managed(t);
      let supplement,goalData;
      if(input.goal!==undefined&&subscription.spec.route==='new_task')goalData=this.#data(c,t,{
        kind:'goal',content:input.goal,sourceRef:source.sourceRef,commandRef:input.commandRef
      });
      if(input.goal!==undefined&&subscription.spec.route==='supplement'){
        const content=JSON.stringify({
          contractVersion:'df.supplement/v1',materialKind:'current_instruction',content:input.goal,sourceRef:source.sourceRef,subscriptionRef:subscription.subscriptionRef,eventRef:input.eventRef,eventDigest:input.eventDigest,observedAt:input.observedAt,taskRef:t.id
        });
        supplement=this.#data(c,t,{
          kind:'context',content,sourceRef:source.sourceRef,commandRef:input.commandRef,expectedTaskVersion:input.expectedTaskVersion,expectedAuthEpoch:input.expectedAuthEpoch
        });
      }       if(input.clockRef!==undefined){
        integer(input.scheduledAt,0,8640000000000000);
        this.#advanceClock(c,{
          ...input,through:input.scheduledAt,decision:'ingested',planDigest:input.eventDigest
        },source,subscription);
      }       this.#saveAuto(c,'source',source.sourceRef,null,{
        ...source,rateWindowStart:start,rateCount:count+1
      });
      const receipt={
        sourceRef:source.sourceRef,subscriptionRef:subscription.subscriptionRef,eventRef:input.eventRef,eventDigest:input.eventDigest,providerRef:input.providerRef,sourceIdentityRef:input.sourceIdentityRef,taskRef:t.id,receivedAt:input.receivedAt,observedAt:input.observedAt,state:'processed',identityMode:source.spec.identityMode,routeBindingDigest:source.spec.routeBinding?canonicalDigest(source.spec.routeBinding):null,...(goalData?{goalRecordRef:goalData.recordRef,goalDigest:goalData.digest}:{}),...(supplement?{
          supplementRecordRef:supplement.recordRef,supplementDigest:supplement.digest
        }:{
        })
      };
      this.#saveAuto(c,'event',id,t.id,receipt);
      return{
        ...receipt,deduplicated:false,task:taskRecord(t)
      };
    });
  }
  #eventReceipt(c,event){
    const task=this.#task(c,event.taskRef),actions=this.#ledger.query('SELECT state FROM actions WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,event.taskRef)),held=this.#held(c,event.taskRef);
    const state=task.status==='recovery_required'||actions.some(a=>a.state==='unknown')?'unknown':TERMINAL.has(task.status)&&!held?'completed':held||actions.some(a=>a.state==='dispatch_intent')?'processing':'registered';
    return {
      ...event,registrationState:event.state,state,task:taskRecord(task),reservationsHeld:held
    };
  }
  listEventReceipts(handle,input){
    exact(input,['sourceRef','subscriptionRef']);
    const c=this.#ctx(handle,undefined,HOST);
    ref(input.sourceRef);
    ref(input.subscriptionRef);
    return this.#ledger.transaction(()=>this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='event'",c.ownerRef,c.workspaceRef).map(r=>this.#auto(c,'event',r.id)).filter(r=>r.sourceRef===input.sourceRef&&r.subscriptionRef===input.subscriptionRef).map(r=>this.#eventReceipt(c,r)));
  }
  eventReceipt(handle,input){
    exact(input,['sourceRef','subscriptionRef','eventRef']);
    ref(input.eventRef);
    const matches=this.listEventReceipts(handle,{
      sourceRef:input.sourceRef,subscriptionRef:input.subscriptionRef
    }).filter(r=>r.eventRef===input.eventRef);
    if(matches.length>1)fail('ROUTE_MISMATCH');
    return matches[0]||null;
  }
  eventClock(handle,input){
    exact(input,['sourceRef','subscriptionRef','clockRef']);
    const c=this.#ctx(handle,undefined,HOST),clock=this.#auto(c,'clock',input.clockRef);
    if(clock&&(clock.sourceRef!==input.sourceRef||clock.subscriptionRef!==input.subscriptionRef))fail('ROUTE_MISMATCH');
    return clock;
  }
  #advanceClock(c,input,source,subscription){
    ref(input.clockRef);
    ref(input.planDigest);
    integer(input.through,0,8640000000000000);
    if(input.through>this.#now())fail('EVENT_CLOCK_INVALID');
    const old=this.#auto(c,'clock',input.clockRef);
    if((old?.cursor??null)!==input.expectedCursor)fail('STALE_EVENT_CLOCK');
    if(old&&(old.sourceRef!==source.sourceRef||old.subscriptionRef!==subscription.subscriptionRef))fail('ROUTE_MISMATCH');
    if(old&&input.through<=old.cursor)fail('STALE_EVENT_CLOCK');
    if(old?.pendingVerification&&(input.decision!=='ingested'||!old.pendingVerification.approved||input.verificationPlanDigest!==old.pendingVerification.planDigest||input.through>old.pendingVerification.through))fail('VERIFICATION_REQUIRED');
    if(!old&&this.#autoCount(c,'clock')>=128)fail('EVENT_LIMIT');
    return this.#saveAuto(c,'clock',input.clockRef,null,{
      sourceRef:source.sourceRef,subscriptionRef:subscription.subscriptionRef,clockRef:input.clockRef,cursor:input.decision==='verification_required'?(old?.cursor??null):input.through,decision:input.decision,planDigest:input.planDigest,sourceRevision:source.revision,subscriptionRevision:subscription.revision,pendingVerification:input.decision==='verification_required'?{
        through:input.through,planDigest:input.planDigest,approved:false
      }:null,...(old?.pendingVerification?{
        resolvedVerification:old.pendingVerification
      }:{
      })
    });
  }
  advanceEventClock(handle,input){
    exact(input,['commandRef','sourceRef','subscriptionRef','expectedSourceRevision','expectedSubscriptionRevision','clockRef','expectedCursor','through','decision','planDigest']);
    if(!['skipped','verification_required'].includes(input.decision))fail('INVALID_INPUT');
    return this.#mut(handle,input,HOST,'advanceEventClock',c=>{
      const{
        source,subscription
      }=this.#eventBinding(c,input);
      return this.#advanceClock(c,input,source,subscription);
    });
  }
  approveEventClock(handle,input){
    exact(input,['commandRef','sourceRef','subscriptionRef','expectedSourceRevision','expectedSubscriptionRevision','clockRef','expectedCursor','planDigest']);
    return this.#mut(handle,input,['owner'],'approveEventClock',c=>{
      this.#eventBinding(c,input);
      const old=this.#auto(c,'clock',input.clockRef);
      if(!old||old.sourceRef!==input.sourceRef||old.subscriptionRef!==input.subscriptionRef||old.cursor!==input.expectedCursor)fail('STALE_EVENT_CLOCK');
      if(!old.pendingVerification||old.pendingVerification.planDigest!==ref(input.planDigest))fail('VERIFICATION_REQUIRED');
      return this.#saveAuto(c,'clock',input.clockRef,null,{
        ...old,pendingVerification:{
          ...old.pendingVerification,approved:true,approvedAt:this.#now(),approverRef:c.principalRef
        }
      });
    });
  }
  chatTask(handle,input){
    exact(input,['sourceRef','subscriptionRef','expectedSourceRevision','expectedSubscriptionRevision','taskRef']);
    const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      const{
        source,subscription
      }=this.#eventBinding(c,input);
      this.#routeAssociation(c,source,subscription,input.taskRef);
      return this.#snapshot(c,input.taskRef,handle);
    });
  }
  chatControl(handle,input){
    exact(input,['sourceRef','subscriptionRef','expectedSourceRevision','expectedSubscriptionRevision','taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','kind']);
    if(!['pause','resume','cancel'].includes(input.kind))fail('INVALID_INPUT');
    return this.#mut(handle,input,HOST,'chatControl',c=>{
      const{
        source,subscription
      }=this.#eventBinding(c,input);
      this.#routeAssociation(c,source,subscription,input.taskRef);
      return this.#control(c,input);
    },input.kind==='cancel');
  }
  #requireAuditBounds(){
    if(!this.#auditBounds)fail('AUDIT_EXECUTION_UNAVAILABLE');
    return this.#auditBounds;
  }
  #auditData(c,task,recordRef){
    const row=this.#ledger.one('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND id=?',...this.#keys(c,task),ref(recordRef));
    if(!row)fail('RECORD_NOT_FOUND');
    return this.#openData(c,row);
  }
  #auditContext(c,task,recordRef,current=true){
    const data=this.#auditData(c,task,recordRef),m=data.metadata;
    if(m.kind!=='context'||m.sourceTaskVersion===undefined||m.sourceAuthEpoch===undefined||m.semanticRevision===undefined)fail('AUDIT_BINDING_MISMATCH');
    try{
      const body=validateExecutionContext(parse(data.content),{
        scope:{ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:task},
        maxTaskVersion:m.sourceTaskVersion,maxAuthEpoch:m.sourceAuthEpoch,maxGeneratedAt:m.createdAt,
        knownSecrets:this.#secrets
      });
      if(body.sourceTaskVersion!==m.sourceTaskVersion||body.sourceAuthEpoch!==m.sourceAuthEpoch)fail('AUDIT_BINDING_MISMATCH');
    }catch{fail('AUDIT_BINDING_MISMATCH');}
    if(current){
      if(m.semanticRevision!==this.#semantic(c,task))fail('AUDIT_STALE');
      if(m.memoryNamespaceRef)this.#memoryGuard(c,{namespaceRef:m.memoryNamespaceRef,revision:m.memoryRevision});
    }
    return data;
  }
  #auditInput(c,recordRef){
    const value=this.#auto(c,'audit_input',ref(recordRef));
    if(!value)fail('AUDIT_INPUT_REQUIRED');
    try{
      exact(value,['contractVersion','ownerRef','workspaceRef','taskRef','auditRef','auditRevision','round','purpose','recordRef','digest','byteLength','bindingDigest','materialDigest','artifactRef','artifactVersion','artifactDigest','semanticRevision','sourceTaskVersion','sourceAuthEpoch','contextRecordRef','contextDigest','previousReportRef','material','inputByteLimit','resultByteLimit','createdAt']);
      if(value.contractVersion!=='df.audit-input-association/v1'||value.ownerRef!==c.ownerRef||value.workspaceRef!==c.workspaceRef||value.recordRef!==recordRef||!['audit_review','audit_repair'].includes(value.purpose))fail('STORAGE_INVALID');
      for(const key of ['taskRef','auditRef','recordRef','digest','bindingDigest','materialDigest','artifactRef','artifactDigest','contextRecordRef','contextDigest'])ref(value[key]);
      for(const key of ['auditRevision','artifactVersion','semanticRevision','sourceTaskVersion'])integer(value[key],1);
      integer(value.round,0,8);integer(value.sourceAuthEpoch);integer(value.createdAt);
      integer(value.inputByteLimit,1,65536);integer(value.resultByteLimit,1,65536);
      integer(value.byteLength,1,Math.min(value.inputByteLimit,this.#limits.maxDataBytes));
      if(value.purpose==='audit_repair')ref(value.previousReportRef);else if(value.previousReportRef!==null)fail('STORAGE_INVALID');
      canonical(value.material);
      if(!Array.isArray(value.material)||value.material.length<2||value.material.length>16||new Set(value.material.map(item=>item.recordRef)).size!==value.material.length)fail('STORAGE_INVALID');
      for(const item of value.material){exact(item,['recordRef','digest']);ref(item.recordRef);ref(item.digest);}
      if(canonical(value.material)!==canonical([...value.material].sort((a,b)=>a.recordRef.localeCompare(b.recordRef)))||canonicalDigest(value.material)!==value.materialDigest)fail('STORAGE_INVALID');
      const data=this.#auditData(c,value.taskRef,recordRef),m=data.metadata,body=parse(data.content);
      exact(body,['contractVersion','purpose','ownerRef','workspaceRef','taskRef','auditRef','auditRevision','round','semanticRevision','artifact','bindingDigest','materialDigest','policy','material','contextRecordRef','contextDigest','previousReport','responseContract']);
      exact(body.artifact,['artifactRef','version','recordRef','digest']);
      exact(body.policy,['policyRef','blockingSeverities','maxRepairRounds']);
      ref(body.policy.policyRef);integer(body.policy.maxRepairRounds,0,8);canonical(body.policy.blockingSeverities);
      if(!Array.isArray(body.policy.blockingSeverities)||body.policy.blockingSeverities.length>4||new Set(body.policy.blockingSeverities).size!==body.policy.blockingSeverities.length||body.policy.blockingSeverities.some(severity=>!['fatal','blocking','warning','info'].includes(severity)))fail('STORAGE_INVALID');
      if(body.contractVersion!=='df.audit-input/v1'||body.responseContract!=='df.audit-response/v1'||m.kind!=='context'||m.auditInputRef!==value.recordRef||m.digest!==value.digest||m.byteLength!==value.byteLength||m.semanticRevision!==value.semanticRevision||m.sourceTaskVersion!==value.sourceTaskVersion||m.sourceAuthEpoch!==value.sourceAuthEpoch||m.taskVersion!==value.sourceTaskVersion||m.authEpoch!==value.sourceAuthEpoch||m.generationRef!==null||m.createdAt!==value.createdAt||m.sourceRef!==value.auditRef)fail('STORAGE_INVALID');
      for(const key of ['purpose','ownerRef','workspaceRef','taskRef','auditRef','auditRevision','round','semanticRevision','bindingDigest','materialDigest','contextRecordRef','contextDigest'])if(body[key]!==value[key])fail('STORAGE_INVALID');
      if(body.artifact.artifactRef!==value.artifactRef||body.artifact.version!==value.artifactVersion||body.artifact.digest!==value.artifactDigest)fail('STORAGE_INVALID');
      if(!Array.isArray(body.material)||body.material.length!==value.material.length)fail('STORAGE_INVALID');
      for(let index=0;index<body.material.length;index++){
        const item=body.material[index],expected=value.material[index];
        exact(item,['recordRef','digest','kind','content']);
        if(item.recordRef!==expected.recordRef||item.digest!==expected.digest||!DATA_KINDS.includes(item.kind)||typeof item.content!=='string'||!item.content.isWellFormed()||hash(item.content)!==item.digest)fail('STORAGE_INVALID');
        const original=this.#auditData(c,value.taskRef,item.recordRef);
        if(original.metadata.digest!==item.digest||original.metadata.kind!==item.kind||original.content!==item.content)fail('STORAGE_INVALID');
      }
      if(value.previousReportRef===null?body.previousReport!==null:body.previousReport?.reportRef!==value.previousReportRef)fail('STORAGE_INVALID');
      const historicalBinding={ownerRef:value.ownerRef,workspaceRef:value.workspaceRef,taskRef:value.taskRef,auditRef:value.auditRef,auditRevision:value.auditRevision,artifactRef:value.artifactRef,artifactVersion:value.artifactVersion,digest:value.artifactDigest,material:value.material,policyRef:body.policy.policyRef,blockingSeverities:body.policy.blockingSeverities,maxRepairRounds:body.policy.maxRepairRounds,round:value.purpose==='audit_repair'?value.round-1:value.round,semanticRevision:value.semanticRevision};
      if(canonicalDigest(historicalBinding)!==value.bindingDigest)fail('STORAGE_INVALID');
      if(value.previousReportRef&&canonical(body.previousReport)!==canonical(this.#auto(c,'report',value.previousReportRef)))fail('STORAGE_INVALID');
      if(!this.#auto(c,'audit',value.auditRef)||!value.material.some(item=>item.recordRef===value.contextRecordRef&&item.digest===value.contextDigest)||!value.material.some(item=>item.recordRef===body.artifact.recordRef&&item.digest===value.artifactDigest))fail('STORAGE_INVALID');
      this.#auditContext(c,value.taskRef,value.contextRecordRef,false);
      return value;
    }catch{fail('STORAGE_INVALID');}
  }
  #auditSpec(c,task,spec,current){
    if(!spec.executionInput)fail('AUDIT_INPUT_REQUIRED');
    const input=this.#auditInput(c,spec.executionInput.recordRef),binding=spec.executionInput;
    if(input.taskRef!==task||input.digest!==binding.digest||input.purpose!==binding.purpose||input.auditRef!==binding.auditRef||input.bindingDigest!==binding.bindingDigest||input.materialDigest!==binding.materialDigest||spec.targetDigest!==input.bindingDigest||spec.dataDigest!==input.artifactDigest||(binding.previousReportRef??null)!==input.previousReportRef)fail('AUDIT_BINDING_MISMATCH');
    if(current){
      const req=this.#auto(c,'audit',input.auditRef);
      if(!req||req.taskRef!==task||req.auditRevision!==input.auditRevision||(input.purpose==='audit_repair'?req.round+1:req.round)!==input.round||req.bindingDigest!==input.bindingDigest||req.materialDigest!==input.materialDigest||req.semanticRevision!==input.semanticRevision)fail('AUDIT_STALE');
      this.#auditCurrent(c,req);
      this.#auditContext(c,task,input.contextRecordRef);
      if(input.purpose==='audit_review'&&req.reportRef)fail('AUDIT_REPORT_CONFLICT');
      if(input.purpose==='audit_repair'&&req.reportRef!==input.previousReportRef)fail('AUDIT_BINDING_MISMATCH');
      const bounds=this.#requireAuditBounds();
      if(input.byteLength>bounds.inputByteLimit||input.byteLength>this.#limits.maxDataBytes)fail('INPUT_TOO_LARGE');
    }
    return input;
  }
  prepareAuditInput(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','auditRef','expectedAuditRevision','purpose','round','previousReportRef'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','auditRef','expectedAuditRevision','purpose','round']);
    const bounds=this.#requireAuditBounds();
    ref(input.auditRef);integer(input.expectedAuditRevision,1);integer(input.round,0,8);
    if(!['audit_review','audit_repair'].includes(input.purpose))fail('INVALID_INPUT');
    if(input.purpose==='audit_repair')ref(input.previousReportRef);else if(input.previousReportRef!==undefined)fail('INVALID_INPUT');
    return this.#mut(handle,input,OWNER,'prepareAuditInput',c=>{
      const t=this.#cas(c,input),req=this.#auto(c,'audit',input.auditRef);
      if(!req||req.taskRef!==t.id||req.auditRevision!==input.expectedAuditRevision)fail('AUDIT_BINDING_MISMATCH');
      if(this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active'||['cancel_requested','recovery_required'].includes(t.status))fail('TASK_BLOCKED');
      if(!req.contextRecordRef||!req.contextDigest)fail('AUDIT_CONTEXT_REQUIRED');
      if(input.purpose==='audit_review'?(input.round!==req.round||!!req.reportRef):(input.round!==req.round+1||input.round>req.maxRepairRounds||req.reportRef!==input.previousReportRef||req.state==='passed'||!!req.pendingRepair))fail('AUDIT_REPAIR_LIMIT');
      const artifact=this.#auditCurrent(c,req),protectedContext=this.#auditContext(c,t.id,req.contextRecordRef);
      if(protectedContext.metadata.digest!==req.contextDigest)fail('AUDIT_BINDING_MISMATCH');
      const material=req.material.map(item=>{
        const data=this.#auditData(c,t.id,item.recordRef);
        if(data.metadata.digest!==item.digest||this.#secrets.some(secret=>data.content.includes(secret)))fail('SECRET_REJECTED');
        return{...item,kind:data.metadata.kind,content:data.content};
      });
      const previousReport=input.purpose==='audit_repair'?this.#auto(c,'report',input.previousReportRef):null;
      if(input.purpose==='audit_repair'&&!previousReport)fail('AUDIT_BINDING_MISMATCH');
      const body={
        contractVersion:'df.audit-input/v1',purpose:input.purpose,ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,auditRef:req.auditRef,auditRevision:req.auditRevision,round:input.round,semanticRevision:req.semanticRevision,
        artifact:{artifactRef:artifact.artifactRef,version:artifact.version,recordRef:artifact.recordRef,digest:artifact.digest},bindingDigest:req.bindingDigest,materialDigest:req.materialDigest,
        policy:{policyRef:req.policyRef,blockingSeverities:[...req.blockingSeverities],maxRepairRounds:req.maxRepairRounds},material,contextRecordRef:req.contextRecordRef,contextDigest:req.contextDigest,previousReport,responseContract:'df.audit-response/v1'
      };
      const content=this.#check(body,Math.min(bounds.inputByteLimit,this.#limits.maxDataBytes));
      const data=this.#data(c,t,{kind:'context',content,sourceRef:req.auditRef,commandRef:input.commandRef,expectedTaskVersion:t.version,expectedAuthEpoch:t.auth_epoch,auditInput:true});
      const association={
        contractVersion:'df.audit-input-association/v1',ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,auditRef:req.auditRef,auditRevision:req.auditRevision,round:input.round,purpose:input.purpose,
        recordRef:data.recordRef,digest:data.digest,byteLength:data.byteLength,bindingDigest:req.bindingDigest,materialDigest:req.materialDigest,artifactRef:req.artifactRef,artifactVersion:req.artifactVersion,artifactDigest:req.digest,semanticRevision:req.semanticRevision,
        sourceTaskVersion:t.version,sourceAuthEpoch:t.auth_epoch,contextRecordRef:req.contextRecordRef,contextDigest:req.contextDigest,previousReportRef:input.previousReportRef??null,material:req.material,inputByteLimit:bounds.inputByteLimit,resultByteLimit:bounds.resultByteLimit,createdAt:data.createdAt
      };
      this.#saveAuto(c,'audit_input',data.recordRef,t.id,association);
      return{recordRef:data.recordRef,digest:data.digest,byteLength:data.byteLength,auditRef:req.auditRef,auditRevision:req.auditRevision,round:input.round,bindingDigest:req.bindingDigest,materialDigest:req.materialDigest,purpose:input.purpose,task:taskRecord(t),deduplicated:false};
    });
  }
  bindAuditReviewer(host,handle,input){
    exact(input,['taskRef','auditRef','claimRef','generationRef','sessionRef']);
    if(!handle||typeof handle!=='object'||types.isProxy(handle)||this.#principals.has(handle))fail('INVALID_CONFIG');
    const c=this.#ctx(host,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      const claimed=this.#claim(c,input);
      const {a,w,t}=this.#executionAdmission(c,{...input,actionDigest:claimed.a.digest}),association=this.#auditSpec(c,t.id,a.spec,true);
      if(association.purpose!=='audit_review'||association.auditRef!==ref(input.auditRef)||w.generationRef!==ref(input.generationRef)||w.sessionRef!==ref(input.sessionRef)||!['created','ready','running'].includes(w.phase)||w.terminalEvidenceRef)fail('UNAUTHORIZED');
      const artifact=this.#artifact(c,t.id,association.artifactRef);
      if(artifact.generationRef===w.generationRef)fail('REVIEW_NOT_INDEPENDENT');
      if(artifact.producerClaimRef){
        const producer=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,t.id),artifact.producerClaimRef);
        if(producer&&parse(producer.payload).sessionRef===w.sessionRef)fail('REVIEW_NOT_INDEPENDENT');
      }
      for(const [id,binding] of this.#auditBindings){
        const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(binding,binding.taskRef),id);
        if(!worker||parse(worker.payload).terminalEvidenceRef||!this.#ledger.one('SELECT 1 FROM reservations WHERE claim_id=?',binding.claimId))this.#auditBindings.delete(id);
      }
      if(this.#auditBindings.has(w.claimRef)||this.#auditBindings.size>=32)fail('REVIEWER_LIMIT');
      const binding={role:'reviewer',ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,generationRef:w.generationRef,sessionRef:w.sessionRef,readRecordRefs:[...association.material.map(item=>item.recordRef),association.recordRef],auditRef:association.auditRef,auditClaimRef:w.claimRef,auditInputRecordRef:association.recordRef,auditAuthEpoch:t.auth_epoch};
      binding.principalRef=canonicalDigest(binding);
      if(artifact.producerRef===binding.principalRef)fail('REVIEW_NOT_INDEPENDENT');
      this.#principals.set(handle,Object.freeze(binding));
      this.#auditBindings.set(w.claimRef,Object.freeze({...binding,claimId:a.claim_id}));
      return{taskRef:t.id,auditRef:association.auditRef,claimRef:w.claimRef,generationRef:w.generationRef,sessionRef:w.sessionRef};
    });
  }
  #executionAdmission(c,input){
    const{
      a,w,t
    }=this.#claim(c,input);
    if(a.digest!==ref(input.actionDigest)||a.claim_epoch!==t.auth_epoch||!['running','waiting','blocked'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active')fail('CLAIM_REVOKED');
    const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action),policy=this.#getPolicy(c);
    if(!grant||grant.revoked||grant.auth_epoch!==t.auth_epoch||this.#now()>=grant.expires_at)fail('APPROVAL_INVALID');
    if(policy.version!==a.spec.resourcePolicyVersion||!policy.modelPolicy||policy.modelPolicy.version!==a.spec.modelPolicyVersion)fail('STALE_POLICY');
    const active=this.#ledger.one('SELECT coalesce(sum(units),0) AS n FROM reservations').n;
    if(active>policy.limits.maxActive)fail('ACTIVE_FULL');
    if(a.spec.executor.mode==='none'||['unknown','cancel_requested','stopped','not_created'].includes(w.phase))fail('WORKER_NOT_READY');
    let allowed=false;
    try{
      allowed=this.#permission(Object.freeze({
        ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,actionRef:a.action,actionDigest:a.digest,taskVersion:t.version,authEpoch:t.auth_epoch,spec:JSON.parse(canonical(a.spec))
      }))===true;
    }catch{
      fail('HOST_DENIED');
    }if(!allowed)fail('HOST_DENIED');
    return{
      a,w,t
    };
  }
  #executionContext(c,input,a){
    if(a.spec.executionInput)fail('AUDIT_INPUT_REQUIRED');
    const row=this.#ledger.one('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND id=?',...this.#keys(c,input.taskRef),ref(input.contextRecordRef));
    if(!row)fail('RECORD_NOT_FOUND');
    const m=this.#openData(c,row).metadata;
    if(m.auditInputRef)fail('AUDIT_INPUT_REQUIRED');
    if(m.kind!=='context'||m.digest!==a.spec.dataDigest||m.semanticRevision!==this.#semantic(c,input.taskRef)||m.sourceTaskVersion>a.metadata.plannedTaskVersion||m.sourceAuthEpoch>a.metadata.plannedAuthEpoch||m.generationRef!==null&&m.generationRef!==input.generationRef)fail('SPEC_MISMATCH');
    if(m.memoryNamespaceRef)this.#memoryGuard(c,{
      namespaceRef:m.memoryNamespaceRef,revision:m.memoryRevision
    });
    return m;
  }
  beginContextExecution(handle,input){
    exact(input,['taskRef','actionRef','actionDigest','claimRef','generationRef','contextRecordRef','commandRef','expectedTaskVersion','expectedAuthEpoch']);
    return this.#mut(handle,input,HOST,'beginContextExecution',c=>{
      const existing=this.#auto(c,'execution',ref(input.claimRef));
      if(existing){
        if(existing.actionRef!==input.actionRef||existing.actionDigest!==input.actionDigest||existing.contextRecordRef!==input.contextRecordRef||existing.taskRef!==input.taskRef||existing.generationRef!==input.generationRef)fail('IDEMPOTENCY_CONFLICT');
        return {
          ...existing,deduplicated:true
        };
      }       this.#cas(c,input);
      const{
        a
      }=this.#executionAdmission(c,input);
      if(a.metadata.executionRef)fail('STORAGE_INVALID');
      if(a.action!==input.actionRef)fail('SPEC_MISMATCH');
      const m=this.#executionContext(c,input,a);
      const record={
        executionRef:canonicalDigest({
          claimRef:input.claimRef,commandRef:input.commandRef,contextRecordRef:input.contextRecordRef
        }),taskRef:input.taskRef,actionRef:a.action,actionDigest:a.digest,claimRef:input.claimRef,generationRef:input.generationRef,contextRecordRef:input.contextRecordRef,dataDigest:m.digest,semanticRevision:m.semanticRevision,commandRef:input.commandRef,state:'intent_committed',createdAt:this.#now()
      };
      this.#saveAuto(c,'execution',input.claimRef,input.taskRef,record);
      this.#saveAction(c,input.taskRef,a.action,{
        ...a.metadata,executionRef:record.executionRef
      });
      return{
        ...record,deduplicated:false
      };
    },'terminal');
  }
  #executionMaterial(c,record,a,current=true){
    if(record.actionRef!==a.action||record.actionDigest!==a.digest||a.metadata.executionRef!==record.executionRef||a.metadata.claimRef!==record.claimRef||a.metadata.generationRef!==record.generationRef)fail('SPEC_MISMATCH');
    if(record.kind!==undefined){
      if(record.kind!=='audit_input'||!a.spec.executionInput)fail('SPEC_MISMATCH');
      const material=this.#auditSpec(c,record.taskRef,a.spec,current);
      for(const [key,value] of Object.entries({inputRecordRef:material.recordRef,inputDigest:material.digest,dataDigest:material.artifactDigest,auditRef:material.auditRef,bindingDigest:material.bindingDigest,materialDigest:material.materialDigest,purpose:material.purpose,semanticRevision:material.semanticRevision,sessionRef:a.spec.executor.sessionRef}))if(record[key]!==value)fail('SPEC_MISMATCH');
      if(material.purpose==='audit_repair'){
        const repair=this.#auto(c,'repair',record.claimRef);
        if(!repair||repair.auditRef!==material.auditRef||repair.round!==material.round||repair.previousReportRef!==material.previousReportRef||repair.generationRef!==record.generationRef||repair.bindingDigest!==material.bindingDigest)fail('AUDIT_BINDING_MISMATCH');
      }
      return material;
    }
    const context=this.#executionContext(c,{taskRef:record.taskRef,generationRef:record.generationRef,contextRecordRef:record.contextRecordRef},a);
    if(context.digest!==record.dataDigest||context.semanticRevision!==record.semanticRevision)fail('SPEC_MISMATCH');
    return context;
  }
  beginAuditExecution(handle,input){
    exact(input,['taskRef','actionRef','actionDigest','claimRef','generationRef','inputRecordRef','commandRef','expectedTaskVersion','expectedAuthEpoch']);
    for(const key of ['taskRef','actionRef','actionDigest','claimRef','generationRef','inputRecordRef','commandRef'])ref(input[key]);
    return this.#mut(handle,input,HOST,'beginAuditExecution',c=>{
      const existing=this.#auto(c,'execution',input.claimRef);
      if(existing){
        if(existing.kind!=='audit_input'||existing.actionRef!==input.actionRef||existing.actionDigest!==input.actionDigest||existing.inputRecordRef!==input.inputRecordRef||existing.taskRef!==input.taskRef||existing.generationRef!==input.generationRef)fail('IDEMPOTENCY_CONFLICT');
        return{...existing,deduplicated:true};
      }
      this.#cas(c,input);
      const {a,w}=this.#executionAdmission(c,input),material=this.#auditSpec(c,input.taskRef,a.spec,true);
      if(a.metadata.executionRef||a.action!==input.actionRef||material.recordRef!==input.inputRecordRef||w.sessionRef!==a.spec.executor.sessionRef||!['created','ready','running'].includes(w.phase))fail('SPEC_MISMATCH');
      const record={
        kind:'audit_input',executionRef:canonicalDigest({claimRef:input.claimRef,commandRef:input.commandRef,inputRecordRef:input.inputRecordRef}),
        taskRef:input.taskRef,actionRef:a.action,actionDigest:a.digest,claimRef:input.claimRef,generationRef:input.generationRef,sessionRef:w.sessionRef,
        inputRecordRef:material.recordRef,inputDigest:material.digest,dataDigest:material.artifactDigest,auditRef:material.auditRef,bindingDigest:material.bindingDigest,materialDigest:material.materialDigest,purpose:material.purpose,semanticRevision:material.semanticRevision,
        commandRef:input.commandRef,state:'intent_committed',createdAt:this.#now()
      };
      this.#saveAuto(c,'execution',input.claimRef,input.taskRef,record);
      this.#saveAction(c,input.taskRef,a.action,{...a.metadata,executionRef:record.executionRef});
      this.#executionMaterial(c,record,this.#action(c,input.taskRef,a.action));
      return{...record,deduplicated:false};
    },'terminal');
  }
  assertExecutionCurrent(handle,input){
    exact(input,['taskRef','claimRef','generationRef','actionDigest','executionRef']);
    const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      const record=this.#auto(c,'execution',ref(input.claimRef));
      if(!record||record.taskRef!==input.taskRef||record.generationRef!==input.generationRef||record.actionDigest!==input.actionDigest||record.executionRef!==input.executionRef)fail('SPEC_MISMATCH');
      if(record.state!=='intent_committed')return{
        ...record,admitted:false
      };
      const{
        a
      }=this.#executionAdmission(c,input);
      this.#executionMaterial(c,record,a);
      const next={
        ...record,state:'dispatch_intent',admittedAt:this.#now()
      };
      this.#saveAuto(c,'execution',input.claimRef,input.taskRef,next);
      this.#cut('before_commit');
      return{
        ...next,admitted:true
      };
    });
  }
  assertNativeRequestCurrent(handle,input){
    exact(input,['taskRef','claimRef','generationRef','actionDigest','executionRef']);
    const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      const record=this.#auto(c,'execution',ref(input.claimRef));
      if(!record||record.taskRef!==input.taskRef||record.claimRef!==input.claimRef||record.generationRef!==input.generationRef||record.actionDigest!==input.actionDigest||record.executionRef!==input.executionRef||record.state!=='dispatch_intent')fail('SPEC_MISMATCH');
      const {a}=this.#executionAdmission(c,input);
      if(a.metadata.executionRef!==record.executionRef||a.action!==record.actionRef)fail('SPEC_MISMATCH');
      this.#executionMaterial(c,record,a);
      // A late native fence reads the already-consumed signed intent. It never
      // consumes again, renews consent, changes a row or mints a stream permit.
      return JSON.parse(canonical(record));
    });
  }
  #auditResult(c,resultRef){
    const value=this.#auto(c,'audit_result',ref(resultRef));
    if(!value)fail('AUDIT_RESULT_REQUIRED');
    try{
      exact(value,['contractVersion','ownerRef','workspaceRef','taskRef','resultRef','recordRef','digest','byteLength','inputDigest','inputRecordRef','executionRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','auditRef','bindingDigest','materialDigest','purpose','inputCursor','cursor','evidenceRef','state','createdAt']);
      if(value.contractVersion!=='df.audit-result-association/v1'||value.ownerRef!==c.ownerRef||value.workspaceRef!==c.workspaceRef||value.resultRef!==resultRef||value.resultRef!==value.executionRef||value.state!=='captured')fail('STORAGE_INVALID');
      for(const key of ['taskRef','resultRef','recordRef','digest','inputDigest','inputRecordRef','executionRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','auditRef','bindingDigest','materialDigest','evidenceRef'])ref(value[key]);
      integer(value.inputCursor);integer(value.cursor,value.inputCursor+1);integer(value.createdAt);
      const execution=this.#auto(c,'execution',value.claimRef),material=this.#auditInput(c,value.inputRecordRef);
      if(!execution||execution.kind!=='audit_input'||execution.resultRef!==value.resultRef||execution.executionRef!==value.executionRef)fail('STORAGE_INVALID');
      for(const key of ['taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','inputRecordRef','inputDigest','auditRef','bindingDigest','materialDigest','purpose'])if(value[key]!==execution[key])fail('STORAGE_INVALID');
      if(value.purpose!==material.purpose||value.inputDigest!==material.digest)fail('STORAGE_INVALID');
      if(execution.reportRef){
        const report=this.#auto(c,'report',execution.reportRef);
        if(!report?.native||report.native.resultRef!==value.resultRef||report.claimRef!==value.claimRef||report.taskRef!==value.taskRef)fail('STORAGE_INVALID');
      }
      integer(value.byteLength,0,Math.min(material.resultByteLimit,this.#limits.maxDataBytes));
      const data=this.#auditData(c,value.taskRef,value.recordRef),m=data.metadata;
      if(m.kind!=='verification'||m.auditResultRef!==value.resultRef||m.digest!==value.digest||m.byteLength!==value.byteLength||m.generationRef!==value.generationRef||m.sourceRef!==value.auditRef||m.createdAt!==value.createdAt)fail('STORAGE_INVALID');
      return{association:value,content:data.content};
    }catch{fail('STORAGE_INVALID');}
  }
  captureAuditResult(handle,input){
    exact(input,['taskRef','commandRef','claimRef','generationRef','executionRef','sessionRef','inputCursor','cursor','content','evidenceRef']);
    for(const key of ['taskRef','commandRef','claimRef','generationRef','executionRef','sessionRef','evidenceRef'])ref(input[key]);
    integer(input.inputCursor);integer(input.cursor,input.inputCursor+1);
    if(typeof input.content!=='string'||!input.content.isWellFormed())fail('INVALID_INPUT');
    const bounds=this.#requireAuditBounds();
    if(Buffer.byteLength(input.content)>bounds.resultByteLimit)fail('INPUT_TOO_LARGE');
    return this.#mut(handle,input,HOST,'captureAuditResult',c=>{
      const {a,w,t}=this.#claim(c,input),execution=this.#auto(c,'execution',input.claimRef);
      if(!execution||execution.kind!=='audit_input'||execution.executionRef!==input.executionRef||execution.actionRef!==a.action||execution.actionDigest!==a.digest||execution.generationRef!==input.generationRef||execution.sessionRef!==input.sessionRef||w.sessionRef!==input.sessionRef||!['dispatch_intent','unknown'].includes(execution.state))fail('SPEC_MISMATCH');
      const material=this.#auditSpec(c,t.id,a.spec,false);
      if(Buffer.byteLength(input.content)>material.resultByteLimit)fail('INPUT_TOO_LARGE');
      const old=this.#auto(c,'audit_result',input.executionRef);
      if(old){
        const result=this.#auditResult(c,input.executionRef);
        if(result.content!==input.content||old.inputCursor!==input.inputCursor||old.cursor!==input.cursor||old.evidenceRef!==input.evidenceRef)fail('IDEMPOTENCY_CONFLICT');
        return{...old,deduplicated:true};
      }
      if(execution.resultRef)fail('STORAGE_INVALID');
      const data=this.#data({...c,generationRef:w.generationRef},t,{kind:'verification',content:input.content,sourceRef:material.auditRef,commandRef:input.commandRef,auditResultRef:input.executionRef},true);
      const record={contractVersion:'df.audit-result-association/v1',ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,resultRef:input.executionRef,recordRef:data.recordRef,digest:data.digest,byteLength:data.byteLength,
        inputDigest:material.digest,inputRecordRef:material.recordRef,executionRef:input.executionRef,actionRef:a.action,actionDigest:a.digest,claimRef:w.claimRef,generationRef:w.generationRef,sessionRef:w.sessionRef,auditRef:material.auditRef,bindingDigest:material.bindingDigest,materialDigest:material.materialDigest,purpose:material.purpose,
        inputCursor:input.inputCursor,cursor:input.cursor,evidenceRef:input.evidenceRef,state:'captured',createdAt:data.createdAt};
      this.#saveAuto(c,'audit_result',record.resultRef,t.id,record);
      this.#saveAuto(c,'execution',w.claimRef,t.id,{...execution,resultRef:record.resultRef});
      this.#auditResult(c,record.resultRef);
      return{...record,deduplicated:false};
    },'terminal');
  }
  #reportFields(input){
    canonical(input.coverageRefs);canonical(input.unexaminedRefs);canonical(input.findings);
    if(!['passed','failed','unknown','budget_exhausted'].includes(input.verdict)||!Array.isArray(input.coverageRefs)||!Array.isArray(input.unexaminedRefs)||input.coverageRefs.length>16||input.unexaminedRefs.length>16||!Array.isArray(input.findings)||input.findings.length>16)fail('INVALID_INPUT');
    for(const value of [...input.coverageRefs,...input.unexaminedRefs])ref(value);
    for(const finding of input.findings){
      exact(finding,['findingRef','severity','code','evidenceRef','resolved']);
      ref(finding.findingRef);ref(finding.evidenceRef);
      if(!['fatal','blocking','warning','info'].includes(finding.severity)||!['scope_violation','permission_bypass','secret_exposure','artifact_mismatch','coverage_gap','review_failure','other'].includes(finding.code)||typeof finding.resolved!=='boolean')fail('INVALID_INPUT');
    }
  }
  #commitAuditReport(c,input,native){
    const req=this.#auto(c,'audit',input.auditRef);
    if(!req||req.taskRef!==input.taskRef)fail('AUDIT_BINDING_MISMATCH');
    this.#auditCurrent(c,req);
    const {a,w,t}=this.#claim(c,input),artifact=this.#artifact(c,t.id,req.artifactRef);
    if(a.spec.executionInput&&!native)fail('AUDIT_RESULT_REQUIRED');
    if(['cancel_requested','recovery_required'].includes(t.status)||a.spec.kind!=='review'||a.spec.role!=='review'||a.spec.targetDigest!==req.bindingDigest||a.spec.dataDigest!==req.digest||c.generationRef!==w.generationRef||artifact.producerRef===c.principalRef||artifact.generationRef===c.generationRef||req.material.some(m=>!c.readRecordRefs.includes(m.recordRef)))fail('UNAUTHORIZED');
    if(input.artifactVersion!==req.artifactVersion||input.digest!==req.digest||input.materialDigest!==req.materialDigest)fail('AUDIT_BINDING_MISMATCH');
    if(req.reportRef)fail('AUDIT_REPORT_CONFLICT');
    const all=[...input.coverageRefs,...input.unexaminedRefs];
    if(new Set(all).size!==all.length||all.length!==req.material.length||all.some(r=>!req.material.some(m=>m.recordRef===r))||new Set(input.findings.map(f=>f.findingRef)).size!==input.findings.length)fail('AUDIT_BINDING_MISMATCH');
    const reports=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='report'",...this.#keys(c,t.id)).map(row=>this.#auto(c,'report',row.id)).filter(report=>report.auditRef===req.auditRef);
    if(reports.length>=9)fail('RECORD_LIMIT');
    const blocking=input.findings.some(f=>f.severity==='fatal'||req.blockingSeverities.includes(f.severity));
    const state=input.verdict==='passed'&&input.unexaminedRefs.length===0&&!blocking?'passed':input.verdict==='unknown'||input.verdict==='budget_exhausted'?input.verdict:'failed';
    const report={...input,reportRef:input.commandRef,auditRevision:req.auditRevision,round:req.round,bindingDigest:req.bindingDigest,semanticRevision:req.semanticRevision,reviewerRef:c.principalRef,state,...(native?{native}: {})};
    this.#saveAuto(c,'report',input.commandRef,t.id,report);
    this.#saveAuto(c,'audit',req.auditRef,t.id,{...req,reportRef:input.commandRef,state});
    return report;
  }
  submitAuditResult(handle,input){
    exact(input,['taskRef','commandRef','auditRef','executionRef','resultRef']);
    for(const key of Object.keys(input))ref(input[key]);
    return this.#mut(handle,input,['reviewer'],'submitAuditResult',c=>{
      if(!c.auditClaimRef||c.auditRef!==input.auditRef)fail('UNAUTHORIZED');
      const result=this.#auditResult(c,input.resultRef),source=result.association;
      if(source.taskRef!==input.taskRef||source.auditRef!==input.auditRef||source.executionRef!==input.executionRef||source.claimRef!==c.auditClaimRef||source.generationRef!==c.generationRef||source.sessionRef!==c.sessionRef||source.purpose!=='audit_review')fail('AUDIT_BINDING_MISMATCH');
      const {a}=this.#executionAdmission(c,{taskRef:input.taskRef,claimRef:source.claimRef,generationRef:source.generationRef,actionDigest:source.actionDigest});
      const execution=this.#auto(c,'execution',source.claimRef);
      if(execution.state!=='dispatch_intent')fail('CLAIM_REVOKED');
      this.#executionMaterial(c,execution,a);
      if(Buffer.byteLength(result.content)>this.#requireAuditBounds().resultByteLimit)fail('INPUT_TOO_LARGE');
      let response;
      try{response=JSON.parse(result.content);}catch{fail('AUDIT_RESPONSE_INVALID');}
      try{
        exact(response,['contractVersion','bindingDigest','materialDigest','inputDigest','verdict','coverageRefs','unexaminedRefs','findings']);
        if(response.contractVersion!=='df.audit-response/v1'||response.bindingDigest!==source.bindingDigest||response.materialDigest!==source.materialDigest||response.inputDigest!==source.inputDigest)fail('AUDIT_RESPONSE_INVALID');
        this.#reportFields(response);
      }catch{fail('AUDIT_RESPONSE_INVALID');}
      const req=this.#auto(c,'audit',source.auditRef),native={resultRef:source.resultRef,recordRef:source.recordRef,digest:source.digest,executionRef:source.executionRef,inputDigest:source.inputDigest,sessionRef:source.sessionRef};
      const artifact=this.#artifact(c,input.taskRef,req.artifactRef);
      const report=this.#commitAuditReport(c,{taskRef:input.taskRef,commandRef:input.commandRef,auditRef:source.auditRef,artifactVersion:req.artifactVersion,digest:req.digest,materialDigest:source.materialDigest,claimRef:source.claimRef,generationRef:source.generationRef,coverageRefs:response.coverageRefs,unexaminedRefs:response.unexaminedRefs,verdict:response.verdict,findings:response.findings,evidenceRef:source.evidenceRef},native);
      const verification=this.#nativeVerification(c,report);
      this.#newRecord(c,input.taskRef,'review',input.commandRef,{artifactRef:artifact.artifactRef,version:artifact.version,digest:artifact.digest,...verification},true);
      this.#saveRecord(c,input.taskRef,'artifact',canonicalDigest({artifactRef:artifact.artifactRef,version:artifact.version}),{...artifact,verification});
      this.#saveAuto(c,'execution',source.claimRef,input.taskRef,{...execution,reportRef:report.reportRef});
      return{report,verification};
    },'terminal');
  }
  #auditCurrent(c,req){
    const artifact=this.#artifact(c,req.taskRef,req.artifactRef);
    if(!artifact||artifact.version!==req.artifactVersion||artifact.digest!==req.digest||req.semanticRevision!==this.#semantic(c,req.taskRef))fail('AUDIT_STALE');
    for(const item of req.material){
      const row=this.#ledger.one('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND id=?',...this.#keys(c,req.taskRef),item.recordRef);
      if(!row||this.#openData(c,row).metadata.digest!==item.digest)fail('AUDIT_BINDING_MISMATCH');
    }
    if(req.contextRecordRef){
      const context=this.#auditContext(c,req.taskRef,req.contextRecordRef);
      if(context.metadata.digest!==req.contextDigest)fail('AUDIT_BINDING_MISMATCH');
    }
    return artifact;
  }
  configureAudit(handle,input){
    const required=['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','auditRef','expectedAuditRevision','artifactRef','artifactVersion','digest','material','policyRef','blockingSeverities','maxRepairRounds'];
    exact(input,[...required,'contextRecordRef'],required);
    for(const k of ['auditRef','artifactRef','digest','policyRef'])ref(input[k]);
    integer(input.expectedAuditRevision);
    integer(input.artifactVersion,1);
    integer(input.maxRepairRounds,0,8);
    canonical(input.material);
    canonical(input.blockingSeverities);
    if(!Array.isArray(input.material)||input.material.length<1||input.material.length>16||new Set(input.material.map(m=>m.recordRef)).size!==input.material.length||!Array.isArray(input.blockingSeverities)||input.blockingSeverities.length>4||new Set(input.blockingSeverities).size!==input.blockingSeverities.length||input.blockingSeverities.some(s=>!['fatal','blocking','warning','info'].includes(s)))fail('INVALID_INPUT');
    for(const m of input.material){
      exact(m,['recordRef','digest']);
      ref(m.recordRef);
      ref(m.digest);
    }     return this.#mut(handle,input,OWNER,'configureAudit',c=>{
      let t=this.#cas(c,input);
      this.#managed(t);
      const old=this.#auto(c,'audit',input.auditRef);
      if(old&&old.taskRef!==t.id)fail('AUDIT_BINDING_MISMATCH');
      if((old?.auditRevision||0)!==input.expectedAuditRevision)fail('STALE_VERSION');
      if(!old&&this.#ledger.one("SELECT count(*) AS n FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='audit'",...this.#keys(c,t.id)).n>=16)fail('RECORD_LIMIT');
      if(old?.reportRef&&old.state!=='passed'&&!old.pendingRepair)fail('AUDIT_REPAIR_LIMIT');
      const artifact=this.#artifact(c,t.id,input.artifactRef);
      if(!artifact||artifact.version!==input.artifactVersion||artifact.digest!==input.digest||!input.material.some(m=>m.recordRef===artifact.recordRef&&m.digest===artifact.digest))fail('AUDIT_BINDING_MISMATCH');
      const material=input.material.map(m=>({
        ...m
      })).sort((a,b)=>a.recordRef.localeCompare(b.recordRef));
      for(const m of material)this.#dataMeta(c,t.id,m.recordRef,m.digest);
      let protectedContext;
      if(input.contextRecordRef!==undefined){
        protectedContext=this.#auditContext(c,t.id,ref(input.contextRecordRef));
        if(!material.some(m=>m.recordRef===protectedContext.metadata.recordRef&&m.digest===protectedContext.metadata.digest))fail('AUDIT_BINDING_MISMATCH');
      }
      t=this.#update(t,t.status,'progress');
      const binding={
        ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,auditRef:input.auditRef,auditRevision:input.expectedAuditRevision+1,artifactRef:input.artifactRef,artifactVersion:input.artifactVersion,digest:input.digest,material,policyRef:input.policyRef,blockingSeverities:[...input.blockingSeverities].sort(),maxRepairRounds:input.maxRepairRounds,round:old?.pendingRepair?.round??old?.round??0,semanticRevision:this.#semantic(c,t.id)
      };
      const record={
        ...binding,materialDigest:canonicalDigest(material),bindingDigest:canonicalDigest(binding),state:'pending',reportRef:null,previousReportRef:old?.reportRef||null,
        ...(protectedContext?{contextRecordRef:protectedContext.metadata.recordRef,contextDigest:protectedContext.metadata.digest}:{})
      };
      this.#auditCurrent(c,record);
      this.#saveAuto(c,'audit',input.auditRef,t.id,record);
      const semantic=this.#auto(c,'semantic',t.id)||{
        revision:1
      };
      this.#saveAuto(c,'semantic',t.id,t.id,{
        ...semantic,requiredAudits:[...new Set([...(semantic.requiredAudits||[]),input.auditRef])]
      });
      return{
        ...record,task:taskRecord(t)
      };
    });
  }
  audit(handle,input){
    exact(input,['taskRef','auditRef']);
    const c=this.#ctx(handle,input.taskRef);
    const req=this.#auto(c,'audit',input.auditRef);
    if(!req||req.taskRef!==input.taskRef)fail('RECORD_NOT_FOUND');
    if(c.role==='reviewer'&&req.material.some(m=>!c.readRecordRefs.includes(m.recordRef)))fail('UNAUTHORIZED');
    if(c.role==='worker'&&!this.#ledger.query('SELECT spec FROM runtime_actions WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,input.taskRef)).some(r=>{
      const s=parse(r.spec);
      return s.executor.generationRef===c.generationRef&&s.targetDigest===req.bindingDigest;
    }))fail('UNAUTHORIZED');
    let state=req.state;
    try{
      this.#auditCurrent(c,req);
    }catch(error){
      if(error.code==='AUDIT_STALE')state='stale';
      else throw error;
    }const reports=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='report'",...this.#keys(c,input.taskRef)).map(r=>this.#auto(c,'report',r.id)).filter(r=>r.auditRef===req.auditRef);
    return{
      ...req,state,reports
    };
  }
  reportAudit(handle,input){
    exact(input,['taskRef','commandRef','auditRef','artifactVersion','digest','materialDigest','claimRef','generationRef','coverageRefs','unexaminedRefs','verdict','findings','evidenceRef']);
    for(const key of ['auditRef','digest','materialDigest','claimRef','generationRef','evidenceRef'])ref(input[key]);
    integer(input.artifactVersion,1);
    this.#reportFields(input);
    return this.#mut(handle,input,['reviewer'],'reportAudit',c=>this.#commitAuditReport(c,input),'terminal');
  }
  #repairBinding(c,input,a){
    const req=this.#auto(c,'audit',ref(input.auditRef));
    if(!req||req.taskRef!==input.taskRef||req.reportRef!==ref(input.previousReportRef)||req.state==='passed'||req.pendingRepair||integer(input.round,1,8)!==req.round+1||input.round>req.maxRepairRounds)fail('AUDIT_REPAIR_LIMIT');
    if(a.spec.kind!=='repair'||a.spec.role!=='repair'||a.spec.targetDigest!==req.bindingDigest||a.spec.dataDigest!==req.digest)fail('AUDIT_BINDING_MISMATCH');
    if(a.spec.executionInput){
      const material=this.#auditSpec(c,input.taskRef,a.spec,true);
      if(material.auditRef!==input.auditRef||material.round!==input.round||material.previousReportRef!==input.previousReportRef||material.purpose!=='audit_repair')fail('AUDIT_BINDING_MISMATCH');
    }
    ref(input.evidenceRef);
    return req;
  }
  #commitRepair(c,input,a,claimRef,generationRef){
    const req=this.#repairBinding(c,input,a),record={
      auditRef:req.auditRef,claimRef,generationRef,round:input.round,previousReportRef:input.previousReportRef,evidenceRef:input.evidenceRef,bindingDigest:req.bindingDigest
    };
    this.#saveAuto(c,'repair',claimRef,input.taskRef,record);
    this.#saveAuto(c,'audit',req.auditRef,input.taskRef,{
      ...req,pendingRepair:record
    });
    return record;
  }
  recordRepair(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','auditRef','claimRef','generationRef','round','previousReportRef','evidenceRef']);
    return this.#mut(handle,input,DISPATCH,'recordRepair',c=>{
      this.#cas(c,input);
      const{
        a,w
      }=this.#claim(c,input),old=this.#auto(c,'repair',w.claimRef);
      if(a.spec.executionInput&&!old)fail('AUDIT_BINDING_MISMATCH');
      if(old){
        if(old.auditRef!==input.auditRef||old.round!==input.round||old.previousReportRef!==input.previousReportRef||old.evidenceRef!==input.evidenceRef)fail('IDEMPOTENCY_CONFLICT');
        return old;
      }return this.#commitRepair(c,input,a,w.claimRef,w.generationRef);
    });
  }
  #auditGate(c,task){
    for(const id of this.#auto(c,'semantic',task)?.requiredAudits||[])if(!this.#auto(c,'audit',id))fail('STORAGE_INVALID');
    for(const row of this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='audit'",...this.#keys(c,task))){
      const req=this.#auto(c,'audit',row.id);
      this.#auditCurrent(c,req);
      if(req.state!=='passed')fail('AUDIT_PENDING');
    }
  }
  #validateOpen(){
    const existing=this.#ledger.one('SELECT key_digest FROM runtime_security WHERE id=1');
    if(existing&&existing.key_digest!==hash(this.#key))fail('KEY_MISMATCH');
    this.#validate();
  }
  #validateAutomation(row){
    const c={ownerRef:row.owner,workspaceRef:row.workspace};
    const value=this.#auto(c,row.kind,row.id);
    if(row.kind==='notification_claim'){
      const delivery=this.#record(c,row.task,'delivery',value.deliveryRef);
      if(delivery.claimRef!==value.claimRef||delivery.reservationRef!==value.reservationRef||
        !this.#auto(c,'notification_group',value.groupId)||
        value.factIds.some(id=>!this.#auto(c,'notification_fact',id)))fail('STORAGE_INVALID');
    }
    if(row.kind==='notification_policy')this.#notificationSpec(value.spec);
    if(['notification_group','notification_fact'].includes(row.kind)){
      const delivery=this.#record(c,row.task,'delivery',value.deliveryRef);
      if(delivery.claimRef!==value.claimRef||delivery.reservationRef!==value.reservationRef||!delivery.notification)fail('STORAGE_INVALID');
    }
    if(row.kind==='receipt_policy')this.#receiptPolicy(c);
    if(row.kind==='legacy_command'){
      const command=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',row.owner,row.workspace,row.id);
      if(!command||canonical(value)!==canonical(this.#receiptIdentity(command)))fail('STORAGE_INVALID');
    }
    if(row.kind==='semantic'){
      integer(value.revision,1);
      for(const id of value.requiredAudits||[])if(!this.#auto(c,'audit',id))fail('STORAGE_INVALID');
    }
    if(row.kind==='event'){
      if(!this.#auto(c,'source',value.sourceRef)||!this.#auto(c,'subscription',value.subscriptionRef)||
        !this.#ledger.one('SELECT 1 FROM ingress WHERE owner=? AND workspace=? AND provider=? AND source=? AND event=? AND task=?',row.owner,row.workspace,value.providerRef,value.sourceIdentityRef,value.eventRef,value.taskRef))fail('STORAGE_INVALID');
      for(const [referenceKey,digestKey,kind] of [['goalRecordRef','goalDigest','goal'],['supplementRecordRef','supplementDigest','context']]){
        if(value[referenceKey]===undefined&&value[digestKey]===undefined)continue;
        if(value[referenceKey]===undefined||value[digestKey]===undefined)fail('STORAGE_INVALID');
        const metadata=this.#dataMeta(c,row.task,value[referenceKey],value[digestKey]);
        if(metadata.kind!==kind||metadata.sourceRef!==value.sourceRef||metadata.generationRef!==null)fail('STORAGE_INVALID');
      }
    }
    if(row.kind==='subscription'&&!this.#auto(c,'source',value.sourceRef))fail('STORAGE_INVALID');
    if(row.kind==='audit_input'){
      const input=this.#auditInput(c,row.id);
      if(input.taskRef!==row.task)fail('STORAGE_INVALID');
    }
    if(row.kind==='audit_result'){
      if(this.#auditResult(c,row.id).association.taskRef!==row.task)fail('STORAGE_INVALID');
    }
    if(row.kind==='report'&&value.native)this.#validateNativeReport(c,value);
    if(row.kind==='execution'){
      if(!this.#ledger.one('SELECT 1 FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',row.owner,row.workspace,row.task,value.claimRef))fail('STORAGE_INVALID');
      if(value.kind!==undefined)this.#validateAuditExecution(c,value);
    }
  }
  #validateAuditExecution(c,execution){
    try{
      const required=['kind','executionRef','taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','inputRecordRef','inputDigest','dataDigest','auditRef','bindingDigest','materialDigest','purpose','semanticRevision','commandRef','state','createdAt'];
      exact(execution,[...required,'admittedAt','resultRef','reportRef','outcomeEvidenceRef','terminalEvidenceRef'],required);
      if(execution.kind!=='audit_input'||!['intent_committed','dispatch_intent','unknown','completed','failed','cancelled'].includes(execution.state))fail('STORAGE_INVALID');
      for(const key of ['executionRef','taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','inputRecordRef','inputDigest','dataDigest','auditRef','bindingDigest','materialDigest','commandRef'])ref(execution[key]);
      integer(execution.semanticRevision,1);integer(execution.createdAt);
      if(execution.admittedAt!==undefined)integer(execution.admittedAt,execution.createdAt);
      if(execution.state==='dispatch_intent'&&execution.admittedAt===undefined)fail('STORAGE_INVALID');
      for(const key of ['outcomeEvidenceRef','terminalEvidenceRef'])if(execution[key]!==undefined&&execution[key]!==null)ref(execution[key]);
      if(['completed','failed','cancelled'].includes(execution.state)&&(!execution.outcomeEvidenceRef||!execution.terminalEvidenceRef))fail('STORAGE_INVALID');
      if(execution.executionRef!==canonicalDigest({claimRef:execution.claimRef,commandRef:execution.commandRef,inputRecordRef:execution.inputRecordRef}))fail('STORAGE_INVALID');
      const a=this.#action(c,execution.taskRef,execution.actionRef);
      if(a.digest!==execution.actionDigest||a.metadata.executionRef!==execution.executionRef||a.metadata.claimRef!==execution.claimRef||a.spec.executor.generationRef!==execution.generationRef||a.spec.executor.sessionRef!==execution.sessionRef)fail('STORAGE_INVALID');
      this.#executionMaterial(c,execution,a,false);
      const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,execution.taskRef),execution.claimRef);
      if(!worker||parse(worker.payload).sessionRef!==execution.sessionRef)fail('STORAGE_INVALID');
      if(execution.resultRef)this.#auditResult(c,execution.resultRef);
      if(execution.reportRef){ref(execution.reportRef);if(!execution.resultRef)fail('STORAGE_INVALID');}
      const command=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,execution.commandRef);
      if(!command||command.operation!=='beginAuditExecution')fail('STORAGE_INVALID');
      const receipt=this.#commandReceipt(command);
      if(receipt.executionRef!==execution.executionRef||receipt.claimRef!==execution.claimRef||receipt.inputRecordRef!==execution.inputRecordRef||receipt.inputDigest!==execution.inputDigest)fail('STORAGE_INVALID');
    }catch{fail('STORAGE_INVALID');}
  }
  #nativeVerification(c,report){
    const source=this.#auditResult(c,report.native.resultRef).association;
    const body=parse(this.#auditData(c,report.taskRef,source.inputRecordRef).content);
    const blocking=report.findings.some(finding=>finding.severity==='fatal'||body.policy.blockingSeverities.includes(finding.severity));
    const verdict=report.state==='passed'?'accepted':blocking||report.verdict==='failed'?'rejected':'unknown';
    return{verdict,evidenceRef:report.evidenceRef,reviewerRef:report.reviewerRef,generationRef:report.generationRef,reportRef:report.reportRef,resultRef:report.native.resultRef};
  }
  #validateNativeReport(c,report){
    try{
      exact(report.native,['resultRef','recordRef','digest','executionRef','inputDigest','sessionRef']);
      const source=this.#auditResult(c,report.native.resultRef).association;
      if(this.#auto(c,'execution',source.claimRef)?.reportRef!==report.reportRef)fail('STORAGE_INVALID');
      const response=parse(this.#auditResult(c,report.native.resultRef).content);
      exact(response,['contractVersion','bindingDigest','materialDigest','inputDigest','verdict','coverageRefs','unexaminedRefs','findings']);
      this.#reportFields(response);
      if(response.contractVersion!=='df.audit-response/v1'||response.inputDigest!==source.inputDigest)fail('STORAGE_INVALID');
      for(const key of ['bindingDigest','materialDigest','verdict','coverageRefs','unexaminedRefs','findings'])if(canonical(response[key])!==canonical(report[key]))fail('STORAGE_INVALID');
      for(const key of ['resultRef','recordRef','digest','executionRef','inputDigest','sessionRef'])if(report.native[key]!==source[key])fail('STORAGE_INVALID');
      for(const key of ['taskRef','auditRef','bindingDigest','materialDigest','claimRef','generationRef','evidenceRef'])if(report[key]!==source[key])fail('STORAGE_INVALID');
      const material=this.#auditInput(c,source.inputRecordRef);
      if(source.purpose!=='audit_review'||report.artifactVersion!==material.artifactVersion||report.digest!==material.artifactDigest||report.auditRevision!==material.auditRevision||report.round!==material.round||report.semanticRevision!==material.semanticRevision)fail('STORAGE_INVALID');
      const review=this.#record(c,report.taskRef,'review',report.reportRef);
      if(canonical(review)!==canonical({artifactRef:material.artifactRef,version:material.artifactVersion,digest:material.artifactDigest,...this.#nativeVerification(c,report)}))fail('STORAGE_INVALID');
      const artifact=this.#artifact(c,report.taskRef,material.artifactRef,material.artifactVersion);
      if(!artifact||artifact.digest!==material.artifactDigest)fail('STORAGE_INVALID');
    }catch{fail('STORAGE_INVALID');}
  }
  #validateArtifactVerification(c,task,artifact){
    if(!this.#ledger.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'")){
      if(artifact.verification?.resultRef)fail('STORAGE_INVALID');
      return;
    }
    for(const row of this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='audit_result'",...this.#keys(c,task))){
      const source=this.#auditResult(c,row.id).association,material=this.#auditInput(c,source.inputRecordRef),execution=this.#auto(c,'execution',source.claimRef);
      if(execution.reportRef&&material.artifactRef===artifact.artifactRef&&material.artifactVersion===artifact.version&&(!artifact.verification?.resultRef||!this.#auto(c,'report',execution.reportRef)))fail('STORAGE_INVALID');
    }
    const reports=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='report'",...this.#keys(c,task)).map(row=>this.#auto(c,'report',row.id)).filter(report=>report.native&&report.artifactVersion===artifact.version&&report.digest===artifact.digest&&this.#auditInput(c,this.#auditResult(c,report.native.resultRef).association.inputRecordRef).artifactRef===artifact.artifactRef);
    if(artifact.verification?.resultRef){
      const report=this.#auto(c,'report',artifact.verification.reportRef);
      if(!report?.native||report.taskRef!==task||report.artifactVersion!==artifact.version||report.digest!==artifact.digest||!reports.some(item=>item.reportRef===report.reportRef)||canonical(artifact.verification)!==canonical(this.#nativeVerification(c,report)))fail('STORAGE_INVALID');
    }else if(reports.length)fail('STORAGE_INVALID');
  }
  #validate(){
    const version=this.#ledger.one('PRAGMA user_version').user_version;
    if(version<5){
      for(const row of this.#ledger.query('SELECT spec FROM runtime_actions'))if(parse(row.spec).executionInput!==undefined)fail('SCHEMA_UNSUPPORTED');
      if(this.#ledger.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'")){
        if(this.#ledger.one("SELECT 1 FROM automation_records WHERE kind IN ('audit_input','audit_result') LIMIT 1"))fail('SCHEMA_UNSUPPORTED');
      for(const row of this.#ledger.query("SELECT payload FROM automation_records WHERE kind IN ('execution','report','audit')")){
        const value=parse(row.payload).data;
        if(value?.kind==='audit_input'||value?.native!==undefined||value?.contextRecordRef!==undefined)fail('SCHEMA_UNSUPPORTED');
      }
      }
      for(const row of this.#ledger.query('SELECT metadata FROM runtime_data')){
        const metadata=parse(row.metadata);
        if(metadata.auditInputRef!==undefined||metadata.auditResultRef!==undefined)fail('SCHEMA_UNSUPPORTED');
      }
    }
    if(this.#ledger.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'")){
      for(const row of this.#ledger.query('SELECT * FROM automation_records'))this.#validateAutomation(row);
      for(const row of this.#ledger.query('SELECT * FROM workspace_memory'))this.#memory({ownerRef:row.owner,workspaceRef:row.workspace},row.namespace);
    }
    for(const row of this.#ledger.query('SELECT * FROM runtime_commands')){
      const receipt=this.#commandReceipt(row,false,true),c={ownerRef:row.owner,workspaceRef:row.workspace};
      if(row.operation==='prepareAuditInput'){
        const input=this.#auditInput(c,receipt.recordRef);
        if(input.taskRef!==row.task||input.digest!==receipt.digest||input.auditRef!==receipt.auditRef)fail('STORAGE_INVALID');
      }
      if(row.operation==='captureAuditResult'){
        const result=this.#auditResult(c,receipt.resultRef).association;
        if(result.taskRef!==row.task||result.digest!==receipt.digest||result.recordRef!==receipt.recordRef)fail('STORAGE_INVALID');
      }
      if(row.operation==='submitAuditResult'){
        const report=this.#auto(c,'report',row.id);
        if(!report||canonical(report)!==canonical(receipt.report)||canonical(this.#nativeVerification(c,report))!==canonical(receipt.verification))fail('STORAGE_INVALID');
      }
    }
    for(const row of this.#ledger.query('SELECT metadata FROM runtime_data'))if(parse(row.metadata).cryptoVersion!==2)fail('CRYPTO_LEGACY_UNVERIFIED');
    for(const table of ['runtime_commands','runtime_data','runtime_actions','runtime_workers','runtime_records']){
      const rows=this.#ledger.query(`SELECT * FROM ${table}`);
      if(rows.length>this.#limits.maxCommands+this.#limits.maxTasks*this.#limits.maxRecordsPerTask)fail('STORAGE_INVALID');
      for(const r of rows){
        for(const k of ['owner','workspace','task','id','action','claim','digest'])if(r[k]!==undefined)ref(r[k]);
        for(const k of ['receipt','metadata','spec','payload'])if(r[k]!==undefined){
          const obj=parse(r[k]);
          this.#check(obj,table==='runtime_commands'?this.#limits.maxMetadataBytes+512:this.#limits.maxMetadataBytes);
        }
      }
    }
    for(const policyRow of this.#ledger.query('SELECT * FROM runtime_policy'))this.#getPolicy({ownerRef:policyRow.owner,workspaceRef:policyRow.workspace});
    for(const r of this.#ledger.query('SELECT * FROM runtime_records')){const c={ownerRef:r.owner,workspaceRef:r.workspace},record=this.#record(c,r.task,r.kind,r.id);if(r.kind==='delivery'&&record.notification&&record.claimRef){const ownership=this.#auto(c,'notification_claim',record.deliveryRef);if(!ownership||ownership.claimRef!==record.claimRef||ownership.reservationRef!==record.reservationRef)fail('STORAGE_INVALID');}}
    for(const r of this.#ledger.query('SELECT * FROM runtime_actions')){
      const spec=normalizedSpec(parse(r.spec)),m=parse(r.metadata),action=this.#ledger.one('SELECT * FROM actions WHERE owner=? AND workspace=? AND task=? AND id=?',r.owner,r.workspace,r.task,r.action);
      if(!action||spec.actionRef!==r.action||spec.kind!==action.kind||spec.units!==action.units||spec.targetDigest!==action.target_digest||spec.dataDigest!==action.data_digest||r.digest!==canonicalDigest({ownerRef:r.owner,workspaceRef:r.workspace,taskRef:r.task,taskVersion:m.plannedTaskVersion,authEpoch:m.plannedAuthEpoch,spec}))fail('STORAGE_INVALID');
      if(spec.executionInput)this.#auditSpec({ownerRef:r.owner,workspaceRef:r.workspace},r.task,spec,false);
      if(m.executionRef){const execution=this.#auto({ownerRef:r.owner,workspaceRef:r.workspace},'execution',m.claimRef);if(!execution||execution.executionRef!==m.executionRef||execution.actionRef!==r.action||execution.actionDigest!==r.digest||execution.generationRef!==m.generationRef)fail('STORAGE_INVALID');}
      if(action.claim_id){if(m.claimRef!==reference(action.claim_id)||m.generationRef!==spec.executor.generationRef)fail('STORAGE_INVALID');const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',r.owner,r.workspace,r.task,m.claimRef);if(!worker)fail('STORAGE_INVALID');const w=parse(worker.payload);if(w.claimRef!==m.claimRef||w.actionRef!==r.action||w.actionDigest!==r.digest||w.reservationRef!==m.reservationRef||w.generationRef!==m.generationRef)fail('STORAGE_INVALID');if(m.releaseEvidenceRef&&['unknown','dispatch_intent'].includes(action.state)||!m.releaseEvidenceRef&&!['unknown','dispatch_intent'].includes(action.state))fail('STORAGE_INVALID');}
    }
    for(const row of this.#ledger.query('SELECT * FROM runtime_data')){
      this.#openData({ownerRef:row.owner,workspaceRef:row.workspace},row);
    }
  }
  #recover(){
    for(const row of this.#ledger.query("SELECT * FROM automation_records WHERE kind='execution'")){const c={ownerRef:row.owner,workspaceRef:row.workspace},record=this.#auto(c,'execution',row.id);if(['intent_committed','dispatch_intent'].includes(record.state))this.#saveAuto(c,'execution',row.id,row.task,{...record,state:'unknown'});}
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
