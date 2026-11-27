/**
 * R-FIX-FUI F3 (stream health) and F9 (ask-card time locale) vocabulary: the requirement's hooks and
 * copy (relayed by the lead, 2026-11-18). No value comes from the implementation.
 */
export { HEALTH_HOOK, NOTICE_TEXT } from '../support/page-stream.mjs'
/** The two health words a view draws while not live. */
export const HEALTH = Object.freeze({ stale: 'stale', closed: 'closed' })
export const LANGS = Object.freeze(['en', 'zh'])

/** F9: the Intl locale of each DSH UI language, and the runtime default each case forces (the other direction). */
export const TIME = Object.freeze({
  locale: Object.freeze({ en: 'en', zh: 'zh-CN' }),
  forcedDefault: Object.freeze({ en: 'zh-CN', zh: 'en-US' }),
})

/** The dock every fishball-ui `conversation.input.dock` entry is mounted in, for Fishball's own conversation. */
export const DOCK = Object.freeze({ slot: 'conversation.input.dock', mountKey: 'fbtest-stream-dock-', root: 'data-fishball-asks' })

/** Each ask card draws its choice buttons and one reason box (Allow, Reject, the reason). */
export const CONTROLS_PER_CARD = 3

/** Bad `asks` frames (HEALTH-EP-01): text that is not the topic's shape. */
export const BAD_FRAMES = Object.freeze([['not JSON', '{oops'], ['null', 'null'], ['no cards array', 'cards-not-array'], ['an array', '[]']])