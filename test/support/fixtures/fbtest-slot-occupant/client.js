/**
 * CHILD-BOOT fixture, browser half (classic ModuleLoader script, the SDK's own client format).
 *
 * Forces a REAL setup failure in fishball-page through a documented native refusal of the SDK slot
 * core: a second list-slot entry with the same id at the same priority throws ("list slot ...
 * already has an entry with id ... at priority 0"). fishball-page puts its navigation into the
 * `shell.overlay` list slot (requirement R2); the entry id `fishball-page.navigation` was read
 * from the live runtime's registration (observed, not from product code). This plugin needs only
 * `slots`, so it applies before fishball-page and takes that place first; the page's own
 * registration then throws inside its setup, and DSH's boot reports `fishball-page: failed`.
 *
 * Single slots the page also occupies (`conversation.hero.workspace`, `settings.launcher`, both
 * at priority -1) are NOT used: they are declared after the page applies, so a refusal there is
 * thrown asynchronously by slots.inject's re-run and does not fail the page's setup (checked on
 * both SDKs).
 */
window.__ModuleLoader__.load({
  id: 'fbtest-slot-occupant',
  factory: () => {
    const module = { exports: {} }
    const OCCUPIED = Object.freeze({ slot: 'shell.overlay', id: 'fishball-page.navigation' })
    const Empty = () => null
    module.exports.inject = ['slots']
    module.exports.apply = (ctx) => {
      ctx.slots.inject(OCCUPIED.slot, () => ctx.slots.register({ name: OCCUPIED.slot, id: OCCUPIED.id }, Empty))
    }
    return module.exports
  },
})
