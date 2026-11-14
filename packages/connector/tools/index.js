/**
 * `fishball-connector/tools`: the frozen contract of the contribution service
 * `fishballConnectorTools` (task K2; design §9.1, §13; requirements R-EXT-01…20; spike V3-S5
 * `8f2788e`). Data, pure validators and types only: no DSH import, no service, no state. The
 * registry behind the service is C-EXT's (`packages/connector/src/contrib/`). Types are in the
 * sibling `index.d.ts`; the prose freeze is `README.md` beside this file.
 *
 * Frozen export names (the K2 freeze; renaming one is a K2 amendment). Values marked PROPOSED
 * in constants.js await the user's decision; values marked DECIDED are the user's.
 * Values:
 * - service and wire: apiVersion, TOOLS_API (version, service, protocolVersion),
 *   CONTRIBUTOR_META_KEY, CONTRIBUTED_EVENT (typePrefix);
 * - names: NAMESPACE (separator, aliases, reserved, normalisation data), NAME_GRAMMAR (local,
 *   publicMaxChars, code), EXTERNAL_NAME (replaced, replacement);
 * - limits: TOOL_LIMITS (descriptionBytes, ceiling.{argumentBytes, resultBytes, timeoutMs},
 *   contributorInFlightCalls, messageChars), EVENT_LIMITS (payloadBytes, summaryChars,
 *   ratePerMinute, rateBurst, rateWindowMs), QUARANTINE (moreThanFailures, windowOutcomes);
 * - codes: REGISTER_REFUSAL, EMIT_REFUSAL, EMIT_CHECK_ORDER, CALL_CODE, SHARED_CODES, ABORT_REASON;
 * - registration: ANNOTATION_HINTS, REGISTRATION_STATE, SCHEMA_SUBSET (type, types, keywords,
 *   annotations, textAnnotations, typed, placement, oneOfMinBranches, root);
 * - functions: defineTool, effectiveLimits, namespaceOf, isReservedNamespace, isLocalName,
 *   publicNameFor, publicNameOf, isObjectRootSchema;
 * - class: ToolContributionError.
 * Types (index.d.ts): FishballConnectorTools, ContributedTool, ContributedCall,
 * ContributedPrincipal, ContributedResult, ContributedEvent, Registration, ContributorMeta,
 * ToolLimits, ToolAnnotationHints, JsonValue, JsonSchemaNode, JsonSchemaObject, RegisterRefusal,
 * EmitRefusal, RegistrationState, AbortReason.
 */
export * from './constants.js'
export { ToolContributionError } from './errors.js'
export { defineTool, effectiveLimits } from './define-tool.js'
export { namespaceOf, isReservedNamespace, isLocalName, publicNameFor, publicNameOf } from './names.js'
export { isObjectRootSchema } from './schema.js'
