/**
 * dsh-connector-ui, the marks part (task U-DRAW; requirements 1.34, 1.41 Q-G5 = A; R-UI-05,
 * R-UI-10, R-NAME-05, R-NAME-08, R-ROUTE-05; design §3.6, §4.2): the managed-session marks naming
 * their managing principal, and Hand over / Take back in a session's header and row menu, with the
 * note dialog and the refusal notice.
 *
 * It only draws (1.34: "connector当后端，embed UI当前端"): the marks and the Hand over targets come
 * from the connector UI backend's snapshot stream, and Hand over / Take back are the backend's
 * routes, which call its hand-over service. Nothing is kept here but the open dialog.
 * - A managed session shows "Managed by <principal>" beside its title and Take back (one click,
 *   no note) in the header's utilities.
 * - An unmanaged one shows the backend's `targets` (enabled and paired, online or not, in the
 *   connector's order; R-UI-10): none → no control; one → "Hand over to <principal>"; more → the
 *   "Handover to…" dropdown. Each carries its green / red light with its words.
 * - A principal is its name, or a bold `ID:` and its id when it has none (R-NAME-08).
 *
 * A package-local chunk beside client.js (DSH serves only flat client.<name>.js chunks, the
 * CLIENT_CHUNK rule of dsh-client-modules on both SDKs; no build step). It exports one factory
 * that client.js calls with the shell's kit and the host half's availability.
 */
globalThis.__ModuleLoader__?.load({
  id: 'dsh-connector-ui',
  chunk: 'client.marks.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const { Button, Menu, MenuItemButton, Modal } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    /** The part's sub-plugin: its name and the client services it reads. */
    const PART = Object.freeze({ name: 'dsh-connector-ui: marks', inject: Object.freeze(['slots', 'locale']) })
    /** Cordis effect labels. */
    const LABEL = Object.freeze({
      header: 'fishball: managed-by header label', headerControl: 'fishball: hand-over header control',
      menu: 'fishball: session menu', dialogs: 'fishball: hand-over dialogs',
      rowMark: 'fishball: managed row mark', rowRunning: 'fishball: managed row running mark',
    })

    /**
     * The one hand-over entry: the session header and the session-row menu share it. Menu order:
     * after DSH's own pin/rename/fork/archive, before the id. In the header it is two entries:
     * - "Managed by <principal>" stays title-adjacent (`headerOrder`, the header actions, just
     *   before Fishball's own settings action), as metadata of the title;
     * - the control (Take back, Hand over) sits in DSH's right-aligned utilities
     *   (`utilitiesOrder`), first of them, before open-in-app (-10) and the schedule catalog (-5).
     *   The title-adjacent actions are `flex:none` inside a title cluster that does not clip on
     *   0.2.1-rc.5, so a control there was drawn over DSH's own utilities at narrow widths (the
     *   390 px retake); the utilities are laid out beside them and never overlap.
     * The dialog and the refusal notice are two overlay entries, so each has its own id.
     * `menuAlign` opens the dropdown under its button's end, as DSH's own header menus.
     */
    const HAND_OVER = Object.freeze({
      id: 'fishball-hand-over', noticeId: 'fishball-hand-over-notice', menuOrder: 422, headerOrder: 4.5, utilitiesOrder: -20,
      menuAlign: 'end', noteRows: 4,
    })
    /** The managed mark in a sidebar row (DESIGN §10e item 30): its cell and its two states. */
    const MANAGED_ROW = Object.freeze({
      id: 'fishball-managed',
      iconPx: 14,
      /** Values of data-fishball-row-state, so a running mark is distinguishable from an idle one. */
      state: Object.freeze({ idle: 'idle', running: 'running' }),
    })
    /**
     * A session's root as DSH's own header breadcrumb follows it (dsh-client-ui-conversation
     * `deriveAncestry`: a summary whose `origin` is `subagent` belongs to its `parentId`). Hand over
     * and Take back are per root session (review UI-01), and DSH draws the header and its utilities
     * in a subagent's session too, so the header shows and acts on the root's state. `maxDepth` is
     * the connector's own walk bound (dsh-connector src/constants.js SESSION_INFO.maxSubagentDepth;
     * a browser chunk cannot import it, so it is written here once more: change both together).
     */
    const ROOT = Object.freeze({ subagentOrigin: 'subagent', maxDepth: 8 })
    /**
     * The refusals with their own words (the backend's answers: K3 HandOverRefusalCode,
     * TakeBackRefusalCode, and its own `invalid-request`). Any other answer, `operation-failed`
     * or no answer at all, reads `refusalFailed`. `noCode` marks an answer that carried no code.
     */
    const REFUSAL = Object.freeze({
      known: Object.freeze(['unknown-session', 'conflict', 'no-agent', 'not-managed', 'invalid-request']),
      prefix: 'refusal.',
      failed: 'refusalFailed',
      noCode: '',
    })

    /**
     * The part as a client plugin.
     * @param kit - the shell's kit (client.shell.js `kit`).
     * @param available - the host half's availability; `ui` holds the backend's page-relative routes.
     */
    function marksPart(kit, available) {
      const { NS, SLOT, CLS, valueStore, snapshotHook, send, FishballIcon, principalLabel, principalText, withName, principalWithLight } = kit
      const routes = available.ui
      const useSnapshot = snapshotHook(routes)
      /** The session's mark (`{sessionId, principal}`), or undefined while it is unmanaged. */
      const markOf = (snapshot, sessionId) => snapshot.marks.find((mark) => mark.sessionId === sessionId)
      /**
       * The root id of `sessionId` in DSH's session list (`{byId}`, ROOT); a session the list does
       * not hold yet, or a parent it does not hold, ends the walk there (the backend resolves the
       * root again, so a Hand over or Take back still acts on the root).
       */
      function rootIn(list, sessionId) {
        let id = sessionId
        for (let depth = 0; depth < ROOT.maxDepth; depth++) {
          const summary = list?.byId?.[id]
          if (summary?.origin !== ROOT.subagentOrigin || typeof summary.parentId !== 'string' || list.byId[summary.parentId] === undefined) return id
          id = summary.parentId
        }
        return id
      }
      /**
       * The root session a seat's entry stands for: DSH's standard `useSessions` hook, which every
       * slot entry receives; without it (an SDK that does not pass it) the session itself. The
       * presence of the prop does not change between renders of one entry, so the hook order holds.
       */
      const useRootId = (sessionId, useSessions) => (typeof useSessions === 'function' ? useSessions((list) => rootIn(list, sessionId)) : sessionId)
      const refusalKey = (code) => (REFUSAL.known.includes(code) ? REFUSAL.prefix + code : REFUSAL.failed)
      /** A refusal as an alert, its code beside it for a reader that needs it. */
      const refusalAlert = (t, code) => h('div', { role: 'alert', className: CLS.refusal, 'data-fishball-refusal': code ?? REFUSAL.noCode }, t(refusalKey(code)))

      /**
       * The open Hand over dialog (`{sessionId, target}`), shared by the header and the row menu:
       * the dialog lives in the shell overlay, so it outlives the menu that opened it.
       */
      const handOverRequest = (() => {
        const store = valueStore(null)
        return { ...store, open: (sessionId, target) => store.set({ sessionId, target }), close: () => store.set(null) }
      })()
      /**
       * Take back's last refusal (`code`, or null), shown by the overlay: a menu entry unmounts when
       * the menu closes, so the entry cannot show it itself.
       */
      const takeBackNotice = valueStore(null)
      /**
       * Sessions whose Take back is in flight: a second click (another entry, a double click) sends
       * nothing, so it cannot come back as a `not-managed` refusal of the first one's success.
       */
      const takingBack = new Set()
      async function takeBack(sessionId) {
        if (takingBack.has(sessionId)) return
        takingBack.add(sessionId)
        try {
          const { ok, code } = await send(routes.takeBack, { sessionId })
          takeBackNotice.set(ok ? null : { code })
        } finally { takingBack.delete(sessionId) }
      }

      function makeHandOverDialog(t) {
        return function FishballHandOverDialog() {
          const request = React.useSyncExternalStore(handOverRequest.subscribe, handOverRequest.get)
          if (request === null) return null
          return h(HandOverForm, { key: request.sessionId + request.target.key, request, t })
        }
      }

      /** One Hand over's dialog: the optional note and the in-flight state die with it. */
      function HandOverForm({ request, t }) {
        const [note, setNote] = React.useState('')
        const [handingOver, setHandingOver] = React.useState(false)
        const [refusal, setRefusal] = React.useState(null)
        const close = () => { if (!handingOver) handOverRequest.close() }
        const confirm = async () => {
          setHandingOver(true)
          const { ok, code } = await send(routes.handOver, { sessionId: request.sessionId, principalKey: request.target.key, note })
          setHandingOver(false)
          if (ok) handOverRequest.close()
          else setRefusal({ code })
        }
        return h(Modal, {
          open: true,
          onClose: close,
          closeLabel: t('close'),
          title: handOverText(t, request.target),
          footer: h(React.Fragment, null,
            h(Button, { type: 'button', variant: 'outline', disabled: handingOver, onClick: close }, t('cancel')),
            h(Button, { type: 'button', variant: 'primary', disabled: handingOver, 'data-fishball-hand-over-confirm': true, onClick: confirm }, handingOver ? t('handingOver') : t('handOverConfirm'))),
        },
          h('label', { className: CLS.field },
            h('span', null, t('handOverNoteLabel')),
            h('textarea', { className: CLS.note, value: note, rows: HAND_OVER.noteRows, 'data-modal-autofocus': true, disabled: handingOver, onChange: (event) => { setNote(event.target.value); setRefusal(null) } })),
          refusal === null ? null : refusalAlert(t, refusal.code))
      }

      /** Take back's refusal, as a dialog in the shell overlay. */
      function makeTakeBackNotice(t) {
        return function FishballTakeBackNotice() {
          const refusal = React.useSyncExternalStore(takeBackNotice.subscribe, takeBackNotice.get)
          if (refusal === null) return null
          const dismiss = () => takeBackNotice.set(null)
          return h(Modal, {
            open: true, onClose: dismiss, closeLabel: t('close'), title: t('takeBackTitle'),
            footer: h(Button, { type: 'button', variant: 'primary', onClick: dismiss }, t('close')),
          }, refusalAlert(t, refusal.code))
        }
      }

      /** "Hand over to <principal>" and "Managed by <principal>" as plain text (a title, a dialog's title, a text alternative). */
      const handOverText = (t, target) => t('handOverTo', { name: principalText(t, target) })
      const managedByText = (t, principal) => t('managedBy', { name: principalText(t, principal) })
      /**
       * "Hand over to <principal>", with the principal's light (R-UI-10). `wrap` (optional) wraps the
       * words, so the header's button can end them in an ellipsis without dropping the light.
       */
      const handOverLabel = (t, target, wrap = (words) => words) => principalWithLight(t, target, wrap(withName(t, 'handOverTo', principalLabel(t, target))))

      /**
       * The one-target button, or the "Handover to…" dropdown for more (R-UI-10). In the header the
       * one-target label keeps to one line and ends in an ellipsis when a long name would crowd the
       * title (CLS.headerControl); its `title` holds the whole text.
       */
      function HandOverControl({ t, sessionId, targets }) {
        const [open, setOpen] = React.useState(false)
        const choose = (target) => handOverRequest.open(sessionId, target)
        if (targets.length === 1) {
          const [target] = targets
          return h(Button, {
            type: 'button', size: 'sm', variant: 'ghost', className: CLS.headerControl, title: handOverText(t, target),
            'data-fishball-hand-over': true, 'data-fishball-target': target.key, onClick: () => choose(target),
          }, handOverLabel(t, target, (words) => h('span', { className: CLS.ellipsis }, words)))
        }
        return h(Menu, {
          open,
          onClose: () => setOpen(false),
          items: targets.map((target) => ({ id: target.key, label: principalWithLight(t, target, principalLabel(t, target)) })),
          onSelect: (key) => {
            setOpen(false)
            const target = targets.find((row) => row.key === key)
            if (target !== undefined) choose(target)
          },
          align: HAND_OVER.menuAlign,
          portal: true,
          anchor: h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'aria-haspopup': 'menu', 'aria-expanded': open, 'data-fishball-hand-over-many': true, onClick: () => setOpen((value) => !value) }, t('handOverMany')),
        })
      }

      /**
       * The header's title-adjacent entry: a managed session's "Managed by <principal>", else
       * nothing. It is metadata of the title, so DSH's narrow header drops it (CLS.managedBy, as
       * DSH drops its own agent-preset label); its `title` keeps the words.
       */
      function makeHeaderAction(t) {
        return function FishballManagedByHeaderAction({ sessionId, useSessions }) {
          const mark = markOf(useSnapshot(), useRootId(sessionId, useSessions))
          if (mark === undefined) return null
          return h('span', { className: CLS.managedBy, title: managedByText(t, mark.principal), 'data-fishball-managed-by': mark.principal.key },
            withName(t, 'managedBy', principalLabel(t, mark.principal)))
        }
      }

      /**
       * The header's control, in DSH's right-aligned utilities (HAND_OVER): Take back for a managed
       * session (its tooltip "Managed by <principal>"), else the Hand over control, which is absent with no target (R-UI-10: "With none it
       * shows no control"). Both act on the root (useRootId): a subagent's header hands over or takes back its root.
       */
      function makeHeaderControl(t) {
        return function FishballHandOverHeaderControl({ sessionId, useSessions }) {
          const snapshot = useSnapshot()
          const root = useRootId(sessionId, useSessions)
          const mark = markOf(snapshot, root)
          if (mark !== undefined) {
            // Its tooltip names the managing principal, which a narrow header hides beside the title.
            return h(Button, { type: 'button', size: 'sm', variant: 'ghost', title: managedByText(t, mark.principal), 'data-fishball-take-back': true, onClick: () => void takeBack(root) }, t('takeBack'))
          }
          if (snapshot.targets.length === 0) return null
          return h(HandOverControl, { t, sessionId: root, targets: snapshot.targets })
        }
      }

      /**
       * The row menu's entries: Take back for a managed session, else one Hand over per target. The
       * row menu is already a menu, and DSH's legacy row-menu slot takes flat MenuItemButton rows
       * only (no nested menu), so its rows are the dropdown's rows (R-UI-10), each "Hand over to
       * <principal>" with its light; the header carries the "Handover to…" dropdown itself.
       */
      function makeMenuItems(t) {
        return function FishballHandOverMenuItems({ sessionId, useSessions, useMenuOpenState }) {
          const snapshot = useSnapshot()
          // DSH's sidebar lists root sessions only, so this is the row itself; it is kept to one rule with the header.
          const root = useRootId(sessionId, useSessions)
          const [, setMenuOpen] = useMenuOpenState()
          const run = (action) => () => { setMenuOpen(false); action() }
          if (markOf(snapshot, root) !== undefined) {
            return h(MenuItemButton, { onSelect: run(() => void takeBack(root)), 'data-fishball-take-back': true }, t('takeBack'))
          }
          return h(React.Fragment, null, snapshot.targets.map((target) => h(MenuItemButton, {
            key: target.key, onSelect: run(() => handOverRequest.open(root, target)), 'data-fishball-hand-over': true, 'data-fishball-target': target.key,
          }, handOverLabel(t, target))))
        }
      }

      /**
       * One managed row's mark: the fish and "Managed by <principal>" as its text alternative. It is
       * still while idle and flips while the row runs; the label carries the state, so reduced
       * motion loses no information.
       */
      function ManagedMark({ t, mark, running }) {
        const label = managedByText(t, mark.principal)
        return h('span', {
          className: CLS.managedRow, role: 'img', 'aria-label': label, title: label,
          'data-fishball-managed-row': mark.sessionId,
          'data-fishball-row-state': running ? MANAGED_ROW.state.running : MANAGED_ROW.state.idle,
        }, h(FishballIcon, { size: MANAGED_ROW.iconPx, unread: false, moving: running }))
      }

      /**
       * The idle mark in a DSH session row's leading cell. DSH mounts this seat only while the row
       * is idle; its own spinner takes the cell otherwise, so the running variant below uses the
       * trailing seat.
       */
      function makeRowMark(t) {
        return function FishballManagedRowMark({ sessionId }) {
          const mark = markOf(useSnapshot(), sessionId)
          return mark === undefined ? null : h(ManagedMark, { t, mark, running: false })
        }
      }

      /**
       * The running mark in a DSH session row's trailing seat (0.2.2's always-mounted seat). An idle
       * row renders nothing here, so it never shows two fish. rc.5 has no trailing seat:
       * slots.inject waits for the declaration and this entry never mounts (no error).
       */
      function makeRowRunningMark(t) {
        return function FishballManagedRowRunningMark({ sessionId, useSessionStatus }) {
          const mark = markOf(useSnapshot(), sessionId)
          // A child owns the hook, so an unmanaged row never subscribes to DSH's status source.
          return mark === undefined ? null : h(RowRunningMark, { t, mark, useSessionStatus })
        }
      }

      /** The running half of the trailing entry: hooks are unconditional, the null return is not. */
      function RowRunningMark({ t, mark, useSessionStatus }) {
        // A selector keeps this mark from re-rendering on every other row's status change.
        const running = useSessionStatus((statuses) => statuses.get(mark.sessionId)?.running === true)
        return running ? h(ManagedMark, { t, mark, running: true }) : null
      }

      return {
        name: PART.name,
        inject: PART.inject,
        apply(ctx) {
          const t = ctx.locale.bind(NS)
          const register = (slot, entry, Component) => ctx.slots.register({ name: slot, locale: NS, ...entry }, Component)
          ctx.effect(() => ctx.slots.inject(SLOT.headerActions, () => register(SLOT.headerActions, { id: HAND_OVER.id, order: HAND_OVER.headerOrder }, makeHeaderAction(t))), LABEL.header)
          ctx.effect(() => ctx.slots.inject(SLOT.headerUtilities, () => register(SLOT.headerUtilities, { id: HAND_OVER.id, order: HAND_OVER.utilitiesOrder }, makeHeaderControl(t))), LABEL.headerControl)
          ctx.effect(() => ctx.slots.inject(SLOT.sessionMenu, () => register(SLOT.sessionMenu, { id: HAND_OVER.id, order: HAND_OVER.menuOrder }, makeMenuItems(t))), LABEL.menu)
          ctx.effect(() => ctx.slots.inject(SLOT.overlay, function* () {
            yield register(SLOT.overlay, { id: HAND_OVER.id }, makeHandOverDialog(t))
            yield register(SLOT.overlay, { id: HAND_OVER.noticeId }, makeTakeBackNotice(t))
          }), LABEL.dialogs)
          ctx.effect(() => ctx.slots.inject(SLOT.rowLeading, () => register(SLOT.rowLeading, { id: MANAGED_ROW.id }, makeRowMark(t))), LABEL.rowMark)
          // 0.2.2 keeps a row's trailing seat mounted while it runs; rc.5 has no such seat and this waits.
          ctx.effect(() => ctx.slots.inject(SLOT.rowTrailing, () => register(SLOT.rowTrailing, { id: MANAGED_ROW.id }, makeRowRunningMark(t))), LABEL.rowRunning)
        },
      }
    }

    module.exports = { marksPart }
    return module.exports
  },
})
