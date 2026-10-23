// Registers the empty, tool-less agent preset the installed worker selects
// (`agentPreset: 'df-initial-preview-read-only'`). It grants nothing: no
// plugins, tools or authority. Kept as its own entry so a normal profile can
// load it without the initial-preview launcher host script; loaded by absolute path (see docs/live-install.md).
export const name = 'dsh-fishball-read-only-preset';
export const inject = Object.freeze(['agentPresets']);
export const PRESET = Object.freeze({ id: 'df-initial-preview-read-only', name: 'DF Read Only', plugins: Object.freeze([]) });

export async function apply(ctx) {
  const release = await ctx.agentPresets.register({ ...PRESET, plugins: [] });
  if (typeof release !== 'function') throw new Error('DF_PRESET_UNAVAILABLE');
  ctx.effect(() => release, 'df.read-only-preset');
}
export default Object.freeze({ name, inject, apply });
