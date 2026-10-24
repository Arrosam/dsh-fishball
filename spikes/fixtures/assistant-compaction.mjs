/** Spike fixture: a BasicCompactionEngine subclass whose summarize() is assistant-oriented (S5). */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const RUNTIME = process.env.DSH_RUNTIME_ROOT ?? '/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules'
const mod = await import(pathToFileURL(path.join(RUNTIME, '@deepseek-ai/dsh-compaction-basic/lib/index.js')).href)
const Base = mod.BasicCompactionEngine
export default class AssistantCompaction extends Base {
  async summarize(input, agent, signal) {
    globalThis.__assistantSummarizeCalls = (globalThis.__assistantSummarizeCalls ?? 0) + 1
    return { summary: [{ type: 'text', text: '## Standing permissions\n- (spike) none\n## Open loops\n- spike' }], provider: 'fishball-spike', model: 'spike-model' }
  }
}
