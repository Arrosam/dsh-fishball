/**
 * The JSON result shape Fishball's tools answer with: `{ ok: true, ... }` or `{ ok: false, code }`,
 * shown to the model as indented JSON. Older modules still keep their own copies; new tools use these.
 */
const JSON_INDENT = 2

export const JSON_OUTPUT = Object.freeze({ schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, JSON_INDENT) }] })
export const ok = (fields = {}) => ({ ok: true, ...fields })
export const refused = (code, fields = {}) => ({ ok: false, code, ...fields })
