/**
 * Moved to packages/dsh-connector/contract/contract.js (K1, the dsh-connector contract v1 freeze;
 * M1 moved it into the connector package).
 *
 * This path stays as a pure re-export so every existing connector caller (src/slim/host/*,
 * src/*.js) keeps working unchanged. Add nothing here: the contract has one home. The instance
 * has its own shims of these paths, which re-export `dsh-connector/contract` instead.
 */
export * from '../../contract/contract.js'
