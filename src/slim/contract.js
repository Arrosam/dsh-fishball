/**
 * Moved to src/connector/contract.js (K1, the fishball-connector contract v1 freeze).
 *
 * This path stays as a pure re-export so every existing caller (the main host, the child app
 * and the child snapshot, which copies src/slim and src/connector) keeps working unchanged
 * until M1 moves the files into the two packages. Add nothing here: the contract has one home.
 */
export * from '../connector/contract.js'
