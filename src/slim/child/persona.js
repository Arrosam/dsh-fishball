/**
 * The chat agent's persona (T07): Fishball's own text from src/persona.js, registered in the
 * agent's scope by the chat setup.
 *
 * @deepseek-ai/dsh-persona is scope-only and collides when mounted globally
 * (dsh-persona/lib/index.js:7-11), and the slim child has no composition row for it. Registering
 * the deployment section from the agent context shadows the deployment persona for this one
 * agent; the same setup runs on create and resume, so a resumed session receives the current text.
 */
import { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import { PERSONA_ROW } from '../../persona.js'

/** The registry's placement names; dsh-persona uses the same two for its row. */
const SECTION_ORDER = Object.freeze({
  prefix: 'DEPLOYMENT_PERSONA_PREFIX',
  suffix: 'DEPLOYMENT_PERSONA_SUFFIX',
})

/**
 * Register Fishball's persona prefix and suffix in one prompt scope.
 * @param systemPrompt - the agent-scoped systemPrompt service.
 */
export function applyPersona(systemPrompt) {
  const { prefix, suffix, includeRuntimeContext } = PERSONA_ROW.config
  systemPrompt.section({
    name: PERSONA_PREFIX_SECTION,
    order: systemPrompt.getSectionOrder(SECTION_ORDER.prefix),
    text: prefix,
  })
  systemPrompt.section({
    name: PERSONA_SUFFIX_SECTION,
    order: systemPrompt.getSectionOrder(SECTION_ORDER.suffix),
    text: suffix,
  })
  if (!includeRuntimeContext) systemPrompt.suppressRuntimeContext()
}
