window.__ModuleLoader__.load({
  id: 'fishball-amenities',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const LOCALE = 'fishball-amenities'
    // Each amenity is its own package (fishball-board, fishball-heartbeat, fishball-taskboard); installed
    // through this umbrella, they show as its components below, each with its own settings.
    const en = { hint: 'This installs the Fishball amenities, fishball-board, fishball-heartbeat and fishball-taskboard (each also installable on its own). Configure each in its component settings below.' }
    const zh = { hint: '此插件一并安装 Fishball 的附加组件 fishball-board、fishball-heartbeat 与 fishball-taskboard（三者也可单独安装）。请在下方各组件的组件设置中分别配置。' }

    function apply(ctx) {
      const t = ctx.locale.bind(LOCALE)
      ctx.effect(() => ctx.locale.register(LOCALE, { en, zh }), 'fishball-amenities: locale')
      ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: 'fishball-amenities',
        locale: LOCALE,
      }, () => h('p', { style: { margin: 0, fontSize: '13px', opacity: 0.78 } }, t('hint')))), 'fishball-amenities: hint')
    }

    return { name: 'fishball-amenities', inject: ['slots', 'locale'], apply }
  },
})
