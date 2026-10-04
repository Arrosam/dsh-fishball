import { types } from 'node:util';

export class OperatorBridgeError extends Error {
  constructor(code) { super(code); this.name = 'OperatorBridgeError'; this.code = code; }
}
const fail = code => { throw new OperatorBridgeError(code); };
const publicCodes = new Set(['INVALID_INPUT', 'INPUT_TOO_LARGE', 'STALE_VERSION', 'STALE_AUTHORITY',
  'NOT_FOUND', 'SCOPE_DENIED', 'ROLE_DENIED', 'COMMAND_CONFLICT', 'TASK_TERMINAL', 'GRANT_REQUIRED',
  'GRANT_EXPIRED', 'HOST_PERMISSION_DENIED', 'RESOURCE_LIMIT', 'QUEUE_FULL', 'RECOVERY_REQUIRED',
  'POLICY_STALE', 'AUTHORITY_REVOKED', 'SECRET_REJECTED', 'SERVICE_DISPOSED']);

// Capture only JSON data. No accessor, proxy, inherited field or mutable caller
// object can carry a capability into an asynchronous transport operation.
function capture(value, depth = 0) {
  if (depth > 12) fail('INPUT_TOO_LARGE');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (Buffer.byteLength(value) > 65536) fail('INPUT_TOO_LARGE'); return value; }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
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
      output.push(capture(fields[i].value, depth + 1));
    }
    return Object.freeze(output);
  }
  const output = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value') ||
        ['__proto__', 'constructor', 'prototype'].includes(key)) fail('INVALID_INPUT');
    output[key] = capture(fields[key].value, depth + 1);
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
      if (admittedPeer !== peer) return rejected('OPERATOR_REQUIRED');
      if (signal?.aborted) return rejected('REQUEST_ABORTED');
      const operation = typeof endpoint === 'string' && endpoint.startsWith(prefix) ? commands.get(endpoint.slice(prefix.length)) : undefined;
      if (!operation) return rejected('ENDPOINT_NOT_FOUND');
      try {
        const input = capture(payload);
        if (!input || Array.isArray(input) || typeof input !== 'object') fail('INVALID_INPUT');
        if (Buffer.byteLength(JSON.stringify(input)) > 65536) fail('INPUT_TOO_LARGE');
        // No awaits precede admission to the operation. Once an operation has
        // claimed work, aborting its HTTP request cannot erase ledger facts.
        const value = await operation(input);
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
