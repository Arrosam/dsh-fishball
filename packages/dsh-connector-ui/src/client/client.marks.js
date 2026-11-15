/**
 * dsh-connector-ui, the marks part (V3 U-SHELL split; U-MARKS owns it from W4): Hand over / Take
 * back in a session's header and row menu, with the note dialog and the refusal notice, and the
 * managed-session fish with its dots in a sidebar row (DESIGN §8.2, §8.3, §10e item 30). Moved
 * unchanged from the V2 connector client (R-EMBED's client.connector.js); it still reads the
 * connector's V2 state stream and routes, through the shell's kit.
 *
 * A package-local chunk beside client.js (DSH serves only flat client.<name>.js chunks, the
 * CLIENT_CHUNK rule of dsh-client-modules on both SDKs; no build step). It exports one factory
 * that the shell calls with its kit, and the result runs as a sub-plugin of the shell's row, so a
 * chunk that fails to load loses only this part.
 */
globalThis.__ModuleLoader__?.load({
  id: 'dsh-connector-ui',
  chunk: 'client.marks.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const { Button, MenuItemButton, Modal } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    /** The part's sub-plugin: its name and the client services it reads. */
    const PART = Object.freeze({ name: 'dsh-connector-ui: marks', inject: Object.freeze(['slots', 'locale']) })

    /**
     * The part as a client plugin over the shell's kit (client.shell.js `kit`).
     * @param kit - the shell's shared state stream, helpers, vocabulary and seats.
     * @returns a client plugin; the shell starts it as a sub-plugin of its row.
     */
    function marksPart(kit) {
      const { NS, SLOT, API, STATUS, CLS, ROW_MARK, useFishball, send, valueStore, brandIconOf, attentionDot } = kit

      /**
       * The one hand-over entry (§8.3): the session header and the session-row menu share it. Menu
       * order: after DSH's own pin/rename/fork/archive, before the id; header order: just before
       * Fishball's own settings action. The Take back refusal keeps its own overlay id, because the
       * dialog and that notice are registered in the same slot.
       */
      const HAND_OVER = Object.freeze({ id: 'fishball-hand-over', noticeId: 'fishball-hand-over-notice', menuOrder: 422, headerOrder: 4.5 })
      /** Hand-over refusals with their own text (keep in step with src/constants.js INTAKE_ERROR). */
      const HAND_OVER_ERRORS = new Set(['queue-full', 'too-large', 'from-fishball', 'unknown-session', 'unavailable'])
      /** Take back refusals with their own text (src/constants.js MANAGED_ERROR). */
      const MANAGE_ERRORS = new Set(['unknown-session', 'is-fishball', 'unavailable'])

      /**
       * The managed mark in a sidebar row. Its cell, its dot and its flip are the shell's ROW_MARK,
       * because the shell's one style sheet and the sidebar mark use them too.
       *
       * Idle: a still fish in the leading seat. Running: DSH replaces that seat with its own spinner,
       * so the same fish moves to the trailing seat and animates (0.2.2's always-mounted seat). The
       * dots sit at the mark's top-right; needs-action is checked first, so it wins when both apply.
       * Green/yellow come from DSH's state tokens, so light and dark themes both read.
       */
      const MANAGED_ROW = Object.freeze({
        id: 'fishball-managed',
        iconPx: 14,
        /** Values of data-fishball-row-state, so a running mark is distinguishable from an idle one. */
        state: Object.freeze({ idle: 'idle', running: 'running' }),
      })
      /**
       * The Host state one managed row's dots read. Both are per session, never Fishball-wide:
       * - green: an open intake row whose source identity is this session (a message_agent from
       *   it that Fishball has not read). The prefix is src/messaging.js SOURCE_ID.session; the open
       *   statuses are INTAKE_STATUS pending/accepted (src/constants.js).
       * - yellow: a card or question in state.pile whose sessionId is this session.
       * Fishball's own chat unread count stays on the sidebar row's fish.
       */
      const ROW_STATE = Object.freeze({
        unreadSource: 'session/',
        unreadStatuses: new Set(['pending', 'accepted']),
      })

      /**
       * Whether this row's session has a card or question waiting for you: the Host's one pile,
       * filtered by the card's own sessionId. A card from Fishball's own session has no managed row,
       * so it lights no dot; the mark never borrows another session's card.
       */
      const needsAction = (state, sessionId) => (Array.isArray(state.pile) ? state.pile : []).some((card) => card?.sessionId === sessionId)
      /**
       * Whether Fishball has unread input from this row's session: an open intake row whose source
       * identity is this session. The snapshot lists at most INTAKE.rowsShown items (src/constants.js), so a very old
       * open item may be missing from the dot; the dot is a hint, not a queue count.
       */
      const unreadInput = (state, sessionId) => (Array.isArray(state.intake?.items) ? state.intake.items : []).some((item) => item?.sourceIdentity === ROW_STATE.unreadSource + sessionId && ROW_STATE.unreadStatuses.has(item.status))

      /**
       * The hand-over dialog's request (§8.3): one store shared by the session-row menu entry and
       * the header action; the dialog lives in the shell overlay so it outlives the menu.
       */
      const handOverRequest = (() => {
        const store = valueStore(null)
        return { ...store, open: (sessionId, title) => store.set({ sessionId, title }), close: () => store.set(null) }
      })()
      const useHandOverRequest = () => React.useSyncExternalStore(handOverRequest.subscribe, handOverRequest.get)
      /** Any session but Fishball's own id (which names no main session). */
      const isOtherSession = (state, sessionId) => Boolean(sessionId) && sessionId !== state.sessionId
      /** Whether a session can be handed over: the body is up, and it is not Fishball's own session. */
      const canHandOver = (state, sessionId) => state.status === STATUS.live && isOtherSession(state, sessionId)

      function makeHandOverDialog(t) {
        return function FishballHandOverDialog() {
          const request = useHandOverRequest()
          if (request === null) return null
          return h(HandOverForm, { key: request.sessionId, request, t })
        }
      }

      /** One hand-over's dialog: the note and in-flight state die with it. */
      function HandOverForm({ request, t }) {
        const [note, setNote] = React.useState('')
        const [handingOver, setHandingOver] = React.useState(false)
        const [problem, setProblem] = React.useState(null)
        const close = () => { if (!handingOver) handOverRequest.close() }
        const confirm = async () => {
          setHandingOver(true)
          // The send route forwards the note as the user's words and makes the session managed.
          const { ok, code } = await send(API.send, { sessionId: request.sessionId, note })
          setHandingOver(false)
          if (ok) handOverRequest.close()
          else setProblem(HAND_OVER_ERRORS.has(code) ? 'handOverError.' + code : 'handOverFailed')
        }
        return h(Modal, {
          open: true,
          onClose: close,
          closeLabel: t('close'),
          title: request.title ? t('handOverTitle', { title: request.title }) : t('handOver'),
          footer: h(React.Fragment, null,
            h(Button, { type: 'button', variant: 'outline', disabled: handingOver, onClick: close }, t('cancel')),
            h(Button, { type: 'button', variant: 'primary', disabled: handingOver, onClick: confirm }, handingOver ? t('handingOver') : t('handOverConfirm'))),
        },
          h('p', { className: CLS.muted }, t('handOverHint')),
          h('label', { className: CLS.field },
            h('span', null, t('handOverNoteLabel')),
            h('textarea', { className: CLS.note, value: note, rows: 4, placeholder: t('handOverNotePlaceholder'), 'data-modal-autofocus': true, disabled: handingOver, onChange: (event) => { setNote(event.target.value); setProblem(null) } })),
          problem ? h('div', { role: 'alert' }, t(problem)) : null)
      }

      /**
       * A request from a menu entry or header action and its refusal, in one store outside the menu:
       * a menu entry unmounts when the menu closes, so the refusal is shown by the overlay
       * (makeRequestNotice), not by the entry.
       * @param path - the Host route. @param errors - refusal codes with their own text under `errorPrefix`.
       * @param failedKey - the text of any other failure.
       */
      function requestNotice(path, errors, errorPrefix, failedKey) {
        const store = valueStore(null)
        return {
          get: store.get,
          subscribe: store.subscribe,
          async request(body) {
            const { ok, code } = await send(path, body)
            store.set(ok ? null : errors.has(code) ? errorPrefix + code : failedKey)
          },
          dismiss: () => store.set(null),
        }
      }
      /** The refusal of a notice's last request, as a dialog in the shell overlay. */
      function makeRequestNotice(t, notice, titleKey) {
        return function FishballRequestNotice() {
          const problem = React.useSyncExternalStore(notice.subscribe, notice.get)
          if (problem === null) return null
          return h(Modal, {
            open: true,
            onClose: notice.dismiss,
            closeLabel: t('close'),
            title: t(titleKey),
            footer: h(Button, { type: 'button', variant: 'primary', onClick: notice.dismiss }, t('close')),
          }, h('div', { role: 'alert' }, t(problem)))
        }
      }

      /** Take back (§8.3) and its refusal. */
      const manageNotice = requestNotice(API.managed, MANAGE_ERRORS, 'manageError.', 'manageFailed')
      const isManagedSession = (state, sessionId) => (state.managed ?? []).some((entry) => entry.sessionId === sessionId)
      /** Offered where the hand-over can run, once the Host lists managed sessions. */
      const canManage = (state, sessionId) => Array.isArray(state.managed) && canHandOver(state, sessionId)
      /**
       * The one entry's text and action: Hand over opens the note dialog; Take back takes the
       * session back at once, with no note (§8.3 keeps it a single click).
       */
      const handOverChoice = (state, sessionId, title) => isManagedSession(state, sessionId)
        ? { label: 'takeBack', run: () => void manageNotice.request({ sessionId, managed: false }) }
        : { label: 'handOver', run: () => handOverRequest.open(sessionId, title) }

      function makeHandOverMenuItem(t) {
        return function FishballHandOverMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
          const state = useFishball()
          const [, setMenuOpen] = useMenuOpenState()
          if (!canManage(state, sessionId)) return null
          const choice = handOverChoice(state, sessionId, displayTitle)
          return h(MenuItemButton, { onSelect: () => { setMenuOpen(false); void choice.run() } }, t(choice.label))
        }
      }

      /** Hand over / Take back, shared by the session header and the managed banner so they cannot drift. */
      const handOverButton = (t, state, sessionId) => {
        const choice = handOverChoice(state, sessionId, '')
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', onClick: () => void choice.run() }, t(choice.label))
      }

      function makeHandOverHeaderAction(t) {
        return function FishballHandOverHeaderAction({ sessionId }) {
          const state = useFishball()
          if (!canManage(state, sessionId)) return null
          return handOverButton(t, state, sessionId)
        }
      }

      /**
       * Whether a session shows the managed-session marks (item 30): it is managed, and Take back is
       * offered (canManage: the body is up, never Fishball's own session). The
       * user's answers hide both the banner and the sidebar icon whenever Take back would be hidden.
       */
      const showsManagedMarks = (state, sessionId) => canManage(state, sessionId) && isManagedSession(state, sessionId)

      /**
       * One managed row's mark, shared by the idle leading seat and the running trailing seat: the
       * Sidebar icon setting's fish, a green dot when this session has unread input for Fishball, or
       * a yellow dot when this session has a card or question waiting. Both dots are per row; yellow
       * wins when both apply. The fish is still while idle and moves while the row runs; the dots and
       * the accessible label carry the state, so reduced motion loses no information.
       */
      function ManagedMark({ state, sessionId, t, running }) {
        const needsYou = needsAction(state, sessionId)
        const hasUnread = unreadInput(state, sessionId)
        const dot = needsYou ? ROW_MARK.dot.action : hasUnread ? ROW_MARK.dot.unread : null
        const label = needsYou
          ? t('managedRowNeedsYou')
          : hasUnread
            ? t('managedRowUnread')
            : running ? t('managedRowRunning') : t('managedBanner')
        const Icon = brandIconOf(state)
        return h('span', {
          className: CLS.managedRow, role: 'img', 'aria-label': label, title: label,
          'data-fishball-managed-row': sessionId,
          'data-fishball-row-state': running ? MANAGED_ROW.state.running : MANAGED_ROW.state.idle,
        },
          h(Icon, { size: MANAGED_ROW.iconPx, unread: false, moving: running, badge: true }),
          dot === null ? null : attentionDot(dot))
      }

      /**
       * The idle mark in a DSH session row's leading cell (DESIGN §10e item 30). DSH mounts this
       * seat only while the row is idle; its own spinner takes the cell otherwise, so the running
       * variant below uses the trailing seat. The seat gives only the row's sessionId, so the managed
       * list comes from the state stream every Fishball entry shares.
       */
      function makeManagedRowMark(t) {
        return function FishballManagedRowMark({ sessionId }) {
          const state = useFishball()
          if (!showsManagedMarks(state, sessionId)) return null
          return h(ManagedMark, { state, sessionId, t, running: false })
        }
      }

      /**
       * The running mark in a DSH session row's trailing seat (0.2.2's always-mounted seat). DSH's
       * own spinner stays in the leading cell; only the Fishball fish moves here, and only while this
       * row runs. An idle row renders nothing here, so it never shows two fish. rc.3 has no trailing
       * seat: slots.inject waits for the declaration and this entry never mounts (no error).
       */
      function makeManagedRowRunningMark(t) {
        return function FishballManagedRowRunningMark({ sessionId, useSessionStatus }) {
          const state = useFishball()
          if (!showsManagedMarks(state, sessionId)) return null
          // A child owns the hook, so an unmanaged row never subscribes to DSH's status source.
          return h(ManagedRowRunningMark, { state, sessionId, t, useSessionStatus })
        }
      }

      /** The running half of the trailing entry: hooks are unconditional, the null return is not. */
      function ManagedRowRunningMark({ state, sessionId, t, useSessionStatus }) {
        // The seat is always mounted, so the row's running state comes from DSH's global status
        // source; a selector keeps this mark from re-rendering on every other row's status change.
        const running = useSessionStatus((statuses) => statuses.get(sessionId)?.running === true)
        if (!running) return null
        return h(ManagedMark, { state, sessionId, t, running: true })
      }


      return {
        name: PART.name,
        inject: PART.inject,
        apply(ctx) {
          const t = ctx.locale.bind(NS)
          // Hand over / Take back on an ordinary session's header and row menu (§8.3).
          ctx.effect(() => ctx.slots.inject(SLOT.headerActions, () => ctx.slots.register({ name: SLOT.headerActions, id: HAND_OVER.id, order: HAND_OVER.headerOrder, locale: NS }, makeHandOverHeaderAction(t))), 'fishball: hand-over header action')
          ctx.effect(() => ctx.slots.inject(SLOT.sessionMenu, function* () {
            yield ctx.slots.register({ name: SLOT.sessionMenu, id: HAND_OVER.id, order: HAND_OVER.menuOrder, locale: NS }, makeHandOverMenuItem(t))
          }), 'fishball: session menu')
          ctx.effect(() => ctx.slots.inject(SLOT.overlay, function* () {
            yield ctx.slots.register({ name: SLOT.overlay, id: HAND_OVER.id, locale: NS }, makeHandOverDialog(t))
            yield ctx.slots.register({ name: SLOT.overlay, id: HAND_OVER.noticeId, locale: NS }, makeRequestNotice(t, manageNotice, 'manageTitle'))
          }), 'fishball: dialogs')
          // The managed-session marks (§8.2).
          ctx.effect(() => ctx.slots.inject(SLOT.rowLeading, () => ctx.slots.register({ name: SLOT.rowLeading, id: MANAGED_ROW.id, locale: NS }, makeManagedRowMark(t))), 'fishball: managed row mark')
          // 0.2.2 keeps a row's trailing seat mounted while it runs; rc.3 has no such seat and this waits.
          ctx.effect(() => ctx.slots.inject(SLOT.rowTrailing, () => ctx.slots.register({ name: SLOT.rowTrailing, id: MANAGED_ROW.id, locale: NS }, makeManagedRowRunningMark(t))), 'fishball: managed row running mark')
        },
      }
    }

    module.exports = { marksPart }
    return module.exports
  },
})
