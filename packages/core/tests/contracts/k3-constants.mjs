/**
 * What the declaration reader needs from the old K3 vocabulary (test/v3/contract/k3-host-services/
 * constants.mjs): the file classes of a contracts folder, the reader's depth budget, and K3's
 * secret-name test the K3a seam rows widen. Unchanged values.
 */
export const FILES = Object.freeze({
  declaration: /\.d\.(?:c|m)?ts$/,
  doc: /\.md$/i,
  script: /\.(?:c|m)?js$/,
})
/** Parser budgets (a referenced type is followed at most this deep). */
export const RESOLVE_DEPTH = 8
/** Design §3.6 HAND-EP-01 row 5: a member named like a secret (K3's test, reused by K3a-UI). */
export const SECRET_FIELD = /token|secret|credential|label|value|password/i
