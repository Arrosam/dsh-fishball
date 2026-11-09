export const NAMESPACE = 'fishball-board'

export const STATUS = Object.freeze({
  todo: 'todo',
  inProgress: 'in_progress',
  waiting: 'waiting',
  paused: 'paused',
  done: 'done',
  dropped: 'dropped',
})

const OPEN_STATUSES = Object.freeze([STATUS.todo, STATUS.inProgress, STATUS.waiting, STATUS.paused])
const ALL_STATUSES = Object.freeze(Object.values(STATUS))

// Equality permits note/link edits. B2 owns transition validation, using this table.
export const TRANSITIONS = Object.freeze({
  new: OPEN_STATUSES,
  ...Object.fromEntries(OPEN_STATUSES.map(status => [status, ALL_STATUSES])),
  [STATUS.done]: Object.freeze([STATUS.todo, STATUS.inProgress, STATUS.done]),
  [STATUS.dropped]: Object.freeze([STATUS.todo, STATUS.dropped]),
})

export const BOARD_LIMITS = Object.freeze({
  titleChars: 120,
  noteChars: 500,
  contextNoteChars: 80,
  cards: 300,
  links: 8,
  contextChars: 2000,
  guideChars: 900,
  // U19: a projection window for closed cards, never an archive deletion age.
  visibilityDays: 30,
  search: Object.freeze({
    queryMinChars: 1,
    queryMaxChars: 200,
    limitMin: 1,
    limitMax: 50,
    limitDefault: 20,
  }),
})

export const RELATION = Object.freeze({
  about: 'about',
  source: 'source',
  blocks: 'blocks',
})

export const REFUSAL = Object.freeze({
  boardUnavailable: 'board-unavailable',
  invalidInput: 'invalid-input',
  cardMissing: 'card-missing',
  unknownCard: 'unknown-card',
  badTransition: 'bad-transition',
  duplicateTitle: 'duplicate-title',
  waitingTarget: 'waiting-target',
  linkInvalid: 'link-invalid',
  boardFull: 'board-full',
  notManager: 'not-manager',
  notClosed: 'not-closed',
})

export const CONTEXT_ORDER = Object.freeze({ guide: 10210, board: 300 })

export const LOG = Object.freeze({ instanceHooksMissing: 'instance-hooks-missing' })
