export const FORM = Object.freeze({
  ask: 'ask_user', legacy: 'ask_user_question', program: 'run_code',
  answer: '/api/fishball/asks/answer',
  origin: 'https://fishball.test',
  kind: 'question', open: 'open', slot: 'conversation.input.dock',
  first: {
    id: 'branch', header: 'Release target', question: 'Which branch should receive the build?',
    options: [{ label: 'Preview', description: 'Build for review' }, { label: 'Stable' }],
  },
  second: {
    id: 'checks', question: 'Which checks should run?', multi_select: true,
    options: [{ label: 'Lint' }, { label: 'Smoke tests' }],
  },
  free: { id: 'branch', question: 'What name should appear on the report?' },
  text: 'Nightly report',
  sessionId: 'fishball-manager-fixture',
  otherSessionId: 'ordinary-session-fixture',
  cardA: 'release-card', cardB: 'report-card',
})

export const batch = [FORM.first, FORM.second]
export const freeBatch = [FORM.free]
export const batchAnswers = [
  { id: FORM.first.id, selected: [FORM.first.options[0].label] },
  { id: FORM.second.id, selected: FORM.second.options.map(({ label }) => label) },
]
export const freeAnswers = [{ id: FORM.free.id, selected: [], custom: FORM.text }]
