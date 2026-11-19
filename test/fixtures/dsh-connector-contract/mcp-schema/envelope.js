/**
 * The core tools' result envelope (task K1; R-CON-02 decided per spec 1.18; design §3.2):
 * `structuredContent` is `{ok: true, …}` or `{ok: false, code, message?}`, the same JSON is the
 * one text content block, and `isError` is true exactly when `ok` is false. Stock `dsh-mcp-client`
 * throws away `structuredContent` on `isError: true`, so the text block is what a DSH-hosted agent
 * sees; that is why it carries the same JSON, code included. JSON-RPC errors stay for protocol
 * faults only (unknown tool, malformed request).
 */
const CONTENT_TYPE_TEXT = 'text'

function result(structured) {
  return Object.freeze({
    structuredContent: structured,
    content: Object.freeze([Object.freeze({ type: CONTENT_TYPE_TEXT, text: JSON.stringify(structured) })]),
    isError: structured.ok !== true,
  })
}

/** A success `CallToolResult` for `fields`; an `ok` key in `fields` is ignored. */
export const okResult = (fields = {}) => result({ ...fields, ok: true })

/**
 * A refusal `CallToolResult`. `extra` holds the fields a refusal of that tool carries (for
 * `already-paired`: `bound`, `advice`); `message` is optional human text, never the contract.
 */
export function refusalResult(code, extra = {}, message) {
  // The fixed keys go last, so `extra` can never turn a refusal into a success or change its code.
  const { message: ignored, ...rest } = extra
  const structured = message === undefined ? { ...rest, ok: false, code } : { ...rest, ok: false, code, message }
  return result(structured)
}
