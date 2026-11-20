/**
 * dsh-agent-connector, the marks part (DESIGN.md §28, moved from dsh-connector-ui on 2026-11-20 so
 * every connector install has it; requirements 1.41 Q-G5 = A; R-UI-05, R-UI-10, R-NAME-05,
 * R-NAME-08, R-ROUTE-05; design §3.6): the managed-session marks naming their managing agent, and
 * Hand over / Take back in a session's header and row menu, with the note dialog and the refusal
 * notice. It draws with or without dsh-connector-ui.
 *
 * It only draws: the marks and the Hand over targets come from the connector UI backend's snapshot
 * stream (src/ui/*), and Hand over / Take back are the backend's routes, which call its hand-over
 * service. Nothing is kept here but the open dialog. Without the backend's routes (the connector
 * row not loaded) the snapshot stays empty, so nothing is drawn and nothing is logged.
 * - A managed session shows "Managed by <agent>" beside its title and Take back (one click, no
 *   note) in the header's utilities.
 * - An unmanaged one shows the backend's `targets` (enabled and paired, online or not, in the
 *   connector's order; R-UI-10): none → no control; one → "Hand over to <agent>"; more → the
 *   "Handover to…" dropdown. Each carries its green / red light with its words.
 * - An agent is its name, or a bold `ID:` and its id when it has none (R-NAME-08).
 * The wording is the connector's, not Fishball's (§28), and every hook, class and id is
 * dsh-connector's. The managed row shows V1's fish (FISH_MARK; the user, 2026-11-21: after Hand
 * over the mark goes back to dsh-fishball v0.1.0's fish, not the connector's wrench icon).
 *
 * A package-local chunk beside client.js (DSH serves only flat client.<name>.js chunks, the
 * CLIENT_CHUNK rule of dsh-client-modules on 0.2.1-rc.5 and 0.2.2; no build step). It exports one
 * factory that client.js calls with its browser helpers over the backend (client.js `UI_CLIENT`).
 */
globalThis.__ModuleLoader__?.load({
  id: 'dsh-agent-connector',
  chunk: 'client.marks.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const { Button, Menu, MenuItemButton, Modal } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    /** The part's sub-plugin: its name, the client services it reads, and its dictionary's namespace. */
    const PART = Object.freeze({ name: 'dsh-connector: marks', inject: Object.freeze(['slots', 'locale']), ns: 'dsh-connector-marks' })
    /** Cordis effect labels. */
    const LABEL = Object.freeze({
      dictionaries: 'dsh-connector: marks dictionaries', styles: 'dsh-connector: marks styles',
      header: 'dsh-connector: managed-by header label', headerControl: 'dsh-connector: hand-over header control',
      menu: 'dsh-connector: session menu', dialogs: 'dsh-connector: hand-over dialogs',
      rowMark: 'dsh-connector: managed row mark', rowRunning: 'dsh-connector: managed row running mark',
    })
    /** DSH's slots this part fills (dsh-client-ui-conversation, -workspace, -layout; the same on 0.2.1-rc.5 and 0.2.2). */
    const SLOT = Object.freeze({
      headerActions: 'conversation.session.header.actions',
      /** DSH's right-aligned session utilities (open-in-app, the log export), laid out beside the title, never over it. */
      headerUtilities: 'conversation.session.header.utilities',
      sessionMenu: 'sidebar.workspaces.session.menu.item',
      overlay: 'shell.overlay',
      /** DSH's 16px cell before a session row's title, mounted only while the row is idle (dsh-client-ui-workspace). */
      rowLeading: 'sidebar.session.row.leading',
      /**
       * DSH's resting area after a session row's time label, mounted in every state (0.2.2). While a
       * row runs, the leading seat is replaced by DSH's spinner, so the running mark lives here.
       * 0.2.1-rc.5 has no such seat; slots.inject waits quietly and the mark simply does not mount.
       */
      rowTrailing: 'sidebar.session.row.trailing',
    })

    /**
     * The one hand-over entry: the session header and the session-row menu share it. Menu order:
     * after DSH's own pin/rename/fork/archive, before the id. In the header it is two entries:
     * - "Managed by <agent>" stays title-adjacent (`headerOrder`, the header actions), as metadata
     *   of the title;
     * - the control (Take back, Hand over) sits in DSH's right-aligned utilities
     *   (`utilitiesOrder`), first of them, before open-in-app (-10) and the schedule catalog (-5).
     *   The title-adjacent actions are `flex:none` inside a title cluster that does not clip on
     *   0.2.1-rc.5, so a control there was drawn over DSH's own utilities at narrow widths (the
     *   390 px retake); the utilities are laid out beside them and never overlap.
     * The dialog and the refusal notice are two overlay entries, so each has its own id.
     * `menuAlign` opens the dropdown under its button's end, as DSH's own header menus.
     */
    const HAND_OVER = Object.freeze({
      id: 'dsh-connector-hand-over', noticeId: 'dsh-connector-hand-over-notice', menuOrder: 422, headerOrder: 4.5, utilitiesOrder: -20,
      menuAlign: 'end', noteRows: 4,
    })
    /** The managed mark in a sidebar row: its cell, its icon size and its two states. */
    const MANAGED_ROW = Object.freeze({
      id: 'dsh-connector-managed',
      iconPx: 14,
      /**
       * DSH's leading cell (the seat's contract in dsh-client-ui-workspace slots.d.ts: "the 16px cell
       * before the title"); the cell is not sized by its parent, so a percentage would collapse.
       * Revisit if DSH resizes it.
       */
      cellPx: 16,
      /** Values of data-dsh-connector-row-state, so a running mark is distinguishable from an idle one. */
      state: Object.freeze({ idle: 'idle', running: 'running' }),
      /** The icon's flip while a row runs (design ⑥): a half-turn, a hold, then the other half. */
      flipAnimation: 'dshc-flip',
      flipSeconds: 1.8,
      flipOrigin: '50% 50%',
      flip: Object.freeze([[0, 0], [45, 180], [55, 180], [100, 360]]),
    })
    /**
     * The managed row's fish: V1's FishMark (dsh-fishball tag v0.1.0, client.js FISH_MARK, and
     * assets/icon.svg's shapes; FishMark from the owner's fishball app, Surfaces.kt), drawn inline
     * because DSH serves a package's images only from a built `./lib/assets/*` export and this
     * repository has no build step. As in V1's sidebar, the body takes the text colour (CLS.managedRow
     * sets it), so it reads on light and dark themes, and the eye keeps the app's magenta. No tile
     * and no wrench badge: the wrench is the connector's settings icon (assets/connector-icon.svg),
     * not the mark of a managed session.
     */
    const FISH_MARK = Object.freeze({
      viewBox: '0 0 24 24',
      body: 'M7.4 16.6 L7.4 9.9 L11.3 5.6 L18.4 5.6 L18.4 12.7 L14.1 16.6 Z M7.4 16.6 L2.6 21.4 L7.4 21.4 Z',
      eye: 'M14.6 7.4 h2 v2 h-2 Z',
      bodyColor: 'currentColor',
      eyeColor: '#EC0A6E',
    })
    /**
     * A session's root as DSH's own header breadcrumb follows it (dsh-client-ui-conversation
     * `deriveAncestry`: a summary whose `origin` is `subagent` belongs to its `parentId`). Hand over
     * and Take back are per root session (review UI-01), and DSH draws the header and its utilities
     * in a subagent's session too, so the header shows and acts on the root's state. `maxDepth` is
     * the connector's own walk bound (src/constants.js SESSION_INFO.maxSubagentDepth; a browser
     * chunk cannot import it, so it is written here once more: change both together).
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
    /** Stands for a `{name}` that is a node, not a string (withName): a character no dictionary or agent name holds. */
    const NAME_MARK = '\u0000'
    /**
     * The words. "Handover to…", "online" / "offline" and "Hand over to <name>" are R-UI-10's;
     * "Managed by" is R-NAME-05's; they name the agent, never Fishball (§28). The rest, and every
     * Chinese text, is PROPOSED (the zh review stays deferred, #76). Moved unchanged from
     * dsh-connector-ui (the lead, 2026-11-20).
     */
    const WORDING = Object.freeze({
      en: Object.freeze({
        handOverTo: 'Hand over to {name}', handOverMany: 'Handover to…', takeBack: 'Take back', managedBy: 'Managed by {name}',
        idPrefix: 'ID:', online: 'online', offline: 'offline',
        handOverNoteLabel: 'Note (optional)', handOverConfirm: 'Hand over', handingOver: 'Handing over…', cancel: 'Cancel', close: 'Close',
        takeBackTitle: 'Take back',
        'refusal.unknown-session': 'This session could not be found.',
        'refusal.conflict': 'This session is already managed.',
        'refusal.no-agent': 'That agent can no longer take this session.',
        'refusal.not-managed': 'This session is not managed.',
        'refusal.invalid-request': 'That request was not accepted.',
        refusalFailed: 'That did not work.',
      }),
      zh: Object.freeze({
        handOverTo: '交给 {name}', handOverMany: '交给…', takeBack: '收回', managedBy: '由 {name} 管理',
        idPrefix: 'ID:', online: '在线', offline: '离线',
        handOverNoteLabel: '备注（可选）', handOverConfirm: '交接', handingOver: '交接中…', cancel: '取消', close: '关闭',
        takeBackTitle: '收回',
        'refusal.unknown-session': '找不到此会话。',
        'refusal.conflict': '此会话已有人管理。',
        'refusal.no-agent': '该代理已无法接管此会话。',
        'refusal.not-managed': '此会话没有被管理。',
        'refusal.invalid-request': '请求未被接受。',
        refusalFailed: '操作未成功。',
      }),
    })
    /**
     * The session header's text beside DSH's own (UI-FIX-D, the 390 px retake):
     * - `maxWidthPx`: the widest a one-line label grows before its ellipsis, DSH's own crumb cap
     *   (ConversationRoot .crumb max-width, 0.2.1-rc.5 and 0.2.2);
     * - `narrowRowPx`: the title row's width (DSH makes it an inline-size container) at or below
     *   which "Managed by <agent>" is dropped, DSH's own breakpoint for its agent-preset label in the
     *   same row (dsh-client-ui-agent-preset `@container (width<=540px)`);
     * - `controlShareCqi`: the share of that row a header control may take, in container-query
     *   units, so on a 390 px header a long "Hand over to <name>" still leaves DSH's own utilities
     *   and the sidebar toggle (all `flex:none`) inside the row: they take about two-thirds of it.
     */
    const HEADER_LABEL = Object.freeze({ maxWidthPx: 220, narrowRowPx: 540, controlShareCqi: 30 })
    /**
     * An agent's status light and its gap to the label (R-UI-10). DSH's caption and body type and
     * its tinted-box padding (the sizes its settings fields and Tag use) for the refusal box.
     */
    const PRINCIPAL = Object.freeze({ lightPx: 7, gapPx: 6 })
    const TYPE = Object.freeze({ caption: 'var(--dsw-font-xxs-12)', body: 'var(--dsw-font-xs-13)', boxPadding: '10px 12px', boxGapPx: 12, barPx: 3 })
    /** The part's style sheet element and its classes. */
    const STYLE_ID = 'dsh-connector-marks-style'
    const CLS = Object.freeze({
      field: 'dshc-field', note: 'dshc-note', managedRow: 'dshc-managed-row', flip: 'dshc-flip', light: 'dshc-light',
      principal: 'dshc-principal', managedBy: 'dshc-managed-by', headerControl: 'dshc-header-control', ellipsis: 'dshc-ellipsis', refusal: 'dshc-refusal',
    })
    /** Scripting hooks (data attributes), in the connector's own `data-dsh-connector-` family. */
    const DATA = Object.freeze({
      managedBy: 'data-dsh-connector-managed-by', handOver: 'data-dsh-connector-hand-over', handOverMany: 'data-dsh-connector-hand-over-many',
      handOverConfirm: 'data-dsh-connector-hand-over-confirm', target: 'data-dsh-connector-target', takeBack: 'data-dsh-connector-take-back',
      managedRow: 'data-dsh-connector-managed-row', rowState: 'data-dsh-connector-row-state', online: 'data-dsh-connector-online',
      refusal: 'data-dsh-connector-refusal',
    })

    const css = [
      `.${CLS.field}{display:flex;flex-direction:column;gap:6px;margin-top:8px}`,
      // DSH's input colours (dsh-client-ui-primitives SettingsValueField): --dsw-alias-border-primary is not defined in dialogs.
      `.${CLS.note}{width:100%;box-sizing:border-box;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}`,
      // V1's row mark colour: the fish's body is currentColor, DSH's primary label (FISH_MARK).
      `.${CLS.managedRow}{position:relative;display:inline-flex;align-items:center;justify-content:center;width:${MANAGED_ROW.cellPx}px;height:${MANAGED_ROW.cellPx}px;color:var(--dsw-alias-label-primary)}`,
      // The running icon's flip (design ⑥): a half-turn to the mirror, a short hold, then back.
      `.${CLS.flip}{transform-origin:${MANAGED_ROW.flipOrigin};animation:${MANAGED_ROW.flipAnimation} ${MANAGED_ROW.flipSeconds}s ease-in-out infinite}`,
      `@keyframes ${MANAGED_ROW.flipAnimation}{${MANAGED_ROW.flip.map(([at, degrees]) => `${at}%{transform:rotateY(${degrees}deg)}`).join('')}}`,
      // Motion is the only thing that stops: the mark and its label stay.
      `@media (prefers-reduced-motion:reduce){.${CLS.flip}{animation:none}}`,
      // An agent's status light (R-UI-10): green online, red offline, DSH's state tokens; the
      // element's text alternative carries the same, so colour is not the only signal.
      `.${CLS.light}{display:inline-block;flex:none;width:${PRINCIPAL.lightPx}px;height:${PRINCIPAL.lightPx}px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}`,
      `.${CLS.light}[${DATA.online}="true"]{background:var(--dsw-alias-state-success-primary)}`,
      `.${CLS.principal}{display:inline-flex;align-items:center;gap:${PRINCIPAL.gapPx}px;overflow-wrap:anywhere}`,
      // "Managed by <agent>" beside the session title: DSH's caption size, as metadata, one line
      // capped as DSH caps a crumb; a narrow title row drops it (HEADER_LABEL), as DSH drops its preset label.
      `.${CLS.managedBy}{display:inline-block;max-width:${HEADER_LABEL.maxWidthPx}px;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary);font:${TYPE.caption};white-space:nowrap}`,
      `@container (width<=${HEADER_LABEL.narrowRowPx}px){.${CLS.managedBy}{display:none}}`,
      // A header control's label: one line, capped as DSH caps a crumb, ending in an ellipsis.
      `.${CLS.headerControl}{max-width:min(${HEADER_LABEL.maxWidthPx}px, ${HEADER_LABEL.controlShareCqi}cqi);white-space:nowrap}`,
      `.${CLS.headerControl} .${CLS.principal}{min-width:0;overflow-wrap:normal}`,
      `.${CLS.ellipsis}{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
      // A hand-over refusal inside its dialog: DSH's danger tint (its Tag's danger tone) with an error
      // bar at its start; the words keep the label colour, so they read at full contrast on the tint.
      `.${CLS.refusal}{margin-top:${TYPE.boxGapPx}px;padding:${TYPE.boxPadding};border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-label-primary);font:${TYPE.body};border-inline-start:${TYPE.barPx}px solid var(--dsw-alias-state-error-primary)}`,
    ].join('')

    function mountStyles() {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
      document.head.appendChild(style)
      return () => style.remove()
    }

    /** V1's fish (FISH_MARK); it flips while its row runs. Decorative: its cell carries the words. */
    function FishMark({ size, moving }) {
      return h('svg', { width: size, height: size, viewBox: FISH_MARK.viewBox, className: moving ? CLS.flip : undefined, 'aria-hidden': true },
        h('path', { d: FISH_MARK.body, fill: FISH_MARK.bodyColor }),
        h('path', { d: FISH_MARK.eye, fill: FISH_MARK.eyeColor }))
    }

    /**
     * An agent as R-NAME-08 shows it: its name as plain text, or, for a nameless one, a bold `ID:`
     * and its id. React escapes both, so markup in a name is shown, never run (HAND-EP-02 row 8).
     * `principalText` is the same as one string, for a text alternative.
     */
    const principalLabel = (t, principal) => (principal.name === null
      ? h(React.Fragment, null, h('strong', null, t('idPrefix')), ' ', principal.id)
      : principal.name)
    const principalText = (t, principal) => (principal.name === null ? t('idPrefix') + ' ' + principal.id : principal.name)
    /**
     * A dictionary text with `node` in place of its `{name}` (R-UI-10's "Hand over to <name>", whose
     * name may hold the bold prefix): the text is asked for with a marker and cut there, so every
     * language keeps its own word order.
     */
    function withName(t, key, node) {
      const [before, after = ''] = t(key, { name: NAME_MARK }).split(NAME_MARK)
      return h(React.Fragment, null, before, node, after)
    }
    /** An agent's status light (R-UI-10): green or red, with its words as the text alternative. */
    const principalLight = (t, online) => h('span', {
      className: CLS.light, role: 'img', [DATA.online]: String(online),
      'aria-label': t(online ? 'online' : 'offline'), title: t(online ? 'online' : 'offline'),
    })
    /** An agent with its light, as every Hand over control shows it. */
    const principalWithLight = (t, principal, content) => h('span', { className: CLS.principal }, principalLight(t, principal.online), content)

    /**
     * The part as a client plugin.
     * @param ui - the connector's browser helpers over its UI backend (client.js `UI_CLIENT`).
     */
    function marksPart(ui) {
      const { routes, valueStore, snapshotHook, send } = ui
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
      const refusalAlert = (t, code) => h('div', { role: 'alert', className: CLS.refusal, [DATA.refusal]: code ?? REFUSAL.noCode }, t(refusalKey(code)))

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
        return function ConnectorHandOverDialog() {
          const request = React.useSyncExternalStore(handOverRequest.subscribe, handOverRequest.get)
          const { targets } = useSnapshot()
          if (request === null) return null
          // The agent chosen is its key, captured at open: the confirm posts that key. Its words come
          // from the key's live row: names are unique per connector but not stable (set_name), so a
          // name captured at open could, after a rename while the dialog is open, be another agent's
          // by the time of the confirm, and the title would name an agent the confirm does not hand
          // over to. A key no longer listed (disabled or removed) keeps its last words; the backend
          // then answers `no-agent`, which the dialog shows.
          const target = targets.find((row) => row.key === request.target.key) ?? request.target
          return h(HandOverForm, { key: request.sessionId + request.target.key, request: { ...request, target }, t })
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
            h(Button, { type: 'button', variant: 'primary', disabled: handingOver, [DATA.handOverConfirm]: true, onClick: confirm }, handingOver ? t('handingOver') : t('handOverConfirm'))),
        },
          h('label', { className: CLS.field },
            h('span', null, t('handOverNoteLabel')),
            h('textarea', { className: CLS.note, value: note, rows: HAND_OVER.noteRows, 'data-modal-autofocus': true, disabled: handingOver, onChange: (event) => { setNote(event.target.value); setRefusal(null) } })),
          refusal === null ? null : refusalAlert(t, refusal.code))
      }

      /** Take back's refusal, as a dialog in the shell overlay. */
      function makeTakeBackNotice(t) {
        return function ConnectorTakeBackNotice() {
          const refusal = React.useSyncExternalStore(takeBackNotice.subscribe, takeBackNotice.get)
          if (refusal === null) return null
          const dismiss = () => takeBackNotice.set(null)
          return h(Modal, {
            open: true, onClose: dismiss, closeLabel: t('close'), title: t('takeBackTitle'),
            footer: h(Button, { type: 'button', variant: 'primary', onClick: dismiss }, t('close')),
          }, refusalAlert(t, refusal.code))
        }
      }

      /** "Hand over to <agent>" and "Managed by <agent>" as plain text (a title, a dialog's title, a text alternative). */
      const handOverText = (t, target) => t('handOverTo', { name: principalText(t, target) })
      const managedByText = (t, principal) => t('managedBy', { name: principalText(t, principal) })
      /**
       * "Hand over to <agent>", with the agent's light (R-UI-10). `wrap` (optional) wraps the
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
            [DATA.handOver]: true, [DATA.target]: target.key, onClick: () => choose(target),
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
          anchor: h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'aria-haspopup': 'menu', 'aria-expanded': open, [DATA.handOverMany]: true, onClick: () => setOpen((value) => !value) }, t('handOverMany')),
        })
      }

      /**
       * The header's title-adjacent entry: a managed session's "Managed by <agent>", else nothing.
       * It is metadata of the title, so DSH's narrow header drops it (CLS.managedBy, as DSH drops
       * its own agent-preset label); its `title` keeps the words.
       */
      function makeHeaderAction(t) {
        return function ConnectorManagedByHeaderAction({ sessionId, useSessions }) {
          const mark = markOf(useSnapshot(), useRootId(sessionId, useSessions))
          if (mark === undefined) return null
          return h('span', { className: CLS.managedBy, title: managedByText(t, mark.principal), [DATA.managedBy]: mark.principal.key },
            withName(t, 'managedBy', principalLabel(t, mark.principal)))
        }
      }

      /**
       * The header's control, in DSH's right-aligned utilities (HAND_OVER): Take back for a managed
       * session (its tooltip "Managed by <agent>"), else the Hand over control, which is absent with
       * no target (R-UI-10: "With none it shows no control"). Both act on the root (useRootId): a
       * subagent's header hands over or takes back its root.
       */
      function makeHeaderControl(t) {
        return function ConnectorHandOverHeaderControl({ sessionId, useSessions }) {
          const snapshot = useSnapshot()
          const root = useRootId(sessionId, useSessions)
          const mark = markOf(snapshot, root)
          if (mark !== undefined) {
            // Its tooltip names the managing agent, which a narrow header hides beside the title.
            return h(Button, { type: 'button', size: 'sm', variant: 'ghost', title: managedByText(t, mark.principal), [DATA.takeBack]: true, onClick: () => void takeBack(root) }, t('takeBack'))
          }
          if (snapshot.targets.length === 0) return null
          return h(HandOverControl, { t, sessionId: root, targets: snapshot.targets })
        }
      }

      /**
       * The row menu's entries: Take back for a managed session, else one Hand over per target. The
       * row menu is already a menu, and DSH's legacy row-menu slot takes flat MenuItemButton rows
       * only (no nested menu), so its rows are the dropdown's rows (R-UI-10), each "Hand over to
       * <agent>" with its light; the header carries the "Handover to…" dropdown itself.
       */
      function makeMenuItems(t) {
        return function ConnectorHandOverMenuItems({ sessionId, useSessions, useMenuOpenState }) {
          const snapshot = useSnapshot()
          // DSH's sidebar lists root sessions only, so this is the row itself; it is kept to one rule with the header.
          const root = useRootId(sessionId, useSessions)
          const [, setMenuOpen] = useMenuOpenState()
          const run = (action) => () => { setMenuOpen(false); action() }
          if (markOf(snapshot, root) !== undefined) {
            return h(MenuItemButton, { onSelect: run(() => void takeBack(root)), [DATA.takeBack]: true }, t('takeBack'))
          }
          return h(React.Fragment, null, snapshot.targets.map((target) => h(MenuItemButton, {
            key: target.key, onSelect: run(() => handOverRequest.open(root, target)), [DATA.handOver]: true, [DATA.target]: target.key,
          }, handOverLabel(t, target))))
        }
      }

      /**
       * One managed row's mark: V1's fish and "Managed by <agent>" as its text
       * alternative. It is still while idle and flips while the row runs; the label carries the
       * state, so reduced motion loses no information.
       */
      function ManagedMark({ t, mark, running }) {
        const label = managedByText(t, mark.principal)
        return h('span', {
          className: CLS.managedRow, role: 'img', 'aria-label': label, title: label,
          [DATA.managedRow]: mark.sessionId,
          [DATA.rowState]: running ? MANAGED_ROW.state.running : MANAGED_ROW.state.idle,
        }, h(FishMark, { size: MANAGED_ROW.iconPx, moving: running }))
      }

      /**
       * The idle mark in a DSH session row's leading cell. DSH mounts this seat only while the row
       * is idle; its own spinner takes the cell otherwise, so the running variant below uses the
       * trailing seat.
       */
      function makeRowMark(t) {
        return function ConnectorManagedRowMark({ sessionId }) {
          const mark = markOf(useSnapshot(), sessionId)
          return mark === undefined ? null : h(ManagedMark, { t, mark, running: false })
        }
      }

      /**
       * The running mark in a DSH session row's trailing seat (0.2.2's always-mounted seat). An idle
       * row renders nothing here, so it never shows two marks. 0.2.1-rc.5 has no trailing seat:
       * slots.inject waits for the declaration and this entry never mounts (no error).
       */
      function makeRowRunningMark(t) {
        return function ConnectorManagedRowRunningMark({ sessionId, useSessionStatus }) {
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
          const t = ctx.locale.bind(PART.ns)
          ctx.effect(() => ctx.locale.register(PART.ns, WORDING), LABEL.dictionaries)
          ctx.effect(mountStyles, LABEL.styles)
          const register = (slot, entry, Component) => ctx.slots.register({ name: slot, locale: PART.ns, ...entry }, Component)
          ctx.effect(() => ctx.slots.inject(SLOT.headerActions, () => register(SLOT.headerActions, { id: HAND_OVER.id, order: HAND_OVER.headerOrder }, makeHeaderAction(t))), LABEL.header)
          ctx.effect(() => ctx.slots.inject(SLOT.headerUtilities, () => register(SLOT.headerUtilities, { id: HAND_OVER.id, order: HAND_OVER.utilitiesOrder }, makeHeaderControl(t))), LABEL.headerControl)
          ctx.effect(() => ctx.slots.inject(SLOT.sessionMenu, () => register(SLOT.sessionMenu, { id: HAND_OVER.id, order: HAND_OVER.menuOrder }, makeMenuItems(t))), LABEL.menu)
          ctx.effect(() => ctx.slots.inject(SLOT.overlay, function* () {
            yield register(SLOT.overlay, { id: HAND_OVER.id }, makeHandOverDialog(t))
            yield register(SLOT.overlay, { id: HAND_OVER.noticeId }, makeTakeBackNotice(t))
          }), LABEL.dialogs)
          ctx.effect(() => ctx.slots.inject(SLOT.rowLeading, () => register(SLOT.rowLeading, { id: MANAGED_ROW.id }, makeRowMark(t))), LABEL.rowMark)
          // 0.2.2 keeps a row's trailing seat mounted while it runs; 0.2.1-rc.5 has no such seat and this waits.
          ctx.effect(() => ctx.slots.inject(SLOT.rowTrailing, () => register(SLOT.rowTrailing, { id: MANAGED_ROW.id }, makeRowRunningMark(t))), LABEL.rowRunning)
        },
      }
    }

    module.exports = { marksPart }
    return module.exports
  },
})
