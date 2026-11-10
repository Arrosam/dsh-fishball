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

    /** The tab's identity on the Plugins page (Q-O = B) and its locale namespace. */
    const TAB = Object.freeze({
      name: 'fishball-recommend-plugins',
      slot: 'plugins.tab',
      id: 'fishball-recommended',
      ns: 'fishballRecommended',
    })
    /** The Node half's list route (index.js). */
    const LIST = Object.freeze({
      // Document-relative, like fishball-page's session route: the child may be mounted below a path.
      route: 'api/fishball/recommended',
      request: Object.freeze({ credentials: 'same-origin', cache: 'no-store' }),
    })
    /** Host events after which the native page re-reads its inventory; the tab follows the same two. */
    const HOST_EVENT = Object.freeze({ changed: 'plugin-manager/changed', reset: 'connection/reset' })
    /** The vocabulary of `pluginManager.inspect` (PluginSpecInspection) this tab reads. */
    const INSPECT = Object.freeze({
      accepted: 'accepted',
      // Only a registry name has an exact `name@version` form; the curated specs are all npm names.
      registryKind: 'registry',
      networkProblem: 'network',
      versionSeparator: '@',
    })
    /** Stable markup hooks and fixed attribute values of the rendered tab. */
    const DOM = Object.freeze({
      installedState: 'installed',
      alertRole: 'alert',
      statusRole: 'status',
      linkTarget: '_blank',
      linkRel: 'noopener noreferrer',
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
      const response = await fetch(new URL(LIST.route, document.baseURI), { ...LIST.request, signal })
      if (!response.ok) throw new Error(LIST.route)
      const body = await response.json()
      if (!Array.isArray(body?.categories) || !Array.isArray(body.highlighted)) throw new Error(LIST.route)
      return body
    }

    /** The settled value of an inspection answer, or undefined for a transport error or lost reply. */
    const inspectionOf = answer => (answer?.ok ? answer.value : undefined)

    /**
     * The owner prop's target for an accepted registry answer, or null for any other answer. The
     * curated list names packages, not versions, and the owner's `install` takes an exact version,
     * so the version the registry reports now is the target the person confirms in DSH's dialog.
     */
    function installTarget(item, answer) {
      const value = inspectionOf(answer)
      if (value?.status !== INSPECT.accepted || value.kind !== INSPECT.registryKind || typeof value.version !== 'string' || !value.version) return null
      // Ask the registry that answered first, for this install only (the owner never remembers it).
      // Limit: null (pnpm's own configured registry) has no owner-prop form, so the dialog then asks
      // its remembered registry choice, which may be another registry. The dialog re-inspects the
      // exact `name@version` there; if that registry lacks the version, the native dialog shows the
      // refusal and offers its own Retry / registry change. The tab adds no fallback of its own.
      const registry = typeof value.registry === 'string' ? { registry: value.registry } : {}
      return { spec: (value.name ?? item.packageName) + INSPECT.versionSeparator + value.version, ...registry, title: item.packageName, version: value.version }
    }

    /** The row's failure record: the Host's problem and reason when it gave them. */
    function failedCheck(answer) {
      const value = inspectionOf(answer)
      return { kind: CHECK.failed, problem: value?.problem ?? null, reason: value?.reason ?? answer?.error?.message ?? '' }
    }

    /**
     * Newest-wins bookkeeping for one kind of read: a later read supersedes an earlier one's answer,
     * and `inFlight` lets a remount or Retry join a read already running instead of sending another.
     */
    class ReadFence {
      constructor() { this.started = 0; this.settled = 0 }
      begin() { return ++this.started }
      /** Whether `read` is the newest read; it then counts as settled. */
      finish(read) { if (read !== this.started) return false; this.settled = read; return true }
      get inFlight() { return this.settled !== this.started }
      get used() { return this.started > 0 }
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
        this.listReads = new ReadFence()
        this.inventoryReads = new ReadFence()
        this.store = createStore({ list: STATUS.loading, categories: [], highlighted: [], inventory: STATUS.loading, installed: new Set(), checks: {} })
      }
      dispose() { this.disposed = true; this.abort.abort() }
      live(fence, read) { return fence.finish(read) && !this.disposed }
      /** Start each read that has no answer yet and is not already running (mount and Retry). */
      ensure() {
        const { list, inventory } = this.store.getSnapshot()
        if (list !== STATUS.ready && !this.listReads.inFlight) void this.loadList()
        if (inventory !== STATUS.ready && !this.inventoryReads.inFlight) void this.loadInventory()
      }
      async loadList() {
        const read = this.listReads.begin()
        this.store.set({ list: STATUS.loading })
        try {
          const body = await readList(this.abort.signal)
          if (this.live(this.listReads, read)) this.store.set({ list: STATUS.ready, categories: body.categories, highlighted: body.highlighted })
        } catch {
          if (this.live(this.listReads, read)) this.store.set({ list: STATUS.error })
        }
      }
      /**
       * Presence is the child's own bundle list: declared by its profile (`installed`), enabled or
       * not. A bundle the profile selects without declaring it is reachable only by hand-editing
       * the profile; it shows Install and the native check then refuses it as already installed.
       */
      async loadInventory() {
        const read = this.inventoryReads.begin()
        // Retry after a failed read shows progress; a background refresh keeps the shown rows.
        if (this.store.getSnapshot().inventory === STATUS.error) this.store.set({ inventory: STATUS.loading })
        try {
          const answer = await this.ctx.remote.pluginManager.listBundles()
          if (!this.live(this.inventoryReads, read)) return
          if (!answer?.ok) { this.store.set({ inventory: STATUS.error }); return }
          this.store.set({ inventory: STATUS.ready, installed: new Set(answer.value.filter(bundle => bundle.installed).map(bundle => bundle.name)) })
        } catch {
          if (this.live(this.inventoryReads, read)) this.store.set({ inventory: STATUS.error })
        }
      }
      /**
       * A Host change only matters once the tab has read the inventory at least once; it always
       * starts a fresh read, superseding one in flight, because that one may predate the change. A
       * disposed generation starts no Host read: a listener captured before disposal can still fire.
       */
      changed() { if (!this.disposed && this.inventoryReads.used) void this.loadInventory() }
      setCheck(packageName, check) {
        const checks = { ...this.store.getSnapshot().checks }
        if (check === null) delete checks[packageName]
        else checks[packageName] = check
        this.store.set({ checks })
      }
      /**
       * Read the curated name's current version, then hand the exact target to the native dialog.
       * A refusal stays on the row with the Host's reason; Install again is the user's own retry.
       * Only this pre-install read is de-duplicated per row; after the handoff the native dialog
       * owns pending/unconfirmed blocking, so the tab keeps no install lock.
       */
      async install(item, owner) {
        if (this.store.getSnapshot().checks[item.packageName]?.kind === CHECK.checking) return
        this.setCheck(item.packageName, { kind: CHECK.checking })
        let answer
        try {
          answer = await this.ctx.remote.pluginManager.inspect(item.spec, {}, this.abort.signal)
        } catch {
          answer = undefined
        }
        if (this.disposed) return
        const target = installTarget(item, answer)
        this.setCheck(item.packageName, target === null ? failedCheck(answer) : null)
        if (target !== null) owner.install(target)
      }
    }

    function checkMessage(t, packageName, check) {
      if (check.problem === INSPECT.networkProblem) return t('checkNetwork')
      // A lost or reasonless answer (transport drop, reset in flight) still says what to do.
      if (!check.reason) return t('checkUnknown', { name: packageName })
      return t('checkRefused', { name: packageName, reason: check.reason })
    }

    function Status({ state, children, alert }) {
      return h('p', { style: STYLE.status, role: alert ? DOM.alertRole : DOM.statusRole }, h(StateDot, { state }), children)
    }

    /** A failed read's alert with the tab's Retry, which re-runs only the reads that failed. */
    function ReadFailure({ message, retry }) {
      return h('div', null, h(Status, { state: STATE_DOT.error, alert: true }, message), retry)
    }

    function Row({ item, t, snapshot, controller, owner }) {
      const installed = snapshot.installed.has(item.packageName)
      const check = snapshot.checks[item.packageName]
      const checking = check?.kind === CHECK.checking
      let action = null
      if (snapshot.inventory === STATUS.ready) {
        action = installed
          ? h('span', { style: STYLE.status, 'data-recommended-state': DOM.installedState }, h(StateDot, { state: STATE_DOT.done }), t('installed'))
          : h(Button, { ...BUTTON, disabled: checking,
            onClick: () => { void controller.install(item, owner) } }, t(checking ? 'checking' : 'install'))
      }
      return h('li', { style: STYLE.row, 'data-recommended-package': item.packageName },
        h('div', { style: STYLE.body },
          h('span', { style: STYLE.name }, item.packageName),
          h('a', { href: item.source, target: DOM.linkTarget, rel: DOM.linkRel, style: STYLE.muted }, t('source')),
          item.noteKey === undefined ? null : h('p', { style: STYLE.muted, 'data-recommended-note': item.noteKey }, t(item.noteKey)),
          check?.kind === CHECK.failed && !installed ? h(Status, { state: STATE_DOT.error, alert: true }, checkMessage(t, item.packageName, check)) : null),
        h('div', { style: STYLE.action }, action))
    }

    function Category({ group, t, snapshot, controller, owner }) {
      const highlighted = snapshot.highlighted.includes(group.category)
      return h('section', { 'data-recommended-category': group.category, 'data-highlighted': String(highlighted) },
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
        else if (snapshot.list === STATUS.error) body = h(ReadFailure, { message: t('listFailed'), retry })
        else body = h(React.Fragment, null,
          snapshot.inventory === STATUS.error ? h(ReadFailure, { message: t('inventoryFailed'), retry }) : null,
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
        const disposers = [ctx.remote.$on(HOST_EVENT.changed, () => controller.changed()), ctx.on(HOST_EVENT.reset, () => controller.changed())]
        return () => { for (const dispose of disposers) dispose() }
      })
      const t = ctx.locale.bind(TAB.ns)
      const Tab = makeTab(controller)
      ctx.slots.inject(TAB.slot, () => ctx.slots.register({ name: TAB.slot, id: TAB.id, label: () => t('title'), locale: TAB.ns }, Tab))
    }

    return { name: TAB.name, inject: ['slots', 'locale', 'remote', 'remote.pluginManager'], apply }
  },
})
