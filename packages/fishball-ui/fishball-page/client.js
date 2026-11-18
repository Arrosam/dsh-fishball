/** Native modules serves classic script registrations, not raw ESM exports. */
window.__ModuleLoader__.load({
  id: 'fishball-page',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { Button, Tooltip, StateDot, FishLogo, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX, IconSettingsOutlineRegular, IconRefreshOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const PAGE = Object.freeze({
      name: 'fishball-page', route: 'api/fishball/session', read: 'GET', ensure: 'POST',
      requestFailed: 'FISHBALL_SESSION_REQUEST_FAILED', invalidSession: 'FISHBALL_SESSION_INVALID',
      priority: -1,
      root: 'data-fishball-page', ready: 'data-fishball-session',
      hidden: 'data-fishball-hidden', label: 'aria-label',
      /**
       * Only the wide button contains the name slot; the mark alone also occurs in the rail toggle.
       * The brand chunk sets this attribute only while it owns the button's activation listeners.
       */
      brandControl: 'data-fishball-logo-control',
      brandName: '[data-slot="sidebar.brand.name"]',
      buttonTag: 'button',
      settingsSlot: 'settings.launcher', settingsButton: 'fishball-settings-launcher',
      /**
       * MULTI-3 (PLAN-MULTI §6.4): "Fishball" (back to the manager's conversation) and the page's
       * status are one entry of DSH's own `sidebar.footer.action` list ("optional actions beside
       * Settings at the sidebar foot", both SDKs), so they sit in the real sidebar: its wide column,
       * its rail, its rc.1 drawer and the narrow bottom bar alike. A list slot: the entry needs an id.
       */
      footer: Object.freeze({ name: 'sidebar.footer.action', id: 'fishball-page.return' }),
      // DSH's design-system Button for every page control (B4): the page draws no button of its own.
      button: Object.freeze({ size: 'sm', variant: 'ghost' }),
      /**
       * UI-POLISH-F (the user: "我更乐意看到是按钮的图标"): the controls are DSH's own icons with the
       * name as aria-label and DSH's Tooltip, as DSH's collapsed sidebar rail draws its Settings
       * trigger. Glyphs are the ones DSH uses for the same destinations (its Settings trigger, its
       * brand fish), all exported by the primitives in 0.2.1-rc.5 and 0.2.2-rc.1. 16px in the wide
       * column, 18px in the rail and bar, as DSH's own panel rows size theirs (dsh-client-ui-sidebar).
       */
      icon: Object.freeze({ wide: 16, rail: 18 }),
      // The rail's tooltips open to its right, as DSH's own rail rows do; in the bottom bar, above it.
      tooltip: Object.freeze({ rail: Object.freeze({ side: 'right', portal: true }), bar: Object.freeze({ side: 'top', portal: true }) }),
      navKind: 'data-fishball-nav', statusKind: 'data-fishball-nav-status',
      /**
       * Narrow windows (PLAN-MULTI §6.4, the user: the bottom row "实际上就是侧边栏，只是被重度修改了
       * 样式"): DSH's real sidebar is restyled into a fixed 44px bar on the window's bottom edge, and
       * the conversation is lifted by that height (DSH's composer stats row reaches the edge there).
       * 480px is the narrow breakpoint DSH's chat CSS uses (dsh-client-ui-chat, both SDKs); 44px is
       * DSH's 36px rail rows plus 4px padding each side. The row overflows by horizontal scroll (the
       * user: no More menu). `sheetGutterPx`: an expanded sidebar leaves this much of the
       * conversation visible, as rc.1's drawer does (dsh-client-ui-layout `viewport - 48`). Windows
       * titlebar mode supplies caption controls instead of a collapsed rail on both SDKs.
       */
      hasSupport: 'selector(:has(a))',
      narrow: Object.freeze({ query: '(max-width: 480px)', clearancePx: 44, sheetGutterPx: 48, layer: 25 }),
      css: Object.freeze({ iconButton: 'fishball-page-icon-button', rail: 'fishball-page-rail-button', status: 'fishball-page-status', footer: 'fishball-page-footer', row: 'fishball-page-row', hidden: 'fishball-page-visually-hidden' }),
      // The active-locale prefix that selects TEXT.zh; every other language reads TEXT.en.
      chinese: 'zh',
      main: '[data-slot="main.conversation"]',
      /**
       * DSH's stable hooks for the restyle (both SDKs), never its hashed class names: the layout
       * frame is the parent of its `data-shell-bottom` seat and carries `data-sidebar-collapsed` /
       * `data-sidebar-drawer` (dsh-client-ui-layout AppFrame); the sidebar's root is the one child of
       * its slot anchor; its regions are the parents of their slot anchors (dsh-client-ui-sidebar).
       * rc.1 keeps rendering wide controls inside its closed, inert drawer. The bar borrows that
       * column only while mountDrawerBar can make it interactive; the opener itself is untouched.
       */
      hook: Object.freeze({
        frame: ':has(>[data-shell-bottom])', drawer: '[data-sidebar-drawer]', collapsed: '[data-sidebar-collapsed]',
        column: '>:has(>[data-slot="sidebar"])',
        sidebar: '[data-slot="sidebar"]>*', workspaces: ':has(>[data-slot="sidebar.workspaces"])',
        foot: ':has([data-slot="sidebar.settings"])', regions: ':has(>[data-slot="sidebar.footer.action"]),:has(>[data-slot="sidebar.settings"])',
        handle: '[data-side="sidebar"]', windows: '[data-windows-titlebar]', centre: ':has([data-slot="main"])', rightbar: '[data-rightbar-col]',
      }),
      // Window focus re-reads the manager (GET only, never ensure); see refresh.
      reread: 'focus',
    })
    /**
     * The non-secret continuation PG-ORIGIN carries across native admission in the fragment
     * (dsh-instance's admission route, child-row.js with its constants.js TICKET.fragment; keep them
     * in step). Any other name or value is ignored, never acted on.
     */
    const SETTINGS_VIEW = 'settings'
    const CONTINUATION = Object.freeze({
      view: Object.freeze({ name: 'view', settings: SETTINGS_VIEW, values: Object.freeze([SETTINGS_VIEW]) }),
      lang: Object.freeze({ name: 'lang', values: Object.freeze(['zh', 'en']) }),
      query: '?',
    })
    /**
     * LITE shortcut policy (v2-final-scope §4.3, the user's rule "全部设置到一个非常复杂的键位作为临时解决方案").
     * Every editable command that leaves the Fishball page, opens the sidebar navigation or
     * creates/opens/switches/archives a session gets its own very complex binding in the child's
     * own origin storage (`dsh.keybindings.v1`, isolated by PG-ORIGIN). Native validation rejects
     * one binding on two commands, so each command has a distinct key. IDs: ui-workspace and
     * ui-layout in 0.2.1-rc.5 and 0.2.2-rc.1. settings.open/shortcuts.open are allowed native
     * destinations and stay unchanged (LITE-EP-07).
     */
    const SHORTCUTS = Object.freeze({
      modifiers: Object.freeze(['control', 'alt', 'shift', 'meta']),
      remap: Object.freeze([
        Object.freeze({ id: 'session.new', code: 'F13' }),
        Object.freeze({ id: 'session.search', code: 'F14' }),
        Object.freeze({ id: 'session.fork', code: 'F15' }),
        Object.freeze({ id: 'session.archive', code: 'F16' }),
        Object.freeze({ id: 'workspace.add', code: 'F17' }),
        Object.freeze({ id: 'session.rename', code: 'F18' }),
        // MULTI-3: `sidebar.left.toggle` is no longer remapped: the sidebar is Fishball's target list
        // now (PLAN-MULTI §6.1), and its native toggle and shortcut open it.
      ]),
      edit: 'set',
      config: Object.freeze({ loading: 'loading', unreadable: 'unreadable' }),
      result: Object.freeze({ saved: 'saved', stale: 'stale', notReady: 'not-ready' }),
      // Gesture flags in the normalized binding's modifier vocabulary.
      gesture: Object.freeze({ control: 'ctrlKey', alt: 'altKey', shift: 'shiftKey', meta: 'metaKey' }),
      keydown: 'keydown',
    })
    /**
     * Native localized accessibility labels of launchers that leave the Fishball session, grouped
     * by the element they label, by SDK dictionary namespace (same keys in 0.2.1-rc.5 and
     * 0.2.2-rc.1). Matched exactly, never as an English substring, because dictionaries can
     * arrive late and follow the active language.
     */
    const LABELS = Object.freeze([
      Object.freeze({ selector: 'button', keys: Object.freeze([
        Object.freeze({ namespace: 'sidebar', key: 'session.new.label' }),
        // The reply's branch action: forkAt -> uiWorkspace.openSession.
        Object.freeze({ namespace: 'chat', key: 'message.branch' }),
        // The empty-session hero chip; its picker slot is shadowed (SHADOWED_SLOTS), and the chip is hidden.
        Object.freeze({ namespace: 'conversation', key: 'hero.chooseWorkspace' }),
      ]) }),
      // The conversation's top navigation, hidden whole; see mountRemovals.
      Object.freeze({ selector: 'nav[aria-label]', keys: Object.freeze([
        Object.freeze({ namespace: 'conversation', key: 'session.hierarchy' }),
      ]) }),
    ])
    /**
     * Slots shadowed by an empty occupant (A-lite §11.3, first-choice mechanism):
     * - the empty-session hero's workspace picker. Picking a workspace connects or creates another
     *   blank session and opens it (ui-workspace connectBlank -> replaceMain); the menu is portalled
     *   to the body, so hiding its wrapper would not hide it. Both the chip and the inert composer's
     *   "choose workspace" trigger only open this slot, so with the shadow neither can leave the session;
     * - MULTI-3: the sidebar's workspace/session browser (`sidebar.workspaces`). fishball-ui's target
     *   list takes the slot at a stronger priority; this shadow keeps it fail-closed (never the
     *   native browser) while fishball-ui's part is absent or unloads (PLAN-MULTI §6.1). It is
     *   registered before anything else, so it is the last thing released.
     */
    const SHADOWED_SLOTS = Object.freeze(['sidebar.workspaces', 'conversation.hero.workspace'])
    /** The page controls' `data-fishball-nav` hooks. */
    const NAV = Object.freeze({ settings: 'settings', fishball: 'fishball', retry: 'retry' })
    /** Gate states: pending waits for real native events, never for a timer. */
    const GATE = Object.freeze({ pending: 'pending', protected: 'protected', failed: 'failed' })
    /** The navigation status kinds (`data-fishball-nav-status`) and the DSH StateDot each shows. */
    const NAV_STATUS = Object.freeze({
      unavailable: Object.freeze({ kind: 'unavailable', dot: 'error' }),
      failed: Object.freeze({ kind: 'failed', dot: 'error' }),
      pending: Object.freeze({ kind: 'pending', dot: 'ongoing' }),
    })
    /**
     * The reply's avatar: DSH's own fish mark (primitives FISH_LOGO_PATH / FISH_LOGO_VIEWBOX) as a CSS
     * mask, painted in a theme token, so it follows light and dark. A data: URL, which DSH's CSP
     * admits for images (img-src data:, both SDKs); the mark is a pseudo-element because the reply
     * rows are native and the page only styles them.
     */
    const AVATAR = Object.freeze({
      svg: (path, box) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.width} ${box.height}"><path d="${path}"/></svg>`,
      url: (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    })
    /**
     * The narrow sheet's dismissal and focus (the user, 2026-11-18, choice 8A): pointer/key events,
     * the first focusable control inside the sheet, and the key that closes it. rc.1's drawer has its
     * own mask, focus trap and Escape (dsh-client-ui-sidebar `useModalLayer`), so this applies only to
     * the restyle's sheet (a non-drawer frame); DSH's centre column is never made inert.
     */
    const SHEET = Object.freeze({
      pointerdown: 'pointerdown', click: 'click', keydown: 'keydown', escape: 'Escape',
      focusable: 'button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])',
    })
    const BRAND_ACTIVATION = Object.freeze({
      pointerEvents: Object.freeze(['click', 'pointerdown', 'pointerup']),
      keyEvents: Object.freeze(['keydown', 'keyup']), keys: Object.freeze(['Enter', ' ']),
    })
    /** In-frame navigation policy; see mountFrameGuard. */
    const FRAME = Object.freeze({
      navigate: 'navigate', click: 'click', anchor: 'a[href],area[href]', blank: '_blank', frame: 'iframe',
      features: 'noopener,noreferrer', web: Object.freeze(['http:', 'https:']),
      passTypes: Object.freeze(['reload', 'traverse']), primaryButton: 0,
    })
    const TEXT = Object.freeze({
      en: { back: 'Fishball', settings: 'Settings', unavailable: 'Fishball session unavailable', shortcuts: 'Fishball shortcut protection unavailable', pending: 'Preparing Fishball shortcut protection', retry: 'Retry' },
      zh: { back: 'Fishball', settings: '设置', unavailable: 'Fishball 会话不可用', shortcuts: 'Fishball 快捷键保护不可用', pending: '正在准备 Fishball 快捷键保护', retry: '重试' },
    })

    /**
     * The narrow bottom bar (PLAN-MULTI §6.4): DSH's real sidebar column, restyled. Scoped to this
     * page and to `PAGE.narrow.query`, without touching the native open drawer, so DSH elsewhere and
     * every wider window look as DSH draws them. Collapsed (the native rail), the column is a fixed
     * 44px row on the bottom edge: the native toggle, every `sidebar.panellist` row with its own
     * icon and active state, and the foot (this page's Fishball entry, Settings) kept in view at the
     * row's end while the panels scroll between it and the toggle. Expanded, it is a sheet over
     * the conversation, leaving `sheetGutterPx` of it visible, with the target list.
     */
    function barRules(root) {
      const { hook, narrow } = PAGE
      const base = `${root}:not(${hook.windows}) ${hook.frame}`
      const frame = `${base}:not(${hook.drawer})`
      const closed = `${base}${hook.collapsed}`
      const bar = `${closed}${hook.column}`
      const rail = `${frame}${hook.collapsed}${hook.column} ${hook.sidebar}`
      const sheet = `${frame}:not(${hook.collapsed})${hook.column}`
      const drawer = `${closed}${hook.drawer}${hook.column}`
      const drawerRoot = `${drawer} ${hook.sidebar}`
      const each = (prefix, list) => list.split(',').map((one) => `${prefix}${one}`).join(',')
      const sidebar = `${bar} ${hook.sidebar}`
      return [
        // At this width DSH's rightbar never has a track (dsh-client-ui-layout computeColumns: the
        // centre's 400px minimum leaves under 300px), so these tracks are exact, not a guess; only the
        // sidebar's own track is given up, to the bar or the sheet above the conversation.
        `${frame}{grid-template-columns:0px minmax(0px,1fr) minmax(0px,0px)!important}`,
        // rc.5's columns have no grid areas: with the sidebar out of flow the centre and the rightbar
        // would auto-place one track early (the centre into the zero first track, the rightbar's
        // fullscreen panel off-screen), so both are pinned to their own tracks.
        `${frame}>${hook.centre}{grid-column:2;grid-row:1}`,
        `${frame}>${hook.rightbar}{grid-column:3;grid-row:1}`,
        `${root} ${hook.handle}{display:none}`,
        `${bar}{position:fixed;left:0;right:0;bottom:0;top:auto;height:${narrow.clearancePx}px;width:auto;z-index:${narrow.layer};box-sizing:border-box;border-right:none;border-top:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-specific-sidebar-fill)}`,
        `${sidebar}{flex-direction:row!important;align-items:center;gap:4px;width:100%!important;height:100%;padding:4px 0 4px 8px!important;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain}`,
        `${sidebar}>*{display:flex;flex-direction:row!important;align-items:center!important;flex:none!important;gap:4px!important;height:auto!important;margin:0!important;padding:0!important}`,
        // Keep focus scrolling native. If the entire row scrolls, Chromium considers a panel
        // behind the sticky foot visible and won't scroll it into view on Tab. Use the actual
        // panel nav as the scrollport, with the toggle and footer outside its clip.
        `${sidebar}>nav{flex:0 1 auto!important;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain}`,
        `${sidebar}>nav>button{flex:none}`,
        // The list lives in the sheet; the bar is navigation only.
        `${sidebar}>${hook.workspaces}{display:none!important}`,
        `${sidebar}>${hook.foot}{position:sticky;right:0;margin-left:auto!important;padding:0 8px!important;align-self:stretch;background:var(--dsw-specific-sidebar-fill);box-shadow:-.5px 0 0 var(--dsw-alias-border-l3)}`,
        `${each(`${sidebar} `, hook.regions)}{display:flex!important;flex-direction:row;align-items:center;gap:4px;width:auto!important}`,
        // The rail's toggle shows the brand mark until hovered; in the bar it shows DSH's own
        // open-sidebar glyph, its sibling, so it is not taken for this page's Fishball button.
        `${rail} button>span:has(>[data-slot="sidebar.brand.mark"]){display:none!important}`,
        `${rail} button>span:has(>[data-slot="sidebar.brand.mark"])~svg{display:inline!important}`,
        `${closed} ${PAGE.main}>*{padding-bottom:${narrow.clearancePx}px;box-sizing:border-box}`,
        // AppFrame supplies an inline drawer width and an off-screen transform. Only its CLOSED
        // presentation changes; the open drawer still uses the host's geometry and modal layer.
        `${drawer}{width:100%!important;visibility:visible;transform:none;transition:none}`,
        // rc.1 keeps the wide brand (a button or a noninteractive span) beside the drawer toggle.
        // Only the toggle belongs in the closed bar, even when Fishball owns the brand button.
        `${drawerRoot} :is(button,span):has(${PAGE.brandName}){display:none!important}`,
        `${drawerRoot} :is(nav>button,[data-sidebar-toggle]){width:36px;height:36px;justify-content:center;gap:0;border-inline:0;padding:0}`,
        `${drawerRoot} nav>button>span[aria-hidden]+span{display:none}`,
        `${drawerRoot} :is(nav>button>span[aria-hidden]>[data-slot="sidebar.panellist"],[data-sidebar-toggle])>svg{width:18px;height:18px}`,
        `${sheet}{position:fixed;top:0;bottom:0;left:0;width:calc(100vw - ${narrow.sheetGutterPx}px);z-index:${narrow.layer};box-shadow:var(--dsw-elevation-panel)}`,
        `${sheet} ${hook.sidebar}{width:100%!important}`,
      ].map((rule) => `@media ${narrow.query}{${rule}}`)
    }

    // Browser CSSOM, not a style element: shipped precedent in both SDKs' sidebar-documentpreview
    // client.pdf.js:7749–7777. No nonce, eval, external asset, or CSP relaxation. Native boot itself
    // remains a separate CSP integration gate. MULTI-3: the sidebar is no longer hidden: it is
    // Fishball's target list (fishball-ui), with the workspace browser shadowed (SHADOWED_SLOTS), and
    // the narrow bottom bar (barRules).
    function mountStyles() {
      if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in document)) {
        throw new Error('FISHBALL_CONSTRUCTED_STYLESHEET_UNAVAILABLE')
      }
      const sheet = new CSSStyleSheet()
      const root = `[${PAGE.root}]`
      const avatar = AVATAR.url(AVATAR.svg(FISH_LOGO_PATH, FISH_LOGO_VIEWBOX))
      const rules = [
        // Keep rc.1's native drawer opener in the shell's leading seat, also when the bar is
        // visible. Its New Session button is still a forbidden launcher (LABELS).
        `${root} [${PAGE.hidden}]{display:none!important}`,
        `${root} [data-conversation-header-leading],${root} [data-slot="conversation.session.header.lineage"],${root} [data-slot="conversation.hero.workspace"]{display:none!important}`,
        `${root}:not([${PAGE.ready}]) ${PAGE.main}{visibility:hidden!important;pointer-events:none!important}`,
        // Square icon buttons: DSH's sm Button is 28px high; in the rail and the bar 36px, as DSH's
        // own rail rows. Restated, not shared, with fishball-ui's `fb-ui-icon-button` (client.js):
        // this page is its own package and loads no chunk of fishball-ui's client.
        `.${PAGE.css.iconButton}{width:28px;padding:0;color:var(--dsw-alias-label-secondary)}`,
        `.${PAGE.css.iconButton}[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}`,
        `.${PAGE.css.footer}{display:flex;align-items:center;gap:2px;flex-wrap:wrap;min-width:0}`,
        `.${PAGE.css.footer}:not([data-wide]){flex-direction:column}`,
        // Every icon-only page control in the rail and the bar (Fishball, Retry, the Settings launcher in
        // DSH's own settings seat) is 36px square, as DSH's own rail rows are.
        `.${PAGE.css.rail}{width:36px;height:36px;border-radius:var(--dsw-radius-md)}`,
        `.${PAGE.css.hidden}{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}`,
        `@media ${PAGE.narrow.query}{.${PAGE.css.footer}:not([data-wide]){flex-direction:row}}`,
        // A wide row: icon and name, as DSH's own panel rows and Settings trigger.
        `.${PAGE.css.row}{width:100%;justify-content:flex-start;gap:8px;height:36px;padding:0 8px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14)}`,
        `.${PAGE.css.status}{display:inline-flex;align-items:center;gap:6px;padding:0 4px;min-width:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}`,
        `.${PAGE.css.status}[${PAGE.statusKind}="unavailable"],.${PAGE.css.status}[${PAGE.statusKind}="failed"]{color:var(--dsw-alias-state-error-primary)}`,
        // The restyle needs `:has()`; a browser without it keeps DSH's own narrow layout rather than
        // failing the whole page on an unparsable rule.
        ...(CSS.supports(PAGE.hasSupport) ? [
          // Hide the unowned wide brand immediately, including replacement DOM before observers run.
          `${root} ${PAGE.buttonTag}:has(${PAGE.brandName}):not([${PAGE.brandControl}]){display:none!important}`,
          ...barRules(root),
        ] : []),
        // Fishball's replies: DSH's fish mark and the name above an assistant bubble, the user's own
        // bubble left as DSH draws it, with its thin stroke.
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]{position:relative;margin:6px 12% 6px 0;padding:20px 0 0 36px}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]::after{content:"Fishball";position:absolute;top:0;left:36px;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-tertiary)}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="user"] [class$="_bubble"]{background:var(--dsw-specific-bubble);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2)}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]::before{content:"";position:absolute;left:2px;top:22px;width:24px;height:24px;background:var(--dsw-alias-state-business-primary);-webkit-mask:${avatar} center/contain no-repeat;mask:${avatar} center/contain no-repeat}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]>[data-slot="conversation.chat.node"]>*{padding:8px 14px;border-radius:var(--dsw-radius-xs) var(--dsw-radius-xl) var(--dsw-radius-xl) var(--dsw-radius-xl);background:var(--dsw-alias-bg-module-platform);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2);min-width:0}`,
        `${root} ${PAGE.main} .md-table-wide{width:auto;max-width:100%;margin-left:0;padding-left:0}`,
      ]
      for (const rule of rules) sheet.insertRule(rule, sheet.cssRules.length)
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      return () => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter(value => value !== sheet) }
    }

    // Hide the LABELS launchers. No plugin's Remove control is hidden (v3-design §6.2: V2's Remove-
    // hiding is not revived; a removed set member is re-placed at the next start), so every child
    // plugin keeps its native uninstall. The conversation's
    // top navigation, the session-hierarchy nav, is hidden whole: its crumb buttons open other
    // sessions (ui-conversation open(id)) and in 0.2.2-rc.1 every crumb, the current title too, is
    // a tabIndex 0 context-menu trigger for Fork/Archive/Rename/Pin (ui-workspace session menus).
    function mountRemovals(ctx) {
      const marked = new Set()
      const text = ({ namespace, key }) => ctx.locale.bind(namespace)(key)
      function reconcile() {
        const next = new Set()
        // One query per element kind, not per label: this runs on every observed mutation.
        for (const { selector, keys } of LABELS) {
          const labels = new Set(keys.map(text))
          for (const node of document.querySelectorAll(selector)) {
            if (!labels.has(node.getAttribute(PAGE.label))) continue
            // DSH can rewrite the label even while the brand still owns the click.
            if (node.hasAttribute(PAGE.brandControl)) continue
            next.add(node)
          }
        }
        for (const node of marked) if (!next.has(node)) node.removeAttribute(PAGE.hidden)
        for (const node of next) if (!marked.has(node)) node.setAttribute(PAGE.hidden, '')
        marked.clear()
        for (const node of next) marked.add(node)
        // MULTI-3: the rc.1 drawer is no longer forced closed: it is how the target list is reached
        // below 768px there (the user's choice, PLAN-MULTI §6.4).
      }
      const observer = new MutationObserver(reconcile)
      observer.observe(document.body, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: [PAGE.label, PAGE.brandControl] })
      const unsubscribe = ctx.locale.subscribe(reconcile)
      reconcile()
      // Even a synthetic click or a queued keyboard activation on a now-hidden button must not
      // bubble to DSH's startSession. The rail toggle has no name slot and is never intercepted.
      const blockUnownedBrand = (event) => {
        if (BRAND_ACTIVATION.keyEvents.includes(event.type) && !BRAND_ACTIVATION.keys.includes(event.key)) return
        // React delegates Text-targeted events to the parent element; capture must do the same.
        const target = event.target
        const button = (target?.closest ? target : target?.parentElement)?.closest?.(PAGE.buttonTag)
        if (!button?.querySelector?.(PAGE.brandName) || button.hasAttribute(PAGE.brandControl)) return
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      const events = [...BRAND_ACTIVATION.pointerEvents, ...BRAND_ACTIVATION.keyEvents]
      for (const type of events) document.addEventListener(type, blockUnownedBrand, true)
      return () => {
        for (const type of events) document.removeEventListener(type, blockUnownedBrand, true)
        observer.disconnect()
        unsubscribe()
        for (const node of marked) node.removeAttribute(PAGE.hidden)
      }
    }

    /** Borrow the closed drawer's interactivity and dialog role, never its state or modal handlers.
     * React doesn't reapply an unchanged prop on resize/unload, so return it explicitly, but
     * only if the column still belongs to a CLOSED drawer (never strand an open drawer inert).
     */
    function mountDrawerBar(media, active) {
      const { hook } = PAGE
      const closed = `${hook.frame}${hook.drawer}${hook.collapsed}${hook.column}`
      const eligible = `[${PAGE.root}]:not(${hook.windows}) ${closed}`
      let leased = null
      let navigation = null
      const restoreRole = () => {
        // React removes the native role itself when leaving drawer mode.
        if (navigation?.getAttribute('role') === 'navigation' && navigation.closest(hook.drawer)) navigation.setAttribute('role', 'dialog')
        navigation = null
      }
      const restore = () => {
        restoreRole()
        if (leased?.matches(closed)) {
          if (leased.contains(document.activeElement)) leased.parentElement.querySelector('[data-sidebar-opener]')?.focus({ preventScroll: true })
          leased.inert = true
        }
        leased = null
      }
      const sync = () => {
        const next = media.matches ? document.querySelector(eligible) : null
        if (next !== leased) restore()
        if (next?.inert) {
          leased = next
          next.inert = false
        }
        active.set(leased !== null)
        const root = leased?.querySelector(hook.sidebar)
        if (root !== navigation) restoreRole()
        if (root?.getAttribute('role') === 'dialog') {
          navigation = root
          root.setAttribute('role', 'navigation')
        }
      }
      // React can mount/replace the frame after the page plugin. Ignore ordinary chat content
      // mutations as long as the leased column is connected; only layout attributes can end it.
      const observer = new MutationObserver(records => {
        if (!media.matches || (navigation?.isConnected && records.every(r => r.type === 'childList'))) return
        sync()
      })
      observer.observe(document.body, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-sidebar-collapsed', 'data-sidebar-drawer', 'inert'] })
      media.addEventListener('change', sync)
      sync()
      return () => { observer.disconnect(); media.removeEventListener('change', sync); restore() }
    }

    /**
     * The narrow sheet (barRules: the expanded sidebar over the conversation on a narrow, non-drawer
     * frame): a press outside it (the conversation gutter) or Escape closes it through DSH's public
     * toggle, and focus moves into it when it opens. Nothing happens in any other layout.
     */
    function mountSheet(ctx, drawerBar) {
      const media = window.matchMedia(PAGE.narrow.query)
      // The same scope as barRules: without `:has()` support there is no sheet restyle to manage.
      if (!CSS.supports(PAGE.hasSupport)) return () => {}
      const frame = () => document.querySelector(PAGE.hook.frame)
      const column = () => document.querySelector(PAGE.hook.sidebar)?.closest(`${PAGE.hook.frame}>*`) ?? null
      const open = () => {
        const f = frame()
        return media.matches && !document.documentElement.matches(PAGE.hook.windows) && f !== null && !f.matches(PAGE.hook.drawer) && !f.matches(PAGE.hook.collapsed)
      }
      const close = () => { if (open()) ctx.layout.toggleSidebar() }
      // Only the gutter (the layout frame outside the sheet) closes it: a press in a portalled
      // surface the sheet opened (DSH's Settings dialog, a tooltip, a menu) lies outside the frame.
      // The press that closes the sheet is consumed: its click must not also act on the conversation
      // control under the gutter.
      let swallowClick = false
      const pointer = (event) => {
        // A press that ended without a click (a drag) must not swallow a later, unrelated click.
        swallowClick = false
        if (!open() || !frame()?.contains(event.target) || column()?.contains(event.target) !== false) return
        swallowClick = true
        close()
      }
      const click = (event) => {
        if (!swallowClick) return
        swallowClick = false
        event.preventDefault()
        event.stopPropagation()
      }
      // Escape while focus is in the sheet (or nowhere), after DSH's own handlers: a dialog or menu
      // that handles its Escape first marks it handled, and the sheet stays.
      const key = (event) => {
        const focus = document.activeElement
        if (event.key !== SHEET.escape || event.defaultPrevented || !open() || !(focus === document.body || column()?.contains(focus))) return
        event.preventDefault()
        close()
        // The list collapses into the bar, where it is not shown: focus goes to the bar's first
        // control (DSH's own sidebar toggle) instead of falling to <body>.
        requestAnimationFrame(() => column()?.querySelector(SHEET.focusable)?.focus())
      }
      // Chromium leaves a partially visible panel clipped on Tab. Reveal only that button
      // in its own scrollport, without moving the page or intercepting the host's keys.
      const panel = `[${PAGE.root}]:not(${PAGE.hook.windows}) ${PAGE.hook.frame}${PAGE.hook.collapsed} ${PAGE.hook.sidebar}>nav>button`
      const reveal = ({ target }) => {
        if (!media.matches || !target.matches?.(panel)) return
        const nav = target.parentElement
        const box = target.getBoundingClientRect(), clip = nav.getBoundingClientRect()
        if (box.left < clip.left) nav.scrollLeft += box.left - clip.left
        else if (box.right > clip.right) nav.scrollLeft += box.right - clip.right
      }
      document.addEventListener('focusin', reveal)
      const releaseDrawerBar = mountDrawerBar(media, drawerBar)
      let wasOpen = open()
      const observer = new MutationObserver(() => {
        const now = open()
        // Opening moves focus to the sheet's first control, unless focus is already inside it.
        if (now && !wasOpen && column()?.contains(document.activeElement) === false) column()?.querySelector(SHEET.focusable)?.focus()
        wasOpen = now
      })
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-sidebar-collapsed', 'data-sidebar-drawer'] })
      document.addEventListener(SHEET.pointerdown, pointer, true)
      document.addEventListener(SHEET.click, click, true)
      document.addEventListener(SHEET.keydown, key)
      return () => {
        observer.disconnect()
        releaseDrawerBar()
        document.removeEventListener('focusin', reveal)
        document.removeEventListener(SHEET.pointerdown, pointer, true)
        document.removeEventListener(SHEET.click, click, true)
        document.removeEventListener(SHEET.keydown, key)
      }
    }

    /** The validated fragment continuation; an absent or unlisted value is null. */
    function readContinuation() {
      // The fragment body is a query string (`view=settings&lang=zh`); URL parses it as one.
      const query = new URL(CONTINUATION.query + window.location.hash.slice(1), document.baseURI).searchParams
      const pick = ({ name, values }) => {
        const value = query.get(name)
        return values.includes(value) ? value : null
      }
      return Object.freeze({ view: pick(CONTINUATION.view), lang: pick(CONTINUATION.lang) })
    }

    /**
     * The connector chose the frame's language (contract 1.1 UI_LANG). setLocale is the only
     * native write entry and always persists, so it is called only when the language differs
     * and is registered; it persists into the child's own home, never main's.
     */
    function applyLanguage(ctx, lang) {
      const snapshot = ctx.locale.getLocale()
      if (lang === null || snapshot.active === lang || !snapshot.locales.some(locale => locale.id === lang)) return
      ctx.locale.setLocale(lang)
    }

    // Producer contract (fishball-core src/session/route.js): document-relative, native cookie auth, no-store.
    // GET is a read-only lookup (null = no manager yet); POST ensures THE manager and must
    // return an ID. 503/auth/transport/malformed responses reject and never select a guessed
    // or stale session.
    async function requestSession(method, signal) {
      const response = await fetch(new URL(PAGE.route, document.baseURI), {
        method, credentials: 'same-origin', cache: 'no-store', signal,
      })
      if (!response.ok) throw new Error(PAGE.requestFailed)
      const body = await response.json()
      if (method === PAGE.read && body?.sessionId === null) return null
      if (typeof body?.sessionId !== 'string' || !body.sessionId.trim()) throw new Error(PAGE.invalidSession)
      return body.sessionId
    }

    /** One observable value with change listeners; React reads it through useSyncExternalStore. */
    function createCell(initial) {
      let value = initial
      const listeners = new Set()
      return {
        get: () => value,
        set(next) { if (next === value) return; value = next; listeners.forEach(listener => listener()) },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        clear() { listeners.clear() },
      }
    }

    // Normalized bindings (code-sorted, canonical modifier order), so field equality is binding
    // equality; null is "unbound" and equals only null.
    const sameBinding = (left, right) => left === null || right === null
      ? left === right
      : left.code === right.code && left.secondCode === right.secondCode && left.modifiers.join('+') === right.modifiers.join('+')

    /**
     * Child-only shortcut reconciliation through the public `shortcuts` service (LITE-UC-01,
     * DT-01..09, ST-01..03). Contract:
     * - start() is called only after the child's own session route answered at this document's
     *   origin, the proof that writes land in the isolated child origin (DT-01).
     * - One serialized runner; notifications during a run schedule exactly one rerun (ST-01).
     * - The desired binding is the distinct complex one when the native validator accepts it
     *   for this device; otherwise explicit null (Web Linux admits no such combination; there
     *   these commands have no default binding at all). No numeric "complexity" is invented.
     * - Satisfied commands are never edited, so a satisfied map costs zero writes (DT-04).
     * - saved/stale reread the live snapshot (DT-05/06); loading/not-ready wait for the next
     *   native catalog/config event (DT-02); unreadable/conflict/write-failed/throw fail the gate
     *   with Retry and no reset-all, direct storage write or rollback (DT-03/07/08/09).
     * - Gesture guard: until a relevant command is satisfied, a keydown exactly matching its
     *   current native binding is withheld from DSH's window-level dispatch. Only those
     *   gestures, never blanket Enter/Escape (EP-11). The guard is prevention before activation.
     */
    function mountShortcuts(ctx, gate) {
      const shortcuts = ctx.shortcuts
      let started = false
      let disposed = false
      let running = false
      // Requests that arrived during a run; a Retry outranks a plain notification.
      let rerun = false
      let retryQueued = false
      /** The native-normalized desired binding, or null when this device rejects or occupies it. */
      function desired(target) {
        const described = shortcuts.describeBinding({ code: target.code, modifiers: SHORTCUTS.modifiers })
        const free = described.conflicts.every(id => id === target.id)
        return described.issue === null && free ? described.binding : null
      }
      /** Registered relevant commands whose current binding differs from the desired one. */
      function unsatisfied() {
        const catalog = shortcuts.catalog.getSnapshot()
        return SHORTCUTS.remap.flatMap(target => {
          const entry = catalog.find(row => row.id === target.id)
          if (entry === undefined) return []
          const binding = desired(target)
          return sameBinding(entry.binding, binding) ? [] : [{ target, entry, binding }]
        })
      }
      async function reconcile() {
        // A command saved once and still unsatisfied would loop forever; that is a failure.
        const saved = new Set()
        for (;;) {
          if (disposed) return
          const config = shortcuts.config.getSnapshot()
          if (config.status === SHORTCUTS.config.unreadable) throw new Error(config.error ?? config.status)
          if (config.status === SHORTCUTS.config.loading) { gate.set(GATE.pending); return }
          const [next] = unsatisfied()
          if (next === undefined) { gate.set(GATE.protected); return }
          gate.set(GATE.pending)
          const result = await shortcuts.edit({ type: SHORTCUTS.edit, id: next.target.id, binding: next.binding }, config.revision)
          if (result.status === SHORTCUTS.result.notReady) return
          if (result.status === SHORTCUTS.result.saved) {
            if (saved.has(next.target.id)) throw new Error(result.status)
            saved.add(next.target.id)
          } else if (result.status !== SHORTCUTS.result.stale) throw new Error(result.status)
        }
      }
      function run() {
        running = true
        reconcile().catch(() => { if (!disposed) gate.set(GATE.failed) }).finally(() => {
          running = false
          const retried = retryQueued
          const notified = rerun
          retryQueued = false
          rerun = false
          if (retried) retry()
          else if (notified) schedule()
        })
      }
      // A failed gate holds unavailable (DT-08): only Retry reconciles again, so unrelated
      // catalog/config notifications neither write nor flip the status.
      function schedule() {
        if (!started || disposed) return
        if (running) { rerun = true; return }
        if (gate.get() !== GATE.failed) run()
      }
      function retry() {
        if (!started || disposed) return
        // Queued, not dropped, so a Retry pressed during a run that then fails still reruns.
        if (running) { retryQueued = true; return }
        gate.set(GATE.pending)
        run()
      }
      function matches(binding, event) {
        return binding !== null && binding.secondCode === undefined && binding.code === event.code &&
          Object.entries(SHORTCUTS.gesture).every(([modifier, flag]) => binding.modifiers.includes(modifier) === event[flag])
      }
      function guard(event) {
        if (unsatisfied().some(({ entry }) => matches(entry.binding, event))) {
          event.preventDefault()
          event.stopPropagation()
        }
      }
      // Capture on window runs before DSH's bubbling window listener and the target's handlers.
      window.addEventListener(SHORTCUTS.keydown, guard, true)
      // catalog and config share one native store, so one subscription sees both.
      const unsubscribe = shortcuts.catalog.subscribe(() => schedule())
      return {
        start() { started = true; schedule() },
        retry,
        dispose() {
          disposed = true
          unsubscribe()
          window.removeEventListener(SHORTCUTS.keydown, guard, true)
        },
      }
    }

    /**
     * Keep the child document on the Fishball page (rc.1 liveshare viewer and third-party child
     * plugins can navigate this frame). Prevention, not correction: an away navigation is
     * cancelled before it happens; a user-initiated web link opens in a new window instead, like
     * native chat links. Hash changes, downloads, reloads, history traversal and navigations to
     * this same document (they land on Fishball again) pass. The Navigation API covers script
     * `location` writes where the browser has it; the anchor click capture covers links in every
     * browser, including _top/_parent targets. Documented limits: script writes in browsers without
     * the Navigation API, and script writes to `top`/`parent` location, which this frame cannot veto.
     */
    function mountFrameGuard() {
      const here = () => new URL(window.location.href)
      const sameDocument = url => { const current = here(); return url.origin === current.origin && url.pathname === current.pathname && url.search === current.search }
      const openAside = url => { if (FRAME.web.includes(url.protocol)) window.open(url.href, FRAME.blank, FRAME.features) }
      // A new window, or a named frame inside this document, does not navigate this document.
      // Empty, _self, _top, _parent and unknown names navigate this document or the main DSH.
      const keepsTarget = target => target.toLowerCase() === FRAME.blank ||
        (target !== '' && [...document.getElementsByName(target)].some(node => node.localName === FRAME.frame))
      function navigate(event) {
        if (!event.cancelable || event.hashChange || typeof event.downloadRequest === 'string' || FRAME.passTypes.includes(event.navigationType)) return
        const url = new URL(event.destination.url)
        if (sameDocument(url)) return
        event.preventDefault()
        if (event.userInitiated) openAside(url)
      }
      function click(event) {
        if (event.defaultPrevented || event.button !== FRAME.primaryButton || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        // HTML anchors only: an SVG <a> has no string href and DSH renders none as a link.
        const anchor = event.composedPath().find(node => node instanceof Element && node.matches(FRAME.anchor) && typeof node.href === 'string') ?? null
        if (anchor === null || anchor.hasAttribute('download') || keepsTarget(anchor.target)) return
        const url = new URL(anchor.href, document.baseURI)
        if (sameDocument(url)) return
        event.preventDefault()
        openAside(url)
      }
      const navigation = window.navigation
      navigation?.addEventListener(FRAME.navigate, navigate)
      document.addEventListener(FRAME.click, click, true)
      return () => {
        navigation?.removeEventListener(FRAME.navigate, navigate)
        document.removeEventListener(FRAME.click, click, true)
      }
    }

    /**
     * The manager session: lookup/ensure, the one intended selection and explicit return.
     * No drift correction and no archive cleanup (the user rejected both: "这个方案听起来就很不稳定。不要").
     * The assigned manager is opened once when it is known, the shortcut gate is protected and the
     * session list carries it, and again only when the user asks (Fishball button, Retry). Whatever else the
     * main view shows is left alone; the conversation surface is simply not marked ready.
     * adapter.current is the public renderer-facing binding source in both versions; key is the ID.
     */
    function mountSession(ctx, manager, gate, shortcuts) {
      const abort = new AbortController()
      const source = ctx.uiSession.adapter.current
      let disposed = false
      let lookup = null
      // The manager the one intended selection was made for; Retry clears it to select again.
      let selectedFor = null
      // Two owners: a successful lookup clears a lookup failure; a failed selection is cleared
      // only by the next selection or by the main view showing the manager (markReady): a failed
      // selection is about the main view, so once it shows the manager it no longer holds (B3).
      // That can follow any refresh, because each one re-marks. DSH can open or restore that Session itself, so the one
      // openSession can reject while the manager is on screen; that rejection is not shown.
      const lookupFailed = createCell(false)
      const selectFailed = createCell(false)
      const shows = target => source.getSnapshot().key === target
      /**
       * openSession throws `unknown session` for an id the session list does not carry yet
       * (session-controller resolveTarget, both SDKs), and on a fresh child origin the route can
       * answer before the list arrives. So the selection waits for the listed manager, as the
       * rc.1 liveshare viewer does. Order with native startup restoration: the selectPanel(null)
       * below (and openSession's own) aborts a restoration already pending (layout
       * beginNavigation), and a later one sees the main reference set and stops, so the manager
       * stays on screen. Only the first selection waits here: once made, list changes never
       * select again (selectOnce), so they cannot undo the user's in-page navigation. The blank Session that
       * restoration may already have created stays (accepted in docs/planning/v2-lite.md).
       */
      const listed = target => ctx.sessions.list.getSnapshot().byId[target] !== undefined
      function select() {
        const target = manager.get()
        if (disposed || target === null || gate.get() !== GATE.protected || !listed(target)) return
        selectedFor = target
        selectFailed.set(false)
        ctx.layout.selectPanel(null)
        if (shows(target)) return
        Promise.resolve().then(() => ctx.uiWorkspace.openSession(target)).catch(() => { if (!disposed && !shows(manager.get())) selectFailed.set(true) })
      }
      /** The first selection of a newly known manager; select() itself waits for protection. */
      function selectOnce() {
        const target = manager.get()
        if (target !== null && target !== selectedFor) select()
      }
      function markReady() {
        const target = manager.get()
        const shown = target !== null && shows(target)
        if (shown) selectFailed.set(false)
        document.documentElement.toggleAttribute(PAGE.ready, shown && gate.get() === GATE.protected)
      }
      /** Every manager, gate or main-view change: the pending first selection, then the ready mark. */
      function mark() {
        if (disposed) return
        selectOnce()
        markReady()
      }
      // User decision 7.A (2026-11-09): with no manager yet, ensure it so the native composer
      // has a real Session. Only the page-open lookup and an explicit Retry pass ensure; any
      // other refresh (sessions.list, focus) only re-reads, so an unavailable state (GET or
      // POST 503) waits for Retry instead of re-posting. ensure is a per-call argument, not
      // shared state, so a coalesced call can never leave an allowance for a later refresh.
      function refresh(ensure = false) {
        if (disposed) return Promise.resolve()
        if (lookup) return ensure ? lookup.then(() => refresh(true)) : lookup
        lookup = requestSession(PAGE.read, abort.signal).then(value => {
          if (value !== null || !ensure || disposed) return value
          return requestSession(PAGE.ensure, abort.signal)
        }).then(value => {
          if (disposed) return
          lookupFailed.set(false)
          // A successful answer from the child's own route proves this document is the
          // child's origin; only then may the child's shortcut preferences be written.
          shortcuts.start()
          manager.set(value)
          mark()
        }, () => {
          if (!disposed) { lookupFailed.set(true); manager.set(null); mark() }
        }).finally(() => { lookup = null })
        return lookup
      }
      // A list change can be the one that first carries the manager, so it also re-marks.
      const unsubscribers = [source.subscribe(mark), gate.subscribe(mark),
        ctx.sessions.list.subscribe(() => { mark(); void refresh() })]
      // A listener wrapper: addEventListener would otherwise pass the Event as ensure.
      const reread = () => { void refresh() }
      window.addEventListener(PAGE.reread, reread)
      void refresh(true)
      mark()
      return {
        lookupFailed,
        selectFailed,
        retry() {
          shortcuts.retry()
          // Re-arm the selection only after the lookup answered, so it uses that answer, never
          // the previous manager. select() skips openSession when the main view already shows it.
          return refresh(true).then(() => { selectedFor = null; mark() })
        },
        back() { select() },
        dispose() {
          disposed = true
          abort.abort()
          unsubscribers.forEach(dispose => dispose())
          window.removeEventListener(PAGE.reread, reread)
          lookupFailed.clear()
          selectFailed.clear()
          document.documentElement.removeAttribute(PAGE.ready)
        },
      }
    }

    // Own-prefix event definition helper exported by the classic module for Fishball consumers.
    // render maps a native Definition context to a native ViewNode; it is not a React component.
    function recordDefinition(packageName, suffix, render) {
      const prefix = `plugin:${packageName}/`
      if (typeof packageName !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(packageName) ||
          typeof suffix !== 'string' || !suffix || typeof render !== 'function') throw new TypeError('INVALID_RECORD_DEFINITION')
      const type = suffix.startsWith('plugin:') ? suffix : prefix + suffix
      if (!type.startsWith(prefix) || type === prefix) throw new TypeError('FOREIGN_RECORD_PREFIX')
      return {
        kind: type, target: 'chat',
        match: event => event.type === type ? { id: String(event.seq), role: 'start' } : null,
        start: (_context, match) => match.event,
        update: context => context.state,
        buildViewNode: render,
      }
    }

    /** The active language's copy; `locale` is one stable {subscribe, get} pair per apply. */
    function useText(locale) {
      return React.useSyncExternalStore(locale.subscribe, locale.get).active.startsWith(PAGE.chinese) ? TEXT.zh : TEXT.en
    }
    const useCell = cell => React.useSyncExternalStore(cell.subscribe, cell.get)
    /** The empty occupant of a shadowed slot. */
    const Empty = () => null
    /**
     * The navigation status (`NAV_STATUS` kind and dot, and its text), or null when the page is
     * protected and needs none. Session trouble outranks the shortcut gate; a known manager behind a
     * pending gate is shown as pending, never as a blank page.
     */
    function navStatus(text, { unavailable, gate }) {
      if (unavailable) return { ...NAV_STATUS.unavailable, text: text.unavailable }
      if (gate === GATE.failed) return { ...NAV_STATUS.failed, text: text.shortcuts }
      if (gate === GATE.pending) return { ...NAV_STATUS.pending, text: text.pending }
      return null
    }

    /**
     * Run `setup(own)`, where `own(dispose)` records each part's disposer right after the part is
     * mounted. Returns one disposer for every owned part, in reverse order. When setup throws
     * part-way, the parts already mounted are disposed before the error propagates: cordis then
     * marks the entry failed and its context inactive, and an observer, subscriber or listener
     * left behind would keep reading ctx.locale/ctx.layout and throw "in inactive context" on
     * every later event (B1).
     *
     * Every disposer runs even when one throws, or the parts after it in the loop would leak the
     * same way. The error that propagates is the setup's own, so cordis reports the real cause;
     * on teardown it is the first disposer's. Any other disposer error is rethrown on its own
     * microtask, which reaches the page's uncaught-error reporting without breaking the
     * unwinding. Not a cordis iterable effect: its dispose loop (both SDKs) stops at the first
     * throwing disposer and lets that error replace the setup error.
     */
    function mountAll(setup) {
      const disposers = []
      const disposeAll = () => {
        const errors = []
        for (const dispose of disposers.splice(0).reverse()) {
          try { dispose() } catch (error) { errors.push(error) }
        }
        return errors
      }
      const raise = (primary, others) => {
        for (const error of others) queueMicrotask(() => { throw error })
        throw primary
      }
      try {
        setup(dispose => { disposers.push(dispose) })
      } catch (error) {
        raise(error, disposeAll())
      }
      return () => {
        const errors = disposeAll()
        if (errors.length > 0) raise(errors[0], errors.slice(1))
      }
    }

    /** Whether the window is in the narrow bar range (`PAGE.narrow.query`), followed live. */
    function useNarrow() {
      const media = React.useMemo(() => window.matchMedia(PAGE.narrow.query), [])
      return React.useSyncExternalStore((listener) => { media.addEventListener('change', listener); return () => media.removeEventListener('change', listener) }, () => media.matches)
    }

    // Native conversation rows, composer, header actions and rightbar remain mounted: no
    // replacement chat engine or unsupported readonlySettings prop. Beyond CSS presentation the
    // page adds only the shortcut gate, the frame guard, the manager selection, empty occupants of
    // the shadowed slots, its Settings launcher and one entry beside Settings in the sidebar's foot.
    // Hosted Frame Readiness v1. These classic clients ship separately; the wire values are
    // defined in the connector contract. Never include location, session state or credentials.
    const FRAME_READY = Object.freeze({ type: 'fishball:frame-ready', version: 1 })
    const announcement = Symbol.for(FRAME_READY.type)
    function announceFrameReady() {
      const parent = window.parent
      if (!parent || parent === window || document[announcement]) return
      // The frame sends no referrer. Where the browser withholds ancestorOrigins, only the
      // identical public marker may use a wildcard, still sent solely to the immediate parent.
      const origin = window.location.ancestorOrigins?.[0]
      parent.postMessage(FRAME_READY, origin && origin !== 'null' ? origin : '*')
      document[announcement] = true // plugin re-application must not announce this document twice
    }

    function apply(ctx) {
      ctx.effect(() => mountAll(own => {
        // First, so it is released last: the native workspace browser never shows on this page,
        // also not while the styles or the rest of the page mount or unwind (PLAN-MULTI §6.1).
        const occupy = (name, Component) => ctx.slots.inject(name, () => ctx.slots.register({ name, priority: PAGE.priority }, Component))
        for (const name of SHADOWED_SLOTS) own(occupy(name, Empty))
        const continuation = readContinuation()
        applyLanguage(ctx, continuation.lang)
        own(mountStyles())
        document.documentElement.setAttribute(PAGE.root, '')
        own(() => document.documentElement.removeAttribute(PAGE.root))
        const manager = createCell(null)
        const gate = createCell(GATE.pending)
        own(() => { manager.clear(); gate.clear() })
        const shortcuts = mountShortcuts(ctx, gate)
        own(shortcuts.dispose)
        const session = mountSession(ctx, manager, gate, shortcuts)
        own(session.dispose)
        own(mountRemovals(ctx))
        own(mountFrameGuard())
        const drawerBar = createCell(false)
        own(drawerBar.clear)
        own(mountSheet(ctx, drawerBar))
        // Stable across renders, so React subscribes once; LocaleRuntime methods need `this`.
        const locale = { subscribe: listener => ctx.locale.subscribe(listener), get: () => ctx.locale.getLocale() }
        /**
         * One page control in the sidebar, drawn as DSH draws the sidebar's own: in the wide column
         * a row with its icon and name; in the rail and the bar the icon alone, named by `label`
         * (aria-label) and shown in DSH's Tooltip. `kind` is its `data-fishball-nav` hook.
         */
        function PageControl({ wide, kind, label, Icon, shortcutKeys, className, ...props }) {
          const narrow = useNarrow()
          const classes = [PAGE.css.iconButton, wide ? PAGE.css.row : PAGE.css.rail, className].filter(Boolean).join(' ')
          const button = h(Button, { ...PAGE.button, type: 'button', ...props, className: classes, [PAGE.navKind]: kind, 'aria-label': label },
            h(Icon, { size: wide ? PAGE.icon.wide : PAGE.icon.rail }), wide ? h('span', null, label) : null)
          return h(Tooltip, { ...(narrow ? PAGE.tooltip.bar : PAGE.tooltip.rail), label, shortcutKeys, disabled: wide }, button)
        }
        /**
         * The page's entry beside Settings (`sidebar.footer.action`): "Fishball", back to the
         * manager's conversation, and, while the page is not protected, its status and Retry.
         */
        function FishballFooter({ wide: ownerWide }) {
          const bar = useCell(drawerBar)
          const wide = ownerWide && !bar
          const text = useText(locale)
          // Every hook runs on every render (no short-circuit between them).
          const lookupFailed = useCell(session.lookupFailed)
          const selectFailed = useCell(session.selectFailed)
          const assigned = useCell(manager)
          const state = useCell(gate)
          const narrow = useNarrow()
          const status = navStatus(text, { unavailable: lookupFailed || selectFailed || assigned === null, gate: state })
          return h('div', { className: PAGE.css.footer, 'data-wide': wide ? '' : undefined },
            h(PageControl, { wide, kind: NAV.fishball, label: text.back, Icon: FishLogo, onClick: () => session.back() }),
            status === null ? null : h(React.Fragment, null,
              // In the rail and the bar the status is its dot: its text stays in the live region for
              // assistive technology (visually hidden) and shows in DSH's Tooltip on hover. The region
              // is not focusable; Retry beside it is the control.
              h(Tooltip, { ...(narrow ? PAGE.tooltip.bar : PAGE.tooltip.rail), label: status.text, disabled: wide },
                h('span', { className: PAGE.css.status, role: 'status', [PAGE.statusKind]: status.kind },
                  h(StateDot, { state: status.dot }), h('span', { className: wide ? undefined : PAGE.css.hidden }, status.text))),
              h(PageControl, { wide, kind: NAV.retry, label: text.retry, Icon: IconRefreshOutlineRegular, onClick: () => session.retry() })))
        }
        // Consume the native launcher owner callback instead of inventing a global settings API: the
        // launcher draws in DSH's own settings seat in the sidebar's foot (wide row, rail, rc.1
        // drawer, the narrow bar), and the native settings modal/state and all settings contributions
        // stay owned. `view=settings` is not handled here: fishball-ui's entries part
        // (client.entries.js) opens core's own settings page for it, and its "DSH settings" header
        // entry presses this button, so the launcher must stay on the page. `settingsShortcut` is the
        // native owner prop (settings-general, both SDKs) the native trigger shows in its tooltip.
        function SettingsLauncher({ wide: ownerWide, openSettings, settingsOpen, settingsShortcut }) {
          const bar = useCell(drawerBar)
          const wide = ownerWide && !bar
          const text = useText(locale)
          return h(PageControl, { wide, kind: NAV.settings, label: text.settings, Icon: IconSettingsOutlineRegular,
            shortcutKeys: settingsShortcut?.keys, className: PAGE.settingsButton, 'aria-keyshortcuts': settingsShortcut?.aria,
            'aria-haspopup': 'dialog', 'aria-expanded': settingsOpen, onClick: openSettings })
        }
        // Every page occupant (Settings launcher, shadowed slots) takes its single slot's seat at
        // PAGE.priority, through inject so the registration follows the slot's own lifetime.
        own(occupy(PAGE.settingsSlot, SettingsLauncher))
        own(ctx.slots.inject(PAGE.footer.name, () => ctx.slots.register({ name: PAGE.footer.name, id: PAGE.footer.id }, FishballFooter)))
        announceFrameReady()
      }))
    }

    return {
      name: PAGE.name,
      inject: ['slots', 'layout', 'uiWorkspace', 'uiSession', 'sessions', 'locale', 'shortcuts'],
      apply,
      recordDefinition,
    }
  },
})
