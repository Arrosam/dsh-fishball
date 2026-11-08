/** Requirement-owned vocabulary: no connector implementation constants or clock algorithm. */
export const LIST_ACTIVITY = Object.freeze({
  event: 'api-session/activity',
  reducer: Object.freeze({ file: '@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/manager.js', declaration: 'function applyMutation(summaries, mutation) {', kind: 'activity', maxSourceChars: 12000, timeoutMs: 1000 }),
  fixture: Object.freeze({ name: 'fbtest-session-list-activity', request: 'list-activity-probe', response: 'list-activity-probe-reply' }),
  ms: Object.freeze({ ipc: 25000, settle: 20000, poll: 25, quiet: 100 }),
  counts: Object.freeze({ none: 0, one: 1 }),
  text: Object.freeze({ title: 'Fishball list activity target', message: 'Fishball list activity delivery', firstUser: 'first words', busy: 'independent running turn' }),
  id: Object.freeze({ target: 'session-list-target', peer: 'session-list-peer', unknown: 'session-fbtest-list-activity-missing' }),
  clock: Object.freeze({ cached: 1700000000100, less: 1700000000099, equal: 1700000000100, greater: 1700000000101, peer: 1700000000050 }),
  probe: Object.freeze({ steer: true, followupFailure: 'fbtest: redirect followup failed' }),
  provenance: Object.freeze({ redirect: 'Fishball (redirect_session)' }),
  order: Object.freeze({ folder: 'list-activity-order', target: 'list-activity-target', peer: 'list-activity-peer' }),
})
