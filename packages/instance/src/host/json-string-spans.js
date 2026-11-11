const JSON_SYNTAX = Object.freeze({
  quote: '"', escape: '\\', unicode: 'u', unicodeDigits: 4,
  escapes: new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']),
  hex: /^[0-9a-fA-F]{4}$/,
  whitespace: new Set([' ', '\t', '\r', '\n']),
  controlEnd: 0x20,
  arrayOpen: '[', arrayClose: ']', objectOpen: '{', objectClose: '}',
  comma: ',', colon: ':', minus: '-', plus: '+', dot: '.',
  exponent: new Set(['e', 'E']), zero: '0', nine: '9',
  literals: ['true', 'false', 'null'],
  openings: /[\[{]/g,
  strings: /"(?:\\[^\r\n]|[^"\\\r\n])*"/g,
})

/** Recognize a number with a fixed number of digit-run jumps, not a suffix scan. */
function numberEnd(text, start, digits) {
  let cursor = start
  if (text[cursor] === JSON_SYNTAX.minus) cursor++
  if (!digits[cursor]) return 0
  cursor = text[cursor] === JSON_SYNTAX.zero ? cursor + 1 : digits[cursor]
  if (text[cursor] === JSON_SYNTAX.dot) {
    cursor = digits[cursor + 1]
    if (!cursor) return 0
  }
  if (JSON_SYNTAX.exponent.has(text[cursor])) {
    cursor++
    if (text[cursor] === JSON_SYNTAX.plus || text[cursor] === JSON_SYNTAX.minus) cursor++
    cursor = digits[cursor]
  }
  return cursor || 0
}

/**
 * Find string bounds in the earliest non-overlapping valid JSON containers.
 * Raw openers remain candidates even inside malformed/quoted prose. A global lexer would
 * hide those candidates; reparsing each raw opener instead rescans malformed suffixes.
 * Right-to-left grammar memoization gives each offset constant work and O(n) storage.
 * Zero means invalid; valid ends are exclusive positive offsets. No decoded values or
 * recursive call stack are needed, and no input is cut off before credential recognition.
 */
export function jsonStringSpans(text) {
  const size = text.length + 1
  const space = new Uint32Array(size)
  const digits = new Uint32Array(size)
  const body = new Uint32Array(size)
  const values = new Uint32Array(size)
  const elements = new Uint32Array(size)
  const members = new Uint32Array(size)
  space[text.length] = text.length
  for (let index = text.length - 1; index >= 0; index--) {
    const char = text[index]
    const next = index + 1
    space[index] = JSON_SYNTAX.whitespace.has(char) ? space[next] : index
    if (char >= JSON_SYNTAX.zero && char <= JSON_SYNTAX.nine) digits[index] = digits[next] || next

    // A body suffix ends at its first unescaped quote; escapes consume their whole pair.
    if (char === JSON_SYNTAX.quote) body[index] = next
    else if (char === JSON_SYNTAX.escape) {
      if (JSON_SYNTAX.escapes.has(text[next])) body[index] = body[next + 1] || 0
      else if (text[next] === JSON_SYNTAX.unicode) {
        const end = next + 1 + JSON_SYNTAX.unicodeDigits
        if (JSON_SYNTAX.hex.test(text.slice(next + 1, end))) body[index] = body[end] || 0
      }
    } else if (text.charCodeAt(index) >= JSON_SYNTAX.controlEnd) body[index] = body[next]

    if (char === JSON_SYNTAX.quote) values[index] = body[next]
    else if (char === JSON_SYNTAX.arrayOpen || char === JSON_SYNTAX.objectOpen) {
      const content = space[next]
      const array = char === JSON_SYNTAX.arrayOpen
      const close = array ? JSON_SYNTAX.arrayClose : JSON_SYNTAX.objectClose
      values[index] = text[content] === close ? content + 1 : (array ? elements[content] : members[content])
    } else if (char === JSON_SYNTAX.minus || digits[index]) values[index] = numberEnd(text, index, digits)
    else {
      for (const literal of JSON_SYNTAX.literals) {
        if (text.startsWith(literal, index)) {
          values[index] = index + literal.length
          break
        }
      }
    }

    // Nonempty array tails and object-member tails include the matching closing delimiter.
    // Their comma branch requires another value/member, so trailing commas stay invalid.
    const valueEnd = values[index]
    if (valueEnd) {
      const after = space[valueEnd]
      if (text[after] === JSON_SYNTAX.arrayClose) elements[index] = after + 1
      else if (text[after] === JSON_SYNTAX.comma) elements[index] = elements[space[after + 1]]
    }
    if (char === JSON_SYNTAX.quote && valueEnd) {
      const colon = space[valueEnd]
      if (text[colon] === JSON_SYNTAX.colon) {
        const memberEnd = values[space[colon + 1]]
        if (memberEnd) {
          const after = space[memberEnd]
          if (text[after] === JSON_SYNTAX.objectClose) members[index] = after + 1
          else if (text[after] === JSON_SYNTAX.comma) members[index] = members[space[after + 1]]
        }
      }
    }
  }

  const spans = []
  let containerEnd = 0
  for (const opening of text.matchAll(JSON_SYNTAX.openings)) {
    const start = opening.index
    if (start < containerEnd || !values[start]) continue
    containerEnd = values[start]
    // Accepted containers are disjoint: token collection visits at most n characters total.
    // Do not recursively interpret JSON-looking text inside a validated string.
    for (const token of text.slice(start, containerEnd).matchAll(JSON_SYNTAX.strings)) {
      spans.push({ start: start + token.index, end: start + token.index + token[0].length })
    }
  }
  return spans
}
