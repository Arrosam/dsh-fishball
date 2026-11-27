/** Bounds and vocabulary for the optional taskboard automation, not legacy board limits. */
const HOUR_MS = 60 * 60 * 1000
const RETENTION_DAYS = 30
export const AUTO_LIMIT = Object.freeze({
  rows: 20, calls: 6, hourMs: HOUR_MS, inputTokens: 8192, outputTokens: 1024,
  timeoutMs: 30000, retentionDays: RETENTION_DAYS, retentionMs: RETENTION_DAYS * 24 * HOUR_MS,
  bytes: 16 * 1024 * 1024, unresolved: 100, evidenceChars: 400, idChars: 256,
})
export const AUTO_REASON = Object.freeze({
  off: 'off', hostUnavailable: 'host-unavailable', storageUnavailable: 'storage-unavailable', modelUnavailable: 'model-unavailable',
  inputBudget: 'input-budget', modelFailed: 'model-failed', rateLimited: 'rate-limited',
  timeout: 'timeout', invalidOutput: 'invalid-output', invalidSource: 'invalid-source',
  rowBudget: 'row-budget', rateBudget: 'rate-budget', busy: 'busy', stale: 'stale',
  noChange: 'no-change', capacity: 'capacity', duplicate: 'duplicate',
})
export const AUTO_NOTICE = Object.freeze({
  none: 'none', pending: 'pending', claimed: 'claimed', accepted: 'accepted', failed: 'failed', unknown: 'unknown',
})
export const AUTO_REVIEW = Object.freeze({ pending: 'pending', rejected: 'rejected', confirmed: 'confirmed', voided: 'voided' })
export const AUTO_WIRE = Object.freeze({ version: 1, work: 'work', completed: 'completed' })
export const AUTO_PATH = Object.freeze({
  view: '/api/fishball-taskboard/auto', settings: '/api/fishball-taskboard/auto/settings',
  undo: '/api/fishball-taskboard/auto/undo', archiveNotice: '/api/fishball-taskboard/auto/archive-notice',
  topic: 'fishball-taskboard-auto', event: 'auto',
})
