// Inert NI6 proposal: this module is not adopted by any current entry point.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableSource } from './normal-contracts.mjs';
import { canonical, canonicalDigest, exact, hash } from './runtime-security.mjs';
import { resolveHostSource, DSH_WEB_RUNTIME_ROOT } from './host-probe.mjs';
import { BootstrapError } from './config.mjs';

const fail = () => { throw new BootstrapError('WORKER_SOURCE_UNAVAILABLE'); };
// The manifest is installation-owned, never RPC, model, or Config input. It is
// written after final executable source freeze and does not include itself.
// File checks authenticate bytes; they do not issue a native capability.
export function readAuthenticNativeSource(manifest, productRoot) {
  exact(manifest, ['contractVersion', 'host', 'product']);
  const descriptor = stableSource(JSON.parse(canonical(manifest)));
  if (realpathSync(productRoot) !== productRoot) fail();
  if (hash(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`)) !== descriptor.host.lockDigest) fail();
  for (const module of descriptor.host.modules) {
    const metadata = JSON.parse(readFileSync(resolveHostSource(module.name, 'package.json'), 'utf8'));
    if (metadata.name !== module.name || metadata.version !== module.version) fail();
    for (const file of module.files) if (hash(readFileSync(resolveHostSource(module.name, file.path))) !== file.digest) fail();
  }
  const metadata = JSON.parse(readFileSync(resolve(productRoot, 'package.json'), 'utf8'));
  if (metadata.name !== descriptor.product.name || metadata.version !== descriptor.product.version) fail();
  for (const file of descriptor.product.files) {
    const path = resolve(productRoot, file.path);
    if (!path.startsWith(productRoot + '/') || realpathSync(path) !== path || hash(readFileSync(path)) !== file.digest) fail();
  }
  return Object.freeze({ descriptor: Object.freeze(descriptor), stableSourceRef: canonicalDigest(descriptor),
    assertCurrent() { const next = readAuthenticNativeSource(manifest, productRoot); if (canonical(next.descriptor) !== canonical(descriptor)) fail(); return true; } });
}
export const proposedProductRoot = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
