import { withInstalledWorkerInvocation } from './installed-invocation.mjs';
// Invoke the lazy iterator itself under its captured original owner carrier.
// Constructing an async generator under AsyncLocalStorage does not run its body.
export function ownInstalledStream(ctx, token, { start, check, open }) {
  const invoke = callback => withInstalledWorkerInvocation(ctx, token, callback);
  return (async function* () {
    let iterator, finished = false;
    try {
      invoke(() => { start(); check(); iterator = open()[Symbol.asyncIterator](); check(); });
      for (;;) {
        const step = await invoke(() => { check(); return iterator.next(); });
        invoke(check);
        if (step.done) { finished = true; return step.value; }
        yield step.value;
        invoke(check);
      }
    } catch (error) {
      invoke(check);
      throw error;
    } finally {
      if (iterator && !finished && typeof iterator.return === 'function') {
        await invoke(() => { check(); return iterator.return(); });
        invoke(check);
      }
    }
  })();
}
