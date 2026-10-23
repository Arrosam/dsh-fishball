import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BootstrapError, record } from './config.mjs';
import { hostLockMatches, resolveHostSource } from './host-probe.mjs';

export const MEMORY_ACCOUNTING = 'dsh-fixed-density-text/v1';
const packageName = '@deepseek-ai/dsh-token-meter';
const expectedHash = '1ec049c1e11f8014c84c6ce0568417227177ad7166f5520c00568e9b6e92589f';
const digest = value => createHash('sha256').update(value).digest('hex');
const unsupported = () => { throw new BootstrapError('HOST_CAPABILITY_UNSUPPORTED'); };

// This private process seam accepts only a validated declarative memory choice.
// Its returned binder is called exclusively with SetupState's verified inputs;
// neither identity, profile nor the estimator can come from an RPC/config field.
export async function prepareInstalledMemory(memory) {
  try {
    record(memory, ['enabled', 'byteLimit', 'tokenLimit']);
    if (memory.enabled !== true || Object.keys(memory).length !== 3 ||
        !Number.isSafeInteger(memory.byteLimit) || memory.byteLimit < 1 || memory.byteLimit > 65536 ||
        !Number.isSafeInteger(memory.tokenLimit) || memory.tokenLimit < 1 || memory.tokenLimit > 131072) throw new BootstrapError('CONFIG_INVALID');
    const bounds = Object.freeze({ byteLimit: memory.byteLimit, tokenLimit: memory.tokenLimit });
    const source = resolveHostSource(packageName, 'lib/types/estimate.js');
    const canonicalUrl = pathToFileURL(source).href;
    const publicUrl = import.meta.resolve(`${packageName}/estimate`);
    const verify = () => {
      const manifest = JSON.parse(readFileSync(resolveHostSource(packageName, 'package.json'), 'utf8'));
      if (publicUrl !== canonicalUrl || realpathSync(fileURLToPath(publicUrl)) !== source ||
          resolveHostSource(packageName, 'lib/types/estimate.js') !== source ||
          manifest.name !== packageName || manifest.version !== '0.2.1-rc.2' ||
          digest(readFileSync(source)) !== expectedHash ||
          !hostLockMatches()) unsupported();
    };
    verify();
    const { estimateContent } = await import(publicUrl);
    verify();
    if (typeof estimateContent !== 'function') unsupported();
    const tokenize = text => {
      try {
        if (typeof text !== 'string' || !text.isWellFormed()) throw new Error();
        const count = estimateContent([{ type: 'text', text }]);
        if (!Number.isSafeInteger(count) || count < 0) throw new Error();
        return count;
      } catch { throw new BootstrapError('TOKENIZER_UNAVAILABLE'); }
    };
    return Object.freeze((identity, profile) => {
      try {
        record(identity, ['ownerId', 'workspaceId']); record(profile, ['dir', 'name']);
        for (const value of [identity.ownerId, identity.workspaceId, profile.dir, profile.name]) {
          if (typeof value !== 'string' || !value.length || !value.isWellFormed()) throw new Error();
        }
        const namespaceRef = digest(JSON.stringify(['df.installed-memory/v1', identity.ownerId, identity.workspaceId, profile.dir, profile.name]));
        return Object.freeze({ namespaceRef, tokenize, ...bounds });
      } catch { throw new BootstrapError('RUNTIME_ADAPTER_INVALID'); }
    });
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    unsupported();
  }
}
