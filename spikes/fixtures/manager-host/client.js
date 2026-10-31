/**
 * S28 fixture browser half (DESIGN §10d): a "Fishball" tab in DSH's Plugins page
 * (`plugins.tab`) and a tag and switch on bundle pages (`plugins.detail.badge`,
 * `plugins.detail.actions`). window.__s28 records the props each entry received;
 * window.__s28openTab() tries to select the tab from outside the page.
 */
window.__ModuleLoader__.load({
  id: 'fishball-spike-manager-host',
  factory(require) {
    const React = require('react')
    const { Switch, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const log = (what) => { (window.__s28 ??= []).push(what) }
    const NS = 'fishballSpikeManager'
    function FishballTab(props) {
      React.useEffect(() => { log({ slot: 'tab', props: Object.keys(props), install: typeof props.install, openPackage: typeof props.openPackage }) }, [])
      return h('div', { 'data-s28-tab': true },
        h('p', null, 'Fishball tab content'),
        h('button', { type: 'button', 'data-s28-open': true, onClick: () => props.openPackage('fishball-spike-demo') }, 'Open in DSH: fishball-spike-demo'))
    }
    function Badge({ subject }) {
      React.useEffect(() => { log({ slot: 'badge', kind: subject?.kind, pkg: subject?.pkg?.name, keys: subject?.pkg ? Object.keys(subject.pkg) : null }) }, [subject?.kind, subject?.pkg?.name])
      if (subject?.kind !== 'bundle') return null
      return h(Tag, { tone: 'info', 'data-s28-badge': subject.pkg.name }, 'Off in Fishball')
    }
    function Action({ subject }) {
      const [on, setOn] = React.useState(false)
      React.useEffect(() => { log({ slot: 'actions', kind: subject?.kind, pkg: subject?.pkg?.name }) }, [subject?.kind, subject?.pkg?.name])
      if (subject?.kind !== 'bundle') return null
      return h('span', { 'data-s28-action': subject.pkg.name }, h(Switch, { checked: on, label: 'Use in Fishball', onChange: setOn }))
    }
    return {
      name: 'fishball-spike-manager-host',
      inject: ['slots', 'locale', 'layout', 'pluginNavigation'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en: { title: 'Fishball' }, zh: { title: 'Fishball' } }), 's28 locale')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('plugins.tab', () => ctx.slots.register({ name: 'plugins.tab', id: 'fishball', label: () => t('title'), locale: NS }, FishballTab))
        ctx.slots.inject('plugins.detail.badge', () => ctx.slots.register({ name: 'plugins.detail.badge', id: 'fishball-badge', locale: NS }, Badge))
        ctx.slots.inject('plugins.detail.actions', () => ctx.slots.register({ name: 'plugins.detail.actions', id: 'fishball-action', locale: NS }, Action))
        // Selecting the tab from outside: DSH offers only pluginNavigation.openBundle (Installed tab).
        window.__s28openTab = async () => {
          const nav = ctx.get('pluginNavigation')
          log({ navigation: nav ? Object.keys(nav) : null })
          nav?.openBundle('fishball-spike-manager-host')
          await new Promise((r) => setTimeout(r, 300))
          const tab = [...document.querySelectorAll('[role=tab]')].find((el) => el.textContent.trim() === 'Fishball')
          tab?.click()
          await new Promise((r) => setTimeout(r, 300))
          const selected = [...document.querySelectorAll('[role=tab]')].find((el) => el.getAttribute('aria-selected') === 'true')?.textContent.trim()
          log({ openTab: { found: tab !== undefined, selected, content: document.querySelector('[data-s28-tab]') !== null } })
          return selected
        }
      },
    }
  },
})
