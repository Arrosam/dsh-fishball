import assert from 'node:assert/strict';

// Transport/dependency barriers only. No clock, model helper or host service replacement.
export function deferred(label) {
  let resolvePromise, rejectPromise, settled = false, releases = 0;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  // A cleanup rejection may precede the original public method's await.
  promise.catch(() => {});
  return Object.freeze({
    label, promise,
    get settled() { return settled; },
    get releases() { return releases; },
    resolve(value) { assert.equal(settled, false, `${label}: duplicate release`); settled = true; releases++; resolvePromise(value); },
    reject(error) { assert.equal(settled, false, `${label}: duplicate release`); settled = true; releases++; rejectPromise(error); },
    close() { if (!settled) { settled = true; releases++; rejectPromise(new Error('UNIT_ONLY_CLEANUP')); } },
  });
}

export async function waitFor(promise, signal) {
  if (signal.aborted) throw new Error('UNIT_ONLY_DEADLINE');
  let cancel;
  const aborted = new Promise((_, reject) => {
    cancel = () => reject(new Error('UNIT_ONLY_DEADLINE'));
    signal.addEventListener('abort', cancel, {once:true});
  });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener('abort', cancel); }
}

export async function cleanupWithin(promise, milliseconds = 1500) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('UNIT_ONLY_CLEANUP_DEADLINE')), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}
