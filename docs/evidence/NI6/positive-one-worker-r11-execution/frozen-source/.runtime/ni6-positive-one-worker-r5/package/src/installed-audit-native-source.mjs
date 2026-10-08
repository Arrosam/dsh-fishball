import { ownInstalledStream } from './installed-owned-stream.mjs';
import { types } from 'node:util';
import { BootstrapError } from './config.mjs';
import { canonical, exact, hash, integer, ref } from './runtime-security.mjs';
import { installedRef as R } from './installed-worker-facts.mjs';
import { ROLE_PROMPTS, ROLE_MODELS } from './installed-role-recipes.mjs';
import { captureInstalledWorkerInvocation, withInstalledWorkerInvocation } from './installed-invocation.mjs';
const fail = () => { throw new BootstrapError('AUDIT_COLLECTION_UNAVAILABLE'); };
const same = (a,b) => canonical(a) === canonical(b);
// Original host composition. Module booleans narrow these actual observations;
// they cannot manufacture original scoped session/usage facts.
export function createAuditNativeSource({ ctx, choice, worker, readFacts, check, assertRequest, readInput, normalNative }) {
  const agents = new WeakMap(), retained = new Set();
  let active = true;
  function current(row, unpublished = false) {
    check(); if (!active || !row) fail();
    const f = readFacts(row.role); f.assertCurrent();
    if (f.sourceRef !== row.facts.sourceRef || row.agent.options.provider !== choice[row.role].selection.provider || row.agent.options.model !== ROLE_MODELS[row.role] || (row.agent.options.reasoningEffort ?? null) !== f.effort || row.agent.options.maxTokens !== choice[row.role].selection.maxOutputTokens || row.agent.id !== 'df-' + row.binding.generationRef || row.agent.session.id !== row.agent.id || row.agent.ctx !== row.ctx || !(row.ctx instanceof f.modules.cordis.Context) || f.modules['dsh-scope'].scopeOf(row.ctx) !== row.agent) fail();
    const published = f.services.agents.get(row.agent.id) === row.agent && f.services.sessions.get(row.agent.id) === row.agent.session;
    if (published) row.factoryPhase = 'published';
    if (!unpublished && !published || unpublished && !published && !['setup','committed'].includes(row.factoryPhase)) fail();
    const tools = row.ctx.reflect.get('tools');
    if (!(tools instanceof f.modules['dsh-tools'].default) || tools.schemas().length !== 0 || f.services.agentPresets.composedPreset(row.ctx) !== choice[row.role].selection.agentPreset) fail();
    const inspect = f.services.agentPresets.inspectCompositions(row.ctx);
    if (inspect.length !== 1 || inspect[0].id !== choice[row.role].selection.agentPreset || inspect[0].modules.length || inspect[0].leakedServices.length) fail();
    return f;
  }
  function request(row, options) {
    return withInstalledWorkerInvocation(ctx,row.guard,() => {
      const f = current(row); if (!row.execution || !row.permit || row.outer !== 'entered' || f.services.agents.currentInitiator() !== row.agent) fail();
      assertRequest({taskRef:row.execution.taskRef,claimRef:row.execution.claimRef,generationRef:row.execution.generationRef,actionDigest:row.execution.actionDigest,executionRef:row.execution.executionRef});
      if (!options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype) fail();
      const fields=Object.getOwnPropertyDescriptors(options);
      for(const key of Reflect.ownKeys(fields)) if(typeof key==='string' && (!fields[key].enumerable || !Object.hasOwn(fields[key],'value') || !['provider','model','reasoningEffort','maxTokens','messages','tools','toolHistory','signal','sessionId','system','temperature','stop','purpose'].includes(key)))fail();
      const read=key=>fields[key]?.value, selected=choice[row.role].selection;
      if(read('provider')!==selected.provider || read('model')!==selected.model || (read('reasoningEffort')??null)!==f.effort || read('maxTokens')!==selected.maxOutputTokens || read('sessionId')!==row.agent.id || ['system','temperature','stop','purpose'].some(key=>read(key)!==undefined) || read('tools')!==undefined&&!same(read('tools'),[]) || read('toolHistory')!==undefined&&!same(read('toolHistory'),{tools:[],updates:[]}))fail();
      const messages=JSON.parse(canonical(read('messages')));if(messages.length!==2)fail();
      const [system,user]=messages;exact(system,['id','role','content','source']);exact(system.source,['kind']);exact(user,['id','role','content','source']);exact(user.source,['kind','form']);
      if(typeof system.id!=='string'||!system.id||Buffer.byteLength(system.id)>128||system.role!=='system'||system.source.kind!=='system-prompt'||!same(system.content,[{type:'text',text:ROLE_PROMPTS[row.role]}])||user.role!=='user'||user.id!==row.execution.executionRef||user.source.kind!=='df-audit-input'||user.source.form!=='local'||!same(user.content,[{type:'text',text:row.body.content}])||hash(row.body.content)!==row.execution.inputDigest||Buffer.byteLength(JSON.stringify(read('messages')))>worker.bounds.requestBytes)fail();
      check(); return true;
    });
  }
  const remove=ctx.on('llm/stream',(options,next)=>{
    let row;for(const r of retained)if(r.facts.services.agents.currentInitiator()===r.agent){row=r;break;}
    if(!row)return next();
    return ownInstalledStream(ctx,row.guard,{start(){current(row);if(row.outer!=='prepared')fail();row.outer='entered';},check:()=>request(row,options),open:next});
  });
  if(typeof remove!=='function')fail();
  const hooks={
    async setupAgent(agentCtx,agent,binding){
      check();const role=binding.spec.role;if(!['review','repair'].includes(role)||agents.has(agent))fail();const f=readFacts(role);f.assertCurrent();
      f.claimDirectory({taskRef:binding.taskRef,actionRef:binding.actionRef,claimRef:binding.claimRef,generationRef:binding.generationRef});
      const row={ctx:agentCtx,agent,binding,role,facts:f,execution:null,body:null,permit:null,guard:null,outer:'unprepared',factoryPhase:'setup'};agents.set(agent,row);retained.add(row);
      const preset=await f.services.agentPresets.mount(agentCtx,choice[role].selection.agentPreset);check();if(preset.id!==choice[role].selection.agentPreset)fail();
      const tools=agentCtx.reflect.get('tools');if(!(tools instanceof f.modules['dsh-tools'].default))fail();tools.restrict({allow:[]});
      agentCtx.reflect.get('systemPrompt').section({name:'df-installed-audit-'+role,order:0,text:ROLE_PROMPTS[role],complete:true,interpolate:false});agentCtx.reflect.get('systemPrompt').suppressRuntimeContext();f.modules['dsh-user-approval'].setApprovalPolicy(agent.session,'never');current(row,true);
    },
    commitAgent(agentCtx,agent,binding){const row=agents.get(agent);current(row,true);if(row.ctx!==agentCtx||!same(row.binding,binding)||row.factoryPhase!=='setup')fail();row.factoryPhase='committed';return true;},
    bindExecution(agent,execution,body){
      check();const row=agents.get(agent),f=current(row);if(row.execution||!f.providerBinding)fail();
      const pair=readInput({taskRef:execution.taskRef,inputRecordRef:execution.inputRecordRef});
      if(!same(pair.association.recordRef,execution.inputRecordRef)||pair.data.content!==body.content||body.digest!==execution.inputDigest||hash(body.content)!==execution.inputDigest||pair.association.artifactDigest!==execution.dataDigest)fail();
      row.execution=execution;row.body=body;row.guard=captureInstalledWorkerInvocation(ctx);row.outer='prepared';
      row.permit=f.providerBinding.issue({agent,executionRef:execution.executionRef,content:body.content,role:row.role,maxOutputTokens:choice[row.role].selection.maxOutputTokens,requestBytes:worker.bounds.requestBytes,resultBytes:choice.resultByteLimit,usageUnits:choice[row.role].charges.usageUnits,assertCurrent:options=>request(row,options)});return true;
    },
    async validateResult(agent,result,checkpoint){
      if(checkpoint?.phase==='before_stop'){
        exact(checkpoint,['phase']);const row=agents.get(agent),w=row?.finalWitness;
        if(!w||w.agent!==agent||w.session!==agent.session||w.binding!==row.binding||w.execution!==row.execution||w.body!==row.body||w.permit!==row.permit||w.ctx!==row.ctx||w.fiber!==row.ctx.fiber||w.sourceRef!==row.facts.sourceRef||!same(w.result,result))fail();
        const out=await hooks.validateResult(agent,result);if(!same(out.historyObservation,w.history)||!same(row.finalWitness.usage,w.usage))fail();return out;
      }
      if(checkpoint!==undefined){
        exact(checkpoint,['phase','terminalEvidenceRef']);if(checkpoint.phase!=='stopped')fail();ref(checkpoint.terminalEvidenceRef);
        check();const row=agents.get(agent),w=row?.finalWitness;if(!active||!w)fail();
        const verify=()=>{check();if(!active||row.agent!==agent||w.agent!==agent||row.binding!==w.binding||row.execution!==w.execution||row.body!==w.body||row.permit!==w.permit||agent.session!==w.session||agent.ctx!==w.ctx||row.ctx!==w.ctx||row.ctx.fiber!==w.fiber||row.ctx.fiber.uid!==null||canonical(result)!==canonical(w.result))fail();const f=readFacts(row.role);f.assertCurrent();if(agent.options.provider!==choice[row.role].selection.provider||agent.options.model!==ROLE_MODELS[row.role]||(agent.options.reasoningEffort??null)!==f.effort||agent.options.maxTokens!==choice[row.role].selection.maxOutputTokens||f.sourceRef!==w.sourceRef||f.services.agents.get(agent.id)||f.services.sessions.get(agent.id)||f.modules['dsh-scope'].scopeOf(row.ctx)!==agent)fail();return f;};
        verify();const h=await normalNative.observeHistory(agent,row.binding,`audit_${row.role}`,'stopped');verify();if(!same(h,w.history))fail();
        const out=normalNative.validateHistory(h,result,w.usage,`audit_${row.role}`,w.body.content,[],'stopped');verify();return out;
      }
      check();const row=agents.get(agent),f=current(row);
      if(result.phase==='baseline'){if(!row.binding.spec.nativeOriginBinding||row.execution)fail();const h=await normalNative.observeHistory(agent,row.binding,`audit_${row.role}`,'baseline');check();current(row);return{historyObservation:h};}
      const usage=row.permit?.usage();
      if(!usage||usage.accounting!=='df-testing-utf8-byte-units/v1'||usage.totalUnits!==usage.inputUnits+usage.outputUnits||usage.totalUnits>choice[row.role].charges.usageUnits||usage.resultDigest!==result.digest||hash(result.content)!==result.digest||Buffer.byteLength(result.content)>choice.resultByteLimit||row.execution?.executionRef!==result.executionRef)fail();
      if(row.binding.spec.nativeOriginBinding){const h=await normalNative.observeHistory(agent,row.binding,`audit_${row.role}`,'committed');check();current(row);const out=normalNative.validateHistory(h,result,usage,`audit_${row.role}`,row.body.content,[]);row.finalWitness=Object.freeze({agent,session:agent.session,binding:row.binding,execution:row.execution,body:row.body,permit:row.permit,ctx:row.ctx,fiber:row.ctx.fiber,sourceRef:f.sourceRef,result,history:h,usage});return out;}
      if(await f.services.sessions.flush(agent.session)!==true)fail();check();current(row);
      const count=integer(agent.session.seq,0,128),stat=await f.services.sessionPersistence.stat(agent.id);check();current(row);
      if(!stat||!Number.isSafeInteger(stat.sizeBytes)||stat.sizeBytes>1048576||agent.session.seq!==count)fail();
      const reader=await f.services.sessionPersistence.open(agent.id,'read');
      try{check();current(row);
        if(reader.id!==agent.id||reader.access!=='read'||reader.header.id!==agent.id||reader.header.isSeeded||reader.inheritedEventCount!==0)fail();
        const log=await reader.read(0,128);check();current(row);
        if(log.events.length!==count||agent.session.seq!==count||log.events.some((e,i)=>e.seq!==i))fail();
        const users=log.events.filter(e=>e.type==='user/message'),answers=log.events.filter(e=>e.type==='assistant/message'),starts=log.events.filter(e=>e.type==='turn/start'),ends=log.events.filter(e=>e.type==='turn/end');
        if(users.length!==1||answers.length!==1||starts.length!==1||ends.length!==1||ends[0].data.turn!==starts[0].data.turn||ends[0].seq<=answers[0].seq||answers[0].data.interrupted===true||log.events.some(e=>['developer/message','tool/result','assistant/attempt'].includes(e.type)))fail();
        const u=users[0],a=answers[0];if(u.data.id!==result.executionRef||u.data.role!=='user'||u.data.source?.kind!=='df-audit-input'||u.data.source?.form!=='local'||!same(u.data.content,[{type:'text',text:row.body.content}])||a.seq!==result.cursor||a.seq<=u.seq||!same(a.data.message.content,[{type:'text',text:result.content}])||a.data.usage?.inputTokens!==usage.inputUnits||a.data.usage?.outputTokens!==usage.outputUnits||a.data.usage?.totalTokens!==usage.totalUnits)fail();
        return Object.freeze({usageUnits:usage.totalUnits,resultDigest:result.digest,inputCursor:u.seq,evidenceRef:R('df.installed-audit-result-persistence/v1',result.executionRef,u.seq,a.seq,result.digest,usage,stat.header)});
      }catch(error){check();throw error;}finally{await reader.close();check();current(row);}
    },
  };
  return Object.freeze({hooks:Object.freeze(hooks),toolGuard(record){try{check();const row=agents.get(record.agent);if(!row||record.taskRef!==row.binding.taskRef||record.generationRef!==row.binding.generationRef||record.claimRef!==row.binding.claimRef||record.toolsDigest!==row.binding.spec.executor.toolsDigest||record.permissionPolicyDigest!==row.binding.spec.executor.permissionPolicyDigest||!Array.isArray(record.schemas)||record.schemas.length) return false;current(row,row.factoryPhase!=='published');return true;}catch{return false;}},sealExecution(input){check();for(const row of retained)if(row.execution?.executionRef===input.executionRef&&row.binding.taskRef===input.taskRef&&row.binding.claimRef===input.claimRef&&row.binding.generationRef===input.generationRef){row.permit?.seal();return;}fail();},seal(){active=false;for(const row of retained)row.permit?.seal();remove();}});
}
