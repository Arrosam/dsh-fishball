/**
 * R-FIX-FUI F3 (stream health) and F9 (ask-card time locale) vocabulary: the requirement's hooks and
 * copy (relayed by the lead, 2026-11-18). No value comes from the implementation.
 */
export const HEALTH_HOOK = Object.freeze({
  notice: 'data-fishball-stream-notice',
  retry: 'data-fishball-stream-retry',
  stripStale: 'data-fishball-strip-stale',
  asksStale: 'data-fishball-asks-stale',
  pairingStale: 'data-fishball-pairing-stale',
})
export const HEALTH = Object.freeze({ stale: 'stale', closed: 'closed' })
export const NOTICE_TEXT = Object.freeze({
  stale: Object.freeze({ en: 'Reconnecting to Fishball… What is shown here may be out of date.', zh: '正在重新连接 Fishball… 此处显示的内容可能已过时。' }),
  closed: Object.freeze({ en: 'The connection to Fishball was lost. What is shown here may be out of date.', zh: '与 Fishball 的连接已断开。此处显示的内容可能已过时。' }),
  retry: Object.freeze({ en: 'Reconnect', zh: '重新连接' }),
  staleBadge: Object.freeze({ en: 'Out of date', zh: '已过时' }),
})
export const LANGS = Object.freeze(['en', 'zh'])

/** F9: the Intl locale of each DSH UI language, and the runtime default each case forces (the other direction). */
export const TIME = Object.freeze({
  locale: Object.freeze({ en: 'en', zh: 'zh-CN' }),
  forcedDefault: Object.freeze({ en: 'zh-CN', zh: 'en-US' }),
})
