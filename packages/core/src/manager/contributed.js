/**
 * The key of core's own read of the tools X2 contributions hold in a manager's scope
 * (`fishballInstance[CONTRIBUTED_TOOLS](agent) → string[]`, src/manager/service.js
 * `contributedTools`). A module symbol, so only core's own rows (the main row provides it, the guard
 * row reads it for R-FB-13) reach it: it is not a member of the frozen `fishballInstance` contract
 * (K3 index.d.ts), and no other plugin can read or replace it. No import, so the guard check loads
 * it without DSH's host packages.
 */
export const CONTRIBUTED_TOOLS = Symbol('fishball-core: tools X2 contributions hold in a manager scope')
