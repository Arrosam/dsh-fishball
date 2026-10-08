import { canonical, canonicalDigest, exact } from './runtime-security.mjs';
import { configuration, continuation, POLICY_FIELDS } from './normal-contracts.mjs';
import { validateInstalledWorker } from './installed-worker-config.mjs';
import { validateInstalledAudit } from './installed-audit.mjs';
import { resolveInstalledWorkerFacts, installedRef as R, immutable } from './installed-worker-facts.mjs';
import { createNativeHistoryCollector } from './native-history-collector.mjs';
import { ROLE_PROMPTS, roleRecipe } from './installed-role-recipes.mjs';
import { TESTING_SYSTEM_PROMPT } from './testing-provider.mjs';
import { BootstrapError } from './config.mjs';
const fail=code=>{throw new BootstrapError(code);};

// Parent contract worker.continuation: omitted/disabled stay disabled. The
// original worker validator sees its unchanged exact nine-field base object.
export function splitNormalWorkerSelection(input, memoryEnabled) {
  if(input===undefined)return{worker:validateInstalledWorker(undefined),continuation:null};
  exact(input,['enabled','selection','environment','persistence','bounds','policy','charges','previewTtlMs','grantTtlMs','continuation'],['enabled']);
  const base={...input};delete base.continuation;
  const worker=validateInstalledWorker(base);
  if(!Object.hasOwn(input,'continuation'))return{worker,continuation:null};
  const selected=input.continuation;exact(selected,selected?.enabled===false?['enabled']:['enabled','maxContinuations','maxTotalAttempts','history']);
  if(selected.enabled===false)return{worker,continuation:null};
  if(!worker.enabled||memoryEnabled!==true)fail('CONFIG_INVALID');
  continuation(selected);return{worker,continuation:immutable(selected)};
}

export function createNormalSourceSelection({ctx,workerSelection,auditSelection,continuationSelection,profile,source,core,check,isAlive,readCurrentFacts}) {
  const choice=workerSelection,audit=validateInstalledAudit(auditSelection),rows=new Map(),configs=new Map();let config=null;
  function current(){check();source.assertCurrent();if(!config)fail('WORKER_NOT_CONFIGURED');for(const row of rows.values())row.assertCurrent();if(canonical(core.policy())!==canonical(config.configuration.acceptedPolicy))fail('WORKER_POLICY_STALE');return true;}
  return Object.freeze({
    async refresh(){
      check();source.assertCurrent();let directoryBinding=rows.get('producer')?.directoryBinding;
      const purposes=['producer',...(audit.enabled?['audit_review',...(audit.repair?['audit_repair']:[])]:[])],selection=[],preset=[];
      for(const purpose of purposes){const role=purpose==='producer'?choice:audit[purpose==='audit_review'?'review':'repair'],roleChoice={...choice,selection:role.selection,charges:role.charges};
        const actual=readCurrentFacts(purpose);check();source.assertCurrent();directoryBinding??=actual.directoryBinding;
        if(actual.pricing!=='source_zero'||actual.accounting!=='df-testing-utf8-byte-units/v1'||actual.effort!=='deterministic'||!actual.providerBinding)fail('COST_UNKNOWN');
        const document=await actual.services.agentPresets.readDocument(role.selection.agentPreset);check();actual.assertCurrent();
        const collector=createNativeHistoryCollector({ctx,facts:actual,source,check}),facts=Object.freeze({...actual,collector});rows.set(purpose,facts);
        const systemPrompt=purpose==='producer'?TESTING_SYSTEM_PROMPT:ROLE_PROMPTS[purpose==='audit_review'?'review':'repair'];
        selection.push({purpose,selection:{...role.selection,reasoningEffort:'deterministic'},charges:role.charges,bounds:choice.bounds,systemPrompt,recipeDigest:canonicalDigest(['df.normal-native.role-recipe/v1',purpose,systemPrompt,source.stableSourceRef])});
        preset.push({purpose,description:{id:role.selection.agentPreset,presetRef:actual.presetRef,documentDigest:canonicalDigest(document),moduleRefs:[],leakedServiceRefs:[]}});
      }
      const acceptedPolicy=core.policy(),total=acceptedPolicy.limits.maxTotalAttempts,required=1+(audit.enabled?1+audit.maxRepairRounds*2:0)+(continuationSelection?.maxContinuations??0);
      if(total<required||audit.enabled&&audit.maxTotalAttempts!==total||continuationSelection&&continuationSelection.maxTotalAttempts!==total)fail('ATTEMPT_LIMIT');
      // Do not raise/merge either selected total or infer continuation consent.
      config={source:source.descriptor,configuration:{worker:choice,audit:audit.enabled?audit:null,continuation:continuationSelection,acceptedPolicy},backend:{contractVersion:'df.native-backend/v1',sourceRef:source.stableSourceRef,directory:choice.persistence.directory,compression:choice.persistence.compression,retention:'owner-managed',encrypted:false},environment:choice.environment,selection,preset,tools:{schemaRefs:[],restriction:'allow-empty',vetoCode:'DF_TOOL_DISPATCH_UNAVAILABLE',toolsDigest:R('df.installed-worker-tools/v1',[], 'DF_TOOL_DISPATCH_UNAVAILABLE')},permission:{policy:choice.policy,resourcePolicyVersion:acceptedPolicy.version,modelPolicyVersion:acceptedPolicy.modelPolicy.version,permissionPolicyDigest:R('df.installed-worker-permission/v1',choice.policy,acceptedPolicy.version,acceptedPolicy.modelPolicy.version,{...choice.persistence,encrypted:false},TESTING_SYSTEM_PROMPT)}};
      configuration(config,source.descriptor);config=immutable(config);configs.clear();configs.set('producer',config);
      // Each claim stores one full configuration with its original purpose-specific
      // permission digest. Shared selected policy/roles/total remain identical.
      for(const purpose of purposes.filter(p=>p!=='producer')){const role=purpose==='audit_review'?'review':'repair',variant={...config,permission:{...config.permission,permissionPolicyDigest:R('df.installed-audit-permission/v1',choice.policy,acceptedPolicy.version,acceptedPolicy.modelPolicy.version,{...choice.persistence,encrypted:false},ROLE_PROMPTS[role],audit[role])}};configuration(variant,source.descriptor);configs.set(purpose,immutable(variant));}
      current();return config;
    },
    readConfiguration(purpose='producer'){current();const actual=configs.get(purpose);if(!actual)fail('WORKER_SOURCE_UNAVAILABLE');return actual;},
    readFacts(purpose){current();const facts=rows.get(purpose);if(!facts)fail('WORKER_SOURCE_UNAVAILABLE');facts.assertCurrent();return facts;},
    policyWriteInput({commandRef,expectedVersion,limits,modelPolicy}){
      // Full fifteen limits remain visible in consent. Exactly seven mutable
      // fields go to the original writer; other eight stay constructor ceilings.
      check();return immutable({commandRef,expectedVersion,limits:Object.fromEntries(POLICY_FIELDS.map(f=>[f,limits[f]])),modelPolicy});
    },
  });
}
