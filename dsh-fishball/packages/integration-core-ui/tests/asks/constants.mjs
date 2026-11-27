/**
 * Values of the ask-card rows: core's AskCard contract (ask-card.d.ts), fishball-ui's card hooks as the old
 * suite read them (DSH's slot, the Allow / Reject labels, the incomplete note), the chunk's DSH module
 * loader global. Card data is test data.
 */
export const ASK = Object.freeze({
  slot: 'conversation.input.dock', clientExport: './client', pageMark: 'data-fishball-page', mountKey: 'fbtest-cu-ask-dock-', button: 'button',
  label: Object.freeze({ allow: /^allow\b/i, reject: /^reject\b/i }),
  incompleteNote: /\bincomplete\b/i,
  markupTags: Object.freeze(['b', 'i', 'img', 'script']),
  argumentsStatus: Object.freeze({ complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' }),
  choice: Object.freeze({ allow: 'allow', reject: 'reject' }),
  state: Object.freeze({ open: 'open' }),
  chunk: 'client.asks.js', corePatch: 'cordis.patch.yml', loaderGlobal: '__ModuleLoader__',
  fixture: Object.freeze({
    manager: 'fbtest-fishball', session: 'fbtest-s1', title: 'FBTEST-T staging migration', question: 'FBTEST-Q Use the staging database? #',
    reason: 'FBTEST-R the session asked', askedAt: 1_800_000_000_000, handlePrefix: 'fbtest-handle-', approvalPrefix: 'fbtest-ask-', offerSuffix: '.r1',
    source: Object.freeze({ targetId: 't-fbtestaaaaaaaaaaaa', endpointEpoch: 'e-fbtestaaaaaa' }),
    argumentsText: '{"command":"rm -rf <b>build</b>","cwd":"/tmp/fbtest"}',
    markupReason: 'FBTEST-R <img src=x onerror=alert(1)> & <script>alert(2)</script>',
  }),
})
