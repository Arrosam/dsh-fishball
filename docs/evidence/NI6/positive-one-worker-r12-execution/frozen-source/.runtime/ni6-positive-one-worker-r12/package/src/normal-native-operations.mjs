import { markFinishWait } from './installed-invocation.mjs';
// Inert root-owned operation proposal over the original NativeAdapter. No
// replacement Agent/Registry/Session, model class or untrusted capability seam.
import { workerDeadline } from './worker.mjs';
import { NativeAdapter } from './native-adapter.mjs';
import { canonical, canonicalDigest, hash, exact, integer, ref } from './runtime-security.mjs';
import { ownerFinishRequest } from './normal-contracts.mjs';
import { immutable } from './installed-worker-facts.mjs';
import { workerDigest } from './environment.mjs';
import { BootstrapError } from './config.mjs';
const fail=code=>{throw new BootstrapError(code);};
const key=value=>`${value.taskRef}:${value.actionRef}`;
const casKeys=['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch'];
const actionKeys=[...casKeys,'actionRef','actionDigest'];
const captureKeys=['taskRef','actionRef','claimRef','generationRef','executionRef','commandRef','expectedTaskVersion','expectedAuthEpoch'];

// nativeAdapter is the ORIGINAL same-root instance with proposed four-hook
// result widening. plans are private genuine owner-planner outputs. The root
// never exposes rememberPlan/register/create closures as model-facing methods.
export function createNormalNativeOperations({ core, nativeAdapter, check, publish }) {
  if(nativeAdapter!==undefined&&!(nativeAdapter instanceof NativeAdapter))fail('RUNTIME_ADAPTER_INVALID');
  const plans=new Map(), entries=new Map(); let active=true;
  const current=()=>{check();if(!active)fail('SERVICE_DISPOSED');};
  function snapshot(value,cas=true){current();const s=core.snapshot({taskRef:value.taskRef});if(cas&&(s.task.version!==value.expectedTaskVersion||s.task.authEpoch!==value.expectedAuthEpoch))fail('STALE_VERSION');return s;}
  function plan(value){current();const row=plans.get(key(value));if(!row)fail('WORKER_MAPPING_MISMATCH');const s=snapshot(value,false),actual=s.actions.find(a=>a.actionRef===value.actionRef);if(!actual||actual.actionDigest!==row.actionDigest||canonical(actual.spec)!==canonical(row.spec)||value.actionDigest!==undefined&&value.actionDigest!==row.actionDigest)fail('WORKER_MAPPING_MISMATCH');row.assertCurrent();return row;}
  function entry(value){const row=entries.get(key(value));if(!row||row.claimRef!==value.claimRef||row.generationRef!==value.generationRef||value.executionRef!==undefined&&row.execution?.executionRef!==value.executionRef)fail('WORKER_MAPPING_MISMATCH');return row;}
  function observe(row,receipt){current();if(['stopped','not_created'].includes(row.worker?.phase)&&receipt.phase!==row.worker.phase)return row.worker;for(const f of ['taskRef','actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef'])if(receipt[f]!==row[f])fail('WORKER_RECEIPT_INVALID');const out=core.hostCall('workerObservation',{taskRef:row.taskRef,claimRef:row.claimRef,generationRef:row.generationRef,commandRef:canonicalDigest(['df.normal-native.observe/v1',row.claimRef,receipt.phase,receipt.cursor,receipt.evidenceRef]),phase:receipt.phase,cursor:receipt.cursor,evidenceRef:receipt.evidenceRef,sessionRef:row.sessionRef});row.worker=immutable(receipt);return out;}
  const view=row=>immutable({taskRef:row.taskRef,actionRef:row.actionRef,actionDigest:row.actionDigest,claimRef:row.claimRef,reservationRef:row.reservationRef,generationRef:row.generationRef,sessionRef:row.sessionRef,phase:row.worker?.phase??'unknown'});
  function unknown(row){row.unknown=true;try{observe(row,{...view(row),phase:'unknown',cursor:row.worker?.cursor??0,evidenceRef:workerDigest('worker-unknown',row.claimRef,row.worker?.cursor??0)});}catch{row.worker=immutable({...view(row),phase:'unknown'});}return view(row);}
  function requestDeadlineCancellation(row){
    row.stopRequested=true;
    // Request the ORIGINAL public owned Agent cancellation while this exact
    // owner carrier is still current. It does not prove closure or release.
    try{current();row.plan.assertCurrent();row.cancellation=Promise.resolve(nativeAdapter.cancel(row.ticket)).then(receipt=>{current();row.plan.assertCurrent();observe(row,receipt);return receipt;}).catch(()=>{row.unknown=true;});}catch{row.unknown=true;}
  }
  async function dispatch(value) {
    exact(value,[...actionKeys,'timeoutMs'],actionKeys);const{timeoutMs:providedTimeout,...request}=value;const timeoutMs=integer(providedTimeout??10000,1,60000);value=immutable(request);snapshot(value);const p=plan(value);
    if(entries.has(key(value)))fail('WORKER_ALREADY_SUBMITTED');
    const before=snapshot(value),ticket=await nativeAdapter.prepare(p.spec,before.task,p.actionDigest);current();p.assertCurrent();snapshot(value);
    // Read-only model readiness precedes the original charged claim. Neither
    // retries native creation nor adopts an old unknown claim.
    const claimed=p.spec.executor.mode==='resume'?core.native.claimNormalResume({...value,resumeRef:p.spec.resumeBinding.resumeRef}):core.native.claimNormalCreate({...value,nativeId:'df-'+p.spec.executor.generationRef,configurationContent:p.configurationContent,...(p.auditRepair?{auditRepair:p.auditRepair}:{})});
    const row={...claimed.receipt,taskRef:value.taskRef,actionRef:value.actionRef,actionDigest:value.actionDigest,sessionRef:claimed.sessionRef,ticket,plan:p,originRef:claimed.originRef,execution:null,capture:null,artifactCapture:null,finishAttempted:false,unknown:false};entries.set(key(value),row);
    nativeAdapter.bindClaim(ticket,claimed.receipt,()=>{current();core.hostCall('assertClaimCurrent',{taskRef:row.taskRef,claimRef:row.claimRef,generationRef:row.generationRef,actionDigest:row.actionDigest});return true;});
    core.hostCall('workerObservation',{taskRef:row.taskRef,claimRef:row.claimRef,generationRef:row.generationRef,commandRef:workerDigest('submitted',row.claimRef),phase:'submitted',evidenceRef:workerDigest('submitted-evidence',row.claimRef),sessionRef:row.sessionRef});
    row.detach=nativeAdapter.observe(ticket,r=>{try{observe(row,r);}catch{row.unknown=true;}});
    const completion=Promise.resolve().then(async()=>{
      const created=await (p.spec.executor.mode==='resume'?nativeAdapter.resume(ticket):nativeAdapter.create(ticket));current();p.assertCurrent();observe(row,created);
      if(row.stopRequested||!active){observe(row,await nativeAdapter.cancel(ticket));observe(row,await nativeAdapter.dispose(ticket));return view(row);}
      if(p.spec.executor.mode==='create'){
        const baseline=await nativeAdapter.observeBaselineHistory(ticket);current();p.assertCurrent();
        if(row.stopRequested){observe(row,await nativeAdapter.cancel(ticket));current();observe(row,await nativeAdapter.dispose(ticket));current();return view(row);}
        const baselineHistoryContent=canonical(baseline);
        core.native.recordNormalNativeOrigin({taskRef:row.taskRef,commandRef:canonicalDigest(['df.normal-native.origin-command/v1',value.commandRef,baseline]),actionRef:row.actionRef,actionDigest:row.actionDigest,claimRef:row.claimRef,generationRef:row.generationRef,sessionRef:row.sessionRef,originRef:row.originRef,creationEvidenceRef:created.evidenceRef,baselineHistoryContent,baselineHistoryDigest:hash(baselineHistoryContent)});
      }
      // Resume joins its genuine resume_claim to the old origin; no new create
      // origin/empty baseline is manufactured for this successor.
      observe(row,nativeAdapter.query(ticket));return view(row);
    }).catch(()=>unknown(row));row.completion=completion;
    return workerDeadline(completion,timeoutMs,()=>{requestDeadlineCancellation(row);return unknown(row);});
  }
  async function execute(value,audit=false){
    const required=[...actionKeys,'claimRef','generationRef',audit?'inputRecordRef':'contextRecordRef'];exact(value,[...required,'timeoutMs'],required);const{timeoutMs:providedTimeout,...request}=value;const timeoutMs=integer(providedTimeout??10000,1,60000);value=immutable(request);snapshot(value);const p=plan(value),row=entry(value);if(row.execution||row.unknown)fail('WORKER_EXECUTION_ALREADY_SUBMITTED');
    const intent=core.hostCall(audit?'beginAuditExecution':'beginContextExecution',value);if(intent.deduplicated===true||intent.state!=='intent_committed')return immutable({executionRef:intent.executionRef,state:intent.state,admitted:false});
    const fields=audit?['executionRef','taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','inputRecordRef','inputDigest','dataDigest','auditRef','bindingDigest','materialDigest','purpose','semanticRevision']:['executionRef','taskRef','claimRef','generationRef','contextRecordRef','actionDigest','dataDigest'];
    const binding=immutable(Object.fromEntries(fields.map(f=>[f,intent[f]])));
    const data=core.readData({taskRef:value.taskRef,recordRef:audit?value.inputRecordRef:value.contextRecordRef});const body=immutable(Object.fromEntries(['recordRef','kind','content','digest','byteLength'].map(f=>[f,data[f]])));row.execution=binding;
    const completion=Promise.resolve().then(async()=>{const out=await (audit?nativeAdapter.executeAuditInput(row.ticket,binding,body,()=>core.hostCall('assertExecutionCurrent',{taskRef:row.taskRef,claimRef:row.claimRef,generationRef:row.generationRef,actionDigest:row.actionDigest,executionRef:binding.executionRef})):nativeAdapter.executeContext(row.ticket,binding,body,()=>core.hostCall('assertExecutionCurrent',{taskRef:row.taskRef,claimRef:row.claimRef,generationRef:row.generationRef,actionDigest:row.actionDigest,executionRef:binding.executionRef})));current();p.assertCurrent();if(out.worker)observe(row,out.worker);if(out.state!=='committed')row.unknown=true;return out;}).catch(()=>({executionRef:binding.executionRef,state:'unknown',worker:unknown(row)}));row.completion=completion;
    return workerDeadline(completion,timeoutMs,()=>{requestDeadlineCancellation(row);return immutable({executionRef:binding.executionRef,state:'unknown',worker:unknown(row)});});
  }
  async function capture(value,audit=false){
    exact(value,audit?captureKeys:[...captureKeys,'artifactRef','version']);value=immutable(value);snapshot(value);const row=entry(value);if(row.capture)fail('WORKER_RESULT_ALREADY_CAPTURED');
    const facts=await nativeAdapter.validateResult(row.ticket,value.executionRef);current();snapshot(value);row.plan.assertCurrent();const result=nativeAdapter.readResult(row.ticket,value.executionRef),h=canonical(facts.historyObservation);
    if(audit){row.capture=core.native.captureNormalNativeAuditResult({taskRef:row.taskRef,commandRef:value.commandRef,claimRef:row.claimRef,generationRef:row.generationRef,executionRef:value.executionRef,sessionRef:row.sessionRef,inputCursor:facts.inputCursor,cursor:result.cursor,content:result.content,evidenceRef:facts.evidenceRef,committedHistoryContent:h,committedHistoryDigest:hash(h),usageUnits:facts.usageUnits});}
    else{const inputEvents=facts.historyObservation.events.filter(e=>e.type==='user/message'&&e.data.id===value.executionRef);if(inputEvents.length!==1)fail('WORKER_RESULT_UNAVAILABLE');const source={taskRef:row.taskRef,actionRef:row.actionRef,actionDigest:row.actionDigest,claimRef:row.claimRef,generationRef:row.generationRef,sessionRef:row.sessionRef,executionRef:value.executionRef,inputDigest:result.dataDigest,cursor:result.cursor,resultDigest:result.digest};row.capture=core.native.captureNormalNativeResult({...value,actionDigest:row.actionDigest,sessionRef:row.sessionRef,resultContent:JSON.stringify({contractVersion:'df.native-result/v1',source,content:result.content}),resultDigest:result.digest,inputDigest:result.dataDigest,inputCursor:inputEvents[0].seq,cursor:result.cursor,persistenceEvidenceRef:facts.evidenceRef,committedHistoryContent:h,committedHistoryDigest:hash(h),usageUnits:facts.usageUnits});}
    row.usageUnits=facts.usageUnits;publish(audit?'captureAuditResult':'captureResult',value,row.capture.receipt);return row.capture.receipt;
  }
  function assertFinishReady(value){
    const q=ownerFinishRequest(value);current();const s=snapshot(q),row=entry(q);row.plan.assertCurrent();
    if(!row.capture||row.finishAttempted)fail('WORKER_FINISH_UNAVAILABLE');
    // Durable capture is a SEPARATE pre-Q owner operation. Re-read the genuine
    // authorized core projection; this private map is never its proof source.
    const cas={taskRef:q.taskRef,expectedTaskVersion:q.expectedTaskVersion,expectedAuthEpoch:q.expectedAuthEpoch};
    const purpose=row.plan.spec.executionInput?.purpose??'producer';
    const captured=purpose==='producer'?core.readArtifact({...cas,artifactRef:row.capture.receipt.artifactRef,version:row.capture.receipt.version}):core.readAuditResult({...cas,resultRef:row.capture.receipt.resultRef});
    const output=purpose==='producer'?captured.outputCapture:captured.capture;
    if(!output||output.captureRef!==row.capture.captureRef||output.phase!=='output'||output.purpose!==purpose||output.actionDigest!==row.actionDigest||output.sessionRef!==row.sessionRef||output.usageUnits!==row.usageUnits||['taskRef','actionRef','claimRef','generationRef','executionRef'].some(k=>output[k]!==q[k]))fail('WORKER_FINISH_UNAVAILABLE');
    if(purpose!=='producer'){
      const executions=s.executions.filter(e=>e.executionRef===q.executionRef&&e.taskRef===q.taskRef&&e.actionRef===q.actionRef&&e.actionDigest===row.actionDigest&&e.claimRef===q.claimRef&&e.generationRef===q.generationRef&&e.sessionRef===row.sessionRef&&e.resultRef===captured.result.resultRef);
      if(executions.length!==1)fail('WORKER_FINISH_UNAVAILABLE');
      if(purpose==='audit_review'&&executions[0].reportRef){
        const reports=s.reviews.filter(v=>v.reportRef===executions[0].reportRef&&v.resultRef===captured.result.resultRef&&v.generationRef===q.generationRef);
        if(reports.length!==1)fail('WORKER_FINISH_UNAVAILABLE');
      }
      if(row.artifactCapture){
        if(purpose!=='audit_repair')fail('WORKER_FINISH_UNAVAILABLE');
        const a=core.readArtifact({...cas,artifactRef:row.artifactCapture.receipt.artifactRef,version:row.artifactCapture.receipt.version});
        if(a.capture.captureRef!==row.artifactCapture.captureRef||a.capture.phase!=='repair_artifact'||a.capture.outputCaptureRef!==output.captureRef||a.outputCapture.captureRef!==output.captureRef||a.capture.claimRef!==q.claimRef||a.capture.generationRef!==q.generationRef||a.capture.executionRef!==q.executionRef)fail('WORKER_FINISH_UNAVAILABLE');
      }
      // Absent report/artifact evidence remains absent. The unchanged writer
      // may finish held; readiness does not create role completion or release.
    }
    current();row.plan.assertCurrent();snapshot(q);return row;
  }
  return Object.freeze({
    assertFinishReady(value){assertFinishReady(value);},
    bindAdapter(actual){current();if(nativeAdapter||!(actual instanceof NativeAdapter))fail('RUNTIME_ADAPTER_INVALID');nativeAdapter=actual;},
    readPrivatePlan(binding){const p=plan(binding);if(p.spec.executor.generationRef!==binding.generationRef||p.spec.executor.sessionRef!==binding.sessionRef)fail('WORKER_MAPPING_MISMATCH');return p;},
    rememberPlan(actual){current();exact(actual,['taskRef','spec','actionDigest','configurationContent','assertCurrent','resume','auditRepair'],['taskRef','spec','actionDigest','configurationContent','assertCurrent']);const k=key({taskRef:actual.taskRef,actionRef:actual.spec.actionRef}),prior=plans.get(k);if(prior){if(prior.actionDigest!==actual.actionDigest||canonical(prior.spec)!==canonical(actual.spec)||prior.configurationContent!==actual.configurationContent)fail('IDEMPOTENCY_CONFLICT');prior.assertCurrent();return;}plans.set(k,actual);},
    dispatch,executeContext:value=>execute(value),executeAuditInput:value=>execute(value,true),captureResult:value=>capture(value),captureAuditResult:value=>capture(value,true),
    resolveSession({mode,generationRef,sessionRef}){current();const candidates=[...plans.values()].filter(p=>p.spec.executor.mode===mode&&p.spec.executor.generationRef===generationRef&&p.spec.executor.sessionRef===sessionRef);if(candidates.length!==1)fail('WORKER_RESUME_ORIGIN_UNAVAILABLE');const p=candidates[0];p.assertCurrent();if(mode==='create')return 'df-'+generationRef;const identity=core.native.resolveNormalNativeIdentity({taskRef:p.taskRef,originRef:p.resume.originRef,sessionRef});if(hash(identity.nativeId)!==sessionRef)fail('WORKER_RESUME_LINEAGE_CONFLICT');return identity.nativeId;},
    repairArtifact(value){current();const row=[...entries.values()].find(r=>r.taskRef===value.taskRef&&r.claimRef===value.producerClaimRef&&r.generationRef===value.generationRef);if(!row?.capture||row.plan.spec.executionInput?.purpose!=='audit_repair')fail('AUDIT_BINDING_MISMATCH');row.artifactCapture=core.native.writeNormalNativeRepairArtifact({...value,outputCaptureRef:row.capture.captureRef});publish('writeArtifact',value,row.artifactCapture.receipt);return row.artifactCapture.receipt;},
    async finish(value){markFinishWait('N01');
      // Strict owner8-field lookup FIRST, before even this closure's active map
      // and current source/FS/native checks. Historical ack returns unchanged.
      const q=ownerFinishRequest(value),ack=core.readFinishFirst(q);if(ack!==null)return ack.receipt;
      const row=assertFinishReady(q);row.finishAttempted=true;
      // Only the genuine successful typed capture above can admit this stage.
      // A deadline/query alone never substitutes for it. Actual owned stop and
      // original role/usage writer still determine held versus release.
      // A failed/lost stop or mutation remains held. No automatic stop retry or
      // acknowledged unknown-usage finish is invented.
      markFinishWait('N02');const stopped=await nativeAdapter.finishExecution(row.ticket,q.executionRef);markFinishWait('N03');current();row.plan.assertCurrent();
      if(stopped.worker.phase!=='stopped'||stopped.usageUnits!==row.usageUnits)fail('WORKER_FINISH_UNAVAILABLE');observe(row,stopped.worker);
      // Existing original query repeats factual absence and publication-drift
      // guard at the last synchronous boundary before the exact-Q writer.
      const terminal=nativeAdapter.query(row.ticket);if(canonical(terminal)!==canonical(stopped.worker))fail('WORKER_FINISH_UNAVAILABLE');current();row.plan.assertCurrent();
      markFinishWait('N04');const out=core.native.finishNormalNativeExecution({taskRef:q.taskRef,commandRef:q.commandRef,claimRef:q.claimRef,generationRef:q.generationRef,executionRef:q.executionRef,captureRef:row.capture.captureRef,terminalEvidenceRef:stopped.worker.evidenceRef,outcomeEvidenceRef:stopped.evidenceRef,usage:{state:'actual',units:stopped.usageUnits},ownerRequest:q,artifactCaptureRef:row.artifactCapture?.captureRef??null});markFinishWait('N05');return out.receipt;
    },
    sessionLink(value){current();exact(value,['taskRef','actionRef','claimRef','generationRef']);snapshot(value,false);return nativeAdapter.sessionLink(entry(value).ticket);},
    async validateAuditResult(value){current();snapshot(value);const row=entry(value),facts=await nativeAdapter.validateResult(row.ticket,value.executionRef);current();snapshot(value);return{result:nativeAdapter.readResult(row.ticket,value.executionRef),facts};},
    query(value){current();exact(value,['taskRef','actionRef','claimRef','generationRef']);snapshot(value,false);return nativeAdapter.query(entry(value).ticket);},
    async cancelAfterControl(taskRef){current();ref(taskRef);const snapshot=core.snapshot({taskRef});if(!['cancel_requested','cancelled'].includes(snapshot.task.status)&&snapshot.control!=='paused')fail('WORKER_CONTROL_REQUIRED');const results=[];
      for(const row of entries.values())if(row.taskRef===taskRef){if(['stopped','not_created'].includes(row.worker?.phase)){results.push(view(row));continue;}row.stopRequested=true;try{observe(row,{...view(row),phase:'cancel_requested',cursor:row.worker?.cursor??0,evidenceRef:workerDigest('cancel-requested',row.claimRef,row.worker?.cursor??0)});current();observe(row,await nativeAdapter.cancel(row.ticket));current();observe(row,await nativeAdapter.dispose(row.ticket));current();}catch{unknown(row);}results.push(view(row));}
      // Factual owned stop retains the original reservation. No settlement,
      // usage, native-finish marker or arbitrary external rollback is inferred.
      return immutable(results);
    },
    async close(){active=false;for(const row of entries.values()){row.detach?.();await nativeAdapter.shutdown(row.ticket);}entries.clear();plans.clear();},
  });
}
