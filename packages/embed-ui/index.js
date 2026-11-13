/**
 * fishball-embed-ui, host half: a placeholder with no behaviour (V3 R-EMBED). The row exists so
 * DSH composes this package's browser half (src/client/client.js), as DSH's own client-only
 * packages do. U-SHELL adds the host half: service detection, `instance-missing`, admission and
 * the status, Retry and model-sync routes (design §4.2).
 */
export const name = 'fishball-embed-ui'

export function apply() {}
