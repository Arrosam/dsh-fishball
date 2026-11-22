/**
 * Ask cards as core serves them on the page connection's `asks` topic: `{managerSessionId, cards}`
 * of AskCard (packages/core/contracts/ask-card.d.ts as amended by F-FIX and MULTI-0: an opaque
 * `handle`, the trusted `source`, the descriptor's question / arguments / reason, `choices` Allow and
 * Reject, or Reject only when the arguments are not complete). Every value here is test data in the
 * contract's shape; fishball-ui only draws it.
 */

/** The ask card's public hooks and the contract's words. */
export const ASK = Object.freeze({
  card: 'data-fishball-ask',
  choice: 'data-fishball-ask-choice',
  state: Object.freeze({ open: 'open', answered: 'answered', closed: 'closed', voided: 'voided' }),
  choices: Object.freeze({ allow: 'allow', reject: 'reject' }),
  argumentsStatus: Object.freeze({ complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' }),
})

/** Test data (not product ids). */
export const ASK_FIXTURE = Object.freeze({
  managerSession: 'fbtest-fishball',
  askingSession: 'fbtest-s1',
  title: 'FBTEST-T staging migration',
  question: 'FBTEST-Q Use the staging database?',
  numberSeparator: ' #',
  reason: 'FBTEST-R the session asked',
  argumentsText: '{}',
  askedAt: 1_800_000_000_000,
  handlePrefix: 'fbtest-handle-',
  approvalPrefix: 'fbtest-ask-',
  offerSuffix: '.r1',
  source: Object.freeze({ targetId: 't-aaaaaaaaaaaaaaaa', endpointEpoch: 'e-aaaaaaaaaaaaaaaa', serverName: 'Office-DSH', name: 'Office-DSH' }),
})

let made = 0
/** One AskCard; every card made gets its own handle, ids, question and time. Fields may be overridden. */
export function askCard({ state = ASK.state.open, argumentsStatus = ASK.argumentsStatus.complete, ...overrides } = {}) {
  made += 1
  const approvalId = ASK_FIXTURE.approvalPrefix + made
  return {
    handle: ASK_FIXTURE.handlePrefix + made,
    source: { ...ASK_FIXTURE.source },
    approvalId,
    offerId: approvalId + ASK_FIXTURE.offerSuffix,
    sessionId: ASK_FIXTURE.askingSession,
    sessionTitle: ASK_FIXTURE.title,
    question: ASK_FIXTURE.question + ASK_FIXTURE.numberSeparator + made,
    arguments: ASK_FIXTURE.argumentsText,
    argumentsStatus,
    reason: ASK_FIXTURE.reason,
    choices: argumentsStatus === null || argumentsStatus === ASK.argumentsStatus.complete ? [ASK.choices.allow, ASK.choices.reject] : [ASK.choices.reject],
    askedAt: ASK_FIXTURE.askedAt + made,
    state,
    ...overrides,
  }
}
export const askCards = (n, options) => Array.from({ length: n }, () => askCard(options))

/** The `asks` topic's frame. */
export const askFrame = (cards, managerSessionId = ASK_FIXTURE.managerSession) => ({ managerSessionId, cards })
