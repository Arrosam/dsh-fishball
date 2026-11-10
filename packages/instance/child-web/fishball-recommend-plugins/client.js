/**
 * Fishball Recommended: a tab on the child's own native Plugins page (V2 RP, extension §11.9).
 * Native modules serves classic script registrations, not raw ESM exports.
 *
 * Seams, all public in both 0.2.1-rc.5 and 0.2.2-rc.1:
 * - the `plugins.tab` list slot (plugin-manager slot contract), registered like DSH's own Discover;
 * - `remote.pluginManager.listBundles()` for the child's authoritative bundle inventory, refreshed on
 *   `plugin-manager/changed` and `connection/reset` as the native page does;
 * - `remote.pluginManager.inspect(spec)` to read the registry's current version of a curated name,
 *   then the owner prop `install({spec: name@version, title, version})`, which opens DSH's own
 *   install dialog at its check screen. The curated list names packages, not versions (historical
 *   checked versions are not pins), and `install` takes an exact version, so this read is how the
 *   curated name becomes that confirmed target. Everything after it — progress, cancel, failure,
 *   pending/unconfirmed blocking, Retry — is the native dialog's; this tab adds no retry or lock.
 */
window.__ModuleLoader__.load({
  id: 'fishball-recommend-plugins',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { Button, StateDot } = require('@deepseek-ai/dsh-client-ui-primitives')

    const TAB = Object.freeze({
      name: 'fishball-recommend-plugins',
      slot: 'plugins.tab',
      id: 'fishball-recommended',
      ns: 'fishballRecommended',
      // Document-relative, like fishball-page's session route: the child may be mounted below a path.
      route: 'api/fishball/recommended',
      changed: 'plugin-manager/changed',
      reset: 'connection/reset',
      inspectAccepted: 'accepted',
      // Only a registry name has an exact `name@version` form; the curated specs are all npm names.
      registryKind: 'registry',
      networkProblem: 'network',
      versionSeparator: '@',
      installedState: 'installed',
    })
    /** The native primitive Button look the Discover tab uses for row actions. */
    const BUTTON = Object.freeze({ variant: 'outline', size: 'sm' })
    /** Load status of one read (the list, the inventory). */
    const STATUS = Object.freeze({ loading: 'loading', ready: 'ready', error: 'error' })
    /** One row's own pre-install read; the native dialog owns every state after it. */
    const CHECK = Object.freeze({ checking: 'checking', failed: 'failed' })
    const STATE_DOT = Object.freeze({ ongoing: 'ongoing', error: 'error', done: 'done' })

    const zh = {
      title: 'Fishball 推荐',
      intro: '与 Fishball 搭配良好的插件。安装只装进这个 Fishball 实例，不影响主 DSH。',
      context: '上下文管理', memory: '记忆', channel: '消息渠道', pet: '宠物',
      highlight: '优先推荐',
      highlightNote: '这些插件能显著改善 Fishball 的使用体验。',
      empty: '这一类暂时没有推荐的插件。',
      'settings.recommendedNote.meowMemory': 'Fishball V2 没有内置记忆。外部记忆插件是可选的，但推荐安装。',
      install: '安装', installed: '已安装', checking: '正在检查…', source: '来源',
      loading: '正在加载…', retry: '重试',
      listFailed: '无法加载推荐列表。',
      inventoryFailed: '无法读取这个实例已安装的插件。',
      checkNetwork: '无法连接插件源，请检查网络后重试。',
      checkRefused: '无法准备安装 {name}：{reason}',
      checkUnknown: '无法准备安装 {name}，请重试。',
    }
    const en = {
      title: 'Fishball Recommended',
      intro: 'Plugins that work well with Fishball. Installing adds them to this Fishball instance only, not to the main DSH.',
      context: 'Context management', memory: 'Memory', channel: 'Channel', pet: 'Pet',
      highlight: 'Recommended first',
      highlightNote: 'These significantly improve how Fishball works.',
      empty: 'No plugins are recommended in this category yet.',
      'settings.recommendedNote.meowMemory': 'Fishball V2 has no built-in memory. An external memory plugin is optional, but recommended.',
      install: 'Install', installed: 'Installed', checking: 'Checking…', source: 'Source',
      loading: 'Loading…', retry: 'Retry',
      listFailed: 'Could not load the recommended list.',
      inventoryFailed: "Could not read this instance's installed plugins.",
      checkNetwork: 'Could not reach the plugin registry. Check the network and try again.',
      checkRefused: 'Could not prepare {name} for installation: {reason}',
      checkUnknown: 'Could not prepare {name} for installation. Try again.',
    }

    // Design tokens only (the same aliases fishball-page uses); no hashed SDK class names.
    const STYLE = Object.freeze({
      section: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' },
      muted: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', margin: 0 },
      heading: { display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '14px' },
      badge: { fontSize: '11px', padding: '1px 6px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)' },
      list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' },
      row: { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-module-platform)' },
      body: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' },
      name: { fontFamily: 'monospace', fontSize: '13px', overflowWrap: 'anywhere' },
      action: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
      status: { display: 'flex', alignItems: 'center', gap: '6px', margin: 0 },
    })

    /** A plain external store: one owner per value, read through React.useSyncExternalStore. */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        set(next) { value = { ...value, ...next }; listeners.forEach(listener => listener()) },
      }
    }
    const useStore = store => React.useSyncExternalStore(store.subscribe, store.getSnapshot)

    async function readList(signal) {
      const response = await fetch(new URL(TAB.route, document.baseURI), { credentials: 'same-origin', cache: 'no-store', signal })
      if (!response.ok) throw new Error(TAB.route)
      const body = await response.json()
      if (!Array.isArray(body?.categories) || !Array.isArray(body.highlighted)) throw new Error(TAB.route)
      return body
    }

    /**
     * Owns the tab's reads for one plugin generation. After dispose() every late settlement is
     * dropped, so an old generation can never update the old or a replacement tab; native work it
     * started (an install the dialog already runs) is the dialog's and may still finish.
     */
    class RecommendController {
      constructor(ctx) {
        this.ctx = ctx
        this.abort = new AbortController()
        this.disposed = false
        this.listRead = 0
        this.inventoryRead = 0
        this.store = createStore({ list: STATUS.loading, categories: [], highlighted: [], inventory: STATUS.loading, installed: new Set(), checks: {} })
      }
      dispose() { this.disposed = true; this.abort.abort() }
      live(read, current) { return !this.disposed && read === current }
      ensure() {
        const { list, inventory } = this.store.getSnapshot()
        if (list !== STATUS.ready) void this.loadList()
        if (inventory !== STATUS.ready) void this.loadInventory()
      }
      async loadList() {
        const read = ++this.listRead
        this.store.set({ list: STATUS.loading })
        try {
          const body = await readList(this.abort.signal)
          if (this.live(read, this.listRead)) this.store.set({ list: STATUS.ready, categories: body.categories, highlighted: body.highlighted })
        } catch {
          if (this.live(read, this.listRead)) this.store.set({ list: STATUS.error })
        }
      }
      /**
       * Presence is the child's own bundle list: declared by its profile (`installed`), enabled or
       * not. A bundle the profile selects without declaring it is reachable only by hand-editing
       * the profile; it shows Install and the native check then refuses it as already installed.
       */
      async loadInventory() {
        const read = ++this.inventoryRead
        // Retry after a failed read shows progress; a background refresh keeps the shown rows.
        if (this.store.getSnapshot().inventory === STATUS.error) this.store.set({ inventory: STATUS.loading })
        try {
          const answer = await this.ctx.remote.pluginManager.listBundles()
          if (!this.live(read, this.inventoryRead)) return
          if (!answer?.ok) { this.store.set({ inventory: STATUS.error }); return }
          this.store.set({ inventory: STATUS.ready, installed: new Set(answer.value.filter(bundle => bundle.installed).map(bundle => bundle.name)) })
        } catch {
          if (this.live(read, this.inventoryRead)) this.store.set({ inventory: STATUS.error })
        }
      }
      /**
       * A Host change only matters once the tab has read the inventory at least once. A disposed
       * generation starts no Host read: a listener captured before disposal can still fire once.
       */
      changed() { if (!this.disposed && this.inventoryRead > 0) void this.loadInventory() }
      setCheck(packageName, check) {
        const checks = { ...this.store.getSnapshot().checks }
        if (check === null) delete checks[packageName]
        else checks[packageName] = check
        this.store.set({ checks })
      }
      /**
       * Read the curated name's current version, then hand the exact target to the native dialog.
       * A refusal stays on the row with the Host's reason; Install again is the user's own retry.
       */
      async install(item, title, owner) {
        if (this.store.getSnapshot().checks[item.packageName]?.kind === CHECK.checking) return
        this.setCheck(item.packageName, { kind: CHECK.checking })
        let answer
        try {
          answer = await this.ctx.remote.pluginManager.inspect(item.spec, {}, this.abort.signal)
        } catch {
          answer = undefined
        }
        if (this.disposed) return
        const value = answer?.ok ? answer.value : undefined
        if (value?.status === TAB.inspectAccepted && value.kind === TAB.registryKind && typeof value.version === 'string' && value.version) {
          this.setCheck(item.packageName, null)
          // Ask the registry that answered first, for this install only (the owner never remembers
          // it). Limitation: null (pnpm's own configured registry) has no owner-prop form, and an
          // absent `registry` keeps the dialog's remembered choice. If that registry lacks this exact
          // version, the native dialog refuses it and offers Retry/Change registry itself.
          const registry = typeof value.registry === 'string' ? { registry: value.registry } : {}
          owner.install({ spec: (value.name ?? item.packageName) + TAB.versionSeparator + value.version, ...registry, title, version: value.version })
          return
        }
        this.setCheck(item.packageName, { kind: CHECK.failed, problem: value?.problem ?? null, reason: value?.reason ?? answer?.error?.message ?? '' })
      }
    }

    function checkMessage(t, packageName, check) {
      if (check.problem === TAB.networkProblem) return t('checkNetwork')
      // A lost or reasonless answer (transport drop, reset in flight) still says what to do.
      if (!check.reason) return t('checkUnknown', { name: packageName })
      return t('checkRefused', { name: packageName, reason: check.reason })
    }

    function Status({ state, children, alert }) {
      return h('p', { style: STYLE.status, role: alert ? 'alert' : 'status' }, h(StateDot, { state }), children)
    }

    function Row({ item, t, snapshot, controller, owner }) {
      const installed = snapshot.installed.has(item.packageName)
      const check = snapshot.checks[item.packageName]
      const checking = check?.kind === CHECK.checking
      let action = null
      if (snapshot.inventory === STATUS.ready) {
        action = installed
          ? h('span', { style: STYLE.status, 'data-recommended-state': TAB.installedState }, h(StateDot, { state: STATE_DOT.done }), t('installed'))
          : h(Button, { ...BUTTON, disabled: checking,
            onClick: () => { void controller.install(item, item.packageName, owner) } }, t(checking ? 'checking' : 'install'))
      }
      return h('li', { style: STYLE.row, 'data-recommended-package': item.packageName },
        h('div', { style: STYLE.body },
          h('span', { style: STYLE.name }, item.packageName),
          h('a', { href: item.source, target: '_blank', rel: 'noopener noreferrer', style: STYLE.muted }, t('source')),
          item.noteKey === undefined ? null : h('p', { style: STYLE.muted, 'data-recommended-note': item.noteKey }, t(item.noteKey)),
          check?.kind === CHECK.failed && !installed ? h(Status, { state: STATE_DOT.error, alert: true }, checkMessage(t, item.packageName, check)) : null),
        h('div', { style: STYLE.action }, action))
    }

    function Category({ group, t, snapshot, controller, owner }) {
      const highlighted = snapshot.highlighted.includes(group.category)
      return h('section', { 'data-recommended-category': group.category, 'data-highlighted': highlighted ? 'true' : 'false' },
        h('h3', { style: STYLE.heading }, t(group.category), highlighted ? h('span', { style: STYLE.badge }, t('highlight')) : null),
        highlighted ? h('p', { style: STYLE.muted }, t('highlightNote')) : null,
        group.plugins.length === 0
          ? h('p', { style: STYLE.muted, 'data-recommended-empty': group.category }, t('empty'))
          : h('ul', { style: STYLE.list }, group.plugins.map(item => h(Row, { key: item.packageName, item, t, snapshot, controller, owner }))))
    }

    function makeTab(controller) {
      return function RecommendedTab(props) {
        const { t } = props
        const snapshot = useStore(controller.store)
        React.useEffect(() => { controller.ensure() }, [])
        const retry = h(Button, { ...BUTTON, onClick: () => controller.ensure() }, t('retry'))
        let body
        if (snapshot.list === STATUS.loading) body = h(Status, { state: STATE_DOT.ongoing }, t('loading'))
        else if (snapshot.list === STATUS.error) body = h('div', null, h(Status, { state: STATE_DOT.error, alert: true }, t('listFailed')), retry)
        else body = h(React.Fragment, null,
          snapshot.inventory === STATUS.error ? h('div', null, h(Status, { state: STATE_DOT.error, alert: true }, t('inventoryFailed')), retry) : null,
          snapshot.categories.map(group => h(Category, { key: group.category, group, t, snapshot, controller, owner: props })))
        return h('div', { style: STYLE.section, 'data-plugin-tab': TAB.id },
          h('p', { style: STYLE.muted }, t('intro')), body)
      }
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(TAB.ns, { zh, en }))
      const controller = new RecommendController(ctx)
      ctx.effect(() => () => controller.dispose())
      ctx.effect(() => {
        const disposers = [ctx.remote.$on(TAB.changed, () => controller.changed()), ctx.on(TAB.reset, () => controller.changed())]
        return () => { for (const dispose of disposers) dispose() }
      })
      const t = ctx.locale.bind(TAB.ns)
      const Tab = makeTab(controller)
      ctx.slots.inject(TAB.slot, () => ctx.slots.register({ name: TAB.slot, id: TAB.id, label: () => t('title'), locale: TAB.ns }, Tab))
    }

    return { name: TAB.name, inject: ['slots', 'locale', 'remote', 'remote.pluginManager'], apply }
  },
})
