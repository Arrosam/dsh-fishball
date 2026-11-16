/** Requirement-owned fixtures: no provider credentials or model selection APIs are available. */
export const INITSYNC = Object.freeze({
  file: 'initial-model-sync.json', prefix: 'initsync-', checkId: 'check-sentinel',
  codes: { failed: 'child-sync-failed', outcomeFailed: 'failed' },
  refused: 'CHECK_REFUSED', addRefused: 'ADD_REFUSED', thrown: 'SYNC_THROWN',
  privateText: 'PRIVATE-provider-name-key-error-message',
  providers: [
    { id: 'provider-b', name: 'PRIVATE-provider-name-key-error-message', models: ['model-b'] },
    { id: 'provider-a', name: 'PRIVATE-provider-name-key-error-message', models: ['model-a', 'model-c'] },
    { id: 'provider-c', name: 'PRIVATE-provider-name-key-error-message', models: [] },
  ],
  outcomes: ['added', 'skipped', 'failed'],
  counts: [0, 1, 3],
  skip: 'Needs a real installed hosted child; launching hosted children is forbidden in this cycle',
})
