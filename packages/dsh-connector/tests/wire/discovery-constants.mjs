/**
 * DISCOVERY-TOOLS system rows (discovery-cases.mjs): fixture data only. Product words (tool names,
 * refusal codes) are K1's; the fake provider and its models are dsh-connector-test-helpers' FAKE / FAKE_MODELS (dsh/fake-llm-constants.mjs).
 */
import path from 'node:path'
import { FAKE, FAKE_MODELS } from 'dsh-connector-test-helpers/legacy'

export const DISCOVERY = Object.freeze({
  id: 'DISCOVERY-SYS',
  scenario: 'discovery',
  extension: path.join(import.meta.dirname, 'discovery-extension.mjs'),
  /** The exact model strings session_start takes for the fake provider's two models. */
  models: Object.freeze([FAKE.model, FAKE_MODELS.b].map((model) => ({ model: `${FAKE.provider}/${model}`, id: model }))),
  /** The worker's overlay makes the fake default model DSH's default. */
  defaultModel: `${FAKE.provider}/${FAKE.model}`,
  /** A reasoning effort no fake model lists (the fake catalog advertises none). */
  unlistedEffort: 'fbtest-unlisted-effort',
  folder: 'discovery-ws',
  title: 'fbtest discovery title',
  workspaceTitle: 'fbtest discovery workspace',
  message: 'fbtest discovery message',
  /** The parent folder the worker's `folder` op creates fixture directories in (worker.mjs). */
  workDir: 'work',
  listLimit: 100,
})