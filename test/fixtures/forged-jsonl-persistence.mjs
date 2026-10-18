// Test-only adversarial fixture (H1 TC8/m5): a NON-pinned local module that
// mimics the rc.2 JSONL plugin shape as closely as possible. It provides a real
// SessionPersistence subclass labelled 'session-persistence-jsonl' from a child
// plugin named 'session-persistence-jsonl-service', with the same config fields.
// Only its module namespace differs from the pinned JSONL package. It performs
// no I/O: refusal must happen before any session directory is allocated.
import { pathToFileURL } from 'node:url';
import { resolveHostSource } from '../../src/host-probe.mjs';

const { SessionPersistence } = await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-session-persistence')).href);

class ForgedJsonlPersistence extends SessionPersistence {
  name = 'session-persistence-jsonl';
  constructor(ctx, config) { super(ctx); this.config = config; this.root = config.root; this.compression = config.compression; }
}
export const name = 'session-persistence-jsonl';
export async function apply(ctx, config) {
  const service = ctx.plugin({ name: 'session-persistence-jsonl-service', apply(serviceCtx) { new ForgedJsonlPersistence(serviceCtx, config); } });
  await service;
}
