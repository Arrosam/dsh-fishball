/**
 * Listener sets of core's link and of the modules built on it (F-PAIR). A listener is the
 * caller's code: one that throws must not break the emitter or another listener.
 */

/** Adds `fn` to `set` and returns its disposer. */
export function subscribe(set, fn) {
  set.add(fn)
  return () => { set.delete(fn) }
}

/** Calls every listener of `set` with `value`, isolating each one's throw. */
export function emitIsolated(set, value) {
  for (const fn of [...set]) {
    try { fn(value) } catch { /* isolated, see above */ }
  }
}
