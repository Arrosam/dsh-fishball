/**
 * How Fishball words the line it writes on a card in your pile (rev11-pile-list, §10e: the user
 * asked for a conversational line saying what needs them and why). The persona and every note
 * parameter that reaches the pile read this one text, so the guidance cannot drift apart.
 *
 * It lives in its own module so the slim child can copy the persona's one text dependency
 * without the main profile's full constant set (src/native-runtime/installation.js).
 */
export const PILE_NOTE = Object.freeze({ guide: 'one conversational sentence to the user saying what they need to decide and why it needs them' })
