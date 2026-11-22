/** The scripted fake model's vocabulary (fake-llm.mjs): test values, not product values. */

/** The scripted model route. */
export const FAKE = Object.freeze({ provider: 'fishball-test', model: 'test-model' })
/** Further fake models on the same provider: b has another window, nowin reports none. */
export const FAKE_MODELS = Object.freeze({ b: 'test-model-b', nowin: 'test-model-nowin' })
/** Fake model windows and the adapter's default reply cap (defaultMaxTokens). */
export const FAKE_WINDOW = Object.freeze({ default: 128000, b: 300000, defaultMaxTokens: 4096 })
/** A scripted tool argument with this exact value is replaced by the newest permission request id. */
export const REQUEST_PLACEHOLDER = '$fbtest:last-request-id'
/** The environment variable naming the DSH runtime (node_modules) the fake row imports dsh-llm from. */
export const RUNTIME_ENV = 'DSH_TEST_RUNTIME'
