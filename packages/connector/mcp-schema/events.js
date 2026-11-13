/**
 * Event payload schemas by type (task K1; R-EVS-02; design §3.4, §13.5a), as frozen data, so
 * C-MAILBOX can validate each commit and a client can read what each `type` carries.
 */
import { CONTRIBUTED_TYPE_PREFIX } from './constants.js'
import { isEventType } from './rules.js'
import { frozen } from './schema.js'
import { contributedPayload, EVENT_PAYLOAD_SHAPES, mailboxEvent, mailboxSummary } from './shapes.js'

/** `type` → the JSON Schema of its `payload`. */
export const EVENT_PAYLOAD_SCHEMA = frozen(Object.fromEntries(Object.entries(EVENT_PAYLOAD_SHAPES).map(([type, shape]) => [type, shape()])))

/** The payload schema of every `contributed:*` type. */
export const CONTRIBUTED_PAYLOAD_SCHEMA = frozen(contributedPayload())

/** One mailbox event, as `inbox_poll` returns it. */
export const MAILBOX_EVENT_SCHEMA = frozen(mailboxEvent())

/** `resources/read fishball://events` contents: the summary only, never bodies (design §3.3). */
export const MAILBOX_SUMMARY_SCHEMA = frozen(mailboxSummary())

/** The payload schema of a `type`, or `undefined` for an unknown one. */
export function payloadSchemaOf(type) {
  if (!isEventType(type)) return undefined
  return type.startsWith(CONTRIBUTED_TYPE_PREFIX) ? CONTRIBUTED_PAYLOAD_SCHEMA : EVENT_PAYLOAD_SCHEMA[type]
}
