// Pure synthetic regressions only. Root owns future execution and evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys, resumeEventWindow } from './public-oracles.mjs';

const rejectDto = value => assert.throws(() => keys(value, ['field'], ['optional']), assert.AssertionError);

test('keys accepts ordinary required and optional data fields', () => {
  assert.doesNotThrow(() => keys({field:1}, ['field'], ['optional']));
  assert.doesNotThrow(() => keys({field:1,optional:2}, ['field'], ['optional']));
});
test('keys accepts a frozen ordinary DTO', () => {
  assert.doesNotThrow(() => keys(Object.freeze({field:1,optional:2}), ['field'], ['optional']));
});
test('keys rejects a missing required key', () => rejectDto({optional:2}));
test('keys rejects an extra enumerable key', () => rejectDto({field:1,extra:2}));
test('keys rejects an extra nonenumerable key', () => {
  const value = {field:1}; Object.defineProperty(value, 'extra', {value:2}); rejectDto(value);
});
test('keys rejects an own symbol key', () => {
  const value = {field:1}; value[Symbol('extra')] = 2; rejectDto(value);
});
test('keys rejects a getter without invoking it', () => {
  let calls = 0; const value = {};
  Object.defineProperty(value, 'field', {enumerable:true,get(){calls++;return 1;}});
  rejectDto(value); assert.equal(calls, 0);
});
test('keys rejects a setter without invoking it', () => {
  let calls = 0; const value = {};
  Object.defineProperty(value, 'field', {enumerable:true,set(){calls++;}});
  rejectDto(value); assert.equal(calls, 0);
});
test('keys rejects a combined accessor without invoking either accessor', () => {
  let reads = 0, writes = 0; const value = {};
  Object.defineProperty(value, 'field', {enumerable:true,get(){reads++;return 1;},set(){writes++;}});
  rejectDto(value); assert.equal(reads, 0); assert.equal(writes, 0);
});
test('keys rejects a nonplain prototype', () => rejectDto(Object.assign(Object.create({inherited:true}), {field:1})));
test('keys rejects a null-prototype object', () => rejectDto(Object.assign(Object.create(null), {field:1})));
test('keys rejects null', () => rejectDto(null));
test('keys rejects an array', () => rejectDto(Object.assign([], {field:1})));

const expected = Object.freeze({nativeAgentId:'synthetic-agent',nativeSessionId:'synthetic-session'});
const session = () => ({kind:'sessionCreated',sessionId:expected.nativeSessionId});
const agent = source => ({kind:'agentCreated',agentId:expected.nativeAgentId,sessionId:expected.nativeSessionId,source});
const stream = () => ({kind:'modelStreams'});
const donor = () => [session(),agent('startup'),stream(),
  {kind:'agentDisposed',agentId:expected.nativeAgentId,sessionId:expected.nativeSessionId},
  {kind:'sessionDisposed',sessionId:expected.nativeSessionId}];
function scenario(suffix = [session(),agent('resume'),stream()], idleLength = 2) {
  const pre = donor(), rows = [...pre,...suffix], idle = rows.slice(0,pre.length+idleLength);
  return {rows,pre,idle};
}
const checkWindow = value => resumeEventWindow(value.rows,value.pre,value.idle,expected);
const rejectWindow = value => assert.throws(() => checkWindow(value), assert.AssertionError);

test('resume window accepts donor-inclusive natural rows and exact boundary prefixes', () => {
  const value = scenario(); assert.equal(value.rows.filter(row => row.kind === 'modelStreams').length, 2);
  assert.doesNotThrow(() => checkWindow(value));
});
test('resume window rejects a stale donor announcement without a new announcement', () => {
  rejectWindow(scenario([agent('resume'),stream()],1));
});
test('resume window rejects a new announcement after agent publication', () => {
  rejectWindow(scenario([agent('resume'),session(),stream()]));
});
test('resume window rejects a stream before the post-publication pre-execute snapshot', () => {
  rejectWindow(scenario([session(),stream(),agent('resume'),stream()],3));
});
test('resume window rejects an extra successor stream', () => {
  rejectWindow(scenario([session(),agent('resume'),stream(),stream()]));
});
test('resume window rejects a mismatched pre-resume prefix', () => {
  const value = scenario(); value.pre = structuredClone(value.pre); value.pre[0].sessionId = 'wrong-prefix'; rejectWindow(value);
});
test('resume window rejects a mismatched pre-execute prefix', () => {
  const value = scenario(); value.idle = structuredClone(value.idle); value.idle.at(-1).source = 'startup'; rejectWindow(value);
});
test('resume window rejects reversed boundary order', () => {
  const value = scenario(); value.pre = value.rows.slice(0,7); value.idle = value.rows.slice(0,5); rejectWindow(value);
});
test('resume window rejects a mismatched resumed session identity', () => {
  const wrong = {...session(),sessionId:'foreign-session'}; rejectWindow(scenario([wrong,agent('resume'),stream()]));
});
test('resume window rejects a mismatched resumed agent identity', () => {
  const wrong = {...agent('resume'),agentId:'foreign-agent'}; rejectWindow(scenario([session(),wrong,stream()]));
});
test('resume window rejects a snapshot captured before publication', () => {
  rejectWindow(scenario([session(),agent('resume'),stream()],1));
});
test('resume window rejects a startup publication in the successor window', () => {
  rejectWindow(scenario([session(),agent('startup'),stream()]));
});
