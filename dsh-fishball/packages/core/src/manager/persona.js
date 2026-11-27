/**
 * The manager agent's persona: Fishball's own text from src/persona.js, registered in the
 * manager's agent scope by its setup. Lives in core's manager folder since V3 F-WIRE (the user's
 * decision 2026-11-16), unchanged.
 *
 * @deepseek-ai/dsh-persona is scope-only and collides when mounted globally
 * (dsh-persona/lib/index.js:7-11), so core has no composition row for it. Registering the
 * deployment section from the agent context shadows the deployment persona for this one agent;
 * the same setup runs on create and resume, so a resumed session receives the current text.
 */
import { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import { HIDDEN_PROMPT_ENTRIES, PERSONA_ROW, PTC_GUIDE } from '../persona.js'

/** The text a hidden entry is shadowed with: empty, so it contributes nothing. */
const HIDDEN_TEXT = ''

/** The registry's placement names; dsh-persona uses the same two for its row. */
const SECTION_ORDER = Object.freeze({
  prefix: 'DEPLOYMENT_PERSONA_PREFIX',
  suffix: 'DEPLOYMENT_PERSONA_SUFFIX',
})

/**
 * Register Fishball's persona prefix and suffix in one prompt scope, and shadow the global prompt
 * entries Fishball hides (HIDDEN_PROMPT_ENTRIES, R-FIX F18) with empty text: a scoped section or
 * context shadows the global one of the same name, and empty text contributes nothing
 * (dsh-system-prompt, both SDKs).
 * @param systemPrompt - the agent-scoped systemPrompt service.
 * @param programmatic - whether Fishball mounted DSH's PTC executor.
 */
export function applyPersona(systemPrompt, programmatic) {
  const { prefix, suffix, includeRuntimeContext } = PERSONA_ROW.config
  systemPrompt.section({
    name: PERSONA_PREFIX_SECTION,
    order: systemPrompt.getSectionOrder(SECTION_ORDER.prefix),
    text: programmatic ? [prefix, PTC_GUIDE].join('\n\n') : prefix,
  })
  systemPrompt.section({
    name: PERSONA_SUFFIX_SECTION,
    order: systemPrompt.getSectionOrder(SECTION_ORDER.suffix),
    text: suffix,
  })
  if (!includeRuntimeContext) systemPrompt.suppressRuntimeContext()
  for (const entry of HIDDEN_PROMPT_ENTRIES) {
    if (entry.section) systemPrompt.section({ name: entry.name, order: systemPrompt.getSectionOrder(entry.orderName), text: HIDDEN_TEXT })
    if (entry.context) systemPrompt.context({ name: entry.name, order: systemPrompt.getContextOrder(entry.orderName), text: HIDDEN_TEXT })
  }
}
