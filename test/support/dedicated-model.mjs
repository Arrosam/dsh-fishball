/** Requirement-owned vocabulary: no production constants or implementation decisions are imported. */
import { FAKE, FAKE_MODELS, RUNTIME } from './constants.mjs'

export const MODEL_CASE = Object.freeze({
  api: Object.freeze({ models: '/api/fishball/models', select: '/api/fishball/model' }),
  selection: Object.freeze({ provider: FAKE.provider, model: FAKE_MODELS.b }),
  original: Object.freeze({ provider: FAKE.provider, model: FAKE.model }),
  unavailable: Object.freeze({ provider: FAKE.provider, model: 'no-such-dedicated-model' }),
  unknownProvider: Object.freeze({ provider: 'no-such-dedicated-provider', model: FAKE.model }),
  env: Object.freeze({ FBTEST_DSH_RUNTIME: RUNTIME }),
  http: Object.freeze({ ok: 200, successStart: 200, successEnd: 299 }),
  text: Object.freeze({ probe: 'dedicated-model isolation probe', reply: 'dedicated-model reply' }),
  pending: Object.freeze({ hangMs: 1000, waitMs: 5000, pollMs: 10 }),
  malformed: Object.freeze([
    ['empty record', {}],
    ['question settings record', { mode: 'auto', changedAt: 1 }],
    ['context settings record', { contextWindowTokens: 24000, maxOutputTokens: 2000 }],
    ['provider only', { provider: FAKE.provider }],
    ['model only', { model: FAKE_MODELS.b }],
    ['empty provider', { provider: '', model: FAKE_MODELS.b }],
    ['empty model', { provider: FAKE.provider, model: '' }],
  ]),
  zero: 0,
  one: 1,
})

export const isSuccess = (response) => response.status >= MODEL_CASE.http.successStart && response.status <= MODEL_CASE.http.successEnd
export const modelIdentity = (value) => value && ({ provider: value.provider, model: value.model })
