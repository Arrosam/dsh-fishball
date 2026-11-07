/**
 * Card records in Fishball's custom chat (I7, design §0.5 "Records", §18.2 I7).
 *
 * A card record (`plugin:fishball/card-record`, v1, contract card-record.js) is projected by the
 * child's chat (src/slim/child/chat.js, ENTRY_KIND.record) and drawn here as one collapsed row
 * that expands to the card's details. The connector draws the same record in a managed session's
 * view (packages/connector/client.records.js), but that module is a React component loaded by
 * DSH's client module loader, and this page has neither (§0.9 U6). What the two share is the
 * record schema and the words: the page's dictionaries (ui/i18n.js) repeat the connector's
 * `record.*` entries key for key in both languages, and the row shows the same fields in the same
 * order. Keep both in step; a test compares the two dictionaries.
 *
 * One difference is deliberate: the collapsed line also names the asking session (§18.2 I7 R1,
 * "the asking session's title"), because every record in Fishball's chat comes from another
 * session, while the connector's row lives in that session itself and names it only expanded.
 *
 * Fishball's own decision labels (approvals.js) are left as they are: a label and a record for
 * the same card may both show (§0.9 U5).
 *
 * All text is textContent, never markup: record texts come from other sessions. Classes are the
 * only styling hook (the page's CSP admits no inline style).
 */

import { DEFAULT_I18N } from './i18n.js'

/**
 * The record vocabulary the row reads (contract CARD_RECORD), the connector row's joiners and the
 * dictionary keys. The page imports nothing from the contract: it is a separately served no-build
 * page (§3.1), so CARD_RECORD's one value used here is repeated.
 */
const RECORD = Object.freeze({
  permission: 'permission',
  separator: ' · ',
  labelSeparator: ': ',
  whoSeparator: ' ',
  key: Object.freeze({
    own: 'record.own', kind: 'record.', by: 'record.by.', place: 'record.place.', outcome: 'record.outcome.',
    from: 'record.from', tool: 'record.tool', arguments: 'record.arguments', reason: 'record.reason',
    answer: 'record.answer', note: 'record.note', closed: 'record.closed',
  }),
})

const CLASS = Object.freeze({
  details: 'record',
  summary: 'record-summary',
  title: 'record-title',
  line: 'record-line',
  body: 'record-body',
  detail: 'record-detail',
  label: 'record-label',
  muted: 'record-muted',
  // The call's arguments are drawn like a tool row's arguments, DSH's code block.
  arguments: 'tool-arguments',
})

const ARIA = Object.freeze({ label: 'aria-label' })

const textOf = (value) => (typeof value === 'string' ? value : '')

function node(document, tag, className, value) {
  const element = document.createElement(tag)
  if (className !== undefined) element.className = className
  if (value !== undefined) element.textContent = value
  return element
}

/** The asking session as the row names it: its title, else its id; '' when the copy names none. */
function fromOf(record) {
  const from = record.from
  return from !== null && typeof from === 'object' ? textOf(from.title) || textOf(from.sessionId) : ''
}

/**
 * The collapsed line, the connector row's fields in its order, plus the asking session before the
 * time: the subject (the tool, or the first question's header or text), the outcome with the
 * answer, who and where (a closure names no one), the asking session, the time.
 */
function lineOf(record, questions, t, locale) {
  const first = questions[0]
  const answer = textOf(record.answer)
  const who = record.by === undefined ? '' : [t(RECORD.key.by + record.by), ...(record.place === undefined ? [] : [t(RECORD.key.place + record.place)])].join(RECORD.whoSeparator)
  const at = new Date(record.at)
  return [
    record.kind === RECORD.permission ? textOf(record.tool) : textOf(first?.header) || textOf(first?.question),
    t(RECORD.key.outcome + record.outcome) + (answer === '' ? '' : RECORD.labelSeparator + answer),
    who,
    fromOf(record),
    Number.isFinite(at.getTime()) ? at.toLocaleString(locale) : '',
  ].filter(Boolean).join(RECORD.separator)
}

/** One question with its options, as the connector's expanded row shows it. */
function questionNode(document, item) {
  const header = textOf(item.header)
  const question = node(document, 'div', CLASS.detail, header === '' ? textOf(item.question) : header + RECORD.labelSeparator + textOf(item.question))
  const options = Array.isArray(item.options) ? item.options.filter((option) => typeof option === 'string') : []
  if (options.length === 0) return question
  const block = node(document, 'div')
  block.append(question, node(document, 'div', CLASS.muted, options.join(RECORD.separator)))
  return block
}

/**
 * Build one record row's content: a collapsed summary that expands to the asking session, the
 * questions with their options or the call, the reason, the answer, the note and why it closed.
 *
 * @param {Document} document - the page's document.
 * @param {object} record - the record data, v1 (contract card-record.js); its texts are already
 *   cut to the contract's caps by the writer.
 * @param {object} [i18n] - the page's words (ui/i18n.js createI18n); English by default.
 * @returns {HTMLDetailsElement} the row content the chat view appends to its timeline row.
 */
export function createRecordRow(document, record, i18n = DEFAULT_I18N) {
  // A key this version does not know (a future kind or outcome) shows nothing rather than a key.
  const t = (key) => i18n.t(key) ?? ''
  const questions = Array.isArray(record.questions) ? record.questions.filter((item) => item !== null && typeof item === 'object') : []
  /** The connector's "Label: text" line; an empty text means the field is absent. */
  const labelled = (key, value) => {
    if (value === '') return null
    const line = node(document, 'div', CLASS.detail)
    line.append(node(document, 'span', CLASS.label, t(key) + RECORD.labelSeparator), value)
    return line
  }
  const argumentsText = textOf(record.arguments)
  let argumentsNode = null
  if (argumentsText !== '') {
    argumentsNode = node(document, 'pre', CLASS.arguments, argumentsText)
    argumentsNode.setAttribute(ARIA.label, t(RECORD.key.arguments))
  }

  const details = node(document, 'details', CLASS.details)
  details.dataset.fishballCardRecord = textOf(record.cardId)
  details.dataset.recordKind = textOf(record.kind)
  const summary = node(document, 'summary', CLASS.summary)
  const line = lineOf(record, questions, t, i18n.locale)
  summary.append(
    node(document, 'span', CLASS.title, record.own === true ? t(RECORD.key.own) : t(RECORD.key.kind + record.kind)),
    node(document, 'span', CLASS.line, line === '' ? '' : RECORD.separator + line),
  )
  const body = node(document, 'div', CLASS.body)
  body.append(...[
    labelled(RECORD.key.from, fromOf(record)),
    ...questions.map((item) => questionNode(document, item)),
    labelled(RECORD.key.tool, textOf(record.tool)),
    argumentsNode,
    labelled(RECORD.key.reason, textOf(record.reason)),
    labelled(RECORD.key.answer, textOf(record.answer)),
    labelled(RECORD.key.note, textOf(record.note)),
    labelled(RECORD.key.closed, textOf(record.closed)),
  ].filter((item) => item !== null))
  details.append(summary, body)
  return details
}
