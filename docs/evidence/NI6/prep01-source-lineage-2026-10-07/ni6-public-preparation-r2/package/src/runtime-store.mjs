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
import { NATIVE_KINDS,NATIVE_DATA_KINDS,POLICY_FIELDS,stableSource,configuration,canonicalContent,preparationRequest,preparationDigest,ownerFinishRequest,finishDigest,historyObservation,resumeHistory,resumeInput,payload,array,sortedRefs,text,detach,normalInput } from './normal-contracts.mjs';
export {
  RuntimeError, reference, canonicalDigest
};
const DEFAULTS={
  queueCapacity:32,maxActive:2,maxAttempts:3,maxTotalAttempts:12,maxTasks:1000,maxActionsPerTask:16,maxEventsPerTask:128,maxMetadataBytes:8192,maxDataBytes:65536,maxRecordsPerTask:128,maxCommands:4096,maxRuntimeMs:3600000,maxUsageUnits:1000000,maxCostEstimateMicros:1000000,maxControlCommands:128
};
const TERMINAL=new Set(['completed','failed','cancelled','deleted']);
const DATA_KINDS=['goal','constraints','clarification','branch','context','message','artifact','verification','progress'];
// Private owner command data is deliberately outside the native/preparation kinds.
const OWNER_FINISH_INTENT_KIND='owner_finish_intent';
const OWNER_FINISH_INTENT_OPERATION='ownerNativeFinishIntent';
const OWNER_FINISH_COMMAND_LIMIT=16,OWNER_FINISH_WIRE_LIMIT=65536;
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
const PREPARATION_SOURCE=Symbol('df.preparation-source/v1');
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
  #preparation=new WeakMap();
  #native=new WeakMap();
  #capabilities=new WeakSet();
  #auditBounds=null;
  #auditBindings=new Map();
  constructor(options) {
    exact(options,['databasePath','encryptionKey','principals','limits','clock','hostPermission','forbiddenSecrets','fixtureMode','fixtureFaults','migrationFault','fixtureMaxPageCount','auditExecutionBounds','preparationPrincipals','nativeObservers'],['databasePath','encryptionKey','principals']);
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
    this.#bindNormalCapabilities(options);
    if(fixtureMaxPageCount!==undefined)integer(fixtureMaxPageCount,1,1000000);
    try {
      this.#ledger=new Ledger(databasePath,{
        migrationFault,maxPageCount:fixtureMaxPageCount,
        validateMigration:source=>{const original=this.#ledger;this.#ledger=source;try{this.#validateOpen();}finally{this.#ledger=original;}},
        initializeMigration:(source,version)=>{const original=this.#ledger;this.#ledger=source;try{if(version<4)this.#initializeReceiptPolicies();if(version<6)this.#initializeNormalRegistries();if(version<7)this.#initialize7Registries();}finally{this.#ledger=original;}},
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
    if(this.#ledger){this.#validateNormalScope(c);this.#validate7Scope(c);}
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
  #mut(handle,input,roles,operation,fn,protectedOp=false,normalAuthority=null){
    exact(input,Object.keys(input));
    const c=normalAuthority||this.#ctx(handle,input.taskRef,roles);
    ref(input.commandRef);
    const material=normalAuthority&&operation==='putPreparedContext'?{preparationRequestDigest:preparationDigest(c,input.request)}:{...input};let changed=false;
    for(const key of ['content','goal','constraints',...(normalAuthority?['configurationContent','resultContent','committedHistoryContent','baselineHistoryContent','historyContent','requestContent']:[])])if(typeof material[key]==='string'){
      if(!material[key].isWellFormed())fail('INVALID_INPUT');
      if(Buffer.byteLength(material[key])>this.#limits.maxDataBytes)fail('INPUT_TOO_LARGE');
      if(this.#secrets.some(s=>material[key].includes(s)))fail('SECRET_REJECTED');
      material[key]={contentDigest:hash(material[key]),byteLength:Buffer.byteLength(material[key])};changed=true;
    }
    if(normalAuthority&&material.request)material.request={preparationRequestDigest:preparationDigest(c,material.request)};
    const text=this.#check(material),digest=hash(c.principalRef+operation+text);
    let legacyDigest;
    if(changed&&!normalAuthority){try{legacyDigest=hash(c.principalRef+operation+this.#check(input,Math.max(this.#limits.maxMetadataBytes,this.#limits.maxDataBytes+4096)));}catch(error){if(error.code!=='INPUT_TOO_LARGE')throw error;}}

    return this.#ledger.transaction(()=>{
      this.#validateNormalScopes();this.#validate7Scopes();
      if(['chatControl','ingestEvent','ingestLocalOwnerEvent','advanceEventClock','approveEventClock'].includes(operation))this.#eventBinding(c,input);
      const old=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,input.commandRef);
      if(old){
        const receipt=this.#commandReceipt(old);
        if(operation===OWNER_FINISH_INTENT_OPERATION){
          if(old.operation!==operation||old.task!==input.taskRef)fail('IDEMPOTENCY_CONFLICT');
          const intent=this.#ownerFinishIntent(c,input.request);
          if(!intent||canonical(intent.request)!==canonical(input.request))fail('IDEMPOTENCY_CONFLICT');
          return intent.receipt;
        }
        if(old.digest!==digest&&old.digest!==legacyDigest||old.operation!==operation)fail('IDEMPOTENCY_CONFLICT');
        if(['beginContextExecution','beginAuditExecution'].includes(operation))return{...this.#auto(c,'execution',receipt.claimRef),deduplicated:true};
        if(['prepareAuditInput','captureAuditResult'].includes(operation))return{...receipt,deduplicated:true};
        if(['ingestEvent','ingestLocalOwnerEvent'].includes(operation))return{...receipt,deduplicated:true,task:taskRecord(this.#task(c,receipt.taskRef))};
        return operation==='putPreparedContext'?{...receipt,commitDisposition:'historical'}:receipt;
      }
      const count=this.#ledger.one('SELECT count(*) AS n FROM runtime_commands').n,held=this.#ledger.one('SELECT count(*) AS n FROM reservations').n;
      const terminalProgress=protectedOp==='terminal'&&this.#terminalProgress(c,input,operation);
      const invalidationProgress=protectedOp===true&&this.#invalidationProgress(c,input,operation);
      if(count>=this.#limits.maxCommands-(terminalProgress?0:invalidationProgress?4*held+1:12*held+this.#limits.maxControlCommands))fail('COMMAND_LIMIT');
      this.#ensureNormalRegistry(c);
      this.#ensure7Registries(c);
      if(!normalAuthority&&['recordArtifact','writeArtifact','captureAuditResult','settleAction'].includes(operation))this.#refuseGenericClaimEffect(c,{...input,claimRef:input.claimRef??input.producerClaimRef},false);
      const result=fn(c);
      this.#ensureReceiptPolicy(c);
      const row={owner:c.ownerRef,workspace:c.workspaceRef,id:input.commandRef,task:input.taskRef||c.workspaceRef,digest,operation};
      this.#check(result);
      const receipt=this.#check({format:'command-receipt/v1',data:result,mac:this.#receiptMac(row,result)},this.#limits.maxMetadataBytes+512);
      this.#cut('before_commit');
      this.#ledger.run('INSERT INTO runtime_commands VALUES(?,?,?,?,?,?,?)',c.ownerRef,c.workspaceRef,input.commandRef,input.taskRef||c.workspaceRef,digest,operation,receipt);
      this.#validateNormalScope(c);
      this.#validate7Scope(c);
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
    if(operation===OWNER_FINISH_INTENT_OPERATION){
      exact(input,['taskRef','commandRef','request']);const q=ownerFinishRequest(input.request);
      if(input.taskRef!==q.taskRef||input.commandRef!==this.#ownerFinishIntentId(c,q.taskRef,q.commandRef))fail('INVALID_INPUT');
      this.#ownerFinishActive(c,q);return !this.#ownerFinishIntent(c,q);
    }
    if(['captureNormalNativeResult','captureNormalNativeAuditResult','writeNormalNativeRepairArtifact','finishNormalNativeExecution'].includes(operation))return this.#normalTerminalProgress(c,input,operation);
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
  #normalTerminalProgress(c,input,operation){
    if(!c.hostHandle)fail('UNAUTHORIZED');this.#normalTaskAuthority(c,input.taskRef);
    // The repair public input remains closed: this projection uses its actual
    // original producerClaimRef solely for the original private claim lookup.
    const claimInput=operation==='writeNormalNativeRepairArtifact'?{taskRef:input.taskRef,claimRef:ref(input.producerClaimRef),generationRef:ref(input.generationRef)}:{taskRef:input.taskRef,claimRef:ref(input.claimRef),generationRef:ref(input.generationRef)};
    const {w,a}=this.#claim(c,claimInput);
    if(!a.spec.nativeOriginBinding&&!a.spec.resumeBinding)fail('UNAUTHORIZED');
    if(!this.#ledger.one('SELECT 1 FROM reservations WHERE owner=? AND workspace=? AND task=? AND claim_id=? AND action=?',...this.#keys(c,input.taskRef),a.claim_id,a.action))fail('STALE_CLAIM');
    const execution=this.#auto(c,'execution',w.claimRef);
    if(!execution||execution.taskRef!==input.taskRef||execution.actionRef!==a.action||execution.actionDigest!==a.digest||execution.claimRef!==w.claimRef||execution.generationRef!==w.generationRef)fail('SPEC_MISMATCH');
    if(operation==='captureNormalNativeResult'||operation==='captureNormalNativeAuditResult'){
      const base=this.#captureBase(c,input),producer=operation==='captureNormalNativeResult';
      if(producer!== (base.intent.purpose==='producer')||input.executionRef!==execution.executionRef||producer&&(input.actionRef!==a.action||input.actionDigest!==a.digest||input.version!==1))fail('SPEC_MISMATCH');
      const captureRef=canonicalDigest(['df.normal-native.capture/v1',c.ownerRef,c.workspaceRef,input.taskRef,w.claimRef,input.executionRef]);
      return !this.#auto(c,'normal_native_capture',captureRef)&&(producer||!this.#auto(c,'audit_result',input.executionRef));
    }
    if(operation==='writeNormalNativeRepairArtifact'){
      const output=this.#auto(c,'normal_native_capture',ref(input.outputCaptureRef));ref(input.artifactRef);integer(input.version,1);
      if(!output||output.phase!=='output'||output.purpose!=='audit_repair'||output.taskRef!==input.taskRef||output.claimRef!==w.claimRef||output.generationRef!==w.generationRef||output.actionRef!==a.action||output.actionDigest!==a.digest||output.executionRef!==execution.executionRef||execution.resultRef!==output.auditBinding.resultRef||output.auditBinding.artifactTarget?.artifactRef!==input.artifactRef||output.auditBinding.artifactTarget?.version!==input.version)fail('AUDIT_BINDING_MISMATCH');
      if(typeof input.content!=='string'||!input.content.isWellFormed())fail('INVALID_INPUT');if(hash(input.content)!==output.resultDigest)fail('SPEC_MISMATCH');
      const current=this.#artifact(c,input.taskRef,input.artifactRef);if(input.version!==(current?current.version+1:1))fail('STALE_ARTIFACT');
      const captureRef=canonicalDigest(['df.normal-native.repair-artifact/v1',c.ownerRef,c.workspaceRef,input.taskRef,w.claimRef,execution.executionRef,input.artifactRef,input.version]);
      return !this.#auto(c,'normal_native_capture',captureRef);
    }
    const q=ownerFinishRequest(input.ownerRequest),capture=this.#auto(c,'normal_native_capture',ref(input.captureRef));this.#cas(c,q);exact(input.usage,['state','units']);integer(input.usage.units);
    if(q.taskRef!==input.taskRef||q.actionRef!==a.action||q.claimRef!==w.claimRef||q.generationRef!==w.generationRef||q.executionRef!==execution.executionRef||input.executionRef!==execution.executionRef||!capture||capture.phase!=='output'||capture.taskRef!==input.taskRef||capture.claimRef!==w.claimRef||capture.generationRef!==w.generationRef||capture.executionRef!==execution.executionRef||capture.actionRef!==a.action||capture.actionDigest!==a.digest||input.usage.state!=='actual'||input.usage.units!==capture.usageUnits||w.phase!=='stopped'||w.terminalEvidenceRef!==ref(input.terminalEvidenceRef))fail('WORKER_FINISH_UNAVAILABLE');
    return !this.#auto(c,'normal_native_finish',w.claimRef);
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
    if(![...DATA_KINDS,...NATIVE_DATA_KINDS,OWNER_FINISH_INTENT_KIND].includes(input.kind)||typeof input.content!=='string'||!input.content.isWellFormed())fail('INVALID_INPUT');
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
      if(!DATA_KINDS.includes(input.kind))fail('UNAUTHORIZED');
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
    if(NATIVE_DATA_KINDS.includes(m.kind)||m.kind===OWNER_FINISH_INTENT_KIND)fail('UNAUTHORIZED');
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
      if(![...DATA_KINDS,...NATIVE_DATA_KINDS,OWNER_FINISH_INTENT_KIND].includes(metadata.kind)||metadata.recordRef!==row.id||metadata.digest!==row.digest||metadata.kind!==row.kind||row.owner!==c.ownerRef||row.workspace!==c.workspaceRef||row.nonce.length!==12||row.tag.length!==16||row.ciphertext.length!==metadata.byteLength)fail('STORAGE_INVALID');
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
    return this.#listData(c,input);
  }
  #listData(c,input){
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
  #planEffect(c,input,spec,normal=false){
      if(!normal&&(spec.nativeOriginBinding||spec.resumeBinding))fail('UNAUTHORIZED');
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
  }
  planAction(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','spec']);
    const spec=normalizedSpec(input.spec);
    return this.#mut(handle,input,OWNER,'planAction',c=>this.#planEffect(c,input,spec)
    );
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
  claimAction(handle,input){return this.#claimAction(handle,input,false);}
  claimLocalDelivery(handle,input){
    exact(input,['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch','delivery']);
    exact(input.delivery,['deliveryRef']);
    return this.#claimAction(handle,input,true);
  }
  #claimEffect(c,input,normal=false,local=false){
      const t=this.#cas(c,input),a=this.#action(c,t.id,input.actionRef),keys=this.#keys(c,t.id),at=this.#now(),policy=this.#getPolicy(c);
      if(!normal&&(a.spec.nativeOriginBinding||a.spec.resumeBinding))fail('UNAUTHORIZED');
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
        if(kind==='delivery'){
          const latest=this.#artifact(c,t.id,record.artifactRef);
          if(!latest||latest.version!==record.artifactVersion||latest.digest!==record.digest||latest.verification?.verdict!=='accepted')fail('ARTIFACT_UNVERIFIED');
          const normalPolicy=record.notification&&this.#auto(c,'notification_policy',record.notification.policyRef)?.markerRef;
          // Only this typed path or a sticky normal policy invokes the normal
          // source-derived publication predicate. An unmarked advanced none
          // executor retains its original claim semantics and signed receipts.
          if(local||normalPolicy)this.#localPublicationMaterial(c,t.id,record,a);
          if(record.notification)notificationAdmission=this.#notificationAdmission(c,t.id,record,at);
        }
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
  }
  #claimAction(handle,input,local){
    exact(input,['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch','outbox','delivery','auditRepair'],['taskRef','actionRef','actionDigest','commandRef','expectedTaskVersion','expectedAuthEpoch']);
    if([input.outbox,input.delivery,input.auditRepair].filter(Boolean).length>1)fail('INVALID_INPUT');
    if(input.outbox)exact(input.outbox,['messageRef']);
    if(input.delivery)exact(input.delivery,['deliveryRef']);
    if(input.auditRepair)exact(input.auditRepair,['auditRef','round','previousReportRef','evidenceRef']);
    const result=this.#mut(handle,input,DISPATCH,local?'claimLocalDelivery':'claimAction',c=>this.#claimEffect(c,input,false,local)
    );
    this.#cut('after_claim');
    return result;
  }
  assertClaimCurrent(handle,input){
    exact(input,['taskRef','claimRef','generationRef','actionDigest']);
    const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      this.#validateNormalScopes();
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
    return this.#ledger.transaction(()=>{
      this.#validateNormalScopes();const {a,t,w}=this.#claim(c,input),m=this.#record(c,input.taskRef,'message',input.messageRef);if(m.state!=='outbox_committed'||m.claimRef!==input.claimRef||m.reservationRef!==ref(input.reservationRef)||m.generationRef!==input.generationRef||m.targetDigest!==a.spec.targetDigest||m.bodyDigest!==a.spec.dataDigest||a.claim_epoch!==t.auth_epoch||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active'||['cancel_requested','recovery_required'].includes(t.status))fail('CLAIM_REVOKED');const g=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);if(!g||g.revoked||g.auth_epoch!==t.auth_epoch||this.#now()>=g.expires_at)fail('APPROVAL_INVALID');return{messageRef:m.messageRef,claimRef:w.claimRef,actionDigest:a.digest,reservationRef:w.reservationRef,task:taskRecord(t)};});
  }
  assertWorkerOwned(handle,input){
    exact(input,['taskRef','workerClaimRef','generationRef','sessionRef']);ref(input.sessionRef);const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      this.#validateNormalScopes();const {a,t,w}=this.#claim(c,{...input,claimRef:input.workerClaimRef});if(w.sessionRef!==input.sessionRef||!['created','ready','running'].includes(w.phase)||!['running','blocked','waiting'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active')fail('WORKER_UNAVAILABLE');const grant=this.#ledger.one('SELECT revoked FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action);if(!grant||grant.revoked)fail('CLAIM_REVOKED');return{task:taskRecord(t),claimRef:w.claimRef,generationRef:w.generationRef,sessionRef:w.sessionRef,actionDigest:a.digest};});
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
  #settleEffect(c,input,normal=false,normalRoleComplete=true){
      this.#refuseGenericClaimEffect(c,input,normal);
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
      const release=input.outcome!=='unknown'&&!!w.terminalEvidenceRef&&obligations.length===0&&w.handoff?.state!=='pending'&&(!normal||normalRoleComplete);
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
    return this.#mut(handle,input,HOST,'settleAction',c=>this.#settleEffect(c,input)
    ,input.outcome!=='unknown'?'terminal':false);
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
  #artifactEffect(c,input,normal=false){
      if(input.producerClaimRef)this.#refuseGenericClaimEffect(c,{...input,claimRef:input.producerClaimRef},normal);const task=this.#cas(c,input),current=this.#artifact(c,input.taskRef,input.artifactRef);if(input.version!==(current?current.version+1:1))fail('STALE_ARTIFACT');if(c.role==='worker'&&(input.generationRef!==c.generationRef||!input.producerClaimRef))fail('UNAUTHORIZED');if(input.producerClaimRef)this.#claim(c,{...input,claimRef:input.producerClaimRef});const t=this.#update(task,task.status,'progress');this.#managed(t);const data=this.#data(c,t,{kind:'artifact',content:input.content,sourceRef:input.artifactRef,commandRef:input.commandRef});const result=this.#newRecord(c,t.id,'artifact',canonicalDigest({artifactRef:input.artifactRef,version:input.version}),{artifactRef:input.artifactRef,version:input.version,recordRef:data.recordRef,digest:data.digest,producerClaimRef:input.producerClaimRef||null,generationRef:input.generationRef||null,producerRef:c.principalRef,verification:null});return{...result,task:taskRecord(t)};
  }
  writeArtifact(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','artifactRef','version','content','producerClaimRef','generationRef'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','artifactRef','version','content']);ref(input.artifactRef);integer(input.version,1);
    return this.#mut(handle,input,['owner','coordinator','worker'],'writeArtifact',c=>this.#artifactEffect(c,input));
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
  configureNotificationPolicy(handle,input){return this.#configureNotification(handle,input,false);}
  configureLocalNotificationPolicy(handle,input){return this.#configureNotification(handle,input,true);}
  #configureNotification(handle,input,local){
    exact(input,['commandRef','policyRef','expectedRevision','spec']);
    ref(input.policyRef);integer(input.expectedRevision);
    const spec=this.#notificationSpec(input.spec);
    return this.#mut(handle,input,['owner'],local?'configureLocalNotificationPolicy':'configureNotificationPolicy',c=>{
      const old=this.#auto(c,'notification_policy',input.policyRef);
      if((old?.revision||0)!==input.expectedRevision)fail('STALE_NOTIFICATION_POLICY');
      if(!old&&this.#autoCount(c,'notification_policy')>=16)fail('NOTIFICATION_LIMIT');
      if(!local&&old?.markerRef)fail('NORMAL_POLICY_REQUIRED');
      const markerRef=local?input.policyRef:old?.markerRef;
      if(local)this.#saveAuto(c,'local_notification_policy',markerRef,null,{contractVersion:'df.local-notification-policy/v1',policyRef:input.policyRef,localReportOnly:true});
      const policy=this.#saveAuto(c,'notification_policy',input.policyRef,null,{policyRef:input.policyRef,revision:input.expectedRevision+1,spec,...(markerRef?{markerRef}:{})});
      if(local)this.#refreshNormalRegistry(c);return policy;
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
    if(policy.markerRef)this.#normalNotificationManifest(c,task,delivery);
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
    const facts=progress.map(record=>({id:canonicalDigest({...endpoint,digest:policy.markerRef?this.#localProgress(c,task,record.progressRef).report.progressDigest:record.digest}),record}));
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
    return{binding,groupId,facts,windowId,windowStart,count,normal:!!policy.markerRef};
  }
  #commitNotification(c,task,delivery,admission,claimRef,reservationRef,at){
    const {binding,groupId,facts,windowId,windowStart,count}=admission;
    const ownership={taskRef:task,deliveryRef:delivery.deliveryRef,claimRef,reservationRef,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef,policyRef:binding.policyRef,policyRevision:binding.policyRevision,claimedAt:at};
    this.#saveAuto(c,'notification_claim',delivery.deliveryRef,task,{...ownership,groupId,factIds:facts.map(fact=>fact.id)});
    this.#saveAuto(c,'notification_window',windowId,null,{policyRef:binding.policyRef,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef,windowStart,count:count+1,lastClaimAt:at});
    this.#saveAuto(c,'notification_group',groupId,task,{...ownership,mergeKeyRef:binding.mergeKeyRef,progressRefs:[...binding.progressRefs]});
    for(const {id,record} of facts)this.#saveAuto(c,'notification_fact',id,task,{...ownership,progressRef:record.progressRef,digest:admission.normal?this.#localProgress(c,task,record.progressRef).report.progressDigest:record.digest});
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
      const t=this.#task(c,input.taskRef),keys=this.#keys(c,t.id),data=this.#listData(c,input),actions=this.#ledger.query('SELECT r.action FROM runtime_actions r WHERE owner=? AND workspace=? AND task=?',...keys).map(r=>{
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
  #normalScopes(){
    const scopes=new Map();
    for(const table of ['runtime_commands','runtime_tasks','runtime_policy','workspace_memory','automation_records'])for(const row of this.#ledger.query(`SELECT DISTINCT owner,workspace FROM ${table}`))scopes.set(row.owner+row.workspace,{ownerRef:row.owner,workspaceRef:row.workspace});
    return [...scopes.values()];
  }
  #normalIndex(c){
    const ids=kind=>this.#ledger.query('SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind=? ORDER BY id',c.ownerRef,c.workspaceRef,kind).map(row=>row.id);
    const policies=ids('local_notification_policy'),pairs=ids('local_source_pair');
    const reports=ids('local_report').map(id=>{
      const value=this.#auto(c,'local_report',id);
      return{taskRef:value.taskRef,progressRef:value.progressRef,localReportRef:id};
    }).sort((a,b)=>a.taskRef.localeCompare(b.taskRef)||a.progressRef.localeCompare(b.progressRef)||a.localReportRef.localeCompare(b.localReportRef));
    if(policies.length>16||pairs.length>128||reports.length>this.#limits.maxCommands)fail('STORAGE_INVALID');
    // Internal bounded index hashing preserves canonical array bytes without
    // widening the public authority canonicalizer's128-element input limit.
    const digest=values=>hash('['+values.map(value=>canonical(value)).join(',')+']');
    return{contractVersion:'df.normal-provenance/v1',localPolicyCount:policies.length,localPolicyDigest:digest(policies),localPairCount:pairs.length,localPairDigest:digest(pairs),localReportCount:reports.length,localReportDigest:digest(reports)};
  }
  #ensureNormalRegistry(c){
    if(this.#ledger.one('PRAGMA user_version').user_version<6)return;
    const registry=this.#auto(c,'normal_provenance_registry',c.workspaceRef);
    if(registry){this.#validateNormalScope(c);return;}
    const expected=this.#normalIndex(c);
    if(expected.localPolicyCount||expected.localPairCount||expected.localReportCount||this.#ledger.one('SELECT 1 FROM runtime_commands WHERE owner=? AND workspace=? LIMIT 1',c.ownerRef,c.workspaceRef))fail('STORAGE_INVALID');
    this.#saveAuto(c,'normal_provenance_registry',c.workspaceRef,null,expected);
  }
  #initializeNormalRegistries(){
    for(const c of this.#normalScopes()){
      if(this.#auto(c,'normal_provenance_registry',c.workspaceRef))fail('SCHEMA_UNSUPPORTED');
      const index=this.#normalIndex(c);
      if(index.localPolicyCount||index.localPairCount||index.localReportCount)fail('SCHEMA_UNSUPPORTED');
      this.#saveAuto(c,'normal_provenance_registry',c.workspaceRef,null,index);
    }
  }
  #refreshNormalRegistry(c){
    if(!this.#auto(c,'normal_provenance_registry',c.workspaceRef))fail('STORAGE_INVALID');
    this.#saveAuto(c,'normal_provenance_registry',c.workspaceRef,null,this.#normalIndex(c));
  }
  #validateNormalScopes(){
    this.#validate7Scopes();
    if(this.#ledger.one('PRAGMA user_version').user_version<6)return;
    for(const c of this.#normalScopes())this.#validateNormalScope(c);
  }
  #validateNormalScope(c){
    if(this.#ledger.one('PRAGMA user_version').user_version<6)return;
    const registry=this.#auto(c,'normal_provenance_registry',c.workspaceRef),index=this.#normalIndex(c);
    if(!registry){
      for(const table of ['runtime_commands','runtime_tasks','runtime_policy','workspace_memory','automation_records'])if(this.#ledger.one(`SELECT 1 FROM ${table} WHERE owner=? AND workspace=? LIMIT 1`,c.ownerRef,c.workspaceRef))fail('STORAGE_INVALID');
      return;
    }
    try{
      exact(registry,['contractVersion','localPolicyCount','localPolicyDigest','localPairCount','localPairDigest','localReportCount','localReportDigest']);
      if(canonical(registry)!==canonical(index))fail('STORAGE_INVALID');
      // Authentic acknowledged normal commands retain sticky ownership even
      // if an old valid generic body/pointer is replayed alongside a stripped
      // graph. Historical revisions need not equal the latest revision.
      for(const row of this.#ledger.query("SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND operation IN ('configureLocalSubscription','configureLocalNotificationPolicy')",c.ownerRef,c.workspaceRef)){
        const receipt=this.#commandReceipt(row);
        if(row.operation==='configureLocalSubscription'){
          const pair=receipt.pair,subscription=receipt.subscription;
          if(!pair||!subscription||pair.pairRef!==subscription.localPairRef||pair.subscriptionRef!==subscription.subscriptionRef||pair.sourceRef!==subscription.sourceRef||!this.#auto(c,'local_source_pair',pair.pairRef))fail('STORAGE_INVALID');
        }else{
          if(!receipt.markerRef||receipt.markerRef!==receipt.policyRef||!this.#auto(c,'local_notification_policy',receipt.markerRef))fail('STORAGE_INVALID');
        }
      }
      for(const row of this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='local_notification_policy'",c.ownerRef,c.workspaceRef)){
        const marker=this.#auto(c,'local_notification_policy',row.id);exact(marker,['contractVersion','policyRef','localReportOnly']);
        if(marker.contractVersion!=='df.local-notification-policy/v1'||marker.policyRef!==row.id||marker.localReportOnly!==true)fail('STORAGE_INVALID');
        const policy=this.#auto(c,'notification_policy',row.id);
        if(!policy||policy.markerRef!==row.id)fail('STORAGE_INVALID');
      }
      for(const row of this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='notification_policy'",c.ownerRef,c.workspaceRef)){
        const policy=this.#auto(c,'notification_policy',row.id);
        if(policy.markerRef!==undefined&&(policy.markerRef!==row.id||!this.#auto(c,'local_notification_policy',policy.markerRef)))fail('STORAGE_INVALID');
      }
      for(const row of this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='local_source_pair'",c.ownerRef,c.workspaceRef))this.#localPair(c,row.id);
      for(const row of this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='subscription'",c.ownerRef,c.workspaceRef)){
        const subscription=this.#auto(c,'subscription',row.id);
        if(subscription.localPairRef!==undefined){const pair=this.#localPair(c,subscription.localPairRef);if(pair.subscriptionRef!==row.id)fail('STORAGE_INVALID');}
      }
      const commands=this.#localReportCommands(c);
      for(const id of commands.keys())if(!this.#auto(c,'local_report',id))fail('STORAGE_INVALID');
      for(const row of this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND kind='local_report'",c.ownerRef,c.workspaceRef))this.#localReport(c,row.id,commands);
      for(const row of this.#ledger.query("SELECT task,id FROM runtime_records WHERE owner=? AND workspace=? AND kind='progress'",c.ownerRef,c.workspaceRef)){
        const progress=this.#record(c,row.task,'progress',row.id);
        if(progress.localReportRef!==undefined){const report=this.#localReport(c,progress.localReportRef,commands);if(report.taskRef!==row.task||report.progressRef!==row.id)fail('STORAGE_INVALID');}
      }
    }catch{fail('STORAGE_INVALID');}
  }
  #localPair(c,id){
    const pair=this.#auto(c,'local_source_pair',ref(id));if(!pair)fail('STORAGE_INVALID');
    exact(pair,['contractVersion','pairRef','sourceRef','sourceRevision','sourceSpecDigest','subscriptionRef','subscriptionRevision','subscriptionSpecDigest']);
    for(const key of ['pairRef','sourceRef','sourceSpecDigest','subscriptionRef','subscriptionSpecDigest'])ref(pair[key]);
    integer(pair.sourceRevision,1);integer(pair.subscriptionRevision,1);
    if(pair.contractVersion!=='df.local-source-pair/v1'||pair.pairRef!==id||id!==canonicalDigest({sourceRef:pair.sourceRef,subscriptionRef:pair.subscriptionRef}))fail('STORAGE_INVALID');
    const source=this.#auto(c,'source',pair.sourceRef),subscription=this.#auto(c,'subscription',pair.subscriptionRef);
    if(!source||!subscription||subscription.sourceRef!==pair.sourceRef||subscription.localPairRef!==id||pair.sourceRevision>source.revision||pair.subscriptionRevision>subscription.revision)fail('STORAGE_INVALID');
    return pair;
  }
  #pairCurrent(pair,source,subscription){
    return pair.sourceRevision===source.revision&&pair.subscriptionRevision===subscription.revision&&pair.sourceSpecDigest===canonicalDigest(source.spec)&&pair.subscriptionSpecDigest===canonicalDigest(subscription.spec);
  }
  #requireLocalPair(c,source,subscription){
    if(!subscription.localPairRef)fail('EVENT_PAIR_MISSING');
    const pair=this.#localPair(c,subscription.localPairRef);
    if(!this.#pairCurrent(pair,source,subscription))fail('EVENT_PAIR_STALE');
    return pair;
  }
  readLocalSourcePair(handle,input){
    exact(input,['sourceRef','subscriptionRef']);ref(input.sourceRef);ref(input.subscriptionRef);
    const c=this.#ctx(handle,undefined,HOST);
    return this.#ledger.transaction(()=>{
      this.#validateNormalScope(c);
      const id=canonicalDigest(input),pair=this.#auto(c,'local_source_pair',id);
      if(!pair)return{pair:null,currentness:'missing'};
      const actual=this.#localPair(c,id),source=this.#auto(c,'source',input.sourceRef),subscription=this.#auto(c,'subscription',input.subscriptionRef);
      return{pair:actual,currentness:this.#pairCurrent(actual,source,subscription)?'current':'stale'};
    });
  }
  ingestLocalOwnerEvent(handle,input){
    const required=['commandRef','sourceRef','subscriptionRef','expectedSourceRevision','expectedSubscriptionRevision','adapterRef','permissionPolicyRef','providerRef','sourceIdentityRef','eventIdRef','goal'];
    exact(input,[...required,'taskId','targetTaskRef','expectedTaskVersion','expectedAuthEpoch'],required);
    for(const key of ['sourceRef','subscriptionRef','adapterRef','permissionPolicyRef','providerRef','sourceIdentityRef','eventIdRef'])ref(input[key]);
    if(typeof input.goal!=='string'||!input.goal.isWellFormed()||!input.goal.trim())fail('INVALID_INPUT');
    return this.#mut(handle,input,HOST,'ingestLocalOwnerEvent',c=>{
      const {source,subscription}=this.#eventBinding(c,input);this.#requireLocalPair(c,source,subscription);
      if(source.spec.kind!=='internal'||source.spec.identityMode!=='unique_id'||source.spec.adapterRef!==input.adapterRef||source.spec.permissionPolicyRef!==input.permissionPolicyRef)fail('ROUTE_MISMATCH');
      if(subscription.spec.route==='new_task'){
        if(input.taskId===undefined||input.targetTaskRef!==undefined||input.expectedTaskVersion!==undefined||input.expectedAuthEpoch!==undefined)fail('INVALID_INPUT');reference(input.taskId);
      }else{
        if(input.taskId!==undefined||input.targetTaskRef!==subscription.spec.targetTaskRef)fail('ROUTE_MISMATCH');
        ref(input.targetTaskRef);integer(input.expectedTaskVersion,1);integer(input.expectedAuthEpoch);
      }
      const origin={providerRef:input.providerRef,sourceIdentityRef:input.sourceIdentityRef,eventRef:input.eventIdRef};
      const eventDigest=canonicalDigest({...origin,sourceRef:source.sourceRef,subscriptionRef:subscription.subscriptionRef,adapterRef:input.adapterRef,permissionPolicyRef:input.permissionPolicyRef,route:subscription.spec.route,goal:input.goal,...(input.taskId!==undefined?{taskId:input.taskId}:{targetTaskRef:input.targetTaskRef,expectedTaskVersion:input.expectedTaskVersion,expectedAuthEpoch:input.expectedAuthEpoch})});
      const old=this.#auto(c,'event',canonicalDigest(origin)),at=old?.observedAt??this.#now();
      return this.#ingestEvent(c,{commandRef:input.commandRef,sourceRef:source.sourceRef,subscriptionRef:subscription.subscriptionRef,expectedSourceRevision:source.revision,expectedSubscriptionRevision:subscription.revision,...origin,eventDigest,observedAt:at,receivedAt:old?.receivedAt??at,goal:input.goal,...(input.taskId!==undefined?{taskId:input.taskId}:{targetTaskRef:input.targetTaskRef,expectedTaskVersion:input.expectedTaskVersion,expectedAuthEpoch:input.expectedAuthEpoch})});
    });
  }
  readMemoryCommand(handle,input){
    exact(input,['namespaceRef','commandRef']);ref(input.namespaceRef);ref(input.commandRef);
    const c=this.#ctx(handle,undefined,['owner']);
    return this.#ledger.transaction(()=>{
      this.#validateNormalScope(c);
      const row=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,input.commandRef);
      if(!row)return null;
      // Authenticate the original row before classifying a legitimate collision.
      // Old nonmemory history is not returned or reconstructed as a receipt.
      const receipt=this.#commandReceipt(row,false,!['putMemory','deleteMemory'].includes(row.operation));
      if(!['putMemory','deleteMemory'].includes(row.operation))fail('IDEMPOTENCY_CONFLICT');
      if(receipt.namespaceRef!==input.namespaceRef)fail('IDEMPOTENCY_CONFLICT');
      return receipt;
    });
  }
  #localVerification(c,task,artifact){
    this.#validateArtifactVerification(c,task,artifact);
    const verification=artifact.verification;if(!verification)return null;
    if(!verification.resultRef)return{source:'unavailable',verdict:verification.verdict,reason:'PROVENANCE_UNAVAILABLE',evidenceRef:verification.evidenceRef??null};
    const report=this.#auto(c,'report',verification.reportRef);if(!report?.native)fail('STORAGE_INVALID');
    this.#validateNativeReport(c,report);
    const source=this.#auditResult(c,report.native.resultRef).association,material=this.#auditInput(c,source.inputRecordRef);
    if(material.artifactRef!==artifact.artifactRef||material.artifactVersion!==artifact.version||material.artifactDigest!==artifact.digest||report.reviewerRef===artifact.producerRef||artifact.generationRef!==null&&report.generationRef===artifact.generationRef)fail('STORAGE_INVALID');
    // Historical provenance stays factual. Current suitability is evaluated
    // separately against current audit/material/semantic facts under the lock.
    return{source:'native',auditRef:report.auditRef,auditRevision:report.auditRevision,round:report.round,reportRef:report.reportRef,bindingDigest:report.bindingDigest,materialDigest:report.materialDigest,resultRef:source.resultRef,recordRef:source.recordRef,digest:source.digest,claimRef:source.claimRef,generationRef:source.generationRef,sessionRef:source.sessionRef,executionRef:source.executionRef,inputDigest:source.inputDigest,reviewerRef:report.reviewerRef,verdict:verification.verdict,evidenceRef:report.evidenceRef};
  }
  readLocalArtifact(handle,input){
    exact(input,['taskRef','artifactRef','version','digest']);ref(input.taskRef);ref(input.artifactRef);ref(input.digest);integer(input.version,1);
    const c=this.#ctx(handle,input.taskRef,['owner']);
    return this.#ledger.transaction(()=>{
      this.#validateNormalScope(c);
      const artifact=this.#artifact(c,input.taskRef,input.artifactRef,input.version);if(!artifact)fail('RECORD_NOT_FOUND');
      if(artifact.digest!==input.digest)fail('DIGEST_MISMATCH');
      const {metadata,content}=this.#auditData(c,input.taskRef,artifact.recordRef);this.#readAllowed(c,metadata);
      if(metadata.kind!=='artifact'||metadata.digest!==artifact.digest||metadata.byteLength!==Buffer.byteLength(content))fail('STORAGE_INVALID');
      return{artifact:{...artifact,verificationBinding:this.#localVerification(c,input.taskRef,artifact)},data:{...metadata,content}};
    });
  }
  #localSourceStates(c,task,artifactRef){
    ref(artifactRef);
    const requirements=this.#ledger.query("SELECT id FROM automation_records WHERE owner=? AND workspace=? AND task=? AND kind='audit' ORDER BY id",...this.#keys(c,task)).filter(row=>this.#auto(c,'audit',row.id).artifactRef===artifactRef);
    if(requirements.length>16)fail('RECORD_LIMIT');
    return requirements.map(row=>{
      const req=this.#auto(c,'audit',row.id),report=req.reportRef?this.#auto(c,'report',req.reportRef):null;
      let currentness='current';try{this.#auditCurrent(c,req);}catch(error){if(['AUDIT_STALE','AUDIT_BINDING_MISMATCH'].includes(error.code))currentness='stale';else throw error;}
      if(report?.native)this.#validateNativeReport(c,report);
      return{auditRef:req.auditRef,auditRevision:req.auditRevision,round:req.round,bindingDigest:req.bindingDigest,materialDigest:req.materialDigest,semanticRevision:req.semanticRevision,material:req.material,policyRef:req.policyRef,blockingSeverities:req.blockingSeverities,maxRepairRounds:req.maxRepairRounds,state:req.state,currentness,report:report?{reportRef:report.reportRef,verdict:report.verdict,reviewerRef:report.reviewerRef,claimRef:report.claimRef,generationRef:report.generationRef,resultRef:report.native?.resultRef??null,coverageRefs:report.coverageRefs,unexaminedRefs:report.unexaminedRefs,findings:report.findings,evidenceRef:report.evidenceRef}:null,repair:req.pendingRepair?{claimRef:req.pendingRepair.claimRef,generationRef:req.pendingRepair.generationRef,round:req.pendingRepair.round,previousReportRef:req.pendingRepair.previousReportRef,evidenceRef:req.pendingRepair.evidenceRef}:null};
    });
  }
  #localAggregate(binding,sources,semantic){
    if(sources.some(s=>s.currentness==='stale'||s.semanticRevision!==semantic))return'stale';
    if(sources.some(s=>s.state==='pending'&&!s.report||s.report?.findings.some(f=>f.severity==='fatal'||s.blockingSeverities.includes(f.severity))))return'blocked';
    if(sources.some(s=>s.state==='budget_exhausted'||s.report?.verdict==='budget_exhausted'))return'budget_limited';
    if(sources.some(s=>s.report?.unexaminedRefs.length))return'unexamined';
    if(binding?.source==='unavailable'||binding?.verdict==='unknown'||sources.some(s=>s.state==='unknown'||s.report?.verdict==='unknown'||s.report&&s.report.resultRef===null))return'unknown';
    if(binding?.verdict==='rejected'||sources.some(s=>s.state==='failed'||s.report?.verdict==='failed'))return'failed';
    if(binding===null&&sources.length===0)return'not_run';
    if(binding?.source!=='native'||binding.verdict!=='accepted'||sources.some(s=>s.state!=='passed'||!s.report))return'unknown';
    const source=sources.find(s=>s.auditRef===binding.auditRef);
    if(!source||source.auditRevision!==binding.auditRevision||source.round!==binding.round||source.bindingDigest!==binding.bindingDigest||source.materialDigest!==binding.materialDigest||source.report.reportRef!==binding.reportRef||source.report.resultRef!==binding.resultRef)return'stale';
    return'passed';
  }
  #localStatement(c,task,id){
    const {metadata,content}=this.#auditData(c,task,ref(id));this.#readAllowed(c,metadata);
    if(!['context','clarification','constraints'].includes(metadata.kind)||metadata.auditInputRef)fail('INVALID_INPUT');
    return{recordRef:metadata.recordRef,digest:metadata.digest};
  }
  #localReportFacts(report){
    const normalize=value=>{
      if(Array.isArray(value)){const items=value.map(normalize);return items.sort((a,b)=>canonical(a).localeCompare(canonical(b)));}
      if(value&&typeof value==='object'){const out={};for(const [key,item] of Object.entries(value))if(!['observedSourceCAS','createdAt','observedAt','progressRef','recordRef','reportRef'].includes(key))out[key]=normalize(item);return out;}
      return value;
    };
    return canonicalDigest(normalize({kind:report.kind,originalGoal:report.originalGoal,statements:report.statements,artifact:report.artifact,semanticRevision:report.semanticRevision,verificationState:report.verificationState,verificationBinding:report.verificationBinding,sourceStates:report.sourceStates}));
  }
  writeLocalProgress(handle,input){
    exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','progressRef','kind','artifactRef','artifactVersion','digest','completedScopeRef','unfinishedRef','nextStepRef','blockerRefs']);
    for(const key of ['taskRef','commandRef','progressRef','artifactRef','digest','completedScopeRef','unfinishedRef','nextStepRef'])ref(input[key]);integer(input.artifactVersion,1);
    if(!['milestone','obstacle','question','final'].includes(input.kind))fail('INVALID_INPUT');canonical(input.blockerRefs);
    if(!Array.isArray(input.blockerRefs)||input.blockerRefs.length>16||new Set(input.blockerRefs).size!==input.blockerRefs.length)fail('INVALID_INPUT');input.blockerRefs.forEach(ref);
    return this.#mut(handle,input,['owner'],'writeLocalProgress',c=>{
      const task=this.#cas(c,input),artifact=this.#artifact(c,input.taskRef,input.artifactRef);
      if(!artifact||artifact.version!==input.artifactVersion||artifact.digest!==input.digest)fail('STALE_ARTIFACT');
      const goals=this.#ledger.query("SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND kind='goal'",...this.#keys(c,input.taskRef)).map(row=>this.#openData(c,row).metadata).sort((a,b)=>a.taskVersion-b.taskVersion||a.createdAt-b.createdAt||a.recordRef.localeCompare(b.recordRef));
      if(!goals.length)fail('RECORD_NOT_FOUND');
      const originalGoal={recordRef:goals[0].recordRef,digest:goals[0].digest};
      const statements={completedScope:this.#localStatement(c,task.id,input.completedScopeRef),unfinished:this.#localStatement(c,task.id,input.unfinishedRef),nextStep:this.#localStatement(c,task.id,input.nextStepRef),blockers:[...input.blockerRefs].sort().map(id=>this.#localStatement(c,task.id,id))};
      const semanticRevision=this.#semantic(c,task.id),verificationBinding=this.#localVerification(c,task.id,artifact),sourceStates=this.#localSourceStates(c,task.id,artifact.artifactRef),verificationState=this.#localAggregate(verificationBinding,sourceStates,semanticRevision),at=this.#now();
      const identity={artifactRef:artifact.artifactRef,version:artifact.version,recordRef:artifact.recordRef,digest:artifact.digest,producerRef:artifact.producerRef,producerClaimRef:artifact.producerClaimRef,generationRef:artifact.generationRef};
      const base={contractVersion:'df.local-progress/v1',ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:task.id,progressRef:input.progressRef,kind:input.kind,originalGoal,statements,artifact:identity,semanticRevision,observedSourceCAS:{taskVersion:task.version,authEpoch:task.auth_epoch},createdAt:at,verificationState,verificationBinding,sourceStates};
      const progressDigest=this.#localReportFacts(base);
      const verificationEvidence=verificationBinding?.source==='native'?[{evidenceRef:verificationBinding.evidenceRef,digest:verificationBinding.digest,observedAt:this.#auditResult(c,verificationBinding.resultRef).association.createdAt}]:[];
      const report={originalGoalRef:originalGoal.recordRef,completedScopeRef:statements.completedScope.recordRef,unfinishedRef:statements.unfinished.recordRef,nextStepRef:statements.nextStep.recordRef,verificationState,verificationEvidence,blockerRefs:statements.blockers.map(item=>item.recordRef),progressDigest};
      const t=this.#update(task,task.status,'progress'),data=this.#data(c,t,{kind:'progress',content:canonical(report),sourceRef:input.progressRef,commandRef:input.commandRef});
      const localReportRef=canonicalDigest({taskRef:t.id,progressRef:input.progressRef});
      const progress=this.#newRecord(c,t.id,'progress',input.progressRef,{progressRef:input.progressRef,recordRef:data.recordRef,digest:data.digest,kind:input.kind,generationRef:null,at,localReportRef});
      const localReport=this.#saveAuto(c,'local_report',localReportRef,t.id,{...base,recordRef:data.recordRef,digest:data.digest,progressDigest});
      this.#refreshNormalRegistry(c);return{progress,report,localReport,currentness:'current',task:taskRecord(t)};
    });
  }
  #localReportCommands(c){
    // Ephemeral validation index within this read/transaction, never a second
    // authority or a cache that can outlive the SQLite snapshot.
    const result=new Map();
    for(const row of this.#ledger.query("SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND operation='writeLocalProgress'",c.ownerRef,c.workspaceRef)){
      const receipt=this.#commandReceipt(row),report=receipt.localReport;
      if(!report||report.taskRef!==row.task)fail('STORAGE_INVALID');
      const id=canonicalDigest({taskRef:ref(report.taskRef),progressRef:ref(report.progressRef)});
      if(result.has(id))fail('STORAGE_INVALID');
      result.set(id,receipt);
    }
    return result;
  }
  #localReport(c,id,commands){
    const association=this.#auto(c,'local_report',ref(id));if(!association)fail('STORAGE_INVALID');
    try{
      exact(association,['contractVersion','ownerRef','workspaceRef','taskRef','progressRef','recordRef','digest','kind','originalGoal','statements','artifact','semanticRevision','observedSourceCAS','createdAt','verificationState','progressDigest','verificationBinding','sourceStates']);
      const a=association;
      if(a.contractVersion!=='df.local-progress/v1'||a.ownerRef!==c.ownerRef||a.workspaceRef!==c.workspaceRef||id!==canonicalDigest({taskRef:a.taskRef,progressRef:a.progressRef}))fail('STORAGE_INVALID');
      for(const key of ['taskRef','progressRef','recordRef','digest','progressDigest'])ref(a[key]);integer(a.semanticRevision,1);integer(a.createdAt,0,8640000000000000);
      exact(a.observedSourceCAS,['taskVersion','authEpoch']);integer(a.observedSourceCAS.taskVersion,1);integer(a.observedSourceCAS.authEpoch);
      if(!['milestone','obstacle','question','final'].includes(a.kind)||!['passed','failed','not_run','stale','unknown','unexamined','budget_limited','blocked'].includes(a.verificationState))fail('STORAGE_INVALID');
      const pair=value=>{exact(value,['recordRef','digest']);ref(value.recordRef);ref(value.digest);const data=this.#auditData(c,a.taskRef,value.recordRef);if(data.metadata.digest!==value.digest)fail('STORAGE_INVALID');return data.metadata;};
      if(pair(a.originalGoal).kind!=='goal')fail('STORAGE_INVALID');
      exact(a.statements,['completedScope','unfinished','nextStep','blockers']);
      if(!Array.isArray(a.statements.blockers)||a.statements.blockers.length>16||new Set(a.statements.blockers.map(b=>b.recordRef)).size!==a.statements.blockers.length)fail('STORAGE_INVALID');
      for(const selected of [a.statements.completedScope,a.statements.unfinished,a.statements.nextStep,...a.statements.blockers])if(!['context','clarification','constraints'].includes(pair(selected).kind))fail('STORAGE_INVALID');
      exact(a.artifact,['artifactRef','version','recordRef','digest','producerRef','producerClaimRef','generationRef']);
      for(const key of ['artifactRef','recordRef','digest','producerRef'])ref(a.artifact[key]);for(const key of ['producerClaimRef','generationRef'])if(a.artifact[key]!==null)ref(a.artifact[key]);integer(a.artifact.version,1);
      const artifact=this.#artifact(c,a.taskRef,a.artifact.artifactRef,a.artifact.version);
      if(!artifact||Object.entries(a.artifact).some(([key,value])=>artifact[key]!==value))fail('STORAGE_INVALID');
      if(!Array.isArray(a.sourceStates)||a.sourceStates.length>16||new Set(a.sourceStates.map(s=>s.auditRef)).size!==a.sourceStates.length)fail('STORAGE_INVALID');
      for(const state of a.sourceStates){
        exact(state,['auditRef','auditRevision','round','bindingDigest','materialDigest','semanticRevision','material','policyRef','blockingSeverities','maxRepairRounds','state','currentness','report','repair']);
        for(const key of ['auditRef','bindingDigest','materialDigest','policyRef'])ref(state[key]);integer(state.auditRevision,1);integer(state.semanticRevision,1);integer(state.round,0,8);integer(state.maxRepairRounds,0,8);
        if(!['pending','passed','failed','unknown','budget_exhausted'].includes(state.state)||!['current','stale'].includes(state.currentness)||!this.#auto(c,'audit',state.auditRef))fail('STORAGE_INVALID');
        if(!Array.isArray(state.material)||state.material.length>16||new Set(state.material.map(m=>m.recordRef)).size!==state.material.length||canonicalDigest(state.material)!==state.materialDigest||canonical(state.material)!==canonical([...state.material].sort((a,b)=>a.recordRef.localeCompare(b.recordRef))))fail('STORAGE_INVALID');
        state.material.forEach(pair);
        const versions=this.#ledger.query("SELECT id FROM runtime_records WHERE owner=? AND workspace=? AND task=? AND kind='artifact'",...this.#keys(c,a.taskRef)).map(row=>this.#record(c,a.taskRef,'artifact',row.id)).filter(item=>item.artifactRef===a.artifact.artifactRef);
        if(!versions.some(version=>state.material.some(m=>m.recordRef===version.recordRef&&m.digest===version.digest)))fail('STORAGE_INVALID');
        if(!Array.isArray(state.blockingSeverities)||state.blockingSeverities.length>4||new Set(state.blockingSeverities).size!==state.blockingSeverities.length||state.blockingSeverities.some(s=>!['fatal','blocking','warning','info'].includes(s)))fail('STORAGE_INVALID');
        if(state.report){
          exact(state.report,['reportRef','verdict','reviewerRef','claimRef','generationRef','resultRef','coverageRefs','unexaminedRefs','findings','evidenceRef']);
          const source=this.#auto(c,'report',state.report.reportRef);if(!source||source.auditRef!==state.auditRef||source.auditRevision!==state.auditRevision||source.round!==state.round||source.materialDigest!==state.materialDigest||source.bindingDigest!==state.bindingDigest)fail('STORAGE_INVALID');
          const expected={reportRef:source.reportRef,verdict:source.verdict,reviewerRef:source.reviewerRef,claimRef:source.claimRef,generationRef:source.generationRef,resultRef:source.native?.resultRef??null,coverageRefs:source.coverageRefs,unexaminedRefs:source.unexaminedRefs,findings:source.findings,evidenceRef:source.evidenceRef};
          if(canonical(expected)!==canonical(state.report))fail('STORAGE_INVALID');
          this.#reportFields(source);const union=[...source.coverageRefs,...source.unexaminedRefs];if(new Set(union).size!==union.length||canonical([...union].sort())!==canonical(state.material.map(m=>m.recordRef).sort()))fail('STORAGE_INVALID');
          if(source.native)this.#validateNativeReport(c,source);
        }
        if(state.repair){exact(state.repair,['claimRef','generationRef','round','previousReportRef','evidenceRef']);const source=this.#auto(c,'repair',state.repair.claimRef);if(!source||Object.entries(state.repair).some(([key,value])=>source[key]!==value)||source.auditRef!==state.auditRef)fail('STORAGE_INVALID');}
      }
      const binding=a.verificationBinding;
      if(binding){
        if(binding.source==='unavailable'){exact(binding,['source','verdict','reason','evidenceRef']);if(binding.reason!=='PROVENANCE_UNAVAILABLE'||!['accepted','rejected','unknown'].includes(binding.verdict))fail('STORAGE_INVALID');if(binding.evidenceRef!==null)ref(binding.evidenceRef);}
        else{
          exact(binding,['source','auditRef','auditRevision','round','reportRef','bindingDigest','materialDigest','resultRef','recordRef','digest','claimRef','generationRef','sessionRef','executionRef','inputDigest','reviewerRef','verdict','evidenceRef']);
          const report=this.#auto(c,'report',binding.reportRef),source=this.#auditResult(c,binding.resultRef).association;
          if(binding.source!=='native'||!report?.native)fail('STORAGE_INVALID');this.#validateNativeReport(c,report);
          const expected={source:'native',auditRef:report.auditRef,auditRevision:report.auditRevision,round:report.round,reportRef:report.reportRef,bindingDigest:report.bindingDigest,materialDigest:report.materialDigest,resultRef:source.resultRef,recordRef:source.recordRef,digest:source.digest,claimRef:source.claimRef,generationRef:source.generationRef,sessionRef:source.sessionRef,executionRef:source.executionRef,inputDigest:source.inputDigest,reviewerRef:report.reviewerRef,verdict:this.#nativeVerification(c,report).verdict,evidenceRef:report.evidenceRef};
          if(canonical(binding)!==canonical(expected))fail('STORAGE_INVALID');
        }
      }
      if(a.verificationState!==this.#localAggregate(binding,a.sourceStates,a.semanticRevision)||a.progressDigest!==this.#localReportFacts(a))fail('STORAGE_INVALID');
      const progress=this.#record(c,a.taskRef,'progress',a.progressRef);
      if(progress.localReportRef!==id||progress.recordRef!==a.recordRef||progress.digest!==a.digest||progress.kind!==a.kind||progress.at!==a.createdAt)fail('STORAGE_INVALID');
      const data=this.#auditData(c,a.taskRef,a.recordRef),report=parse(data.content);
      exact(report,['originalGoalRef','completedScopeRef','unfinishedRef','nextStepRef','verificationState','verificationEvidence','blockerRefs','progressDigest']);
      const verificationEvidence=binding?.source==='native'?[{evidenceRef:binding.evidenceRef,digest:binding.digest,observedAt:this.#auditResult(c,binding.resultRef).association.createdAt}]:[];
      const expected={originalGoalRef:a.originalGoal.recordRef,completedScopeRef:a.statements.completedScope.recordRef,unfinishedRef:a.statements.unfinished.recordRef,nextStepRef:a.statements.nextStep.recordRef,verificationState:a.verificationState,verificationEvidence,blockerRefs:a.statements.blockers.map(b=>b.recordRef),progressDigest:a.progressDigest};
      if(data.metadata.kind!=='progress'||data.metadata.sourceRef!==a.progressRef||data.metadata.digest!==a.digest||canonical(report)!==canonical(expected))fail('STORAGE_INVALID');
      const receipt=(commands||this.#localReportCommands(c)).get(id);
      if(!receipt||canonical(receipt.localReport)!==canonical(a)||canonical(receipt.progress)!==canonical(progress))fail('STORAGE_INVALID');
      return a;
    }catch{fail('STORAGE_INVALID');}
  }
  #localProgress(c,task,id){
    const progress=this.#record(c,task,'progress',ref(id));
    const data=this.#auditData(c,task,progress.recordRef);
    if(data.metadata.digest!==progress.digest||data.metadata.kind!=='progress')fail('STORAGE_INVALID');
    if(!progress.localReportRef)return{progress,report:null,localReport:null,currentness:'unverified'};
    const localReport=this.#localReport(c,progress.localReportRef);
    const artifact=this.#artifact(c,task,localReport.artifact.artifactRef),sources=this.#localSourceStates(c,task,localReport.artifact.artifactRef);
    const current=artifact?.version===localReport.artifact.version&&artifact?.digest===localReport.artifact.digest&&localReport.semanticRevision===this.#semantic(c,task)&&canonical(sources)===canonical(localReport.sourceStates)&&canonical(this.#localVerification(c,task,artifact))===canonical(localReport.verificationBinding)&&localReport.verificationState!=='stale';
    return{progress,report:parse(data.content),localReport,currentness:current?'current':'stale'};
  }
  readLocalProgress(handle,input){
    exact(input,['taskRef','progressRef']);ref(input.taskRef);ref(input.progressRef);
    const c=this.#ctx(handle,input.taskRef,['owner']);
    return this.#ledger.transaction(()=>{this.#validateNormalScope(c);return this.#localProgress(c,input.taskRef,input.progressRef);});
  }
  #localArtifactReady(c,task,artifact){
    const latest=this.#artifact(c,task,artifact.artifactRef),binding=this.#localVerification(c,task,artifact);
    if(!latest||latest.version!==artifact.version||latest.digest!==artifact.digest)fail('STALE_ARTIFACT');
    if(binding?.source!=='native'||binding.verdict!=='accepted')fail('PROVENANCE_UNAVAILABLE');
    const req=this.#auto(c,'audit',binding.auditRef);this.#auditCurrent(c,req);
    if(req.reportRef!==binding.reportRef||req.auditRevision!==binding.auditRevision||req.round!==binding.round||req.bindingDigest!==binding.bindingDigest||req.state!=='passed')fail('ARTIFACT_UNVERIFIED');
    this.#auditGate(c,task);return binding;
  }
  #normalNotificationManifest(c,task,delivery){
    const selected=[...delivery.notification.progressRefs].sort().map(id=>{
      const value=this.#localProgress(c,task,id);if(value.currentness!=='current')fail(value.currentness==='unverified'?'PROVENANCE_UNAVAILABLE':'PROGRESS_STALE');
      return{progressRef:id,digest:value.progress.digest,kind:value.progress.kind,report:value.report,localReport:value.localReport};
    });
    const manifest={version:'df.local-notification/v1',taskRef:task,ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,progress:selected};
    const artifact=this.#artifact(c,task,delivery.artifactRef);if(!artifact||artifact.version!==delivery.artifactVersion||artifact.digest!==delivery.digest)fail('STALE_ARTIFACT');
    const data=this.#auditData(c,task,artifact.recordRef),binding=this.#localArtifactReady(c,task,artifact);
    if(data.content!==canonical(manifest))fail('NOTIFICATION_BINDING_INVALID');
    const source=this.#auditInput(c,this.#auditResult(c,binding.resultRef).association.inputRecordRef);
    const covered=new Map(source.material.map(m=>[m.recordRef,m.digest]));
    // Reviewing a reference manifest alone does not certify its extra selected
    // statements. Their exact bytes must be in this charged review material.
    for(const item of selected)for(const pair of [item.localReport.originalGoal,item.localReport.statements.completedScope,item.localReport.statements.unfinished,item.localReport.statements.nextStep,...item.localReport.statements.blockers])if(covered.get(pair.recordRef)!==pair.digest)fail('COVERAGE_UNAVAILABLE');
    return manifest;
  }
  #localPublicationMaterial(c,task,delivery,action){
    if(action.spec.kind!=='write'||action.spec.role!=='worker'||action.spec.executor.mode!=='none'||action.spec.targetDigest!==delivery.targetDigest||action.spec.dataDigest!==delivery.digest||action.spec.charges.costState!=='estimated'||action.spec.charges.costEstimateMicros!==0||!action.spec.charges.costProvenanceRef)fail('LOCAL_ADMISSION_DENIED');
    const charges=action.spec.charges;
    if(action.spec.units>32||charges.runtimeMs<1||charges.runtimeMs>60000||charges.usageUnits<1||charges.usageUnits>100000000)fail('LOCAL_ADMISSION_DENIED');
    const artifact=this.#artifact(c,task,delivery.artifactRef);if(!artifact||artifact.version!==delivery.artifactVersion||artifact.digest!==delivery.digest)fail('STALE_ARTIFACT');
    this.#localArtifactReady(c,task,artifact);
    const {metadata,content}=this.#auditData(c,task,artifact.recordRef);
    if(metadata.kind!=='artifact'||metadata.digest!==delivery.digest)fail('STORAGE_INVALID');
    const bytes=Buffer.byteLength(canonical({taskRef:task,deliveryRef:delivery.deliveryRef,artifactRef:delivery.artifactRef,artifactVersion:delivery.artifactVersion,digest:delivery.digest,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef,content}));
    if(bytes>action.spec.charges.usageUnits)fail('BUDGET_LIMIT');
    if(delivery.notification){
      const policy=this.#auto(c,'notification_policy',delivery.notification.policyRef);if(!policy)fail('NOTIFICATION_POLICY_UNAVAILABLE');
      if(policy.markerRef)this.#normalNotificationManifest(c,task,delivery);
    }
    return{artifact,bytes};
  }
  #localClaimCurrent(c,input,delivery){
    const {a,w,t}=this.#claim(c,input);
    if(a.digest!==input.actionDigest||delivery.claimRef!==input.claimRef||delivery.generationRef!==input.generationRef||delivery.reservationRef!==w.reservationRef||a.claim_epoch!==t.auth_epoch||!['running','blocked','waiting'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active')fail('CLAIM_REVOKED');
    const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action),policy=this.#getPolicy(c);
    if(!grant||grant.revoked||grant.auth_epoch!==t.auth_epoch||grant.task_version!==a.metadata.plannedTaskVersion||grant.target_digest!==a.spec.targetDigest||grant.data_digest!==a.spec.dataDigest||grant.units!==a.spec.units||grant.kind!==a.spec.kind||this.#now()>=grant.expires_at)fail('APPROVAL_INVALID');
    const reservation=this.#ledger.one('SELECT * FROM reservations WHERE claim_id=?',a.claim_id);
    if(!reservation||reservation.owner!==c.ownerRef||reservation.workspace!==c.workspaceRef||reservation.task!==t.id||reservation.action!==a.action||reservation.units!==a.spec.units||w.claimRef!==reference(a.claim_id)||w.actionDigest!==a.digest||w.reservationRef!==canonicalDigest({claimRef:w.claimRef,actionDigest:a.digest}))fail('STORAGE_INVALID');
    if(policy.version!==a.spec.resourcePolicyVersion||!policy.modelPolicy||policy.modelPolicy.version!==a.spec.modelPolicyVersion)fail('STALE_POLICY');
    if(this.#ledger.one('SELECT coalesce(sum(units),0) AS n FROM reservations').n>policy.limits.maxActive)fail('ACTIVE_FULL');
    let allowed=false;try{allowed=this.#permission(Object.freeze({ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id,actionRef:a.action,actionDigest:a.digest,taskVersion:t.version,authEpoch:t.auth_epoch,spec:JSON.parse(canonical(a.spec))}))===true;}catch{fail('HOST_DENIED');}if(!allowed)fail('HOST_DENIED');
    this.#localPublicationMaterial(c,t.id,delivery,a);return{a,w,t};
  }
  #localNotificationOwned(c,task,delivery,at){
    const binding=delivery.notification,policy=this.#auto(c,'notification_policy',binding.policyRef);this.#notificationBinding(binding);
    if(!policy||!policy.spec.enabled)fail('NOTIFICATION_DISABLED');if(policy.revision!==binding.policyRevision)fail('STALE_NOTIFICATION_POLICY');
    const ownership=this.#auto(c,'notification_claim',delivery.deliveryRef);
    if(!ownership||ownership.claimRef!==delivery.claimRef||ownership.reservationRef!==delivery.reservationRef||ownership.policyRevision!==binding.policyRevision||ownership.policyRef!==binding.policyRef)fail('STORAGE_INVALID');
    const group=this.#auto(c,'notification_group',ownership.groupId);
    if(!group||group.deliveryRef!==delivery.deliveryRef||group.claimRef!==delivery.claimRef||group.reservationRef!==delivery.reservationRef||canonical(group.progressRefs)!==canonical(binding.progressRefs))fail('STORAGE_INVALID');
    if(policy.markerRef)this.#normalNotificationManifest(c,task,delivery);
    for(const id of ownership.factIds){const fact=this.#auto(c,'notification_fact',id);if(!fact||fact.deliveryRef!==delivery.deliveryRef||fact.claimRef!==delivery.claimRef||fact.reservationRef!==delivery.reservationRef)fail('STORAGE_INVALID');}
    const spec=this.#notificationSpec(policy.spec),progress=binding.progressRefs.map(id=>this.#record(c,task,'progress',id)),emergency=progress.some(p=>spec.emergencyKinds.includes(p.kind));
    if(progress.length>1&&progress.some(p=>!spec.mergeKinds.includes(p.kind)))fail('NOTIFICATION_MERGE_DENIED');
    if(!emergency&&progress.every(p=>spec.mergeKinds.includes(p.kind))&&at<Math.min(...progress.map(p=>p.at))+spec.mergeWindowMs)fail('NOTIFICATION_COALESCING');
    let minute;
    try{
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone:spec.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);
      minute=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
    }catch{fail('NOTIFICATION_CLOCK_INVALID');}
    if(!emergency&&spec.quietWindows.some(w=>w.startMinute<w.endMinute?minute>=w.startMinute&&minute<w.endMinute:minute>=w.startMinute||minute<w.endMinute))fail('NOTIFICATION_QUIET');
    // Its already committed window/frequency/resource ownership is validated,
    // never charged again and never treated as a conflicting pending group.
    const window=this.#auto(c,'notification_window',canonicalDigest({policyRef:binding.policyRef,recipientRef:delivery.recipientRef,channelRef:delivery.channelRef}));
    if(!window||window.count<1||window.lastClaimAt<ownership.claimedAt)fail('STORAGE_INVALID');
  }
  publishLocalDelivery(handle,input){
    const required=['taskRef','commandRef','deliveryRef','claimRef','generationRef','actionDigest','observedAt','evidenceRef'];exact(input,[...required,'notification'],required);
    for(const key of required.filter(k=>k!=='observedAt'))ref(input[key]);integer(input.observedAt,0,8640000000000000);
    if(input.notification){exact(input.notification,['policyRef','policyRevision']);ref(input.notification.policyRef);integer(input.notification.policyRevision,1);}
    return this.#mut(handle,input,HOST,'publishLocalDelivery',c=>{
      const delivery=this.#record(c,input.taskRef,'delivery',input.deliveryRef);
      if(delivery.state!=='outbox_committed')fail('ACTION_ALREADY_DISPATCHED');
      const {a}=this.#localClaimCurrent(c,input,delivery),now=this.#now();
      if(input.observedAt>now)fail('EVENT_CLOCK_INVALID');
      if(input.observedAt<a.updated_at)fail('STALE_OBSERVATION');
      if(!!input.notification!==!!delivery.notification||input.notification&&(input.notification.policyRef!==delivery.notification.policyRef||input.notification.policyRevision!==delivery.notification.policyRevision))fail('NOTIFICATION_BINDING_INVALID');
      if(delivery.notification)this.#localNotificationOwned(c,input.taskRef,delivery,now);
      const observation={state:'sent',evidenceRef:input.evidenceRef,permissionState:'allowed',openability:'unknown',observedAt:input.observedAt};
      const next=this.#appendLocalAccess(delivery,observation,'sent');this.#saveRecord(c,input.taskRef,'delivery',input.deliveryRef,next);return next;
    });
  }
  #appendLocalAccess(delivery,observation,state=delivery.state){
    const previous=delivery.observations.at(-1);
    if(previous&&(observation.observedAt<previous.observedAt||observation.observedAt===previous.observedAt&&canonical(observation)!==canonical(previous)))fail('STALE_OBSERVATION');
    if(previous&&canonical(observation)===canonical(previous))return delivery;
    const next={...delivery,state,observations:[...delivery.observations,observation],currentAccess:{permissionState:observation.permissionState,openability:'unknown'}};
    if(delivery.observations.length>=15||Buffer.byteLength(canonical(next))+512>this.#limits.maxMetadataBytes)fail('RECORD_LIMIT');return next;
  }
  recordLocalDeliveryAccess(handle,input){
    exact(input,['taskRef','commandRef','deliveryRef','artifactRef','artifactVersion','digest','recipientRef','channelRef','permissionState','observedAt','evidenceRef']);
    for(const key of ['taskRef','commandRef','deliveryRef','artifactRef','digest','recipientRef','channelRef','evidenceRef'])ref(input[key]);integer(input.artifactVersion,1);integer(input.observedAt,0,8640000000000000);
    if(!['allowed','denied','unknown'].includes(input.permissionState))fail('INVALID_INPUT');
    return this.#mut(handle,input,HOST,'recordLocalDeliveryAccess',c=>{
      const delivery=this.#record(c,input.taskRef,'delivery',input.deliveryRef);
      if(!delivery.claimRef||!['sent','unknown','failed','delivered'].includes(delivery.state))fail('DELIVERY_UNCONFIRMED');
      for(const key of ['artifactRef','artifactVersion','digest','recipientRef','channelRef'])if(input[key]!==delivery[key])fail('DIGEST_MISMATCH');
      const artifact=this.#artifact(c,input.taskRef,input.artifactRef,input.artifactVersion);if(!artifact||artifact.digest!==input.digest)fail('STORAGE_INVALID');
      const data=this.#auditData(c,input.taskRef,artifact.recordRef);if(data.metadata.kind!=='artifact'||data.metadata.digest!==input.digest)fail('STORAGE_INVALID');
      if(input.observedAt>this.#now())fail('EVENT_CLOCK_INVALID');
      const observation={state:delivery.state,evidenceRef:input.evidenceRef,permissionState:input.permissionState,openability:'unknown',observedAt:input.observedAt};
      const next=this.#appendLocalAccess(delivery,observation);this.#saveRecord(c,input.taskRef,'delivery',input.deliveryRef,next);return next;
    });
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
  configureSubscription(handle,input){return this.#configureSubscription(handle,input,false);}
  configureLocalSubscription(handle,input){return this.#configureSubscription(handle,input,true);}
  #configureSubscription(handle,input,local){
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
    return this.#mut(handle,input,['owner'],local?'configureLocalSubscription':'configureSubscription',c=>{
      const source=this.#auto(c,'source',input.sourceRef);
      if(!source||source.revision!==input.expectedSourceRevision)fail('STALE_SOURCE');
      const old=this.#auto(c,'subscription',input.subscriptionRef);
      if((old?.revision||0)!==input.expectedRevision)fail('STALE_SUBSCRIPTION');
      if(old&&old.sourceRef!==input.sourceRef)fail('ROUTE_MISMATCH');
      if(!old&&this.#autoCount(c,'subscription')>=128)fail('EVENT_LIMIT');
      if(s.route==='supplement')this.#task(c,s.targetTaskRef);
      const pairRef=local?canonicalDigest({sourceRef:input.sourceRef,subscriptionRef:input.subscriptionRef}):old?.localPairRef;
      const subscription=this.#saveAuto(c,'subscription',input.subscriptionRef,null,{
        subscriptionRef:input.subscriptionRef,sourceRef:input.sourceRef,revision:input.expectedRevision+1,spec:JSON.parse(canonical(s)),...(pairRef?{localPairRef:pairRef}:{})
      });
      if(!local)return subscription;
      const pair=this.#saveAuto(c,'local_source_pair',pairRef,null,{contractVersion:'df.local-source-pair/v1',pairRef,sourceRef:source.sourceRef,sourceRevision:source.revision,sourceSpecDigest:canonicalDigest(source.spec),subscriptionRef:subscription.subscriptionRef,subscriptionRevision:subscription.revision,subscriptionSpecDigest:canonicalDigest(subscription.spec)});
      this.#refreshNormalRegistry(c);return{subscription,pair};
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
    if(subscription.localPairRef)this.#requireLocalPair(c,source,subscription);
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
    return this.#mut(handle,input,HOST,'ingestEvent',c=>this.#ingestEvent(c,input));
  }
  #ingestEvent(c,input){
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
      if(!old||old.sourceRef!==input.sourceRef||old.subscriptionRef!==input.subscriptionRef||old.cursor!==input.expectedCursor||old.sourceRevision!==input.expectedSourceRevision||old.subscriptionRevision!==input.expectedSubscriptionRevision)fail('STALE_EVENT_CLOCK');
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
      this.#validateNormalScopes();
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
  readAuditInput(handle,input){
    exact(input,['taskRef','inputRecordRef']);
    ref(input.taskRef);ref(input.inputRecordRef);
    const c=this.#ctx(handle,input.taskRef,HOST);
    return this.#ledger.transaction(()=>{
      this.#validateNormalScopes();
      // This is an authenticated historical read, never fresh admission or
      // native origin. Validate the original graph before returning its bytes.
      const association=this.#auditInput(c,input.inputRecordRef);
      if(association.taskRef!==input.taskRef)fail('AUDIT_BINDING_MISMATCH');
      const {metadata,content}=this.#auditData(c,input.taskRef,input.inputRecordRef);
      this.#readAllowed(c,metadata);
      return {association,data:{...metadata,content}};
    });
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
      this.#validateNormalScopes();
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
    this.#normalExecutionAdmission(c,input);
    const{
      a,w,t
    }=this.#claim(c,input);
    if(a.digest!==ref(input.actionDigest)||a.claim_epoch!==t.auth_epoch||!['running','waiting','blocked'].includes(t.status)||this.#ledger.one('SELECT control FROM runtime_tasks WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id))?.control!=='active')fail('CLAIM_REVOKED');
    const grant=this.#ledger.one('SELECT * FROM grants WHERE owner=? AND workspace=? AND task=? AND action=?',...this.#keys(c,t.id),a.action),policy=this.#getPolicy(c);
    if(!grant||grant.revoked||grant.auth_epoch!==t.auth_epoch||grant.task_version!==a.metadata.plannedTaskVersion||grant.target_digest!==a.spec.targetDigest||grant.data_digest!==a.spec.dataDigest||grant.units!==a.spec.units||grant.kind!==a.spec.kind||this.#now()>=grant.expires_at)fail('APPROVAL_INVALID');
    const reservation=this.#ledger.one('SELECT * FROM reservations WHERE claim_id=?',a.claim_id);
    if(!reservation||reservation.owner!==c.ownerRef||reservation.workspace!==c.workspaceRef||reservation.task!==t.id||reservation.action!==a.action||reservation.units!==a.spec.units||w.claimRef!==reference(a.claim_id)||w.actionDigest!==a.digest||w.reservationRef!==canonicalDigest({claimRef:w.claimRef,actionDigest:a.digest}))fail('STORAGE_INVALID');
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
    if(a.spec.nativeOriginBinding||a.spec.resumeBinding)this.#requirePrepared(c,input.taskRef,input.contextRecordRef,true);
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
      this.#validateNormalScopes();
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
      this.#validateNormalScopes();
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
  #auditCaptureEffect(c,input,normal=false){
      this.#refuseGenericClaimEffect(c,input,normal);
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
  }
  captureAuditResult(handle,input){
    exact(input,['taskRef','commandRef','claimRef','generationRef','executionRef','sessionRef','inputCursor','cursor','content','evidenceRef']);
    for(const key of ['taskRef','commandRef','claimRef','generationRef','executionRef','sessionRef','evidenceRef'])ref(input[key]);
    integer(input.inputCursor);integer(input.cursor,input.inputCursor+1);
    if(typeof input.content!=='string'||!input.content.isWellFormed())fail('INVALID_INPUT');
    const bounds=this.#requireAuditBounds();
    if(Buffer.byteLength(input.content)>bounds.resultByteLimit)fail('INPUT_TOO_LARGE');
    return this.#mut(handle,input,HOST,'captureAuditResult',c=>this.#auditCaptureEffect(c,input)
    ,'terminal');
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
    this.#validateOwnerFinishIntentScopes();
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
    if(version<6&&this.#ledger.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'")){
      if(this.#ledger.one("SELECT 1 FROM automation_records WHERE kind IN ('local_source_pair','local_report','local_notification_policy','normal_provenance_registry') LIMIT 1"))fail('SCHEMA_UNSUPPORTED');
      for(const row of this.#ledger.query("SELECT payload FROM automation_records WHERE kind IN ('subscription','notification_policy')")){const value=parse(row.payload).data;if(value?.localPairRef!==undefined||value?.markerRef!==undefined)fail('SCHEMA_UNSUPPORTED');}
      for(const row of this.#ledger.query("SELECT payload FROM runtime_records WHERE kind='progress'"))if(parse(row.payload).localReportRef!==undefined)fail('SCHEMA_UNSUPPORTED');
    }
    this.#validateNormalScopes();
    if(version<7){for(const row of this.#ledger.query('SELECT spec FROM runtime_actions')){const spec=parse(row.spec);if(spec.nativeOriginBinding!==undefined||spec.resumeBinding!==undefined)fail('SCHEMA_UNSUPPORTED');}for(const row of this.#ledger.query('SELECT kind FROM runtime_data'))if(NATIVE_DATA_KINDS.includes(row.kind)||row.kind===OWNER_FINISH_INTENT_KIND)fail('SCHEMA_UNSUPPORTED');if(this.#ledger.one('SELECT 1 FROM runtime_commands WHERE operation=? LIMIT 1',OWNER_FINISH_INTENT_OPERATION))fail('SCHEMA_UNSUPPORTED');}
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
  // Capabilities confer only these normal methods, never generic principal authority.
  [PREPARATION_SOURCE](capability,handle,namespaceRef,taskRef){if(taskRef!==undefined)ref(taskRef);const c=this.#normalAuthority(capability,false,taskRef),binding=this.#ctx(handle,taskRef,OWNER);if(binding.ownerRef!==c.ownerRef||binding.workspaceRef!==c.workspaceRef||namespaceRef!==undefined&&ref(namespaceRef)!==c.namespaceRef)fail('UNAUTHORIZED');return{ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,namespaceRef:c.namespaceRef};}
  #bindNormalCapabilities(options){
    const bind=(entries,native)=>{array(entries,64);for(const entry of entries){exact(entry,native?['capability','ownerHandle','hostHandle','source']:['capability','ownerHandle','namespaceRef']);exact(entry.capability,[]);if(this.#capabilities.has(entry.capability)||this.#principals.has(entry.capability))fail('INVALID_CONFIG');const owner=this.#ctx(entry.ownerHandle,undefined,native?['owner']:OWNER);let binding={...owner,ownerHandle:entry.ownerHandle};if(native){const host=this.#ctx(entry.hostHandle,undefined,HOST);if(host.ownerRef!==owner.ownerRef||host.workspaceRef!==owner.workspaceRef)fail('INVALID_CONFIG');const source=stableSource(entry.source);binding={...binding,role:'host',hostHandle:entry.hostHandle,source,sourceRef:canonicalDigest(source)};binding.principalRef=canonicalDigest(['df.normal-native.observer/v1',owner.ownerRef,owner.workspaceRef,binding.sourceRef]);this.#native.set(entry.capability,Object.freeze(binding));}else{binding.namespaceRef=ref(entry.namespaceRef);binding.principalRef=canonicalDigest(['df.prepared-context.principal/v1',owner.ownerRef,owner.workspaceRef,binding.namespaceRef]);this.#preparation.set(entry.capability,Object.freeze(binding));}this.#capabilities.add(entry.capability);}};
    try{bind(options.preparationPrincipals??[],false);bind(options.nativeObservers??[],true);}catch{fail('INVALID_CONFIG');}
  }
  #normalAuthority(capability,native=false,taskRef){const c=(native?this.#native:this.#preparation).get(capability);if(!c)fail('UNAUTHORIZED');const owner=this.#ctx(c.ownerHandle,taskRef,native?['owner']:OWNER);if(owner.ownerRef!==c.ownerRef||owner.workspaceRef!==c.workspaceRef)fail('UNAUTHORIZED');if(native)this.#ctx(c.hostHandle,taskRef,HOST);this.#validate7Scope(c);return c;}
  #originalEffectAuthority(c,taskRef,host=false){ref(taskRef);const bound=this.#ctx(host?c.hostHandle:c.ownerHandle,taskRef,host?HOST:['owner']);if(bound.ownerRef!==c.ownerRef||bound.workspaceRef!==c.workspaceRef)fail('UNAUTHORIZED');return bound;}
  #normalTaskAuthority(c,taskRef){ref(taskRef);const owner=this.#ctx(c.ownerHandle,taskRef,c.hostHandle?['owner']:OWNER);if(owner.ownerRef!==c.ownerRef||owner.workspaceRef!==c.workspaceRef)fail('UNAUTHORIZED');if(c.hostHandle){const host=this.#ctx(c.hostHandle,taskRef,HOST);if(host.ownerRef!==c.ownerRef||host.workspaceRef!==c.workspaceRef)fail('UNAUTHORIZED');}}
  #normalMut(c,input,operation,fn,protectedOp=false){this.#normalTaskAuthority(c,input.taskRef);return this.#mut(null,input,null,operation,fn,protectedOp,c);}
  #normalRead(c,fn){return this.#ledger.guarded(()=>{this.#validate7Scope(c);return fn();});}
  #privateData(c,task,id,kind,digest){const row=this.#ledger.one('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=? AND id=?',...this.#keys(c,task),ref(id));if(!row)fail('STORAGE_INVALID');const opened=this.#openData(c,row);if(kind&&opened.metadata.kind!==kind||digest&&opened.metadata.digest!==digest)fail('STORAGE_INVALID');return {...opened.metadata,content:opened.content};}
  #nativeRows(c,kind){return this.#ledger.query('SELECT task,id FROM automation_records WHERE owner=? AND workspace=? AND kind=? ORDER BY task,id',c.ownerRef,c.workspaceRef,kind).map(row=>({id:row.id,taskRef:row.task,value:this.#auto(c,kind,row.id)}));}
  #newNative(c,kind,id,task,value){if(!NATIVE_KINDS.includes(kind)||this.#auto(c,kind,id))fail('IDEMPOTENCY_CONFLICT');const name={normal_native_intent:'NativeIntent',normal_native_origin:'NativeOrigin',normal_native_capture:'NativeCapture',normal_native_finish:'NativeFinish',normal_resume:'NativeResume',normal_resume_claim:'NativeResumeClaim'}[kind];payload(name,value);if(value.taskRef!==task)fail('STORAGE_INVALID');if(this.#ledger.one('SELECT count(*) AS n FROM automation_records WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,task)).n>=this.#limits.maxRecordsPerTask)fail('RECORD_LIMIT');this.#saveAuto(c,kind,id,task,value);this.#refresh7Registry(c,'normal_native_registry');return value;}
  #index7(c,kind){const members=kind==='prepared_context_registry'?this.#nativeRows(c,'prepared_context_check').map(r=>({taskRef:r.taskRef,contextRecordRef:r.value.contextRecordRef,contextDigest:r.value.contextDigest,checkRef:r.id})):NATIVE_KINDS.flatMap(kind=>this.#nativeRows(c,kind).map(r=>({kind,taskRef:r.taskRef,id:r.id})));members.sort((a,b)=>(a.kind??'').localeCompare(b.kind??'')||a.taskRef.localeCompare(b.taskRef)||(a.id??a.contextRecordRef).localeCompare(b.id??b.contextRecordRef));if(members.length>this.#limits.maxCommands+this.#limits.maxTasks*this.#limits.maxRecordsPerTask)fail('STORAGE_INVALID');return{contractVersion:kind==='prepared_context_registry'?'df.prepared-context-registry/v1':'df.normal-native-registry/v1',recordCount:members.length,recordDigest:hash('['+members.map(value=>canonical(value)).join(',')+']')};}
  #initialize7Registries(){for(const c of this.#normalScopes())for(const kind of ['prepared_context_registry','normal_native_registry']){if(this.#auto(c,kind,c.workspaceRef))fail('SCHEMA_UNSUPPORTED');const index=this.#index7(c,kind);if(index.recordCount)fail('SCHEMA_UNSUPPORTED');this.#saveAuto(c,kind,c.workspaceRef,null,index);}}
  #ensure7Registries(c){if(this.#ledger.one('PRAGMA user_version').user_version<7)return;for(const kind of ['prepared_context_registry','normal_native_registry'])if(!this.#auto(c,kind,c.workspaceRef)){const index=this.#index7(c,kind);if(index.recordCount||this.#ledger.one('SELECT 1 FROM runtime_commands WHERE owner=? AND workspace=? LIMIT 1',c.ownerRef,c.workspaceRef))fail('STORAGE_INVALID');this.#saveAuto(c,kind,c.workspaceRef,null,index);}}
  #refresh7Registry(c,kind){if(!this.#auto(c,kind,c.workspaceRef))fail('STORAGE_INVALID');this.#saveAuto(c,kind,c.workspaceRef,null,this.#index7(c,kind));}
  #validate7Scopes(){if(this.#ledger.one('PRAGMA user_version').user_version<7){if(this.#ledger.one("SELECT 1 FROM sqlite_schema WHERE name='automation_records'")&&this.#ledger.one("SELECT 1 FROM automation_records WHERE kind IN ('prepared_context_check','prepared_context_registry','normal_native_registry','normal_native_intent','normal_native_origin','normal_native_capture','normal_native_finish','normal_resume','normal_resume_claim') LIMIT 1"))fail('SCHEMA_UNSUPPORTED');return;}for(const c of this.#normalScopes())this.#validate7Scope(c);}
  #commandFor(c,id,operation,task){const row=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,id);if(!row||row.operation!==operation||row.task!==task)fail('STORAGE_INVALID');return this.#commandReceipt(row);}
  #validate7Scope(c){
    if(this.#ledger.one('PRAGMA user_version').user_version<7)return;
    try{
      for(const kind of ['prepared_context_registry','normal_native_registry']){const stored=this.#auto(c,kind,c.workspaceRef),index=this.#index7(c,kind);if(!stored){if(this.#normalScopes().some(s=>s.ownerRef===c.ownerRef&&s.workspaceRef===c.workspaceRef))fail('STORAGE_INVALID');return;}exact(stored,['contractVersion','recordCount','recordDigest']);if(canonical(stored)!==canonical(index))fail('STORAGE_INVALID');}
      for(const r of this.#nativeRows(c,'prepared_context_check')){if(r.value.taskRef!==r.taskRef)fail('STORAGE_INVALID');this.#preparedGraph(c,r.taskRef,r.value.contextRecordRef);}
      const seenCommands=new Set();
      for(const kind of NATIVE_KINDS)for(const row of this.#nativeRows(c,kind)){
        const v=row.value;payload({normal_native_intent:'NativeIntent',normal_native_origin:'NativeOrigin',normal_native_capture:'NativeCapture',normal_native_finish:'NativeFinish',normal_resume:'NativeResume',normal_resume_claim:'NativeResumeClaim'}[kind],v);if(v.taskRef!==row.taskRef)fail('STORAGE_INVALID');
        const command=this.#nativeCommand(c,kind,row.id);if(!command)fail('STORAGE_INVALID');seenCommands.add(command.id);
        const out=this.#commandReceipt(command);
        if(kind==='normal_native_intent'){
          if(v.intentRef!==row.id||v.claimRef!==row.id)fail('STORAGE_INVALID');const a=this.#action(c,v.taskRef,v.actionRef);if(a.digest!==v.actionDigest||a.metadata.claimRef!==v.claimRef||a.spec.executor.generationRef!==v.generationRef||a.spec.executor.sessionRef!==v.sessionRef||!a.spec.nativeOriginBinding)fail('STORAGE_INVALID');const cfg=canonicalContent(this.#privateData(c,v.taskRef,v.configurationRecordRef,'native_configuration',v.configurationDigest).content,x=>configuration(x,undefined,this.#limits));const identity=canonicalContent(this.#privateData(c,v.taskRef,v.identityRecordRef,'native_identity',v.identityDigest).content,x=>{exact(x,['nativeId']);text(x.nativeId,128);});if(identity.nativeId!=='df-'+v.generationRef||v.sourceRef!==canonicalDigest(cfg.source)||v.backendRef!==canonicalDigest(cfg.backend)||v.createConfigDigest!==v.configurationDigest||canonical(a.spec.nativeOriginBinding)!==canonical({sourceRef:v.sourceRef,createConfigDigest:v.createConfigDigest,backendRef:v.backendRef,sessionRef:v.sessionRef}))fail('STORAGE_INVALID');this.#validateIntentInput(c,v,a);if(out.receipt.claimRef!==v.claimRef||out.sessionRef!==v.sessionRef||out.identityRecordRef!==v.identityRecordRef)fail('STORAGE_INVALID');
        }else if(kind==='normal_native_origin'){
          if(v.originRef!==row.id)fail('STORAGE_INVALID');const intent=this.#auto(c,'normal_native_intent',v.intentRef);if(!intent||intent.taskRef!==v.taskRef||intent.claimRef!==v.claimRef||intent.generationRef!==v.generationRef||intent.sessionRef!==v.sessionRef)fail('STORAGE_INVALID');const h=canonicalContent(this.#privateData(c,v.taskRef,v.baselineHistoryRecordRef,'native_history',v.baselineHistoryDigest).content,historyObservation);this.#historyJoin(c,h,intent);if(h.messages.length!==0||out.originRef!==v.originRef||out.baselineHistoryRecordRef!==v.baselineHistoryRecordRef)fail('STORAGE_INVALID');
        }else if(kind==='normal_native_capture')this.#validateCapture(c,v,row.id,out);
        else if(kind==='normal_native_finish')this.#validateFinish(c,v,row.id,out,command);
        else if(kind==='normal_resume')this.#validateResume(c,v,row.id,out);
        else if(kind==='normal_resume_claim'){
          const resume=this.#auto(c,'normal_resume',v.resumeRef),a=this.#action(c,v.taskRef,v.actionRef);if(v.claimRef!==row.id||!resume||resume.taskRef!==v.taskRef||resume.originRef!==v.originRef||resume.predecessorClaimRef!==v.predecessorClaimRef||resume.sessionRef!==v.sessionRef||a.metadata.claimRef!==v.claimRef||a.digest!==v.actionDigest||a.metadata.reservationRef!==v.reservationRef||a.spec.resumeBinding?.resumeRef!==v.resumeRef||a.spec.executor.generationRef!==v.generationRef||out.receipt.claimRef!==v.claimRef||out.originRef!==v.originRef)fail('STORAGE_INVALID');
        }
      }
      const normalOps=['claimNormalCreate','recordNormalNativeOrigin','captureNormalNativeResult','captureNormalNativeAuditResult','writeNormalNativeRepairArtifact','finishNormalNativeExecution','planNormalResume','claimNormalResume'];
      for(const row of this.#ledger.query('SELECT * FROM runtime_commands WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef)){if(normalOps.includes(row.operation)&&!seenCommands.has(row.id))fail('STORAGE_INVALID');if(row.operation==='putPreparedContext'){const out=this.#commandReceipt(row),b=this.#auto(c,'prepared_context_check',out.checkRef);if(!b||b.commandRef!==row.id||b.taskRef!==row.task||b.contextRecordRef!==out.receipt.recordRef)fail('STORAGE_INVALID');}if(row.operation==='planNormalNativeAction'){const out=this.#commandReceipt(row),a=this.#action(c,row.task,out.actionRef);if(!a.spec.nativeOriginBinding||a.digest!==out.actionDigest)fail('STORAGE_INVALID');}}
      const privateOwners=new Map();
      const own=(id,kind,task,commandRef)=>{if(privateOwners.has(id))fail('STORAGE_INVALID');const data=this.#privateData(c,task,id,kind);if(id!==canonicalDigest({commandRef,kind}))fail('STORAGE_INVALID');privateOwners.set(id,{kind,task});};
      for(const row of this.#nativeRows(c,'prepared_context_check'))own(row.value.checkRecordRef,'context_check',row.taskRef,row.value.commandRef);
      for(const row of this.#nativeRows(c,'normal_native_intent')){const command=this.#nativeCommand(c,'normal_native_intent',row.id);own(row.value.identityRecordRef,'native_identity',row.taskRef,command.id);own(row.value.configurationRecordRef,'native_configuration',row.taskRef,command.id);}
      for(const row of this.#nativeRows(c,'normal_native_origin'))own(row.value.baselineHistoryRecordRef,'native_history',row.taskRef,this.#nativeCommand(c,'normal_native_origin',row.id).id);
      for(const row of this.#nativeRows(c,'normal_native_capture'))if(row.value.phase==='output')own(row.value.committedHistoryRecordRef,'native_history',row.taskRef,this.#nativeCommand(c,'normal_native_capture',row.id).id);
      for(const row of this.#nativeRows(c,'normal_resume')){const command=this.#nativeCommand(c,'normal_resume',row.id);own(row.value.historyRecordRef,'native_history',row.taskRef,command.id);own(row.value.inputRecordRef,'native_request',row.taskRef,command.id);own(row.value.configurationRecordRef,'native_configuration',row.taskRef,command.id);}
      for(const row of this.#ledger.query('SELECT id,kind,task FROM runtime_data WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef))if(NATIVE_DATA_KINDS.includes(row.kind)&&(!privateOwners.has(row.id)||privateOwners.get(row.id).kind!==row.kind||privateOwners.get(row.id).task!==row.task))fail('STORAGE_INVALID');
      for(const row of this.#ledger.query('SELECT action,task FROM runtime_actions WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef)){const a=this.#action(c,row.task,row.action);if(a.spec.nativeOriginBinding||a.spec.resumeBinding){const planned=this.#ledger.query('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,row.task)).some(r=>{if(!['planNormalNativeAction','planNormalResume'].includes(r.operation))return false;const out=this.#commandReceipt(r);return(out.action||out).actionRef===a.action;});if(!planned||a.metadata.claimRef&&!this.#auto(c,a.spec.resumeBinding?'normal_resume_claim':'normal_native_intent',a.metadata.claimRef))fail('STORAGE_INVALID');}}
      this.#validateOwnerFinishIntents(c);
    }catch{fail('STORAGE_INVALID');}
  }
  #nativeCommand(c,kind,id){const field={normal_native_intent:'receipt.claimRef',normal_native_origin:'originRef',normal_native_capture:'captureRef',normal_native_finish:'finishRef',normal_resume:'resumeRef',normal_resume_claim:'receipt.claimRef'}[kind],ops={normal_native_intent:['claimNormalCreate'],normal_native_origin:['recordNormalNativeOrigin'],normal_native_capture:['captureNormalNativeResult','captureNormalNativeAuditResult','writeNormalNativeRepairArtifact'],normal_native_finish:['finishNormalNativeExecution'],normal_resume:['planNormalResume'],normal_resume_claim:['claimNormalResume']}[kind];const rows=this.#ledger.query('SELECT * FROM runtime_commands WHERE owner=? AND workspace=?',c.ownerRef,c.workspaceRef).filter(row=>{if(!ops.includes(row.operation))return false;let receipt=this.#commandReceipt(row);for(const key of field.split('.'))receipt=receipt?.[key];return receipt===id;});if(rows.length!==1)return null;return rows[0];}
  #preparedGraph(c,task,contextRef){
    const rows=this.#nativeRows(c,'prepared_context_check').filter(r=>r.taskRef===task&&r.value.contextRecordRef===contextRef);
    if(rows.length!==1)fail('PREPARED_CONTEXT_UNAVAILABLE');
    const row=rows[0],binding=payload('PreparedBinding',row.value),context=this.#privateData(c,task,contextRef,'context',binding.contextDigest),checkData=this.#privateData(c,task,binding.checkRecordRef,'context_check',binding.checkDigest),check=canonicalContent(checkData.content,v=>payload('PreparedCheck',v)),result=this.#commandFor(c,binding.commandRef,'putPreparedContext',task);
    const shared=['checkRef','taskRef','contextRecordRef','contextDigest','commandRef','preparationPrincipalRef','preparationRequestDigest','selectionMode','checkedSetDigest','sourceTaskVersion','sourceAuthEpoch','committedTaskVersion','committedAuthEpoch','semanticRevision','generatedAt','method'];
    if(binding.taskRef!==task||row.taskRef!==task||binding.checkRef!==row.id||binding.contextRecordRef!==contextRef||binding.checkRef!==canonicalDigest(['df.prepared-context.check/v1',c.ownerRef,c.workspaceRef,task,contextRef,context.digest])||binding.preparationPrincipalRef!==canonicalDigest(['df.prepared-context.principal/v1',c.ownerRef,c.workspaceRef,binding.namespaceRef])||shared.some(key=>binding[key]!==check[key])||check.ownerRef!==c.ownerRef||check.workspaceRef!==c.workspaceRef||check.memory.namespaceRef!==binding.namespaceRef||check.memory.revision!==binding.memoryRevision)fail('STORAGE_INVALID');
    const envelope=parse(context.content);validateExecutionContext(envelope,{scope:{ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:task},maxTaskVersion:binding.sourceTaskVersion,maxAuthEpoch:binding.sourceAuthEpoch,maxGeneratedAt:binding.generatedAt});
    if(context.generationRef!==null||checkData.generationRef!==null||context.cryptoVersion!==2||checkData.cryptoVersion!==2||context.taskVersion!==binding.committedTaskVersion||context.authEpoch!==binding.committedAuthEpoch||checkData.taskVersion!==binding.committedTaskVersion||checkData.authEpoch!==binding.committedAuthEpoch||context.sourceTaskVersion!==binding.sourceTaskVersion||context.sourceAuthEpoch!==binding.sourceAuthEpoch||context.semanticRevision!==binding.semanticRevision||context.memoryNamespaceRef!==binding.namespaceRef||context.memoryRevision!==binding.memoryRevision||checkData.sourceRef!==binding.checkRef||envelope.sourceTaskVersion!==binding.sourceTaskVersion||envelope.sourceAuthEpoch!==binding.sourceAuthEpoch||envelope.generatedAt!==binding.generatedAt||envelope.memory.namespaceRef!==binding.namespaceRef||envelope.memory.revision!==binding.memoryRevision||envelope.ledgerSnapshotDigest!==check.ledgerSnapshotDigest)fail('STORAGE_INVALID');
    const receipt=result.receipt;
    if(result.checkRef!==binding.checkRef||!receipt||Object.keys(context).filter(key=>key!=='content').some(key=>canonical(receipt[key])!==canonical(context[key]))||receipt.task.ownerRef!==c.ownerRef||receipt.task.workspaceRef!==c.workspaceRef||receipt.task.taskRef!==task||receipt.task.version!==binding.committedTaskVersion||receipt.task.authEpoch!==binding.committedAuthEpoch)fail('STORAGE_INVALID');
    return{binding,check,context};
  }
  #preparedSources(c,task,selectionMode,refs){const records=this.#ledger.query('SELECT * FROM runtime_data WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,task)).filter(r=>['goal','constraints','context'].includes(r.kind)).map(r=>({...this.#openData(c,r).metadata,content:this.#openData(c,r).content})).filter(r=>r.generationRef===null&&!r.auditInputRef);const latest=kind=>records.filter(r=>r.kind===kind).sort((a,b)=>b.taskVersion-a.taskVersion||b.createdAt-a.createdAt||a.recordRef.localeCompare(b.recordRef))[0];const goal=latest('goal');if(!goal)fail('GOAL_UNAVAILABLE');const winners=[goal,...(latest('constraints')?[latest('constraints')]:[])].map(r=>({recordRef:r.recordRef,digest:r.digest,kind:r.kind})),summaries=[];for(const r of records.filter(r=>r.kind==='context')){const v=parse(r.content);if(v.materialKind==='current_instruction')winners.push({recordRef:r.recordRef,digest:r.digest,kind:'current_instruction'});if(v.materialKind==='summary'&&(selectionMode==='all_eligible'||refs.includes(r.recordRef)))summaries.push({recordRef:r.recordRef,digest:r.digest,sourceTaskVersion:v.sourceTaskVersion,sourceAuthEpoch:v.sourceAuthEpoch,generatedAt:v.generatedAt,sourceRefs:v.sourceRefs});}winners.sort((a,b)=>a.recordRef.localeCompare(b.recordRef));summaries.sort((a,b)=>a.recordRef.localeCompare(b.recordRef));if(winners.length>64||summaries.length>64)fail('INPUT_TOO_LARGE');return{winners,summaries};}
  #currentness(c,graph){const b=graph.binding,t=this.#task(c,b.taskRef),reasons=[],sources=this.#preparedSources(c,b.taskRef,b.selectionMode,graph.check.summaryChecks.map(r=>r.recordRef));if(this.#semantic(c,b.taskRef)!==b.semanticRevision)reasons.push('SEMANTIC_CHANGED');if(canonical(sources.winners)!==canonical(graph.check.winningSources))reasons.push('WINNING_SOURCE_CHANGED');if(canonical(sources.summaries.map(r=>r.recordRef))!==canonical(graph.check.summaryChecks.map(r=>r.recordRef)))reasons.push('CHECKED_SET_CHANGED');if(graph.check.summaryChecks.some(s=>!sources.summaries.some(r=>r.recordRef===s.recordRef&&r.digest===s.digest)))reasons.push('SOURCE_UNAVAILABLE');const memory=this.#memory(c,b.namespaceRef);if(memory?.deleted||(memory?.revision??0)!==b.memoryRevision)reasons.push('MEMORY_CHANGED');if(t.version!==b.committedTaskVersion||t.auth_epoch!==b.committedAuthEpoch)reasons.push('TASK_SNAPSHOT_CHANGED');return{instructionsCurrent:!reasons.some(r=>['SEMANTIC_CHANGED','WINNING_SOURCE_CHANGED','CHECKED_SET_CHANGED','SOURCE_UNAVAILABLE'].includes(r)),memoryCurrent:!reasons.includes('MEMORY_CHANGED'),taskSnapshotCurrent:!reasons.includes('TASK_SNAPSHOT_CHANGED'),reasonCodes:[...new Set(reasons)].sort()};}
  #requirePrepared(c,task,contextRef,current){const graph=this.#preparedGraph(c,task,contextRef);if(current){const status=this.#currentness(c,graph);if(!status.instructionsCurrent||!status.memoryCurrent)fail('CONTEXT_STALE');}return graph;}
  #preparedReceipt(raw,content){const v=parse(content);return{recordRef:raw.recordRef,digest:raw.digest,kind:'context',byteLength:raw.byteLength,cryptoVersion:2,sourceRef:raw.sourceRef,task:raw.task,sourceTaskVersion:raw.sourceTaskVersion,sourceAuthEpoch:raw.sourceAuthEpoch,memory:{namespaceRef:v.memory.namespaceRef,revision:v.memory.revision},inputCounts:v.inputCounts,retainedRefs:v.retainedRefs,droppedRefs:v.droppedRefs,verification:'module_prepared_execution_context_only'};}
  preparedContextCommandReceipt(capability,input){exact(input,['request']);const request=preparationRequest(input.request,this.#secrets),c=this.#normalAuthority(capability,false,request.taskRef);return this.#preparedCommandReceipt(c,request);}
  #preparedCommandReceipt(c,request){this.#normalTaskAuthority(c,request.taskRef);const digest=preparationDigest(c,request);return this.#normalRead(c,()=>{const row=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,request.commandRef);if(!row)return null;const result=this.#commandReceipt(row);if(row.operation!=='putPreparedContext'||row.task!==request.taskRef)fail('IDEMPOTENCY_CONFLICT');const graph=this.#preparedGraph(c,request.taskRef,result.receipt.recordRef);if(graph.binding.preparationPrincipalRef!==c.principalRef||graph.binding.preparationRequestDigest!==digest)fail('IDEMPOTENCY_CONFLICT');return{receipt:this.#preparedReceipt(result.receipt,graph.context.content),checkRef:result.checkRef};});}
  preparedContextStatus(capability,input){
    exact(input,[]);const c=this.#normalAuthority(capability);
    return this.#normalRead(c,()=>{
      const z='0'.repeat(64),task={ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:z,status:'queued',version:2,taskVersion:2,authEpoch:0,createdAt:0,updatedAt:0};
      const binding={contractVersion:'df.prepared-context-binding/v1',checkRef:z,taskRef:z,contextRecordRef:z,contextDigest:z,checkRecordRef:z,checkDigest:z,commandRef:z,preparationPrincipalRef:c.principalRef,preparationRequestDigest:z,selectionMode:'all_eligible',checkedSetDigest:z,sourceTaskVersion:1,sourceAuthEpoch:0,committedTaskVersion:2,committedAuthEpoch:0,semanticRevision:2,generatedAt:0,namespaceRef:c.namespaceRef,memoryRevision:0,method:'version-currentness/v1'};
      const check={contractVersion:'df.prepared-context-check/v1',checkRef:z,taskRef:z,contextRecordRef:z,contextDigest:z,sourceTaskVersion:1,sourceAuthEpoch:0,committedTaskVersion:2,committedAuthEpoch:0,semanticRevision:2,generatedAt:0,ledgerSnapshotDigest:z,memory:{namespaceRef:c.namespaceRef,revision:0},method:'version-currentness/v1',winningSources:[{recordRef:z,digest:z,kind:'goal'}],summaryChecks:[],conflicts:[],ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,commandRef:z,preparationPrincipalRef:c.principalRef,preparationRequestDigest:z,selectionMode:'all_eligible',checkedSetDigest:canonicalDigest([])};
      const envelope={contractVersion:'df.execution-context/v1',materialKind:'execution_context',sourceScope:{ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:z},sourceTaskVersion:1,sourceAuthEpoch:0,generatedAt:0,sourceRefs:[z],sourceProvenance:[{recordRef:z,digest:z,taskVersion:1,authEpoch:0,createdAt:0}],memory:{namespaceRef:c.namespaceRef,revision:0,provenance:[]},ledgerSnapshotDigest:z,content:'',inputCounts:{bytes:0,tokens:0},retainedRefs:[],droppedRefs:[],verification:'module_prepared_execution_context_only'};
      const bytes=value=>Buffer.byteLength(canonical(value)),metadata={recordRef:z,digest:z,kind:'context',sourceRef:z,taskVersion:2,authEpoch:0,generationRef:null,createdAt:0,byteLength:bytes(envelope),cryptoVersion:2,sourceTaskVersion:1,sourceAuthEpoch:0,semanticRevision:2,memoryNamespaceRef:c.namespaceRef,memoryRevision:0},raw={...metadata,task},result={receipt:raw,checkRef:z,commitDisposition:'new'},signedBinding={version:1,data:binding,mac:z},wire={check,currentness:{instructionsCurrent:true,memoryCurrent:true,taskSnapshotCurrent:true,reasonCodes:[]}},minBindingBytes=bytes(signedBinding);
      const bounds={contextByteLimit:Math.min(65536,this.#limits.maxDataBytes),checkByteLimit:Math.min(49152,this.#limits.maxDataBytes),metadataByteLimit:Math.min(4096,this.#limits.maxMetadataBytes),wireByteLimit:65536,minBindingBytes};
      const ready=minBindingBytes<=bounds.metadataByteLimit&&bytes(metadata)<=this.#limits.maxMetadataBytes&&bytes(result)<=this.#limits.maxMetadataBytes&&bytes({format:'command-receipt/v1',data:result,mac:z})<=this.#limits.maxMetadataBytes+512&&bytes(envelope)<=bounds.contextByteLimit&&bytes(check)<=bounds.checkByteLimit&&bytes({ok:true,value:{...wire,currentness:{instructionsCurrent:false,memoryCurrent:false,taskSnapshotCurrent:false,reasonCodes:['CHECKED_SET_CHANGED','MEMORY_CHANGED','SEMANTIC_CHANGED','SOURCE_UNAVAILABLE','TASK_SNAPSHOT_CHANGED','WINNING_SOURCE_CHANGED']}}})<=bounds.wireByteLimit;
      return{phase:ready?'ready':'limited',reasonCode:ready?null:'CONTEXT_PREPARATION_LIMIT',configured:true,ready,bounds};
    });
  }
  putPreparedContext(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','expectedMemory','content','sourceRef','summaryChecks','request','observation']);const c=this.#normalAuthority(capability,false,ref(input.taskRef)),request=preparationRequest(input.request,this.#secrets);const historical=this.#preparedCommandReceipt(c,request);if(historical){const graph=this.#preparedGraph(c,request.taskRef,historical.receipt.recordRef),row=this.#commandFor(c,request.commandRef,'putPreparedContext',request.taskRef);return{receipt:row.receipt,checkRef:graph.binding.checkRef,commitDisposition:'historical'};}return this.#normalMut(c,input,'putPreparedContext',c=>{
      const t=this.#cas(c,input);exact(input.expectedMemory,['namespaceRef','revision']);if(input.expectedMemory.namespaceRef!==c.namespaceRef)fail('UNAUTHORIZED');this.#memoryGuard(c,input.expectedMemory);for(const k of ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch'])if(input[k]!==request[k])fail('INVALID_INPUT');if(Buffer.byteLength(input.content)>Math.min(65536,this.#limits.maxDataBytes))fail('INPUT_TOO_LARGE');const envelope=parse(input.content);exact(envelope,['contractVersion','materialKind','sourceScope','sourceTaskVersion','sourceAuthEpoch','generatedAt','sourceRefs','sourceProvenance','memory','ledgerSnapshotDigest','content','inputCounts','retainedRefs','droppedRefs','verification']);validateExecutionContext(envelope,{scope:{ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,taskRef:t.id},maxTaskVersion:t.version,maxAuthEpoch:t.auth_epoch,maxGeneratedAt:this.#now(),knownSecrets:this.#secrets});const o=input.observation;exact(o,['contractVersion','sourceScope','sourceTaskVersion','sourceAuthEpoch','generatedAt','ledgerSnapshotDigest','selectionMode','examinedSummaryRefs','winningSourceRefs','retainedRefs','droppedRefs','inputCounts']);if(o.contractVersion!=='df.preparation-observation/v1'||!['all_eligible','explicit_records'].includes(o.selectionMode)||o.selectionMode!==(request.recordRefs===undefined?'all_eligible':'explicit_records'))fail('INVALID_INPUT');for(const k of ['sourceScope','sourceTaskVersion','sourceAuthEpoch','generatedAt','ledgerSnapshotDigest','retainedRefs','droppedRefs','inputCounts'])if(canonical(o[k])!==canonical(envelope[k]))fail('INVALID_INPUT');if(envelope.sourceTaskVersion!==t.version||envelope.sourceAuthEpoch!==t.auth_epoch||envelope.memory.namespaceRef!==c.namespaceRef||envelope.memory.revision!==input.expectedMemory.revision)fail('INVALID_INPUT');sortedRefs(o.examinedSummaryRefs);sortedRefs(o.winningSourceRefs,64,1);const source=this.#preparedSources(c,t.id,o.selectionMode,request.recordRefs??[]);if(canonical(o.examinedSummaryRefs)!==canonical(source.summaries.map(r=>r.recordRef))||canonical(o.winningSourceRefs)!==canonical(source.winners.map(r=>r.recordRef)))fail('SOURCE_UNAVAILABLE');array(input.summaryChecks,64);if(canonical(input.summaryChecks.map(r=>r.recordRef))!==canonical(o.examinedSummaryRefs))fail('INVALID_INPUT');const summaries=source.summaries.map((s,i)=>{const row=input.summaryChecks[i];exact(row,['recordRef','disposition']);if(!['retained_background','dropped_for_budget','excluded_stale_summary'].includes(row.disposition))fail('INVALID_INPUT');const stale=s.sourceTaskVersion!==t.version||s.sourceAuthEpoch!==t.auth_epoch;if(stale!==(row.disposition==='excluded_stale_summary')||!stale&&(row.disposition==='retained_background')!==envelope.retainedRefs.includes(s.recordRef)||row.disposition==='dropped_for_budget'&&!envelope.droppedRefs.includes(s.recordRef))fail('INVALID_INPUT');return{...s,disposition:row.disposition};});const snapshot=this.#snapshot(c,t.id,c.ownerHandle),workFacts={actions:snapshot.actions,workers:snapshot.workers,control:snapshot.control,artifacts:snapshot.artifacts,progress:snapshot.progress,deliveries:snapshot.deliveries,reviews:snapshot.reviews,audits:snapshot.audits,policy:snapshot.policy};if(envelope.ledgerSnapshotDigest!==hash(JSON.stringify({task:taskRecord(t),workFacts})))fail('STALE_VERSION');const expectedSource=hash(JSON.stringify({sourceScope:envelope.sourceScope,sourceTaskVersion:envelope.sourceTaskVersion,sourceAuthEpoch:envelope.sourceAuthEpoch,sourceRefs:envelope.sourceRefs,expectedMemory:input.expectedMemory}));if(ref(input.sourceRef)!==expectedSource)fail('INVALID_INPUT');if(this.#ledger.one('SELECT count(*) AS n FROM automation_records WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,t.id)).n>=this.#limits.maxRecordsPerTask)fail('RECORD_LIMIT');const updated=this.#update(t,t.status,'progress');this.#managed(updated);this.#bumpSemantic(c,t.id);const receipt={...this.#data(c,updated,{...input,kind:'context'}),task:taskRecord(updated)},checkRef=canonicalDigest(['df.prepared-context.check/v1',c.ownerRef,c.workspaceRef,t.id,receipt.recordRef,receipt.digest]),check={contractVersion:'df.prepared-context-check/v1',checkRef,taskRef:t.id,contextRecordRef:receipt.recordRef,contextDigest:receipt.digest,sourceTaskVersion:t.version,sourceAuthEpoch:t.auth_epoch,committedTaskVersion:updated.version,committedAuthEpoch:updated.auth_epoch,semanticRevision:this.#semantic(c,t.id),generatedAt:envelope.generatedAt,ledgerSnapshotDigest:envelope.ledgerSnapshotDigest,memory:detach(input.expectedMemory),method:'version-currentness/v1',winningSources:source.winners,summaryChecks:summaries,conflicts:summaries.filter(s=>s.disposition==='excluded_stale_summary').map(s=>({recordRef:s.recordRef,reason:'stale_summary',winningTaskVersion:t.version,winningAuthEpoch:t.auth_epoch})),ownerRef:c.ownerRef,workspaceRef:c.workspaceRef,commandRef:input.commandRef,preparationPrincipalRef:c.principalRef,preparationRequestDigest:preparationDigest(c,request),selectionMode:o.selectionMode,checkedSetDigest:canonicalDigest(summaries.map(({recordRef,digest})=>({recordRef,digest})))};payload('PreparedCheck',check);this.#check({ok:true,value:{check,currentness:{instructionsCurrent:false,memoryCurrent:false,taskSnapshotCurrent:false,reasonCodes:['CHECKED_SET_CHANGED','MEMORY_CHANGED','SEMANTIC_CHANGED','SOURCE_UNAVAILABLE','TASK_SNAPSHOT_CHANGED','WINNING_SOURCE_CHANGED']}}},65536);this.#check({ok:true,value:this.#preparedReceipt(receipt,input.content)},65536);const checkContent=canonical(check);if(Buffer.byteLength(checkContent)>Math.min(49152,this.#limits.maxDataBytes))fail('INPUT_TOO_LARGE');const checkData=this.#data(c,updated,{commandRef:input.commandRef,kind:'context_check',content:checkContent,sourceRef:checkRef});const binding={contractVersion:'df.prepared-context-binding/v1',checkRef,taskRef:t.id,contextRecordRef:receipt.recordRef,contextDigest:receipt.digest,checkRecordRef:checkData.recordRef,checkDigest:checkData.digest,commandRef:input.commandRef,preparationPrincipalRef:c.principalRef,preparationRequestDigest:check.preparationRequestDigest,selectionMode:o.selectionMode,checkedSetDigest:check.checkedSetDigest,sourceTaskVersion:t.version,sourceAuthEpoch:t.auth_epoch,committedTaskVersion:updated.version,committedAuthEpoch:updated.auth_epoch,semanticRevision:check.semanticRevision,generatedAt:check.generatedAt,namespaceRef:c.namespaceRef,memoryRevision:input.expectedMemory.revision,method:check.method};payload('PreparedBinding',binding);this.#check({version:1,data:binding,mac:this.#seal(c,'prepared_context_check',checkRef,t.id,binding)},Math.min(4096,this.#limits.maxMetadataBytes));this.#saveAuto(c,'prepared_context_check',checkRef,t.id,binding);this.#refresh7Registry(c,'prepared_context_registry');return{receipt,checkRef,commitDisposition:'new'};
    });}
  readPreparedContextCheck(handle,input){exact(input,['taskRef','contextRecordRef','expectedTaskVersion','expectedAuthEpoch']);const c=this.#ctx(handle,input.taskRef,['owner']);return this.#normalRead(c,()=>{this.#cas(c,input);const graph=this.#preparedGraph(c,input.taskRef,input.contextRecordRef);const result={check:graph.check,currentness:this.#currentness(c,graph)};this.#check({ok:true,value:result},65536);return result;});}
  #normalConfiguration(c,content){const cfg=canonicalContent(content,v=>configuration(v,c.source,this.#limits));if(canonical(cfg.configuration.acceptedPolicy)!==canonical(this.#getPolicy(c)))fail('STALE_POLICY');return cfg;}
  #normalSpecConfiguration(c,spec,cfg,context){const p=cfg.configuration.acceptedPolicy,purpose=spec.executionInput?.purpose??'producer',role=cfg.selection.find(r=>r.purpose===purpose),preset=cfg.preset.find(r=>r.purpose===purpose);if(!role||!preset||purpose==='producer'&&(spec.kind!=='write'||spec.role!=='worker')||spec.units!==1||spec.attemptIndex!==1||spec.resourcePolicyVersion!==p.version||spec.modelPolicyVersion!==p.modelPolicy.version||spec.model.presetRef!==preset.description.presetRef||spec.charges.runtimeMs!==role.charges.runtimeMs||spec.charges.usageUnits!==role.charges.usageUnits||spec.charges.costState!=='estimated'||spec.charges.costEstimateMicros!==0||!spec.charges.costProvenanceRef||spec.executor.toolsDigest!==cfg.tools.toolsDigest||spec.executor.permissionPolicyDigest!==cfg.permission.permissionPolicyDigest||spec.dataDigest!==(spec.executionInput?this.#auditSpec(c,context.binding.taskRef,spec,true).artifactDigest:context.context.digest))fail('SPEC_MISMATCH');const total=p.limits.maxTotalAttempts,required=1+(cfg.configuration.audit?1+cfg.configuration.audit.maxRepairRounds*2:0)+(cfg.configuration.continuation?cfg.configuration.continuation.maxContinuations:0);if(p.limits.maxActive!==1||p.limits.maxAttempts!==1||total<required)fail('ATTEMPT_LIMIT');if(cfg.configuration.audit&&cfg.configuration.audit.maxTotalAttempts!==total||cfg.configuration.continuation&&cfg.configuration.continuation.maxTotalAttempts!==total)fail('STALE_POLICY');return purpose;}
  planNormalNativeAction(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','contextRecordRef','configurationContent','spec']);const c=this.#normalAuthority(capability,true,ref(input.taskRef)),spec=normalizedSpec(input.spec);return this.#normalMut(c,input,'planNormalNativeAction',c=>{const graph=this.#requirePrepared(c,input.taskRef,input.contextRecordRef,true),cfg=this.#normalConfiguration(c,input.configurationContent);if(!spec.nativeOriginBinding||spec.resumeBinding||spec.executor.mode!=='create')fail('INVALID_INPUT');this.#normalSpecConfiguration(c,spec,cfg,graph);if(canonical(spec.nativeOriginBinding)!==canonical({sourceRef:c.sourceRef,createConfigDigest:hash(input.configurationContent),backendRef:canonicalDigest(cfg.backend),sessionRef:spec.executor.sessionRef}))fail('SPEC_MISMATCH');return this.#planEffect(this.#originalEffectAuthority(c,input.taskRef),input,spec,true);});}
  #originalInputBinding(c,task,spec,contextRef){if(!spec.executionInput){const graph=this.#requirePrepared(c,task,contextRef,true),b=graph.binding;return{checkRef:b.checkRef,contextRecordRef:b.contextRecordRef,contextDigest:b.contextDigest,preparationPrincipalRef:b.preparationPrincipalRef,preparationRequestDigest:b.preparationRequestDigest};}const input=this.#auditSpec(c,task,spec,true);return{inputRecordRef:input.recordRef,inputDigest:input.digest,auditRef:input.auditRef,bindingDigest:input.bindingDigest,materialDigest:input.materialDigest,previousReportRef:input.previousReportRef??null,artifactTarget:input.purpose==='audit_repair'?{artifactRef:input.artifactRef,version:input.artifactVersion+1}:null};}
  claimNormalCreate(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','actionDigest','nativeId','configurationContent','auditRepair'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','actionDigest','nativeId','configurationContent']);if(input.auditRepair)exact(input.auditRepair,['auditRef','round','previousReportRef','evidenceRef']);const c=this.#normalAuthority(capability,true,ref(input.taskRef));return this.#normalMut(c,input,'claimNormalCreate',c=>{const cfg=this.#normalConfiguration(c,input.configurationContent),a=this.#action(c,input.taskRef,input.actionRef);if(!a.spec.nativeOriginBinding||a.spec.executor.mode!=='create'||hash(input.configurationContent)!==a.spec.nativeOriginBinding.createConfigDigest||input.nativeId!=='df-'+a.spec.executor.generationRef||a.spec.executor.sessionRef!==reference(input.nativeId))fail('SPEC_MISMATCH');const planRows=this.#ledger.query("SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND task=? AND operation='planNormalNativeAction'",...this.#keys(c,input.taskRef)).filter(r=>this.#commandReceipt(r).actionRef===a.action);if(planRows.length!==1)fail('STORAGE_INVALID');const context=this.#nativeRows(c,'prepared_context_check').find(r=>r.value.contextDigest===a.spec.dataDigest&&r.taskRef===input.taskRef);const contextRef=a.spec.executionInput?this.#auditInput(c,a.spec.executionInput.recordRef).contextRecordRef:context?.value.contextRecordRef;if(!contextRef)fail('PREPARED_CONTEXT_UNAVAILABLE');const graph=this.#requirePrepared(c,input.taskRef,contextRef,true),purpose=this.#normalSpecConfiguration(c,a.spec,cfg,graph),inputBinding=this.#originalInputBinding(c,input.taskRef,a.spec,contextRef);const receipt=this.#claimEffect(this.#originalEffectAuthority(c,input.taskRef),input,true),t=this.#task(c,input.taskRef),identity=this.#data(c,t,{commandRef:input.commandRef,kind:'native_identity',content:canonical({nativeId:input.nativeId}),sourceRef:receipt.claimRef}),configurationData=this.#data(c,t,{commandRef:input.commandRef,kind:'native_configuration',content:input.configurationContent,sourceRef:receipt.claimRef}),originRef=canonicalDigest(['df.normal-native.origin/v1',c.ownerRef,c.workspaceRef,input.taskRef,receipt.claimRef]),intent={contractVersion:'df.normal-native/normal_native_intent/v1',intentRef:receipt.claimRef,taskRef:t.id,actionRef:a.action,actionDigest:a.digest,claimRef:receipt.claimRef,generationRef:receipt.generationRef,sessionRef:receipt.sessionRef,identityRecordRef:identity.recordRef,identityDigest:identity.digest,configurationRecordRef:configurationData.recordRef,configurationDigest:configurationData.digest,sourceRef:c.sourceRef,createConfigDigest:configurationData.digest,backendRef:canonicalDigest(cfg.backend),createdAt:this.#now(),purpose,inputBinding};this.#newNative(c,'normal_native_intent',intent.intentRef,t.id,intent);return{receipt,originRef,sessionRef:receipt.sessionRef,identityRecordRef:identity.recordRef};});}
  #historyJoin(c,h,intent,claim=null){const expected=claim??intent;for(const k of ['ownerRef','workspaceRef'])if(h[k]!==c[k])fail('SPEC_MISMATCH');for(const k of ['taskRef','claimRef','generationRef','sessionRef'])if(h[k]!==expected[k])fail('SPEC_MISMATCH');const cfg=canonicalContent(this.#privateData(c,intent.taskRef,intent.configurationRecordRef,'native_configuration',intent.configurationDigest).content,x=>configuration(x)),identity=canonicalContent(this.#privateData(c,intent.taskRef,intent.identityRecordRef,'native_identity',intent.identityDigest).content,x=>exact(x,['nativeId']));if(h.header.id!==identity.nativeId||h.header.cwd!==cfg.environment.cwd)fail('SPEC_MISMATCH');const configurationDigest=claim?this.#auto(c,'normal_resume',claim.resumeRef).configurationDigest:intent.configurationDigest;if(h.configurationDigest!==configurationDigest||h.stableSourceRef!==intent.sourceRef)fail('SPEC_MISMATCH');}
  recordNormalNativeOrigin(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','originRef','creationEvidenceRef','baselineHistoryContent','baselineHistoryDigest']);const c=this.#normalAuthority(capability,true,ref(input.taskRef));return this.#normalMut(c,input,'recordNormalNativeOrigin',c=>{const intent=this.#auto(c,'normal_native_intent',ref(input.claimRef));if(!intent||intent.taskRef!==input.taskRef||intent.actionRef!==input.actionRef||intent.actionDigest!==input.actionDigest||intent.generationRef!==input.generationRef||intent.sessionRef!==input.sessionRef||input.originRef!==canonicalDigest(['df.normal-native.origin/v1',c.ownerRef,c.workspaceRef,input.taskRef,intent.claimRef]))fail('SPEC_MISMATCH');const {w}=this.#claim(c,input);if(!['created','ready'].includes(w.phase)||w.sessionRef!==input.sessionRef||w.terminalEvidenceRef)fail('WORKER_NOT_READY');const h=canonicalContent(input.baselineHistoryContent,historyObservation);this.#historyJoin(c,h,intent);if(h.messages.length||hash(input.baselineHistoryContent)!==ref(input.baselineHistoryDigest))fail('SPEC_MISMATCH');const history=this.#data(c,this.#task(c,input.taskRef),{commandRef:input.commandRef,kind:'native_history',content:input.baselineHistoryContent,sourceRef:input.originRef}),origin={contractVersion:'df.normal-native/normal_native_origin/v1',originRef:input.originRef,intentRef:intent.intentRef,taskRef:intent.taskRef,claimRef:intent.claimRef,generationRef:intent.generationRef,sessionRef:intent.sessionRef,creationEvidenceRef:ref(input.creationEvidenceRef),baselineHistoryRecordRef:history.recordRef,baselineHistoryDigest:history.digest,createdAt:this.#now()};this.#newNative(c,'normal_native_origin',origin.originRef,origin.taskRef,origin);return{originRef:origin.originRef,claimRef:origin.claimRef,generationRef:origin.generationRef,sessionRef:origin.sessionRef,baselineHistoryRecordRef:history.recordRef};});}
  #validateIntentInput(c,intent,a){const b=intent.inputBinding;if(intent.purpose==='producer'){const prepared=this.#preparedGraph(c,intent.taskRef,b.contextRecordRef);for(const k of ['checkRef','contextRecordRef','contextDigest','preparationPrincipalRef','preparationRequestDigest'])if(prepared.binding[k]!==b[k])fail('STORAGE_INVALID');if(a.spec.dataDigest!==b.contextDigest||a.spec.executionInput)fail('STORAGE_INVALID');}else{const input=this.#auditInput(c,b.inputRecordRef);if(a.spec.executionInput?.recordRef!==b.inputRecordRef||input.digest!==b.inputDigest||input.purpose!==intent.purpose||input.auditRef!==b.auditRef||input.bindingDigest!==b.bindingDigest||input.materialDigest!==b.materialDigest||(input.previousReportRef??null)!==b.previousReportRef)fail('STORAGE_INVALID');if(intent.purpose==='audit_repair'&&(b.artifactTarget.artifactRef!==input.artifactRef||b.artifactTarget.version!==input.artifactVersion+1))fail('STORAGE_INVALID');}}
  #claimGraph(c,task,claimRef){const intent=this.#auto(c,'normal_native_intent',claimRef),resumed=this.#auto(c,'normal_resume_claim',claimRef);if(intent&&resumed||!intent&&!resumed)fail('NORMAL_NATIVE_ORIGIN_UNAVAILABLE');const origin=intent?this.#nativeRows(c,'normal_native_origin').find(r=>r.value.intentRef===claimRef)?.value:this.#auto(c,'normal_native_origin',resumed.originRef),original=intent??(origin&&this.#auto(c,'normal_native_intent',origin.intentRef)),resume=resumed?this.#auto(c,'normal_resume',resumed.resumeRef):null;if(!origin||!original||original.taskRef!==task||resumed&&(!resume||resume.originRef!==origin.originRef))fail('NORMAL_NATIVE_ORIGIN_UNAVAILABLE');return{intent:original,origin,resume,resumed};}
  #normalExecutionAdmission(c,input){const worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,input.taskRef),ref(input.claimRef));if(!worker)return;const a=this.#action(c,input.taskRef,parse(worker.payload).actionRef);if(a.spec.nativeOriginBinding||a.spec.resumeBinding){const graph=this.#claimGraph(c,input.taskRef,input.claimRef);if(a.spec.resumeBinding&&graph.resume?.resumeRef!==a.spec.resumeBinding.resumeRef)fail('SPEC_MISMATCH');}}
  #refuseGenericClaimEffect(c,input,normal){if(normal||!input.claimRef)return;const row=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,input.taskRef),input.claimRef);if(!row)return;const a=this.#action(c,input.taskRef,parse(row.payload).actionRef);if(a.spec.nativeOriginBinding||a.spec.resumeBinding)fail('UNAUTHORIZED');}
  #captureBase(c,input){const {intent,origin,resume,resumed}=this.#claimGraph(c,input.taskRef,input.claimRef),{a,w,t}=this.#claim(c,input),execution=this.#auto(c,'execution',input.claimRef);if(!execution||execution.executionRef!==input.executionRef||execution.generationRef!==input.generationRef||w.sessionRef!==input.sessionRef||execution.actionRef!==a.action||execution.actionDigest!==a.digest||!['dispatch_intent','unknown'].includes(execution.state)||w.terminalEvidenceRef)fail('SPEC_MISMATCH');const h=canonicalContent(input.committedHistoryContent,historyObservation);this.#historyJoin(c,h,intent,resumed);integer(input.inputCursor,0,h.events.length-1);integer(input.cursor,input.inputCursor+1,h.events.length-1);const inputEvent=h.events[input.inputCursor],outputEvent=h.events[input.cursor],suffix=h.events.slice(input.inputCursor);if(hash(input.committedHistoryContent)!==ref(input.committedHistoryDigest)||inputEvent.type!=='user/message'||inputEvent.data.id!==input.executionRef||inputEvent.data.source.kind!==(intent.purpose==='producer'?'df-context':'df-audit-input')||outputEvent.type!=='assistant/message'||suffix.filter(e=>e.type==='user/message').length!==1||suffix.filter(e=>e.type==='assistant/message').length!==1||!h.events.slice(input.cursor+1).some(e=>e.type==='turn/end'&&e.data.turn===outputEvent.data.turn&&e.data.reason.kind==='completed'))fail('SPEC_MISMATCH');integer(input.usageUnits,0,a.spec.charges.usageUnits);const contextRecordRef=intent.purpose==='producer'?(resume?.contextRecordRef??intent.inputBinding.contextRecordRef):this.#auditInput(c,intent.inputBinding.inputRecordRef).contextRecordRef,context=this.#requirePrepared(c,t.id,contextRecordRef,false);const body=intent.purpose==='producer'?context.context.content:this.#auditResultInputContent(c,intent);const newUsers=h.messages.filter(m=>m.role==='user'&&m.id===input.executionRef);if(newUsers.length!==1||newUsers[0].content[0].text!==body)fail('SPEC_MISMATCH');const baseline=resume?canonicalContent(this.#privateData(c,t.id,resume.historyRecordRef,'native_history',resume.historyDigest).content,resumeHistory):canonicalContent(this.#privateData(c,t.id,origin.baselineHistoryRecordRef,'native_history',origin.baselineHistoryDigest).content,historyObservation);if(canonical(h.events.slice(0,baseline.events.length))!==canonical(baseline.events)||input.inputCursor<baseline.events.length)fail('WORKER_RESUME_HISTORY_STALE');const expectedMessages=resume?resumeHistory(parse(this.#privateData(c,t.id,resume.historyRecordRef,'native_history',resume.historyDigest).content)).messages:[];const messages=h.messages;if(messages.length!==expectedMessages.length+3-(resume?1:0)||resume&&canonical(messages.slice(0,expectedMessages.length))!==canonical(expectedMessages)||messages.at(-1).role!=='assistant')fail('SPEC_MISMATCH');return{intent,origin,resume,resumed,a,w,t,execution,h,context};}
  #auditResultInputContent(c,intent){return this.#privateData(c,intent.taskRef,intent.inputBinding.inputRecordRef,'context',intent.inputBinding.inputDigest).content;}
  #captureValue(c,input,base,artifact,auditBinding){const {intent,origin,resume,a,h,context}=base,history=this.#data(c,base.t,{commandRef:input.commandRef,kind:'native_history',content:input.committedHistoryContent,sourceRef:input.executionRef}),captureRef=canonicalDigest(['df.normal-native.capture/v1',c.ownerRef,c.workspaceRef,input.taskRef,input.claimRef,input.executionRef]);return{contractVersion:'df.normal-native/normal_native_capture/v1',captureRef,originRef:origin.originRef,taskRef:input.taskRef,actionRef:a.action,actionDigest:a.digest,claimRef:input.claimRef,generationRef:input.generationRef,sessionRef:input.sessionRef,executionRef:input.executionRef,contextRecordRef:context.context.recordRef,contextDigest:context.context.digest,resumeRef:resume?.resumeRef??null,fullInputDigest:resume?.inputDigest??null,artifactRef:artifact?.artifactRef??null,artifactVersion:artifact?.version??null,artifactDigest:artifact?.digest??null,resultDigest:ref(input.resultDigest??hash(input.content)),cursor:input.cursor,persistenceEvidenceRef:ref(input.persistenceEvidenceRef??input.evidenceRef),committedHistoryRecordRef:history.recordRef,committedHistoryDigest:history.digest,eventCount:h.events.length,headerDigest:canonicalDigest(h.header),messagesDigest:canonicalDigest(h.messages),usageUnits:input.usageUnits,accounting:'df-testing-utf8-byte-units/v1',createdAt:this.#now(),phase:'output',purpose:intent.purpose,inputCursor:input.inputCursor,auditBinding,outputCaptureRef:null};}
  captureNormalNativeResult(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','actionDigest','claimRef','generationRef','sessionRef','executionRef','artifactRef','version','resultContent','resultDigest','inputDigest','inputCursor','cursor','persistenceEvidenceRef','committedHistoryContent','committedHistoryDigest','usageUnits']);const c=this.#normalAuthority(capability,true,ref(input.taskRef));return this.#normalMut(c,input,'captureNormalNativeResult',c=>{const base=this.#captureBase(c,input);if(base.intent.purpose!=='producer'||input.version!==1||input.actionRef!==base.a.action||input.actionDigest!==base.a.digest||input.inputDigest!==base.context.context.digest)fail('SPEC_MISMATCH');const result=parse(input.resultContent);exact(result,['contractVersion','source','content']);exact(result.source,['taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','executionRef','inputDigest','cursor','resultDigest']);if(result.contractVersion!=='df.native-result/v1')fail('INVALID_INPUT');for(const k of Object.keys(result.source))if(result.source[k]!==input[k])fail('SPEC_MISMATCH');if(hash(result.content)!==input.resultDigest||base.h.messages.at(-1).content[0].text!==result.content)fail('SPEC_MISMATCH');const receipt=this.#artifactEffect(this.#originalEffectAuthority(c,input.taskRef),{taskRef:input.taskRef,commandRef:input.commandRef,expectedTaskVersion:input.expectedTaskVersion,expectedAuthEpoch:input.expectedAuthEpoch,artifactRef:input.artifactRef,version:1,producerClaimRef:input.claimRef,generationRef:input.generationRef,content:input.resultContent},true),capture=this.#captureValue(c,input,base,receipt,null);this.#newNative(c,'normal_native_capture',capture.captureRef,input.taskRef,capture);return{receipt,captureRef:capture.captureRef};},'terminal');}
  captureNormalNativeAuditResult(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','claimRef','generationRef','executionRef','sessionRef','inputCursor','cursor','content','evidenceRef','committedHistoryContent','committedHistoryDigest','usageUnits']);const c=this.#normalAuthority(capability,true,ref(input.taskRef)),bounds=this.#requireAuditBounds();integer(input.inputCursor);integer(input.cursor,input.inputCursor+1);if(Buffer.byteLength(input.content)>bounds.resultByteLimit)fail('INPUT_TOO_LARGE');return this.#normalMut(c,input,'captureNormalNativeAuditResult',c=>{const base=this.#captureBase(c,input);if(base.intent.purpose==='producer'||base.h.messages.at(-1).content[0].text!==input.content)fail('SPEC_MISMATCH');const originalInput={};for(const k of ['taskRef','commandRef','claimRef','generationRef','executionRef','sessionRef','inputCursor','cursor','content','evidenceRef'])originalInput[k]=input[k];const receipt=this.#auditCaptureEffect(this.#originalEffectAuthority(c,input.taskRef,true),originalInput,true),binding={resultRef:receipt.resultRef,resultRecordRef:receipt.recordRef,resultDigest:receipt.digest,...base.intent.inputBinding},capture=this.#captureValue(c,input,base,null,binding);this.#newNative(c,'normal_native_capture',capture.captureRef,input.taskRef,capture);return{receipt,captureRef:capture.captureRef};},'terminal');}
  writeNormalNativeRepairArtifact(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','artifactRef','version','producerClaimRef','generationRef','content','outputCaptureRef']);const c=this.#normalAuthority(capability,true,ref(input.taskRef));return this.#normalMut(c,input,'writeNormalNativeRepairArtifact',c=>{const output=this.#auto(c,'normal_native_capture',ref(input.outputCaptureRef));if(!output||output.purpose!=='audit_repair'||output.phase!=='output'||output.claimRef!==input.producerClaimRef||output.generationRef!==input.generationRef||output.taskRef!==input.taskRef||output.auditBinding.artifactTarget?.artifactRef!==input.artifactRef||output.auditBinding.artifactTarget?.version!==input.version)fail('AUDIT_BINDING_MISMATCH');const result=this.#auditResult(c,output.auditBinding.resultRef);if(result.content!==input.content||hash(input.content)!==output.resultDigest)fail('SPEC_MISMATCH');const {outputCaptureRef,...originalInput}=input,receipt=this.#artifactEffect(this.#originalEffectAuthority(c,input.taskRef),originalInput,true),captureRef=canonicalDigest(['df.normal-native.repair-artifact/v1',c.ownerRef,c.workspaceRef,input.taskRef,input.producerClaimRef,output.executionRef,input.artifactRef,input.version]),capture={...output,captureRef,artifactRef:receipt.artifactRef,artifactVersion:receipt.version,artifactDigest:receipt.digest,phase:'repair_artifact',outputCaptureRef,createdAt:this.#now()};this.#newNative(c,'normal_native_capture',captureRef,input.taskRef,capture);return{receipt,captureRef};},'terminal');}
  #validateCapture(c,v,id,out){
    if(v.captureRef!==id||out.captureRef!==id)fail('STORAGE_INVALID');const {intent,origin,resume,resumed}=this.#claimGraph(c,v.taskRef,v.claimRef),a=this.#action(c,v.taskRef,v.actionRef),execution=this.#auto(c,'execution',v.claimRef);if(intent.purpose!==v.purpose||origin.originRef!==v.originRef||a.digest!==v.actionDigest||a.metadata.claimRef!==v.claimRef||a.spec.executor.generationRef!==v.generationRef||a.spec.executor.sessionRef!==v.sessionRef||execution?.executionRef!==v.executionRef||resume?.resumeRef!==(v.resumeRef??undefined)||resume?.inputDigest!==(v.fullInputDigest??undefined))fail('STORAGE_INVALID');const context=this.#privateData(c,v.taskRef,v.contextRecordRef,'context',v.contextDigest);this.#preparedGraph(c,v.taskRef,context.recordRef);const h=canonicalContent(this.#privateData(c,v.taskRef,v.committedHistoryRecordRef,'native_history',v.committedHistoryDigest).content,historyObservation);this.#historyJoin(c,h,intent,resumed);integer(v.inputCursor,0,h.events.length-1);integer(v.cursor,v.inputCursor+1,h.events.length-1);const inputEvent=h.events[v.inputCursor],outputEvent=h.events[v.cursor];if(v.eventCount!==h.events.length||inputEvent.type!=='user/message'||inputEvent.data.id!==v.executionRef||inputEvent.data.source.kind!==(intent.purpose==='producer'?'df-context':'df-audit-input')||outputEvent.type!=='assistant/message'||canonical(outputEvent.data.message)!==canonical(h.messages.at(-1))||!h.events.slice(v.cursor+1).some(e=>e.type==='turn/end'&&e.data.turn===outputEvent.data.turn&&e.data.reason.kind==='completed')||v.headerDigest!==canonicalDigest(h.header)||v.messagesDigest!==canonicalDigest(h.messages)||v.usageUnits>a.spec.charges.usageUnits||h.messages.at(-1)?.content[0].text===undefined||hash(h.messages.at(-1).content[0].text)!==v.resultDigest)fail('STORAGE_INVALID');
    if(v.artifactRef!==null){const artifact=this.#artifact(c,v.taskRef,v.artifactRef,v.artifactVersion);if(!artifact||artifact.digest!==v.artifactDigest||artifact.producerClaimRef!==v.claimRef||artifact.generationRef!==v.generationRef||out.receipt.digest!==artifact.digest||out.receipt.recordRef!==artifact.recordRef)fail('STORAGE_INVALID');if(v.purpose==='producer'){const raw=parse(this.#privateData(c,v.taskRef,artifact.recordRef,'artifact',artifact.digest).content);if(raw.contractVersion!=='df.native-result/v1'||raw.source.executionRef!==v.executionRef||raw.source.claimRef!==v.claimRef||raw.source.resultDigest!==v.resultDigest||raw.source.inputDigest!==v.contextDigest||hash(raw.content)!==v.resultDigest)fail('STORAGE_INVALID');}}
    if(v.auditBinding){const r=this.#auditResult(c,v.auditBinding.resultRef).association;if(v.auditBinding.resultRecordRef!==r.recordRef||v.auditBinding.resultDigest!==r.digest||r.executionRef!==v.executionRef||r.claimRef!==v.claimRef||r.inputDigest!==v.auditBinding.inputDigest||r.inputRecordRef!==v.auditBinding.inputRecordRef||r.materialDigest!==v.auditBinding.materialDigest||r.bindingDigest!==v.auditBinding.bindingDigest)fail('STORAGE_INVALID');if(v.phase==='output'&&out.receipt.resultRef!==r.resultRef)fail('STORAGE_INVALID');}
    if(v.phase==='repair_artifact'){const output=this.#auto(c,'normal_native_capture',v.outputCaptureRef);if(!output||output.phase!=='output'||output.purpose!=='audit_repair'||output.claimRef!==v.claimRef||output.executionRef!==v.executionRef||output.resultDigest!==v.resultDigest||canonical(v.auditBinding)!==canonical(output.auditBinding)||v.artifactRef!==v.auditBinding.artifactTarget.artifactRef||v.artifactVersion!==v.auditBinding.artifactTarget.version)fail('STORAGE_INVALID');}
  }
  #validateFinish(c,v,id,out,command){const capture=this.#auto(c,'normal_native_capture',v.captureRef),a=capture&&this.#action(c,v.taskRef,capture.actionRef),worker=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,v.taskRef),v.claimRef);if(v.finishRef!==id||id!==v.claimRef||!capture||capture.phase!=='output'||capture.claimRef!==v.claimRef||capture.generationRef!==v.generationRef||capture.executionRef!==v.executionRef||v.usageUnits!==capture.usageUnits||out.finishRef!==v.finishRef||out.receipt.claimRef!==v.claimRef||out.receipt.reservationHeld!==(v.releaseState==='held')||out.receipt.releaseEvidenceRef!==v.releaseEvidenceRef||v.commandRef!==command.id||!worker||parse(worker.payload).terminalEvidenceRef!==v.terminalEvidenceRef||a.metadata.outcomeEvidenceRef!==v.outcomeEvidenceRef||a.metadata.usageState!=='actual'||a.metadata.usageUnits!==v.usageUnits)fail('STORAGE_INVALID');ref(v.ownerRequestDigest);if(v.artifactCaptureRef!==null){const artifact=this.#auto(c,'normal_native_capture',v.artifactCaptureRef);if(!artifact||artifact.outputCaptureRef!==v.captureRef||artifact.phase!=='repair_artifact'||artifact.claimRef!==v.claimRef)fail('STORAGE_INVALID');}if(v.releaseState==='released'){if(a.metadata.releaseEvidenceRef!==v.releaseEvidenceRef||this.#ledger.one('SELECT 1 FROM reservations WHERE claim_id=?',a.claim_id))fail('STORAGE_INVALID');this.#roleFinished(c,capture,v.artifactCaptureRef);}}
  #roleFinished(c,capture,artifactCaptureRef){if(capture.purpose==='audit_review'){const execution=this.#auto(c,'execution',capture.claimRef),report=execution?.reportRef&&this.#auto(c,'report',execution.reportRef);if(!report?.native||report.native.resultRef!==capture.auditBinding.resultRef||report.claimRef!==capture.claimRef)fail('AUDIT_RESULT_REQUIRED');}else if(capture.purpose==='audit_repair'){const artifact=artifactCaptureRef&&this.#auto(c,'normal_native_capture',artifactCaptureRef);if(!artifact||artifact.outputCaptureRef!==capture.captureRef)fail('AUDIT_RESULT_REQUIRED');}}
  finishNormalNativeExecution(capability,input){if(!input||typeof input!=='object'||types.isProxy(input)||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)fail('INVALID_INPUT');exact(input,Object.keys(Object.getOwnPropertyDescriptors(input)));const q=ownerFinishRequest(input.ownerRequest),c=this.#normalAuthority(capability,true,q.taskRef);this.#ctx(c.ownerHandle,q.taskRef,['owner']);this.#readFinish(c,q);input=normalInput(input);exact(input,['taskRef','commandRef','claimRef','generationRef','executionRef','captureRef','terminalEvidenceRef','outcomeEvidenceRef','usage','ownerRequest','artifactCaptureRef']);for(const k of ['taskRef','commandRef','claimRef','generationRef','executionRef'])if(input[k]!==q[k])fail('INVALID_INPUT');exact(input.usage,['state','units']);if(input.usage.state!=='actual')fail('INVALID_INPUT');integer(input.usage.units);return this.#normalMut(c,input,'finishNormalNativeExecution',c=>{this.#requireOwnerFinishIntent(c,q);this.#cas(c,q);const capture=this.#auto(c,'normal_native_capture',ref(input.captureRef)),{a,w}=this.#claim(c,input);if(!capture||capture.phase!=='output'||capture.taskRef!==input.taskRef||capture.claimRef!==input.claimRef||capture.generationRef!==input.generationRef||capture.executionRef!==input.executionRef||capture.actionRef!==q.actionRef||capture.actionDigest!==a.digest||capture.usageUnits!==input.usage.units||w.terminalEvidenceRef!==ref(input.terminalEvidenceRef)||w.phase!=='stopped')fail('WORKER_FINISH_UNAVAILABLE');if(input.artifactCaptureRef!==null)ref(input.artifactCaptureRef);let roleComplete=true;try{this.#roleFinished(c,capture,input.artifactCaptureRef);}catch(error){if(error.code!=='AUDIT_RESULT_REQUIRED')throw error;roleComplete=false;}const receipt=this.#settleEffect(this.#originalEffectAuthority(c,input.taskRef,true),{taskRef:input.taskRef,commandRef:input.commandRef,claimRef:input.claimRef,generationRef:input.generationRef,outcome:'completed',evidenceRef:ref(input.outcomeEvidenceRef),terminalEvidenceRef:input.terminalEvidenceRef,usage:input.usage},true,roleComplete),finish={contractVersion:'df.normal-native/normal_native_finish/v1',finishRef:input.claimRef,taskRef:input.taskRef,claimRef:input.claimRef,generationRef:input.generationRef,executionRef:input.executionRef,captureRef:input.captureRef,terminalEvidenceRef:input.terminalEvidenceRef,outcomeEvidenceRef:input.outcomeEvidenceRef,releaseEvidenceRef:receipt.releaseEvidenceRef??null,usageState:'actual',usageUnits:input.usage.units,releaseState:receipt.reservationHeld?'held':'released',createdAt:this.#now(),commandRef:q.commandRef,ownerRequestDigest:finishDigest(c,q),artifactCaptureRef:input.artifactCaptureRef};this.#newNative(c,'normal_native_finish',finish.finishRef,input.taskRef,finish);return{receipt,finishRef:finish.finishRef};},'terminal');}
  readNormalNativeFinish(handle,input){const q=ownerFinishRequest(input),c=this.#ctx(handle,q.taskRef,['owner']);return this.#readFinish(c,q);}
  #finishCommand(c,q,command){
    const result=this.#commandReceipt(command),finish=this.#auto(c,'normal_native_finish',q.claimRef);
    if(command.operation!=='finishNormalNativeExecution'||command.task!==q.taskRef||!finish||finish.commandRef!==q.commandRef||finish.ownerRequestDigest!==finishDigest(c,q))fail('IDEMPOTENCY_CONFLICT');
    if(result.finishRef!==finish.finishRef||result.receipt.claimRef!==q.claimRef)fail('STORAGE_INVALID');
    return{receipt:result.receipt,finishRef:result.finishRef};
  }
  #readFinish(c,q){return this.#normalRead(c,()=>{const command=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,q.commandRef);if(command)return this.#finishCommand(c,q,command);if(this.#auto(c,'normal_native_finish',q.claimRef))fail('WORKER_FINISH_UNAVAILABLE');return null;});}

  #ownerFinishIntentId(c,taskRef,commandRef){return canonicalDigest(['df.owner-native-finish-intent/v1',c.ownerRef,c.workspaceRef,taskRef,commandRef]);}
  #ownerFinishWire(value){this.#check({ok:true,value},OWNER_FINISH_WIRE_LIMIT);return detach(value);}
  #ownerFinishIdentity(c,input){
    const t=this.#task(c,input.taskRef),a=this.#action(c,input.taskRef,input.actionRef);
    const row=this.#ledger.one('SELECT payload FROM runtime_workers WHERE owner=? AND workspace=? AND task=? AND claim=?',...this.#keys(c,input.taskRef),input.claimRef);
    const w=row&&parse(row.payload),execution=this.#auto(c,'execution',input.claimRef);
    if(!w||!execution||w.claimRef!==input.claimRef||w.actionRef!==input.actionRef||w.actionDigest!==a.digest||w.generationRef!==input.generationRef||a.metadata.claimRef!==input.claimRef||a.spec.executor.generationRef!==input.generationRef||a.metadata.executionRef!==input.executionRef||execution.taskRef!==input.taskRef||execution.actionRef!==input.actionRef||execution.actionDigest!==a.digest||execution.claimRef!==input.claimRef||execution.generationRef!==input.generationRef||execution.executionRef!==input.executionRef)fail('WORKER_FINISH_UNAVAILABLE');
    return{t,a,w,execution};
  }
  #ownerFinishActive(c,q){
    this.#cas(c,q);
    if(this.#auto(c,'normal_native_finish',q.claimRef))fail('WORKER_FINISH_UNAVAILABLE');
    const {t,a,w,execution}=this.#ownerFinishIdentity(c,q),held=this.#claim(c,q);
    if(held.a.action!==a.action||held.w.claimRef!==w.claimRef||!a.spec.nativeOriginBinding&&!a.spec.resumeBinding)fail('WORKER_FINISH_UNAVAILABLE');
    const graph=this.#claimGraph(c,q.taskRef,q.claimRef);
    if(a.spec.resumeBinding&&graph.resume?.resumeRef!==a.spec.resumeBinding.resumeRef)fail('SPEC_MISMATCH');
    this.#ownerFinishCaptured(c,q,a,execution,graph);
    if(!this.#ledger.one('SELECT 1 FROM reservations WHERE owner=? AND workspace=? AND task=? AND claim_id=? AND action=?',...this.#keys(c,q.taskRef),a.claim_id,a.action))fail('STALE_CLAIM');
    return t;
  }
  #ownerFinishCaptured(c,q,a,execution,graph){
    // Only already committed original capture facts may precede owner Q. This
    // guard never captures, repairs, reports, refreshes Q or predicts future CAS.
    const captureRef=canonicalDigest(['df.normal-native.capture/v1',c.ownerRef,c.workspaceRef,q.taskRef,q.claimRef,q.executionRef]);
    const capture=this.#auto(c,'normal_native_capture',captureRef),command=this.#nativeCommand(c,'normal_native_capture',captureRef);
    const operation=graph.intent.purpose==='producer'?'captureNormalNativeResult':'captureNormalNativeAuditResult';
    if(!capture||!command||command.operation!==operation||command.task!==q.taskRef||capture.phase!=='output'||capture.taskRef!==q.taskRef||capture.actionRef!==q.actionRef||capture.actionDigest!==a.digest||capture.claimRef!==q.claimRef||capture.generationRef!==q.generationRef||capture.executionRef!==q.executionRef||capture.purpose!==graph.intent.purpose||capture.originRef!==graph.origin.originRef)fail('WORKER_FINISH_UNAVAILABLE');
    this.#validateCapture(c,capture,captureRef,this.#commandReceipt(command));
    if(capture.purpose==='audit_review'&&execution.reportRef){
      this.#roleFinished(c,capture,null);
      this.#validateNativeReport(c,this.#auto(c,'report',execution.reportRef));
    }
    if(capture.purpose==='audit_repair'){
      const repairs=this.#nativeRows(c,'normal_native_capture').filter(row=>row.value.phase==='repair_artifact'&&row.value.outputCaptureRef===captureRef);
      if(repairs.length>1)fail('WORKER_FINISH_UNAVAILABLE');
      if(repairs.length){
        const row=repairs[0],repair=row.value,repairCommand=this.#nativeCommand(c,'normal_native_capture',row.id);
        if(!repairCommand||repairCommand.operation!=='writeNormalNativeRepairArtifact'||repairCommand.task!==q.taskRef||row.taskRef!==q.taskRef||repair.taskRef!==q.taskRef||repair.actionRef!==q.actionRef||repair.actionDigest!==a.digest||repair.claimRef!==q.claimRef||repair.generationRef!==q.generationRef||repair.executionRef!==q.executionRef||repair.purpose!==capture.purpose)fail('WORKER_FINISH_UNAVAILABLE');
        this.#validateCapture(c,repair,row.id,this.#commandReceipt(repairCommand));
        this.#roleFinished(c,capture,row.id);
      }
    }
    // Absent optional role evidence retains the original truthful held-finish
    // branch. The original final writer alone computes completion/release.
  }
  #ownerFinishIntentRow(c,row){
    if(row.owner!==c.ownerRef||row.workspace!==c.workspaceRef||row.operation!==OWNER_FINISH_INTENT_OPERATION)fail('STORAGE_INVALID');
    const receipt=this.#commandReceipt(row);
    exact(receipt,['contractVersion','recordRef','digest','ownerRequestDigest']);
    if(receipt.contractVersion!=='df.owner-finish-intent-receipt/v1')fail('STORAGE_INVALID');
    for(const k of ['recordRef','digest','ownerRequestDigest'])ref(receipt[k]);this.#check(receipt);
    const data=this.#privateData(c,row.task,receipt.recordRef,OWNER_FINISH_INTENT_KIND,receipt.digest);
    exact(data,['recordRef','digest','kind','sourceRef','taskVersion','authEpoch','generationRef','createdAt','byteLength','cryptoVersion','content']);
    const {content,...metadata}=data;this.#check(metadata);
    const body=canonicalContent(content,value=>{exact(value,['contractVersion','request','ownerRequestDigest']);if(value.contractVersion!=='df.owner-finish-intent/v1')fail('STORAGE_INVALID');ownerFinishRequest(value.request);ref(value.ownerRequestDigest);},this.#limits.maxDataBytes);
    const q=ownerFinishRequest(body.request),digest=finishDigest(c,q);
    if(row.task!==q.taskRef||row.id!==this.#ownerFinishIntentId(c,q.taskRef,q.commandRef)||receipt.recordRef!==canonicalDigest({commandRef:row.id,kind:OWNER_FINISH_INTENT_KIND})||receipt.ownerRequestDigest!==digest||body.ownerRequestDigest!==digest||data.sourceRef!==q.commandRef||data.taskVersion!==q.expectedTaskVersion||data.authEpoch!==q.expectedAuthEpoch)fail('STORAGE_INVALID');
    this.#ownerFinishIdentity(c,q);
    return{request:q,ownerRequestDigest:digest,receipt};
  }
  #ownerFinishIntent(c,q){
    const row=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,this.#ownerFinishIntentId(c,q.taskRef,q.commandRef));
    if(!row)return null;
    const intent=this.#ownerFinishIntentRow(c,row);
    if(canonical(intent.request)!==canonical(q))fail('IDEMPOTENCY_CONFLICT');
    return intent;
  }
  #requireOwnerFinishIntent(c,q){const intent=this.#ownerFinishIntent(c,q);if(!intent)fail('OWNER_FINISH_INTENT_REQUIRED');return intent;}
  #ownerFinishHistorical(c,q){
    const command=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,q.commandRef);
    return command?this.#finishCommand(c,q,command):null;
  }
  #ownerFinishProjection(c,intent,historical=this.#ownerFinishHistorical(c,intent.request)){
    return this.#ownerFinishWire({state:historical?'finish_committed':'intent_committed',request:intent.request,ownerRequestDigest:intent.ownerRequestDigest,settlement:historical?historical.receipt:null});
  }
  #ownerFinishLegacy(){return this.#ownerFinishWire({state:'legacy_unrestorable',request:null,ownerRequestDigest:null,settlement:null});}
  #ownerFinishEntries(c,input){
    this.#ownerFinishIdentity(c,input);
    const commands=new Map();
    for(const row of this.#ledger.query('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND task=? AND operation=?',...this.#keys(c,input.taskRef),OWNER_FINISH_INTENT_OPERATION)){
      const intent=this.#ownerFinishIntentRow(c,row),q=intent.request;
      if(['actionRef','claimRef','generationRef','executionRef'].some(k=>q[k]!==input[k]))continue;
      const historical=this.#ownerFinishHistorical(c,q);
      commands.set(q.commandRef,{commandRef:q.commandRef,state:historical?'finish_committed':'intent_committed'});
    }
    // These two original operations expose an authenticated claim association.
    // No request/CAS is reconstructed for their legacy command projection.
    for(const row of this.#ledger.query('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND task=?',...this.#keys(c,input.taskRef))){
      if(!['finishNormalNativeExecution','settleAction'].includes(row.operation)||commands.has(row.id))continue;
      const out=this.#commandReceipt(row,false,true);if(out===null)continue;
      const receipt=row.operation==='finishNormalNativeExecution'?out.receipt:out;
      if(receipt.claimRef!==input.claimRef)continue;
      if(row.operation==='finishNormalNativeExecution'){
        const finish=this.#auto(c,'normal_native_finish',input.claimRef);
        if(!finish||finish.commandRef!==row.id||finish.taskRef!==input.taskRef||finish.generationRef!==input.generationRef||finish.executionRef!==input.executionRef||out.finishRef!==finish.finishRef)fail('STORAGE_INVALID');
      }
      commands.set(row.id,{commandRef:row.id,state:'legacy_unrestorable'});
    }
    const result=[...commands.values()].sort((a,b)=>a.commandRef.localeCompare(b.commandRef));
    if(result.length>OWNER_FINISH_COMMAND_LIMIT)fail('OWNER_COMMAND_LIMIT');
    return result;
  }
  #validateOwnerFinishIntentScopes(){
    const scopes=new Map();
    for(const row of this.#ledger.query('SELECT DISTINCT owner,workspace FROM runtime_commands WHERE operation=?',OWNER_FINISH_INTENT_OPERATION))scopes.set(row.owner+row.workspace,{ownerRef:row.owner,workspaceRef:row.workspace});
    for(const row of this.#ledger.query('SELECT DISTINCT owner,workspace FROM runtime_data WHERE kind=?',OWNER_FINISH_INTENT_KIND))scopes.set(row.owner+row.workspace,{ownerRef:row.owner,workspaceRef:row.workspace});
    if(scopes.size&&this.#ledger.one('PRAGMA user_version').user_version<7)fail('SCHEMA_UNSUPPORTED');
    for(const c of scopes.values())this.#validateOwnerFinishIntents(c);
  }
  #validateOwnerFinishIntents(c){
    try{
      const owned=new Set(),commandRefs=new Set(),executions=new Map();
      for(const row of this.#ledger.query('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND operation=?',c.ownerRef,c.workspaceRef,OWNER_FINISH_INTENT_OPERATION)){
        const intent=this.#ownerFinishIntentRow(c,row),q=intent.request;
        if(owned.has(intent.receipt.recordRef)||commandRefs.has(q.commandRef))fail('STORAGE_INVALID');
        owned.add(intent.receipt.recordRef);commandRefs.add(q.commandRef);
        const key=canonical([q.taskRef,q.actionRef,q.claimRef,q.generationRef,q.executionRef]);
        const previous=executions.get(key),count=(previous?.count||0)+1;if(count>OWNER_FINISH_COMMAND_LIMIT)fail('STORAGE_INVALID');executions.set(key,{count,request:q});
        const historical=this.#ownerFinishHistorical(c,q);
        if(historical){const command=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,q.commandRef),finish=this.#auto(c,'normal_native_finish',q.claimRef);this.#validateFinish(c,finish,finish.finishRef,historical,command);}
        this.#ownerFinishProjection(c,intent,historical);
      }
      for(const entry of executions.values())this.#ownerFinishEntries(c,entry.request);
      for(const row of this.#ledger.query('SELECT id FROM runtime_data WHERE owner=? AND workspace=? AND kind=?',c.ownerRef,c.workspaceRef,OWNER_FINISH_INTENT_KIND))if(!owned.has(row.id))fail('STORAGE_INVALID');
    }catch{fail('STORAGE_INVALID');}
  }
  recordOwnerNativeFinishIntent(handle,value){
    const q=ownerFinishRequest(value),c=this.#ctx(handle,q.taskRef,['owner']);this.#task(c,q.taskRef);
    const prior=this.#normalRead(c,()=>{
      // Command-specific exact historical lookup precedes current CAS/claim work.
      const historical=this.#ownerFinishHistorical(c,q),intent=this.#ownerFinishIntent(c,q);
      if(intent)return this.#ownerFinishProjection(c,intent,historical);
      return historical?this.#ownerFinishLegacy():null;
    });
    if(prior)return prior;
    const commandRef=this.#ownerFinishIntentId(c,q.taskRef,q.commandRef);
    this.#mut(handle,{taskRef:q.taskRef,commandRef,request:q},['owner'],OWNER_FINISH_INTENT_OPERATION,c=>{
      const historical=this.#ownerFinishHistorical(c,q);if(historical)fail('OWNER_COMMAND_CONFLICT');
      for(const row of this.#ledger.query('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND operation=?',c.ownerRef,c.workspaceRef,OWNER_FINISH_INTENT_OPERATION))if(this.#ownerFinishIntentRow(c,row).request.commandRef===q.commandRef)fail('IDEMPOTENCY_CONFLICT');
      const t=this.#ownerFinishActive(c,q);
      const commandCount=this.#ledger.one('SELECT count(*) AS n FROM runtime_commands').n,heldCount=this.#ledger.one('SELECT count(*) AS n FROM reservations').n;
      if(commandCount+2+12*heldCount+this.#limits.maxControlCommands>this.#limits.maxCommands)fail('COMMAND_LIMIT');
      if(this.#ownerFinishEntries(c,q).length>=OWNER_FINISH_COMMAND_LIMIT)fail('OWNER_COMMAND_LIMIT');
      const pending={state:'intent_committed',request:q,ownerRequestDigest:finishDigest(c,q),settlement:null};
      const pendingBytes=Buffer.byteLength(this.#check({ok:true,value:pending},OWNER_FINISH_WIRE_LIMIT));
      // An original finish's whole result is limited by maxMetadataBytes. Reserve
      // that existing bound before recording a command whose later wire can grow.
      if(pendingBytes+this.#limits.maxMetadataBytes+64>OWNER_FINISH_WIRE_LIMIT)fail('OWNER_COMMAND_LIMIT');
      const content=canonical({contractVersion:'df.owner-finish-intent/v1',request:q,ownerRequestDigest:pending.ownerRequestDigest});
      const data=this.#data(c,t,{commandRef,kind:OWNER_FINISH_INTENT_KIND,content,sourceRef:q.commandRef});this.#check(data);
      return{contractVersion:'df.owner-finish-intent-receipt/v1',recordRef:data.recordRef,digest:data.digest,ownerRequestDigest:pending.ownerRequestDigest};
    },'terminal');
    return this.#normalRead(c,()=>this.#ownerFinishProjection(c,this.#requireOwnerFinishIntent(c,q)));
  }
  readOwnerNativeFinishCommand(handle,value){
    const input=detach(exact(value,['taskRef','commandRef']));Object.values(input).forEach(ref);
    const c=this.#ctx(handle,input.taskRef,['owner']);this.#task(c,input.taskRef);
    return this.#normalRead(c,()=>{
      const row=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,this.#ownerFinishIntentId(c,input.taskRef,input.commandRef));
      if(row)return this.#ownerFinishProjection(c,this.#ownerFinishIntentRow(c,row));
      const original=this.#ledger.one('SELECT * FROM runtime_commands WHERE owner=? AND workspace=? AND id=?',c.ownerRef,c.workspaceRef,input.commandRef);
      if(original){if(original.task!==input.taskRef)fail('UNAUTHORIZED');this.#commandReceipt(original,false,true);return this.#ownerFinishLegacy();}
      return this.#ownerFinishWire({state:'unreceived',request:null,ownerRequestDigest:null,settlement:null});
    });
  }
  listOwnerNativeFinishCommands(handle,value){
    const input=detach(exact(value,['taskRef','actionRef','claimRef','generationRef','executionRef']));Object.values(input).forEach(ref);
    const c=this.#ctx(handle,input.taskRef,['owner']);this.#task(c,input.taskRef);
    return this.#normalRead(c,()=>this.#ownerFinishWire({commands:this.#ownerFinishEntries(c,input)}));
  }
  #spent(c,task){let attempts=0,runtimeMs=0,usageUnits=0,costEstimateMicros=0;for(const row of this.#ledger.query('SELECT a.attempts,r.owner,r.workspace,r.task,r.spec,r.metadata FROM runtime_actions r JOIN actions a ON a.owner=r.owner AND a.workspace=r.workspace AND a.task=r.task AND a.id=r.action')){const s=normalizedSpec(parse(row.spec)),m=parse(row.metadata);if(!row.attempts)continue;if(s.charges.costState==='unknown'||m.usageState==='unknown')fail('WORKER_RESUME_PREDECESSOR_UNRESOLVED');if(row.owner===c.ownerRef&&row.workspace===c.workspaceRef&&row.task===task)attempts+=row.attempts;runtimeMs+=s.charges.runtimeMs;usageUnits+=Math.max(s.charges.usageUnits,m.usageState==='actual'?m.usageUnits||0:0);costEstimateMicros+=s.charges.costEstimateMicros;for(const n of [attempts,runtimeMs,usageUnits,costEstimateMicros])integer(n);}const limits=this.#getPolicy(c).limits,spent={attempts,runtimeMs,usageUnits,costEstimateMicros},remaining={attempts:limits.maxTotalAttempts-attempts,runtimeMs:limits.maxRuntimeMs-runtimeMs,usageUnits:limits.maxUsageUnits-usageUnits,costEstimateMicros:limits.maxCostEstimateMicros-costEstimateMicros};for(const k of Object.keys(remaining))if(remaining[k]<0)remaining[k]=null;return{spent,remaining};}
  #resumeOrigin(c,input,current=true){if(current)this.#cas(c,input);const capture=this.#nativeRows(c,'normal_native_capture').find(r=>r.value.taskRef===input.taskRef&&r.value.claimRef===input.predecessorClaimRef&&r.value.phase==='output')?.value;if(!capture)return null;const finish=this.#auto(c,'normal_native_finish',input.predecessorClaimRef),{intent,origin,resume}=this.#claimGraph(c,input.taskRef,input.predecessorClaimRef);if(intent.purpose!=='producer'||capture.purpose!=='producer'||capture.actionRef!==input.predecessorActionRef||capture.generationRef!==input.predecessorGenerationRef||capture.executionRef!==input.predecessorExecutionRef)fail('WORKER_RESUME_ORIGIN_UNAVAILABLE');if(!finish||finish.releaseState!=='released'||finish.usageState!=='actual'||finish.captureRef!==capture.captureRef)fail('WORKER_RESUME_PREDECESSOR_UNRESOLVED');const a=this.#action(c,input.taskRef,capture.actionRef);if(!a.metadata.releaseEvidenceRef||a.metadata.releaseEvidenceRef!==finish.releaseEvidenceRef||this.#ledger.one('SELECT 1 FROM reservations WHERE claim_id=?',a.claim_id))fail('WORKER_RESUME_PREDECESSOR_UNRESOLVED');const successors=this.#nativeRows(c,'normal_resume_claim').map(r=>r.value).filter(v=>v.predecessorClaimRef===input.predecessorClaimRef);if(successors.length>1)fail('STORAGE_INVALID');const ordinal=(resume?.ordinal??0)+1;if(ordinal>8)fail('WORKER_RESUME_DISABLED');return{intent,origin,capture,finish,predecessorResume:resume,ordinal,successors,...this.#spent(c,input.taskRef)};}
  readNormalResumeOrigin(handle,input){exact(input,['taskRef','predecessorActionRef','predecessorClaimRef','predecessorGenerationRef','predecessorExecutionRef','expectedTaskVersion','expectedAuthEpoch']);for(const k of ['taskRef','predecessorActionRef','predecessorClaimRef','predecessorGenerationRef','predecessorExecutionRef'])ref(input[k]);const c=this.#ctx(handle,input.taskRef,['owner']);return this.#normalRead(c,()=>this.#resumeOrigin(c,input));}
  readNormalNativeArtifact(handle,input){exact(input,['taskRef','artifactRef','version','expectedTaskVersion','expectedAuthEpoch']);const c=this.#ctx(handle,input.taskRef,['owner']);return this.#normalRead(c,()=>{this.#cas(c,input);const artifact=this.#artifact(c,input.taskRef,input.artifactRef,integer(input.version,1));if(!artifact)fail('ARTIFACT_NOT_FOUND');const capture=this.#nativeRows(c,'normal_native_capture').find(r=>r.value.taskRef===input.taskRef&&r.value.artifactRef===input.artifactRef&&r.value.artifactVersion===input.version)?.value;if(!capture)fail('NORMAL_NATIVE_ORIGIN_UNAVAILABLE');const graph=this.#claimGraph(c,input.taskRef,capture.claimRef),outputCapture=capture.outputCaptureRef?this.#auto(c,'normal_native_capture',capture.outputCaptureRef):capture;return{artifact,capture,outputCapture,intent:graph.intent,origin:graph.origin,finish:this.#auto(c,'normal_native_finish',capture.claimRef)};});}
  readNormalNativeAuditResult(handle,input){exact(input,['taskRef','resultRef','expectedTaskVersion','expectedAuthEpoch']);const c=this.#ctx(handle,input.taskRef,['owner']);return this.#normalRead(c,()=>{this.#cas(c,input);const result=this.#auditResult(c,input.resultRef).association,capture=this.#nativeRows(c,'normal_native_capture').find(r=>r.value.taskRef===input.taskRef&&r.value.phase==='output'&&r.value.auditBinding?.resultRef===input.resultRef)?.value;if(!capture)fail('NORMAL_NATIVE_ORIGIN_UNAVAILABLE');const graph=this.#claimGraph(c,input.taskRef,capture.claimRef);return{result,capture,intent:graph.intent,origin:graph.origin,finish:this.#auto(c,'normal_native_finish',capture.claimRef)};});}
  resolveNormalNativeIdentity(capability,input){exact(input,['taskRef','originRef','sessionRef']);const c=this.#normalAuthority(capability,true,ref(input.taskRef));return this.#normalRead(c,()=>{const origin=this.#auto(c,'normal_native_origin',ref(input.originRef)),intent=origin&&this.#auto(c,'normal_native_intent',origin.intentRef);if(!origin||!intent||origin.taskRef!==input.taskRef||origin.sessionRef!==input.sessionRef||intent.sourceRef!==c.sourceRef)fail('WORKER_RESUME_ORIGIN_UNAVAILABLE');const identity=canonicalContent(this.#privateData(c,input.taskRef,intent.identityRecordRef,'native_identity',intent.identityDigest).content,v=>exact(v,['nativeId']));return{nativeId:identity.nativeId};});}
  #validateResume(c,v,id,out){if(v.resumeRef!==id||out.resumeRef!==id||out.predecessorClaimRef!==v.predecessorClaimRef||out.predecessorOriginRef!==v.originRef)fail('STORAGE_INVALID');const origin=this.#auto(c,'normal_native_origin',v.originRef),capture=this.#auto(c,'normal_native_capture',v.predecessorCaptureRef),finish=this.#auto(c,'normal_native_finish',v.predecessorFinishRef);if(!origin||!capture||!finish||capture.purpose!=='producer'||capture.claimRef!==v.predecessorClaimRef||capture.originRef!==v.originRef||finish.captureRef!==capture.captureRef||finish.releaseState!=='released'||v.sessionRef!==origin.sessionRef)fail('STORAGE_INVALID');const previous=capture.resumeRef?this.#auto(c,'normal_resume',capture.resumeRef):null;if(v.ordinal!==(previous?.ordinal??0)+1)fail('STORAGE_INVALID');const history=canonicalContent(this.#privateData(c,v.taskRef,v.historyRecordRef,'native_history',v.historyDigest).content,resumeHistory),request=canonicalContent(this.#privateData(c,v.taskRef,v.inputRecordRef,'native_request',v.inputDigest).content,resumeInput),cfg=canonicalContent(this.#privateData(c,v.taskRef,v.configurationRecordRef,'native_configuration',v.configurationDigest).content,x=>configuration(x,undefined,this.#limits));this.#resumePairJoins(c,v,history,request,cfg);const a=this.#action(c,v.taskRef,out.action.actionRef);if(a.digest!==out.action.actionDigest||canonical(a.spec.resumeBinding)!==canonical({resumeRef:v.resumeRef,predecessorOriginRef:v.originRef,predecessorClaimRef:v.predecessorClaimRef,historyDigest:v.historyDigest,inputDigest:v.inputDigest})||a.spec.dataDigest!==v.contextDigest||a.spec.executor.sessionRef!==v.sessionRef)fail('STORAGE_INVALID');}
  #resumePairJoins(c,v,h,r,cfg){for(const k of ['ownerRef','workspaceRef'])if(h[k]!==c[k]||r[k]!==c[k])fail('SPEC_MISMATCH');for(const k of ['taskRef','originRef','ordinal','sessionRef','contextRecordRef','contextDigest'])if(h[k]!==v[k]||r[k]!==v[k])fail('SPEC_MISMATCH');if(h.predecessor.predecessorClaimRef!==v.predecessorClaimRef||r.historyDigest!==v.historyDigest||canonical(h.messages)!==canonical(r.historyMessages)||h.configurationRef!==v.configurationDigest||h.sourceRef!==canonicalDigest(cfg.source)||canonical(h.persistence)!==canonical(cfg.backend)||h.header.cwd!==cfg.environment.cwd)fail('SPEC_MISMATCH');const context=this.#preparedGraph(c,v.taskRef,v.contextRecordRef);if(context.context.digest!==v.contextDigest||context.context.content!==r.contextContent||context.binding.semanticRevision!==v.semanticRevision||context.binding.sourceTaskVersion!==v.sourceTaskVersion||context.binding.sourceAuthEpoch!==v.sourceAuthEpoch)fail('SPEC_MISMATCH');}
  readNormalResumeInput(handle,input){exact(input,['taskRef','resumeRef']);const c=this.#ctx(handle,input.taskRef,['owner']);return this.#normalRead(c,()=>{const association=this.#auto(c,'normal_resume',ref(input.resumeRef));if(!association||association.taskRef!==input.taskRef)fail('WORKER_RESUME_ORIGIN_UNAVAILABLE');const history=this.#privateData(c,input.taskRef,association.historyRecordRef,'native_history',association.historyDigest),request=this.#privateData(c,input.taskRef,association.inputRecordRef,'native_request',association.inputDigest),configurationData=this.#privateData(c,input.taskRef,association.configurationRecordRef,'native_configuration',association.configurationDigest);this.#resumePairJoins(c,association,canonicalContent(history.content,resumeHistory),canonicalContent(request.content,resumeInput),canonicalContent(configurationData.content,x=>configuration(x)));this.#requirePrepared(c,input.taskRef,association.contextRecordRef,true);return{association,history,request,configuration:configurationData};});}
  planNormalResume(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','contextRecordRef','predecessorClaimRef','historyContent','requestContent','configurationContent','spec']);const c=this.#normalAuthority(capability,true,ref(input.taskRef)),spec=normalizedSpec(input.spec);return this.#normalMut(c,input,'planNormalResume',c=>{
      const cfg=this.#normalConfiguration(c,input.configurationContent),graph=this.#requirePrepared(c,input.taskRef,input.contextRecordRef,true),h=canonicalContent(input.historyContent,resumeHistory),r=canonicalContent(input.requestContent,resumeInput),predecessor=h.predecessor;if(!spec.resumeBinding||spec.nativeOriginBinding||spec.executor.mode!=='resume'||input.predecessorClaimRef!==predecessor.predecessorClaimRef||graph.binding.committedTaskVersion!==input.expectedTaskVersion||graph.binding.committedAuthEpoch!==input.expectedAuthEpoch)fail('SPEC_MISMATCH');const previous=this.#resumeOrigin(c,{taskRef:input.taskRef,expectedTaskVersion:input.expectedTaskVersion,expectedAuthEpoch:input.expectedAuthEpoch,...Object.fromEntries(['predecessorActionRef','predecessorClaimRef','predecessorGenerationRef','predecessorExecutionRef'].map(k=>[k,predecessor[k]]))});if(!previous||previous.successors.length)fail('WORKER_RESUME_LINEAGE_CONFLICT');if(!cfg.configuration.continuation||previous.ordinal>cfg.configuration.continuation.maxContinuations)fail('WORKER_RESUME_DISABLED');const oldCfg=canonicalContent(this.#privateData(c,input.taskRef,previous.intent.configurationRecordRef,'native_configuration',previous.intent.configurationDigest).content,x=>configuration(x));const producerRoute=value=>{const role=value.selection.find(row=>row.purpose==='producer');return{selection:role.selection,systemPrompt:role.systemPrompt,recipeDigest:role.recipeDigest,preset:value.preset.find(row=>row.purpose==='producer'),tools:value.tools};};if(previous.intent.sourceRef!==c.sourceRef||canonical(oldCfg.backend)!==canonical(cfg.backend)||canonical(oldCfg.environment)!==canonical(cfg.environment)||canonical(producerRoute(oldCfg))!==canonical(producerRoute(cfg)))fail('WORKER_RESUME_ORIGIN_UNAVAILABLE');this.#normalSpecConfiguration(c,spec,cfg,graph);const historyLimits=cfg.configuration.continuation.history;if(h.events.length>historyLimits.maxEvents||h.messages.length>historyLimits.maxMessages||Buffer.byteLength(input.historyContent)>historyLimits.maxBytes)fail('WORKER_RESUME_HISTORY_LIMIT');const captured=canonicalContent(this.#privateData(c,input.taskRef,previous.capture.committedHistoryRecordRef,'native_history',previous.capture.committedHistoryDigest).content,historyObservation);if(canonical(h.header)!==canonical(captured.header)||canonical(h.events)!==canonical(captured.events)||canonical(h.surface)!==canonical(captured.surface)||canonical(h.messages)!==canonical(captured.messages))fail('WORKER_RESUME_HISTORY_STALE');if(predecessor.artifactRef!==previous.capture.artifactRef||predecessor.artifactDigest!==previous.capture.artifactDigest||predecessor.artifactVersion!==1||predecessor.releaseEvidenceRef!==previous.finish.releaseEvidenceRef)fail('WORKER_RESUME_LINEAGE_CONFLICT');const resumeRef=canonicalDigest(['df.normal-resume/v1',c.ownerRef,c.workspaceRef,input.taskRef,input.commandRef,input.predecessorClaimRef]),historyDigest=hash(input.historyContent),inputDigest=hash(input.requestContent),binding={resumeRef,predecessorOriginRef:previous.origin.originRef,predecessorClaimRef:input.predecessorClaimRef,historyDigest,inputDigest};if(canonical(spec.resumeBinding)!==canonical(binding)||spec.executor.sessionRef!==previous.origin.sessionRef)fail('SPEC_MISMATCH');const provisional={resumeRef,taskRef:input.taskRef,originRef:previous.origin.originRef,predecessorClaimRef:input.predecessorClaimRef,ordinal:previous.ordinal,sessionRef:previous.origin.sessionRef,contextRecordRef:graph.context.recordRef,contextDigest:graph.context.digest,historyDigest,configurationDigest:hash(input.configurationContent),semanticRevision:graph.binding.semanticRevision,sourceTaskVersion:graph.binding.sourceTaskVersion,sourceAuthEpoch:graph.binding.sourceAuthEpoch};this.#resumePairJoins(c,provisional,h,r,cfg);const action=this.#planEffect(this.#originalEffectAuthority(c,input.taskRef),input,spec,true),t=this.#task(c,input.taskRef),configData=this.#data(c,t,{commandRef:input.commandRef,kind:'native_configuration',content:input.configurationContent,sourceRef:resumeRef}),historyData=this.#data(c,t,{commandRef:input.commandRef,kind:'native_history',content:input.historyContent,sourceRef:resumeRef}),requestData=this.#data(c,t,{commandRef:input.commandRef,kind:'native_request',content:input.requestContent,sourceRef:resumeRef}),resume={contractVersion:'df.normal-native/normal_resume/v1',...provisional,predecessorCaptureRef:previous.capture.captureRef,predecessorFinishRef:previous.finish.finishRef,historyRecordRef:historyData.recordRef,inputRecordRef:requestData.recordRef,inputDigest,configurationRecordRef:configData.recordRef,createdAt:this.#now()};this.#newNative(c,'normal_resume',resumeRef,input.taskRef,resume);return{action,resumeRef,predecessorOriginRef:resume.originRef,predecessorClaimRef:resume.predecessorClaimRef,sessionRef:resume.sessionRef,historyRecordRef:resume.historyRecordRef,historyDigest:resume.historyDigest,inputRecordRef:resume.inputRecordRef,inputDigest:resume.inputDigest,contextRecordRef:resume.contextRecordRef,contextDigest:resume.contextDigest,semanticRevision:resume.semanticRevision,sourceTaskVersion:resume.sourceTaskVersion,sourceAuthEpoch:resume.sourceAuthEpoch};
    });}
  claimNormalResume(capability,input){input=normalInput(input);exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','actionRef','actionDigest','resumeRef']);const c=this.#normalAuthority(capability,true,ref(input.taskRef));return this.#normalMut(c,input,'claimNormalResume',c=>{
      const resume=this.#auto(c,'normal_resume',ref(input.resumeRef)),a=this.#action(c,input.taskRef,input.actionRef);if(!resume||resume.taskRef!==input.taskRef||a.spec.resumeBinding?.resumeRef!==input.resumeRef||a.spec.executor.mode!=='resume')fail('SPEC_MISMATCH');const graph=this.#requirePrepared(c,input.taskRef,resume.contextRecordRef,true),cfg=this.#normalConfiguration(c,this.#privateData(c,input.taskRef,resume.configurationRecordRef,'native_configuration',resume.configurationDigest).content);this.#normalSpecConfiguration(c,a.spec,cfg,graph);const capture=this.#auto(c,'normal_native_capture',resume.predecessorCaptureRef),previous=this.#resumeOrigin(c,{taskRef:input.taskRef,expectedTaskVersion:input.expectedTaskVersion,expectedAuthEpoch:input.expectedAuthEpoch,predecessorActionRef:capture.actionRef,predecessorClaimRef:capture.claimRef,predecessorGenerationRef:capture.generationRef,predecessorExecutionRef:capture.executionRef});if(previous.successors.length)fail('WORKER_RESUME_LINEAGE_CONFLICT');if(!cfg.configuration.continuation||resume.ordinal>cfg.configuration.continuation.maxContinuations||previous.intent.sourceRef!==c.sourceRef)fail('WORKER_RESUME_ORIGIN_UNAVAILABLE');const receipt=this.#claimEffect(this.#originalEffectAuthority(c,input.taskRef),input,true),claim={contractVersion:'df.normal-native/normal_resume_claim/v1',claimRef:receipt.claimRef,resumeRef:resume.resumeRef,taskRef:input.taskRef,originRef:resume.originRef,predecessorClaimRef:resume.predecessorClaimRef,actionRef:receipt.actionRef,actionDigest:receipt.actionDigest,generationRef:receipt.generationRef,sessionRef:resume.sessionRef,reservationRef:receipt.reservationRef,createdAt:this.#now()};this.#newNative(c,'normal_resume_claim',claim.claimRef,input.taskRef,claim);return{receipt,resumeRef:resume.resumeRef,originRef:resume.originRef,sessionRef:resume.sessionRef,identityRecordRef:previous.intent.identityRecordRef};
    });}

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

const preparationSourceMethod=Object.getOwnPropertyDescriptor(RuntimeStore.prototype,PREPARATION_SOURCE).value;
export function assertPreparationSourceBinding(store,capability,handle,namespaceRef,taskRef){try{return detach(preparationSourceMethod.call(store,capability,handle,namespaceRef,taskRef));}catch(error){if(error instanceof FoundationError)throw error;fail('UNAUTHORIZED');}}

// Internal import composition: exact original descriptors; no elevated handles.
export const preparationSourceMethods=Object.freeze(Object.fromEntries(['memoryBinding','getMemory','putMemory','listMemory','deleteMemory','memoryCommandReceipt','snapshot','readData','task','preparedContextCommandReceipt','preparedContextStatus','putPreparedContext'].map(name=>[name,Object.getOwnPropertyDescriptor(RuntimeStore.prototype,name).value])));
