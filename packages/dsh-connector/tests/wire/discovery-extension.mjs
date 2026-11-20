/**
 * Test-only worker extension for the DISCOVERY-TOOLS system rows: read-only views of DSH's own
 * live model catalog and workspace registry (the requirement's sources), as oracles for
 * models_list / workspaces_list. No product module is imported and nothing is changed.
 */
export function ops({ ctx, plain }) {
  return {
    /** DSH's sessionController.modelCatalog(), as DSH's model selector reads it. */
    async discoveryCatalog() { return plain(await ctx.sessionController.modelCatalog()) },
    /** DSH's workspace registry rows, in registry order. */
    async discoveryRegistry() { return (await ctx.workspaceRegistry.list()).map(({ id, title, path }) => ({ id, title, path })) },
  }
}
