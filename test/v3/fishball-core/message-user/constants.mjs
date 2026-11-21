/**
 * MSG-USER vocabulary: Fishball's `message_user` tool and the Fishball page's message rows and hidden
 * replies. Authority: the implementer's black-box spec relayed by the lead (2026-11-21), its refinement
 * of item 6 (a reply shows exactly when its turn's control is open or disabled) and the lead's look rule
 * (avatar, label and bubble on the message row; expanded replies plain). DSH's markup words are DSH's
 * public chat attributes (dsh-client-ui-chat, both SDKs). No value comes from an implementation.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

/** Spec items 1–3: the tool, its module and the guard table entry. */
export const TOOL = Object.freeze({
  name: 'message_user',
  module: path.join(REPO, 'packages', 'core', 'src', 'manager', 'message-tools.js'),
  table: 'MESSAGE_TOOL',
  tableValue: Object.freeze({ send: 'message_user' }),
  guardEntry: Object.freeze({ module: '../manager/message-tools.js', table: 'MESSAGE_TOOL' }),
  contracts: path.join(REPO, 'packages', 'core', 'contracts', 'constants.js'),
  /** "import-free": no static or dynamic import and no require in the module text. */
  importForms: Object.freeze([/^\s*import\s/m, /\bimport\s*\(/, /\brequire\s*\(/, /^\s*export\s[^;]*\sfrom\s/m]),
  parameter: 'message',
  shown: Object.freeze({ shown: true }),
  empty: Object.freeze({ shown: false, code: 'message-empty' }),
  callPrefix: 'call_fbmsg_',
})

/**
 * Spec item 2 as a decision table: the argument partitions and their model-facing result. `refused`
 * rows are DSH's own argument validation (an error tool result), never a {shown} answer.
 */
export const RESULT_ROWS = Object.freeze([
  Object.freeze({ row: 'EP text', args: { message: 'fbtest-msg-dt hello' }, want: 'shown' }),
  Object.freeze({ row: 'BVA one character', args: { message: 'x' }, want: 'shown' }),
  Object.freeze({ row: 'BVA text padded by spaces', args: { message: '  fbtest-msg-dt padded  ' }, want: 'shown' }),
  Object.freeze({ row: 'BVA empty string', args: { message: '' }, want: 'empty' }),
  Object.freeze({ row: 'BVA one space', args: { message: ' ' }, want: 'empty' }),
  Object.freeze({ row: 'EP whitespace only (newline, tab, spaces)', args: { message: '\n\t  \n' }, want: 'empty' }),
  Object.freeze({ row: 'EP number', args: { message: 7 }, want: 'refused' }),
  Object.freeze({ row: 'EP null', args: { message: null }, want: 'refused' }),
  Object.freeze({ row: 'EP missing message', args: {}, want: 'refused' }),
])

/** Spec item 4: the persona's statements, found as words, not as exact sentences. */
export const PERSONA = Object.freeze({
  entry: path.join(REPO, 'packages', 'core', 'src', 'persona.js'),
  export: 'PERSONA_ROLE',
  notify: 'embed-ui__notify',
  /** Ordinary replies, reasoning and tool calls are hidden from the user. */
  hidden: /\b(?:hidden|invisible|not (?:shown|visible|seen)|never (?:sees?|shown)|(?:does|do|will|can) ?not see|cannot see|can't see|doesn't see|don't see)\b/i,
  hiddenSubjects: Object.freeze([/\brepl(?:y|ies)\b/i, /\breasoning\b/i, /\btool calls?\b/i]),
  /** The user sees only what Fishball surfaces with the tools. */
  only: /\bonly\b/i,
  attention: /\battention\b/i,
  action: /\baction\b/i,
  /** "proactively": the word, or the same rule in other words (on its own, unasked, at once). */
  proactive: /\bproactive(?:ly)?\b|\b(?:tell|send|message|inform)\w*\s+(?:\w+\s+){0,2}yourself\b|\bon your own\b|\bwithout (?:being|waiting to be) asked\b|\bunprompted\b|\b(?:in the (?:same )?turn|as soon as|the moment) you (?:learn|see|notice|find)\b/i,
  routine: /\broutine\b/i,
  batch: /\bbatch/i,
  greeting: /\bgreet/i,
  stop: /\bstop/i,
  redirect: /\bredirect/i,
  /** "every reply to the user goes through message_user": an every/all word, a reply word and the tool in one sentence. */
  everyReply: /\b(?:every|all|any|each)\b[^.]{0,120}\b(?:repl(?:y|ies)|answers?|messages?)\b/i,
  /** A sentence telling Fishball to talk to the user in the chat, which must then name message_user. */
  chatSaying: /\b(?:tell|inform|say|answer|reply|respond|report|write)\b[^.]{0,60}\b(?:in|into) (?:this|the) (?:chat|conversation)\b/i,
  sentence: /(?<=[.!?:])\s+|\n+/,
})

/** The real DSH web UI's markup (DSH's public attributes, the page's published hooks). */
export const PAGE = Object.freeze({
  root: '/',
  blank: 'about:blank',
  viewport: Object.freeze({ width: 1280, height: 900 }),
  budgetMs: 20000,
  pollMs: 150,
  aimTries: 40,
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
    /** PAGING: DSH's chat scrollport, the two row kinds the gap rows read, and DSH's "Load earlier" label (en chat.loadOlder; "Loading…" while busy). */
    scroller: '[data-conversation-scroll]',
    messageKind: 'fishball-message', replyKind: 'assistant-step', response: 'response',
    loadOlder: Object.freeze(['Load earlier']),
    brandAttr: 'data-fishball-brand',
  }),
  kinds: Object.freeze({ message: 'fishball-message', reply: 'assistant-step', tool: 'tool-call' }),
  response: 'response',
  label: '"Fishball"',
  /** A ::before / ::after that draws nothing. */
  noContent: Object.freeze(['none', 'normal']),
  transparent: 'rgba(0, 0, 0, 0)',
  pageRow: 'fishball-page',
  /** Trusted wheel input toward the top: steps, pixels per step, pause between steps. */
  wheel: Object.freeze({ steps: 80, delta: 800, pauseMs: 50 }),
  /** DSH's chat settings namespace and its work-details field (dsh-client-ui-chat CHAT_SETTINGS_NAMESPACE / TRANSCRIPT_VIEW_FIELD). */
  chat: Object.freeze({ ns: 'ui-chat', field: 'transcriptView', verbose: 'verbose' }),
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
  }),
  /** A running turn held at its second model request. */
  running: Object.freeze({ pre: 'fbtest-msg-live pre reply', message: 'fbtest-msg-live message' }),
  /** A turn the user stops while it is held. */
  stopped: Object.freeze({ pre: 'fbtest-msg-stop pre reply', message: 'fbtest-msg-stop message' }),
})

export const BUDGET = Object.freeze({ heldMs: 30000, pollMs: 100 })

/**
 * PAGING / STREAM rows (the lead, 2026-11-21: folded replies must not break DSH's chat scrolling or paging).
 * DSH opens a session with a Turn-aligned window of at least 50 messages and two Turns and pages older
 * history in the same shape (dsh-api-session-controller HISTORY_PAGE_OPTIONS, both SDKs); each scripted turn
 * here is four messages (the user's, a reply with a message_user call, its result, a final reply), so
 * 40 turns need at least one older page. Tolerances are layout rounding, not product values.
 */
export const PAGING = Object.freeze({
  turns: 40,
  message: (i) => 'fbtest-page msg-' + String(i).padStart(2, '0'),
  pre: (i) => 'fbtest-page pre ' + String(i).padStart(2, '0'),
  final: (i) => 'fbtest-page final ' + String(i).padStart(2, '0'),
  callPrefix: 'call_fbpage_',
  /** Older pages read at most (the window has grown by then far past 40 turns' worth). */
  maxPages: 6,
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
  start: 'fbtest-stream START',
  end: 'fbtest-stream END',
  before: 'fbtest-stream message before',
  after: 'fbtest-stream message after',
  final: 'fbtest-stream final reply',
  callPrefix: 'call_fbstream_',
  sampleMs: 200,
  budgetMs: 30000,
  /** Uncaught page exceptions that name Fishball's code (DSH's own are not this suite's subject). */
  ours: /fishball/i,
})
