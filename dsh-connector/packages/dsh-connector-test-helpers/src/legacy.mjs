/**
 * Vocabulary the moved suites kept from the old root harness (test/support/constants.mjs). New code
 * imports from repo.mjs, homes.mjs, sdk.mjs and dsh/fake-llm-constants.mjs directly.
 */
export { REPO } from './repo.mjs'
export { TEST_HOMES } from './homes.mjs'
export { INSTANCE } from './sdk.mjs'
export { FAKE, FAKE_MODELS } from './dsh/fake-llm-constants.mjs'
/** The Node binary the tests run on. */
export const NODE = process.execPath
