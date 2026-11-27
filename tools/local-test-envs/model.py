"""Closed provider configuration for the isolated lab."""
import json
import os
from pathlib import Path
import stat
import subprocess
import uuid

PROVIDERS = {
    'agnes': ('https://apihub.agnes-ai.com/v1', 'agnes-2.5-flash'),
    'qwen': ('http://127.0.0.1:61983/v1', 'qwen3.6-35b-a3b-vl-mtp-mxfp8'),
}
CREDENTIAL_FILE = '.credentials.yaml'
KEY_REF = 'DSH_TEST_API_KEY'


def seed_credentials(root, home):
    # Each profile keeps its signing keys and other DSH records separate.
    path = root / CREDENTIAL_FILE
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid():
        raise ValueError('Configured API key file must be a private mode-600 regular file')
    target = home / CREDENTIAL_FILE
    if target.is_symlink():
        raise ValueError('Linked credentials refused')
    if target.exists():
        return
    key = json.loads(path.read_text())['refs'][KEY_REF]
    with target.open('x') as handle:
        json.dump({'version': 1, 'refs': {KEY_REF: key}}, handle)


def provider_patch(provider):
    base, model = PROVIDERS[provider]
    route = {'api': 'openai-completions', 'baseURL': base,
             'models': [{'id': model, 'input': ['text'], 'maxTokens': 4096}]}
    # The gateway rejects the adapter's uncapped default output size.
    rows = []
    if provider == 'agnes':
        route['apiKeyEnv'] = KEY_REF
        rows.append({'id': 'credentials', 'disabled': False})
    else:
        # Never pass the hosted provider's secret to local oMLX.
        route['headers'] = {'Authorization': 'Bearer dsh-local-smoke'}
        route['models'][0].update(contextWindow=32768, maxTokens=8192)
    return rows + [
        {'id': 'llm-pi-ai', 'config': {'providers': {provider: route}}},
        {'id': 'agent-default-model', 'name': '@deepseek-ai/dsh-agent-default-model',
         'config': {'provider': provider, 'model': model}},
        {'id': 'session-title-llm', 'disabled': True},
    ]


def probe(root, provider, dsh, cwd, env):
    nonce = 'DSH smoke ' + uuid.uuid4().hex
    fixture = cwd / 'probe-fixture.txt'
    fixture.write_text(nonce)
    patch = cwd / 'provider.patch.yml'
    if provider == 'agnes':
        try:
            seed_credentials(root, Path(env['DSH_HOME']))
        except (OSError, ValueError, KeyError):
            return {'ok': False, 'provider': provider, 'reason': 'credential-unavailable'}
    rows = provider_patch(provider)
    rows.extend({'id': name, 'disabled': True} for name in (
        'session-persistence-jsonl', 'session-projection-cache', 'session-checkpoint-policy'))
    patch.write_text(json.dumps(rows))
    # Do not retain provider responses, raw exceptions, prompts, or credentials.
    try:
        result = subprocess.run([*dsh, '--profile', 'headless', '--patch', str(patch),
                                 '--permission-mode', 'read-only', '--approval-policy', 'never', '--json',
                                 f'Call the read tool exactly once on {fixture}; then reply OK.'],
                                cwd=cwd, env=env, capture_output=True, text=True, timeout=65)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'provider': provider, 'reason': 'timeout'}
    events = []
    for line in result.stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            events.append(event)
    calls = [e for e in events if e.get('type') == 'tool_call']
    call = len(calls) == 1 and calls[0].get('tool') == 'read' and calls[0].get('input', {}).get('file_path') == str(fixture)
    read = call and any(e.get('type') == 'tool_result' and e.get('callId') == calls[0].get('callId')
                        and e.get('status') == 'completed' and nonce in json.dumps(e) for e in events)
    finished = any(e.get('type') == 'final' and e.get('reason', {}).get('kind') == 'completed' for e in events)
    return {'provider': provider, 'tool_called': call, 'tool_completed': read,
            'finished': finished, 'exit_code': result.returncode,
            'ok': result.returncode == 0 and read and finished}
