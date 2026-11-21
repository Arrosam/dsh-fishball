window.__ModuleLoader__.load({
  id: 'dsh-connector-amenities',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const LOCALE = 'dsh-connector-amenities'
    // Each amenity is its own package (dsh-connector-adapter, dsh-connector-watchdog); installed through
    // this umbrella, they show as its components below, each with its own settings.
    const en = { hint: 'This installs the DSH Connector amenities, dsh-connector-adapter and dsh-connector-watchdog (each also installable on its own). Configure each in its component settings below.' }
    const zh = { hint: '此插件一并安装 DSH Connector 的附加组件 dsh-connector-adapter 与 dsh-connector-watchdog（二者也可单独安装）。请在下方各组件的组件设置中分别配置。' }

    function apply(ctx) {
      const t = ctx.locale.bind(LOCALE)
      ctx.effect(() => ctx.locale.register(LOCALE, { en, zh }), 'dsh-connector-amenities: locale')
      ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: 'dsh-connector-amenities',
        locale: LOCALE,
      }, () => h('p', { style: { margin: 0, fontSize: '13px', opacity: 0.78 } }, t('hint')))), 'dsh-connector-amenities: hint')
    }

    return { name: 'dsh-connector-amenities', inject: ['slots', 'locale'], apply }
  },
})
