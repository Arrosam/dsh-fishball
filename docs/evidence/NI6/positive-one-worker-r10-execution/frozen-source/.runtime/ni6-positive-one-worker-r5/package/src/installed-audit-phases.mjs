import { BootstrapError } from './config.mjs';
import { canonical, canonicalDigest, exact, hash } from './runtime-security.mjs';
import { immutable } from './installed-worker-facts.mjs';
const fail = () => { throw new BootstrapError('AUDIT_RECEIPT_INVALID'); };
const tags = {captureAuditResult:'df.installed-audit.capture/v1',submitAuditResult:'df.installed-audit.submit/v1',writeArtifact:'df.installed-audit.repair-artifact/v1'};
export function createAuditPhases({ownerRef,workspaceRef,check,planFor,manager,bindReviewer,submit,writeArtifact}) {
  const reviewers=new Map(), intents=new Map();let active=true;
  const assert=()=>{check();if(!active)fail();};
  function binding(row,outer) {const a=row.pair.association;return immutable({ownerRef,workspaceRef,taskRef:outer.taskRef,auditRef:a.auditRef,auditRevision:a.auditRevision,round:a.round,semanticRevision:a.semanticRevision,bindingDigest:a.bindingDigest,materialDigest:a.materialDigest,artifactRef:a.artifactRef,artifactVersion:a.artifactVersion,artifactDigest:a.artifactDigest,inputRecordRef:a.recordRef,inputDigest:a.digest,purpose:a.purpose,actionRef:row.spec.actionRef,actionDigest:row.actionDigest,claimRef:outer.claimRef,generationRef:outer.generationRef,sessionRef:row.spec.executor.sessionRef,executionRef:outer.executionRef,outerInput:outer});}
  const command=(operation,outer,b,phaseInput)=>canonicalDigest([tags[operation],outer.commandRef,{binding:b,phaseInput}]);
  return Object.freeze({
    afterDispatch(input,out){assert();const row=planFor(input.taskRef,input.actionRef),w=out.worker??out;if(row.spec.role==='review'){
      if(reviewers.has(w.claimRef))fail();const handle=Object.freeze({});bindReviewer(handle,{taskRef:w.taskRef,auditRef:row.pair.association.auditRef,claimRef:w.claimRef,generationRef:w.generationRef,sessionRef:w.sessionRef});assert();reviewers.set(w.claimRef,{handle,binding:{taskRef:w.taskRef,auditRef:row.pair.association.auditRef,claimRef:w.claimRef,generationRef:w.generationRef,sessionRef:w.sessionRef}});
    }return out;},
    async collect(outer,privateInput){
      assert();exact(privateInput,['operationRef','artifactTarget']);const row=planFor(outer.taskRef,outer.actionRef),b=binding(row,outer);
      const fixed=row.spec.role==='repair'?{artifactRef:row.pair.association.artifactRef,version:row.pair.association.artifactVersion+1}:null;
      if(canonical(privateInput.artifactTarget)!==canonical(fixed)||privateInput.operationRef!==canonicalDigest(['df.installed-audit.collect-operation/v1',{ownerRef,workspaceRef,taskRef:outer.taskRef},outer]))fail();
      const key=outer.executionRef;let intent=intents.get(key);
      if(!intent){
        const validated=await manager().validateAuditResult(outer);assert();const {result,facts}=validated;
        if(result.executionRef!==outer.executionRef||facts.executionRef!==outer.executionRef||facts.resultDigest!==result.digest||result.inputDigest!==b.inputDigest||result.dataDigest!==b.artifactDigest||result.claimRef!==outer.claimRef||result.sessionRef!==b.sessionRef)fail();
        const captureBase={taskRef:outer.taskRef,claimRef:outer.claimRef,generationRef:outer.generationRef,executionRef:outer.executionRef,sessionRef:result.sessionRef,inputCursor:facts.inputCursor,cursor:result.cursor,content:result.content,evidenceRef:facts.evidenceRef};
        const {content,...rest}=captureBase,phaseInput={...rest,contentDigest:hash(content),contentByteLength:Buffer.byteLength(content)};
        const commandRef=command('captureAuditResult',outer,b,phaseInput);
        intent={outer:immutable(outer),binding:b,validated,captureCAS:immutable({...outer,commandRef}),capture:null,child:null,complete:null,busy:false};intents.set(key,intent);
      }
      if(intent.binding.actionRef!==b.actionRef||intent.binding.claimRef!==b.claimRef||intent.binding.generationRef!==b.generationRef||intent.binding.inputDigest!==b.inputDigest||intent.busy)fail();
      intent.busy=true;
      try{
        if(!intent.capture){assert();intent.capture=await manager().captureValidatedAuditResult(intent.captureCAS);assert();}
        const capture=intent.capture,original=intent.outer,originalBinding=intent.binding;
        if(!intent.child){
          if(row.spec.role==='review'){
            const reviewer=reviewers.get(original.claimRef);if(!reviewer)fail();
            const base={taskRef:original.taskRef,auditRef:b.auditRef,executionRef:original.executionRef,resultRef:capture.resultRef};
            const phaseInput={...base,resultRecordRef:capture.recordRef,resultDigest:capture.digest,reviewerBinding:reviewer.binding};
            intent.child={operation:'submitAuditResult',handle:reviewer.handle,input:immutable({...base,commandRef:command('submitAuditResult',original,originalBinding,phaseInput)})};
          }else{
            const content=intent.validated.result.content,base={taskRef:original.taskRef,expectedTaskVersion:original.expectedTaskVersion,expectedAuthEpoch:original.expectedAuthEpoch,artifactRef:fixed.artifactRef,version:fixed.version,producerClaimRef:original.claimRef,generationRef:original.generationRef};
            const phaseInput={resultRef:capture.resultRef,resultRecordRef:capture.recordRef,resultDigest:capture.digest,artifactWrite:{...base,contentDigest:hash(content),contentByteLength:Buffer.byteLength(content)}};
            intent.child={operation:'writeArtifact',input:immutable({...base,content,commandRef:command('writeArtifact',original,originalBinding,phaseInput)})};
          }
        }
        // Retained exact child input precedes the guarded original publisher.
        // Reconciliation calls the same original idempotent store command;
        // no transcript reread, native wakeup or target recomputation occurs.
        assert();const child=intent.child;const actual=child.operation==='submitAuditResult'?submit(child.handle,child.input):writeArtifact(child.input);assert();intent.complete=immutable(actual);return intent.complete;
      }catch(error){assert();throw error;}finally{intent.busy=false;}
    },
    capturedRepairFacts(input){assert();for(const intent of intents.values()){
      const artifact=intent.child?.operation==='writeArtifact'&&intent.complete;if(!artifact||artifact.artifactRef!==input.artifactRef||artifact.version!==input.artifactVersion||artifact.digest!==input.digest||intent.binding.taskRef!==input.taskRef)continue;
      const b=intent.binding,result=intent.validated.result;return immutable({taskRef:input.taskRef,artifactRef:artifact.artifactRef,artifactVersion:artifact.version,recordRef:artifact.recordRef,digest:artifact.digest,producerClaimRef:b.claimRef,generationRef:b.generationRef,sessionRef:b.sessionRef,executionRef:b.executionRef,inputDigest:b.inputDigest,cursor:result.cursor,resultDigest:result.digest});
    }fail();},
    seal(){active=false;reviewers.clear();},
  });
}
