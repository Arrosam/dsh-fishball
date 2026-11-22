/**
 * dsh-fishball-bundle, browser half.
 *
 * 1. Registers `plugins.bundle.config` keyed `'dsh-fishball-bundle'` so the Fishball plugin page
 *    presents both the Fishball instance settings (`dsh-instance`) and the Connector / Token
 *    settings (`dsh-agent-connector`) in an accessible tab switcher without requiring users to
 *    navigate into separate sub-bundles.
 * 2. Loads `./client.amenities.js` so `dsh-connector-adapter` and `dsh-connector-watchdog` in
 *    the Components section keep their clickable Configure pages (`plugins.row.config`).
 */
window.__ModuleLoader__.load({
  id: 'dsh-fishball-bundle',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const BUNDLE = Object.freeze({
      id: 'dsh-fishball-bundle',
      slot: 'plugins.bundle.config',
      locale: 'dsh-fishball-bundle',
      pageView: 'page',
      summaryView: 'summary',
      amenitiesChunk: './client.amenities.js',
      tabs: Object.freeze([
        Object.freeze({ id: 'instance', slotKey: 'dsh-instance' }),
        Object.freeze({ id: 'connector', slotKey: 'dsh-agent-connector' }),
      ]),
      effect: Object.freeze({
        locale: 'dsh-fishball-bundle: locale',
        page: 'dsh-fishball-bundle: settings page',
        amenities: 'dsh-fishball-bundle: amenities part',
        unavailable: 'dsh-fishball-bundle: part unavailable',
      }),
    })

    const STYLE = Object.freeze({
      root: Object.freeze({ display: 'grid', gap: '20px', minWidth: 0 }),
      tablist: Object.freeze({
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        padding: '4px',
        width: 'fit-content',
        maxWidth: '100%',
        borderRadius: 'var(--dsw-radius-md)',
        border: '.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
      }),
      tabBase: Object.freeze({
        appearance: 'none',
        border: 'none',
        borderRadius: 'var(--dsw-radius-sm)',
        padding: '6px 14px',
        cursor: 'pointer',
        font: 'var(--dsw-font-xs-13)',
        fontWeight: 500,
        lineHeight: '20px',
        transition: 'background-color 120ms ease, color 120ms ease',
      }),
      tabActive: Object.freeze({
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
      }),
      tabInactive: Object.freeze({
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
      }),
      panel: Object.freeze({ minWidth: 0 }),
      hint: Object.freeze({
        margin: 0,
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary)',
      }),
    })

    const en = {
      summary: 'All-in-one Fishball embedded edition (instance, connector, adapter, watchdog).',
      'tab.instance': 'Fishball',
      'tab.connector': 'Connector',
      tabsLabel: 'Fishball configuration sections',
      'unavailable.instance': 'The Fishball instance component (dsh-instance) is not currently running.',
      'unavailable.connector': 'The Connector component (dsh-connector) is not currently running.',
    }
    const zh = {
      summary: 'Fishball 一体化嵌入版（包含 Fishball 实例、Connector、Adapter 与 Watchdog）。',
      'tab.instance': 'Fishball 实例',
      'tab.connector': '连接器与 Token',
      tabsLabel: 'Fishball 配置分区',
      'unavailable.instance': 'Fishball 实例组件（dsh-instance）当前未运行。',
      'unavailable.connector': '连接器组件（dsh-connector）当前未运行。',
    }

    function makePage(ctx, t) {
      const subscribeSlots = (listener) => ctx.slots.subscribe(BUNDLE.slot, listener)
      const getSlotVersion = () => ctx.slots.getVersion(BUNDLE.slot)
      const subscribeLocale = (listener) => ctx.locale.subscribe(listener)
      const getLocaleRevision = () => ctx.locale.getSnapshot().revision

      return function FishballBundleSettings(props) {
        React.useSyncExternalStore(subscribeSlots, getSlotVersion)
        React.useSyncExternalStore(subscribeLocale, getLocaleRevision)
        const baseId = React.useId()
        const [selectedTab, setSelectedTab] = React.useState(null)

        if (props.view !== BUNDLE.pageView) return t('summary')

        const entries = ctx.slots.entries(BUNDLE.slot)
        const entryFor = (slotKey) => entries.find((entry) => entry.options?.key === slotKey)
        const instanceEntry = entryFor(BUNDLE.tabs[0].slotKey)
        const connectorEntry = entryFor(BUNDLE.tabs[1].slotKey)

        const defaultTab = instanceEntry || !connectorEntry ? 'instance' : 'connector'
        const activeTab = selectedTab ?? defaultTab
        const activeEntry = activeTab === 'instance' ? instanceEntry : connectorEntry

        return h('div', { style: STYLE.root, 'data-fishball-bundle-settings': true },
          h('div', {
            role: 'tablist',
            'aria-label': t('tabsLabel'),
            style: STYLE.tablist,
          }, BUNDLE.tabs.map((tab) => {
            const active = activeTab === tab.id
            return h('button', {
              key: tab.id,
              type: 'button',
              role: 'tab',
              id: `${baseId}-tab-${tab.id}`,
              'aria-selected': active,
              'aria-controls': `${baseId}-panel-${tab.id}`,
              'data-fishball-bundle-tab': tab.id,
              style: { ...STYLE.tabBase, ...(active ? STYLE.tabActive : STYLE.tabInactive) },
              onClick: () => setSelectedTab(tab.id),
            }, t('tab.' + tab.id))
          })),
          h('div', {
            role: 'tabpanel',
            id: `${baseId}-panel-${activeTab}`,
            'aria-labelledby': `${baseId}-tab-${activeTab}`,
            style: STYLE.panel,
          }, activeEntry?.component
            ? h(activeEntry.component, { key: activeEntry.options.key, view: BUNDLE.pageView })
            : h('p', { style: STYLE.hint, role: 'status' }, t('unavailable.' + activeTab))),
        )
      }
    }

    function apply(ctx) {
      ctx.effect(() => {
        let live = true
        require.async(BUNDLE.amenitiesChunk)
          .then((module) => { if (live) ctx.plugin(module.amenitiesPart(BUNDLE.id)) })
          .catch((error) => { ctx.logger?.warn?.(BUNDLE.effect.unavailable, BUNDLE.amenitiesChunk, error) })
        return () => { live = false }
      }, BUNDLE.effect.amenities)

      const t = ctx.locale.bind(BUNDLE.locale)
      ctx.effect(() => ctx.locale.register(BUNDLE.locale, { en, zh }), BUNDLE.effect.locale)
      ctx.effect(() => ctx.slots.inject(BUNDLE.slot, () => ctx.slots.register({
        name: BUNDLE.slot,
        key: BUNDLE.id,
        locale: BUNDLE.locale,
      }, makePage(ctx, t))), BUNDLE.effect.page)
    }

    return { name: BUNDLE.id, inject: ['slots', 'locale'], apply }
  },
})
