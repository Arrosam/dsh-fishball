import { AsyncLocalStorage } from 'node:async_hooks';
import { BootstrapError } from './config.mjs';

// Trusted installed composition only. No wire/config field carries this token.
const storage = new AsyncLocalStorage();
const carriers = new WeakMap();
const codes = new Set(['SERVICE_DISPOSED', 'OPERATOR_REQUIRED', 'REQUEST_ABORTED']);
const denied = code => { throw new BootstrapError(code); };
function guardCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && Object.hasOwn(descriptor, 'value') && codes.has(descriptor.value)
      ? descriptor.value : 'SERVICE_DISPOSED';
  } catch { return 'SERVICE_DISPOSED'; }
}
function record(ctx, token = storage.getStore()) {
  const current = token && carriers.get(token);
  if (!current) denied('SERVICE_DISPOSED');
  if (current.ctx !== ctx) current.denial ??= 'SERVICE_DISPOSED';
  if (current.denial) denied(current.denial);
  return current;
}
export function assertInstalledWorkerInvocation(ctx) {
  const current = record(ctx);
  try {
    if (current.assertCurrent() !== true) current.denial = 'SERVICE_DISPOSED';
  } catch (error) { current.denial = guardCode(error); }
  if (current.denial) denied(current.denial);
  return true;
}
export function captureInstalledWorkerInvocation(ctx) {
  assertInstalledWorkerInvocation(ctx);
  return storage.getStore();
}
export function withInstalledWorkerInvocation(ctx, token, callback) {
  record(ctx, token);
  return storage.run(token, () => {
    assertInstalledWorkerInvocation(ctx);
    return callback();
  });
}
export async function runInstalledWorkerInvocation(ctx, assertCurrent, callback) {
  if (!ctx || typeof ctx !== 'object' || typeof assertCurrent !== 'function' || typeof callback !== 'function') denied('SERVICE_DISPOSED');
  const token = Object.freeze({});
  carriers.set(token, { ctx, assertCurrent, denial: null });
  return storage.run(token, async () => {
    assertInstalledWorkerInvocation(ctx);
    try {
      const result = await callback();
      assertInstalledWorkerInvocation(ctx);
      return result;
    } catch (error) {
      // The exact denied carrier wins over manager/native error wrapping.
      // This assertion never replays the callback or a mutation.
      assertInstalledWorkerInvocation(ctx);
      throw error;
    }
  });
}
