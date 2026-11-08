/**
 * Moved to packages/connector/contract/contract.js (K1, the fishball-connector contract v1 freeze;
 * M1 moved it into the connector package).
 *
 * This path stays as a pure re-export so every existing connector caller (src/slim/host/*,
 * src/*.js) keeps working unchanged. Add nothing here: the contract has one home. The instance
 * has its own shims of these paths, which re-export `fishball-connector/contract` instead.
 */
export * from '../../contract/contract.js'
