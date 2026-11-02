/**
 * Untrusted content framing (DESIGN §7): text from another session, and its title and folder,
 * are JSON-quoted inside a block whose fence carries a random marker, so the text cannot
 * close the block or imitate Fishball's own framing (P5 review M3). Shared by messaging,
 * watch notices and read_session.
 */
import { randomUUID } from 'node:crypto'

/** An untrusted block: a fence with a random marker, then each field as a JSON string. */
export function untrustedBlock(fields) {
  const marker = randomUUID()
  return [`<untrusted-${marker}>`, ...Object.entries(fields).map(([name, value]) => `${name}: ${JSON.stringify(value ?? '')}`), `</untrusted-${marker}>`].join('\n')
}

/** Session facts as untrusted fields: the title and folder come from that session too. */
export const sessionFields = (info) => ({ session_id: info.id, session_title: info.title, session_folder: info.cwd })
