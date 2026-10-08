// Actual public DSH collector proposal; no imports/execution authorized yet.
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { canonical, canonicalDigest, exact, hash, integer, ref } from './runtime-security.mjs';
import { historyObservation, header as rootHeader, nativeEvents } from './normal-contracts.mjs';
import { immutable } from './installed-worker-facts.mjs';
import { resolveHostSource } from './host-probe.mjs';
import { BootstrapError } from './config.mjs';

const sessionsModule = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-session')).href);
const projectionsModule = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-session-projection')).href);
const { Session, SessionStore, SessionLogOffset, SessionSeq, snapshotSessionEvent, interruptedTurnClosers } = sessionsModule;
const { SessionProjectionRegistry } = projectionsModule;
const { SurfaceManager } = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-session', 'lib/types/surface.js')).href);
const { isJsonValue } = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-util-values')).href);
const { symbols } = await import(pathToFileURL(resolveHostSource('@deepseek-ai/cordis')).href);
const original=value=>value?.[symbols.original]??value;
const fail = code => { throw new BootstrapError(code); };
const surface = session => immutable({ nodes: [...session.surface.nodes], replaceGeneration: session.surface.replaceGeneration, contentGeneration: session.surface.contentGeneration });


// Project only validated ordinary stored root facts; retain the borrowed log.
// Public snapshots validate detached copies, never replace or mutate inputs.
export function projectStoredRootHistory(header, events, messageProjections) {
  if (!isJsonValue(header) || !isJsonValue(events)) fail('INVALID_INPUT');
  rootHeader(header); if (!isAbsolute(header.cwd)) fail('INVALID_INPUT');
  nativeEvents(events);
  for (const event of events) {
    if (event.type === 'request/header') {
      const { config, adapterDefaults } = event.data.header;
      if (config.provider.length === 0 || config.model.length === 0
        || (adapterDefaults?.reasoningEffort === true && config.reasoningEffort === undefined)
        || (adapterDefaults?.maxTokens === true && config.maxTokens === undefined)) fail('INVALID_INPUT');
    }
    SessionSeq(event.seq); snapshotSessionEvent(event);
  }
  const projected = new SurfaceManager(events, SessionLogOffset(0), messageProjections);
  const nodes = [...projected.nodes];
  const messages = nodes.map(seq => projected.deriveEventMessage(events[seq])).filter(message => message !== null);
  return { header, events, surface: { nodes, replaceGeneration: projected.replaceGeneration,
    contentGeneration: projected.contentGeneration }, messages };
}

// facts is returned by the actual pinned resolveInstalledWorkerFacts source.
// source is readAuthenticNativeSource's actual measured descriptor. Neither is
// returned by an owner endpoint. check repeats owner+invocation+lifetime gates.
export function createNativeHistoryCollector({ ctx, facts, source, check }) {
  const projections=ctx.reflect.get('sessionProjections'),projectionOriginal=original(projections);
  function current() {
    check(); source.assertCurrent(); facts.assertCurrent();
    if (!(facts.services.sessions instanceof SessionStore) || !(projections instanceof SessionProjectionRegistry) || original(ctx.reflect.get('sessionProjections'))!==projectionOriginal) fail('WORKER_SOURCE_UNAVAILABLE');
    return true;
  }
  function owned(agent) {
    current();
    if (!agent || facts.services.agents.get(agent.id) !== agent || facts.services.sessions.get(agent.id) !== agent.session || agent.session.id !== agent.id) fail('WORKER_MAPPING_MISMATCH');
  }
  function stopped(agent, session) {
    current();
    if(!agent||!(session instanceof Session)||agent.session!==session||session.id!==agent.id||facts.services.agents.get(agent.id)||facts.services.sessions.get(agent.id))fail('WORKER_MAPPING_MISMATCH');
  }
  async function read(nativeId, maxEvents, maxMessages, maxBytes, liveAgent, stoppedAgent) {
    const stoppedSession=stoppedAgent?.session;
    const readCurrent=()=>{current();if(stoppedAgent)stopped(stoppedAgent,stoppedSession);};
    readCurrent(); integer(maxEvents, 1, 128); integer(maxMessages, 0, 19); integer(maxBytes, 256, 65536);
    if (typeof nativeId !== 'string' || !/^df-[a-f0-9]{64}$/.test(nativeId)) fail('WORKER_RESUME_ORIGIN_UNAVAILABLE');
    if (liveAgent) {
      owned(liveAgent);
      if (await facts.services.sessions.flush(liveAgent.session) !== true) fail('WORKER_RESULT_UNAVAILABLE');
      readCurrent(); owned(liveAgent);
    } else if (facts.services.agents.get(nativeId) || facts.services.sessions.get(nativeId)) fail('SESSION_ALREADY_LIVE');
    const before = await facts.services.sessionPersistence.stat(nativeId); readCurrent();
    if (!before || !Number.isSafeInteger(before.sizeBytes) || before.sizeBytes < 0 || before.sizeBytes > 1048576) fail('WORKER_RESUME_HISTORY_LIMIT');
    let handle, observed;
    try {
      handle = await facts.services.sessionPersistence.open(nativeId, 'read'); readCurrent();
      if (handle.id !== nativeId || handle.access !== 'read' || handle.header.id !== nativeId || handle.header.isSeeded || handle.inheritedEventCount !== 0) fail('WORKER_RESUME_REPAIR_REQUIRED');
      const log = await handle.read(0, maxEvents + 1); readCurrent();
      if (stoppedAgent&&log.eventState!=='shared-frozen')fail('WORKER_RESULT_UNAVAILABLE');
      if (log.events.length > maxEvents || log.events.some((event, index) => event.seq !== index)) fail('WORKER_RESUME_HISTORY_LIMIT');
      const projected = projectStoredRootHistory(handle.header, log.events, facts.services.sessions.messageProjections);
      const { messages, events } = projected;
      if (messages.length > maxMessages || interruptedTurnClosers(events).length) fail('WORKER_RESUME_REPAIR_REQUIRED');
      const restored = ctx.reflect.get('sessionProjections').restore({}, events, SessionLogOffset(0), handle.header, SessionLogOffset(0));
      const inbox = restored.snapshot.values.inbox;
      exact(inbox, ['next-turn', 'next-step']);
      if (!Array.isArray(inbox['next-turn']) || !Array.isArray(inbox['next-step']) || inbox['next-turn'].length || inbox['next-step'].length) fail('WORKER_RESUME_INBOX_PENDING');
      observed = immutable(projected);
      if (Buffer.byteLength(canonical(observed)) > maxBytes) fail('WORKER_RESUME_HISTORY_LIMIT');
      if (liveAgent || stoppedAgent) {
        const actual=liveAgent??stoppedAgent;if(liveAgent)owned(liveAgent);else stopped(stoppedAgent,stoppedSession);
        if (canonical(actual.session.header)!==canonical(observed.header)||actual.session.seq !== events.length || canonical(actual.session.snapshotEvents(SessionLogOffset(0))) !== canonical(events) || canonical(surface(actual.session)) !== canonical(observed.surface) || canonical(actual.session.deriveMessages()) !== canonical(messages)) fail('WORKER_RESUME_HISTORY_STALE');
      }
    } finally { if (handle) await handle.close();readCurrent(); }
    readCurrent(); if (liveAgent) owned(liveAgent);
    const after = await facts.services.sessionPersistence.stat(nativeId); readCurrent();
    if (!after || canonical(before) !== canonical(after)) fail('WORKER_RESUME_HISTORY_STALE');
    if(stoppedAgent&&(canonical(stoppedSession.header)!==canonical(observed.header)||stoppedSession.seq!==observed.events.length||canonical(stoppedSession.snapshotEvents(SessionLogOffset(0)))!==canonical(observed.events)||canonical(surface(stoppedSession))!==canonical(observed.surface)||canonical(stoppedSession.deriveMessages())!==canonical(observed.messages)))fail('WORKER_RESUME_HISTORY_STALE');
    // Physical bound is checked before and after public decode. The host has
    // no filesystem CAS or maxRead/decompression allocation argument.
    return observed;
  }
  return Object.freeze({ current, readCold: (nativeId, bounds) => read(nativeId, bounds.maxEvents, bounds.maxMessages, bounds.maxBytes),
    async observeLive(agent, binding, configurationDigest, phase = 'committed') {
      exact(binding, ['ownerRef','workspaceRef','taskRef','claimRef','generationRef','sessionRef']); Object.values(binding).forEach(ref); ref(configurationDigest);
      owned(agent); if (hash(agent.id) !== binding.sessionRef || agent.status !== 'idle') fail('WORKER_RESULT_UNAVAILABLE');
      const original = await read(agent.id, 128, phase === 'baseline' ? 0 : 19, 65536, agent); owned(agent);
      const observation = immutable({ schema:'df.native-history/v1', ...binding, sourceRef:facts.sourceRef, stableSourceRef:source.stableSourceRef, configurationDigest, ...original });
      historyObservation(observation); if (phase === 'baseline' && observation.messages.length) fail('WORKER_RESULT_UNAVAILABLE');
      return observation;
    },
    async observeStopped(agent,binding,configurationDigest) {
      exact(binding,['ownerRef','workspaceRef','taskRef','claimRef','generationRef','sessionRef']);Object.values(binding).forEach(ref);ref(configurationDigest);
      const session=agent?.session;stopped(agent,session);if(hash(agent.id)!==binding.sessionRef)fail('WORKER_RESULT_UNAVAILABLE');
      // No detached flush/wake/create. Original disposer closes its writer;
      // fresh public readonly log and retained ORIGINAL Session must agree.
      const persisted=await read(agent.id,128,19,65536,undefined,agent);stopped(agent,session);
      const observation=immutable({schema:'df.native-history/v1',...binding,sourceRef:facts.sourceRef,stableSourceRef:source.stableSourceRef,configurationDigest,...persisted});historyObservation(observation);return observation;
    },
    readPersistedUsage(observation,result) {
      current();historyObservation(observation);
      if(facts.accounting!=='df-testing-utf8-byte-units/v1'||facts.pricing!=='source_zero')fail('COST_UNKNOWN');
      const outputs=observation.events.filter(e=>e.type==='assistant/message'&&e.seq===result.cursor);
      if(outputs.length!==1)fail('WORKER_RESULT_UNAVAILABLE');const u=outputs[0].data.usage;
      if(!u)fail('WORKER_RESULT_UNAVAILABLE');integer(u.inputTokens,0,100000000);integer(u.outputTokens,0,100000000);integer(u.totalTokens,0,100000000);
      if(u.totalTokens!==u.inputTokens+u.outputTokens||u.outputTokens!==Buffer.byteLength(result.content))fail('WORKER_RESULT_UNAVAILABLE');
      // Fresh persisted provider fields are the returned accounting facts.
      // Old permit facts are only an additional equality discriminator in source.
      return immutable({accounting:facts.accounting,inputUnits:u.inputTokens,outputUnits:u.outputTokens,totalUnits:u.totalTokens,resultDigest:hash(result.content)});
    },
    validateCommitted(observation, result, usage, purpose, approvedBody, priorMessages = []) {
      current(); historyObservation(observation);
      const expectedKind = purpose === 'producer' ? 'df-context' : 'df-audit-input';
      const users = observation.events.filter(e => e.type === 'user/message' && e.data.id === result.executionRef);
      const assistants = observation.events.filter(e => e.type === 'assistant/message' && e.seq === result.cursor);
      if (users.length !== 1 || assistants.length !== 1) fail('WORKER_RESULT_UNAVAILABLE');
      const input = users[0], output = assistants[0];
      if (input.seq >= output.seq || input.data.source.kind !== expectedKind || input.data.source.form !== 'local' || canonical(input.data.content) !== canonical([{type:'text',text:approvedBody}]) || canonical(output.data.message.content) !== canonical([{type:'text',text:result.content}]) || hash(result.content) !== result.digest) fail('WORKER_RESULT_UNAVAILABLE');
      const end = observation.events.find(e => e.type === 'turn/end' && e.data.turn === output.data.turn && e.seq > output.seq);
      if (!end || end.data.reason.kind !== 'completed' || output.data.usage?.inputTokens !== usage.inputUnits || output.data.usage?.outputTokens !== usage.outputUnits || output.data.usage?.totalTokens !== usage.totalUnits) fail('WORKER_RESULT_UNAVAILABLE');
      const messages = observation.messages;
      if (priorMessages.length ? canonical(messages.slice(0, priorMessages.length)) !== canonical(priorMessages) || messages.length !== priorMessages.length + 2 : messages.length !== 3) fail('WORKER_RESULT_UNAVAILABLE');
      if (messages.at(-2).id !== result.executionRef || canonical(messages.at(-1)) !== canonical(output.data.message)) fail('WORKER_RESULT_UNAVAILABLE');
      const evidenceRef = canonicalDigest(['df.normal-native.original-history/v1', observation, result.executionRef, input.seq, output.seq, usage]);
      current(); return immutable({ usageUnits:usage.totalUnits, evidenceRef, resultDigest:result.digest, ...(purpose==='producer'?{}:{inputCursor:input.seq}), historyObservation:observation });
    },
  });
}
