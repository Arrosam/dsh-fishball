/**
 * R-FIX-CORE black-box rows for the façade's `attachment_read` (review finding F13; acceptance
 * criteria in the task's requirements, .rfix-requirements.md): for the model a successful result
 * is one text block with `{attachmentId, mediaType, total, sha256}` (no chunks) and one DSH image
 * block `{type: 'image', attachment}` saved through DSH's `attachments` service
 * (`createBridge({attachments: () => store})`). Non-canonical base64, a decoded size ≠ `total`, a
 * sha256 mismatch, a media type outside png/jpeg/webp/gif, more than 4 MiB, or no store → a text
 * block saying the image is unavailable, with no base64 in model text. A scoped programmatic
 * caller (`bridge(...)`) still gets the structured result.
 *
 * Level: integration, in F-FACADE's world (world.mjs: real DSH tools and agent loop, a scripted
 * model, the fake link answering `attachment_read`), with a recording attachment store. The
 * limits are the connector contract's §4.4 (docs/connector-contract.md), stated here as test data.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { FIXTURE, GATE, TOOLS } from './constants.mjs'
import { worldFor } from './world.mjs'

const json = (value) => JSON.stringify(value)
/** Connector contract §4.4: chunk size, image limit and media types (test data restating the contract). */
const CONTRACT = Object.freeze({
  chunkBytes: 512 * 1024,
  imageBytes: 4 * 1024 * 1024,
  mediaTypes: Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  /** A media type the image rule does not accept. */
  otherType: 'image/svg+xml',
})
/** A 1×1 transparent PNG (fixture bytes). */
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6300010000050001' + '0d0a2db40000000049454e44ae426082', 'hex')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** Canonical padded base64 chunks of `bytes`, each at most CONTRACT.chunkBytes decoded. */
function chunksOf(bytes) {
  const out = []
  for (let i = 0; i < bytes.length; i += CONTRACT.chunkBytes) out.push(bytes.subarray(i, i + CONTRACT.chunkBytes).toString('base64'))
  return out.length === 0 ? [''] : out
}
/** The connector's `attachment_read` answer for `bytes` (contract §4.4), with field overrides. */
const readResult = (bytes, overrides = {}) => ({
  ok: true, attachmentId: FIXTURE.attachmentId, mediaType: CONTRACT.mediaTypes[0], total: bytes.length, sha256: sha256(bytes), chunks: chunksOf(bytes), ...overrides,
})
const readArgs = { sessionId: FIXTURE.sessionId, attachmentId: FIXTURE.attachmentId }

/** A recording DSH attachment store: `saveImages` returns one ImageAttachmentRef per input. */
function recordingStore() {
  const saved = []
  return {
    saved,
    store: {
      async saveImages(inputs) {
        return inputs.map((input, i) => {
          saved.push({ mediaType: input.mediaType, bytes: Buffer.from(input.data) })
          return { attachmentId: 'fbtest-rfix-att-' + (saved.length + i), mediaType: input.mediaType, bytes: input.data.length, width: 1, height: 1 }
        })
      },
    },
  }
}

/** The model's attachment_read result content, in a world whose fake link answers `answer`. */
async function modelRead(t, sdk, answer, { store } = {}) {
  const w = await worldFor(t, sdk, { tools: [...TOOLS], answers: { [GATE.imageTool]: () => answer } }, { imagesSupported: true, ...(store === undefined ? {} : { attachments: () => store }) })
  const result = await w.modelCalls(GATE.imageTool, readArgs)
  return { w, content: result.content ?? [] }
}
const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
/** Every base64 chunk of `answer` that appears in the model's text. */
const leakedChunks = (content, answer) => (answer.chunks ?? []).filter((c) => c.length > 8 && json(content).includes(c))

/** An unavailable-image answer: text only, says unavailable, no base64, nothing saved. */
function assertUnavailable(content, answer, saved) {
  assert.deepEqual(content.filter((b) => b.type !== 'text').map((b) => b.type), [], 'non-text blocks for an unusable image')
  assert.match(textOf(content), /unavailable/i, 'the text does not say the image is unavailable: ' + textOf(content).slice(0, 300))
  assert.deepEqual(leakedChunks(content, answer), [], 'base64 reached the model text')
  if (saved !== undefined) assert.deepEqual(saved, [], 'an unusable image was saved')
}

export function registerRfixBridgeCases(sdk) {
  for (const mediaType of CONTRACT.mediaTypes) {
    caseTest(sdk, 'RFIX-F13-EP-01', `valid ${mediaType}`, `a valid ${mediaType} result → one metadata text block (no chunks) and one image block saved through DSH's attachments`, async (t) => {
      const rec = recordingStore()
      const answer = readResult(PNG, { mediaType })
      const { content } = await modelRead(t, sdk, answer, { store: rec.store })
      const texts = content.filter((b) => b.type === 'text')
      const images = content.filter((b) => b.type === 'image')
      assert.equal(texts.length, 1, 'text blocks: ' + json(content).slice(0, 400))
      assert.equal(images.length, 1, 'image blocks: ' + json(content).slice(0, 400))
      const meta = JSON.parse(texts[0].text)
      assert.deepEqual({ attachmentId: meta.attachmentId, mediaType: meta.mediaType, total: meta.total, sha256: meta.sha256 }, { attachmentId: answer.attachmentId, mediaType, total: answer.total, sha256: answer.sha256 })
      assert.equal(meta.chunks, undefined, 'the metadata block carries chunks')
      assert.deepEqual(leakedChunks(content, answer), [], 'base64 reached the model text')
      assert.equal(rec.saved.length, 1, 'images saved through the store')
      assert.deepEqual({ mediaType: rec.saved[0].mediaType, equal: rec.saved[0].bytes.equals(PNG) }, { mediaType, equal: true })
      assert.ok(images[0].attachment?.attachmentId, 'the image block names no saved attachment: ' + json(images[0]))
    })
  }
  caseTest(sdk, 'RFIX-F13-BVA-01', 'exactly 4 MiB', `an image of exactly ${CONTRACT.imageBytes} bytes (in ${CONTRACT.chunkBytes}-byte chunks) → shown as an image`, async (t) => {
    const rec = recordingStore()
    const bytes = Buffer.alloc(CONTRACT.imageBytes, 7)
    const { content } = await modelRead(t, sdk, readResult(bytes), { store: rec.store })
    assert.equal(content.filter((b) => b.type === 'image').length, 1, json(content.map((b) => b.type)))
    assert.equal(rec.saved[0]?.bytes.length, CONTRACT.imageBytes)
  })
  caseTest(sdk, 'RFIX-F13-BVA-01', '4 MiB + 1', `an image of ${CONTRACT.imageBytes + 1} bytes → unavailable text, nothing saved`, async (t) => {
    const rec = recordingStore()
    const answer = readResult(Buffer.alloc(CONTRACT.imageBytes + 1, 7))
    const { content } = await modelRead(t, sdk, answer, { store: rec.store })
    assertUnavailable(content, answer, rec.saved)
  })
  const BROKEN = [
    ['non-canonical base64 (no padding)', () => { const a = readResult(PNG); return { ...a, chunks: a.chunks.map((c) => c.replace(/=+$/, '')) } }],
    ['non-canonical base64 (url alphabet)', () => { const bytes = Buffer.from([0xfb, 0xff, 0xfe, ...PNG]); const a = readResult(bytes); return { ...a, chunks: [bytes.toString('base64url')] } }],
    ['decoded size ≠ total (one less)', () => readResult(PNG, { total: PNG.length - 1 })],
    ['decoded size ≠ total (one more)', () => readResult(PNG, { total: PNG.length + 1 })],
    ['sha256 mismatch', () => readResult(PNG, { sha256: sha256(Buffer.from('other')) })],
    [`media type ${CONTRACT.otherType}`, () => readResult(PNG, { mediaType: CONTRACT.otherType })],
  ]
  for (const [label, answerOf] of BROKEN) {
    caseTest(sdk, 'RFIX-F13-DT-01', label, `${label} → a text block saying the image is unavailable; no base64; nothing saved`, async (t) => {
      const rec = recordingStore()
      const answer = answerOf()
      const { content } = await modelRead(t, sdk, answer, { store: rec.store })
      assertUnavailable(content, answer, rec.saved)
    })
  }
  caseTest(sdk, 'RFIX-F13-DT-01', 'no attachment store', 'a valid image but no attachment store → unavailable text, no base64', async (t) => {
    const answer = readResult(PNG)
    const { content } = await modelRead(t, sdk, answer)
    assertUnavailable(content, answer)
  })
  caseTest(sdk, 'RFIX-F13-DT-01', 'programmatic caller', 'a scoped programmatic caller (bridge(...)) still gets the structured result, chunks included', async (t) => {
    const rec = recordingStore()
    const answer = readResult(PNG)
    const w = await worldFor(t, sdk, { tools: [...TOOLS], answers: { [GATE.imageTool]: () => answer } }, { imagesSupported: true, attachments: () => rec.store })
    const got = await w.bridge.bridge(FIXTURE.pluginX12, [GATE.imageTool]).call(GATE.imageTool, readArgs)
    assert.deepEqual(got?.chunks, answer.chunks, 'the scoped caller did not get the chunks: ' + json(got).slice(0, 200))
    assert.equal(got?.sha256, answer.sha256)
  })
}
