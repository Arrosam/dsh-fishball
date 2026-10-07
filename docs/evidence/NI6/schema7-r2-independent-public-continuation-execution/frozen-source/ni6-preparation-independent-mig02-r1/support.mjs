// Inert sibling support. Actual original constructors come from sealed support.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export { assert, open6, close, open7, OriginalMemory, MemoryAdapter, NOW, ref }
  from '../ni6-preparation-independent/support.mjs';

export async function withLease(id, body) {
  // A later explicit root invocation gets fresh sibling scratch, never the
  // failed original lease or original capsule's runs directory.
  const root = fileURLToPath(new URL('./runs/', import.meta.url));
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(root, `${id}-`));
  const lease = { id, directory, databasePath: join(directory, 'ledger.sqlite'), stores: new Set() };
  try {
    const observations = await body(lease);
    return { id, status: 'PASS', runDirectory: directory, observations };
  } finally {
    for (const store of lease.stores) store.close();
  }
}
