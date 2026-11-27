/**
 * Revision 12 stand-in for the recommended plugin "dsh-idle-compact" (never the real package): installed from this
 * local directory, so no test reaches npm. Self-contained, with no imports, because pnpm copies or links it.
 */
const store = (globalThis.__fbtestFixtures ??= {})
store.bundleEvents ??= []
store.calls ??= []

export const name = 'dsh-idle-compact'
export const inject = ['tools']
export function apply(ctx) {
  ctx.effect(() => {
    store.bundleEvents.push({ bundle: name, type: 'apply', at: Date.now() })
    const dispose = ctx.tools.register({
      name: 'rec_idle_echo',
      description: 'fbtest fixture tool rec_idle_echo. Records every call.\nSecond description line, never part of an approval reason.',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      async execute(args, exec) { store.calls.push({ name: 'rec_idle_echo', args, sessionId: exec?.agent?.id ?? null, at: Date.now() }); return 'fixture:rec_idle_echo' },
    })
    return () => { dispose(); store.bundleEvents.push({ bundle: name, type: 'dispose', at: Date.now() }) }
  }, 'dsh-idle-compact fbtest stand-in')
}
