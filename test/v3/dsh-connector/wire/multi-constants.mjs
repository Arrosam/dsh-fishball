/** MULTI-2 requirement/fixture data; not imported from product internals. */
export const MULTI = Object.freeze({
  id: 'MULTI-2', scenario: 'multi-identity', suffix: '-DSH', identityUri: 'dsh-agent://identity',
  infoKey: 'io.modelcontextprotocol/serverInfo', subscriptionKey: 'io.modelcontextprotocol/subscriptionId', mimeType: 'application/json',
  updated: 'notifications/resources/updated', toolsChanged: 'notifications/tools/list_changed',
  watchMs: 30000, beforeWatchMs: 29999, boundaryStepMs: 1,
  hostname: 'MULTI host α', nextHostname: 'MULTI host β', finalHostname: 'MULTI host γ',
  refName: 'approval.dshName', configured: 'MULTI configured', renamed: 'MULTI renamed',
  label: 'MULTI identity observer', idPrefix: 'multi-observer',
  nameRows: Object.freeze([
    Object.freeze({ id: 'unset', value: undefined, hostname: true }),
    Object.freeze({ id: 'empty', value: '', hostname: true }),
    Object.freeze({ id: 'space', value: ' ', hostname: true }),
    Object.freeze({ id: 'whitespace', value: '\t\n\u2003', hostname: true }),
    Object.freeze({ id: 'one character', value: 'x' }),
    Object.freeze({ id: 'padded verbatim', value: '  Office West  ' }),
    Object.freeze({ id: 'already suffixed', value: 'Office-DSH' }),
    Object.freeze({ id: 'unicode', value: '实验室 🐟 e\u0301 العربية' }),
    Object.freeze({ id: 'markup', value: '<img src=x onerror="globalThis.MULTI_EXECUTED=1"> & <script>bad()</script>' }),
    ...[63, 64, 65, 128, 129, 4096].map((length) => Object.freeze({ id: `length ${length}`, value: 'N'.repeat(length) })),
  ]),
})
