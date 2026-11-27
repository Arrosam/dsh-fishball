/** Test bundle for spikes S1/S2/S20: registers one tool and one global counter. */
export const name = 'fishball-spike-demo'
export const inject = ['tools']
export function apply(ctx) {
  globalThis.__spikeDemoApplies = (globalThis.__spikeDemoApplies ?? 0) + 1
  ctx.tools.register({
    name: 'demo_echo',
    description: 'Echo the text back (spike fixture).',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
    async execute(args) { return String(args.text) },
  })
}
