/**
 * The task board guide (docs/plugins/fishball-taskboard.md §3a): a section of the manager's system
 * prompt that requires Fishball to keep the board current. The user asked for it (2026-11-22)
 * because Fishball often forgot to add or update tasks; the tool descriptions alone say what the
 * tools do, not when to call them.
 */
import { GUIDE, STATUS, TOOL } from './constants.js'

export const GUIDE_TEXT = [
  '**Task board.** Keep your task board up to date.',
  `- When the user gives you a new task, add it with ${TOOL.add} right away. Break multi-part work into subtasks.`,
  `- Whenever a task or subtask makes progress or finishes, update its status and progress with ${TOOL.update} right away, in the same turn.`,
  '- When a session you manage finishes work, update the matching task before or together with reporting to the user.',
  `- Never leave finished work in ${STATUS.todo} or ${STATUS.inProgress}.`,
].join('\n')

/**
 * Register the guide in one agent's prompt scope; X2 disposal removes it with the tools.
 * @param agentCtx - the manager agent's context (X2's first argument).
 */
export function registerGuide(agentCtx) {
  const prompt = agentCtx.systemPrompt
  prompt.section({ name: GUIDE.sectionName, order: prompt.getSectionOrder(GUIDE.anchor) + GUIDE.offset, text: GUIDE_TEXT })
}
