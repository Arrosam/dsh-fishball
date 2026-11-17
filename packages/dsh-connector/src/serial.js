/**
 * The connector's one serial-chain algorithm (review F10): each state owner (managed state, the
 * mailbox, the OAuth store, the token registry, grants, hosted, revocation, settings) creates its
 * own chain from this, so every owner keeps its own ordering boundary while the enqueue/recover
 * rule lives in one place. Never share one chain between owners: their steps would wait on each
 * other, and a step awaiting another owner's step would deadlock.
 */

/**
 * A serial chain: each step runs after every earlier one has settled, and a failed step never
 * blocks later ones (the rule of V2's ManagedRegistry and of C-MAILBOX).
 * @returns {(step: () => Promise<T>) => Promise<T>}
 */
export function serialChain() {
  let chain = Promise.resolve()
  return (step) => {
    const run = chain.then(step)
    chain = run.catch(() => {})
    return run
  }
}
