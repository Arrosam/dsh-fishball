/**
 * Context-window policy (DESIGN §6), pure: no I/O, so every rule can be tested alone.
 *
 * Fishball enforces a smaller window with DSH's own compaction engine, configured so that
 * on the real model it behaves as on a model whose window IS the smaller one.
 * dsh-compaction-basic prices a routed request like this (lib/index.js resolveCompactSpec,
 * not exported, mirrored by specOf):
 *   messageBudget = W - reserved          (reserved: the request's reply cap)
 *   threshold     = floor(min(W * thresholdRatio, messageBudget - headroomTokens))
 *   retain        = retainTokens ?? floor(messageBudget * retainRatio)
 * where W is the MODEL's window. derivePolicy picks thresholdRatio and retainTokens so that,
 * with W = the model's window, threshold and retain equal what DSH's defaults give on
 * W = the effective window.
 */
import { CONTEXT, CONTEXT_ERROR } from './constants.js'

const { thresholdRatio: DSH_THRESHOLD_RATIO, retainRatio: DSH_RETAIN_RATIO, headroomTokens: DSH_HEADROOM } = CONTEXT.dshDefaults
/** DSH's policy when no smaller window is set. */
const DSH_POLICY = Object.freeze({ thresholdRatio: DSH_THRESHOLD_RATIO, headroomTokens: DSH_HEADROOM })

/**
 * Half a token keeps floor(W_model * ratio) from landing one token below the intended
 * threshold through floating-point rounding (the ratio is a quotient of two integers).
 */
const ROUNDING_GUARD = 0.5

/** The limits (src/config.js) that price a smaller window: every one evaluateWindow reads. */
export const PRICING_LIMITS = Object.freeze(['replyCapShare', 'headroomShare', 'minWindowTokens', 'defaultReplyCapTokens'])

/**
 * Default reply-length cap for a smaller window: one in limits.replyCapShare of it, at most
 * limits.defaultReplyCapTokens (Q-defaults).
 * @param window - the smaller window, in tokens; limits - current limits (readLimits).
 */
export const defaultOutputCap = (window, limits) => Math.min(limits.defaultReplyCapTokens, Math.floor(window / limits.replyCapShare))

/**
 * Compaction headroom for a smaller window; DSH also caps the summary's length with it.
 * @param window - the smaller window, in tokens; limits - current limits (readLimits).
 */
export const headroomFor = (window, limits) => Math.min(DSH_HEADROOM, Math.floor(window / limits.headroomShare))

/** dsh-compaction-basic's pricing of one request (see the module comment). */
export function specOf({ thresholdRatio, headroomTokens, retainTokens }, window, reserved) {
  const messageBudget = window - reserved
  const threshold = Math.floor(Math.min(window * thresholdRatio, messageBudget - headroomTokens))
  const retain = retainTokens ?? Math.floor(messageBudget * DSH_RETAIN_RATIO)
  return { threshold, retain }
}

/**
 * dsh-compaction-basic config making the engine, on a model of modelWindow, trigger and
 * retain as DSH's defaults would on a model of effectiveWindow with reply cap output.
 * @param limits - current limits (readLimits): headroomShare prices the headroom.
 * @returns { config, threshold, retain }; config holds thresholdRatio, headroomTokens,
 *   retainTokens and maxTokens (the summary's cap, which DSH otherwise ties to headroom).
 */
export function derivePolicy(effectiveWindow, modelWindow, output, limits) {
  const headroomTokens = headroomFor(effectiveWindow, limits)
  const target = specOf({ ...DSH_POLICY, headroomTokens }, effectiveWindow, output)
  return {
    config: {
      thresholdRatio: Math.min(1, (target.threshold + ROUNDING_GUARD) / modelWindow),
      headroomTokens,
      retainTokens: target.retain,
      maxTokens: headroomTokens,
    },
    ...target,
  }
}

/**
 * Whether a smaller window can work. After a compaction the request still carries the system
 * prompt and tools (envelope), the retained tail and the summary (at most summaryCap). All of
 * that must stay below the threshold, or compaction would run again at once and never settle.
 * The summary cap and reply cap must also be at least the minimum (review M2: DSH refuses a
 * summary cap of 0, which would break Fishball's compaction plugin; a reply cap of 0 is none).
 * While the envelope is unknown (no request yet), the minWindowTokens limit bounds the window.
 */
const fits = ({ threshold, retain }, envelope, summaryCap) => summaryCap >= CONTEXT.minCapTokens && threshold > 0 && retain + envelope + summaryCap < threshold

/**
 * Whether DSH's own engine accepts a reply cap on the model's full window: exactly the
 * conditions dsh-compaction-basic throws on (resolveCompactSpec), nothing stricter. DSH's
 * defaults are not second-guessed (review M4: its 65,536 summary cap is a bound, not a size).
 */
const dshAccepts = ({ threshold, retain }, window, reserved) => window - reserved > 0 && window - reserved - DSH_HEADROOM > 0 && retain < threshold

/**
 * Evaluate a setting against the current model.
 * @param setting - { contextWindowTokens?, maxOutputTokens? } (positive whole numbers when set).
 * @param model - { window?, defaultMaxTokens? } from the model adapter; window undefined = unknown.
 * @param envelopeTokens - system prompt plus tool declarations of the latest request (0 = unknown).
 * @param limits - current limits (src/config.js readLimits): replyCapShare, headroomShare,
 *   minWindowTokens and defaultReplyCapTokens price a smaller window.
 * @returns { modelWindow, effectiveWindow, outputCap, threshold, retain, config, error }.
 *   config is the compaction row's config ({} = DSH's defaults); outputCap the reply cap every
 *   request gets (undefined = none). error is a CONTEXT_ERROR code when the setting cannot
 *   apply: then none of it applies (DSH's defaults, no cap) and the reason is shown.
 */
export function evaluateWindow(setting, model, envelopeTokens, limits) {
  const requested = setting.contextWindowTokens
  const modelWindow = model.window
  const unapplied = (error) => ({ modelWindow, effectiveWindow: modelWindow, outputCap: undefined, threshold: undefined, retain: undefined, config: {}, error })
  const isUnset = requested === undefined && setting.maxOutputTokens === undefined
  if (modelWindow === undefined) return unapplied(isUnset ? null : CONTEXT_ERROR.modelWindowUnknown)

  // A window at or above the model's own means the model's window, exactly as unset does.
  if (requested === undefined || requested >= modelWindow) {
    const outputCap = setting.maxOutputTokens
    const reserved = outputCap ?? model.defaultMaxTokens ?? 0
    const spec = specOf(DSH_POLICY, modelWindow, reserved)
    if (outputCap !== undefined && !dshAccepts(spec, modelWindow, reserved)) return unapplied(CONTEXT_ERROR.outputTooLarge)
    return { modelWindow, effectiveWindow: modelWindow, outputCap, ...spec, config: {}, error: null }
  }

  if (requested < limits.minWindowTokens) return unapplied(CONTEXT_ERROR.windowTooSmall)
  const outputCap = setting.maxOutputTokens ?? defaultOutputCap(requested, limits)
  if (outputCap >= requested) return unapplied(CONTEXT_ERROR.outputTooLarge)
  if (outputCap < CONTEXT.minCapTokens) return unapplied(CONTEXT_ERROR.windowTooSmall)
  const derived = derivePolicy(requested, modelWindow, outputCap, limits)
  if (!fits(derived, envelopeTokens, derived.config.maxTokens)) return unapplied(CONTEXT_ERROR.windowTooSmall)
  return { modelWindow, effectiveWindow: requested, outputCap, threshold: derived.threshold, retain: derived.retain, config: derived.config, error: null }
}
