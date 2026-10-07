// Pure envelope classification for the unchanged exact approved request route.
// Input is the provider's bounded JSON.parse result, never arbitrary JS objects.
// This does not validate payload, usage, finish, authority, or remote effects.
export const ACCEPTED_RESPONSE_MODELS = Object.freeze([
  'deepseek-v4.1-flash:cloud',
  'deepseek-v4.1-flash',
]);

function shapeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'object': return 'object';
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'undefined': return 'missing';
    default: return 'unsupported';
  }
}

export function inspectResponseEnvelope(result) {
  const responseShape = shapeOf(result);
  const object = responseShape === 'object';
  const errorField = !object ? 'not-inspected' :
    result.error === undefined ? 'absent' : 'present';
  const completion = !object ? 'not-inspected' :
    result.done === true ? 'complete' : result.done === false ? 'incomplete' :
    result.done === undefined ? 'missing' : 'invalid';
  const responseModel = !object ? 'not-inspected' :
    result.model === ACCEPTED_RESPONSE_MODELS[0] ? 'request' :
    result.model === ACCEPTED_RESPONSE_MODELS[1] ? 'cloud-base' :
    result.model === undefined ? 'missing' :
    typeof result.model !== 'string' ? 'non-string' : 'unapproved';
  const messageShape = object ? shapeOf(result.message) : 'not-inspected';
  const assistantRole = messageShape !== 'object' ? 'not-inspected' :
    result.message.role === 'assistant' ? 'assistant' :
    result.message.role === undefined ? 'missing' :
    typeof result.message.role !== 'string' ? 'non-string' : 'unapproved';
  // Preserve the original refusal precedence. Only the two pinned response
  // spellings differ from the old predicate; no normalization or fallback.
  const refusal = !object ? 'INVALID_RESPONSE_SHAPE' :
    errorField !== 'absent' ? 'ERROR_FIELD_PRESENT' :
    completion !== 'complete' ? 'COMPLETION_NOT_TRUE' :
    !['request', 'cloud-base'].includes(responseModel) ? 'RESPONSE_MODEL_NOT_APPROVED' :
    assistantRole !== 'assistant' ? 'ASSISTANT_ROLE_REQUIRED' : 'NONE';
  // Every retained value is a fixed enum or boolean. No upstream strings,
  // counts, payloads, headers, or errors are copied into diagnostic facts.
  return Object.freeze({ schema: 'df.ollama-response-envelope/v1',
    accepted: refusal === 'NONE', responseShape, errorField, completion,
    responseModel, messageShape, assistantRole, refusal });
}
