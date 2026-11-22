/**
 * The current DSH's own packages the events, bridge and asks worlds build one in-process Fishball
 * DSH from (cordis, sessions, storage, the agent loop, …), imported by name through
 * fishball-test-helpers/dsh. One function so the three worlds name their parts the same way.
 * Owned by the events area (packages/core/tests/events/), shared with bridge/ and asks/.
 */
import { importDsh } from 'fishball-test-helpers/dsh'

/** `{name: module}` for every DSH package in `names` (names without the @deepseek-ai/ scope). */
export async function dshParts(names) {
  const unique = [...new Set(names)]
  const mods = await Promise.all(unique.map((n) => importDsh(n)))
  return Object.fromEntries(unique.map((n, i) => [n, mods[i]]))
}
