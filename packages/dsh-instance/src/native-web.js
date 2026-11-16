/**
 * The instance's public status vocabulary: `{state, code, detail}` with known states and codes
 * only (§11), as its settings page and the child's V2 settings relay read it. The routes that
 * serve it are src/host/routes.js since I-HOST; this module keeps only the projection, so no
 * answer ever carries the child's origin or launch token.
 */
import { INSTANCE_CODES, INSTANCE_STATES } from './native-runtime/constants.js'
import { statusLaunchDetail } from './host/launch-detail.js'

const WEB = Object.freeze({ unavailable: 'unavailable' })
const STATES = new Set(INSTANCE_STATES)
const CODES = new Set(INSTANCE_CODES)

/** One lifecycle status as the page may see it: known states and codes only (§11), with `enabled`. */
export function safeStatus(value) {
  return { enabled: value?.enabled === true,
    state: STATES.has(value?.state) ? value.state : WEB.unavailable,
    code: CODES.has(value?.code) ? value.code : null,
    // A failed start's cause (host.js): main's public sanitizer runs again here, so no reader of
    // this route ever sees more than its bounded first line.
    detail: statusLaunchDetail(value) }
}
const publicFields = ({ state, code, detail }) => ({ state, code, detail })
/**
 * The instance's public `{state, code, detail}`, as the card's status route answers it. SET's settings
 * relay answers the child panel in the same shape, so both pages read one vocabulary.
 */
export const publicStatus = (value) => publicFields(safeStatus(value))
