import test from 'node:test';

/** Exact supported SDK matrix; a title is an obligation, never evidence of execution. */
export const SDK_VERSIONS = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']);

/**
 * Register requirements that have no documented controllable fixture yet.
 * Missing product seams must remain TODO: checking this catalogue's own metadata
 * or a model of the desired policy would not verify the product's behavior.
 */
export function registerTaskCases(cases) {
  for (const sdk of SDK_VERSIONS) {
    for (const entry of cases) {
      const title = `${entry.task} ${entry.id} [${sdk}] ${entry.title}`;
      test.todo(`${title} — owner ${entry.task}: ${entry.missing}`);
    }
  }
}
