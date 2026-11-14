/**
 * fishball-hosted-settings, browser half: the hosted-only sections of Fishball's slim settings
 * panel (R-HOST-11, TQ-R2; V3 task R-CORE). Owned by the instance and loaded only in a hosted
 * child; fishball-core never imports it. It registers through core's settings-section extension
 * point (`fishballSettingsSections`, fishball-core's client.settings.js) and nowhere else, so
 * without core's panel it has nowhere to appear and does nothing.
 *
 * The sections are the V2 panel's hosted parts, unchanged: the instance's status line and Restart,
 * and the read-only note that new models are added from the main DSH. The status line is the
 * instance-owned chunk beside this file, `client.status.js`, which the main DSH's instance card
 * (fishball-embed-ui) loads too, so both pages show and behave the same.
 *
 * Model sync is not here: the child must never start one (R-HOST-07; the user's decision of
 * 2026-11-11, docs/planning/v2-set.md). Only the main DSH's "Model for Fishball" block syncs into
 * this instance, so the section shows a note pointing there and no control.
 */
window.__ModuleLoader__.load({
  id: 'fishball-hosted-settings',
  factory(require) {
    const React = require('react')
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const HOSTED = Object.freeze({
      id: 'fishball-hosted-settings',
      locale: 'fishball-hosted-settings',
      // core's settings-section extension point (fishball-core client.settings.js).
      sections: 'fishballSettingsSections',
      // Before the generic sections (they start at 100), in the V2 panel's order: the status line
      // and Restart, then the model-sync note, each its own panel row as in V2.
      instance: Object.freeze({ id: 'fishball-hosted-instance', order: 50 }),
      modelSyncNote: Object.freeze({ id: 'fishball-hosted-model-sync-note', order: 60 }),
      // The instance's status line, this package's own chunk (client.status.js).
      shared: './client.status.js',
      restartPath: 'api/fishball-instance/restart',
      request: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }), body: '{}' }),
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
      title: 'Fishball instance',
      modelSyncTitle: 'New models',
      restart: 'Restart Fishball',
      restarting: 'Restarting…',
      restartHint: 'Stops Fishball\'s private instance and starts it again; this page reloads when it is back.',
      restartFailed: 'Restart was refused: {code}',
      restartEnded: 'Fishball restarted but did not come back: {code}',
      modelSyncNote: 'New models from DSH are added in the main DSH: Plugins → Fishball instance → Model for Fishball.',
      loading: 'Loading…',
      loadFailed: 'This part of the page could not be loaded.',
      retry: 'Retry',
    }
    const zh = {
      title: 'Fishball 实例',
      modelSyncTitle: '新模型',
      restart: '重启 Fishball',
      restarting: '正在重启…',
      restartHint: '停止 Fishball 的私有实例并重新启动；恢复后本页会重新加载。',
      restartFailed: '重启被拒绝：{code}',
      restartEnded: 'Fishball 已重启但未能恢复：{code}',
      modelSyncNote: 'DSH 中的新模型请在主 DSH 中添加：插件 → Fishball 实例 → Fishball 的模型。',
      loading: '加载中…',
      loadFailed: '页面的这一部分无法加载。',
      retry: '重试',
    }

    /** The shared status line, loaded once per page; a failure is shown with Retry. */
    function sharedLoader() {
      let snapshot = { state: SHARED_STATE.loading }
      const listeners = new Set()
      const set = (next) => { snapshot = next; listeners.forEach((listener) => listener()) }
      const load = () => {
        set({ state: SHARED_STATE.loading })
        require.async(HOSTED.shared).then(
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
      try { response = await fetch(new URL(HOSTED.restartPath, document.baseURI).toString(), HOSTED.request) } catch { return undefined }
      try { return await response.json() } catch { return null }
    }

    /**
     * Restart. A refusal shows its code and can be pressed again. A lost answer keeps "Restarting…":
     * the child being restarted serves this page, and the main DSH's frame loads the new
     * generation when it attaches.
     */
    function Restart({ t, setStatus, classes }) {
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
      return h('div', { className: classes.section },
        h('div', { className: classes.row },
          h(Button, { type: 'button', size: 'sm', variant: 'secondary', disabled: running, 'aria-busy': running, 'data-fishball-settings-restart': true, onClick: () => void run() },
            running ? t('restarting') : t('restart'))),
        h('p', { className: classes.hint }, t('restartHint')),
        view.error ? h('p', { className: classes.error, role: 'alert', 'data-fishball-settings-restart-error': view.error }, t(view.ended ? 'restartEnded' : 'restartFailed', { code: view.error })) : null)
    }

    /** The shared status line and Restart, once its chunk has arrived. */
    function Shared({ ctx, shared, t, classes }) {
      const sharedT = React.useMemo(() => ctx.locale.bind(shared.locale), [shared])
      const [status, setStatus] = shared.useInstanceStatus()
      return h('div', { className: classes.section },
        h(shared.InstanceStatus, { t: sharedT, status, setStatus }),
        h(Restart, { t, setStatus, classes }))
    }

    function makeSection(ctx, t, loader, classes) {
      return function HostedInstanceSection() {
        const loaded = React.useSyncExternalStore(loader.subscribe, loader.get)
        const body = loaded.state === SHARED_STATE.ready
          ? h(Shared, { ctx, shared: loaded.shared, t, classes })
          : loaded.state === SHARED_STATE.failed
            ? h('div', { className: classes.row },
              h('p', { className: classes.error, role: 'alert' }, t('loadFailed')),
              h(Button, { type: 'button', size: 'sm', variant: 'secondary', onClick: loader.load }, t('retry')))
            : h('p', { role: 'status' }, t('loading'))
        return body
      }
    }

    function apply(ctx) {
      const t = ctx.locale.bind(HOSTED.locale)
      const loader = sharedLoader()
      const sections = ctx.get(HOSTED.sections)
      ctx.effect(() => ctx.locale.register(HOSTED.locale, { en, zh }), 'fishball hosted settings: dictionaries')
      ctx.effect(() => {
        loader.load()
        // The status line's dictionaries and styles are registered by this page once they arrive.
        // Each disposer is kept as soon as its part is mounted: if a later mount throws, the parts
        // already mounted are still removed by this effect's cleanup instead of outliving the row.
        const disposers = []
        const unsubscribe = loader.subscribe(() => {
          const { state, shared } = loader.get()
          if (state !== SHARED_STATE.ready || disposers.length > 0) return
          disposers.push(ctx.locale.register(shared.locale, shared.dictionaries))
          disposers.push(shared.mountStyles())
        })
        return () => { unsubscribe(); disposers.forEach((dispose) => dispose()) }
      }, 'fishball hosted settings: shared card')
      const Section = makeSection(ctx, t, loader, sections.classes)
      ctx.effect(() => sections.register({
        ...HOSTED.instance,
        title: () => t('title'),
        ...sections.reactSection(() => h(Section)),
      }), 'fishball hosted settings: instance section')
      ctx.effect(() => sections.register({
        ...HOSTED.modelSyncNote,
        title: () => t('modelSyncTitle'),
        ...sections.reactSection(() => h('p', { className: sections.classes.hint, 'data-fishball-settings-model-sync-note': true }, t('modelSyncNote'))),
      }), 'fishball hosted settings: model-sync note')
    }

    // Injected, so this plugin starts only while core's panel provides the extension point and
    // stops with it (R-HOST-11 (3) and E1: no core panel, nothing to show and nothing done).
    return { name: HOSTED.id, inject: [HOSTED.sections, 'locale'], apply }
  },
})
