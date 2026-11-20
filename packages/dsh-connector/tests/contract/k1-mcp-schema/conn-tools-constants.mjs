/** CONN-TOOLS user decision (2026-11-18), not inferred from the implementation. */
import { CORE_TOOLS } from './constants.mjs'

export const CONN_TOOLS = Object.freeze({
  removed: Object.freeze(['question_ask', 'question_answer_own']),
  retained: CORE_TOOLS,
  answer: 'question_answer',
  events: Object.freeze(['question', 'plan-review']),
  settlement: 'settlement',
})

/** Contract fixtures: ordinary questions, a plan review, and generic settlement answer batches. */
export const CONN_FIXTURE = Object.freeze({
  unpairedId: 'conn-tools-unpaired',
  sessionId: 'conn-tools-session',
  questionId: 'conn-tools-question',
  offerId: 'conn-tools-question.r1',
  question: Object.freeze({ id: 'choice', question: 'Choose a color', options: Object.freeze([{ label: 'Blue', description: 'A color' }]), multiSelect: false }),
  plan: Object.freeze({ id: 'plan', question: 'Review this plan', options: Object.freeze([{ label: 'Approve' }]), intent: Object.freeze({ kind: 'plan-review', approve: 'Approve', callId: 'conn-tools-call' }) }),
  answers: Object.freeze([{ id: 'choice', selected: ['Blue'] }, { id: 'detail', selected: [], custom: 'Keep the question flow' }]),
  descriptor: Object.freeze({
    approvalId: 'conn-tools-question', offerId: 'conn-tools-question.r1', kind: 'question', prompt: 'Question', choices: ['Blue'],
    title: 'CONN-TOOLS', at: 0, toolName: 'ask_user_question', callId: null, reason: '', quotes: [],
  }),
  settlement: Object.freeze({ approvalId: 'conn-tools-question', outcome: 'answered', by: 'principal' }),
})
