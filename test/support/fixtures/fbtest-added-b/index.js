/**
 * Package installed through DSH's plugin manager while DSH runs (post-review change 13). Self-contained, with no
 * imports, because pnpm links it into the profile and nothing else resolves there.
 */
const store = (globalThis.__fbtestFixtures ??= {})
store.bundleEvents ??= []
store.calls ??= []

export const name = 'fbtest-added-b'
export const inject = ['tools']
export function apply(ctx) {
  ctx.effect(() => {
    store.bundleEvents.push({ bundle: name, type: 'apply', at: Date.now() })
    const dispose = ctx.tools.register({
      name: 'added_b_echo',
      description: 'fbtest fixture tool added_b_echo. Records every call.\nSecond description line, never part of an approval reason.',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
      async execute(args, exec) { store.calls.push({ name: 'added_b_echo', args, sessionId: exec?.agent?.id ?? null, at: Date.now() }); return 'fixture:added_b_echo' },
    })
    return () => { dispose(); store.bundleEvents.push({ bundle: name, type: 'dispose', at: Date.now() }) }
  }, 'fbtest-added-b fixture')
}