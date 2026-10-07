// Private callbacks inserted into the genuine installed source planners before
// they cache the spec. No RPC, model or owner configuration may supply this API.
import { canonical, canonicalDigest, hash, normalizedSpec, exact } from './runtime-security.mjs';
import { configuration } from './normal-contracts.mjs';
import { immutable } from './installed-worker-facts.mjs';
import { BootstrapError } from './config.mjs';
const fail=()=>{throw new BootstrapError('SPEC_MISMATCH');};
export function createNormalSourcePlanningBinding({selection,planner,check}) {
  return Object.freeze({
    markSpec(value){check();const purpose=value.executionInput?.purpose??'producer',config=selection.readConfiguration(purpose);configuration(config);const original=normalizedSpec(value);if(original.nativeOriginBinding||original.resumeBinding||original.executor.mode!=='create'||original.executor.toolsDigest!==config.tools.toolsDigest||original.executor.permissionPolicyDigest!==config.permission.permissionPolicyDigest)fail();
      return immutable(normalizedSpec({...original,nativeOriginBinding:{sourceRef:hash(canonical(config.source)),createConfigDigest:hash(canonical(config)),backendRef:canonicalDigest(config.backend),sessionRef:original.executor.sessionRef}}));},
    plan(input,contextRecordRef,auditRepair){check();exact(input,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','spec']);return planner.plan(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='spec')),input.spec,contextRecordRef,auditRepair);},
  });
}
