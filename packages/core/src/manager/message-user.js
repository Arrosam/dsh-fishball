/**
 * Fishball's one way to speak to the user (the user, 2026-11-21): on the Fishball page every
 * ordinary assistant reply, its reasoning and its tool rows are folded away, and only the messages
 * Fishball sends with this tool stay in view (fishball-page's client draws each call's `message`
 * as Fishball's bubble). The tool itself does nothing but acknowledge: the call, recorded in the
 * session like any tool call, is the message; nothing is stored or sent anywhere else.
 *
 * Registered only into the scope the caller passes (the manager's own agent scope, through X2), never
 * globally, so no other agent gets it.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MESSAGE_TOOL } from './message-tools.js'

export { MESSAGE_TOOL } from './message-tools.js'

/**
 * The tool's argument, its model-facing words and its result values. The model reads the result,
 * so a message the page would not draw (blank after trimming; the page applies the same rule) is
 * reported back as not shown rather than silently dropped.
 */
const MESSAGE = Object.freeze({
  argument: 'message',
  description: 'Send a message to the user. This is the only way the user sees what you say: your ordinary replies, reasoning and other tool calls are hidden from them. The message is shown in this chat as your message, rendered as Markdown. Put everything the user needs in it, in their language.',
  argumentDescription: 'The whole message for the user, as Markdown. It must not be blank.',
  emptyCode: 'message-empty',
  jsonIndent: 2,
  blockType: 'text',
})

const RESULT = Object.freeze({
  shown: Object.freeze({ shown: true }),
  empty: Object.freeze({ shown: false, code: MESSAGE.emptyCode }),
})

/** The tool's DSH definition (dsh-tools `defineTool`, as the reminder tools are defined). */
function messageToolDefinition() {
  return defineTool({
    name: MESSAGE_TOOL.send,
    description: MESSAGE.description,
    parameters: { [MESSAGE.argument]: { type: 'string', required: true, description: MESSAGE.argumentDescription } },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: MESSAGE.blockType, text: JSON.stringify(value, null, MESSAGE.jsonIndent) }],
    },
    async execute(args) {
      return args[MESSAGE.argument].trim() === '' ? RESULT.empty : RESULT.shown
    },
  })
}

/**
 * Register the tool into one scope's DSH `tools` service (the manager's agent scope).
 * @param {{register(definition: object): () => void}} tools - the scope's tools service.
 * @returns {() => void} removes the tool; the X2 fiber also removes it when it is disposed.
 */
export function registerMessageTools(tools) {
  return tools.register(messageToolDefinition())
}
