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
      priority: -1, plugins: 'plugins', overlay: 'shell.overlay',
      root: 'data-fishball-page', ready: 'data-fishball-session',
      hidden: 'data-fishball-hidden', navigation: 'fishball-page-navigation',
      bundles: ['fishball-fold-notify', 'fishball-board', 'fishball-watchdog'],
      // Main-replacement contributions need an explicit reviewed ID; rightbar/composer stay native.
      panels: ['plugins'],
      detail: '[data-plugin-detail]', button: 'button', title: 'h3',
      main: '[data-slot="main.conversation"]',
      frame: '.pI_x6G_frame', sidebar: '.pI_x6G_sidebarCol',
      settings: '[data-slot="sidebar.settings"]',
    })
    /** @typedef {{code:string, options:readonly string[]}} CapabilityGap */
    /** No edit(clear)/restore: both web adapters persist dsh.keybindings.v1 across same-origin frames. */
    const gaps = Object.freeze({
      shortcuts: Object.freeze({ code: 'NON_PERSISTENT_SHORTCUT_UNBIND_UNAVAILABLE', options: Object.freeze([
        'Add a supported SDK instance-local shortcut override API.',
        'Give the child an isolated shortcut storage namespace/origin before using persisted null overrides.',
        'Explicitly accept active shortcuts plus corrective navigation (not a creation veto).',
      ]) }),
      readonlySettings: Object.freeze({ code: 'READONLY_SETTINGS_PROP_UNAVAILABLE', options: Object.freeze([
        'Keep permissions enforced by the separate server/overlay owner; do not pass an invented prop.',
      ]) }),
    })
    const TEXT = Object.freeze({
      en: { back: 'Fishball', plugins: 'Plugins', settings: 'Settings', unavailable: 'Fishball session unavailable', retry: 'Retry' },
      zh: { back: 'Fishball', plugins: '插件', settings: '设置', unavailable: 'Fishball 会话不可用', retry: '重试' },
    })

    // Browser CSSOM, not a style element: shipped precedent in both SDKs' sidebar-documentpreview
    // client.pdf.js:7749–7777. No nonce, eval, external asset, or CSP relaxation. Native boot itself
    // remains a separate CSP integration gate. Hashed layout hooks below are version-bounded fallbacks,
    // verified in rc.5/rc.1, not a promise of stable SDK selectors.
    function mountStyles() {
      if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in document)) {
        throw new Error('FISHBALL_CONSTRUCTED_STYLESHEET_UNAVAILABLE')
      }
      const sheet = new CSSStyleSheet()
      const root = `[${PAGE.root}]`
      const rules = [
        `${root} ${PAGE.sidebar}{visibility:hidden!important;min-width:0!important;pointer-events:none}`,
        `${root} .fishball-settings-launcher{position:fixed;bottom:8px;left:8px;z-index:100;visibility:visible;pointer-events:auto}`,
        `${root} .pI_x6G_drawerMask,${root} [data-slot="sidebar"]{visibility:hidden!important;pointer-events:none!important}`,
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

    // Match native localized accessibility labels inside exact owned package details. Never match
    // an English substring or hide third-party uninstall controls. Native dictionaries can arrive late.
    function mountRemovals(ctx, styles) {
      const marked = new Set()
      const pluginText = ctx.locale.bind('pluginManager')
      const sidebarText = ctx.locale.bind('sidebar')
      function reconcile() {
        const next = new Set()
        for (const detail of document.querySelectorAll(PAGE.detail)) {
          if (!PAGE.bundles.includes(detail.getAttribute('data-plugin-detail'))) continue
          const title = detail.querySelector(PAGE.title)?.textContent
          if (!title) continue
          const label = pluginText('uninstallLabel', { name: title })
          for (const button of detail.querySelectorAll(PAGE.button)) {
            if (button.getAttribute('aria-label') === label) next.add(button)
          }
        }
        const newSession = sidebarText('session.new.label')
        for (const button of document.querySelectorAll(PAGE.button)) {
          if (button.getAttribute('aria-label') === newSession) next.add(button)
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
        attributes: true, attributeFilter: ['aria-label', 'data-plugin-detail', 'style', 'data-sidebar-drawer', 'data-sidebar-collapsed'] })
      const unsubscribe = ctx.locale.subscribe(reconcile)
      reconcile()
      return () => {
        observer.disconnect()
        unsubscribe()
        for (const node of marked) node.removeAttribute(PAGE.hidden)
      }
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

    // One corrective guard, not a global navigation veto or server authorization mechanism.
    // adapter.current is the public renderer-facing binding source in both versions; key is the ID.
    // Coalesce notifications so retain-new/release-old navigation cannot cause recursive correction.
    function mountGuard(ctx, publish) {
      const abort = new AbortController()
      const source = ctx.uiSession.adapter.current
      let manager = null
      let disposed = false
      let pending = false
      let opening = false
      let lookup = null
      function reconcile() {
        if (disposed) return
        const selected = source.getSnapshot().key
        const panel = ctx.layout.panelInfo.getSnapshot().activePanelId
        const allowed = panel !== null && PAGE.panels.includes(panel)
        document.documentElement.toggleAttribute(PAGE.ready, manager !== null && selected === manager)
        if (allowed) return
        if (panel !== null) ctx.layout.selectPanel(null)
        if (manager !== null && selected !== manager && !opening) {
          opening = true
          const target = manager
          Promise.resolve().then(() => {
            if (!disposed && manager === target && ctx.layout.panelInfo.getSnapshot().activePanelId === null) return ctx.uiWorkspace.openSession(target)
          }).catch(() => {
            if (!disposed && manager === target) { manager = null; publish(manager); schedule() }
          }).finally(() => { opening = false; schedule() })
        }
      }
      function schedule() {
        if (pending || disposed) return
        pending = true
        queueMicrotask(() => { pending = false; reconcile() })
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
        }).catch(() => null).then(value => {
          if (!disposed) { manager = value; publish(manager); schedule() }
        }).finally(() => { lookup = null })
        return lookup
      }
      const unsubscribers = [source.subscribe(schedule), ctx.layout.panelInfo.subscribe(schedule),
        ctx.sessions.list.subscribe(() => { void refresh() })]
      // A listener wrapper: addEventListener would otherwise pass the Event as ensure.
      const reread = () => { void refresh() }
      window.addEventListener('focus', reread)
      void refresh(true)
      schedule()
      return {
        retry() { return refresh(true) },
        back() { ctx.layout.selectPanel(null); void refresh().then(schedule) },
        dispose() {
          disposed = true
          abort.abort()
          unsubscribers.forEach(dispose => dispose())
          window.removeEventListener('focus', reread)
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

    // Native conversation rows, composer, header actions and rightbar remain mounted. Only CSS
    // presentation changes; no replacement chat engine or unsupported readonlySettings prop.
    function apply(ctx) {
      ctx.effect(() => {
        const styles = mountStyles()
        document.documentElement.setAttribute(PAGE.root, '')
        let manager = null
        const listeners = new Set()
        const publish = value => { manager = value; listeners.forEach(listener => listener()) }
        const guard = mountGuard(ctx, publish)
        const removals = mountRemovals(ctx, styles)
        function Navigation() {
          const session = React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, () => manager)
          React.useSyncExternalStore(listener => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
          const text = ctx.locale.getLocale().active.startsWith('zh') ? TEXT.zh : TEXT.en
          return h('nav', { className: PAGE.navigation, 'aria-label': PAGE.name },
            h('button', { type: 'button', onClick: () => guard.back() }, text.back),
            h('button', { type: 'button', onClick: () => ctx.layout.selectPanel(PAGE.plugins) }, text.plugins),
            session === null ? h(React.Fragment, null,
              h('span', { role: 'status' }, text.unavailable),
              h('button', { type: 'button', onClick: () => guard.retry() }, text.retry)) : null)
        }
        // Consume the native launcher owner callback instead of inventing a global settings API.
        // A portal keeps the trigger usable outside the rc.1 drawer's inert subtree and Windows
        // collapsed footer; the native settings modal/state and all settings contributions stay owned.
        function SettingsLauncher({ openSettings, settingsOpen }) {
          React.useSyncExternalStore(listener => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
          const text = ctx.locale.getLocale().active.startsWith('zh') ? TEXT.zh : TEXT.en
          return createPortal(h('button', { className: 'fishball-settings-launcher', type: 'button',
            'aria-haspopup': 'dialog', 'aria-expanded': settingsOpen, onClick: openSettings }, text.settings), document.body)
        }
        const unregisterSettings = ctx.slots.inject('settings.launcher', () => ctx.slots.register({
          name: 'settings.launcher', priority: PAGE.priority,
        }, SettingsLauncher))
        const unregister = ctx.slots.register({ name: PAGE.overlay }, Navigation)
        return () => {
          unregister()
          unregisterSettings()
          guard.dispose()
          removals()
          styles.dispose()
          listeners.clear()
          document.documentElement.removeAttribute(PAGE.root)
        }
      })
    }

    return {
      name: PAGE.name,
      inject: ['slots', 'layout', 'uiWorkspace', 'uiSession', 'sessions', 'locale'],
      apply,
      recordDefinition,
      gaps,
    }
  },
})
