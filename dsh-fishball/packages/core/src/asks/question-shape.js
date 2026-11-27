/** The native ask-user vocabulary, with Fishball's own non-blocking lifecycle. */
import { QUESTION_CARD } from './constants.js'

const string = { type: 'string' }
const arrayOf = (items, bounds = {}) => ({ type: 'array', items, ...bounds })
const objectOf = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false })
const option = objectOf({ label: string, description: string }, ['label'])
const question = objectOf({
  id: string, header: string, question: string, options: arrayOf(option), multi_select: { type: 'boolean' },
}, ['id', 'question'])

export const QUESTION_PARAMETERS = objectOf({ questions: arrayOf(question, { minItems: 1 }) }, ['questions'])

const isString = (value) => typeof value === 'string'
const nonBlank = (value) => isString(value) && value.trim() !== ''
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const optional = (value, valid) => value === undefined || valid(value)
const isBoolean = (value) => typeof value === 'boolean'
const unique = (values) => new Set(values).size === values.length

function validOptions(options) {
  return Array.isArray(options) && options.every((item) => isRecord(item) && nonBlank(item.label) && optional(item.description, isString))
    && unique(options.map(({ label }) => label))
}

export function questionsOf(questions) {
  if (!Array.isArray(questions) || questions.length === 0 || !questions.every((item) => isRecord(item)
    && nonBlank(item.id) && nonBlank(item.question) && optional(item.header, isString)
    && optional(item.options, validOptions) && optional(item.multi_select, isBoolean))) return undefined
  if (!unique(questions.map(({ id }) => id))) return undefined
  return questions.map(({ id, header, question, options, multi_select }) => ({
    id, question,
    ...(header === undefined ? {} : { header }),
    ...(options === undefined ? {} : { options: options.map(({ label, description }) => ({ label, ...(description === undefined ? {} : { description }) })) }),
    ...(multi_select === undefined ? {} : { multi_select }),
  }))
}

/** Submit one item per question, in any order. An empty item is a skip, not permission. */
export function answersOf(questions, answers) {
  if (!Array.isArray(answers) || answers.length !== questions.length || !answers.every((item) => isRecord(item)
    && isString(item.id) && Array.isArray(item.selected) && item.selected.every(isString)
    && unique(item.selected) && optional(item.custom, isString))) return undefined
  const byId = new Map(answers.map((item) => [item.id, item]))
  const checked = []
  for (const { id, options, multi_select } of questions) {
    const answer = byId.get(id)
    if (answer === undefined) return undefined
    const { selected } = answer
    const custom = answer.custom?.trim()
    if (multi_select !== true && selected.length + (custom ? 1 : 0) > 1) return undefined
    if (selected.some((label) => !options?.some((option) => option.label === label))) return undefined
    checked.push({ id, selected: [...selected], ...(custom ? { custom } : {}) })
  }
  return checked
}

export const questionSchema = Object.freeze({
  parse(value) {
    if (!isRecord(value) || !nonBlank(value.cardId) || !nonBlank(value.sessionId)) throw new TypeError(QUESTION_CARD.malformed)
    if (value.settled === true && value.reply === undefined) return value
    if (!Number.isSafeInteger(value.askedAt) || questionsOf(value.questions) === undefined
      || !optional(value.reply, (reply) => isRecord(reply) && nonBlank(reply.messageId) && answersOf(value.questions, reply.answers) !== undefined)
      || !optional(value.settled, (settled) => settled === true && value.reply !== undefined)) throw new TypeError(QUESTION_CARD.malformed)
    return value
  },
})
