/**
 * Vocabulary for the marks suite (DESIGN.md §28 "Hand over" row; the user's decisions of 2026-11-20,
 * R1–R6; the shipped names the lead confirmed that day). The marks part is dsh-agent-connector's
 * browser half: Hand over / Take back in the session header and the row menu, "Managed by <agent>"
 * beside the title, the managed mark on sidebar rows. The world is the U-DRAW one (the real UI
 * backend, the connector's and embed-UI's real browser code in a scripted page), so its vocabulary
 * is reused, never restated; only the marks' own values are added here.
 */
export { ATTR, BACKEND, CODES, EXPECT, FIXTURE, MARKS, MARKUP_TAGS, SLOT, TAG, TEXT, TOOL, WAIT } from '../../ui/tests/draw/constants.mjs'
export { FISH, WRENCH } from '../../../../test/v3/contract/package-boundaries/icon-set.mjs'

/** The SDKs every row runs on (the suite files' names). */
export const SDKS = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1'])

/** The page sets of the presence table (MARKS-DT-01): connector client entry C, embed-UI U, UI backend B. */
export const PRESENCE = Object.freeze([
  Object.freeze({ rule: 1, label: 'C + U + B', connector: true, embed: true, backend: true, marks: true }),
  Object.freeze({ rule: 2, label: 'C + B (no embed-UI)', connector: true, embed: false, backend: true, marks: true }),
  Object.freeze({ rule: 3, label: 'U + B (no connector client entry)', connector: false, embed: true, backend: true, marks: false }),
  Object.freeze({ rule: 4, label: 'C, no UI backend', connector: true, embed: false, backend: false, marks: false }),
  Object.freeze({ rule: 5, label: 'C + U, no UI backend', connector: true, embed: true, backend: false, marks: false }),
])
