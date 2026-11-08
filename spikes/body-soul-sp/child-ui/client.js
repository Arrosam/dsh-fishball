/**
 * SP spike only: the browser half of the throwaway child UI row (§0.5 session-only frame).
 * Empty priority -1 occupants shadow `sidebar`, `shell.leading` and `conversation.hero.workspace`;
 * the sidebar is collapsed once; Fishball's session opens once it is listed. A header action
 * stands in for the instance's Settings entry. window.__spLog keeps the steps for the probe.
 */
window.__ModuleLoader__.load({ id: 'sp-child-ui', factory(require) {
  const module = { exports: {} }
  const React = require('react')
  const SP = { sessionPath: 'api/fishball-sp/session', retries: 40, retryMs: 250, collapseMs: 300 }
  const log = (window.__spLog = [])
  const note = (step, detail) => { log.push({ step, detail: detail === undefined ? undefined : String(detail) }) }
  const Empty = () => null
  const SettingsAction = () => React.createElement('button', { type: 'button', 'data-sp': 'settings-action', onClick: () => note('settings-action') }, 'Fishball settings')
  module.exports.inject = ['slots', 'uiWorkspace', 'layout']
  module.exports.apply = (ctx) => {
    // SP3 probe hook: lets the spike ask DSH's layout for its own `plugins` main panel.
    window.__spLayout = ctx.layout
    for (const name of ['sidebar', 'shell.leading', 'conversation.hero.workspace']) {
      try { ctx.slots.inject(name, () => ctx.slots.register({ name, priority: -1 }, Empty)); note('shadow', name) } catch (error) { note('shadow-failed', `${name}: ${error.message}`) }
    }
    try {
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'sp-settings', order: 100 }, SettingsAction))
      note('header-action')
    } catch (error) { note('header-action-failed', error.message) }
    fetch(SP.sessionPath).then((response) => response.json()).then(({ sessionId }) => {
      note('session', sessionId)
      const open = (left) => {
        try {
          ctx.uiWorkspace.openSession(sessionId)
          note('opened', sessionId)
          setTimeout(() => {
            if (!document.querySelector('[data-sidebar-collapsed]')) { ctx.layout.toggleSidebar(); note('collapsed') }
          }, SP.collapseMs)
        } catch (error) {
          if (left > 0) setTimeout(() => open(left - 1), SP.retryMs)
          else note('open-failed', error.message)
        }
      }
      open(SP.retries)
    }).catch((error) => note('session-failed', error.message))
  }
  return module.exports
} })
