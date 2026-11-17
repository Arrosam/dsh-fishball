/**
 * Vocabulary and rows for the R-FIX-REDACT redactor cases (cases.md). Every expected output comes
 * from the task's requirements (relayed 2026-11-18: credential names and their components, the
 * separator, the value-form decision table, standalone Bearer, opaque runs of 32+, merged overlaps,
 * idempotence), never from the implementation under test.
 */

/** The one mask text the requirements name. */
export const MASK = '[redacted]'
/** The opaque-run threshold (rule 5): 31 stays, 32 and 33 are masked. */
export const OPAQUE = Object.freeze({ below: 31, at: 32, above: 33 })

const RUN_SOURCE = 'A1b2C3d4'.repeat(8)
/** An opaque run of `length` (≤ 64) characters from rule 5's class, with no sensitive word in it. */
export const run = (length) => RUN_SOURCE.slice(0, length)
/** A 72-character base64 credential holding `/`, `+` and `=` (rule 3c's example). */
const BASE64_72 = 'dXNlcjpwYXNz/+Ab'.repeat(5).slice(0, 70) + '=='
const SECRET = 's3cr3tValue9'

/** One row: `input` → `expected`; every `secrets` substring must be absent from the output. */
const row = (id, part, title, input, expected, secrets = []) => Object.freeze({ id, part, title, input, expected, secrets: Object.freeze(secrets) })
/** A row whose text matches no rule and so comes back unchanged. */
const same = (id, part, title, input) => row(id, part, title, input, input)

/** Rule 1: names with a sensitive component (camelCase, acronym and separator splits, plurals). */
const SENSITIVE_NAMES = Object.freeze([
  'apiKey', 'api_key', 'API_KEY', 'access_token', 'accessToken', 'refreshToken', 'client_secret', 'clientSecret', 'DSH_AGENT_TOKEN',
  'DSHAgentToken', 'myAPIKey', 'APIKeys', 'password', 'Passwords', 'x-api-key', 'X-Api-Key', 'config.apiKey', 'cacheKey', 'key',
  'keyId', 'tokens', 'secrets', 'credential', 'credentials',
])
/** Rule 1: names whose components are never exactly a sensitive word (APIKEY/apikey: one component, a known limitation). */
const PLAIN_NAMES = Object.freeze(['monkey', 'keyboard', 'tokenizer', 'passwordless', 'secretary', 'url', 'user', 'name', 'APIKEY', 'apikey', 'keyboardLayout'])
/** Rule 3c: names with an `authorization` component, in the cases and forms the requirements list. */
const AUTHORIZATION_NAMES = Object.freeze(['Authorization', 'authorization', 'AUTHORIZATION', 'Proxy-Authorization', 'proxy-authorization'])
/** Rule 3d: the characters that end an unquoted value (whitespace, quotes, `,`, `;`, `&`). */
const VALUE_TERMINATORS = Object.freeze({ space: ' ', tab: '\t', newline: '\n', 'double quote': '"', 'single quote': "'", comma: ',', semicolon: ';', ampersand: '&' })

export const REDACT_ROWS = Object.freeze([
  // ---------------------------------------------------------------- RED-EP-01/02: credential names
  ...SENSITIVE_NAMES.map((name) => row('RED-EP-01', name, `sensitive name ${name}`, `${name}=${SECRET}`, `${name}=${MASK}`, [SECRET])),
  ...PLAIN_NAMES.map((name) => same('RED-EP-02', name, `not a sensitive name: ${name}`, `${name}=plainValue`)),
  row('RED-EP-03', 'double-quoted name with a space', 'a quoted name splits at spaces', '"api key" = "v1 v2"', `"api key" = "${MASK}"`, ['v1 v2']),
  row('RED-EP-03', 'single-quoted name', 'a single-quoted name', "'client_secret': 'cs-1'", `'client_secret': '${MASK}'`, ['cs-1']),
  row('RED-EP-03', 'dotted quoted name', 'a quoted name splits at dots', '"user.password":"pw"', `"user.password":"${MASK}"`, ['"pw"']),
  same('RED-EP-03', 'quoted plain name', 'a quoted name with no sensitive component', '"monkey": "banana"'),
  same('RED-EP-03', 'sensitive word only in the value', 'the name decides, not the value', '"name": "token"'),

  // ---------------------------------------------------------------- RED-BVA-01: the separator
  row('RED-BVA-01', 'colon, one space', 'separator `:` then a space', 'password: hunter2', `password: ${MASK}`, ['hunter2']),
  row('RED-BVA-01', 'equals, spaces both sides', 'spaces before and after `=`', 'password = hunter2', `password = ${MASK}`, ['hunter2']),
  row('RED-BVA-01', 'two spaces both sides', 'several spaces on either side', 'password  =  hunter2', `password  =  ${MASK}`, ['hunter2']),
  row('RED-BVA-01', 'tabs both sides', 'tabs on either side of `:`', 'password\t:\thunter2', `password\t:\t${MASK}`, ['hunter2']),
  same('RED-BVA-01', 'no separator', 'no `:` or `=`: nothing masked', 'password hunter2'),
  same('RED-BVA-01', 'newline before separator', 'a newline is not allowed before the separator', 'password\n=hunter2'),
  same('RED-BVA-01', 'newline after separator', 'a newline after the separator: no value', 'password=\nhunter2'),
  same('RED-BVA-01', 'separator at end of text', 'a separator followed by nothing', 'password='),

  // ---------------------------------------------------------------- RED-DT-01: value form a, quoted strings
  row('RED-DT-01', 'a double-quoted words', 'quoted value with spaces', 'password="two word secret"', `password="${MASK}"`, ['two word secret', 'two ']),
  row('RED-DT-01', 'a leading space', 'quoted value starting with a space', 'password=" leading words"', `password="${MASK}"`, ['leading words']),
  row('RED-DT-01', 'a punctuation', 'quoted value with , ; &', 'password="a,b;c&d"', `password="${MASK}"`, ['a,b;c&d', 'c&d']),
  row('RED-DT-01', 'a escaped quote', 'an escaped quote does not end the value', 'password="quote\\"tail"', `password="${MASK}"`, ['quote', 'tail']),
  row('RED-DT-01', 'a single-quoted', 'single-quoted value', "password='alpha beta'", `password='${MASK}'`, ['alpha', 'beta']),
  row('RED-DT-01', 'a single-quoted escaped quote', "an escaped ' does not end a single-quoted value", "password='it\\'s secret'", `password='${MASK}'`, ['s secret']),
  row('RED-DT-01', 'a one character', 'BVA: one-character quoted value', 'password="x"', `password="${MASK}"`, ['"x"']),
  same('RED-DT-01', 'a empty double', 'BVA: empty quoted value stays', 'password=""'),
  same('RED-DT-01', 'a empty single', "BVA: empty single-quoted value stays", "password=''"),
  row('RED-DT-01', 'a JSON', 'JSON member', '{"apiKey": "sk-live-value"}', `{"apiKey": "${MASK}"}`, ['sk-live-value']),
  row('RED-DT-01', 'a single-quoted object', 'single-quoted name and value', "{'token': 'xyz123'}", `{'token': '${MASK}'}`, ['xyz123']),
  row('RED-DT-01', 'a escaped JSON', 'escaped JSON keeps both escaped delimiters', '{\\"apiKey\\":\\"abc\\"}', `{\\"apiKey\\":\\"${MASK}\\"}`, ['abc']),
  row('RED-DT-01', 'a escaped JSON, escaped-escaped quote', 'an escaped-escaped quote does not end an escaped value', '{\\"apiKey\\":\\"left\\\\\\"right\\"}', `{\\"apiKey\\":\\"${MASK}\\"}`, ['left', 'right']),
  row('RED-DT-01', 'a escaped JSON in a log line', 'only the value is masked; other members stay', 'log: "{\\"password\\":\\"p w\\",\\"user\\":\\"sam\\"}"', `log: "{\\"password\\":\\"${MASK}\\",\\"user\\":\\"sam\\"}"`, ['p w']),
  row('RED-DT-01', 'a unterminated, then a line', 'unterminated: masked to end of line, later lines kept', 'password="abc def\nnext line', `password="${MASK}\nnext line`, ['abc def']),
  row('RED-DT-01', 'a unterminated at end of text', 'unterminated at the end of the text', 'password="abc def', `password="${MASK}`, ['abc def']),
  row('RED-DT-01', 'a unterminated single', 'unterminated single-quoted value', "token='abc def\nok", `token='${MASK}\nok`, ['abc def']),
  row('RED-DT-01', 'a quoted Authorization', 'a quoted Authorization value follows rule a', '{"Authorization":"Basic dXNl"}', `{"Authorization":"${MASK}"}`, ['dXNl', 'Basic']),

  // ---------------------------------------------------------------- RED-DT-01: value form b, containers
  row('RED-DT-01', 'b array', 'a whole array', 'passwords:["alpha","beta"]', `passwords:${MASK}`, ['alpha', 'beta']),
  row('RED-DT-01', 'b object, text after', 'a whole object; what follows stays', '"credentials": {"user":"u","pass":"p"}, "x": 1', `"credentials": ${MASK}, "x": 1`, ['"user":"u"', '"pass":"p"']),
  row('RED-DT-01', 'b nested, brackets in strings', 'brackets inside quoted strings do not count', 'secrets={"a":[1,{"b":"]}"}],"c":"[x"}, tail', `secrets=${MASK}, tail`, ['"b"', '"c":"[x"']),
  row('RED-DT-01', 'b escaped quote in a string', 'an escaped quote inside a container string does not end it', 'keys=["a\\"]", "b"] end', `keys=${MASK} end`, ['"b"']),
  row('RED-DT-01', 'b pretty-printed', 'a container spanning lines',
    '{\n  "credentials": {\n    "user": "u1",\n    "pass": "p1"\n  },\n  "name": "n"\n}', `{\n  "credentials": ${MASK},\n  "name": "n"\n}`, ['u1', 'p1']),
  row('RED-DT-01', 'b unbalanced', 'an unbalanced container is masked to the end of the text', 'tokens=[1, 2\nnext line\nmore', `tokens=${MASK}`, ['next line', 'more']),

  // ---------------------------------------------------------------- RED-DT-01: value form c, Authorization names
  row('RED-DT-01', 'c Basic', 'scheme and credential together', 'Authorization: Basic dXNlcjpwYXNz', `Authorization: ${MASK}`, ['Basic', 'dXNlcjpwYXNz']),
  row('RED-DT-01', 'c Basic 72-char base64', 'a long base64 credential with / + =', 'Authorization: Basic ' + BASE64_72, `Authorization: ${MASK}`, [BASE64_72.slice(0, 16), BASE64_72.slice(-16)]),
  row('RED-DT-01', 'c Digest', 'an unknown-to-bearer scheme with punctuation', 'proxy-authorization: Digest a=b, c="d"', `proxy-authorization: ${MASK}`, ['Digest', 'a=b', 'c="d"']),
  row('RED-DT-01', 'c Bearer, next line kept', 'following lines are kept', 'Authorization: Bearer abc.def-ghi\nnext: ok', `Authorization: ${MASK}\nnext: ok`, ['abc.def-ghi', 'Bearer']),
  ...AUTHORIZATION_NAMES.map((name) => row('RED-DT-01', `c ${name}`, `${name}: any scheme to the end of the line`, `${name}: Negotiate tok3n, realm="r"\nHost: h`, `${name}: ${MASK}\nHost: h`, ['Negotiate', 'tok3n', 'realm'])),
  row('RED-DT-01', 'c header block', 'one header among others', 'GET / HTTP/1.1\nAuthorization: Basic abc\nHost: h', `GET / HTTP/1.1\nAuthorization: ${MASK}\nHost: h`, ['Basic abc']),

  // ---------------------------------------------------------------- RED-DT-01: value form d, other names unquoted
  row('RED-DT-01', 'd short', 'any length', 'api_key=short-secret', `api_key=${MASK}`, ['short-secret']),
  row('RED-DT-01', 'd dotted', 'dots inside the value', 'access_token=abc.def.ghi', `access_token=${MASK}`, ['abc.def.ghi', 'ghi']),
  row('RED-DT-01', 'd env name', 'an environment-style name', 'DSH_AGENT_TOKEN=short-secret', `DSH_AGENT_TOKEN=${MASK}`, ['short-secret']),
  row('RED-DT-01', 'd query string', '`&` ends the value; the rest of the URL stays', 'https://h/p?access_token=abc.def&x=1', `https://h/p?access_token=${MASK}&x=1`, ['abc.def']),
  row('RED-DT-01', 'd punctuation', 'whatever punctuation the run holds', 'password=p@ss/w.rd:x!', `password=${MASK}`, ['p@ss', 'w.rd']),
  row('RED-DT-01', 'd one character', 'BVA: a one-character value', 'token=a', `token=${MASK}`),
  row('RED-DT-01', 'd space after separator', 'the value starts after the spaces', 'token= abc', `token= ${MASK}`, ['abc']),
  ...Object.entries(VALUE_TERMINATORS).map(([label, end]) => row('RED-DT-01', `d ended by ${label}`, `${label} ends the value and stays`, `token=abc123${end}rest`, `token=${MASK}${end}rest`, ['abc123'])),
  row('RED-DT-01', 'd Basic + run', 'Basic and its run are masked together', 'token: Basic abc', `token: ${MASK}`, ['Basic', 'abc']),
  row('RED-DT-01', 'd Bearer + run', 'Bearer and its run are masked together', 'token: Bearer abc', `token: ${MASK}`, ['Bearer', 'abc']),
  row('RED-DT-01', 'd bearer lower case', 'the scheme word in any case', 'token: bearer abc', `token: ${MASK}`, ['bearer', 'abc']),
  row('RED-DT-01', 'd BASIC, one run only', 'only the one run after the scheme joins it', 'token: BASIC abc def', `token: ${MASK} def`, ['BASIC', 'abc']),
  row('RED-DT-01', 'd tabs around the scheme', 'tabs between scheme and run', 'token=\tBearer\tabc', `token=\t${MASK}`, ['Bearer', 'abc']),
  row('RED-DT-01', 'd Bearer alone', 'BVA: the scheme word is the whole run', 'token: Bearer', `token: ${MASK}`, ['Bearer']),

  // ---------------------------------------------------------------- RED-EP-04: standalone Bearer
  row('RED-EP-04', 'in prose', 'the scheme stays, the credential is masked', 'got Bearer abc.def/ghi ok', `got Bearer ${MASK} ok`, ['abc.def/ghi', 'ghi']),
  row('RED-EP-04', 'lower case', 'any case, kept as written', 'bearer xyz', `bearer ${MASK}`, ['xyz']),
  row('RED-EP-04', 'upper case', 'any case, kept as written', 'BEARER xyz', `BEARER ${MASK}`, ['xyz']),
  row('RED-EP-04', 'ended by a comma', '`,` ends the credential', 'Bearer abc,next', `Bearer ${MASK},next`, ['abc']),
  row('RED-EP-04', 'in quotes', 'a quote ends the credential', '"Bearer abc"', `"Bearer ${MASK}"`, ['abc']),
  same('RED-EP-04', 'no credential', 'BVA: Bearer with nothing after it', 'Bearer'),
  same('RED-EP-04', 'standalone Basic', 'Basic without a credential name is not masked', 'Basic plan required'),

  // ---------------------------------------------------------------- RED-BVA-02: opaque runs
  same('RED-BVA-02', OPAQUE.below, '31 characters stay', run(OPAQUE.below)),
  row('RED-BVA-02', OPAQUE.at, '32 characters are masked', run(OPAQUE.at), MASK, [run(OPAQUE.at)]),
  row('RED-BVA-02', OPAQUE.above, '33 characters are masked', run(OPAQUE.above), MASK, [run(OPAQUE.above)]),
  row('RED-BVA-02', 'class characters _+=-, 32', 'the run class includes _ + = -', 'a_b+c=d-'.repeat(4), MASK, ['a_b+c=d-']),
  same('RED-BVA-02', 'class characters _+=-, 31', '31 class characters stay', 'a_b+c=d-'.repeat(4).slice(0, OPAQUE.below)),
  row('RED-BVA-02', 'inside text', 'surrounding text stays', 'id ' + run(OPAQUE.at) + ' end', `id ${MASK} end`, [run(OPAQUE.at)]),
  row('RED-BVA-02', 'a path segment', 'only the long segment of a path', '/srv/' + run(40) + '/index.js', `/srv/${MASK}/index.js`, [run(OPAQUE.at)]),
  same('RED-BVA-02', 'split by a dot', '`.` splits runs', run(20) + '.' + run(20)),
  same('RED-BVA-02', 'split by a slash', '`/` splits runs', run(OPAQUE.below) + '/' + run(OPAQUE.below)),
  same('RED-BVA-02', 'a file path', 'ordinary file paths stay readable', 'at /usr/local/lib/node_modules/dsh/lib/index.js:10:5'),

  // ---------------------------------------------------------------- RED-EP-05: overlapping and touching regions merge
  // `=` is in rule 5's class, so `token=<run>` is itself one opaque run covering the name too.
  row('RED-EP-05', 'value that is an opaque run', 'name, separator and value are one run: one mask', 'token=' + run(40), MASK, [run(OPAQUE.at), 'token']),
  row('RED-EP-05', 'spaced value that is an opaque run', 'the value region and the run coincide: one mask', 'token: ' + run(40), `token: ${MASK}`, [run(OPAQUE.at)]),
  row('RED-EP-05', 'name inside an opaque run', 'the run covers name and value: one mask', 'a'.repeat(30) + '_token=abc', MASK, ['_token', 'abc']),
  row('RED-EP-05', 'container touching a run', 'touching regions become one mask', 'passwords:[1]' + run(OPAQUE.at), `passwords:${MASK}`, [run(OPAQUE.at)]),
  row('RED-EP-05', 'Bearer credential that is a run', 'one mask after the kept scheme', 'Bearer ' + run(40), `Bearer ${MASK}`, [run(OPAQUE.at)]),
  row('RED-EP-05', 'quoted run', 'one mask between the kept quotes', 'password="' + run(40) + '"', `password="${MASK}"`, [run(OPAQUE.at)]),

  // ---------------------------------------------------------------- RED-EP-06: several credentials, unrelated text
  row('RED-EP-06', 'several on one line', 'all masked, the rest kept', 'user=sam password=hunter2 api_key=abc123 path=/tmp/x',
    `user=sam password=${MASK} api_key=${MASK} path=/tmp/x`, ['hunter2', 'abc123']),
  row('RED-EP-06', 'several lines', 'all masked, other lines kept', 'start\nAuthorization: Basic abc\ntoken=xyz\nend', `start\nAuthorization: ${MASK}\ntoken=${MASK}\nend`, ['Basic abc', 'xyz']),
  same('RED-EP-06', 'error line', 'an error message stays', 'Error: something failed'),
  same('RED-EP-06', 'stack trace', 'a stack trace stays', 'Error: boom\n    at main (/srv/app/index.js:10:5)\n    at node:internal/main:1:1'),
  same('RED-EP-06', 'plain text', 'plain text stays', 'plain diagnostic text'),
  same('RED-EP-06', 'non-ASCII text', 'non-ASCII text stays', 'café ☕ naïve'),
  same('RED-EP-06', 'sensitive word without separator', 'a sensitive word in prose stays', 'the key is under the mat'),
  same('RED-EP-06', 'plain name with a colon', 'a non-sensitive name before `:`', 'keyboard layout: us'),
  same('RED-EP-06', 'empty', 'BVA: the empty string', ''),
])
