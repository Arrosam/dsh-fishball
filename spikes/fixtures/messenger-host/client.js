/**
 * Fixture browser half (as dsh-fishball's client.js would be): loads the nested messenger
 * package's browser file once, then mounts and unmounts it as a child plugin.
 * window.__s24 records what happened; window.__s24toggle(on) switches the messenger.
 */
window.__ModuleLoader__.load({
  id: 'fishball-spike-messenger-host',
  factory(require) {
    const MESSENGER = 'fishball-spike-messenger'
    const log = (what) => { (window.__s24 ??= []).push(what) }
    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const el = document.createElement('script')
        el.src = src
        el.onload = resolve
        el.onerror = () => reject(new Error('messenger script failed'))
        document.head.appendChild(el)
      })
    }
    async function messengerModule() {
      try { return require(MESSENGER) } catch { /* not registered yet */ }
      await loadScript('api/fishball-spike/messenger.js')
      return require(MESSENGER)
    }
    return {
      name: 'fishball-spike-messenger-host',
      inject: ['slots'],
      apply(ctx) {
        let fork
        window.__s24toggle = async (on) => {
          if (!on) { fork?.dispose(); fork = undefined; log('host: messenger off'); return }
          if (fork !== undefined) return
          const mod = await messengerModule()
          fork = ctx.plugin(mod)
          log('host: messenger on')
        }
        window.__s24toggle(true).catch((error) => log('host: error ' + error.message))
        ctx.effect(() => () => { fork?.dispose() }, 'spike messenger fork')
      },
    }
  },
})
