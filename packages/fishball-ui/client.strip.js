/**
 * Fishball's DSH targets in the sidebar, browser half (MULTI-3; PLAN-MULTI §6.1, D03, Q01, Q08, Q09,
 * Q12; first the chat-top status strip, F-WIRE). A package-local chunk of fishball-ui's client (DSH
 * serves only flat `client.<name>.js` chunks, CLIENT_CHUNK, both SDKs); client.js starts `stripPart`.
 *
 * It draws what fishball-ui's Node row serves (src/status/route.js: `targetsView` of core's status
 * snapshot, one SSE frame per change) as the content of DSH's own `sidebar.workspaces` slot, at a
 * stronger priority than DSH's workspace browser and fishball-page's fail-closed Empty occupant, so
 * the sidebar keeps its native owner, shell, toggle, rail and drawer and only its content region is
 * Fishball's (PLAN-MULTI §6.1). There is no chat-top card any more (D03).
 *
 * Every target is a row: its name as plain text (D06; never HTML), or Q01's placeholder, and its
 * state's dot and badge. Pressing a row expands its details inline in the sidebar, no modal (Q08);
 * the other rows stay in place. Selecting is a view selection only (Q09): it sends nothing and sets
 * no routing default. The details hold why, the address (the URL is shown only here, Q01), the
 * contributed-tool count with zero shown, the live-name capability, the target's control (Connect /
 * Cancel), Retry when failed, its pairing warning and choices, and a way to core's settings page,
 * where targets are added, removed and edited. Every press names the stable `targetId` (core's
 * `SEAM_TARGETS.route`). Connect opens the approval page in a new tab with no link back to this
 * page, and also shows it as a link (a browser may block an open after an await unnoticed).
 *
 * In the rail (collapsed sidebar) the list is one dot per target, which expands the sidebar to that
 * target. A lost stream (kit HEALTH) keeps the rows readable, drops the cached states and controls,
 * and shows the kit's notice with Reconnect.
 */
window.__ModuleLoader__.load({
  id: 'fishball-ui',
  chunk: 'client.strip.js',
  factory(require) {
    const React = require('react')
    const { Button, Checkbox, StateDot, Tag, Tooltip, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconRefreshOutlineRegular, IconSlidersTwoOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * The connected badge's ink (UI-FIX-F), DSH tokens only: half the success colour, half the
     * theme's primary label, 5.7:1 (light) / 6.8:1 (dark) on the badge, as the old strip measured.
     */
    const SUCCESS_INK = 'color-mix(in srgb,var(--dsw-alias-state-success-primary) 50%,var(--dsw-alias-label-primary))'
    const TARGETS_UI = Object.freeze({
      name: 'fishball-ui: targets',
      slot: 'sidebar.workspaces',
      /**
       * Stronger (lower) than DSH's workspace browser (0) and fishball-page's Empty shadow (-1, its
       * `PAGE.priority`), so the list wins while this part runs and the page's Empty takes the slot
       * back, never the native browser, when it stops (PLAN-MULTI §6.1).
       */
      priority: -2,
      /**
       * fishball-page's mark on <html> while the Fishball page is open (fishball-page `PAGE.root`;
       * restated: a chunk imports no module). The list takes the sidebar only on that page; elsewhere
       * DSH's own workspace browser stays (PLAN-MULTI §6.1: the target list replaces it on Fishball's
       * page, not in every DSH that has fishball-ui).
       */
      pageRoot: 'data-fishball-page',
      // fishball-ui's route (src/status/route.js STRIP_ROUTE) and core's target routes
      // (`SEAM_TARGETS.route`), page-relative; restated: a chunk imports no module.
      events: 'api/fishball/strip',
      langParameter: 'lang',
      zoneParameter: 'tz',
      route: Object.freeze({
        connect: 'api/fishball/targets/connect', cancel: 'api/fishball/targets/cancel', retry: 'api/fishball/targets/retry',
        pairing: 'api/fishball/targets/pairing', targetIdField: 'targetId',
      }),
      // `SEAM_STATUS.control` and the `approval-url` ConnectBegin outcome (K3a connect.d.ts).
      action: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
      approvalOutcome: 'approval-url',
      webSchemes: Object.freeze(['https:', 'http:']),
      open: Object.freeze({ target: '_blank', features: 'noopener', rel: 'noopener noreferrer' }),
      // `targetsView`'s line kinds (src/status/index.js TARGET_LINE) the details lay out apart.
      line: Object.freeze({ url: 'url' }),
      css: Object.freeze({
        id: 'fishball-targets-style', root: 'fb-targets', head: 'fb-targets-head', list: 'fb-targets-list', item: 'fb-target',
        row: 'fb-target-row', name: 'fb-target-name', badge: 'fb-target-badge', chevron: 'fb-target-chevron', details: 'fb-target-details',
        line: 'fb-target-line', label: 'fb-target-label', url: 'fb-target-url', actions: 'fb-target-actions', link: 'fb-target-link',
        notice: 'fb-targets-notice', empty: 'fb-targets-empty', rail: 'fb-targets-rail', dot: 'fb-targets-dot', pairing: 'fb-target-pairing', error: 'fb-target-error',
      }),
      /**
       * Each public state's look (`SEAM_TARGETS.state`): DSH's Tag tone and StateDot state, and the
       * badge ink where DSH's Tag tone alone is too faint (UI-FIX-F). An unknown state draws failed,
       * as `targetsView` itself does; a lost stream draws the quiet `stale` look, which claims nothing.
       */
      tone: Object.freeze({
        connected: Object.freeze({ tag: 'success', dot: 'done', ink: SUCCESS_INK }),
        connecting: Object.freeze({ tag: 'info', dot: 'ongoing', ink: null }),
        failed: Object.freeze({ tag: 'danger', dot: 'error', ink: null }),
        'not-set': Object.freeze({ tag: 'neutral', dot: 'idle', ink: null }),
      }),
      staleTone: Object.freeze({ tag: 'outline', dot: 'idle', ink: null }),
      fallbackTone: 'failed',
      tooltip: Object.freeze({ side: 'right', portal: true }),
      // Connect is the details' call to action; Cancel only backs out of an attempt.
      buttonVariant: Object.freeze({ connect: 'primary', cancel: 'outline' }),
      icon: 14,
      /** The list's heading before any frame arrived (`targetsView`'s `title`, src/status/text.js; restated). */
      title: Object.freeze({ en: 'DSH targets', zh: 'DSH 目标' }),
    })
    const inkRule = (state, ink) => `.${TARGETS_UI.css.item}[data-fishball-target-state="${state}"] .${TARGETS_UI.css.badge}{color:${ink};box-shadow:inset 0 0 0 1px ${ink}}`
    const C = TARGETS_UI.css
    // DSH's own sidebar geometry (dsh-client-ui-sidebar): 36px rows, md radius, the hover fill, the
    // tertiary section caption; DSH tokens only, so both themes follow.
    const css = [
      `.${C.root}{display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 8px}`,
      `.${C.head}{display:flex;align-items:center;gap:8px;padding:8px 12px 6px;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-tertiary)}`,
      `.${C.list}{display:flex;flex-direction:column;gap:2px;flex:none;padding:0 8px 0 4px;margin:0;list-style:none}`,
      `.${C.item}{border-radius:var(--dsw-radius-md);min-width:0}`,
      `.${C.item}[data-open]{background:var(--dsw-alias-interactive-bg-hover)}`,
      `.${C.row}{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;box-sizing:border-box;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:none;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14);text-align:left;cursor:pointer}`,
      `.${C.row}:hover{background:var(--dsw-alias-interactive-bg-hover)}`,
      `.${C.row}:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}`,
      // A long, RTL or Unicode name is cut visually; its full text stays its accessible name and title.
      `.${C.name}{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:plaintext}`,
      `.${C.name}[data-placeholder]{color:var(--dsw-alias-label-secondary);font-style:italic}`,
      `.${C.badge}{flex:none}`,
      `.${C.chevron}{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary)}`,
      `.${C.details}{display:grid;gap:6px;padding:2px 10px 10px 26px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${C.line}{margin:0;overflow-wrap:anywhere}`,
      `.${C.label}{margin:0;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-tertiary)}`,
      `.${C.url}{margin:0;padding:4px 6px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform);font-family:var(--ds-font-family-code,monospace);overflow-wrap:anywhere}`,
      `.${C.actions}{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding-top:2px}`,
      `.${C.link}{color:var(--dsw-alias-link);text-decoration:none}`,
      `.${C.link}:hover{text-decoration:underline}`,
      `.${C.pairing}{display:grid;gap:6px;padding:8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-secondary)}`,
      `.${C.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
      `.${C.notice}{display:grid;gap:4px;margin:0 8px 6px 4px;padding:8px 10px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-state-warn-tertiary);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${C.notice}>p{margin:0}`,
      `.${C.empty}{display:grid;justify-items:start;gap:8px;margin:2px 8px 0 4px;padding:10px 12px;border-radius:var(--dsw-radius-md);border:.5px dashed var(--dsw-alias-border-l3);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
      `.${C.empty}>p{margin:0}`,
      `.${C.root}>[data-fishball-stream-notice]{margin:0 8px 6px 4px;border-radius:var(--dsw-radius-md)}`,
      // The rail: one 36px cell per target, as DSH's own rail rows.
      `.${C.rail}{display:flex;flex-direction:column;align-items:center;gap:12px;overflow-y:auto;min-height:0;padding:4px 0}`,
      `.${C.dot}{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:var(--dsw-radius-md);background:none;cursor:pointer}`,
      `.${C.dot}:hover{background:var(--dsw-alias-interactive-bg-hover)}`,
      ...Object.entries(TARGETS_UI.tone).filter(([, tone]) => tone.ink !== null).map(([state, tone]) => inkRule(state, tone.ink)),
    ].join('')
    /** The browser's own time zone, the one each pairing last-seen time is written in. */
    const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

    /** One targets stream per language for every mounted list (kit `langStream`, R-FIX-FUI health). */
    const targetsStream = (kit) => kit.langStream({
      path: TARGETS_UI.events, langParameter: TARGETS_UI.langParameter, params: () => ({ [TARGETS_UI.zoneParameter]: timeZone() }),
      valid: (next) => next !== null && typeof next === 'object' && Array.isArray(next.targets) && Array.isArray(next.notices),
    })

    /** One press on core's target route `path` with `{targetId, ...fields}` (kit `press`: `{status, body}`). */
    const post = (kit, path, targetId, fields = {}) => kit.press(path, { [TARGETS_UI.route.targetIdField]: targetId, ...fields })
    /** Connect's approval URL from its answer, web addresses only (defence in depth), else undefined. */
    function approvalUrlOf(answer) {
      if (answer?.outcome !== TARGETS_UI.approvalOutcome || typeof answer.url !== 'string' || !URL.canParse(answer.url)) return undefined
      return TARGETS_UI.webSchemes.includes(new URL(answer.url).protocol) ? answer.url : undefined
    }

    const toneOf = (target, live) => (live ? TARGETS_UI.tone[target.state] ?? TARGETS_UI.tone[TARGETS_UI.fallbackTone] : TARGETS_UI.staleTone)
    /** A target's shown name: the server's resolved name as text, or Q01's placeholder. */
    const shownName = (target) => target.name ?? target.placeholder

    /** One target's pairing: the warning lines, the box (Continue only once ticked, R-ID-07) and the choices. */
    function Pairing({ kit, lang, targetId, view, locked: streamLocked }) {
      const [ticked, setTicked] = React.useState(false)
      const [sending, setSending] = React.useState(false)
      const [failed, setFailed] = React.useState(null)
      const locked = sending || streamLocked
      const press = async (choice) => {
        setSending(true)
        setFailed(null)
        const answer = await post(kit, TARGETS_UI.route.pairing, targetId, { choice, confirmed: ticked })
        setSending(false)
        // The pairing card's own sentence first (R-FIX-FUI), then why core refused it.
        const why = kit.refusalText(answer, lang)
        setFailed(why === null ? null : `${view.failed} ${why}`)
      }
      return h('div', { className: C.pairing, 'data-fishball-pairing': view.state },
        h('p', { className: C.label }, view.title),
        view.lines.map((line) => h('p', { key: line.kind, className: C.line, 'data-fishball-pairing-line': line.kind }, line.text)),
        view.confirm === null ? null : h('div', { 'data-fishball-pairing-confirm': true },
          h(Checkbox, { checked: ticked, disabled: locked, label: view.confirm, onChange: (on) => setTicked(on === true) })),
        view.choices.length === 0 ? null : h('div', { className: C.actions },
          view.choices.map((entry, index) => h(Button, {
            key: entry.choice, type: 'button', size: 'sm', variant: index === 0 ? 'primary' : 'outline',
            disabled: locked || (entry.needsConfirm && !ticked), 'data-fishball-pairing-choice': entry.choice,
            onClick: () => void press(entry.choice),
          }, entry.label))),
        failed === null ? null : h('p', { className: C.error, role: 'alert', 'data-fishball-pairing-failed': true }, failed))
    }

    /** One target's inline details (Q08); `live` false locks every control (R-FIX-FUI). */
    function Details({ ctx, kit, lang, target, words, live, id }) {
      const [approvalUrl, setApprovalUrl] = React.useState(undefined)
      const [refused, setRefused] = React.useState(null)
      const [sending, setSending] = React.useState(false)
      // Only the latest press opens its approval page or shows its link (R-FIX-FUI F5/F6).
      const latest = React.useRef(0)
      const locked = sending || !live
      const act = async (path) => {
        const press = ++latest.current
        setSending(true)
        setRefused(null)
        const answer = await post(kit, path, target.targetId)
        setSending(false)
        if (press !== latest.current) return
        setRefused(kit.refusalText(answer, lang))
        const url = approvalUrlOf(answer.body)
        if (url !== undefined) window.open(url, TARGETS_UI.open.target, TARGETS_UI.open.features)
        setApprovalUrl(url)
      }
      const control = live ? target.control : null
      const lines = live ? target.lines.filter((line) => line.kind !== TARGETS_UI.line.url) : []
      return h('div', { className: C.details, id, 'data-fishball-target-details': target.targetId },
        lines.map((line) => h('p', { key: line.kind, className: C.line, 'data-fishball-target-line': line.kind }, line.text)),
        h('p', { className: C.label }, words.address),
        h('p', { className: C.url, 'data-fishball-target-line': TARGETS_UI.line.url }, target.url),
        live && target.pairing.lines.length > 0 ? h(Pairing, { key: target.pairing.key, kit, lang, targetId: target.targetId, view: target.pairing, locked }) : null,
        h('div', { className: C.actions },
          control === null ? null : h(Button, {
            type: 'button', size: 'sm', variant: TARGETS_UI.buttonVariant[control.action], disabled: locked,
            'data-fishball-target-control': control.action, onClick: () => void act(control.action === TARGETS_UI.action.connect ? TARGETS_UI.route.connect : TARGETS_UI.route.cancel),
          }, control.label),
          live && target.retry !== null ? h(Button, {
            type: 'button', size: 'sm', variant: 'outline', disabled: locked, 'data-fishball-target-retry': true, onClick: () => void act(TARGETS_UI.route.retry),
          }, h(IconRefreshOutlineRegular, { size: TARGETS_UI.icon }), target.retry) : null,
          h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'data-fishball-target-settings': true, onClick: () => kit.openCoreSettings(ctx) },
            h(IconSlidersTwoOutlineRegular, { size: TARGETS_UI.icon }), words.settings)),
        approvalUrl === undefined || control?.action !== TARGETS_UI.action.cancel ? null
          : h('a', { className: C.link, href: approvalUrl, title: approvalUrl, target: TARGETS_UI.open.target, rel: TARGETS_UI.open.rel, 'data-fishball-target-approval': true }, words.openApproval),
        refused === null ? null : h('p', { className: C.error, role: 'alert', 'data-fishball-target-refused': true }, refused))
    }

    /** One target: its row (name, dot, badge) and, while open, its details (Q08: inline, no modal). */
    function Target({ ctx, kit, lang, target, words, live, staleBadge, open, onToggle }) {
      const tone = toneOf(target, live)
      const name = shownName(target)
      const detailsId = React.useId()
      return h('li', {
        className: C.item, 'data-fishball-target': target.targetId, 'data-fishball-target-state': live ? target.state : undefined,
        'data-fishball-target-kind': target.kind, 'data-open': open ? '' : undefined,
      },
        h('button', { type: 'button', className: C.row, 'aria-expanded': open, 'aria-controls': detailsId, title: name, onClick: onToggle },
          h('span', { className: C.chevron, 'aria-hidden': 'true' }, h(open ? IconChevronDownOutlineRegular : IconChevronRightOutlineRegular, { size: TARGETS_UI.icon })),
          h(StateDot, { state: tone.dot }),
          // Plain text children: React escapes them, so a markup-looking name is shown as it is (D06).
          h('span', { className: C.name, 'data-fishball-target-name': true, 'data-placeholder': target.name === null ? '' : undefined }, name),
          h(Tag, { tone: tone.tag, className: C.badge }, h('span', { 'data-fishball-target-badge': true }, live ? target.badge : staleBadge))),
        open ? h(Details, { ctx, kit, lang, target, words, live, id: detailsId }) : null)
    }

    /**
     * Which target's details are open: a view selection only (Q09), never sent anywhere. Held by
     * the part, not the component, because DSH remounts the sidebar's content between its rail,
     * its wide column and rc.1's drawer, and a rail dot opens its target in the wide list.
     */
    function selection() {
      let current = null
      const listeners = new Set()
      return Object.freeze({
        get: () => current,
        set(next) { if (next === current) return; current = next; for (const listener of [...listeners]) listener() },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      })
    }

    function makeList(ctx, stream, kit, selected) {
      return function FishballTargets({ wide, expandSidebar }) {
        const lang = kit.useLang(ctx)
        React.useEffect(() => { stream.use(lang) }, [lang])
        const { frame: view, health } = React.useSyncExternalStore(stream.subscribe, stream.get)
        const openId = React.useSyncExternalStore(selected.subscribe, selected.get)
        const live = health === kit.HEALTH.live
        const targets = view?.targets ?? []
        const staleBadge = kit.staleText(lang)
        if (!wide) {
          // The rail: one dot per target; pressing one widens the sidebar onto that target.
          return h('div', { className: C.rail, 'data-fishball-targets': 'rail' },
            targets.map((target) => h(Tooltip, { key: target.targetId, ...TARGETS_UI.tooltip, label: `${shownName(target)} · ${live ? target.badge : staleBadge}` },
              h('button', { type: 'button', className: C.dot, 'aria-label': `${shownName(target)} · ${live ? target.badge : staleBadge}`, 'data-fishball-target': target.targetId,
                onClick: () => { selected.set(target.targetId); expandSidebar() } },
              h(StateDot, { state: toneOf(target, live).dot })))))
        }
        const title = view?.title ?? TARGETS_UI.title[lang] ?? TARGETS_UI.title.en
        return h('section', { className: C.root, 'data-fishball-targets': 'list', 'data-fishball-targets-stale': live ? undefined : health, 'aria-label': title },
          h('div', { className: C.head }, h('span', null, title)),
          h(kit.StreamNotice, { health, lang }),
          view !== null && view.notices.length > 0 ? h('div', { className: C.notice, role: 'status', 'data-fishball-targets-notices': true },
            view.notices.map((line) => h('p', { key: line.kind, 'data-fishball-targets-notice': line.kind }, line.text))) : null,
          // No target yet (standalone first run): say so and lead to where targets are added.
          view?.empty == null ? null : h('div', { className: C.empty, 'data-fishball-targets-empty': true },
            h('p', null, view.empty),
            h(Button, { type: 'button', size: 'sm', variant: 'outline', 'data-fishball-target-settings': true, onClick: () => kit.openCoreSettings(ctx) },
              h(IconSlidersTwoOutlineRegular, { size: TARGETS_UI.icon }), view.words.settings)),
          targets.length === 0 ? null : h('ul', { className: C.list },
            targets.map((target) => h(Target, {
              key: target.targetId, ctx, kit, lang, target, words: view.words, live, staleBadge,
              open: openId === target.targetId, onToggle: () => selected.set(openId === target.targetId ? null : target.targetId),
            }))))
      }
    }

    /**
     * Runs `effect()` while <html> carries the Fishball page's mark and disposes it when the mark
     * goes, following it live (the page may mount after this part, and unmounts on its own).
     * Returns the disposer of the whole watch.
     */
    function whilePage(effect) {
      const root = document.documentElement
      let dispose = null
      const sync = () => {
        const on = root.hasAttribute(TARGETS_UI.pageRoot)
        if (on && dispose === null) dispose = effect()
        else if (!on && dispose !== null) { dispose(); dispose = null }
      }
      const observer = new MutationObserver(sync)
      observer.observe(root, { attributes: true, attributeFilter: [TARGETS_UI.pageRoot] })
      sync()
      return () => { observer.disconnect(); dispose?.(); dispose = null }
    }

    /** The part as a client plugin over fishball-ui's kit (client.js `kit`). */
    function stripPart(kit) {
      function apply(ctx) {
        const stream = targetsStream(kit)
        const selected = selection()
        ctx.effect(() => kit.mountStyle(C.id, css), TARGETS_UI.name + ': styles')
        const List = makeList(ctx, stream, kit, selected)
        ctx.effect(() => whilePage(() => ctx.slots.inject(TARGETS_UI.slot, () => ctx.slots.register({ name: TARGETS_UI.slot, priority: TARGETS_UI.priority }, List))), TARGETS_UI.name + ': sidebar list')
      }
      return Object.freeze({ name: TARGETS_UI.name, inject: ['slots', 'layout', 'locale'], apply })
    }

    return { stripPart }
  },
})
