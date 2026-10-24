/** Smoke fixture: global tools under hidden names plus bsk_inspect and an ordinary tool. */
export const name = 'fishball-smoke-hidden'
export const inject = ['tools']
const def = (name, parameters = { type: 'object', properties: { a: { type: 'string' } } }) => ({
  name, description: 'smoke ' + name, parameters,
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
  async execute(args) { globalThis.__smokeCalls = [...(globalThis.__smokeCalls ?? []), [name, args]]; return name + ' ran' },
})
export function apply(ctx) {
  for (const n of ['image_generate', 'write', 'subagent_fork', 'demo_echo']) ctx.tools.register(def(n))
  ctx.tools.register(def('bsk_inspect', { type: 'object', properties: { action: { type: 'string' }, output: { type: 'string' }, videoAction: { type: 'string', enum: ['start', 'stop', 'save'] } } }))
}
