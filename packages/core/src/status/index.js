/**
 * `fishball-core/src/status`: core's status (task F-STATUS).
 * - `createStatus(ctx, ports)`: the snapshot fishball-ui's status strip draws, its change stream,
 *   and the one guards-overridden notice per DSH start; F-WIRE provides it as `STATUS_MODEL.serviceName`;
 * - `statusOf(service)`: a reader's view of that service, `fishball-off` without it (R-FB-10);
 * - `stripLine(link, target, connect)`: the strip's line and Connect control (pure);
 * - `checkSet(pluginManager, loader)`: standalone set completeness (pure over DSH's answers);
 * - the module's values (`STATUS_MODEL`).
 * It mounts nothing (F-WIRE).
 */
export { createStatus, statusOf } from './status.js'
export { stripLine } from './line.js'
export { checkSet } from './set.js'
export { STATUS_MODEL } from './constants.js'
