/** WD-1 owns package identity and the required host services, not runtime readiness. */
export const PLUGIN = Object.freeze({ name: 'fishball-watchdog', instanceService: 'fishballInstance', apiVersion: 1 })
export const SERVICES = Object.freeze(['agents', 'tools', 'llm', 'profileContext'])

/**
 * §2.8 save-time budget only. Each bounded read rounds separately; the card allowance is
 * shared by all non-read additions, not multiplied by a quote or field count.
 * Keep the callback self-contained: schemastery serializes it into the settings schema
 * and revives it without this module's lexical environment in both supported hosts.
 */
export function validateGrowthBudget(config) {
  const BUDGET = Object.freeze({ bytesPerToken: 3, initialReads: 1, readsPerTurn: 2, cardBudgetTokens: 768 })
  const minimum = (BUDGET.initialReads + BUDGET.readsPerTurn)
    * Math.ceil(config.readMaxBytes / BUDGET.bytesPerToken)
    + BUDGET.cardBudgetTokens + config.maxOutputTokens
  if (config.turnGrowthTokens < minimum) {
    throw new RangeError(`turnGrowthTokens must be at least ${minimum} for these read and output budgets`)
  }
  return config
}
