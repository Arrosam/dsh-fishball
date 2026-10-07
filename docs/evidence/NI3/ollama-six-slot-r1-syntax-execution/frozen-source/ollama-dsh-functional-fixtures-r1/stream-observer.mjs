import { stableErrorCode } from './stable-error-code.mjs';
// Observes original llm/stream. Never changes options, authority, wire or chunks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest('hex');
const latch = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
export function createStreamObservation() {
  const reached = latch(), loss = latch(), release = latch();
  const rows = []; let slot = null, armed = false, barrierUsed = false, lost = false;
  const state = { reached: reached.promise, loss: loss.promise, rows,
    select(id) { slot = id; }, arm() { assert.equal(slot, 'R06'); armed = true; },
    release() { release.resolve(); }, snapshot() { return { barrierUsed, lost, rows: structuredClone(rows) }; },
    plugin: { name: 'df-ollama-public-stream-observer', inject: ['llm'], apply(ctx) {
      ctx.on('llm/stream', (options, next) => {
        assert.ok(slot); assert.ok(Object.isFrozen(options));
        assert.equal(options.provider, 'df-approved-ollama');
        assert.equal(options.model, 'deepseek-v4.1-flash:cloud');
        assert.equal(options.reasoningEffort, 'ollama-think-off');
        assert.equal(options.maxTokens, 512);
        const row = { slot, sessionId: options.sessionId, chunks: [], aborted: options.signal?.aborted === true };
        rows.push(row); assert.ok(rows.length <= 6); assert.ok(rows.filter(r => r.slot === slot).length === 1);
        const onAbort = () => { row.aborted = true; if (row.slot === 'R06') { lost = true; loss.resolve('original AbortSignal abort'); } };
        options.signal?.addEventListener('abort', onAbort, { once: true });
        const iterator = next()[Symbol.asyncIterator](); let pause = false;
        const advance = async (method, value) => {
          if (method === 'next' && pause) { await release.promise; pause = false; }
          try {
            const step = await iterator[method](value);
            if (!step.done) {
              const chunk = step.value;
              const observation = { type: chunk.type, afterLoss: row.slot === 'R06' && lost,
                digest: digest(JSON.stringify(chunk)), bytes: Buffer.byteLength(JSON.stringify(chunk)) };
              if (chunk.type === 'usage') observation.usage = structuredClone(chunk.usage);
              if (chunk.type === 'finish') observation.reason = chunk.reason;
              row.chunks.push(observation); assert.ok(row.chunks.length <= 16);
              if (row.slot === 'R06' && armed && !barrierUsed && chunk.type === 'block-start') {
                barrierUsed = true; pause = true; reached.resolve({ sessionId: options.sessionId });
              }
            } else options.signal?.removeEventListener('abort', onAbort);
            return step;
          } catch (error) {
            row.refusal = stableErrorCode(error, 'iterator');
            options.signal?.removeEventListener('abort', onAbort); throw error;
          }
        };
        return { next: value => advance('next', value),
          return: value => advance('return', value), throw: error => advance('throw', error),
          [Symbol.asyncIterator]() { return this; } };
      });
    } } };
  return state;
}
