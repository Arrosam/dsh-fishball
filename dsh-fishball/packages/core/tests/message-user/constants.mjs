/**
 * MSG-USER vocabulary: Fishball's `message_user` tool and its persona (the page's message rows and
 * hidden replies are fishball-ui's: integration rows). Authority: the implementer's black-box spec relayed by the lead (2026-11-21), its refinement
 * of item 6 (a reply shows exactly when its turn's control is open or disabled) and the lead's look rule
 * (avatar, label and bubble on the message row; expanded replies plain). DSH's markup words are DSH's
 * public chat attributes (dsh-client-ui-chat, both SDKs). No value comes from an implementation.
 */
import path from 'node:path'
import { FAKE, FAKE_MODELS } from 'fishball-test-helpers/fake-llm'
import { FISHBALL_MODEL } from '../../contracts/constants.js'

/** fishball-core's own folder (this file is packages/<core>/tests/message-user/). */
const CORE_DIR = path.join(import.meta.dirname, '..', '..')

/** Spec items 1–3: the tool and its module. */
export const TOOL = Object.freeze({
  name: 'message_user',
  module: path.join(CORE_DIR, 'src', 'manager', 'message-tools.js'),
  table: 'MESSAGE_TOOL',
  tableValue: Object.freeze({ send: 'message_user' }),
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
  entry: path.join(CORE_DIR, 'src', 'persona.js'),
  export: 'PERSONA_ROLE',
  notify: 'embed-ui__notify',
  only: /\bonly\b/i,
  hidden: /\b(?:hidden|invisible|not (?:shown|visible|seen)|never shown)\b/i,
  hiddenSubjects: Object.freeze({ replies: /\brepl(?:y|ies)\b/i, reasoning: /\breasoning\b/i, toolCalls: /\btool calls?\b/i }),
  throughMessage: Object.freeze({
    everyReply: /\b(?:every|all|each)\b[^.!?]*\b(?:repl(?:y|ies)|responses?)\b/i,
    setupGreeting: /\bsetup\b[^.!?]*\bgreet\w*\b|\bgreet\w*\b[^.!?]*\bsetup\b/i,
    afterStop: /\bafter\b[^.!?]*\bstop\b/i,
    afterRedirect: /\bafter\b[^.!?]*\bredirect\b/i,
  }),
  attention: /\b(?:attention|action|actionable|urgent)\b/i,
  routine: /\broutine\b/i,
  batch: /\bbatch/i,
  drop: /\b(?:drop|skip|omit|ignore|discard|suppress)\w*\b/i,
  /** A clause telling Fishball to talk to the user in the chat must name message_user. */
  chatSaying: /\b(?:tell|inform|say|answer|reply|respond|report|write)\b[^.]{0,60}\b(?:in|into) (?:this|the) (?:chat|conversation)\b/i,
  clause: /(?<=[.!?])\s+|\n+/,
})

/** Fishball's model for the scenario (a routable selection; the scripted model serves it). */
export const MODEL_PATH = FISHBALL_MODEL.path
export const ROUTABLE = Object.freeze({ provider: FAKE.provider, model: FAKE_MODELS.b })
export const SYS = Object.freeze({ timeout: 600000 })
export const HOME_LABEL = 'fbmsg'
