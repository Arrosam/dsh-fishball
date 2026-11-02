/** S14 fixture client half: Fishball brand mark/name; the name occupant takes over its enclosing button's click. */
window.__ModuleLoader__.load({
  id: 'fishball-spike-brand',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const LABEL = 'Open Fishball'
    async function assistantId() {
      const res = await fetch('api/fishball-spike/state', { cache: 'no-store' })
      return (await res.json()).sessionId
    }
    function Mark({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', 'data-fishball-mark': true },
        h('circle', { cx: 12, cy: 12, r: 10, fill: '#f2a33a' }), h('circle', { cx: 9, cy: 10, r: 1.6, fill: '#222' }))
    }
    function makeName(ctx) {
      return function Name() {
        const ref = React.useRef(null)
        React.useEffect(() => {
          const button = ref.current?.closest('button')
          if (!button) return undefined
          const previous = button.getAttribute('aria-label')
          button.setAttribute('aria-label', LABEL)
          button.dataset.fishballBrand = 'true'
          const onClick = (event) => {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
            assistantId().then((id) => { if (id) ctx.get('uiWorkspace')?.openSession(id) })
          }
          // Capture phase on the button runs before React's delegated handler at the root.
          button.addEventListener('click', onClick, true)
          return () => { button.removeEventListener('click', onClick, true); if (previous !== null) button.setAttribute('aria-label', previous); delete button.dataset.fishballBrand }
        }, [])
        return h('span', { ref, 'data-fishball-name': true, style: { fontWeight: 600 } }, 'Fishball')
      }
    }
    exports.name = 'fishball-spike-brand'
    exports.inject = ['slots']
    exports.apply = function apply(ctx) {
      const Name = makeName(ctx)
      ctx.effect(() => ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
        // Single slots render their LOWEST-priority entry; the shipped brand uses the default 0.
        yield ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, Mark)
        yield ctx.slots.register({ name: 'sidebar.brand.name', priority: -1 }, Name)
      })), 'fishball brand')
    }
    return module.exports
  },
})