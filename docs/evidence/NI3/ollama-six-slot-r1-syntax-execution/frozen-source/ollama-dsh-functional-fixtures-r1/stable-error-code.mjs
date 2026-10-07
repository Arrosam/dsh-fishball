import { types } from 'node:util';
const fallbacks = new Map([
  ['entry', 'SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT'],
  ['iterator', 'GUARDED_ITERATOR_REFUSAL'],
  ['execute', 'EXECUTE_UNKNOWN'],
  ['cancel', 'CANCEL_UNKNOWN'],
  ['rpc', 'ORIGINAL_OPERATION_DENIED'],
]);
const allowed = new Set([
  ...fallbacks.values(),
  'ERR_ASSERTION', 'CONFIG_INVALID', 'HOST_CAPABILITY_UNSUPPORTED',
  'INVALID_INPUT', 'OPERATION_REJECTED', 'REQUEST_ABORTED',
  'SERVICE_DISPOSED', 'OPERATOR_REQUIRED',
  'SETUP_REQUIRED', 'SETUP_UNAVAILABLE', 'SETUP_RECOVERY_REQUIRED',
  'SETUP_PREVIEW_STALE', 'SETUP_CONFIRMATION_REQUIRED', 'SETUP_INVALID_INPUT',
  'STALE_VERSION', 'STALE_AUTHORITY', 'STALE_MEMORY', 'COST_UNKNOWN',
  'RESOURCE_LIMIT', 'RECOVERY_REQUIRED', 'RESERVATION_HELD', 'MODEL_UNAVAILABLE',
  'WORKER_SOURCE_UNAVAILABLE', 'WORKER_REQUEST_DENIED', 'WORKER_CONTEXT_INVALID',
  'WORKER_POLICY_REQUIRED', 'WORKER_POLICY_STALE', 'WORKER_PREVIEW_STALE',
  'WORKER_RESULT_UNAVAILABLE', 'WORKER_FINISH_UNAVAILABLE',
  'WORKER_EXECUTION_UNAVAILABLE', 'WORKER_EXECUTION_DENIED',
  'WORKER_EXECUTION_ALREADY_SUBMITTED',
  'DEADLINE_UNKNOWN', 'BARRIER_NOT_OBSERVED', 'ORIGINAL_ABORT_NOT_OBSERVED',
  'LOCAL_DRAIN_UNKNOWN', 'R06_WINDOW_UNKNOWN', 'LOCAL_CLEANUP_UNKNOWN',
]);
export function stableErrorCode(error, boundary) {
  const fallback = fallbacks.get(boundary) ?? 'SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT';
  try {
    if (error === null || typeof error !== 'object' || types.isProxy(error)) return fallback;
    const field = Object.getOwnPropertyDescriptor(error, 'code');
    if (!field || !Object.hasOwn(field, 'value') || typeof field.value !== 'string' || field.value.length > 64) return fallback;
    return allowed.has(field.value) ? field.value : fallback;
  } catch { return fallback; }
}
