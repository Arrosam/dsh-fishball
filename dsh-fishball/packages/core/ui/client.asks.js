/**
 * Fishball's ask cards, browser half (task F-ASKCARD; R-FB-11, R-UI-12; Q-U2; Q3 = A). A
 * package-local chunk of fishball-ui's client, beside client.js: DSH serves only flat
 * `client.<name>.js` chunks (the CLIENT_CHUNK rule, both SDKs). fishball-ui's client.js starts
 * `asksPart` as a sub-plugin. F-UI moved it here from core: the card store and its routes stay
 * core's (src/asks/), the drawing is fishball-ui's (R-FB-14).
 *
 * It runs only where fishball-ui runs beside core, the Fishball DSH (hosted child or standalone),
 * so the main DSH never shows a card (Q-U2). Inside it, a card is drawn in the manager's
 * conversation only: DSH's session-scoped `conversation.input.dock` list, above the composer, for
 * the session whose id the card stream names as the manager's. Every other session draws nothing.
 *
 * The state is the server half's (src/asks/): the stream route sends `{managerSessionId, cards}`
 * and the answer route commits once. The same dock and accordion hold target permission cards and
 * the local manager's question batches. Permissions keep their opaque handle and choices; local
 * questions answer by cardId and carry one answer per question. Settled cards leave the dock.
 *
 * Permission actions keep the approval wording of the earlier Fishball page (en and zh).
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.asks.js',
  factory(require) {
    const React = require('react')
    const { Button, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const ASKS_UI = Object.freeze({
      name: 'fishball-ui: asks',
      locale: 'fishball-asks',
      slot: 'conversation.input.dock',
      id: 'fishball-asks',
      // Before DSH's own docks in this slot (todo 0, goal 10, queue 20, both SDKs), so an open card
      // is the first thing above the composer.
      order: -10,
      // Match the native question panel’s viewport cap so cards leave the composer usable.
      maxHeight: 'min(60vh, 520px)',
      // Retain a few visible lines when chrome wraps at very short viewport heights.
      minQuestionListHeight: 'min(3lh, 20vh)',
      // Core's published answer route and card states, restated because fishball-ui imports nothing
      // of core (Q-G2): core's src/asks/constants.js ASK_ROUTE path without its leading `/`
      // (page-relative), and CARD_STATE. The cards arrive on the page stream's `asks` topic.
      answer: 'api/fishball/asks/answer',
      openState: 'open',
      /**
       * MULTI-0 (`SEAM_TARGETS.ask`, restated): the answer body names the card's opaque
       * target-qualified `handle`, never its raw `approvalId`, so two DSHs' equal ids are two cards
       * answered each through its own target (PLAN-MULTI §5).
       */
      handleField: 'handle',
      kind: Object.freeze({ permission: 'permission', question: 'question' }),
      permissionCount: 1,
      css: Object.freeze({
        id: 'fishball-asks-style', root: 'fb-asks', card: 'fb-ask-card', meta: 'fb-ask-meta', preview: 'fb-ask-preview', chevron: 'fb-ask-chevron',
        source: 'fb-ask-source', hidden: 'fb-ask-visually-hidden', from: 'fb-ask-from', time: 'fb-ask-time', body: 'fb-ask-body', badge: 'fb-ask-badge',
        question: 'fb-ask-question', detail: 'fb-ask-detail', label: 'fb-ask-label', args: 'fb-ask-args', row: 'fb-ask-row', reason: 'fb-ask-reason', error: 'fb-ask-error',
        fields: 'fb-ask-fields', option: 'fb-ask-option', questionCard: 'fb-ask-question-card',
        questionList: 'fb-ask-question-list', progress: 'fb-ask-progress',
      }),
      // K1's ARGUMENTS_STATUS word for whole arguments (core's AskCard.argumentsStatus, ask-card.d.ts).
      argumentsComplete: 'complete',
      // DSH's warning Tag inside the approval card's warn band.
      badgeTone: 'warning',
      reasonRows: 2,
      /**
       * UI-FIX-F: the reason box's placeholder ink. DSH's own input placeholder token
       * (`--dsw-alias-label-dimmed`) is 1.26:1 on the box's layer-3 fill in both themes, so the hint
       * could not be read. The secondary label is 5.8:1 (light) and 8.0:1 (dark) there, past WCAG
       * AA's 4.5:1; tertiary would be 3.7:1 in light. Typed text stays primary, so it still reads as
       * a hint. The rule also sets `opacity:1`: a browser that dims placeholders by default (Firefox
       * draws them at 54%) would otherwise undo the ratio.
       */
      placeholderInk: '--dsw-alias-label-secondary',
      /**
       * RESHOOT: the count badge ink in the light theme only. DSH's warning Tag draws
       * `--dsw-alias-state-warn-primary` (#f59e0b) on its #fdeacc tint there: 1.8:1. DSH's own warn
       * text token (`--dsw-alias-state-warn-label`, #dd8629) half mixed with the primary label is
       * #764c1f, 6.3:1 on the badge (WCAG AA 4.5:1), and stays in the warn hue. The dark theme
       * already reads 5.8-7.3:1 and mixing with its near-white label would change it, so the rule is
       * scoped to the light theme by the body attribute DSH sets for dark (dsh-client-ui-layout's
       * ThemePresenter; dsh-client-ui-theme's token sheets key on the same attribute).
       */
      badgeInk: Object.freeze({
        lightScope: 'body:not([data-ds-dark-theme])',
        ink: 'color-mix(in srgb,var(--dsw-alias-state-warn-label) 50%,var(--dsw-alias-label-primary))',
      }),
      /**
       * R-FIX-FUI: the Intl locale a card's time is written in, per page language (kit `useLang`), as
       * DSH's own schedule copy names one per language; the browser's time zone is kept.
       */
      timeLocale: Object.freeze({ en: 'en', zh: 'zh-CN' }),
    })

    const en = {
      waiting: 'Fishball is waiting for your answer',
      from: 'From',
      dsh: 'DSH:',
      'dsh.unnamed': 'Name unavailable',
      'choice.allow': 'Allow once',
      'choice.reject': 'Reject',
      reason: 'Reason',
      'detail.arguments': 'Arguments',
      'detail.reason': 'The session\'s reason',
      'detail.incomplete': 'The arguments are incomplete, so this request can only be rejected.',
      'header.permission': 'Permission',
      'header.question': 'Question',
      'question.custom': 'Type your answer',
      'question.skip': 'Skip',
      'question.submit': 'Submit',
      'question.list': 'Questions',
      'question.progress': '{done} of {total} answered or skipped',
    }
    const zh = {
      waiting: 'Fishball 正在等你回答',
      from: '来自',
      dsh: 'DSH：',
      'dsh.unnamed': '名字未知',
      'choice.allow': '允许一次',
      'choice.reject': '拒绝',
      reason: '理由',
      'detail.arguments': '参数',
      'detail.reason': '会话给出的理由',
      'detail.incomplete': '参数不完整，因此只能拒绝此请求。',
      'header.permission': '权限',
      'header.question': '问题',
      'question.custom': '输入你的答案',
      'question.skip': '跳过',
      'question.submit': '提交',
      'question.list': '问题列表',
      'question.progress': '已回答或跳过 {done}/{total} 题',
    }

    // Keep the approval card's warning band and surface for both kinds of open card.
    const focusRing = 'outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:-2px'
    const css = [
      // The warn stroke is an overlay above the children, so the opaque band cannot paint over it.
      `.${ASKS_UI.css.root}{max-height:${ASKS_UI.maxHeight};overflow:auto;overscroll-behavior:contain;grid-auto-rows:max-content}`,
      `.${ASKS_UI.css.card}{position:relative}`,
      `.${ASKS_UI.css.card}::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px var(--dsw-alias-state-warn-secondary);pointer-events:none}`,
      `.${ASKS_UI.css.meta}{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:8px;width:100%;border:0;padding:8px 16px;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);text-align:start;cursor:pointer}`,
      `.${ASKS_UI.css.meta}:focus-visible{${focusRing}}`,
      `.${ASKS_UI.css.preview}{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}`,
      `.${ASKS_UI.css.chevron}{width:6px;height:6px;border:solid currentColor;border-width:0 1px 1px 0;transform:translateY(-2px) rotate(45deg)}`,
      `.${ASKS_UI.css.meta}[aria-expanded="true"] .${ASKS_UI.css.chevron}{transform:translateY(2px) rotate(225deg)}`,
      `${ASKS_UI.badgeInk.lightScope} .${ASKS_UI.css.card} .${ASKS_UI.css.badge}{color:${ASKS_UI.badgeInk.ink}}`,
      `.${ASKS_UI.css.from}{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      // A label read by assistive technology only ("DSH:" before the source name).
      `.${ASKS_UI.css.hidden}{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}`,
      // Which DSH asks (MULTI-3): its name as text, cut visually with the full name as the title.
      `.${ASKS_UI.css.source}{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:plaintext;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary)}`,
      `.${ASKS_UI.css.time}{margin-left:auto;white-space:nowrap}`,
      `.${ASKS_UI.css.body}{display:grid;gap:8px;padding:12px 16px 14px}`,
      // Reserve space for the accordion header and Submit before allocating space to questions.
      // Scrolling the outer dock alone cannot reveal controls clipped by the card surface.
      `.${ASKS_UI.css.questionCard}{display:flex;flex-direction:column;max-height:${ASKS_UI.maxHeight};overflow-y:auto}`,
      `.${ASKS_UI.css.questionCard}>.${ASKS_UI.css.meta}{flex:none;grid-template-columns:minmax(0,max-content) minmax(0,1fr) auto auto}`,
      `.${ASKS_UI.css.questionCard} .${ASKS_UI.css.meta}>strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
      `.${ASKS_UI.css.questionCard}>.${ASKS_UI.css.body}{display:flex;flex-direction:column;min-height:0}`,
      `.${ASKS_UI.css.questionCard}>.${ASKS_UI.css.body}>:not(.${ASKS_UI.css.questionList}){flex:none}`,
      // If wrapped chrome leaves too little room, the card itself can scroll instead of clipping.
      `.${ASKS_UI.css.questionList}{display:grid;align-content:start;gap:12px;min-height:${ASKS_UI.minQuestionListHeight};overflow-y:auto}`,
      `.${ASKS_UI.css.questionList}:focus-visible{${focusRing}}`,
      `.${ASKS_UI.css.progress}{margin-inline-end:auto;color:var(--dsw-alias-label-secondary)}`,
      `.${ASKS_UI.css.card}>.${ASKS_UI.css.body}[hidden]{display:none}`,
      `.${ASKS_UI.css.question}{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:var(--dsw-font-s-strong-14);color:var(--dsw-alias-label-primary)}`,
      `.${ASKS_UI.css.fields}{display:grid;gap:8px;min-width:0;margin:0;padding:0;border:0}`,
      `.${ASKS_UI.css.fields} legend{margin-bottom:8px;padding:0}`,
      `.${ASKS_UI.css.option}{display:flex;align-items:baseline;gap:8px;overflow-wrap:anywhere}`,
      `.${ASKS_UI.css.detail}{margin:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}`,
      `.${ASKS_UI.css.label}{margin:0 0 4px;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-tertiary)}`,
      // The arguments wrap at spaces first and split a token only when it is longer than the line
      // (`overflow-wrap:anywhere`, UI-FIX-F): `word-break:break-all` cut `--runInBand` mid-word at 390px.
      `.${ASKS_UI.css.args}{margin:0;max-height:12em;overflow:auto;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform);font:var(--dsw-font-xxs-12);font-family:var(--ds-font-family-code, monospace);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}`,
      `.${ASKS_UI.css.row}{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}`,
      // The input look of DSH's settings fields (SettingsValueField, both SDKs).
      `.${ASKS_UI.css.reason}{width:100%;box-sizing:border-box;resize:vertical;padding:6px 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}`,
      `.${ASKS_UI.css.reason}::placeholder{color:var(${ASKS_UI.placeholderInk});opacity:1}`,
      `.${ASKS_UI.css.reason}:focus-visible{${focusRing}}`,
      `.${ASKS_UI.css.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    /**
     * Core's `asks` topic of the page stream (kit `topicStream`, the page's one connection: EventSource
     * retries by itself, and the kit marks the cached cards stale meanwhile, R-FIX-FUI), shared by
     * every mounted dock. A frame that is not the topic's shape keeps the last good snapshot.
     */
    const cardStream = (kit) => kit.topicStream({
      topic: kit.topic.asks,
      valid: (next) => next !== null && typeof next === 'object' && Array.isArray(next.cards),
      initial: Object.freeze({ managerSessionId: null, cards: Object.freeze([]) }),
    })

    function AnswerText({ label, value, locked, onChange }) {
      return h('textarea', {
        className: ASKS_UI.css.reason, rows: ASKS_UI.reasonRows, value, placeholder: label, 'aria-label': label,
        disabled: locked, onChange: (event) => onChange(event.target.value),
      })
    }

    function AskAction({ children, ...props }) {
      return h(Button, { type: 'button', size: 'sm', variant: 'outline', ...props }, children)
    }

    function PermissionBody({ card, expanded, locked, send, t }) {
      const [reason, setReason] = React.useState('')
      if (!expanded) return null
      return h(React.Fragment, null,
        h('p', { className: ASKS_UI.css.question }, card.question),
        // Plain text children: React escapes the target's question, arguments and reason.
        card.arguments == null ? null : h('div', { 'data-fishball-ask-arguments': true },
          h('p', { className: ASKS_UI.css.label }, t('detail.arguments')),
          h('pre', { className: ASKS_UI.css.args }, card.arguments)),
        card.reason == null ? null : h('p', { className: ASKS_UI.css.detail, 'data-fishball-ask-reason': true }, t('detail.reason') + ': ' + card.reason),
        card.argumentsStatus != null && card.argumentsStatus !== ASKS_UI.argumentsComplete
          ? h('p', { className: ASKS_UI.css.detail, 'data-fishball-ask-incomplete': true }, t('detail.incomplete')) : null,
        h(AnswerText, { label: t('reason'), value: reason, locked, onChange: setReason }),
        h('div', { className: ASKS_UI.css.row }, card.choices.map((choice, index) => h(AskAction, {
          key: choice, variant: index === 0 ? 'primary' : 'outline', disabled: locked,
          'data-fishball-ask-choice': choice, onClick: () => send({ [ASKS_UI.handleField]: card.handle, choice, text: reason }),
        }, t('choice.' + choice)))))
    }

    const emptyDraft = Object.freeze({ selected: Object.freeze([]), custom: '', skipped: false })

    function QuestionFields({ question, draft, locked, update, t }) {
      const group = React.useId()
      const multi = question.multi_select === true
      return h('fieldset', { className: ASKS_UI.css.fields, disabled: locked },
        h('legend', { className: ASKS_UI.css.question }, question.question),
        question.options?.map(({ label, description }, index) => {
          const descriptionId = description ? group + '-description-' + index : undefined
          const choose = (event) => {
            const selected = !multi ? [label] : event.target.checked
              ? [...draft.selected, label] : draft.selected.filter((item) => item !== label)
            update({ selected, custom: multi ? draft.custom : '', skipped: false })
          }
          return h('label', { key: label, className: ASKS_UI.css.option },
            h('input', {
              type: multi ? 'checkbox' : 'radio', name: group, value: label, checked: draft.selected.includes(label),
              'aria-label': label, 'aria-describedby': descriptionId, onChange: choose,
            }),
            h('span', null, label, descriptionId && h('span', { id: descriptionId, className: ASKS_UI.css.detail }, h('br'), description)))
        }),
        // Like DSH's question tool, typing replaces a radio answer but can accompany checked options.
        h(AnswerText, {
          label: t('question.custom'), value: draft.custom, locked,
          onChange: (custom) => update({ selected: multi ? draft.selected : emptyDraft.selected, custom, skipped: false }),
        }),
        h('div', null, h(AskAction, {
          'aria-pressed': draft.skipped, variant: draft.skipped ? 'primary' : 'outline',
          onClick: () => update({ ...emptyDraft, skipped: !draft.skipped }),
        }, t('question.skip'))))
    }

    function QuestionBody({ card, expanded, locked, send, t }) {
      const [drafts, setDrafts] = React.useState(() => new Map())
      if (!expanded) return null
      const done = card.questions.filter(({ id }) => {
        const draft = drafts.get(id)
        return draft && (draft.skipped || draft.selected.length > 0 || draft.custom.trim() !== '')
      }).length
      const total = card.questions.length
      const submit = () => {
        const answers = card.questions.map(({ id }) => {
          const { selected, custom } = drafts.get(id)
          // An explicitly skipped question has neither a choice nor custom text on the wire.
          const text = custom.trim()
          return { id, selected, ...(text === '' ? {} : { custom: text }) }
        })
        send({ cardId: card.cardId, answers })
      }
      return h(React.Fragment, null,
        h('div', { className: ASKS_UI.css.questionList, role: 'region', 'aria-label': t('question.list'), tabIndex: 0 },
          card.questions.map((question) => h(QuestionFields, {
            key: question.id, question, draft: drafts.get(question.id) ?? emptyDraft, locked, t,
            update: (draft) => setDrafts((current) => new Map(current).set(question.id, draft)),
          }))),
        h('div', { className: ASKS_UI.css.row },
          h('span', { className: ASKS_UI.css.progress, role: 'status' },
            t('question.progress', { done, total })),
          h(AskAction, { variant: 'primary', disabled: locked || done !== total, onClick: submit }, t('question.submit'))))
    }

    const isQuestion = (card) => card.kind === ASKS_UI.kind.question

    function makeDock(ctx, stream, kit, presses) {
      function AskCard({ card, expanded, toggle, t, stale, lang }) {
        const panelId = React.useId()
        // Press state outlives the dock: remounts cannot unlock an in-flight answer. A stale frame
        // may still show a settled card, so none of its controls can post until the stream is live.
        const { sending, refused } = kit.usePress(presses, card.handle)
        const locked = sending || stale
        const send = (body) => {
          if (stale || presses.get(card.handle).sending) return
          return presses.run(card.handle, () => kit.press(ASKS_UI.answer, body),
            (answer) => ({ refused: kit.refusalText(answer, lang) }))
        }
        const question = isQuestion(card)
        const kind = question ? ASKS_UI.kind.question : ASKS_UI.kind.permission
        const first = question ? card.questions[0] : card
        const preview = first?.question
        const header = (question && first?.header?.trim()) || t('header.' + kind)
        const count = question ? card.questions.length : ASKS_UI.permissionCount
        const source = card.source?.name ?? t('dsh.unnamed')
        return h('div', {
          className: [kit.css.card, ASKS_UI.css.card, question ? ASKS_UI.css.questionCard : ''].join(' '),
          'data-fishball-ask': card.handle,
          'data-fishball-ask-state': card.state, 'data-fishball-ask-kind': kind,
        },
        h('button', {
          className: ASKS_UI.css.meta, type: 'button', 'aria-expanded': expanded, 'aria-controls': panelId,
          onClick: toggle,
        },
        h('strong', { title: question ? header : undefined }, header),
        h('span', { className: ASKS_UI.css.preview, title: preview }, preview),
        h(Tag, { tone: ASKS_UI.badgeTone, className: ASKS_UI.css.badge }, count),
        h('span', { className: ASKS_UI.css.chevron, 'aria-hidden': true })),
        h('div', { className: ASKS_UI.css.body, id: panelId, hidden: !expanded },
          expanded && h('div', { className: ASKS_UI.css.from },
            h('span', { className: ASKS_UI.css.hidden }, t('waiting')),
            !question && h('span', { className: ASKS_UI.css.source, title: source, 'data-fishball-ask-source': card.source?.targetId },
              h('span', { className: ASKS_UI.css.hidden }, t('dsh')), source),
            h('span', null, t('from') + ': ' + (card.sessionTitle ?? card.sessionId)),
            h('span', { className: ASKS_UI.css.time }, new Date(card.askedAt).toLocaleString(ASKS_UI.timeLocale[lang]))),
          // Keep the draft owner mounted while removing collapsed controls from the tab order.
          h(question ? QuestionBody : PermissionBody, { card, expanded, locked, send, t }),
          expanded && refused !== null ? h('p', { className: ASKS_UI.css.error, role: 'alert' }, refused) : null))
      }

      function OpenAsks({ cards, t, lang, health }) {
        const multiple = cards.length > 1
        const [accordion, setAccordion] = React.useState(() => ({ multiple, expanded: multiple ? null : cards[0].handle }))
        const enteringMulti = multiple && !accordion.multiple
        const stillOpen = cards.some((card) => card.handle === accordion.expanded)
        // Collapse on entry into multi-card mode, but keep the user's choice on subsequent arrivals.
        const expanded = !enteringMulti && stillOpen ? accordion.expanded : null
        if (multiple !== accordion.multiple || expanded !== accordion.expanded) setAccordion({ multiple, expanded })
        const stale = health !== kit.HEALTH.live
        return h('div', { className: [kit.css.dock, ASKS_UI.css.root].join(' '), 'data-fishball-asks': true, 'data-fishball-asks-stale': stale ? health : undefined },
          stale ? h('div', { className: kit.css.card }, h(kit.StreamNotice, { health, lang })) : null,
          cards.map((card) => h(AskCard, {
            key: card.handle, card, t, stale, lang, expanded: expanded === card.handle,
            toggle: () => setAccordion({ multiple, expanded: expanded === card.handle ? null : card.handle }),
          })))
      }

      // The slot's t prop re-renders the dock when the locale changes.
      return function FishballAsks({ sessionId, t }) {
        const lang = kit.useLang(ctx)
        const { frame: { managerSessionId, cards }, health } = React.useSyncExternalStore(stream.subscribe, stream.get)
        // Only Fishball's own conversation shows cards. Settled cards stay in history, not the dock.
        if (!sessionId || sessionId !== managerSessionId) return null
        const open = cards.filter((card) => card.state === ASKS_UI.openState && (!isQuestion(card) || card.sessionId === sessionId))
        return open.length ? h(OpenAsks, { key: sessionId, cards: open, t, lang, health }) : null
      }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function asksPart(kit) {
      function apply(ctx) {
        const stream = cardStream(kit)
        ctx.effect(() => ctx.locale.register(ASKS_UI.locale, { en, zh }), 'fishball asks: dictionaries')
        ctx.effect(() => kit.mountStyle(ASKS_UI.css.id, css), 'fishball asks: styles')
        ctx.effect(() => ctx.slots.inject(ASKS_UI.slot, () => ctx.slots.register({
          name: ASKS_UI.slot, id: ASKS_UI.id, order: ASKS_UI.order, locale: ASKS_UI.locale,
          inject: (sessionId) => ({ sessionId }),
        }, makeDock(ctx, stream, kit, kit.pressStore()))), 'fishball asks: card dock')
      }
      return Object.freeze({ name: ASKS_UI.name, inject: ['slots', 'locale'], apply })
    }

    return { asksPart }
  },
})
