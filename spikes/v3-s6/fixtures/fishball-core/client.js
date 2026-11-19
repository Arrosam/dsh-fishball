/**
 * V3-S6 probe: ONE dsh.client module carrying the page, the recommended tab and the settings
 * panel contributions. Each registration marks the DOM so the browser check can see it.
 */
window.__ModuleLoader__.load({
  id: 'fishball-core',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const MARK = 'data-s6'
    const Tab = () => h('div', { [MARK]: 'recommended-tab' }, 'Fishball Recommended (spike)')
    const Panel = () => h('div', { [MARK]: 'settings-panel' }, 'Fishball settings (spike)')
    const Overlay = () => h('div', { [MARK]: 'page-overlay', style: { position: 'fixed', bottom: 0, right: 0 } }, 'Fishball page (spike)')
    function apply(ctx) {
      window.__s6Client = { applied: true, slots: [] }
      const add = (name, props, Component) => ctx.effect(() => ctx.slots.inject(name, () => {
        window.__s6Client.slots.push(name)
        return ctx.slots.register({ name, ...props }, Component)
      }), 's6: ' + name)
      add('shell.overlay', { id: 'fishball-page.s6' }, Overlay)
      add('plugins.tab', { id: 'fishball-recommended', label: () => 'Fishball Recommended' }, Tab)
      add('main', { key: 'fishball-settings' }, Panel)
    }
    return { name: 'fishball-core', inject: ['slots'], apply }
  },
})
