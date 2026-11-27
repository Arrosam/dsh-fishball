/**
 * How core's own model tools render a JSON result for the model: one text block with the value as
 * indented JSON. Shared by the ask filing tool (asks/index.js), the reminder tools (manager/
 * reminders.js), the private Skills tools (manager/skills.js) and message_user (manager/
 * message-user.js), which all return a JSON value. No import, so any of them loads it.
 */
const JSON_TEXT = Object.freeze({ blockType: 'text', indent: 2 })

/**
 * A DSH tool definition's `output.render` (dsh-tools, both SDKs): `(args, value) → ContentBlock[]`.
 * @param {unknown} _args - the call's arguments; the rendering does not depend on them.
 * @param {unknown} value - the tool's JSON result.
 * @returns {{type: string, text: string}[]} the one text block.
 */
export const renderJson = (_args, value) => [{ type: JSON_TEXT.blockType, text: JSON.stringify(value, null, JSON_TEXT.indent) }]
