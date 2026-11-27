/**
 * MSG-USER page vocabulary: Fishball's `message_user` rows and hidden replies on the Fishball page
 * (DESIGN §32). Authority: the implementer's black-box spec relayed by the lead (2026-11-21), items 5–7,
 * its refinement of item 6 (a reply shows exactly when its turn's control is open or disabled), the
 * lead's look rule (avatar, label and bubble on the message row; expanded replies plain) and the lead's
 * paging rule (folded replies must not break DSH's chat scrolling or paging). DSH's markup words are its
 * public chat attributes (dsh-client-ui-chat); core's values come from its published contracts.
 * Ported from test/v3/fishball-core/message-user/constants.mjs; no value comes from an implementation.
 */
import { FAKE, FAKE_MODELS } from 'fishball-test-helpers/fake-llm'
import { FISHBALL_MODEL } from 'fishball-core/contracts'

/** Spec items 1–2: the tool the rows are drawn from, its parameter, test call ids. */
export const TOOL = Object.freeze({ name: 'message_user', parameter: 'message', callPrefix: 'call_fbmsg_' })

/** The manager-session route (core's src/session/route.js, the route fishball-page reads). */
export const SESSION_ROUTE = '/api/fishball/session'

/**
 * Fishball's model, set before the page opens: with it unset fishball-ui's model dialog is a modal over
 * the chat and DSH's control cannot be clicked. The scripted model serves this routable selection.
 */
export const MODEL = Object.freeze({ namespace: FISHBALL_MODEL.settingsNamespace, path: FISHBALL_MODEL.path, routable: Object.freeze({ provider: FAKE.provider, model: FAKE_MODELS.b }) })

/**
 * Spec item 2's argument partitions, one call per turn before the page rows (MSG-PAGE-DT-01 reads that
 * none of the blank or refused ones draws a row). `shown` marks the ones that draw.
 */
export const RESULT_ROWS = Object.freeze([
  Object.freeze({ row: 'EP text', args: { message: 'fbtest-msg-dt hello' }, shown: true }),
  Object.freeze({ row: 'BVA one character', args: { message: 'x' }, shown: true }),
  Object.freeze({ row: 'BVA text padded by spaces', args: { message: '  fbtest-msg-dt padded  ' }, shown: true }),
  Object.freeze({ row: 'BVA empty string', args: { message: '' }, shown: false }),
  Object.freeze({ row: 'BVA one space', args: { message: ' ' }, shown: false }),
  Object.freeze({ row: 'EP whitespace only (newline, tab, spaces)', args: { message: '\n\t  \n' }, shown: false }),
  Object.freeze({ row: 'EP number', args: { message: 7 }, shown: false }),
  Object.freeze({ row: 'EP null', args: { message: null }, shown: false }),
  Object.freeze({ row: 'EP missing message', args: {}, shown: false }),
])

/** The real DSH web UI's markup (DSH's public attributes, the page's published hooks). */
export const PAGE = Object.freeze({
  root: '/',
  selectors: Object.freeze({
    row: '[data-chat-flow-kind]',
    kind: 'data-chat-flow-kind',
    part: 'data-chat-group-part',
    turn: 'data-chat-turn',
    content: ':scope > [data-slot="conversation.chat.node"] > *',
    toolAttr: '[data-tool]',
    toolName: 'data-tool',
    folded: 'data-fishball-folded',
    conversation: '[data-slot="main.conversation"]',
    processBody: '[data-step-process-body]',
    processMember: 'data-turn-process-member',
    bubble: '[data-fishball-message]',
    control: 'button[data-turn-process]',
    controlAttr: 'data-turn-process',
    open: 'data-open',
    pageMark: 'data-fishball-page',
    /** PAGING: DSH's chat scrollport, the two row kinds the gap rows read, DSH's "Load earlier" label (en chat.loadOlder). */
    scroller: '[data-conversation-scroll]',
    messageKind: 'fishball-message', replyKind: 'assistant-step', response: 'response',
    loadOlder: Object.freeze(['Load earlier']),
  }),
  kinds: Object.freeze({ message: 'fishball-message', reply: 'assistant-step', tool: 'tool-call' }),
  response: 'response',
  label: '"Fishball"',
  /** A ::before / ::after that draws nothing. */
  noContent: Object.freeze(['none', 'normal']),
  noMask: 'none',
  transparent: 'rgba(0, 0, 0, 0)',
  noRadius: '0px',
  /** fishball-page's row id in core's patch (the owner's Plugins switch, item 7). */
  pageRow: 'fishball-page',
  /** DSH's chat settings namespace and its work-details field (dsh-client-ui-chat CHAT_SETTINGS_NAMESPACE / TRANSCRIPT_VIEW_FIELD). */
  chat: Object.freeze({ ns: 'ui-chat', field: 'transcriptView', verbose: 'verbose' }),
  strongTag: (word) => '<strong>' + word + '</strong>',
  markdownMarker: '**',
})

/** The scripted turns (fake-llm responses); markers find each turn's rows in the page. */
export const TURNS = Object.freeze({
  /** Nothing to fold besides the reply: DSH draws a disabled control without data-open. */
  plain: Object.freeze({ reply: 'fbtest-msg-plain reply' }),
  /** A completed turn with a process: replies around four shown and five dropped calls. */
  completed: Object.freeze({
    pre: 'fbtest-msg-done pre reply',
    final: 'fbtest-msg-done final reply',
    /** Call order: shown rows in this order (Markdown: the strong word is drawn as <strong>). */
    shown: Object.freeze([
      Object.freeze({ message: 'fbtest-msg-done **first** message', text: 'fbtest-msg-done first message', strong: 'first' }),
      Object.freeze({ message: 'fbtest-msg-done second message', text: 'fbtest-msg-done second message' }),
      Object.freeze({ message: '   fbtest-msg-done third, padded   ', text: 'fbtest-msg-done third, padded' }),
      Object.freeze({ message: 'z', text: 'z' }),
    ]),
    dropped: Object.freeze([
      Object.freeze({ args: { message: '' } }),
      Object.freeze({ args: { message: ' \n\t ' } }),
      Object.freeze({ args: { message: 7 } }),
      Object.freeze({ args: {} }),
      Object.freeze({ raw: '{"message":"fbtest-msg-done broken' }),
    ]),
    /** The pre and the final reply. */
    replies: 2,
  }),
  /** A running turn held at its second model request. */
  running: Object.freeze({ pre: 'fbtest-msg-live pre reply', message: 'fbtest-msg-live message' }),
  /** A turn the user stops while it is held. */
  stopped: Object.freeze({ pre: 'fbtest-msg-stop pre reply', message: 'fbtest-msg-stop message' }),
  /** The model request a running turn is held at (its second: after the reply with the call). */
  holdAt: 2,
})

/**
 * PAGING / STREAM. DSH opens a session with a Turn-aligned window of at least 50 messages and two Turns
 * and pages older history in the same shape (dsh-api-session-controller HISTORY_PAGE_OPTIONS); each
 * scripted turn here is four messages (the user's, a reply with a message_user call, its result, a final
 * reply), so 40 turns need at least one older page. Tolerances are layout rounding, not product values.
 */
export const PAGING = Object.freeze({
  turns: 40,
  message: (i) => 'fbtest-page msg-' + String(i).padStart(2, '0'),
  pre: (i) => 'fbtest-page pre ' + String(i).padStart(2, '0'),
  final: (i) => 'fbtest-page final ' + String(i).padStart(2, '0'),
  callPrefix: 'call_fbpage_',
  /** Older pages read at most (the window has grown by then far past 40 turns' worth). */
  maxPages: 6,
  /** Wheel steps tried toward DSH's history edge per page (harness budget). */
  wheelSteps: 80,
  /** How long the anchor is watched after an older page arrives. */
  settleMs: 2000,
  sampleMs: 100,
  arriveMs: 20000,
  /** The anchor row may move by layout rounding only (CSS pixels). */
  anchorTolerancePx: 2,
  /** A hidden seat's box and the gap it may add (CSS pixels). */
  gapTolerancePx: 0.5,
})

/** A long streamed reply: many text deltas while the turn runs (fake-llm `deltas` / `delayMs`). */
export const STREAM = Object.freeze({
  words: 400,
  deltas: 400,
  delayMs: 10,
  word: (i) => 'w' + i,
  start: 'fbtest-stream START',
  end: 'fbtest-stream END',
  prefix: 'fbtest-stream',
  before: 'fbtest-stream message before',
  after: 'fbtest-stream message after',
  final: 'fbtest-stream final reply',
  callPrefix: 'call_fbstream_',
  sampleMs: 200,
  budgetMs: 30000,
  /** Samples and distinct lengths that prove the reply was seen streaming (precondition). */
  minSamples: 3, minLengths: 2,
  /** Uncaught page exceptions that name Fishball's code (DSH's own are not these rows' subject). */
  ours: /fishball/i,
})

/** Harness waits and labels. */
export const BUDGET = Object.freeze({ heldMs: 30000, pollMs: 100, caseMs: 900000 })
export const HOME = Object.freeze({ page: 'fbpui-msg', paging: 'fbpui-paging' })
/** Why a page row skips (harness only). */
export const SKIP_NO_CHROME = 'no Chromium on this machine (set FBTEST_CHROME, or install the Playwright headless shell)'
