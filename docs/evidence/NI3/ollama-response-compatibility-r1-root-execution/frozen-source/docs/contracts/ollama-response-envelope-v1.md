# Ollama response-envelope source interface

Implementation-free signature companion for NR-OLLAMA-RESP01. This identifies the pure source surface and finite diagnostic fields only; it contains no implementation, test body, native authority or execution result. Behavioral expectations remain the frozen wave AC, the original provider contract and the primary Ollama v0.40.0 contract. The exact requested endpoint/provider/model remain unchanged.

`ACCEPTED_RESPONSE_MODELS: readonly ['deepseek-v4.1-flash:cloud', 'deepseek-v4.1-flash']`.

`inspectResponseEnvelope(result: JSONValue): Readonly<EnvelopeDiagnostic>`.

Input is the provider's bounded `JSON.parse(raw)` result with no reviver, or ordinary synthetic JSON data for unit validation. Arbitrary JavaScript proxies/accessors/classes are outside this interface. Missing object fields are permitted diagnostic inputs; functions, symbols and constructed authority objects are not JSON values. Calling this helper causes no provider, native, transport, persistence or permission operation.

EnvelopeDiagnostic has exactly nine enumerable data fields:

| Field | Finite domain |
| --- | --- |
| `schema` | `df.ollama-response-envelope/v1` |
| `accepted` | boolean |
| `responseShape` | null, array, object, string, number, boolean, missing, unsupported |
| `errorField` | not-inspected, absent, present |
| `completion` | not-inspected, complete, incomplete, missing, invalid |
| `responseModel` | not-inspected, request, cloud-base, missing, non-string, unapproved |
| `messageShape` | not-inspected, null, array, object, string, number, boolean, missing, unsupported |
| `assistantRole` | not-inspected, assistant, missing, non-string, unapproved |
| `refusal` | NONE, INVALID_RESPONSE_SHAPE, ERROR_FIELD_PRESENT, COMPLETION_NOT_TRUE, RESPONSE_MODEL_NOT_APPROVED, ASSISTANT_ROLE_REQUIRED |

Diagnostics classify shape and exact comparisons; they never copy response strings. Error presence means the original `error !== undefined` condition, including null/false/0/empty string. Completion requires `done === true`. Model spelling is one of the two fixed names. The ordinary message object requires the exact assistant role. First refusal order is shape, error, completion, response model, assistant role. Only NONE means envelope accepted.

Acceptance supplies no payload/tool/thinking/content/finish/usage validation, billing/completion/termination evidence, result, grant, permission or currentness fact. Those remain unchanged downstream provider checks and original host/ledger observations. Historical R01 has no diagnostic values and remains undetermined/HOLD. The pure interface is not an operator RPC or a replacement provider.
