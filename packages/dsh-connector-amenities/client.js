window.__ModuleLoader__.load({
  id: 'dsh-connector-amenities',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const LOCALE = 'dsh-connector-amenities'
    const en = { hint: 'Configure each connector amenity in its component settings below (open a component under Components and click Configure).' }
    const zh = { hint: '请在下方“组件”列表中点击对应组件进入组件设置进行配置。' }

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
