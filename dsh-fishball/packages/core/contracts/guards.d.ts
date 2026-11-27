/**
 * The outcome of core's one standalone reorder at its first start in a DSH (R-FB-12): `moved`
 * (core was moved to the end of `dsh.profile.bundles`), `unchanged` (it already was last, or this
 * DSH had recorded the reorder before; core never moves itself back after the owner moves it), or
 * `failed`.
 */
export type ReorderOutcome = 'moved' | 'unchanged' | 'failed'
// A failed lock or manifest write is retried on the next start.
