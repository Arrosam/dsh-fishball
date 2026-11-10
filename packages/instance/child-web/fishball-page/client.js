/** Native modules serves classic script registrations, not raw ESM exports. */
window.__ModuleLoader__.load({
  id: 'fishball-page',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { createPortal } = require('react-dom')
    const PAGE = Object.freeze({
      name: 'fishball-page', route: 'api/fishball/session', read: 'GET', ensure: 'POST',
      requestFailed: 'FISHBALL_SESSION_REQUEST_FAILED', invalidSession: 'FISHBALL_SESSION_INVALID',
      priority: -1, plugins: 'plugins',
      // shell.overlay is a `list` slot in both SDKs (ui-layout root children): every entry needs
      // its own id, else register() throws and the whole page entry fails to activate.
      overlay: Object.freeze({ name: 'shell.overlay', id: 'fishball-page.navigation' }),
      root: 'data-fishball-page', ready: 'data-fishball-session',
      hidden: 'data-fishball-hidden', navigation: 'fishball-page-navigation', label: 'aria-label',
      settingsSlot: 'settings.launcher', settingsButton: 'fishball-settings-launcher',
      // The active-locale prefix that selects TEXT.zh; every other language reads TEXT.en.
      chinese: 'zh',
      main: '[data-slot="main.conversation"]', sidebarSlot: '[data-slot="sidebar"]',
      frame: '.pI_x6G_frame', sidebar: '.pI_x6G_sidebarCol',
      // Window focus re-reads the manager (GET only, never ensure); see refresh.
      reread: 'focus',
    })
    /**
     * The non-secret continuation PG-ORIGIN carries across native admission in the fragment
     * (src/slim/host/embed.js CONTINUATION, host.js PLUGIN.ui and src/slim/ui/shell.js VIEW; keep
     * all four in step). Any other name or value is ignored, never acted on.
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
        Object.freeze({ id: 'sidebar.left.toggle', code: 'F19' }),
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
     * Slots shadowed by an empty occupant (A-lite §11.3, first-choice mechanism): the empty-session
     * hero's workspace picker. Picking a workspace connects or creates another blank session and
     * opens it (ui-workspace connectBlank -> replaceMain); the menu is portalled to the body, so
     * hiding its wrapper would not hide it. Both the chip and the inert composer's "choose
     * workspace" trigger only open this slot, so with the shadow neither can leave the session.
     */
    const SHADOWED_SLOTS = Object.freeze(['conversation.hero.workspace'])
    /** Gate states: pending waits for real native events, never for a timer. */
    const GATE = Object.freeze({ pending: 'pending', protected: 'protected', failed: 'failed' })
    /** In-frame navigation policy; see mountFrameGuard. */
    const FRAME = Object.freeze({
      navigate: 'navigate', click: 'click', anchor: 'a[href],area[href]', blank: '_blank', frame: 'iframe',
      features: 'noopener,noreferrer', web: Object.freeze(['http:', 'https:']),
      passTypes: Object.freeze(['reload', 'traverse']), primaryButton: 0,
    })
    const TEXT = Object.freeze({
      en: { back: 'Fishball', plugins: 'Plugins', settings: 'Settings', unavailable: 'Fishball session unavailable', shortcuts: 'Fishball shortcut protection unavailable', pending: 'Preparing Fishball shortcut protection', retry: 'Retry' },
      zh: { back: 'Fishball', plugins: '插件', settings: '设置', unavailable: 'Fishball 会话不可用', shortcuts: 'Fishball 快捷键保护不可用', pending: '正在准备 Fishball 快捷键保护', retry: '重试' },
    })

    // Browser CSSOM, not a style element: shipped precedent in both SDKs' sidebar-documentpreview
    // client.pdf.js:7749–7777. No nonce, eval, external asset, or CSP relaxation. Native boot itself
    // remains a separate CSP integration gate. Hashed layout hooks below are version-bounded fallbacks,
    // verified in rc.5/rc.1, not a promise of stable SDK selectors. visibility:hidden (not opacity)
    // keeps hidden controls out of Tab order and pointer hit-testing.
    function mountStyles() {
      if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in document)) {
        throw new Error('FISHBALL_CONSTRUCTED_STYLESHEET_UNAVAILABLE')
      }
      const sheet = new CSSStyleSheet()
      const root = `[${PAGE.root}]`
      const rules = [
        `${root} ${PAGE.sidebar}{visibility:hidden!important;min-width:0!important;pointer-events:none}`,
        // Descendants too: native ui-workspace CSS sets visibility:visible on the workspace header
        // actions (Add workspace), which would otherwise stay Tab-focusable inside the hidden column.
        `${root} ${PAGE.sidebar} *,${root} ${PAGE.sidebarSlot} *{visibility:hidden!important}`,
        `${root} .${PAGE.settingsButton}{position:fixed;bottom:8px;left:8px;z-index:100;visibility:visible;pointer-events:auto}`,
        `${root} .pI_x6G_drawerMask,${root} ${PAGE.sidebarSlot}{visibility:hidden!important;pointer-events:none!important}`,
        `${root} [data-shell-leading],${root} [data-sidebar-toggle],${root} [data-sidebar-drawer-mask],${root} [${PAGE.hidden}]{display:none!important}`,
        `${root} [data-conversation-header-leading],${root} [data-slot="conversation.session.header.lineage"],${root} [data-slot="conversation.hero.workspace"]{display:none!important}`,
        `${root}:not([${PAGE.ready}]) ${PAGE.main}{visibility:hidden!important;pointer-events:none!important}`,
        `.${PAGE.navigation}{position:fixed;bottom:8px;left:56px;z-index:100;display:flex;gap:8px;align-items:center;pointer-events:auto;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]{position:relative;margin:6px 12% 6px 0;padding:18px 0 0 36px}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]::after{content:"Fishball";position:absolute;top:0;left:36px;font-size:12px;color:var(--dsw-alias-label-tertiary)}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="user"] [class$="_bubble"]{background:var(--dsw-specific-bubble);border:1px solid var(--dsw-alias-border-l2)}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]::before{content:"🐟";position:absolute;left:0;top:6px;font-size:22px}`,
        `${root} ${PAGE.main} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]>[data-slot="conversation.chat.node"]>*{padding:6px 12px;border-radius:4px 18px 18px 18px;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);min-width:0}`,
        `${root} ${PAGE.main} .md-table-wide{width:auto;max-width:100%;margin-left:0;padding-left:0}`,
      ]
      for (const rule of rules) sheet.insertRule(rule, sheet.cssRules.length)
      // Update only this rule's first grid track; retain the native rightbar allocation.
      const grid = sheet.cssRules[sheet.insertRule(`${root} ${PAGE.frame}{}`, sheet.cssRules.length)]
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      return {
        grid,
        dispose() { document.adoptedStyleSheets = document.adoptedStyleSheets.filter(value => value !== sheet) },
      }
    }

    // Hide the LABELS launchers. V2 ships no bundled plugins (v2-final-scope §1), so no plugin's
    // Remove control is hidden: every child plugin keeps its native uninstall. The conversation's
    // top navigation, the session-hierarchy nav, is hidden whole: its crumb buttons open other
    // sessions (ui-conversation open(id)) and in 0.2.2-rc.1 every crumb, the current title too, is
    // a tabIndex 0 context-menu trigger for Fork/Archive/Rename/Pin (ui-workspace session menus).
    function mountRemovals(ctx, styles) {
      const marked = new Set()
      const text = ({ namespace, key }) => ctx.locale.bind(namespace)(key)
      function reconcile() {
        const next = new Set()
        // One query per element kind, not per label: this runs on every observed mutation.
        for (const { selector, keys } of LABELS) {
          const labels = new Set(keys.map(text))
          for (const node of document.querySelectorAll(selector)) {
            if (labels.has(node.getAttribute(PAGE.label))) next.add(node)
          }
        }
        for (const node of marked) if (!next.has(node)) node.removeAttribute(PAGE.hidden)
        for (const node of next) if (!marked.has(node)) node.setAttribute(PAGE.hidden, '')
        marked.clear()
        for (const node of next) marked.add(node)
        const frame = document.querySelector(PAGE.frame)
        // rc.1 mobile drawer makes the center inert while open. Close via the public action,
        // not by stripping native inert attributes; the Settings launcher is portalled outside it.
        if (frame?.hasAttribute('data-sidebar-drawer') && !frame.hasAttribute('data-sidebar-collapsed')) ctx.layout.toggleSidebar()
        const columns = frame?.style.gridTemplateColumns
        if (columns) styles.grid.style.setProperty('grid-template-columns', columns.replace(/^\S+/, '0px'), 'important')
      }
      const observer = new MutationObserver(reconcile)
      observer.observe(document.body, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: [PAGE.label, 'style', 'data-sidebar-drawer', 'data-sidebar-collapsed'] })
      const unsubscribe = ctx.locale.subscribe(reconcile)
      reconcile()
      return () => {
        observer.disconnect()
        unsubscribe()
        for (const node of marked) node.removeAttribute(PAGE.hidden)
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

    // Producer contract (session-route.js): document-relative, native cookie auth, no-store.
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
     * The assigned manager is opened once when it first becomes known and the shortcut gate is
     * protected, and again only when the user asks (Fishball button, Retry). Whatever else the
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
      // Two owners: a background refresh may clear a lookup failure, never a failed selection.
      const lookupFailed = createCell(false)
      const selectFailed = createCell(false)
      function select() {
        const target = manager.get()
        if (disposed || target === null || gate.get() !== GATE.protected) return
        selectedFor = target
        selectFailed.set(false)
        ctx.layout.selectPanel(null)
        if (source.getSnapshot().key === target) return
        Promise.resolve().then(() => ctx.uiWorkspace.openSession(target)).catch(() => { if (!disposed) selectFailed.set(true) })
      }
      /** The first selection of a newly known manager; select() itself waits for protection. */
      function selectOnce() {
        const target = manager.get()
        if (target !== null && target !== selectedFor) select()
      }
      function markReady() {
        const target = manager.get()
        document.documentElement.toggleAttribute(PAGE.ready, target !== null && gate.get() === GATE.protected && source.getSnapshot().key === target)
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
      const unsubscribers = [source.subscribe(mark), gate.subscribe(mark),
        ctx.sessions.list.subscribe(() => { void refresh() })]
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
     * The navigation status, or null when the page is protected and needs none. Session trouble
     * outranks the shortcut gate; a known manager behind a pending gate is shown as pending,
     * never as a blank page.
     */
    function statusText(text, { unavailable, gate }) {
      if (unavailable) return text.unavailable
      if (gate === GATE.failed) return text.shortcuts
      if (gate === GATE.pending) return text.pending
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

    // Native conversation rows, composer, header actions and rightbar remain mounted: no
    // replacement chat engine or unsupported readonlySettings prop. Beyond CSS presentation the
    // page adds only the shortcut gate, the frame guard, the manager selection and empty occupants
    // of the shadowed slots.
    function apply(ctx) {
      ctx.effect(() => mountAll(own => {
        const continuation = readContinuation()
        applyLanguage(ctx, continuation.lang)
        const styles = mountStyles()
        own(styles.dispose)
        document.documentElement.setAttribute(PAGE.root, '')
        own(() => document.documentElement.removeAttribute(PAGE.root))
        const manager = createCell(null)
        const gate = createCell(GATE.pending)
        own(() => { manager.clear(); gate.clear() })
        const shortcuts = mountShortcuts(ctx, gate)
        own(shortcuts.dispose)
        const session = mountSession(ctx, manager, gate, shortcuts)
        own(session.dispose)
        own(mountRemovals(ctx, styles))
        own(mountFrameGuard())
        // Stable across renders, so React subscribes once; LocaleRuntime methods need `this`.
        const locale = { subscribe: listener => ctx.locale.subscribe(listener), get: () => ctx.locale.getLocale() }
        function Navigation() {
          const text = useText(locale)
          // Every hook runs on every render (no short-circuit between them).
          const lookupFailed = useCell(session.lookupFailed)
          const selectFailed = useCell(session.selectFailed)
          const assigned = useCell(manager)
          const state = useCell(gate)
          const status = statusText(text, { unavailable: lookupFailed || selectFailed || assigned === null, gate: state })
          return h('nav', { className: PAGE.navigation, 'aria-label': PAGE.name },
            h('button', { type: 'button', onClick: () => session.back() }, text.back),
            h('button', { type: 'button', onClick: () => ctx.layout.selectPanel(PAGE.plugins) }, text.plugins),
            status === null ? null : h(React.Fragment, null,
              h('span', { role: 'status' }, status),
              h('button', { type: 'button', onClick: () => session.retry() }, text.retry)))
        }
        // Consume the native launcher owner callback instead of inventing a global settings API.
        // A portal keeps the trigger usable outside the rc.1 drawer's inert subtree and Windows
        // collapsed footer; the native settings modal/state and all settings contributions stay owned.
        // `view=settings` is not handled here: it opens Fishball's slim settings panel, which
        // fishball-settings (SET) owns. That panel's "DSH Settings" link presses this button, so the
        // launcher must stay on the page.
        function SettingsLauncher({ openSettings, settingsOpen }) {
          const text = useText(locale)
          return createPortal(h('button', { className: PAGE.settingsButton, type: 'button',
            'aria-haspopup': 'dialog', 'aria-expanded': settingsOpen, onClick: openSettings }, text.settings), document.body)
        }
        // Every page occupant (Settings launcher, shadowed slots) takes its single slot's seat
        // at PAGE.priority, through inject so the registration follows the slot's own lifetime.
        const occupy = (name, Component) => ctx.slots.inject(name, () => ctx.slots.register({ name, priority: PAGE.priority }, Component))
        own(occupy(PAGE.settingsSlot, SettingsLauncher))
        for (const name of SHADOWED_SLOTS) own(occupy(name, Empty))
        own(ctx.slots.register(PAGE.overlay, Navigation))
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
