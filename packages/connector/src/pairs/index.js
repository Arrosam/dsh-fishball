/**
 * The connector's pairs module (task C-PAIR, design §5.8): the K1 `PairStore` (one serial pair and
 * name registry, spike V3-S3) and the live scope rule. C-WIRE mounts it: `openPairStore(ctx,
 * {defineDomain, domainTable}, {logger})` once per connector life, `close()` on dispose. The
 * read-only status rows of the native settings (R-ID-12) are C-WIRE's, because they also need the
 * token entries and presence (Fishball 2026-11-14, Q3 A); they read `PairStore.list()`. The
 * storage layout (`./constants.js` PAIRS) stays private: no other module opens the registry.
 */
export { createPairStore, openPairStore } from './store.js'
export { powerOf } from './power.js'
