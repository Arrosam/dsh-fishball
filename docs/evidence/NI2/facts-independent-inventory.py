"""Read-only conservative literal-import inventory for the NI2 facts lease.

This is an evidence helper, not a package resolver accepted by the product.
It also records declarations, historical TAP and lock pins from the author hold.
Directory CommonJS imports and JSDoc type imports are distinguished explicitly.
"""
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / '.runtime/dsh-web/node_modules'
MANIFEST = ROOT / 'docs/evidence/NI2/facts-author.sha256'
BUILTINS = {'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
            'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
            'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
            'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
            'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers',
            'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
            'worker_threads', 'zlib'}
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def relative(path):
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)

def without_comments(code):
    # Keep quoted import specifiers intact while removing comment-only imports.
    result, i, quote = [], 0, None
    while i < len(code):
        ch = code[i]
        if quote:
            result.append(ch)
            if ch == '\\' and i + 1 < len(code):
                i += 1
                result.append(code[i])
            elif ch == quote:
                quote = None
        elif ch in ('"', "'", '`'):
            quote = ch
            result.append(ch)
        elif code[i:i + 2] == '//':
            end = code.find('\n', i)
            if end < 0:
                break
            result.append('\n')
            i = end
        elif code[i:i + 2] == '/*':
            end = code.find('*/', i + 2)
            if end < 0:
                break
            result.append(' ' + '\n' * code[i:end + 2].count('\n'))
            i = end + 1
        elif ch == '/' and (''.join(result).rstrip()[-1:] in ('=', '(', ':', ',', '[', '!', '?', '&', '|') or code[i + 1:i + 2] == '^'):
            # A quote inside a regexp character class is not a JS string.
            # Preserve the regexp, including escapes, without letting it hide
            # subsequent JSDoc comments from the literal-import scan.
            result.append(ch)
            i += 1
            bracket = False
            while i < len(code):
                item = code[i]
                result.append(item)
                if item == '\\' and i + 1 < len(code):
                    i += 1
                    result.append(code[i])
                elif item == '[':
                    bracket = True
                elif item == ']':
                    bracket = False
                elif item == '/' and not bracket:
                    break
                i += 1
        else:
            result.append(ch)
        i += 1
    return ''.join(result)

files, queue, checks, edges, unused, unresolved = {}, [], [], [], [], []
def add(path):
    path = Path(path).resolve()
    if path in files:
        return
    files[path] = {'path': relative(path), 'bytes': path.stat().st_size,
                   'sha256': digest(path)}
    if path.suffix in ('.js', '.mjs', '.cjs'):
        queue.append(path)

for line in MANIFEST.read_text().splitlines():
    expected, name = line.split('  ', 1)
    path = Path(name) if name.startswith('/') else ROOT / name
    actual = digest(path)
    checks.append({'path': relative(path), 'expected': expected,
                   'actual': actual, 'matches': actual == expected})
    add(path)
add(MANIFEST)
add(ROOT / 'src/runtime-store.mjs')
for name in ('dsh-session-projection',):
    base = RUNTIME / '@deepseek-ai' / name
    for suffix in ('package.json', 'lib/index.js', 'lib/types/index.d.ts'):
        add(base / suffix)
for name in ('/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node',
             '/opt/homebrew/Cellar/node@22/22.22.2_1/lib/libnode.127.dylib'):
    add(Path(name))

def pick_export(value, mode):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in (mode, 'node', 'default'):
            if key in value:
                picked = pick_export(value[key], mode)
                if picked:
                    return picked
    return None

def finish_path(target):
    if target.is_file():
        return target
    for extension in ('.js', '.mjs', '.cjs', '.json'):
        candidate = Path(str(target) + extension)
        if candidate.is_file():
            return candidate
    if target.is_dir():
        metadata = target / 'package.json'
        if metadata.is_file():
            add(metadata)
            main = json.loads(metadata.read_text()).get('main')
            if main:
                result = finish_path(target / main)
                if result:
                    return result
        for suffix in ('index.js', 'index.mjs', 'index.cjs', 'index.json'):
            candidate = target / suffix
            if candidate.is_file():
                return candidate
    return None

def resolve_specifier(source, specifier, mode):
    if specifier.startswith('node:') or specifier.split('/')[0] in BUILTINS:
        return None
    if specifier.startswith('.'):
        result = finish_path(source.parent / specifier)
    else:
        parts = specifier.split('/')
        cut = 2 if parts[0].startswith('@') else 1
        package_name, sub = '/'.join(parts[:cut]), '/'.join(parts[cut:])
        base = RUNTIME / package_name
        metadata = base / 'package.json'
        if not metadata.is_file():
            raise ValueError('missing package metadata: ' + package_name)
        add(metadata)
        info = json.loads(metadata.read_text())
        exports = info.get('exports')
        exported = None
        if exports is not None:
            key = './' + sub if sub else '.'
            value = exports.get(key) if isinstance(exports, dict) and any(k.startswith('.') for k in exports) else (exports if not sub else None)
            exported = pick_export(value, mode)
        target = base / (exported or sub or info.get('main') or 'index.js')
        result = finish_path(target)
    if result is None:
        raise ValueError('unresolved literal source: ' + specifier)
    return result.resolve()

patterns = [
    (re.compile(r'\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["\']([^"\']+)["\']'), 'import'),
    (re.compile(r'\bimport\s*\(\s*["\']([^"\']+)["\']\s*\)'), 'import'),
    (re.compile(r'\brequire\s*\(\s*["\']([^"\']+)["\']\s*\)'), 'require'),
]
visited = set()
while queue:
    source = queue.pop(0)
    if source in visited:
        continue
    visited.add(source)
    code = without_comments(source.read_text(errors='strict'))
    for pattern, mode in patterns:
        for match in pattern.finditer(code):
            specifier = match.group(1)
            try:
                target = resolve_specifier(source, specifier, mode)
                edges.append({'from': relative(source), 'specifier': specifier,
                              'mode': mode, 'to': relative(target) if target else 'node-builtin'})
                if target:
                    add(target)
            except ValueError as error:
                row = {'from': relative(source), 'specifier': specifier,
                       'reason': str(error)}
                if '/koffi/' in str(source) and specifier.startswith('@koromix/koffi-') and 'darwin-arm64' not in specifier:
                    unused.append(row)
                else:
                    unresolved.append(row)

data = {
    'scope': 'independent NI2 facts functional lease; no listener or provider stream',
    'recorded_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'author_manifest_sha256': digest(MANIFEST), 'author_checks': checks,
    'node': 'v22.22.2', 'runtime_store_schema': 4,
    'public_closure_basis': 'Conservative literal ESM/CommonJS imports from all held code plus exercised projection service and RuntimeStore. Pins/declarations/historical TAP/whole lock are also recorded. Variable imports are covered by the explicit public module roots; noncurrent Koffi optional platform branches are not executed. This is not a whole-system-library audit.',
    'rows': sorted(files.values(), key=lambda row: row['path']),
    'visited_javascript_files': len(visited), 'static_import_edges': edges,
    'platform_unused_optional_branches': unused,
    'current_platform_unresolved': unresolved,
}
output = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'docs/evidence/NI2/facts-independent-before.json')
output.write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps({'author_matches': sum(row['matches'] for row in checks),
                  'author_rows': len(checks), 'files': len(files),
                  'javascript_files': len(visited), 'literal_edges': len(edges),
                  'noncurrent_optional_branches': len(unused),
                  'unresolved': len(unresolved), 'output_sha256': digest(output)}))
if unresolved or not all(row['matches'] for row in checks):
    print(json.dumps(unresolved[:8]))
    sys.exit(1)
