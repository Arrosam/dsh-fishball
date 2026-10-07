// UNIT_ONLY: one pure helper, JSON DTOs, and Node's test/assert built-ins.
// No provider/SDK import, adapter, fetch replacement, socket, or model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPTED_RESPONSE_MODELS, inspectResponseEnvelope } from './ollama-response-envelope.mjs';

const parsed = value => JSON.parse(JSON.stringify(value));
const response = (changes = {}) => parsed({ model: 'deepseek-v4.1-flash:cloud',
  done: true, message: { role: 'assistant', content: 'UNIT_ONLY synthetic response' },
  done_reason: 'stop', prompt_eval_count: 8, eval_count: 3, ...changes });
const valid = Object.freeze({ schema: 'df.ollama-response-envelope/v1', accepted: true,
  responseShape: 'object', errorField: 'absent', completion: 'complete',
  responseModel: 'request', messageShape: 'object', assistantRole: 'assistant', refusal: 'NONE' });
const expected = changes => ({ ...valid, ...changes });
const invalidRoot = shape => expected({ accepted: false, responseShape: shape,
  errorField: 'not-inspected', completion: 'not-inspected', responseModel: 'not-inspected',
  messageShape: 'not-inspected', assistantRole: 'not-inspected', refusal: 'INVALID_RESPONSE_SHAPE' });
const wrongMessage = shape => expected({ accepted: false, messageShape: shape,
  assistantRole: 'not-inspected', refusal: 'ASSISTANT_ROLE_REQUIRED' });
const refusedModel = kind => expected({ accepted: false, responseModel: kind, refusal: 'RESPONSE_MODEL_NOT_APPROVED' });
const refusedCompletion = kind => expected({ accepted: false, completion: kind, refusal: 'COMPLETION_NOT_TRUE' });
const refusedRole = kind => expected({ accepted: false, assistantRole: kind, refusal: 'ASSISTANT_ROLE_REQUIRED' });

// Expected DTOs are explicit AC decision-table facts, not derived by invoking
// the classifier. Each of these 36 cells invokes it exactly once.
const cells = [
  ['RC01', 'exact request spelling accepted', response(), valid],
  ['RC02', 'pinned cloud base spelling accepted', response({ model: 'deepseek-v4.1-flash' }), expected({ responseModel: 'cloud-base' })],
  ['RC03', 'base spelling supplies no completion', response({ model: 'deepseek-v4.1-flash', done: false }), expected({ accepted: false, responseModel: 'cloud-base', completion: 'incomplete', refusal: 'COMPLETION_NOT_TRUE' })],
  ['RC04', 'base spelling still requires assistant role', response({ model: 'deepseek-v4.1-flash', message: { role: 'user' } }), expected({ accepted: false, responseModel: 'cloud-base', assistantRole: 'unapproved', refusal: 'ASSISTANT_ROLE_REQUIRED' })],
  ['RC05', 'present null error remains refused for base spelling', response({ model: 'deepseek-v4.1-flash', error: null }), expected({ accepted: false, responseModel: 'cloud-base', errorField: 'present', refusal: 'ERROR_FIELD_PRESENT' })],
  ['RC06', 'unrelated model refused', response({ model: 'UNIT_ONLY_unapproved_model' }), refusedModel('unapproved')],
  ['RC07', 'another tag is not an alias', response({ model: 'deepseek-v4.1-flash:latest' }), refusedModel('unapproved')],
  ['RC08', 'near prefix is not an alias', response({ model: 'deepseek-v4.1-flash:cloud-extra' }), refusedModel('unapproved')],
  ['RC09', 'model comparison preserves exact case', response({ model: 'DeepSeek-v4.1-flash:cloud' }), refusedModel('unapproved')],
  ['RC10', 'missing model refused', response({ model: undefined }), refusedModel('missing')],
  ['RC11', 'numeric model refused', response({ model: 1 }), refusedModel('non-string')],
  ['RC12', 'null model refused', response({ model: null }), refusedModel('non-string')],
  ['RC13', 'incomplete exact model response refused', response({ done: false }), refusedCompletion('incomplete')],
  ['RC14', 'missing done refused', response({ done: undefined }), refusedCompletion('missing')],
  ['RC15', 'string true is not completion', response({ done: 'true' }), refusedCompletion('invalid')],
  ['RC16', 'numeric truthiness is not completion', response({ done: 1 }), refusedCompletion('invalid')],
  ['RC17', 'upstream error string remains refused', response({ error: 'UNIT_ONLY_ERROR_TEXT' }), expected({ accepted: false, errorField: 'present', refusal: 'ERROR_FIELD_PRESENT' })],
  ['RC18', 'empty error field remains refused', response({ error: '' }), expected({ accepted: false, errorField: 'present', refusal: 'ERROR_FIELD_PRESENT' })],
  ['RC19', 'false error field remains refused', response({ error: false }), expected({ accepted: false, errorField: 'present', refusal: 'ERROR_FIELD_PRESENT' })],
  ['RC20', 'null response refused', parsed(null), invalidRoot('null')],
  ['RC21', 'array response refused', parsed([{ model: 'deepseek-v4.1-flash:cloud', done: true }]), invalidRoot('array')],
  ['RC22', 'string response refused', parsed('UNIT_ONLY_ROOT_STRING'), invalidRoot('string')],
  ['RC23', 'boolean response refused', parsed(true), invalidRoot('boolean')],
  ['RC24', 'number response refused', parsed(0), invalidRoot('number')],
  ['RC25', 'missing message refused', response({ message: undefined }), wrongMessage('missing')],
  ['RC26', 'null message refused', response({ message: null }), wrongMessage('null')],
  ['RC27', 'array message refused', response({ message: [] }), wrongMessage('array')],
  ['RC28', 'string message refused', response({ message: 'UNIT_ONLY_MESSAGE_STRING' }), wrongMessage('string')],
  ['RC29', 'missing role refused', response({ message: {} }), refusedRole('missing')],
  ['RC30', 'null role refused', response({ message: { role: null } }), refusedRole('non-string')],
  ['RC31', 'boolean role refused', response({ message: { role: false } }), refusedRole('non-string')],
  ['RC32', 'another role refused', response({ message: { role: 'system' } }), refusedRole('unapproved')],
  ['RC33', 'original first-refusal order preserved', response({ error: 'UNIT_ONLY_PRIORITY_ERROR', done: false, model: 'UNIT_ONLY_PRIORITY_MODEL', message: undefined }), expected({ accepted: false, errorField: 'present', completion: 'incomplete', responseModel: 'unapproved', messageShape: 'missing', assistantRole: 'not-inspected', refusal: 'ERROR_FIELD_PRESENT' })],
  ['RC34', 'arbitrary upstream values never become diagnostics', response({ error: 'UNIT_ONLY_SECRET_ERROR', done: 'UNIT_ONLY_SECRET_DONE', model: 'UNIT_ONLY_SECRET_MODEL', message: { role: 'UNIT_ONLY_SECRET_ROLE', content: 'UNIT_ONLY_SECRET_CONTENT', thinking: 'UNIT_ONLY_SECRET_THINKING' }, headers: 'UNIT_ONLY_SECRET_HEADER', credentials: 'UNIT_ONLY_SECRET_CREDENTIAL', tokens: 'UNIT_ONLY_SECRET_TOKEN' }), expected({ accepted: false, errorField: 'present', completion: 'invalid', responseModel: 'unapproved', assistantRole: 'unapproved', refusal: 'ERROR_FIELD_PRESENT' })],
  ['RC35', 'classification does not mutate input and its result is frozen', response(), valid],
  ['RC36', 'envelope acceptance provides no downstream or authority facts', response({ model: 'deepseek-v4.1-flash', message: { role: 'assistant', content: 7, thinking: 'UNIT_ONLY_DOWNSTREAM_THINKING', tool_calls: 'UNIT_ONLY_DOWNSTREAM_TOOL' }, done_reason: 'UNIT_ONLY_DOWNSTREAM_FINISH', prompt_eval_count: 'UNIT_ONLY_DOWNSTREAM_USAGE', eval_count: -1, billing: 'UNIT_ONLY_BILLING', grant: 'UNIT_ONLY_GRANT', remoteOutcome: 'UNIT_ONLY_REMOTE', result: 'UNIT_ONLY_RESULT' }), expected({ responseModel: 'cloud-base' })],
];

const domains = Object.freeze({
  schema: ['df.ollama-response-envelope/v1'],
  accepted: [true, false],
  responseShape: ['null', 'array', 'object', 'string', 'number', 'boolean', 'missing', 'unsupported'],
  errorField: ['not-inspected', 'absent', 'present'],
  completion: ['not-inspected', 'complete', 'incomplete', 'missing', 'invalid'],
  responseModel: ['not-inspected', 'request', 'cloud-base', 'missing', 'non-string', 'unapproved'],
  messageShape: ['not-inspected', 'null', 'array', 'object', 'string', 'number', 'boolean', 'missing', 'unsupported'],
  assistantRole: ['not-inspected', 'assistant', 'missing', 'non-string', 'unapproved'],
  refusal: ['NONE', 'INVALID_RESPONSE_SHAPE', 'ERROR_FIELD_PRESENT', 'COMPLETION_NOT_TRUE', 'RESPONSE_MODEL_NOT_APPROVED', 'ASSISTANT_ROLE_REQUIRED'],
});

assert.equal(cells.length, 36);
for (const [id, title, input, oracle] of cells) {
  test(`${id}: ${title}`, { timeout: 1000 }, () => {
    const before = JSON.stringify(input);
    const actual = inspectResponseEnvelope(input);
    assert.deepEqual(actual, oracle);
    assert.equal(JSON.stringify(input), before);
    assert.equal(Object.isFrozen(actual), true);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(domains).sort());
    for (const [key, value] of Object.entries(actual)) assert.equal(domains[key].includes(value), true, key);
    assert.equal(/UNIT_ONLY/.test(JSON.stringify(actual)), false);
    if (id === 'RC35') {
      assert.deepEqual(ACCEPTED_RESPONSE_MODELS, ['deepseek-v4.1-flash:cloud', 'deepseek-v4.1-flash']);
      assert.equal(Object.isFrozen(ACCEPTED_RESPONSE_MODELS), true);
      assert.throws(() => { actual.accepted = false; }, TypeError);
      assert.throws(() => { ACCEPTED_RESPONSE_MODELS.push('UNIT_ONLY_EXTRA_MODEL'); }, TypeError);
    }
    if (id === 'RC36') {
      for (const key of ['usage', 'billing', 'grant', 'remoteOutcome', 'result', 'content', 'thinking', 'headers', 'tokens'])
        assert.equal(Object.hasOwn(actual, key), false);
    }
  });
}
