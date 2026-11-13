# `fishball-connector/tools`: the K2 freeze

The contract of the contribution service `fishballConnectorTools`. Sources:
[v3-design.md §13](<../../../docs/planning/v3-design.md>), R-EXT-01…20 in
[v3-requirements.md](<../../../docs/planning/v3-requirements.md>), and spike V3-S5 (`8f2788e`).
This module holds data, pure validators and types only. The registry behind the service belongs to
C-EXT (`packages/connector/src/contrib/`). Each name below is frozen, so changing one is a K2
amendment. A value marked **PROPOSED** is one the requirements do not fix: it is frozen as written
unless the user changes it at review. **DECIDED (#n)** marks a value the user decided at that
review (relayed by Fishball); `#n` is its row in [the decisions table](<../mcp-schema/README.md#user-decisions>).

## Service

`ctx.fishballConnectorTools` (inject it optionally, as `'fishballConnectorTools?'`):

| Member | Signature | Refusals |
| --- | --- | --- |
| `apiVersion` | `1` (also exported as `apiVersion`) | — |
| `register` | `register(def) → dispose()` | throws `ToolContributionError {code}` with a `REGISTER_REFUSAL` code and registers nothing |
| `emit` | `emit(event) → Promise<{ok: true, eventId} \| {ok: false, code}>` | returns an `EMIT_REFUSAL` code and never throws |
| `mine` | `mine() → [{name, publicName, state}]` | — |

- **No `ctx` argument (S5).** The caller is the context the service was reached through.
- **The service has no other members (R-EXT-11).**
- **`dispose` is idempotent.** Registering the same name again after a dispose is allowed.
- **`register` while quarantined is accepted but not listed** (EXT-ST-01 #6). It returns a normal
  disposer and `mine()` shows it `quarantined`, because the quarantine belongs to the activation
  (S5-Q2) and lifts only with a new one.
- **`defineTool(def)` runs the same validation as `register`, at the caller's site.** It returns a
  frozen copy of the definition with only its known fields, or throws
  `ToolContributionError('tool-invalid')` (decided by Fishball). It reads each field once and
  keeps frozen snapshots of the schemas, `limits`, `codes` and `annotations`, so nothing can change
  after the check. It drops unknown fields, so a
  `namespace` given in the definition is ignored. It also drops any `annotations` key that is not
  one of the hints in `ANNOTATION_HINTS`, so `contributor` and the like are dropped too. A hint
  whose value is not a boolean is `tool-invalid`.
- **The definition's other fields are checked as follows:**
  - `title`, if given, must be a string;
  - `description` must be non-empty and at most `TOOL_LIMITS.descriptionBytes` UTF-8 bytes;
  - `execute` must be a function;
  - `limits.*` must each be a positive safe integer at or below its ceiling (integers: DECIDED #9);
  - each `codes` entry must match `NAME_GRAMMAR.code` and must not be a `CALL_CODE`, so a
    contributor can never produce `contributor-failed` or `tool-withdrawn` itself;
  - a hint whose value is not a boolean is `tool-invalid` (DECIDED #10; dropping it was the
    alternative).
- **Schemas** (`inputSchema`, and `outputSchema` when given) must have an object root and use only
  DSH's enforced subset:
  - `type`, or an exact-one `oneOf` with at least two branches;
  - `properties`, `required` and a boolean `additionalProperties` on objects;
  - `items` on arrays;
  - type-correct scalar `enum` and `const`;
  - the annotations `description`, `title`, `default` and `examples`.

  Anything else is `tool-invalid`, including `$ref`, `patternProperties`, `minLength` and type
  arrays. The subset is exported as data, `SCHEMA_SUBSET` (`keywords`, `annotations`,
  `placement`, …); `isObjectRootSchema` applies it. It is stricter than DSH in one way: a plain
  object from another realm is refused.

## Names

- **The namespace is derived by `namespaceOf(packageName)`** from the package name of the caller's
  loader entry:
  - the scope's `@` is dropped and its `/` becomes `-`;
  - the name is lower-cased;
  - every remaining character outside `[a-z0-9-]` becomes `-`;
  - the alias is applied: `fishball-embed-ui` becomes `embed-ui`, the only alias.

  If no letter or digit is left, the namespace is `undefined`, and the caller is refused
  `contributor-unidentified`.
- **Reserved namespaces** (`NAMESPACE.reserved`) are `fishball` and `fishball-connector`. Two
  packages that normalise to the same namespace: the first to register keeps it.
- **The namespace is attribution only, not a security boundary (S5-Q5).**
- **A local name** (`NAME_GRAMMAR.local`) is 1–48 characters of `[a-z0-9_.-]`. It starts with a
  letter or digit and does not end with `.`.
- **The public name** is `<namespace>.<name>` (the `.` separator is kept, per S5-Q6), at most
  `NAME_GRAMMAR.publicMaxChars` (128) characters. `publicNameFor` checks both rules and returns
  `undefined` on a breach; `publicNameOf` throws `tool-invalid` instead, for `register`.
- **Events** use the same grammar and the same 128-character bound (the bound for events is
  PROPOSED). A breach is `event-invalid`, returned, never thrown (`emit` uses `publicNameFor`). A
  contributed event's mailbox type is `CONTRIBUTED_EVENT.typePrefix + <namespace>.<event>`.
- **No "soft budget".** Design §13.3 asks for a soft name-length budget so typical names avoid
  DSH's hash. S5 (L5) showed that every dotted name is hashed whatever its length, so no budget is
  set. §13.3 needs that wording amended (design session).

## Limits

| Name | Value | Meaning |
| --- | --- | --- |
| `TOOL_LIMITS.descriptionBytes` | 2048 | UTF-8 bytes of a tool's description |
| `TOOL_LIMITS.ceiling.argumentBytes` | 65536 | PROPOSED: the most argument JSON a tool may accept, in UTF-8 bytes |
| `TOOL_LIMITS.ceiling.resultBytes` | 262144 | PROPOSED: the most `data` JSON a tool may return, in UTF-8 bytes |
| `TOOL_LIMITS.ceiling.timeoutMs` | 30000 | PROPOSED: a call's longest run; below DSH's own MCP client's 60 s default call timeout |
| `TOOL_LIMITS.contributorInFlightCalls` | 16 | PROPOSED: calls of one contributor running at once; one more gets `queue-full` |
| `TOOL_LIMITS.messageChars` | 500 | a refusal `message` is scrubbed of secret shapes first, then cut to this many code points |
| `EVENT_LIMITS.payloadBytes` | 8192 | UTF-8 bytes of an event payload's JSON text |
| `EVENT_LIMITS.summaryChars` | 500 | code points of an event summary; plain text, never interpreted |
| `EVENT_LIMITS.ratePerMinute` | 30 | rate per (contributor, recipient) |
| `EVENT_LIMITS.rateBurst` | 10 | token-bucket capacity per (contributor, recipient) |
| `EVENT_LIMITS.rateWindowMs` | 60000 | the window that `ratePerMinute` refills over (one token per 2 s) |
| `QUARANTINE.moreThanFailures` | 4 | DECIDED (#44): more than this many failures quarantine a contributor … |
| `QUARANTINE.windowOutcomes` | 10 | DECIDED (#45): … among the last this many counted outcomes of its activation |

- **Effective limits.** A tool's effective limit is the value it declares, or the ceiling when it
  declares none (`effectiveLimits(def)`).
- **Rate limit.** A refused emit takes no token, whatever its code. K2 sets no per-contributor
  *call* rate (design §13.5 step 5 names one); only `contributorInFlightCalls` applies until the
  user sets one.
- **Queue.** The event queue limit is the recipient's `maxQueuedInputs` (K1), not a constant here.
- **Quarantine.**
  - The rule follows design §13.5's wording, "more than N of the last M". With N = 4 and M = 10
    (DECIDED #44, #45), the 5th failure among the last 10 quarantines. Spike S5's 3rd failure in 5
    was replaced because recovery is manual (R-EXT-09).
  - Counted outcomes (PROPOSED): every finished call of the contributor's tools, where a failure is
    `contributor-failed`; and every emit that reaches validation, where a failure is
    `event-invalid` or `payload-too-large` and an accepted emit counts as a success.
  - `tool-withdrawn` and refusals before `execute` are not counted.
  - The quarantine lives on the contributor's activation and lifts only with a new activation
    (S5-Q2).

## Codes

- **`REGISTER_REFUSAL`:** `tool-invalid`, `contributor-unidentified`, `tool-exists`,
  `namespace-reserved`, `registry-closed`.
- **`EMIT_REFUSAL`:** `event-invalid`, `payload-too-large`, `rate-limited`, `queue-full`,
  `duplicate`, `no-fishball`, `contributor-unavailable`, plus the three caller codes
  `contributor-unidentified`, `namespace-reserved` and `registry-closed`. The design's union has
  only `registry-closed`; the other two (DECIDED #7) apply the tools' namespace rule to events, as
  R-EXT-16 asks.
- **`EMIT_CHECK_ORDER`** (EXT-DT-01): `registry-closed`, `contributor-unidentified`,
  `namespace-reserved`, `contributor-unavailable`, `event-invalid`, `payload-too-large`,
  `no-fishball`, `rate-limited`, `duplicate`, `queue-full`. The first failing check wins. A summary
  that is not a string, or is over `summaryChars`, is `event-invalid` (EXT-BVA-02 #8).
- **`CALL_CODE`** (the connector puts these in a contributed tool's envelope):
  `contributor-failed`, `tool-withdrawn`, `limit-exceeded`, `invalid-arguments`, `queue-full`,
  `rate-limited`, `operation-failed`.
- **`SHARED_CODES`** (a tool may return these without declaring them): `limit-exceeded`,
  `forbidden`, `unknown-session`, `expired`, `conflict`, `unavailable`, `unsupported-operation`,
  `operation-failed`. The design's list ends in "…", so this closed form is DECIDED (#8). Any other
  undeclared code becomes `operation-failed`.
- **`ABORT_REASON`** (`call.signal.reason`, a string): `cancelled`, `disconnected`, `revoked`,
  `timeout`, `tool-withdrawn`. The names are PROPOSED.
- **`REGISTRATION_STATE`:** `active`, `quarantined`.

## `tools/list`

- **Metadata.** Each contributed tool carries
  `_meta[CONTRIBUTOR_META_KEY] = {plugin, version}`, where the key is
  `io.github.dsh-fishball/contributor` (S5-Q3).
- **Annotations.** `annotations` carries only the declared `ANNOTATION_HINTS`.

## Exported names

Values and functions: `apiVersion`, `TOOLS_API`, `CONTRIBUTOR_META_KEY`, `CONTRIBUTED_EVENT`, `NAMESPACE`, `NAME_GRAMMAR`,
`TOOL_LIMITS`, `EVENT_LIMITS`, `QUARANTINE`, `REGISTER_REFUSAL`, `EMIT_REFUSAL`, `CALL_CODE`,
`SHARED_CODES`, `ANNOTATION_HINTS`, `SCHEMA_SUBSET`, `REGISTRATION_STATE`, `ABORT_REASON`, `ToolContributionError`,
`EMIT_CHECK_ORDER`, `defineTool`, `effectiveLimits`, `namespaceOf`, `isReservedNamespace`,
`isLocalName`, `publicNameFor`, `publicNameOf`, `isObjectRootSchema`.

Types (`index.d.ts`): `FishballConnectorTools`, `ContributedTool`, `ContributedCall`,
`ContributedPrincipal`, `ContributedResult`, `ContributedEvent`, `Registration`, `ContributorMeta`,
`ToolLimits`, `ToolAnnotationHints`, `JsonValue`, `JsonSchemaNode`, `JsonSchemaObject`,
`RegisterRefusal`, `EmitRefusal`, `RegistrationState`, `AbortReason`.

Two type deviations from design §13.2:
- `ContributedPrincipal.name` is `string | null`, because a principal may have no name
  (R-NAME-04, decided after §13.2).
- `execute` returns a Promise, as in the design; C-EXT still contains a synchronous return or
  throw.
