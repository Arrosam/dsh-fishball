// Observes natural original events only. Does not compose a host or emit events.
import assert from 'node:assert/strict';
import { keys, resumeEventWindow } from './public-oracles.mjs';
import { Context } from '../dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js';

export function observeOriginalContext(ctx) {
  assert(ctx instanceof Context);
  const events = [], agents = [], requests = [], disposers = [];
  const counts = { sessionCreated:0, agentCreated:0, agentDisposed:0, sessionDisposed:0, modelStreams:0 };
  let active = true;
  function record(kind, value) {
    assert(active); assert(events.length < 32, 'Selected natural event bound exceeded');
    counts[kind]++; events.push(Object.freeze({kind,...value}));
  }
  try {
    disposers.push(ctx.on('session/created', session => record('sessionCreated', {sessionId:session.id})));
    disposers.push(ctx.on('agent/created', ({agent,source}) => {
      assert(agents.length < 2, 'Selected original agent publication bound exceeded');
      agents.push(agent); record('agentCreated', {agentId:agent.id,sessionId:agent.session.id,source});
      // No await, whenIdle, send, disposal or callback invocation here.
    }));
    disposers.push(ctx.on('agent/disposed', ({agent}) => record('agentDisposed', {agentId:agent.id,sessionId:agent.session.id})));
    disposers.push(ctx.on('session/disposed', session => record('sessionDisposed', {sessionId:session.id})));
    disposers.push(ctx.on('llm/stream', (options, next) => {
      assert(requests.length < 2, 'Selected mocked-stream bound exceeded');
      assert(Buffer.byteLength(JSON.stringify(options.messages)) <= 32768);
      requests.push(structuredClone(options.messages)); record('modelStreams', {});
      return next(); // Original waterfall and original registered source stay intact.
    }));
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose(); throw error;
  }
  return Object.freeze({
    counts:() => { assert(active, 'Original observer is closed; live counts unavailable'); return structuredClone(counts); },
    // Retained event/request reads are historical after close, never live no-effect proof.
    events:() => Object.freeze(events.map(row => Object.freeze({...row}))),
    requests:() => structuredClone(requests),
    originalAgents:() => agents.slice(),
    close() { if (!active) return; active = false; for (const dispose of disposers.reverse()) dispose(); },
  });
}

export function assertSameIdResumeObservation(trace, predecessor, worker, execution, preResumePrefix, preExecutePrefix) {
  trace.counts(); // Original live read refuses after its listeners have closed.
  keys(worker, ['taskRef','actionRef','actionDigest','claimRef','reservationRef','generationRef','sessionRef','phase']);
  assert(['created','ready'].includes(worker.phase));
  resumeEventWindow(trace.events(), preResumePrefix, preExecutePrefix,
    {nativeAgentId:predecessor.nativeAgentId,nativeSessionId:predecessor.nativeSessionId});
  assert.equal(worker.taskRef, predecessor.taskRef); assert.equal(worker.sessionRef, predecessor.sessionRef);
  assert.notEqual(worker.claimRef, predecessor.claimRef); assert.notEqual(worker.generationRef, predecessor.generationRef);
  assert.notEqual(execution.executionRef, predecessor.executionRef);
  assert.equal(execution.state, 'committed');
  assert.equal(execution.usage.state, 'actual');
  assert.equal(execution.usage.accounting, 'df-testing-utf8-byte-units/v1');
  // Root captures both exact prefixes from this original trace before resume
  // and after publication/before explicit execute; snapshots issue no authority.
  // Complete retained/readonly history, request-prefix equality, usage and final
  // settlement need separate actual observations. This partial oracle grants none.
}
