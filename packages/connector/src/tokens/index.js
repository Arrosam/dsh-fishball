/**
 * `src/tokens`: the connector's token entries (task C-TOKENS; K1 `TokenRegistry`).
 * - `createTokenRegistry({ctx, logger, restoreTokens?})`: the registry (`apply`, `refresh`,
 *   `match`, `get`, `list`, `onRevoked`, `close`); see registry.js for the sync rules;
 * - `findRefDuplicates(tokens)`: the `ref-duplicate` rule, for the settings schema C-WIRE adds;
 * - `generateTokenValue()`: the design §5.2 generator;
 * - `PENDING_DECISION`: the one branch point for the two open user questions (constants.js).
 * Wiring (the settings schema, `settings/document-updated` and `credentials/reference-updated`
 * listeners calling `apply` / `refresh`) is C-WIRE's.
 */
export { createTokenRegistry, findRefDuplicates, generateTokenValue } from './registry.js'
export { PENDING_DECISION, DUPLICATE_POLICY, UNSET_POLICY, SYNC_REASON, REVOCATION } from './constants.js'
