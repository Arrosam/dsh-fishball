/**
 * Named package boundary of the instance-run child's Plugins page changes (DESIGN §28). Core's patch
 * switches this row on only while the instance's launch overlay inserts `dsh-instance-child`, so
 * its browser half (client.js) is served exactly in an instance-run child and never in a standalone
 * Fishball: being served is how the browser learns the mode, with no route or flag. The row has no
 * Node work of its own.
 */
export const name = 'fishball-child-plugins'
export function apply() {}
