/**
 * How Fishball words the line it writes on a card in your pile (rev11-pile-list, §10e: the user
 * asked for a conversational line saying what needs them and why). The persona and every note
 * parameter that reaches the pile read this one text, so the guidance cannot drift apart.
 *
 * It lives in its own module so the slim child can copy the persona's one text dependency
 * without the main profile's full constant set (src/native-runtime/installation.js).
 */
export const PILE_NOTE = Object.freeze({ guide: 'one conversational sentence to the user saying what they need to decide and why it needs them' })

/** Where a session's question is answered (7713 N6, N7): only on its own card, and where it is NOT. */
const SESSION_QUESTION = 'the user answers it only on that session\'s own question card, in that session, not in this chat or the user\'s pile'
/** What Fishball says when it promises the place before the question exists (7713 N9-a). */
const PROMISE = 'Whenever you tell the user where they will answer a session\'s question, even before it arrives, say on that session\'s own question card.'

/**
 * Where the user answers what reaches them through Fishball (7713 N7, N9-a). Shared wording of the
 * contract, like PILE_NOTE: the connector's question tools (packages/connector/src/questions.js)
 * and the instance's persona, session tools, question tools and question notice
 * (packages/instance/src/persona.js, src/slim/child/session-tools.js, src/slim/child/approvals.js)
 * all read these words, the instance through `fishball-connector/contract` only (design §0.2), so
 * they cannot drift apart. The child snapshot gets them with the copied contract directory.
 * - sessionQuestion: the answer place, as a clause.
 * - promise: the rule for a place named before the question arrives.
 * - sessionAsks: both as one line for a tool that hands work to a session (message_session,
 *   start_session). 7713 N9-a: on the first question after a child restart, Fishball still
 *   promised "a card in this chat (also in your pile)" before any tool result; the persona line
 *   alone was not enough, so the rule also sits where it makes that promise.
 */
export const ANSWER_PLACE = Object.freeze({
  sessionQuestion: SESSION_QUESTION,
  promise: PROMISE,
  sessionAsks: `If that session asks the user a question or a plan review, ${SESSION_QUESTION}. ${PROMISE}`,
})
