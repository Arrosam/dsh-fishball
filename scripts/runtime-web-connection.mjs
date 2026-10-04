import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { verifyRuntimeFixtureHost } from './runtime-web.mjs';
verifyRuntimeFixtureHost();
const native = await import(pathToFileURL(`${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`).href);
// Only the isolated synthetic Web profile selects this public composition.
// The pinned RPC getter resolves its Web carrier through the provider scope;
// declare that concrete dependency without changing any native auth or RPC.
export const name = 'df-runtime-native-web-connection';
export const inject = Object.freeze(['credentials', 'webServer']);
export const Config = native.Config;
export const apply = native.apply;
