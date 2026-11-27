/**
 * fishball-core's identity and pairing (task F-PAIR; design §5.8; R-ID-05, R-ID-07, R-ID-10,
 * R-NAME-03, R-HOST-10). F-WIRE mounts it: it owns the `identity.*` settings rows (with the
 * defaults below), opens the records table, and passes the link's options to `createPairing`.
 * - `createPairing(options)`: core's link with the pairing gate, its state, the warning's choices
 *   and the name sync;
 * - `openRecords(ctx, storageDomain)` / `createRecords(table)`: the non-secret paired records;
 * - `generateId`, `acceptId`, `requestedName`: the `identity.id` / `identity.name` rules;
 * - the module's values (`./constants.js`).
 */
export { createPairing, PairingFailed } from './pairing.js'
export { openRecords, createRecords } from './records.js'
export { generateId, acceptId, requestedName } from './identity.js'
export { IDENTITY, PAIRING_STATE, CHOICE, CHOICES_OF, CHOICE_REFUSAL, NAME_SOURCE, RECORDS, HOLD_STATUS } from './constants.js'
