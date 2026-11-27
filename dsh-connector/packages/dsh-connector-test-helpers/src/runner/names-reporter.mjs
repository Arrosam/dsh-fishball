// Writes one JSON line per finished test: file, name, status, and the error's first line.
export default async function* names(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    const d = event.data
    if (d.details?.type === 'suite') continue
    const status = event.type === 'test:fail' ? 'fail' : d.skip ? 'skip' : d.todo ? 'todo' : 'pass'
    const err = status === 'fail' ? String(d.details?.error?.cause?.message ?? d.details?.error?.message ?? '').split('\n')[0].slice(0, 400) : undefined
    yield JSON.stringify({ file: d.file, name: d.name, status, err }) + '\n'
  }
}
