/**
 * SET's slim Fishball settings panel, browser half (docs/planning/v2-set.md; instance-extension-
 * points §11.8). Child DSH only: mounted by the child's launch overlay, never in main DSH.
 *
 * Only what DSH's own pages cannot do stays here: the instance's status and Restart, one Read Only
 * line, and links to the child's native Settings and Plugins pages (models, effort, plugins and
 * plugin settings are edited there). The status line is the main card's own component, loaded from
 * the same source file (packages/instance/client.js, copied here as the chunk
 * `client.instance.js`), so both pages show and behave the same.
 *
 * Model sync is not here: the child must never start one (the user's decision of 2026-11-11,
 * docs/planning/v2-set.md). Only the main DSH's "Model for Fishball" block on its Plugins page
 * syncs into this instance, so the panel shows a read-only note pointing there and no control.
 */
window.__ModuleLoader__.load({
  id: 'fishball-settings',
  factory(require) {
    const React = require('react')
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const PANEL = Object.freeze({
      id: 'fishball-settings',
      locale: 'fishball-settings',
      mainSlot: 'main',
      headerSlot: 'conversation.session.header.actions',
      headerOrder: 90,
      // The main card's source, delivered as this package's chunk (installation.js copyChildCode).
      shared: './client.instance.js',
      restartPath: 'api/fishball-instance/restart',
      request: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }), body: '{}' }),
      // Native Plugins page: DSH's pluginNavigation service, else its main panel id (as the connector does).
      navigation: 'pluginNavigation',
      pluginsPanel: 'plugins',
      /**
       * No public service opens native Settings: the single `settings.launcher` owner gets the only
       * `openSettings` callback, and fishball-page (LITE) portals it as this button. Pressing it is
       * the native open path, so the native modal and its sections stay native.
       */
      settingsLauncher: '.fishball-settings-launcher',
      /**
       * PG-ORIGIN's fragment continuation, as fishball-page reads it (`view=settings`). The page's
       * one-time manager selection closes panels when the conversation first becomes ready
       * (`data-fishball-session` on <html>), so the panel is opened at load and once more then.
       */
      continuation: Object.freeze({ name: 'view', value: 'settings' }),
      sessionReady: 'data-fishball-session',
      css: Object.freeze({ id: 'fishball-settings-style', root: 'fb-settings', section: 'fb-settings-section', row: 'fb-settings-row', hint: 'fb-settings-hint', error: 'fb-settings-error' }),
    })
    const SHARED_STATE = Object.freeze({ loading: 'loading', ready: 'ready', failed: 'failed' })
    const RESTART = Object.freeze({
      idle: 'idle', running: 'running',
      /**
       * The relay's code for a request whose wire closed (SETTINGS_RELAY.code.disconnected in
       * src/slim/settings-relay.js; the browser bundle cannot import it). For Restart it is the
       * expected answer: stopping the child ends the wire that carried the request.
       */
      lost: 'settings-relay-disconnected',
      // The admin vocabulary's code for an answer that could not be read (ADMIN_ERROR.failed).
      unreadable: 'operation-failed',
      failedState: 'failed',
    })

    const en = {
      title: 'Fishball settings',
      entry: 'Fishball settings',
      restart: 'Restart Fishball',
      restarting: 'Restarting…',
      restartHint: 'Stops Fishball\'s private instance and starts it again; this page reloads when it is back.',
      restartFailed: 'Restart was refused: {code}',
      restartEnded: 'Fishball restarted but did not come back: {code}',
      modelSyncNote: 'New models from DSH are added in the main DSH: Plugins → Fishball instance → Model for Fishball.',
      readOnly: 'Read Only: Fishball\'s tools run read-only in its instance. This is fixed and not a setting.',
      nativeTitle: 'More settings',
      nativeHint: 'Models, reasoning effort, plugins and their settings are in DSH\'s own pages.',
      openSettings: 'Open DSH Settings',
      openPlugins: 'Open Plugins',
      settingsUnavailable: 'DSH Settings cannot be opened from here right now; use the Settings button at the bottom left.',
      loading: 'Loading…',
      loadFailed: 'This part of the page could not be loaded.',
      retry: 'Retry',
    }
    const zh = {
      title: 'Fishball 设置',
      entry: 'Fishball 设置',
      restart: '重启 Fishball',
      restarting: '正在重启…',
      restartHint: '停止 Fishball 的私有实例并重新启动；恢复后本页会重新加载。',
      restartFailed: '重启被拒绝：{code}',
      restartEnded: 'Fishball 已重启但未能恢复：{code}',
      modelSyncNote: 'DSH 中的新模型请在主 DSH 中添加：插件 → Fishball 实例 → Fishball 的模型。',
      readOnly: '只读：Fishball 的工具在其实例中以只读方式运行。这是固定的，不是可调设置。',
      nativeTitle: '更多设置',
      nativeHint: '模型、推理强度、插件及其设置在 DSH 自己的页面中。',
      openSettings: '打开 DSH 设置',
      openPlugins: '打开插件',
      settingsUnavailable: '现在无法从这里打开 DSH 设置；请使用左下角的“设置”按钮。',
      loading: '加载中…',
      loadFailed: '页面的这一部分无法加载。',
      retry: '重试',
    }
    const css = [
      `.${PANEL.css.root}{display:grid;gap:20px;max-width:720px;margin:0 auto;padding:24px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:1.5;overflow-y:auto}`,
      `.${PANEL.css.root} h2{margin:0;font:var(--dsw-font-m-strong-16)}`,
      `.${PANEL.css.section}{display:grid;gap:6px}`,
      `.${PANEL.css.row}{display:flex;align-items:center;flex-wrap:wrap;gap:8px}`,
      `.${PANEL.css.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}`,
      `.${PANEL.css.error}{margin:0;color:var(--dsw-alias-state-error-primary)}`,
    ].join('')

    /** Re-render on a locale change (the dictionaries are looked up at render time). */
    function useLocale(ctx) {
      React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
    }

    /** The shared main-card source, loaded once per page; a failure is shown with Retry. */
    function sharedLoader() {
      let snapshot = { state: SHARED_STATE.loading }
      const listeners = new Set()
      const set = (next) => { snapshot = next; listeners.forEach((listener) => listener()) }
      const load = () => {
        set({ state: SHARED_STATE.loading })
        require.async(PANEL.shared).then(
          (module) => set({ state: SHARED_STATE.ready, shared: module.shared }),
          () => set({ state: SHARED_STATE.failed }))
      }
      return { load, get: () => snapshot, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) } }
    }

    /**
     * One restart request. @returns the route's typed outcome; `undefined` when no answer came (the
     * request failed on the network); `null` when an answer came but is not readable JSON (for
     * example a missing route or an owner refusal), which is a refusal, not a lost answer.
     */
    async function restartRequest() {
      let response
      try { response = await fetch(new URL(PANEL.restartPath, document.baseURI).toString(), PANEL.request) } catch { return undefined }
      try { return await response.json() } catch { return null }
    }

    /**
     * Restart. A refusal shows its code and can be pressed again. A lost answer keeps "Restarting…":
     * the child being restarted serves this page, and the connector's frame loads the new
     * generation when it attaches (packages/connector/client.js FishballView).
     */
    function Restart({ t, setStatus }) {
      const [view, setView] = React.useState({ phase: RESTART.idle })
      const run = async () => {
        setView({ phase: RESTART.running })
        const answer = await restartRequest()
        if (answer === undefined || answer?.error?.code === RESTART.lost) return
        if (answer?.ok === true) {
          setStatus(answer.result)
          // The restart ran but the instance did not come back: say so beside the status line.
          setView(answer.result?.state === RESTART.failedState ? { phase: RESTART.idle, error: answer.result.code ?? RESTART.failedState, ended: true } : { phase: RESTART.idle })
          return
        }
        setView({ phase: RESTART.idle, error: typeof answer?.error?.code === 'string' ? answer.error.code : RESTART.unreadable })
      }
      const running = view.phase === RESTART.running
      return h('div', { className: PANEL.css.section },
        h('div', { className: PANEL.css.row },
          h(Button, { type: 'button', size: 'sm', variant: 'secondary', disabled: running, 'aria-busy': running, 'data-fishball-settings-restart': true, onClick: () => void run() },
            running ? t('restarting') : t('restart'))),
        h('p', { className: PANEL.css.hint }, t('restartHint')),
        view.error ? h('p', { className: PANEL.css.error, role: 'alert', 'data-fishball-settings-restart-error': view.error }, t(view.ended ? 'restartEnded' : 'restartFailed', { code: view.error })) : null)
    }

    /** The links to the child's native pages; both return through the page's own navigation. */
    function NativeLinks({ ctx, t }) {
      const [missing, setMissing] = React.useState(false)
      // Looked up on press: the launcher is a portal fishball-page may mount after this panel.
      const openSettings = () => {
        const launcher = document.querySelector(PANEL.settingsLauncher)
        setMissing(launcher === null)
        launcher?.click()
      }
      const openPlugins = () => {
        const navigation = ctx.get(PANEL.navigation)
        if (navigation) navigation.openList()
        else ctx.layout.selectPanel(PANEL.pluginsPanel)
      }
      return h('section', { className: PANEL.css.section },
        h('h2', null, t('nativeTitle')),
        h('p', { className: PANEL.css.hint }, t('nativeHint')),
        h('div', { className: PANEL.css.row },
          h(Button, { type: 'button', size: 'sm', variant: 'outline', 'aria-haspopup': 'dialog', 'data-fishball-settings-open': 'settings', onClick: openSettings }, t('openSettings')),
          h(Button, { type: 'button', size: 'sm', variant: 'outline', 'data-fishball-settings-open': 'plugins', onClick: openPlugins }, t('openPlugins'))),
        missing ? h('p', { className: PANEL.css.error, role: 'alert' }, t('settingsUnavailable')) : null)
    }

    /** The shared status line and Restart, once the main card's source has arrived. */
    function Shared({ ctx, shared, t }) {
      const sharedT = React.useMemo(() => ctx.locale.bind(shared.locale), [shared])
      const [status, setStatus] = shared.useInstanceStatus()
      return h('section', { className: PANEL.css.section },
        h(shared.InstanceStatus, { t: sharedT, status, setStatus }),
        h(Restart, { t, setStatus }))
    }

    function makePanel(ctx, t, loader) {
      return function FishballSettingsPanel() {
        const loaded = React.useSyncExternalStore(loader.subscribe, loader.get)
        useLocale(ctx)
        const body = loaded.state === SHARED_STATE.ready
          ? h(Shared, { ctx, shared: loaded.shared, t })
          : loaded.state === SHARED_STATE.failed
            ? h('div', { className: PANEL.css.row },
              h('p', { className: PANEL.css.error, role: 'alert' }, t('loadFailed')),
              h(Button, { type: 'button', size: 'sm', variant: 'secondary', onClick: loader.load }, t('retry')))
            : h('p', { role: 'status' }, t('loading'))
        return h('div', { className: PANEL.css.root, 'data-fishball-settings': true },
          h('h2', null, t('title')),
          body,
          h('p', { className: PANEL.css.hint, 'data-fishball-settings-model-sync-note': true }, t('modelSyncNote')),
          h('p', { className: PANEL.css.hint, 'data-fishball-settings-readonly': true }, t('readOnly')),
          h(NativeLinks, { ctx, t }))
      }
    }

    /** The header action that opens this panel from Fishball's conversation. */
    function makeEntry(ctx, t) {
      return function FishballSettingsEntry() {
        useLocale(ctx)
        return h(Button, { type: 'button', size: 'sm', variant: 'ghost', 'data-fishball-settings-entry': true, onClick: () => ctx.layout.selectPanel(PANEL.id) }, t('entry'))
      }
    }

    /**
     * `view=settings` opens this panel once at load, and once more when the Fishball page first
     * marks its conversation ready (its one-time manager selection closes panels). Nothing reopens
     * it after that, so the user's own navigation is never overridden.
     */
    function openFromContinuation(ctx) {
      const wanted = new URLSearchParams(window.location.hash.slice(1)).get(PANEL.continuation.name) === PANEL.continuation.value
      if (!wanted) return () => {}
      const open = () => { try { ctx.layout.selectPanel(PANEL.id) } catch { /* the panel is not registered yet */ } }
      // The second open only restores what the page's selection closed: when the user opened
      // another panel meanwhile, that choice stands.
      const reopen = () => { if ([null, PANEL.id].includes(ctx.layout.panelInfo.getSnapshot().activePanelId)) open() }
      queueMicrotask(open)
      const root = document.documentElement
      if (root.hasAttribute(PANEL.sessionReady)) return () => {}
      const observer = new MutationObserver(() => {
        if (!root.hasAttribute(PANEL.sessionReady)) return
        observer.disconnect()
        queueMicrotask(reopen)
      })
      observer.observe(root, { attributes: true, attributeFilter: [PANEL.sessionReady] })
      return () => observer.disconnect()
    }

    function apply(ctx) {
      const t = ctx.locale.bind(PANEL.locale)
      const loader = sharedLoader()
      ctx.effect(() => ctx.locale.register(PANEL.locale, { en, zh }), 'fishball settings: dictionaries')
      ctx.effect(() => {
        loader.load()
        // The shared card's dictionaries and styles are registered by this page once they arrive.
        let disposers = []
        const unsubscribe = loader.subscribe(() => {
          const { state, shared } = loader.get()
          if (state !== SHARED_STATE.ready || disposers.length > 0) return
          disposers = [ctx.locale.register(shared.locale, shared.dictionaries), shared.mountStyles(), shared.mountStyle(PANEL.css.id, css)]
        })
        return () => { unsubscribe(); disposers.forEach((dispose) => dispose()) }
      }, 'fishball settings: shared card')
      ctx.effect(() => ctx.slots.inject(PANEL.mainSlot, () => ctx.slots.register({
        name: PANEL.mainSlot, key: PANEL.id, locale: PANEL.locale,
      }, makePanel(ctx, t, loader))), 'fishball settings: panel')
      ctx.effect(() => ctx.slots.inject(PANEL.headerSlot, () => ctx.slots.register({
        name: PANEL.headerSlot, id: PANEL.id, order: PANEL.headerOrder, locale: PANEL.locale,
      }, makeEntry(ctx, t))), 'fishball settings: header entry')
      ctx.effect(() => openFromContinuation(ctx), 'fishball settings: view continuation')
    }

    return { name: PANEL.id, inject: ['slots', 'layout', 'locale'], apply }
  },
})
