/**
 * Package add_plugin installs by absolute path (R12). Self-contained, with no
 * imports, because pnpm links it into the profile and nothing else resolves there.
 */
const store = (globalThis.__fbtestFixtures ??= {})
store.bundleEvents ??= []
store.calls ??= []

export const name = 'fbtest-added'
export const inject = ['tools']
export function apply(ctx) {
  ctx.effect(() => {
    store.bundleEvents.push({ bundle: name, type: 'apply', at: Date.now() })
    const dispose = ctx.tools.register({
      name: 'added_echo',
      description: 'fbtest fixture tool added_echo. Records every call.\nSecond description line, never part of an approval reason.',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      async execute(args, exec) { store.calls.push({ name: 'added_echo', args, sessionId: exec?.agent?.id ?? null, at: Date.now() }); return 'fixture:added_echo' },
    })
    return () => { dispose(); store.bundleEvents.push({ bundle: name, type: 'dispose', at: Date.now() }) }
  }, 'fbtest-added fixture')
}
