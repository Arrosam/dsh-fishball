/**
 * The tools embed-UI declares through the connector's contribution service, with the connector's
 * handlers (R-EXT-13 amended by 1.34: "embed-UI only declares them; their handlers and their
 * state are the connector's"; R-FN-01, Q-N1; design §13.6).
 *
 * Embed-UI registers them from its own context (`dshConnectorTools.register` traces the caller),
 * so they carry its namespace and live exactly as long as its contribution: without embed-UI
 * there is no notify tool (Q-N3 = A). This module only builds the definitions; their `execute`
 * reaches the UI state, which C-EXT calls only after its own checks (name, size, input schema,
 * in-flight bound; design §13.5).
 */
import { CALL_CODE, SCHEMA_SUBSET } from '../../tools/index.js'
import { NOTIFY, UI_CODE, UI_TOOL } from './constants.js'

const TYPE = SCHEMA_SUBSET.type
const ACCEPTED = Object.freeze({ ok: true, data: Object.freeze({ accepted: true }) })
const refused = (code) => Object.freeze({ ok: false, code })
/** Unicode code points, as R-FN-01's limit counts them. */
const codePoints = (text) => [...text].length

/** A closed object schema of `properties`, with `required` names. */
const closed = (properties, required = []) => ({ type: TYPE.object, properties, required, additionalProperties: false })
const flag = (description) => ({ type: TYPE.boolean, description })

/**
 * @param state - the UI state (`./state.js`)
 * @returns the three ContributedTool definitions, in a fixed order
 */
export function uiTools(state) {
  return Object.freeze([
    {
      name: UI_TOOL.notify.name,
      title: UI_TOOL.notify.title,
      description: UI_TOOL.notify.description,
      inputSchema: closed({ message: { type: TYPE.string, description: UI_TOOL.notify.message }, important: flag(UI_TOOL.notify.important) }, ['message']),
      codes: [UI_CODE.messageEmpty],
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      // R-FN-01: 1–4000 code points after trimming. The shown message is the trimmed text, plain.
      async execute({ message, important = false }) {
        const text = message.trim()
        if (text.length === 0) return refused(UI_CODE.messageEmpty)
        if (codePoints(text) > NOTIFY.maxChars) return refused(CALL_CODE.limitExceeded)
        state.notify(text, important)
        return ACCEPTED
      },
    },
    {
      name: UI_TOOL.signal.name,
      title: UI_TOOL.signal.title,
      description: UI_TOOL.signal.description,
      inputSchema: closed({ important: flag(UI_TOOL.signal.important) }, ['important']),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      async execute({ important }) {
        state.signal(important)
        return ACCEPTED
      },
    },
    {
      name: UI_TOOL.state.name,
      title: UI_TOOL.state.title,
      description: UI_TOOL.state.description,
      inputSchema: closed({}),
      annotations: { readOnlyHint: true },
      async execute() {
        return { ok: true, data: state.attention() }
      },
    },
  ])
}
