import { types } from 'node:util';

export class OperatorBridgeError extends Error {
  constructor(code) { super(code); this.name = 'OperatorBridgeError'; this.code = code; }
}
const fail = code => { throw new OperatorBridgeError(code); };
const publicCodes = new Set(['INVALID_INPUT', 'INPUT_TOO_LARGE', 'STALE_VERSION', 'STALE_AUTHORITY',
  'NOT_FOUND', 'SCOPE_DENIED', 'ROLE_DENIED', 'COMMAND_CONFLICT', 'TASK_TERMINAL', 'GRANT_REQUIRED',
  'GRANT_EXPIRED', 'HOST_PERMISSION_DENIED', 'RESOURCE_LIMIT', 'QUEUE_FULL', 'RECOVERY_REQUIRED',
  'POLICY_STALE', 'AUTHORITY_REVOKED', 'SECRET_REJECTED', 'SERVICE_DISPOSED', 'OPERATOR_REQUIRED', 'REQUEST_ABORTED']);
for (const code of ['CLARIFICATION_STALE', 'CLARIFICATION_INCOMPLETE', 'CLARIFICATION_INVALID', 'DECISION_CONFLICT', 'CAPABILITY_UNAVAILABLE', 'PREVIEW_UNAVAILABLE', 'PREVIEW_STALE', 'PREVIEW_CAPACITY',
  'WORKER_EXECUTION_UNAVAILABLE', 'WORKER_EXECUTION_DENIED', 'WORKER_EXECUTION_ALREADY_SUBMITTED',
  'WORKER_SESSION_UNAVAILABLE', 'WORKER_TOOLS_UNAVAILABLE', 'WORKER_RESULT_UNAVAILABLE', 'WORKER_CONTEXT_INVALID', 'WORKER_MAPPING_MISMATCH', 'WORKER_DISPOSED',
  'WORKER_ALREADY_SUBMITTED', 'WORKER_CLAIM_STALE', 'HOST_DENIED', 'HOST_PERMISSION_DENIED',
  'WORKER_NOT_CONFIGURED', 'WORKER_CATALOG_UNAVAILABLE', 'WORKER_POLICY_REQUIRED', 'WORKER_POLICY_STALE',
  'WORKER_CONFIRMATION_REQUIRED', 'WORKER_PREVIEW_STALE', 'WORKER_PRESET_UNAVAILABLE',
  'WORKER_PERSISTENCE_UNSUPPORTED', 'WORKER_SOURCE_UNAVAILABLE', 'WORKER_REQUEST_DENIED', 'WORKER_FINISH_UNAVAILABLE',
  'MODEL_UNAVAILABLE', 'MODEL_CONFIGURATION_MISMATCH', 'ENVIRONMENT_UNAVAILABLE', 'ENVIRONMENT_STALE',
  'ENVIRONMENT_MISMATCH', 'SESSION_UNAVAILABLE', 'SESSION_MISMATCH', 'STALE_MEMORY',
  'CONTEXT_INVALID', 'CONTEXT_LIMIT', 'CONTEXT_SCOPE', 'MEMORY_UNAVAILABLE', 'TOKENIZER_UNAVAILABLE',
  'SPEC_MISMATCH', 'STALE_POLICY', 'APPROVAL_INVALID', 'CLAIM_REVOKED', 'RESERVATION_HELD',
  'AUDIT_REQUIRED', 'AUDIT_STALE', 'REVIEW_NOT_ADMITTED', 'REVIEW_NOT_INDEPENDENT',
  'AUDIT_BINDING_MISMATCH', 'AUDIT_REPAIR_LIMIT', 'RECORD_NOT_FOUND', 'ARTIFACT_STALE',
  'STALE_ARTIFACT', 'UNAUTHORIZED', 'COST_UNKNOWN', 'ACTIVE_FULL', 'STALE_SOURCE', 'STALE_SUBSCRIPTION',
  'SOURCE_DISABLED', 'SUBSCRIPTION_DISABLED', 'EVENT_EXPIRED', 'EVENT_CLOCK_INVALID', 'RATE_LIMIT',
  'EVENT_LIMIT', 'STALE_EVENT_CLOCK', 'VERIFICATION_REQUIRED', 'ROUTE_MISMATCH', 'IDEMPOTENCY_CONFLICT',
  'NOTIFICATION_POLICY_UNAVAILABLE', 'NOTIFICATION_CLOCK_INVALID', 'NOTIFICATION_COALESCING',
  'NOTIFICATION_DISABLED', 'NOTIFICATION_DUPLICATE', 'NOTIFICATION_INTERVAL', 'NOTIFICATION_MERGE_DENIED',
  'NOTIFICATION_PENDING', 'NOTIFICATION_BINDING_INVALID',
  'NOTIFICATION_ARTIFACT_MISMATCH', 'NOTIFICATION_LIMIT', 'NOTIFICATION_HELD', 'NOTIFICATION_QUIET',
  'NOTIFICATION_COALESCED', 'NOTIFICATION_FREQUENCY', 'NOTIFICATION_ALREADY_CLAIMED', 'TIMEZONE_INVALID']) publicCodes.add(code);

// Capture only JSON data. No accessor, proxy, inherited field or mutable caller
// object can carry a capability into an asynchronous transport operation.
function capture(value, depth = 0, fractions = false) {
  if (depth > 12) fail('INPUT_TOO_LARGE');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (Buffer.byteLength(value) > 65536) fail('INPUT_TOO_LARGE'); return value; }
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) || fractions && Number.isFinite(value) && !Number.isInteger(value)) return value;
    fail('INVALID_INPUT');
  }
  if (!value || typeof value !== 'object' || types.isProxy(value)) fail('INVALID_INPUT');
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  if (proto !== (array ? Array.prototype : Object.prototype)) fail('INVALID_INPUT');
  const fields = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(fields);
  if (keys.length > (array ? 129 : 64)) fail('INPUT_TOO_LARGE');
  if (array) {
    if (value.length > 128 || keys.some(key => key !== 'length' &&
      (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length ||
       !fields[key].enumerable || !Object.hasOwn(fields[key], 'value')))) fail('INVALID_INPUT');
    const output = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(fields, String(i))) fail('INVALID_INPUT');
      output.push(capture(fields[i].value, depth + 1, fractions));
    }
    return Object.freeze(output);
  }
  const output = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value') ||
        ['__proto__', 'constructor', 'prototype'].includes(key)) fail('INVALID_INPUT');
    output[key] = capture(fields[key].value, depth + 1, fractions);
  }
  return Object.freeze(output);
}
const rejected = code => ({ ok: false, error: { code, message: code, details: {} } });

// Connection owns the authenticated OperatorPeer for its whole lifetime. The
// fourth handler argument is supplied by DSH after admission, never by JSON.
// Only trusted same-process composition may install these operation closures.
export function installOperatorBridge({ connection, operations, isAlive = () => true }) {
  if (!connection?.operator || typeof connection.rpc?.handle !== 'function' || typeof isAlive !== 'function') fail('BRIDGE_CONFIG_INVALID');
  const peer = connection.operator;
  if (!operations || types.isProxy(operations) || Object.getPrototypeOf(operations) !== Object.prototype) fail('BRIDGE_CONFIG_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(operations), commands = new Map();
  for (const [key, field] of Object.entries(descriptors)) {
    if (!/^[a-z][a-zA-Z]{0,31}$/.test(key) || !field.enumerable || !Object.hasOwn(field, 'value') || typeof field.value !== 'function') fail('BRIDGE_CONFIG_INVALID');
    commands.set(key, field.value);
  }
  if (!commands.size || Reflect.ownKeys(descriptors).some(key => typeof key !== 'string')) fail('BRIDGE_CONFIG_INVALID');
  let active = true;
  const prefix = 'v1/';
  // /api has one official interceptor owner. A separate logical channel uses
  // the same native auth/admission policy without replacing that interceptor.
  const unregister = connection.rpc.handle('/df-rpc',
    async (endpoint, payload, signal, admittedPeer) => {
      let alive = false;
      try { alive = active && isAlive() === true; } catch { /* stable failure below */ }
      if (!alive) return rejected('SERVICE_DISPOSED');
      if (admittedPeer !== peer || connection.operator !== peer) return rejected('OPERATOR_REQUIRED');
      if (signal?.aborted) return rejected('REQUEST_ABORTED');
      const name = typeof endpoint === 'string' && endpoint.startsWith(prefix) ? endpoint.slice(prefix.length) : undefined;
      const operation = commands.get(name);
      if (!operation) return rejected('ENDPOINT_NOT_FOUND');
      try {
        // Only the exact admitted installed operation selects this transport
        // mode. Domain validators still reject fractional authority fields.
        const input = capture(payload, 0, name === 'memoryRemember' || name === 'prepareContext');
        if (!input || Array.isArray(input) || typeof input !== 'object') fail('INVALID_INPUT');
        if (Buffer.byteLength(JSON.stringify(input)) > 65536) fail('INPUT_TOO_LARGE');
        // No awaits precede admission to the operation. Once an operation has
        // claimed work, aborting its HTTP request cannot erase ledger facts.
        let guarded = false;
        const assertCurrent = () => {
          guarded = true;
          let current = false;
          try { current = active && isAlive() === true; } catch { /* bounded below */ }
          if (!current) fail('SERVICE_DISPOSED');
          if (connection.operator !== peer || admittedPeer !== peer) fail('OPERATOR_REQUIRED');
          if (signal?.aborted) fail('REQUEST_ABORTED');
          return true;
        };
        const value = await operation(input, Object.freeze({ assertCurrent }));
        if (guarded) assertCurrent();
        return { ok: true, value };
      } catch (error) {
        const descriptor = error && !types.isProxy(error) ? Object.getOwnPropertyDescriptor(error, 'code') : undefined;
        const code = descriptor && Object.hasOwn(descriptor, 'value') && publicCodes.has(descriptor.value) ? descriptor.value : 'OPERATION_REJECTED';
        return rejected(code);
      }
    });
  if (typeof unregister !== 'function') { active = false; fail('BRIDGE_CONFIG_INVALID'); }
  return Object.freeze({
    dispose() { active = false; return unregister(); },
    deactivate() { active = false; },
  });
}
