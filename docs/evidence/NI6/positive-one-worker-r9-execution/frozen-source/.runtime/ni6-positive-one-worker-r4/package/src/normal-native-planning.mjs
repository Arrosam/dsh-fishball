import { canonical, canonicalDigest, hash, exact, normalizedSpec } from './runtime-security.mjs';
import { immutable, installedRef as R } from './installed-worker-facts.mjs';
import { BootstrapError } from './config.mjs';
const fail=code=>{throw new BootstrapError(code);};
// Called only by the private original installed producer/audit planner after
// its own actual source/CAS/role/input decisions. No RPC supplies originalSpec.
export function createNormalNativePlanner({core,selection,nativeOperations,check,readAuditInput,publish}) {
  return Object.freeze({
    plan(input,originalSpec,protectedContextRecordRef,auditRepair){
      check();const purpose=originalSpec.executionInput?.purpose??'producer',config=selection.readConfiguration(purpose),facts=selection.readFacts(purpose);facts.assertCurrent();
      // The source planner has already marked and cached this exact spec.
      const spec=normalizedSpec(originalSpec);
      const marker={sourceRef:hash(canonical(config.source)),createConfigDigest:hash(canonical(config)),backendRef:canonicalDigest(config.backend),sessionRef:spec.executor.sessionRef};
      if(canonical(spec.nativeOriginBinding)!==canonical(marker)||spec.executor.toolsDigest!==config.tools.toolsDigest||spec.executor.permissionPolicyDigest!==config.permission.permissionPolicyDigest)fail('SPEC_MISMATCH');
      if(spec.resumeBinding||spec.executor.mode!=='create'||spec.executor.sessionRef!==hash('df-'+spec.executor.generationRef))fail('SPEC_MISMATCH');
      let contextRecordRef=protectedContextRecordRef,pair=null;
      if(spec.executionInput){pair=readAuditInput({taskRef:input.taskRef,inputRecordRef:spec.executionInput.recordRef});contextRecordRef=pair.association.contextRecordRef;if(pair.association.purpose!==purpose)fail('AUDIT_BINDING_MISMATCH');}
      const prepared=core.readPrepared({taskRef:input.taskRef,contextRecordRef,expectedTaskVersion:input.expectedTaskVersion,expectedAuthEpoch:input.expectedAuthEpoch});if(!prepared.currentness.instructionsCurrent||!prepared.currentness.memoryCurrent)fail('CONTEXT_STALE');
      check();facts.assertCurrent();const result=core.native.planNormalNativeAction({...input,contextRecordRef,configurationContent:canonical(config),spec});
      if(purpose==='audit_repair'){const a=pair.association;auditRepair={auditRef:a.auditRef,round:a.round,previousReportRef:a.previousReportRef,evidenceRef:R('df.installed-audit.repair-lineage/v1',result.actionDigest,a.previousReportRef,a.digest)};}
      nativeOperations.rememberPlan({taskRef:input.taskRef,spec:immutable(spec),actionDigest:result.actionDigest,configurationContent:canonical(config),assertCurrent:()=>{check();facts.assertCurrent();},...(auditRepair?{auditRepair:immutable(auditRepair)}:{})});
      publish('plan',{...input,spec},result,purpose==='producer'?'producer':'audit');return result;
    },
  });
}
