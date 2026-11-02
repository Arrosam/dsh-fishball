/**
 * Storage keys (dsh-storage-json): a key must match /^[a-zA-Z0-9_-]+$/ to be path-safe in the
 * per-record layout, so compound keys are built from encoded segments.
 */
/** Separator of compound keys; keyOf escapes '_' so the join stays unambiguous. */
export const KEY_SEPARATOR = '__'

/**
 * One storage-safe key segment: every other character becomes its code point (e.g. '@' ->
 * 'x40x'). Injective, because 'x' itself is encoded too.
 */
export const keyOf = (text) => String(text).replace(/[^a-wyzA-Z0-9]|x/g, (ch) => 'x' + ch.codePointAt(0).toString(16) + 'x')

/** A compound key from segments. */
export const compoundKey = (segments) => segments.map(keyOf).join(KEY_SEPARATOR)
