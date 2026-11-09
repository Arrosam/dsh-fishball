import { randomUUID } from 'node:crypto'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { ERROR, NOTIFY, PLUGIN, TEXT, TOOL } from './constants.js'

export class NotifyError extends HarnessError {
  constructor(code) {
    super(code, code)
    this.name = ERROR.name
  }
}

function noticeInput(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)
    || Object.keys(args).some((key) => !TOOL.argumentKeys.includes(key))
    || typeof args.message !== 'string'
    || (Object.hasOwn(args, 'important') && typeof args.important !== 'boolean')) {
    throw new NotifyError(ERROR.invalid)
  }
  const text = args.message.trim()
  if (!text) throw new NotifyError(ERROR.empty)
  if ([...text].length > NOTIFY.maxChars) throw new NotifyError(ERROR.tooLong)
  return { text, important: args.important ?? false }
}

/** X0-C owns the real agent fiber, including teardown on disable and setup on resume. */
export function registerNotify(manager, agentCtx, agent, attention) {
  let active = true
  // Cordis 4 has no 'dispose' event on either SDK; a fiber effect runs on X2 disposal.
  agentCtx.effect(() => () => { active = false })
  agentCtx.systemPrompt.section({
    name: TOOL.sectionName, order: TOOL.sectionOrder, text: TEXT.section,
  })
  // A raw host ToolDefinition preserves the closed root and feature-specific
  // refusal codes; defineTool's argument wrapper would replace those errors.
  agentCtx.tools.register({
    name: TOOL.name,
    description: TEXT.description,
    parameters: {
      type: 'object', additionalProperties: false, required: ['message'],
      properties: {
        message: { type: 'string', description: TEXT.message },
        important: { type: 'boolean', default: false, description: TEXT.important },
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false, required: ['notified', 'id', 'important'],
        properties: {
          notified: { type: 'boolean', const: true },
          id: { type: 'string' }, important: { type: 'boolean' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.important ? TEXT.shownImportant : TEXT.shown }],
    },
    async execute(args, exec) {
      if (!active) throw new NotifyError(ERROR.unavailable)
      const sessionId = manager.sessionId()
      if (!sessionId || !exec?.agent || exec.agent.id !== sessionId || agent.id !== sessionId) {
        throw new NotifyError(ERROR.wrongSession)
      }
      const { text, important } = noticeInput(args)
      const id = randomUUID()
      try {
        // Log-only: never enqueue an inbox message or conclude the manager turn.
        // Rendering consumes this record; unread belongs only to the connector.
        appendPluginRecord(agent.session, TOOL.recordType, {
          v: TOOL.recordVersion, id, text, important, at: Date.now(), callId: exec.callId,
        })
      } catch {
        throw new NotifyError(ERROR.unavailable)
      }
      // Attention is optional and best-effort; a disconnected connector must not
      // turn an already appended notice into a failed/retryable tool result.
      try { await attention?.signal(PLUGIN.name, { important }) } catch { /* no replay */ }
      return { notified: true, id, important }
    },
  })
}

/** Registers into one compatible instance; the caller owns the returned dispose. */
export function registerManagerNotify(instance) {
  const { manager } = instance
  return manager.registerSetup(PLUGIN.name, (agentCtx, agent) => registerNotify(manager, agentCtx, agent, instance.attention))
}
