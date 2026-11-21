/**
 * The readable-name generator (the user's decision, 2026-11-21): a pair the connector would
 * otherwise leave nameless gets "<Adjective> <Noun>" (GENERATED_NAME), unique among the names other
 * principals hold under the one fold every name check uses (K1 `nameKey`, R-NAME-02). Pure but for
 * the injectable random source; the store (`./store.js`) decides when a name is generated.
 */
import { randomInt } from 'node:crypto'
import { nameKey } from '../../mcp-schema/index.js'
import { GENERATED_NAME } from './constants.js'

const pick = (words, random) => words[random(words.length)]
const joined = (...parts) => parts.join(GENERATED_NAME.separator)

/**
 * A generated name no holder of `heldNames` holds, compared folded.
 * @param heldNames - the (normalised) names other principals hold.
 * @param random - `random(n)` gives an integer in [0, n); defaults to node:crypto `randomInt`.
 * @returns up to GENERATED_NAME.randomTries random draws; when every draw is held, the last draw
 *   with the first free suffix " 2", " 3", …. Of any `held.size + 1` suffixes at least one is free
 *   (pigeonhole), so the suffix loop always ends.
 */
export function generateName(heldNames, random = randomInt) {
  const held = new Set([...heldNames].map(nameKey))
  const isFree = (name) => !held.has(nameKey(name))
  let base
  for (let draw = 0; draw < GENERATED_NAME.randomTries; draw += 1) {
    base = joined(pick(GENERATED_NAME.adjectives, random), pick(GENERATED_NAME.nouns, random))
    if (isFree(base)) return base
  }
  const suffixed = (suffix) => joined(base, String(suffix))
  let suffix = GENERATED_NAME.firstSuffix
  while (!isFree(suffixed(suffix))) suffix += 1
  return suffixed(suffix)
}
