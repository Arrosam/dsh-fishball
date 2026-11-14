/**
 * The instance's view of the connector contract, at the path its modules already import (M1).
 * The contract is owned by fishball-connector; the instance reaches it only through the package
 * export `fishball-connector/contract` (design §0.2: no other import crosses the packages). In the
 * child, placement places that export alone under the profile's node_modules (native-runtime/placement.js)
 * so the same import resolves.
 */
export * from 'fishball-connector/contract'
