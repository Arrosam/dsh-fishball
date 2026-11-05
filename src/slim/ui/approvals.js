/**
 * T09's approvals in Fishball's chat (T07 renders them; §8.1, §15 T09).
 *
 * The child's approval bridge owns the state (src/slim/child/approvals.js): live cards from
 * managed sessions, Fishball's own questions, settled decision labels, and the user's answers
 * to questions Fishball sent them. This view owns placement and rendering only:
 * - a live card is one compact, expandable pending row; Fishball decides it with its tools, so
 *   the row is a view, not a decision form;
 * - a settled decision is one inline label that expands to the request card and Fishball's
 *   answer. Consecutive labels (no chat message between them) merge into one group row, so a
 *   burst of decisions does not bury the conversation;
 * - Fishball's own question is the one card the user answers here (T09's answerOwnQuestion);
 *   it renders DSH's options, multi-select and plan-review intent, and posts an exact body;
 * - an answer the user gave to a question Fishball sent them becomes a timeline row;
 * - a card the host closed without the user's answer becomes one "closed: <reason>" row, and the
 *   decision label it left stops saying it is waiting. No card is dropped silently, and none has
 *   a deadline (src/card-lifecycle.js).
 *
 * The view re-reads `api/approvals` on mount, after a reconnect and on the `approvals` SSE
 * event; the payload is only a snapshot, so it can never drift. A re-read with identical data
 * leaves the DOM untouched, which is what keeps a half-typed question answer alive.
 *
 * All text is textContent, never markup; classes are the only styling hook (the §3.3 CSP
 * admits no inline style).
 */
/** Same child resources the server serves under /fishball/embed; the broker strips its prefix. */
const API = Object.freeze({ page: 'api/approvals', answer: 'api/approvals/answer', media: 'application/json' })

/** The SSE event the shell forwards to refresh(); shared with the child's APPROVALS. */
export const APPROVALS_EVENT = 'approvals'

const CLASS = Object.freeze({
  entry: 'entry',
  card: 'entry-card',
  label: 'entry-decision',
  question: 'entry-question',
  answer: 'entry-answer',
  closed: 'entry-closed',
  pending: 'is-pending',
  details: 'decision',
  summary: 'decision-summary',
  kind: 'decision-kind',
  status: 'decision-status',
  body: 'decision-body',
  detail: 'decision-detail',
  quote: 'decision-quote',
  choices: 'decision-choices',
  choice: 'decision-choice',
  questions: 'decision-questions',
  questionBlock: 'decision-question',
  questionText: 'decision-question-text',
  options: 'decision-options',
  option: 'decision-option',
  custom: 'decision-custom',
  actions: 'decision-actions',
  note: 'decision-note',
  error: 'decision-error',
  text: 'entry-text',
})

const COPY = Object.freeze({
  cardNote: 'Fishball decides this request with its own tools. This row is the view of the live card.',
  question: 'Fishball is waiting for your answer',
  tool: 'Tool',
  prompt: 'Prompt',
  reason: 'Reason',
  answer: 'Fishball answered',
  outcome: 'Outcome',
  settled: 'You decided',
  merged: (count) => 'Fishball made ' + String(count) + ' decisions',
  single: (kind, title, decision) => kind + (title === '' ? '' : ' · ' + title) + (decision === '' ? '' : ' · ' + decision),
  expires: (minutes) => 'expires in ' + String(minutes) + ' min',
  expiring: 'expiring',
  waiting: 'waiting',
  custom: 'Your own answer',
  submit: 'Answer',
  approvePlan: 'Approve plan',
  keepPlanning: 'Keep planning',
  feedback: 'Feedback for the plan',
  answered: (text) => 'The user answered: ' + text,
  closed: 'closed',
  closedReason: (reason) => 'Card closed before you answered: ' + String(reason),
  failed: 'The answer was refused.',
  noOption: 'No options',
})

const KIND_TEXT = Object.freeze({
  approval: 'Permission request',
  grant: 'Standing grant',
  question: 'Question',
  escalation: 'Escalation',
  'plan-review': 'Plan review',
})

/** The decision words a label's outcome and a user's settlement can carry. */
const DECISION_TEXT = Object.freeze({
  allow: 'allowed once', grant: 'allowed and granted', reject: 'rejected', ask: 'asked a question',
  escalate: 'escalated to you',
})

/** DSH's plan-review intent marker on one question. */
const PLAN_REVIEW = Object.freeze({ kind: 'plan-review' })
/** The child answer route's action selector for Fishball's own question (T09's API). */
const ACTION = Object.freeze({ own: 'own' })
const METHOD = Object.freeze({ post: 'POST' })
const ROW = Object.freeze({ marker: 'data-approval-row' })
/** Card kinds: only a question card carries questions; every other kind is a permission request. */
const CARD_KIND = Object.freeze({ question: 'question' })
/** A settled label's outcome words for the outcome flags T09 records. */
const OUTCOME_TEXT = Object.freeze({ revoked: 'grant revoked', toUser: 'sent to you', answered: 'answered', waiting: 'waiting' })

const MS_PER_MINUTE = 60_000
const text = (value) => (typeof value === 'string' ? value : '')
const minutesUntil = (expiresAt) => {
  if (!Number.isFinite(expiresAt)) return undefined
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / MS_PER_MINUTE))
}

/** One request's shared detail block (card and label expansion). */
function requestDetails(document, request, { includeQuestions }) {
  const fragment = document.createDocumentFragment()
  const tool = text(request?.toolName)
  if (tool !== '') {
    const line = document.createElement('p')
    line.className = CLASS.detail
    line.textContent = COPY.tool + ': ' + tool
    fragment.append(line)
  }
  const prompt = text(request?.prompt)
  if (prompt !== '') {
    const line = document.createElement('p')
    line.className = CLASS.detail
    line.textContent = COPY.prompt + ': ' + prompt
    fragment.append(line)
  }
  const reason = text(request?.reason)
  if (reason !== '') {
    const line = document.createElement('p')
    line.className = CLASS.detail
    line.textContent = COPY.reason + ': ' + reason
    fragment.append(line)
  }
  const quotes = Array.isArray(request?.quotes) ? request.quotes : []
  for (const quote of quotes) {
    if (typeof quote !== 'string' || quote === '') continue
    const block = document.createElement('blockquote')
    block.className = CLASS.quote
    block.textContent = quote
    fragment.append(block)
  }
  const choices = Array.isArray(request?.choices) ? request.choices : []
  if (choices.length > 0) {
    const list = document.createElement('ul')
    list.className = CLASS.choices
    for (const choice of choices) {
      if (typeof choice !== 'string' || choice === '') continue
      const item = document.createElement('li')
      item.className = CLASS.choice
      item.textContent = choice
      list.append(item)
    }
    fragment.append(list)
  }
  if (includeQuestions && Array.isArray(request?.questions) && request.questions.length > 0) {
    const list = document.createElement('ul')
    list.className = CLASS.questions
    for (const question of request.questions) {
      const item = document.createElement('li')
      item.className = CLASS.questionBlock
      const promptLine = document.createElement('p')
      promptLine.className = CLASS.questionText
      promptLine.textContent = text(question?.header) !== '' ? text(question.header) + ': ' + text(question.question) : text(question?.question)
      item.append(promptLine)
      const options = Array.isArray(question?.options) ? question.options : []
      if (options.length > 0) {
        const optionList = document.createElement('ul')
        optionList.className = CLASS.options
        for (const option of options) {
          if (typeof option?.label !== 'string' || option.label === '') continue
          const optionItem = document.createElement('li')
          optionItem.className = CLASS.option
          optionItem.textContent = option.label
          optionList.append(optionItem)
        }
        item.append(optionList)
      }
      list.append(item)
    }
    fragment.append(list)
  }
  return fragment
}

/** One settled decision's expansion, shared by a single label and a merged group. */
function labelBlock(document, label) {
  const fragment = document.createDocumentFragment()
  fragment.append(requestDetails(document, label.request ?? {}, { includeQuestions: true }))
  const answer = text(label.answer)
  if (answer !== '') {
    const line = document.createElement('p')
    line.className = CLASS.detail
    line.textContent = COPY.answer + ': ' + answer
    fragment.append(line)
  }
  const outcome = label.outcome ?? {}
  const decision = DECISION_TEXT[outcome.decision] ?? ''
  const status = document.createElement('p')
  status.className = CLASS.status
  status.textContent = COPY.outcome + ': ' + (outcome.revoked === true ? OUTCOME_TEXT.revoked
    : outcome.toUser === true ? OUTCOME_TEXT.toUser
      : outcome.answered === true ? OUTCOME_TEXT.answered
        : decision === '' ? OUTCOME_TEXT.waiting : decision)
  fragment.append(status)
  if (label.settled !== null && label.settled !== undefined) {
    const settled = document.createElement('p')
    settled.className = CLASS.status
    settled.textContent = COPY.settled + ': ' + (DECISION_TEXT[label.settled.decision] ?? text(label.settled.decision))
    fragment.append(settled)
  }
  if (text(label.closed) !== '') {
    const closed = document.createElement('p')
    closed.className = CLASS.status
    closed.textContent = COPY.closed + ': ' + text(label.closed)
    fragment.append(closed)
  }
  return fragment
}

/**
 * The label's one-line summary. A label's kind names the decision; its outcome says what
 * Fishball did, and the session title says where.
 */
function labelSummary(label) {
  const kind = KIND_TEXT[label.kind] ?? KIND_TEXT.approval
  const flags = label.outcome ?? {}
  const outcome = text(label.closed) !== '' ? COPY.closed + ': ' + text(label.closed)
    : flags.revoked === true ? OUTCOME_TEXT.revoked
      : flags.toUser === true ? OUTCOME_TEXT.toUser
        : flags.answered === true ? OUTCOME_TEXT.answered
          : DECISION_TEXT[flags.decision] ?? ''
  return COPY.single(kind, text(label.title) || text(label.sessionId), outcome)
}

/** Group consecutive labels: a chat entry whose time falls between them breaks the run. */
function groupLabels(labels, entryTimes) {
  const groups = []
  let current
  for (const label of labels) {
    if (current === undefined) {
      current = [label]
      groups.push(current)
      continue
    }
    const previous = current[current.length - 1]
    const interrupted = entryTimes.some((at) => at > previous.at && at <= label.at)
    if (interrupted) {
      current = [label]
      groups.push(current)
    } else current.push(label)
  }
  return groups
}

/**
 * Mount the approvals view inside the chat timeline.
 *
 * @param {object} options
 * @param {Document} options.document - the page document.
 * @param {Element} options.timeline - the chat's <ol>; approval rows are its <li> children.
 * @param {(row: Element, at: number) => void} options.insertRow - chronological insertion.
 * @param {(path: string, options?: object) => Promise<object>} options.request - the chat's
 *   JSON request helper (throws on a non-2xx or an unparsable answer).
 * @returns {{ refresh: () => Promise<void>, dispose: () => void }}
 */
export function createApprovalsView(options = {}) {
  const { document, timeline, insertRow, request } = options ?? {}
  if (!document || typeof document.createElement !== 'function') throw new TypeError('fishball approvals: a document is required')
  if (!timeline || typeof timeline.appendChild !== 'function') throw new TypeError('fishball approvals: a timeline is required')
  if (typeof insertRow !== 'function' || typeof request !== 'function') {
    throw new TypeError('fishball approvals: insertRow and request are required')
  }
  let signature
  let generation = 0
  let disposed = false

  function row(kind, at) {
    const element = document.createElement('li')
    element.className = CLASS.entry + ' ' + kind
    element.dataset.approvalRow = 'true'
    element.dataset.at = String(Number.isFinite(at) ? at : Date.now())
    return element
  }

  function summaryRow(element, title, status) {
    const details = document.createElement('details')
    details.className = CLASS.details
    const summary = document.createElement('summary')
    summary.className = CLASS.summary
    const label = document.createElement('span')
    label.className = CLASS.kind
    label.textContent = title
    summary.append(label)
    if (status !== '') {
      const state = document.createElement('span')
      state.className = CLASS.status
      state.textContent = status
      summary.append(state)
    }
    details.append(summary)
    element.append(details)
    return details
  }

  function buildCard(card) {
    const at = Number.isFinite(card?.at) ? card.at : Date.now()
    const element = row(CLASS.card + ' ' + CLASS.pending, at)
    const kind = card.kind === CARD_KIND.question ? KIND_TEXT.question : KIND_TEXT.approval
    const title = text(card.title) || text(card.sessionId)
    const minutes = minutesUntil(card.expiresAt)
    const details = summaryRow(element, kind + (title === '' ? '' : ' · ' + title),
      minutes === undefined ? COPY.waiting : minutes <= 0 ? COPY.expiring : COPY.expires(minutes))
    const body = document.createElement('div')
    body.className = CLASS.body
    body.append(requestDetails(document, card, { includeQuestions: true }))
    const note = document.createElement('p')
    note.className = CLASS.note
    note.textContent = COPY.cardNote
    body.append(note)
    details.append(body)
    return element
  }

  function buildLabelGroup(labels) {
    const at = Number.isFinite(labels[0]?.at) ? labels[0].at : Date.now()
    const element = row(CLASS.label, at)
    const title = labels.length === 1 ? labelSummary(labels[0]) : COPY.merged(labels.length)
    const details = summaryRow(element, title, '')
    const body = document.createElement('div')
    body.className = CLASS.body
    for (const label of labels) {
      if (labels.length > 1) {
        const heading = document.createElement('p')
        heading.className = CLASS.kind
        heading.textContent = labelSummary(label)
        body.append(heading)
      }
      body.append(labelBlock(document, label))
    }
    details.append(body)
    return element
  }

  /** One own-question form. Plan reviews get approve/keep-planning; questions get DSH options. */
  function buildQuestion(entry) {
    const at = Number.isFinite(entry?.at) ? entry.at : Date.now()
    const element = row(CLASS.question + ' ' + CLASS.pending, at)
    const details = summaryRow(element, COPY.question, COPY.waiting)
    details.open = true
    const body = document.createElement('div')
    body.className = CLASS.body
    const inputs = []
    const customs = []
    const questions = Array.isArray(entry.questions) ? entry.questions : []
    const planReview = questions.length === 1 && questions[0]?.intent?.kind === PLAN_REVIEW.kind
    for (const question of questions) {
      const fieldset = document.createElement('fieldset')
      fieldset.className = CLASS.questionBlock
      fieldset.dataset.questionId = text(question.id)
      const legend = document.createElement('legend')
      legend.textContent = text(question.header) !== '' ? text(question.header) : text(question.question)
      fieldset.append(legend)
      if (text(question.question) !== '' && text(question.header) !== '') {
        const detail = document.createElement('p')
        detail.className = CLASS.detail
        detail.textContent = text(question.question)
        fieldset.append(detail)
      }
      if (text(question.detail) !== '') {
        const detail = document.createElement('p')
        detail.className = CLASS.detail
        detail.textContent = text(question.detail)
        fieldset.append(detail)
      }
      if (!planReview) {
        const options = Array.isArray(question.options) ? question.options : []
        const list = document.createElement('div')
        list.className = CLASS.options
        const type = question.multiSelect === true ? 'checkbox' : 'radio'
        for (const option of options) {
          if (typeof option?.label !== 'string' || option.label === '') continue
          const label = document.createElement('label')
          label.className = CLASS.option
          const input = document.createElement('input')
          input.type = type
          input.name = 'question-' + text(question.id)
          input.value = option.label
          label.append(input, ' ' + option.label + (text(option.description) === '' ? '' : ' — ' + option.description))
          list.append(label)
          inputs.push({ questionId: text(question.id), input })
        }
        if (options.length === 0) {
          const none = document.createElement('p')
          none.className = CLASS.note
          none.textContent = COPY.noOption
          list.append(none)
        }
        fieldset.append(list)
        const custom = document.createElement('input')
        custom.type = 'text'
        custom.className = CLASS.custom
        custom.placeholder = COPY.custom
        custom.dataset.questionId = text(question.id)
        customs.push({ questionId: text(question.id), input: custom })
        fieldset.append(custom)
      } else {
        const feedback = document.createElement('input')
        feedback.type = 'text'
        feedback.className = CLASS.custom
        feedback.placeholder = COPY.feedback
        feedback.dataset.planFeedback = 'true'
        fieldset.append(feedback)
      }
      body.append(fieldset)
    }
    const actions = document.createElement('div')
    actions.className = CLASS.actions
    const error = document.createElement('p')
    error.className = CLASS.error
    error.hidden = true
    error.setAttribute('role', 'alert')

    const submit = async (payload, button) => {
      button.disabled = true
      error.hidden = true
      try {
        const answer = await request(API.answer, { method: METHOD.post, body: JSON.stringify({ action: ACTION.own, questionId: entry.questionId, ...payload }) })
        // The route answers 200 with a typed refusal; a refusal keeps the form for another try.
        if (answer?.ok !== true) {
          error.textContent = typeof answer?.code === 'string' ? answer.code : COPY.failed
          error.hidden = false
          return
        }
        signature = undefined
        await refresh()
      } catch (failure) {
        error.textContent = (failure instanceof Error && failure.message !== '' ? failure.message : COPY.failed)
        error.hidden = false
      } finally {
        button.disabled = false
      }
    }

    if (planReview) {
      const feedback = body.querySelector('[data-plan-feedback="true"]')
      const approve = document.createElement('button')
      approve.type = 'button'
      approve.textContent = COPY.approvePlan
      approve.addEventListener('click', () => void submit({ approve: true }, approve))
      const keep = document.createElement('button')
      keep.type = 'button'
      keep.textContent = COPY.keepPlanning
      keep.addEventListener('click', () => {
        const words = text(feedback?.value).trim()
        void submit({ approve: false, ...(words === '' ? {} : { feedback: words }) }, keep)
      })
      actions.append(approve, keep)
    } else {
      const answer = document.createElement('button')
      answer.type = 'button'
      answer.textContent = COPY.submit
      answer.addEventListener('click', () => {
        const answers = questions.map((question) => {
          const questionId = text(question.id)
          const selected = inputs.filter((item) => item.questionId === questionId && item.input.checked).map((item) => item.input.value)
          const custom = customs.find((item) => item.questionId === questionId)?.input
          const words = text(custom?.value).trim()
          const single = question.multiSelect !== true
          return {
            id: questionId,
            selected: single && words !== '' ? [] : selected,
            ...(words === '' ? {} : { custom: words }),
          }
        })
        void submit({ answers }, answer)
      })
      actions.append(answer)
    }
    body.append(actions, error)
    details.append(body)
    return element
  }

  function buildAnswer(answer) {
    const at = Number.isFinite(answer?.at) ? answer.at : Date.now()
    const element = row(CLASS.answer, at)
    const body = document.createElement('p')
    body.className = CLASS.text
    body.textContent = COPY.answered(text(answer?.text))
    element.append(body)
    return element
  }

  /** One card the host closed without the user's answer: the reason, at the time it left. */
  function buildClosed(entry) {
    const at = Number.isFinite(entry?.at) ? entry.at : Date.now()
    const element = row(CLASS.closed, at)
    const body = document.createElement('p')
    body.className = CLASS.text
    body.textContent = COPY.closedReason(text(entry?.reason))
    element.append(body)
    return element
  }

  /** Remove every approval row this view inserted; entries and the pending stream stay. */
  function clearRows() {
    for (const row of timeline.querySelectorAll('[' + ROW.marker + ']')) row.remove()
  }

  /** Whether this view currently has a row in the timeline. A chat page swap removes them all. */
  function hasRows() {
    return timeline.querySelector('[' + ROW.marker + ']') !== null
  }

  function entryTimes() {
    const times = []
    for (const child of timeline.children) {
      if (child.dataset.entryKind === undefined) continue
      const at = Number(child.dataset.at)
      if (Number.isFinite(at)) times.push(at)
    }
    return times
  }

  async function refresh() {
    if (disposed) return
    const current = ++generation
    let page
    try { page = await request(API.page) } catch { return }
    if (disposed || current !== generation || page === null || typeof page !== 'object') return
    // A chat page swap clears the whole timeline, so identical data still needs its rows back.
    const next = JSON.stringify(page)
    if (next === signature && hasRows()) return
    signature = next
    clearRows()
    const rows = []
    for (const card of Array.isArray(page.cards) ? page.cards : []) rows.push(buildCard(card))
    for (const entry of Array.isArray(page.questions) ? page.questions : []) rows.push(buildQuestion(entry))
    for (const answer of Array.isArray(page.answers) ? page.answers : []) rows.push(buildAnswer(answer))
    for (const entry of Array.isArray(page.closed) ? page.closed : []) rows.push(buildClosed(entry))
    const labels = (Array.isArray(page.labels) ? page.labels : []).filter((label) => label !== null && typeof label === 'object')
    const times = entryTimes()
    for (const group of groupLabels(labels, times)) rows.push(buildLabelGroup(group))
    rows.sort((a, b) => Number(a.dataset.at) - Number(b.dataset.at))
    for (const element of rows) insertRow(element, Number(element.dataset.at))
  }

  function dispose() {
    if (disposed) return
    disposed = true
    clearRows()
  }

  return Object.freeze({ refresh, dispose })
}
