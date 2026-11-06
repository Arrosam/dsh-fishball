/**
 * The connector's public `./contract` export (fishball-connector v1, docs/connector-contract.md §10).
 *
 * One entry for the whole contract, so a third-party instance and our built-in one import it the
 * same way: `import { ... } from 'fishball-connector/contract'`. It only re-exports: each name has
 * its one home in the sibling module. The names do not collide, so `export *` keeps the set equal
 * to the doc's module index.
 */
export * from './contract.js'
export * from './card-record.js'
export * from './inbox-markers.js'
export * from './attachment-transfer.js'
export * from './pile-note.js'
