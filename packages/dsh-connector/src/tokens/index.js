/**
 * `src/tokens`: the connector's token entries (tasks C-TOKENS, C-TOKENS-REVEAL; K1 `TokenRegistry`).
 * - `createTokenRegistry({ctx, logger, settings, restoreTokens?})`: the registry (`apply`, `create`,
 *   `createHosted`, `match`, `get`, `list`, `notice`, `onRevoked`, `close`); see registry.js for
 *   the sync and duplicate rules;
 * - `findDuplicates(tokens)`: the shared-`key` rule, for the settings schema C-WIRE adds;
 * - `generateTokenValue()`: the design §5.2 generator;
 * - `TokenCreateError`: `create`'s and `createHosted`'s `operation-failed` rejection.
 * Wiring (the settings schema `{label, enabled, key}`, the `settings/document-updated` listener
 * calling `apply`, the SettingsWriter binding) is C-WIRE's; the settings page is src/settings-page.
 */
export { createTokenRegistry, findDuplicates, generateTokenValue, TokenCreateError } from './registry.js'
export { CREATE_ERROR, HOSTED_TOKEN, SYNC_REASON, TOKEN_STORE } from './constants.js'
