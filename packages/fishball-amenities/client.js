window.__ModuleLoader__.load({
  id: 'fishball-amenities',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const LOCALE = 'fishball-amenities'
    const en = { hint: 'Configure each Fishball amenity in its component settings below (open a component under Components and click Configure).' }
    const zh = { hint: '请在下方“组件”列表中点击对应组件进入组件设置进行配置。' }

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
