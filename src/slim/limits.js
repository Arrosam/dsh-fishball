/**
 * Every numeric limit the slim contract names (§3.6, §5.2, §6.2, §6.4's hostRef lifetime, and
 * the answer/decision-label caps §5.2 and §8.1 require), in one place. Units are part of each
 * name, and values with different meanings keep separate names even when they coincide.
 * Contract only: no DSH package import and no behaviour (§15 T01).
 */

const KIB = 1024
const MIB = KIB * KIB
const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS

export const LIMITS = Object.freeze({
  // Embed broker, per proxied request or stream (§3.6).
  embedJsonBodyBytes: 1 * MIB,
  embedUploadBodyBytes: 8 * MIB,
  embedConcurrentStreams: 32,
  embedStreamIdleTimeoutMs: 30 * SECOND_MS,
  embedSseHeartbeatMs: 15 * SECOND_MS,

  // Bridge frames and lists (§5.2). A text frame uses the broker's 1 MiB JSON body bound.
  // attachment.put carries a whole 4 MiB image as base64, so its frame uses the broker's 8 MiB
  // upload bound instead (§3.6: base64 of a 4 MiB image plus headroom); §5.2 says attachment
  // frames are bounded separately.
  envelopeBytes: 1 * MIB,
  attachmentEnvelopeBytes: 8 * MIB,
  sessionsListed: 100,

  // Images and chunked transfers (§6.2). imageBytes is the 4 MiB transfer bound; the two
  // 4 194 304 values are DSH's own pixel and normalized-byte budgets, kept apart by meaning.
  imageBytes: 4 * MIB,
  imagePixels: 4_194_304,
  normalizedImageBytes: 4_194_304,
  imagesPerMessage: 20,
  // The same 20-per-message bound caps the hostRef list one message carries.
  attachmentsPerMessage: 20,
  chunkBytes: 512 * KIB,
  transfersPerMessage: 1,

  // A hostRef is single-use and expires ten minutes after attachment.put completes (§6.4).
  hostRefTtlMs: 10 * MINUTE_MS,

  // Answer payloads and the decision-label snapshot (§5.2, §8.1). Reason, note, feedback and
  // custom text reuse the plugin's 500-character rationale budget; a short label/header/title
  // keeps one timeline row readable; a quoted user message matches requestUserMessageBytes.
  reasonChars: 500,
  questionChars: 500,
  noteChars: 500,
  feedbackChars: 500,
  customChars: 500,
  labelChars: 200,
  titleChars: 200,
  quoteBytes: 2048,
  grantPrefixChars: 512,
  questionsPerRequest: 32,
  selectedLabelsPerAnswer: 32,
})
