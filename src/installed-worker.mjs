import { markFinishWait } from './installed-invocation.mjs';
import { ownInstalledStream } from './installed-owned-stream.mjs';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { BootstrapError } from './config.mjs';
import { assertWholeNativeRequest } from './normal-native-request.mjs';
import { continuation, POLICY_FIELDS } from './normal-contracts.mjs';
import { validateInstalledAudit } from './installed-audit.mjs';
import { ROLE_PROMPTS, ROLE_MODELS } from './installed-role-recipes.mjs';
import { validateInstalledWorker } from './installed-worker-config.mjs';
import { canonical, canonicalDigest, exact, ref, integer, hash, reference } from './runtime-security.mjs';
import { validateExecutionContext } from './context.mjs';
import { resolveInstalledWorkerFacts, installedRef as R, immutable } from './installed-worker-facts.mjs';
import { assertInstalledWorkerInvocation, captureInstalledWorkerInvocation, withInstalledWorkerInvocation, runInstalledWorkerInvocation } from './installed-invocation.mjs';

export { validateInstalledWorker };
const SYSTEM = 'You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.';
const ACCOUNTING = 'df-testing-utf8-byte-units/v1';
const fail = code => { throw new BootstrapError(code); };
// Trusted module composition only. A wire field or an owner-selected digest
// cannot enter this async context. Legacy runtime operations never use it.
export { assertInstalledWorkerInvocation };
const taskCAS = ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch'];
const actionCAS = [...taskCAS, 'actionRef', 'actionDigest'];
const executionCAS = [...taskCAS, 'actionRef', 'claimRef', 'generationRef', 'executionRef'];
function input(value, fields) {
  exact(value, fields);
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith('Ref') || key.endsWith('Digest')) ref(item);
    else if (key === 'expectedTaskVersion' || key === 'expectedPolicyVersion' || key === 'version') integer(item, 1);
    else if (key === 'expectedAuthEpoch' || key === 'expiresAt') integer(item);
  }
  return immutable(value);
}
function workerView(value) {
  const out = {};
  for (const key of ['taskRef','actionRef','actionDigest','claimRef','reservationRef','generationRef']) out[key] = ref(value[key]);
  out.sessionRef = value.sessionRef === undefined ? null : ref(value.sessionRef);
  if (!['created','ready','running','unknown','cancel_requested','stopped','not_created'].includes(value.phase)) fail('WORKER_SOURCE_UNAVAILABLE');
  out.phase = value.phase; return immutable(out);
}

export function createInstalledWorker({ selection, identity, profile, auditSelection, continuationSelection=null }) {
  const choice = validateInstalledWorker(selection), auditChoice = validateInstalledAudit(auditSelection);
  if(continuationSelection!==null)continuation(continuationSelection);
  const selectedTotal=continuationSelection?.maxTotalAttempts??(auditChoice.enabled?auditChoice.maxTotalAttempts:1);
  if(auditChoice.enabled&&auditChoice.maxTotalAttempts!==selectedTotal||selectedTotal<1+(auditChoice.enabled?1+2*auditChoice.maxRepairRounds:0)+(continuationSelection?.maxContinuations??0))fail('CONFIG_INVALID');
  if (!choice.enabled) return Object.freeze({});
  exact(identity, ['ownerId','workspaceId']); exact(profile, ['dir','name']);
  const ownerRef = reference(identity.ownerId), workspaceRef = reference(identity.workspaceId);
  const verifiedProfile = Object.freeze({ ...profile });
  const configurationRef = R('df.installed-worker-config/v1', choice);
  function installedWorkerInstaller(api) {
    exact(api, ['ctx','snapshotOwner','readOwnerData','currentPolicy','installOwnerPolicy','planOwnerAction','assertNativeRequestCurrent','composeNativeWorker','prepareOwnerPreview','grantOwnerPreview','subscribeRuntimeReceipts','isAlive','normalNative'], ['ctx','snapshotOwner','readOwnerData','currentPolicy','installOwnerPolicy','planOwnerAction','assertNativeRequestCurrent','composeNativeWorker','prepareOwnerPreview','grantOwnerPreview','subscribeRuntimeReceipts','isAlive']);
    if(api.normalNative){exact(api.normalNative,['markSpec','plan','refreshConfiguration','readConfiguration','readPrepared','readResumeInput','observeHistory','validateHistory','subscribePrepared','readFinishFirst']);if(Object.values(api.normalNative).some(f=>typeof f!=='function'||types.isProxy(f)))fail('RUNTIME_ADAPTER_INVALID');}
    const { ctx } = api;
    let active = true, facts, roleFacts = Object.freeze({}), accepted, native, policyObserved = null, pending = 0, lastNow = null, revision = 0;
    const previews = new Map(), prepared = new Map(), plans = new Map(), agents = new Map(), captures = new Map(), expectedReceipts = new Map();
    const removers = [];
    const alive = () => active && api.isAlive() === true;
    const check = () => { if (!alive()) fail('SERVICE_DISPOSED'); return assertInstalledWorkerInvocation(ctx); };
    function now() { const at = integer(Date.now(), 0, 8640000000000000); if (lastNow !== null && at < lastNow) fail('WORKER_PREVIEW_STALE'); lastNow = at; return at; }
    const persistence = immutable({ ...choice.persistence, encrypted: false });
    const status = (phase, reasonCode = null) => immutable({ enabled: true, phase: phase ?? (facts ? accepted ? 'ready' : 'needs_policy' : 'needs_refresh'), reasonCode, configurationRef, policyVersion: accepted?.version ?? policyObserved, selection: choice.selection, environment: choice.environment, persistence, bounds: choice.bounds, accounting: facts?.accounting ?? null, pricing: facts?.pricing ?? 'unknown', actionsEnabled: alive() && Boolean(accepted && facts?.pricing === 'source_zero') });
    let cachedStatus = status('needs_refresh');
    function invalidate(code = 'WORKER_SOURCE_UNAVAILABLE') { revision++; accepted = undefined; previews.clear(); for (const plan of plans.values()) plan.grant = null; cachedStatus = status('needs_refresh', code); }
    function current() { check(); if (!facts) fail('WORKER_NOT_CONFIGURED'); facts.assertCurrent(); return facts; }
    async function refresh() {
      check(); const before = revision;
      let next;
      try { next = await resolveInstalledWorkerFacts({ ctx, choice, profile: verifiedProfile, isAlive: alive, previous: facts, assertInvocation: check }); check(); }
      catch (error) { check(); invalidate(); cachedStatus = status('unavailable', 'WORKER_SOURCE_UNAVAILABLE'); throw error; }
      if (auditChoice.enabled) {
        const found = {};
        for (const purpose of ['review','repair'].filter(role => auditChoice[role])) {
          const roleChoice = { ...choice, selection: auditChoice[purpose].selection, charges: auditChoice[purpose].charges };
          found[purpose] = await resolveInstalledWorkerFacts({ ctx, choice: roleChoice, profile: verifiedProfile, isAlive: alive, previous: roleFacts[purpose], directoryBinding: next.directoryBinding, assertInvocation: check }); check();
          if (found[purpose].pricing !== 'source_zero' || roleChoice.selection.provider !== 'df-testing-local' || roleChoice.selection.model !== ROLE_MODELS[purpose] || found[purpose].effort !== 'deterministic') fail('COST_UNKNOWN');
        }
        roleFacts = Object.freeze(found);
        const catalogEvidenceRef = R('df.installed-aggregate-catalog/v1', next.catalogEvidenceRef, Object.fromEntries(Object.entries(found).map(([role,f]) => [role,f.catalogEvidenceRef])));
        next = Object.freeze({ ...next, catalogEvidenceRef });
      }
      if (before !== revision) fail('WORKER_SOURCE_UNAVAILABLE');
      if (facts && (next.sourceRef !== facts.sourceRef || next.catalogEvidenceRef !== facts.catalogEvidenceRef || next.environmentRef !== facts.environmentRef)) invalidate();
      facts = next; policyObserved = api.currentPolicy().version; cachedStatus = status(); return next;
    }
    const snapshot = taskRef => { check(); const value = api.snapshotOwner({ taskRef }); if (value.task.ownerRef !== ownerRef || value.task.workspaceRef !== workspaceRef) fail('SCOPE_DENIED'); return value; };
    function cas(value) { const snap = snapshot(value.taskRef); if (snap.task.version !== value.expectedTaskVersion) fail('STALE_VERSION'); if (snap.task.authEpoch !== value.expectedAuthEpoch) fail('STALE_AUTHORITY'); return snap; }
    function policyCurrent() { current(); if (!accepted) fail('WORKER_POLICY_REQUIRED'); const policy = api.currentPolicy(); if (canonical(policy) !== canonical(accepted)) { invalidate('WORKER_POLICY_STALE'); fail('WORKER_POLICY_STALE'); } return policy; }
    function description(policy, observed) {
      return immutable({ selection: choice.selection, effectiveReasoningEffort: observed.effort, environment: choice.environment, persistence, bounds: choice.bounds,
        limits: { ...(api.normalNative?policy.limits:{}),queueCapacity: policy.limits.queueCapacity, maxActive: 1, maxAttempts: 1, maxTotalAttempts: selectedTotal, ...choice.policy },
        ...(api.normalNative?{continuation:continuationSelection,aggregateTotal:selectedTotal}:{}),
        charges: { ...choice.charges, costState: observed.pricing === 'source_zero' ? 'estimated' : 'unknown', costEstimateMicros: observed.pricing === 'source_zero' ? 0 : null, costProvenanceRef: observed.pricing === 'source_zero' ? observed.sourceRef : null },
        accounting: observed.accounting, pricing: observed.pricing, grantTtlMs: choice.grantTtlMs, systemPrompt: SYSTEM, ...(auditChoice.enabled ? { auditRoles: Object.fromEntries(Object.entries(roleFacts).map(([role,f]) => [role,{ selection: auditChoice[role].selection, charges: auditChoice[role].charges, systemPrompt: ROLE_PROMPTS[role], accounting: f.accounting, pricing: f.pricing, nativeSourceRef: f.sourceRef, catalogEvidenceRef: f.catalogEvidenceRef, recipe: role === 'review' ? 'df.audit-response/v1; unknown; coverageRefs=[]; all authenticated materialRefs sorted unexamined; findings=[]' : 'Synthetic local repair; approved audit input SHA-256: ${sha256(exact approved audit content)}.', maxOutputTokens: auditChoice[role].selection.maxOutputTokens }])) } : {}) });
    }
    function contextOrigin(taskRef, recordRef) {
      const origin = prepared.get(`${taskRef}:${recordRef}`); if (!origin) fail('WORKER_CONTEXT_INVALID');
      const data = api.readOwnerData({ taskRef, recordRef });
      if (data.kind !== 'context' || data.digest !== origin.digest || hash(data.content) !== data.digest || data.sourceRef !== origin.sourceRef || data.cryptoVersion !== 2) fail('WORKER_CONTEXT_INVALID');
      const envelope = JSON.parse(data.content); validateExecutionContext(envelope, { scope: { ownerRef, workspaceRef, taskRef } });
      if (envelope.sourceTaskVersion !== origin.sourceTaskVersion || envelope.sourceAuthEpoch !== origin.sourceAuthEpoch || canonical(envelope.memory.namespaceRef) !== canonical(origin.memory.namespaceRef) || envelope.memory.revision !== origin.memory.revision) fail('WORKER_CONTEXT_INVALID');
      return { origin, data, envelope };
    }
    function planCurrent(taskRef, actionRef, digest, cleanup = false) {
      check(); const plan = plans.get(`${taskRef}:${actionRef}`); if (!plan || digest !== undefined && plan.actionDigest !== digest) fail('WORKER_MAPPING_MISMATCH');
      const snap = snapshot(taskRef), actual = snap.actions.find(row => row.actionRef === actionRef);
      if (!actual || actual.actionDigest !== plan.actionDigest || canonical(actual.spec) !== canonical(plan.spec)) fail('WORKER_MAPPING_MISMATCH');
      if (!cleanup) { policyCurrent(); if (plan.facts.sourceRef !== facts.sourceRef || plan.facts.environmentRef !== facts.environmentRef) fail('WORKER_SOURCE_UNAVAILABLE'); if(plan.spec.resumeBinding){const status=api.normalNative.readPrepared({taskRef,contextRecordRef:plan.contextRecordRef,expectedTaskVersion:snap.task.version,expectedAuthEpoch:snap.task.authEpoch});if(!status.currentness.instructionsCurrent||!status.currentness.memoryCurrent)fail('WORKER_CONTEXT_INVALID');}else contextOrigin(taskRef, plan.contextRecordRef); }
      return { plan, snap, actual };
    }
    const receiptKey = (operation, value) => `${operation}:${value.commandRef}`;
    function expect(operation, value) { expectedReceipts.set(receiptKey(operation, value), canonical(value)); }
    const unsubscribe = api.subscribeRuntimeReceipts(({ operation, input: value, receipt }) => {
      if (!active) return;
      if (['memoryRemember', 'memoryCorrect', 'memoryForget', 'memoryImportConfirm', 'memoryDeleteConfirm'].includes(operation)) { prepared.clear(); for (const row of plans.values()) row.grant = null; revision++; previews.clear(); return; }
      if (operation === 'prepareContext') {
        if(api.normalNative)return;
        if (receipt.task.ownerRef !== ownerRef || receipt.task.workspaceRef !== workspaceRef || receipt.task.taskRef !== value.taskRef || receipt.kind !== 'context' || receipt.cryptoVersion !== 2 || receipt.verification !== 'module_prepared_execution_context_only') fail('WORKER_CONTEXT_INVALID');
        for (const [key, prior] of prepared) if (prior.task.taskRef === value.taskRef) prepared.delete(key);
        prepared.set(`${value.taskRef}:${receipt.recordRef}`, receipt); return;
      }
      if (operation === 'policy') {
        const key = receiptKey(operation, value), expected = expectedReceipts.get(key); expectedReceipts.delete(key);
        invalidate('WORKER_POLICY_STALE'); policyObserved = receipt.version; if (expected === canonical(value)) accepted = immutable(receipt); cachedStatus = status(); return;
      }
      if (operation === 'grant') {
        const key = receiptKey(operation, value), expected = expectedReceipts.get(key); expectedReceipts.delete(key);
        const plan = plans.get(`${value.taskRef}:${value.actionRef}`);
        if (!plan || expected !== canonical(value) || receipt.actionDigest !== plan.actionDigest) { for (const row of plans.values()) if (row.taskRef === value.taskRef) row.grant = null; return; }
        plan.grant = immutable({ taskVersion: receipt.task.version, authEpoch: receipt.task.authEpoch, expiresAt: value.expiresAt }); return;
      }
      if (['revise','control'].includes(operation)) { for (const [key, row] of prepared) if (row.task.taskRef === value.taskRef) prepared.delete(key); for (const row of plans.values()) if (row.taskRef === value.taskRef) row.grant = null; revision++; previews.clear(); }
      if (operation === 'revoke') { const row = plans.get(`${value.taskRef}:${value.actionRef}`); if (row) row.grant = null; }
      if (operation === 'captureResult') captures.set(`${value.taskRef}:${value.artifactRef}:1`, immutable({ input: value, receipt }));
    });
    const removePrepared=api.normalNative?.subscribePrepared(actual=>{
      check();if(actual.commitDisposition!=='new')fail('WORKER_CONTEXT_INVALID');const receipt=actual.receipt;
      if(receipt.task.ownerRef!==ownerRef||receipt.task.workspaceRef!==workspaceRef||receipt.task.taskRef!==actual.input.taskRef||receipt.verification!=='module_prepared_execution_context_only')fail('WORKER_CONTEXT_INVALID');
      for(const[k,v]of prepared)if(v.task.taskRef===actual.input.taskRef)prepared.delete(k);prepared.set(`${actual.input.taskRef}:${receipt.recordRef}`,immutable(receipt));
    });
    function hostPermission(record) {
      try {
        check(); current(); if (!accepted || record.ownerRef !== ownerRef || record.workspaceRef !== workspaceRef) return false;
        const plan = plans.get(`${record.taskRef}:${record.actionRef}`);
        if (!plan?.grant || plan.actionDigest !== record.actionDigest || canonical(plan.spec) !== canonical(record.spec) || record.authEpoch !== plan.grant.authEpoch || plan.grant.expiresAt <= now() || accepted.version !== record.spec.resourcePolicyVersion || accepted.modelPolicy.version !== record.spec.modelPolicyVersion || facts.sourceRef !== plan.facts.sourceRef) return false;
        return true;
      } catch { return false; }
    }
    const boundAgent = (agent, binding, unpublished = false) => {
      current(); const row = agents.get(agent.id); if (!row || row.agent !== agent || agent.session.id !== agent.id || agent.options.provider !== choice.selection.provider || agent.options.model !== choice.selection.model || (agent.options.reasoningEffort ?? null) !== facts.effort || agent.options.maxTokens !== choice.selection.maxOutputTokens || row.binding.generationRef !== binding.generationRef || row.binding.claimRef !== binding.claimRef) fail('WORKER_REQUEST_DENIED');
      if (unpublished && !['setup','committed'].includes(row.factoryPhase)) fail('WORKER_REQUEST_DENIED');
      if (!unpublished && (facts.services.agents.get(agent.id) !== agent || facts.services.sessions.get(agent.id) !== agent.session)) fail('WORKER_REQUEST_DENIED');
      if (facts.services.agentPresets.composedPreset(agent.ctx) !== choice.selection.agentPreset) fail('WORKER_PRESET_UNAVAILABLE');
      const inspected = facts.services.agentPresets.inspectCompositions(agent.ctx); if (inspected.length !== 1 || inspected[0].id !== choice.selection.agentPreset || inspected[0].modules.length || inspected[0].leakedServices.length || !(agent.ctx.reflect.get('tools') instanceof facts.modules['dsh-tools'].default) || agent.ctx.reflect.get('tools').schemas().length) fail('WORKER_TOOLS_UNAVAILABLE');
      if(row.prefix&&(canonical(agent.session.header)!==canonical(row.prefix.header)||canonical(agent.session.snapshotEvents(0).slice(0,row.prefix.events.length))!==canonical(row.prefix.events)||agent.session.surface.replaceGeneration!==0||agent.session.surface.contentGeneration!==0))fail('WORKER_RESUME_HISTORY_STALE');
      if (!unpublished) row.factoryPhase='published';
      return row;
    };
    function requestCurrent(row, options) {
      const { agent, execution, context } = row; if (!execution || !row.permit) fail('WORKER_REQUEST_DENIED');
      return withInstalledWorkerInvocation(ctx, row.executionGuard, () => {
        check(); boundAgent(agent, row.binding); api.assertNativeRequestCurrent({ taskRef: execution.taskRef, claimRef: execution.claimRef, generationRef: execution.generationRef, actionDigest: execution.actionDigest, executionRef: execution.executionRef });
        if (facts.services.agents.currentInitiator() !== agent) fail('WORKER_REQUEST_DENIED');
        if (!options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype) fail('WORKER_REQUEST_DENIED');
        const fields = Object.getOwnPropertyDescriptors(options);
        for (const key of Reflect.ownKeys(fields)) if (typeof key === 'string' && (!fields[key].enumerable || !Object.hasOwn(fields[key],'value') || !['provider','model','reasoningEffort','maxTokens','messages','tools','toolHistory','signal','sessionId','system','temperature','stop','purpose'].includes(key))) fail('WORKER_REQUEST_DENIED');
        const read = key => fields[key]?.value;
        if (read('provider') !== choice.selection.provider || read('model') !== choice.selection.model || (read('reasoningEffort') ?? null) !== facts.effort || read('maxTokens') !== choice.selection.maxOutputTokens || read('sessionId') !== agent.id || ['system','temperature','stop','purpose'].some(key => read(key) !== undefined) || read('tools') !== undefined && canonical(read('tools')) !== '[]' || read('toolHistory') !== undefined && canonical(read('toolHistory')) !== canonical({tools:[],updates:[]})) fail('WORKER_REQUEST_DENIED');
        const messages = JSON.parse(canonical(read('messages'))); if(row.historyMessages?.length)return assertWholeNativeRequest(options,{agent,executionRef:execution.executionRef,content:context.content,systemPrompt:SYSTEM,selection:choice.selection,bounds:choice.bounds,historyMessages:row.historyMessages});if (messages.length !== 2) fail('WORKER_REQUEST_DENIED');
        const [system,user] = messages; exact(system,['id','role','content','source']); exact(system.source,['kind']); exact(user,['id','role','content','source']); exact(user.source,['kind','form']);
        if (system.role !== 'system' || system.source.kind !== 'system-prompt' || typeof system.id !== 'string' || !system.id || Buffer.byteLength(system.id)>128 || canonical(system.content) !== canonical([{type:'text',text:SYSTEM}]) || user.id !== execution.executionRef || user.role !== 'user' || user.source.kind !== 'df-context' || user.source.form !== 'local' || canonical(user.content) !== canonical([{type:'text',text:context.content}]) || Buffer.byteLength(JSON.stringify(read('messages'))) > choice.bounds.requestBytes || hash(context.content) !== execution.dataDigest) fail('WORKER_REQUEST_DENIED');
        return true;
      });
    }
    function compose() {
      policyCurrent(); if (native) return native;
      const environments = {
        bind(spec, task) { const found = [...plans.values()].find(row => row.actionRef === spec.actionRef && row.taskRef === task.taskRef && canonical(row.spec) === canonical(spec)); if (!found || task.workspaceRef !== workspaceRef) fail('ENVIRONMENT_MISMATCH'); return Object.freeze({ plan: found }); },
        inspect(token, callback) { const row = token?.plan; if (!row || plans.get(`${row.taskRef}:${row.actionRef}`) !== row) fail('ENVIRONMENT_UNAVAILABLE'); return callback({ provider: choice.selection.provider, model: choice.selection.model, ...(row.facts.effort === null ? {} : {reasoningEffort:row.facts.effort}), maxOutputTokens: choice.selection.maxOutputTokens, cwd: choice.environment.cwd }); },
        assertCurrent(token) { if (!token?.plan || token.plan.facts.sourceRef !== facts?.sourceRef) fail('ENVIRONMENT_STALE'); current(); return token.plan.facts.sourceRef; },
      };
      const permission = value => { try { check(); current(); const row=[...plans.values()].find(plan=>plan.taskRef===value.taskRef&&plan.spec.executor.generationRef===value.generationRef); return Boolean(row?.grant && row.grant.expiresAt>now() && (!value.claimRef || !row.binding || row.binding.claimRef===value.claimRef) && row.facts.sourceRef===facts.sourceRef); } catch { return false; } };
      const hooks = {
        async setupAgent(agentCtx, agent, binding) {
          check(); const {plan}=planCurrent(binding.taskRef,binding.actionRef,binding.actionDigest); if (!plan.grant) fail('GRANT_REQUIRED');
          facts.claimDirectory({taskRef:binding.taskRef,actionRef:binding.actionRef,claimRef:binding.claimRef,generationRef:binding.generationRef});
          plan.binding=binding; const row={agent,binding,execution:null,permit:null,outer:'unprepared',executionGuard:null,factoryPhase:'setup',historyMessages:[],prefix:null};
          if(binding.spec.resumeBinding){const pair=api.normalNative.readResumeInput({taskRef:binding.taskRef,resumeRef:binding.spec.resumeBinding.resumeRef}),prefix=JSON.parse(pair.history.content);if(canonical({header:agent.session.header,events:agent.session.snapshotEvents(0),surface:{nodes:[...agent.session.surface.nodes],replaceGeneration:agent.session.surface.replaceGeneration,contentGeneration:agent.session.surface.contentGeneration},messages:agent.session.deriveMessages()})!==canonical({header:prefix.header,events:prefix.events,surface:prefix.surface,messages:prefix.messages}))fail('WORKER_RESUME_HISTORY_STALE');row.prefix=prefix;row.historyMessages=prefix.messages;}
          agents.set(agent.id,row);
          const preset=await facts.services.agentPresets.mount(agentCtx,choice.selection.agentPreset);check(); if(preset.id!==choice.selection.agentPreset)fail('WORKER_PRESET_UNAVAILABLE');
          agentCtx.reflect.get('tools').restrict({allow:[]});agentCtx.reflect.get('systemPrompt').section({name:'df-installed-worker',order:0,text:SYSTEM,complete:true,interpolate:false});agentCtx.reflect.get('systemPrompt').suppressRuntimeContext();facts.modules['dsh-user-approval'].setApprovalPolicy(agent.session,'never');
          boundAgent(agent,binding,true);
        },
        commitAgent(agentCtx,agent,binding){check();const row=boundAgent(agent,binding,true);if(row.factoryPhase!=='setup')fail('WORKER_REQUEST_DENIED');if(row.historyMessages.length&&canonical(agent.session.deriveMessages())!==canonical(row.historyMessages))fail('WORKER_RESUME_HISTORY_STALE');row.factoryPhase='committed';return true;},
        bindExecution(agent,execution,context){
          check();const row=boundAgent(agent,{claimRef:execution.claimRef,generationRef:execution.generationRef});if(row.execution||!facts.providerBinding)fail('WORKER_REQUEST_DENIED');
          const {plan}=planCurrent(execution.taskRef,row.binding.actionRef,row.binding.actionDigest);if(plan.contextRecordRef!==execution.contextRecordRef)fail('WORKER_CONTEXT_INVALID');if(!plan.spec.resumeBinding)contextOrigin(execution.taskRef,execution.contextRecordRef);if(context.digest!==execution.dataDigest||hash(context.content)!==execution.dataDigest)fail('WORKER_CONTEXT_INVALID');
          row.execution=execution;row.context=context;row.executionGuard=captureInstalledWorkerInvocation(ctx);row.outer='prepared';
          row.permit=facts.providerBinding.issue({agent,executionRef:execution.executionRef,content:context.content,maxOutputTokens:choice.selection.maxOutputTokens,requestBytes:choice.bounds.requestBytes,resultBytes:choice.bounds.resultBytes,usageUnits:choice.charges.usageUnits,...(row.prefix?{mode:'resume',historyMessages:row.historyMessages,historyMessagesDigest:hash(canonical(row.historyMessages)),historyPrefixDigest:hash(canonical({header:row.prefix.header,events:row.prefix.events,surface:row.prefix.surface,messages:row.prefix.messages})),resumeRef:row.binding.spec.resumeBinding.resumeRef}:{}),assertCurrent:options=>{if(row.outer!=='entered')fail('WORKER_REQUEST_DENIED');return requestCurrent(row,options);}});return true;
        },
        async validateResult(agent,result,checkpoint){
          if(checkpoint?.phase==='before_stop'){
            exact(checkpoint,['phase']);const row=agents.get(agent.id),w=row?.finalWitness;
            if(!w||w.agent!==agent||w.session!==agent.session||w.binding!==row.binding||w.execution!==row.execution||w.context!==row.context||w.permit!==row.permit||w.ctx!==agent.ctx||w.fiber!==agent.ctx.fiber||w.sourceRef!==facts.sourceRef||canonical(w.result)!==canonical(result))fail('WORKER_RESULT_UNAVAILABLE');
            const out=await hooks.validateResult(agent,result);if(canonical(out.historyObservation)!==canonical(w.history)||canonical(row.finalWitness.usage)!==canonical(w.usage))fail('WORKER_RESULT_UNAVAILABLE');return out;
          }
          if(checkpoint!==undefined){
            exact(checkpoint,['phase','terminalEvidenceRef']);if(checkpoint.phase!=='stopped')fail('WORKER_RESULT_UNAVAILABLE');ref(checkpoint.terminalEvidenceRef);
            check();current();const row=agents.get(agent.id),w=row?.finalWitness;
            if(!w||row.agent!==agent||w.agent!==agent||agent.session!==w.session||row.binding!==w.binding||row.execution!==w.execution||row.context!==w.context||row.permit!==w.permit||agent.ctx!==w.ctx||agent.ctx.fiber!==w.fiber||agent.ctx.fiber.uid!==null||facts.services.agents.get(agent.id)||facts.services.sessions.get(agent.id)||facts.sourceRef!==w.sourceRef||canonical(result)!==canonical(w.result))fail('WORKER_RESULT_UNAVAILABLE');
            const verify=()=>{check();current();if(agent.options.provider!==choice.selection.provider||agent.options.model!==choice.selection.model||(agent.options.reasoningEffort??null)!==facts.effort||agent.options.maxTokens!==choice.selection.maxOutputTokens||facts.modules['dsh-scope'].scopeOf(w.ctx)!==agent||agent.session!==w.session||facts.services.agents.get(agent.id)||facts.services.sessions.get(agent.id)||agent.ctx.fiber.uid!==null||facts.sourceRef!==w.sourceRef)fail('WORKER_RESULT_UNAVAILABLE');const workers=snapshot(row.binding.taskRef).workers.filter(v=>v.claimRef===row.binding.claimRef&&v.generationRef===row.binding.generationRef&&v.sessionRef===row.binding.sessionRef&&v.phase==='stopped'&&v.terminalEvidenceRef===checkpoint.terminalEvidenceRef);if(workers.length!==1)fail('WORKER_RESULT_UNAVAILABLE');};
            verify();const h=await api.normalNative.observeHistory(agent,row.binding,'producer','stopped');verify();
            if(canonical(h)!==canonical(w.history))fail('WORKER_RESULT_UNAVAILABLE');
            const out=api.normalNative.validateHistory(h,result,w.usage,'producer',w.context.content,row.historyMessages,'stopped');verify();return out;
          }
          check();const row=boundAgent(agent,{claimRef:result.claimRef,generationRef:result.generationRef});
          if(result.phase==='baseline'){if(!row.binding.spec.nativeOriginBinding||row.execution)fail('WORKER_RESULT_UNAVAILABLE');const h=await api.normalNative.observeHistory(agent,row.binding,'producer','baseline');check();boundAgent(agent,row.binding);return{historyObservation:h};}
          const usage=row.permit?.usage();
          if(!usage||usage.accounting!==ACCOUNTING||usage.totalUnits!==usage.inputUnits+usage.outputUnits||usage.totalUnits>choice.charges.usageUnits||usage.resultDigest!==result.digest||hash(result.content)!==result.digest||Buffer.byteLength(result.content)>choice.bounds.resultBytes||row.execution?.executionRef!==result.executionRef)fail('WORKER_RESULT_UNAVAILABLE');
          if(row.binding.spec.nativeOriginBinding||row.binding.spec.resumeBinding){const h=await api.normalNative.observeHistory(agent,row.binding,'producer','committed');check();boundAgent(agent,row.binding);const out=api.normalNative.validateHistory(h,result,usage,'producer',row.context.content,row.historyMessages);row.finalWitness=Object.freeze({agent,session:agent.session,binding:row.binding,execution:row.execution,context:row.context,permit:row.permit,ctx:agent.ctx,fiber:agent.ctx.fiber,sourceRef:facts.sourceRef,result,history:h,usage});return out;}
          if(await facts.services.sessions.flush(agent.session)!==true)fail('WORKER_RESULT_UNAVAILABLE');check();boundAgent(agent,row.binding);
          const eventCount=integer(agent.session.seq,0,128);const stat=await facts.services.sessionPersistence.stat(agent.id);check();if(!stat||!Number.isSafeInteger(stat.sizeBytes)||stat.sizeBytes>1048576||agent.session.seq!==eventCount)fail('WORKER_RESULT_UNAVAILABLE');
          const read=await facts.services.sessionPersistence.open(agent.id,'read');
          try{check();boundAgent(agent,row.binding);
            if(read.id!==agent.id||read.access!=='read'||read.header.id!==agent.id||read.header.isSeeded||read.inheritedEventCount!==0)fail('WORKER_RESULT_UNAVAILABLE');
            const log=await read.read(0,128);check();boundAgent(agent,row.binding);if(log.events.length!==eventCount||agent.session.seq!==eventCount||log.events.some((event,index)=>event.seq!==index))fail('WORKER_RESULT_UNAVAILABLE');
            const user=log.events.filter(event=>event.type==='user/message'),assistants=log.events.filter(event=>event.type==='assistant/message'),starts=log.events.filter(event=>event.type==='turn/start'),ends=log.events.filter(event=>event.type==='turn/end');
            if(user.length!==1||assistants.length!==1||starts.length!==1||ends.length!==1||ends[0].data.turn!==starts[0].data.turn||ends[0].seq<=assistants[0].seq||assistants[0].data.interrupted===true||log.events.some(event=>['developer/message','tool/result','assistant/attempt'].includes(event.type)))fail('WORKER_RESULT_UNAVAILABLE');
            const a=assistants[0],u=user[0];if(u.data.id!==result.executionRef||u.data.role!=='user'||canonical(u.data.content)!==canonical([{type:'text',text:row.context.content}])||u.data.source?.kind!=='df-context'||u.data.source?.form!=='local'||a.seq!==result.cursor||a.seq<=u.seq||canonical(a.data.message.content)!==canonical([{type:'text',text:result.content}])||a.data.usage?.inputTokens!==usage.inputUnits||a.data.usage?.outputTokens!==usage.outputUnits||a.data.usage?.totalTokens!==usage.totalUnits)fail('WORKER_RESULT_UNAVAILABLE');
            return{usageUnits:usage.totalUnits,resultDigest:result.digest,evidenceRef:R('df.installed-result-persistence/v1',result.executionRef,result.cursor,result.digest,usage,stat.header)};
          }catch(error){check();throw error;}finally{await read.close();check();boundAgent(agent,row.binding);}
        },
      };
      const remove=ctx.on('llm/stream',(options,next)=>{
        const agent=facts?.services.agents.currentInitiator(),row=agent&&agents.get(agent.id);if(!row||row.agent!==agent)return next();
        return ownInstalledStream(ctx,row.executionGuard,{start(){check();if(row.outer!=='prepared')fail('WORKER_REQUEST_DENIED');requestCurrent(row,options);row.outer='entered';},check:()=>requestCurrent(row,options),open:next});
      });if(typeof remove!=='function')fail('WORKER_SOURCE_UNAVAILABLE');removers.push(remove);
      native=api.composeNativeWorker({worker:{environments,permission,toolGuard:({agent,schemas})=>{try{const row=agents.get(agent.id);return schemas.length===0&&boundAgent(agent,row.binding,row.factoryPhase!== 'published')!==undefined;}catch{return false;}}},nativeHooks:hooks});return native;
    }
    const ownedMapping=value=>{const rows=[...agents.values()].filter(r=>r.binding.taskRef===value.taskRef&&r.binding.claimRef===value.claimRef&&r.binding.generationRef===value.generationRef);if(rows.length!==1)fail('WORKER_MAPPING_MISMATCH');return rows[0];};
    const methods = {
      async workerCatalog(value){input(value,[]);await refresh();return immutable({status:cachedStatus,...facts.catalog});},
      async workerPolicyPreview(value){value=input(value,['expectedPolicyVersion']);check();const at=now();for(const[k,v]of previews)if(v.expiresAt<=at)previews.delete(k);if(previews.size+pending>=64)fail('PREVIEW_CAPACITY');pending++;try{const policy=api.currentPolicy();if(policy.version!==value.expectedPolicyVersion)fail('WORKER_POLICY_STALE');const observed=await refresh();check();const after=api.currentPolicy();if(canonical(after)!==canonical(policy))fail('WORKER_POLICY_STALE');const described=description(policy,observed),expiresAt=now()+choice.previewTtlMs,previewRef=R('df.installed-policy-preview/v1',randomUUID(),described,expiresAt),planDigest=R('df.installed-policy-plan/v1',described,observed.catalogEvidenceRef,observed.environmentRef,policy);const out=immutable({previewRef,planDigest,expiresAt,expectedPolicyVersion:value.expectedPolicyVersion,description:described});previews.set(previewRef,{...out,facts:observed,busy:false,policy});return out;}finally{pending--; }},
      async workerPolicyConfirm(value){value=input(value,['previewRef','planDigest','commandRef','expectedPolicyVersion','accept']);if(value.accept!==true)fail('WORKER_CONFIRMATION_REQUIRED');const prior=previews.get(value.previewRef);if(!prior||prior.busy||prior.planDigest!==value.planDigest||prior.expectedPolicyVersion!==value.expectedPolicyVersion||prior.expiresAt<=now())fail('WORKER_PREVIEW_STALE');prior.busy=true;try{const observed=await refresh();check();const policy=api.currentPolicy(),described=description(policy,observed);if(prior.expiresAt<=now()||canonical(described)!==canonical(prior.description)||canonical(policy)!==canonical(prior.policy)||observed.catalogEvidenceRef!==prior.facts.catalogEvidenceRef||observed.environmentRef!==prior.facts.environmentRef)fail('WORKER_PREVIEW_STALE');const mutation={commandRef:value.commandRef,expectedVersion:policy.version,limits:api.normalNative?Object.fromEntries(POLICY_FIELDS.map(k=>[k,described.limits[k]])):described.limits,modelPolicy:{version:integer((policy.modelPolicy?.version??0)+1,1),presetRefs:[...new Set([observed.presetRef,...Object.values(roleFacts).map(f=>f.presetRef)])],catalogEvidenceRef:observed.catalogEvidenceRef}};expect('policy',mutation);check();const receipt=api.installOwnerPolicy(mutation);previews.delete(value.previewRef);return immutable({policyVersion:receipt.version,configurationRef,status:cachedStatus});}finally{prior.busy=false;}},
      async workerPlan(value){value=input(value,[...taskCAS,'contextRecordRef']);await refresh();policyCurrent();if(api.normalNative){await api.normalNative.refreshConfiguration();check();policyCurrent();}const snap=cas(value),material=contextOrigin(value.taskRef,value.contextRecordRef),generationRef=R('df.installed-worker-generation/v1',ownerRef,workspaceRef,value.taskRef,value.commandRef),actionRef=R('df.installed-worker-action/v1',value.taskRef,value.commandRef),toolsDigest=R('df.installed-worker-tools/v1',[], 'DF_TOOL_DISPATCH_UNAVAILABLE'),bindingDigest=R('df.installed-worker-binding/v1',facts.environmentRef,workspaceRef,facts.modelRef,facts.reasoningRef,facts.presetRef,facts.sourceRef),permissionPolicyDigest=R('df.installed-worker-permission/v1',choice.policy,accepted.version,accepted.modelPolicy.version,persistence,SYSTEM);
        const executor={mode:'create',generationRef,sessionRef:hash('df-'+generationRef),environmentRef:facts.environmentRef,bindingDigest,toolsDigest,permissionPolicyDigest},model={modelRef:facts.modelRef,reasoningRef:facts.reasoningRef,presetRef:facts.presetRef,catalogEvidenceRef:facts.catalogEvidenceRef},targetDigest=R('df.installed-worker-target/v1',ownerRef,workspaceRef,value.taskRef,generationRef,executor,model,material.data.digest,description(accepted,facts));
        let spec={actionRef,kind:'write',role:'worker',targetDigest,dataDigest:material.data.digest,units:1,charges:{...choice.charges,...(facts.pricing==='source_zero'?{costState:'estimated',costEstimateMicros:0,costProvenanceRef:facts.sourceRef}:{costState:'unknown'})},attemptGroupRef:R('df.installed-worker-attempt/v1',value.taskRef,'worker',1),attemptIndex:1,resourcePolicyVersion:accepted.version,modelPolicyVersion:accepted.modelPolicy.version,executor,model};
        check();if(api.normalNative)spec=api.normalNative.markSpec(spec);const planInput={taskRef:value.taskRef,commandRef:value.commandRef,expectedTaskVersion:value.expectedTaskVersion,expectedAuthEpoch:value.expectedAuthEpoch,spec};const receipt=api.normalNative?api.normalNative.plan(planInput,value.contextRecordRef):api.planOwnerAction(planInput);plans.set(`${value.taskRef}:${actionRef}`,{taskRef:value.taskRef,actionRef,actionDigest:receipt.actionDigest,spec:immutable(spec),facts,contextRecordRef:value.contextRecordRef,grant:null});return receipt;},
      async workerPreview(value){value=input(value,['taskRef','actionRef','actionDigest','recordRef','expectedTaskVersion','expectedAuthEpoch']);await refresh();cas(value);const{plan}=planCurrent(value.taskRef,value.actionRef,value.actionDigest);if(value.recordRef!==plan.contextRecordRef)fail('WORKER_CONTEXT_INVALID');const result=await api.prepareOwnerPreview(value);check();return result;},
      async workerGrant(value){value=input(value,[...actionCAS,'expiresAt','previewRef','accept']);if(value.accept!==true)fail('WORKER_CONFIRMATION_REQUIRED');await refresh();cas(value);planCurrent(value.taskRef,value.actionRef,value.actionDigest);if(value.expiresAt<=now()||value.expiresAt>now()+choice.grantTtlMs)fail('GRANT_EXPIRED');const{accept,...mutation}=value,{previewRef,...storeInput}=mutation;expect('grant',storeInput);check();const result=await api.grantOwnerPreview(mutation);check();return result;},
      async workerCreate(value){value=input(value,actionCAS);await refresh();cas(value);planCurrent(value.taskRef,value.actionRef,value.actionDigest);const out=await compose().dispatch({...value,timeoutMs:60000});check();const owned=agents.get('df-'+out.generationRef);if(owned)boundAgent(owned.agent,owned.binding);return immutable({task:snapshot(value.taskRef).task,worker:workerView(out)});},
      async workerExecute(value){value=input(value,[...actionCAS,'claimRef','generationRef','contextRecordRef']);await refresh();cas(value);const{plan}=planCurrent(value.taskRef,value.actionRef,value.actionDigest);if(plan.contextRecordRef!==value.contextRecordRef)fail('WORKER_CONTEXT_INVALID');const out=await compose().executeContext({...value,timeoutMs:60000});check();const row=ownedMapping(value),usage=row?.permit?.usage(),real=out.state==='committed'&&usage?.resultDigest&&out.result?.eventType==='assistant/message';return immutable({task:snapshot(value.taskRef).task,worker:workerView(out.worker),execution:{executionRef:out.executionRef,state:real?'committed':'unknown',cursor:real?out.result.cursor:null,resultDigest:real?usage.resultDigest:null,usage:{state:real?'actual':'unknown',units:real?usage.totalUnits:null,accounting:real?ACCOUNTING:null}}});},
      workerQuery(value){value=input(value,['taskRef','actionRef','claimRef','generationRef']);check();if(!native)fail('WORKER_SESSION_UNAVAILABLE');const worker=workerView(native.query(value));return immutable({task:snapshot(value.taskRef).task,worker});},
      async workerCapture(value){value=input(value,executionCAS);cas(value);planCurrent(value.taskRef,value.actionRef,undefined,true);if(!native)fail('WORKER_RESULT_UNAVAILABLE');const out=await native.captureResult({...value,artifactRef:R('df.installed-result/v1',value.taskRef,value.claimRef,value.executionRef),version:1});check();return out;},
      workerResult(value){
        value=input(value,['taskRef','artifactRef','version','expectedTaskVersion','expectedAuthEpoch']);
        const snap=cas(value),capture=captures.get(`${value.taskRef}:${value.artifactRef}:${value.version}`);
        const one=(rows,predicate)=>{const matches=rows.filter(predicate);if(matches.length!==1)fail('WORKER_RESULT_UNAVAILABLE');return matches[0];};
        const artifact=one(snap.artifacts,row=>row.artifactRef===value.artifactRef&&row.version===value.version);
        const data=api.readOwnerData({taskRef:value.taskRef,recordRef:artifact.recordRef});
        let body,binding;
        try{
          if(typeof data.content!=='string'||!data.content.isWellFormed()||Buffer.byteLength(data.content)>65536)fail('WORKER_RESULT_UNAVAILABLE');
          body=JSON.parse(data.content);exact(body,['contractVersion','source','content']);
          exact(body.source,['taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','executionRef','inputDigest','cursor','resultDigest']);
          for(const[key,item]of Object.entries(body.source))key==='cursor'?integer(item):ref(item);
          if(body.contractVersion!=='df.native-result/v1'||typeof body.content!=='string'||!body.content.isWellFormed()||Buffer.byteLength(body.content)>choice.bounds.resultBytes||hash(body.content)!==body.source.resultDigest||hash(data.content)!==artifact.digest)fail('WORKER_RESULT_UNAVAILABLE');
          // These are scoped durable metadata, not recreated native handles.
          const source=body.source;
          const bind=current=>{
            const retained=one(current.artifacts,row=>row.artifactRef===value.artifactRef&&row.version===value.version);
            const record=one(current.data,row=>row.recordRef===retained.recordRef);
            const worker=one(current.workers,row=>row.claimRef===source.claimRef&&row.generationRef===source.generationRef);
            const action=one(current.actions,row=>row.actionRef===source.actionRef);
            const execution=one(current.executions,row=>row.executionRef===source.executionRef);
            if(current.task.taskRef!==value.taskRef||source.taskRef!==value.taskRef||value.version!==1||value.artifactRef!==R('df.installed-result/v1',value.taskRef,source.claimRef,source.executionRef)||canonical(retained)!==canonical(artifact)||retained.producerClaimRef!==source.claimRef||retained.generationRef!==source.generationRef||record.kind!=='artifact'||record.cryptoVersion!==2||record.digest!==retained.digest||record.sourceRef!==retained.artifactRef||record.byteLength!==Buffer.byteLength(data.content))fail('WORKER_RESULT_UNAVAILABLE');
            for(const key of ['recordRef','kind','digest','sourceRef','generationRef','byteLength','cryptoVersion','taskVersion','authEpoch','createdAt'])if(data[key]!==record[key])fail('WORKER_RESULT_UNAVAILABLE');
            ref(record.sourceRef);ref(retained.producerRef);ref(retained.recordRef);ref(retained.digest);
            if(worker.actionRef!==source.actionRef||worker.actionDigest!==source.actionDigest||worker.sessionRef!==source.sessionRef||action.actionDigest!==source.actionDigest||action.claimRef!==source.claimRef||action.generationRef!==source.generationRef||action.executionRef!==source.executionRef||action.spec.executor.generationRef!==source.generationRef||action.spec.executor.sessionRef!==source.sessionRef||action.spec.dataDigest!==source.inputDigest||execution.taskRef!==value.taskRef||execution.actionRef!==source.actionRef||execution.actionDigest!==source.actionDigest||execution.claimRef!==source.claimRef||execution.generationRef!==source.generationRef||execution.dataDigest!==source.inputDigest)fail('WORKER_RESULT_UNAVAILABLE');
            if(capture&&(capture.receipt.artifactRef!==value.artifactRef||capture.receipt.version!==value.version||capture.receipt.recordRef!==retained.recordRef||capture.receipt.digest!==retained.digest||['taskRef','actionRef','claimRef','generationRef','executionRef'].some(key=>capture.input[key]!==source[key])))fail('WORKER_RESULT_UNAVAILABLE');
            return canonical({artifact:retained,record,worker,action,execution});
          };
          binding=bind(snap);
          const after=cas(value);if(bind(after)!==binding)fail('WORKER_RESULT_UNAVAILABLE');
        }catch(error){if(['STALE_VERSION','STALE_AUTHORITY','SCOPE_DENIED','SERVICE_DISPOSED','REQUEST_ABORTED','OPERATOR_REQUIRED'].includes(error?.code))throw error;fail('WORKER_RESULT_UNAVAILABLE');}
        return immutable({artifactRef:value.artifactRef,version:value.version,recordRef:artifact.recordRef,digest:artifact.digest,source:body.source,content:body.content,verification:'not-reviewed',delivery:'not-requested'});
      },
      async workerFinish(value){markFinishWait('W01');value=input(value,executionCAS);if(api.normalNative){const ack=api.normalNative.readFinishFirst(value);if(ack!==null)return ack.receipt;}cas(value);planCurrent(value.taskRef,value.actionRef,undefined,true);if(!native)fail('WORKER_FINISH_UNAVAILABLE');const row=ownedMapping(value);if(!row||row.binding.taskRef!==value.taskRef||row.binding.claimRef!==value.claimRef||row.execution?.executionRef!==value.executionRef)fail('WORKER_FINISH_UNAVAILABLE');if(!api.normalNative)row.permit?.seal();markFinishWait('W02');const result=await native.finishExecution(value);markFinishWait('W03');row.permit?.seal();check();return result;},
    };
    const operations={};for(const[name,method]of Object.entries(methods))operations[name]=(value,context)=>{
      exact(context,['assertCurrent']);if(typeof context.assertCurrent!=='function')fail('SERVICE_DISPOSED');
      return runInstalledWorkerInvocation(ctx,context.assertCurrent,()=>{check();return method(value);});
    };
    async function previewResolver(spec,task){check();await refresh();const{plan}=planCurrent(task.taskRef,spec.actionRef);if(canonical(spec)!==canonical(plan.spec))fail('WORKER_MAPPING_MISMATCH');return immutable({targetDigest:spec.targetDigest,...spec.model,...Object.fromEntries(['environmentRef','bindingDigest','toolsDigest','permissionPolicyDigest'].map(key=>[key,spec.executor[key]])),evidenceRef:R('df.installed-preview-evidence/v1',configurationRef,facts.catalogEvidenceRef,spec.targetDigest),targetLabel:`Create one idle worker, then explicitly execute this context once. Native transcript: ${choice.persistence.directory}; unencrypted, ${choice.persistence.compression}, owner-managed retention. ${SYSTEM}`,providerLabel:facts.labels.provider,modelLabel:facts.labels.model,reasoningLabel:facts.labels.reasoning,presetLabel:facts.labels.preset,environmentLabel:`Owned workspace ${choice.environment.root}`,cwd:choice.environment.cwd,toolNames:[]});}
    return Object.freeze({hostPermission,previewResolver,previewTtlMs:choice.previewTtlMs,operations:Object.freeze(operations),status:()=>cachedStatus,
      normalSupport:api.normalNative?Object.freeze({
        refresh,readFacts(purpose){policyCurrent();const f=purpose==='producer'?facts:roleFacts[purpose==='audit_review'?'review':'repair'];if(!f)fail('WORKER_SOURCE_UNAVAILABLE');f.assertCurrent();return f;},
        adoptSignedResumePlan(value){check();policyCurrent();const pair=api.normalNative.readResumeInput({taskRef:value.taskRef,resumeRef:value.resumeRef}),snap=snapshot(value.taskRef),actual=snap.actions.find(a=>a.actionRef===value.spec.actionRef);if(!actual||actual.actionDigest!==value.actionDigest||canonical(actual.spec)!==canonical(value.spec)||actual.spec.resumeBinding?.resumeRef!==pair.association.resumeRef||pair.association.contextRecordRef!==value.contextRecordRef)fail('WORKER_MAPPING_MISMATCH');const key=`${value.taskRef}:${value.spec.actionRef}`,prior=plans.get(key);if(prior){if(prior.actionDigest!==value.actionDigest||canonical(prior.spec)!==canonical(value.spec))fail('IDEMPOTENCY_CONFLICT');return;}plans.set(key,{taskRef:value.taskRef,actionRef:value.spec.actionRef,actionDigest:value.actionDigest,spec:immutable(actual.spec),facts,contextRecordRef:value.contextRecordRef,grant:null});compose();},
        expectGrant(value){check();planCurrent(value.taskRef,value.actionRef,value.actionDigest);expect('grant',value);},
      }):undefined,auditSupport: auditChoice.enabled ? Object.freeze({ refresh, readFacts(purpose) { policyCurrent(); const f=roleFacts[purpose]; if(!f)fail('AUDIT_REPAIR_LIMIT'); f.assertCurrent(); const selected=auditChoice[purpose]; return immutable({configurationRef,nativeSourceRef:f.sourceRef,resourcePolicyVersion:accepted.version,modelPolicyVersion:accepted.modelPolicy.version,presetRef:f.presetRef,modelRef:f.modelRef,reasoningRef:f.reasoningRef,catalogEvidenceRef:facts.catalogEvidenceRef,environmentRef:f.environmentRef,bindingDigest:R('df.installed-audit-binding/v1',f.environmentRef,workspaceRef,f.modelRef,f.reasoningRef,f.presetRef,f.sourceRef),toolsDigest:R('df.installed-worker-tools/v1',[], 'DF_TOOL_DISPATCH_UNAVAILABLE'),permissionPolicyDigest:R('df.installed-audit-permission/v1',choice.policy,accepted.version,accepted.modelPolicy.version,persistence,ROLE_PROMPTS[purpose],selected),effectiveReasoningEffort:f.effort,accounting:f.accounting,pricing:f.pricing,costProvenanceRef:f.pricing==='source_zero'?f.sourceRef:null}); }, assertFactsCurrent(purpose){current();const f=roleFacts[purpose];if(!f)fail('AUDIT_REPAIR_LIMIT');f.assertCurrent();return f.sourceRef;}, nativeFacts(purpose){policyCurrent();const f=roleFacts[purpose];if(!f)fail('AUDIT_REPAIR_LIMIT');f.assertCurrent();return f;} }) : undefined,dispose(){active=false;revision++;previews.clear();prepared.clear();for(const row of agents.values())row.permit?.seal();unsubscribe();removePrepared?.();for(const remove of removers)remove();}});
  }
  return Object.freeze({installedWorkerInstaller});
}
