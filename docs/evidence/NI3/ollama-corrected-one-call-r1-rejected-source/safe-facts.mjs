import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bounds } from './admission.mjs';
import { stableErrorCode } from './stable-error-code.mjs';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function fail(code) { const error = new Error(code); error.code = code; throw error; }
export function requireFact(value, code = 'SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT') {
  if (!value) fail(code);
}
export function reference(value) {
  requireFact(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)); return value;
}
export function count(value, max = Number.MAX_SAFE_INTEGER) {
  requireFact(Number.isSafeInteger(value) && value >= 0 && value <= max); return value;
}
export function choice(value, allowed, fallback = 'unobserved') {
  return allowed.includes(value) ? value : fallback;
}
const providerCodes = Object.freeze(['OLLAMA_ABORTED', 'OLLAMA_HTTP_FAILURE',
  'OLLAMA_INVALID_JSON', 'OLLAMA_INVALID_RESPONSE', 'OLLAMA_UNSOLICITED_TOOL_CALL',
  'OLLAMA_INVALID_TEXT', 'OLLAMA_THINK_FALSE_VIOLATION', 'OLLAMA_OUTPUT_BOUND',
  'OLLAMA_INVALID_USAGE', 'OLLAMA_OUTPUT_TOKEN_BOUND', 'OLLAMA_UNKNOWN_FINISH_REASON',
  'EMPTY_RESPONSE', 'OLLAMA_RESULT_BINDING_DENIED', 'OLLAMA_TRANSPORT_FAILURE',
  'OLLAMA_CURRENTNESS_REFUSED', 'OLLAMA_RESPONSE_BOUND', 'OLLAMA_RESPONSE_MISSING']);
export function safeFailure(error, boundary = 'entry') {
  return stableErrorCode(error, boundary);
}
export function safeUsage(usage) {
  if (!usage) return null;
  const keys = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens'];
  const result = {};
  for (const key of keys) if (Object.hasOwn(usage, key)) result[key] = count(usage[key], bounds.usageUnits);
  return result;
}
export function safeEnvelope(value) {
  if (!value) return null;
  const shape = ['null', 'array', 'object', 'string', 'number', 'boolean', 'missing', 'unsupported', 'not-inspected'];
  requireFact(value.schema === 'df.ollama-response-envelope/v1' && typeof value.accepted === 'boolean');
  return { schema: 'df.ollama-response-envelope/v1', accepted: value.accepted === true,
    responseShape: choice(value.responseShape, shape),
    errorField: choice(value.errorField, ['not-inspected', 'absent', 'present']),
    completion: choice(value.completion, ['not-inspected', 'complete', 'incomplete', 'missing', 'invalid']),
    responseModel: choice(value.responseModel, ['not-inspected', 'request', 'cloud-base', 'missing', 'non-string', 'unapproved']),
    messageShape: choice(value.messageShape, shape),
    assistantRole: choice(value.assistantRole, ['not-inspected', 'assistant', 'missing', 'non-string', 'unapproved']),
    refusal: choice(value.refusal, ['NONE', 'INVALID_RESPONSE_SHAPE', 'ERROR_FIELD_PRESENT',
      'COMPLETION_NOT_TRUE', 'RESPONSE_MODEL_NOT_APPROVED', 'ASSISTANT_ROLE_REQUIRED']) };
}
export function safeAudit(audit) {
  requireFact(audit && typeof audit.active === 'boolean' && typeof audit.uncertainHold === 'boolean');
  requireFact(Array.isArray(audit.calls) && audit.calls.length <= 1);
  return { attempted: count(audit.attempted, 1), active: audit.active,
    uncertainHold: audit.uncertainHold, billing: 'unknown',
    calls: audit.calls.map(row => ({
      httpStatus: row.httpStatus === undefined ? null : count(row.httpStatus, 599),
      state: choice(row.state, ['dispatch_attempted', 'response_validated', 'chunks_completed', 'local_abort', 'local_failure']),
      remoteOutcome: choice(row.remoteOutcome, ['unknown', 'completed'], 'unknown'),
      failureCode: row.failureCode === undefined ? null : choice(row.failureCode, providerCodes, 'PROVIDER_FAILURE_UNCLASSIFIED'),
      requestBytes: row.requestBytes === undefined ? null : count(row.requestBytes, bounds.requestBytes),
      outputBytes: row.outputBytes === undefined ? null : count(row.outputBytes, bounds.resultBytes),
      thinkingBytes: row.thinkingBytes === undefined ? null : count(row.thinkingBytes, bounds.resultBytes),
      resultDigest: row.resultDigest === undefined ? null : reference(row.resultDigest),
      tokenUsage: safeUsage(row.tokenUsage),
      responseEnvelopeObservation: row.responseEnvelope === undefined ? 'NOT_OBSERVED' : 'OBSERVED',
      responseEnvelope: safeEnvelope(row.responseEnvelope) })) };
}
export function createObservations(directory) {
  let serial = 0;
  // Callers build each closed record explicitly. Raw RPC DTOs, logs and errors
  // never enter this boundary. Serialization is additionally byte bounded.
  return record => {
    requireFact(++serial <= bounds.observationFiles);
    const text = JSON.stringify({ schema: 'df.ollama-live02-observation/v1', sequence: serial, ...record }) + '\n';
    requireFact(Buffer.byteLength(text) <= bounds.observationBytes);
    writeFileSync(join(directory, `observation-${String(serial).padStart(3, '0')}.json`), text,
      { flag: 'wx', mode: 0o600 });
  };
}
export async function within(promise, ms, code = 'DEADLINE_UNKNOWN') {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => { const error = new Error(code); error.code = code; reject(error); }, ms);
  })]); } finally { clearTimeout(timer); }
}
