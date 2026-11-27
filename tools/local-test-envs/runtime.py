"""Launch and observe only test-lab processes."""
import http.client
import json
import os
import re
import signal
import socket
import subprocess
import time
from urllib.parse import urlsplit

HOST = '127.0.0.1'
NODE = '/opt/homebrew/bin/node'
BIN = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
POLL_SECONDS = 0.4
START_SECONDS = 100
STOP_SECONDS = 30
LOG_CODES = re.compile(r'[A-Z][A-Z_0-9]{5,60}')


def json_write(path, value):
    temporary = path.with_name(path.name + '.new')
    with temporary.open('x') as handle:
        json.dump(value, handle)
    temporary.replace(path)


def dsh(root):
    binary = root / 'shared/sdk' / BIN
    if not binary.is_file() or not binary.resolve().is_relative_to(root / 'shared/sdk'):
        raise ValueError('Pinned lab SDK not installed')
    return [NODE, str(binary)]


def isolated(env):
    paths = {'HOME': 'os-home', 'DSH_HOME': 'dsh-home',
             'DSH_AGENTS_HOME': 'agents-home', 'AGENTS_HOME': 'agents-home',
             'TMPDIR': 'tmp', 'TMP': 'tmp', 'TEMP': 'tmp',
             'XDG_CACHE_HOME': 'cache', 'XDG_CONFIG_HOME': 'xdg/config',
             'XDG_DATA_HOME': 'xdg/data', 'XDG_STATE_HOME': 'xdg/state',
             'XDG_RUNTIME_DIR': 'xdg/runtime', 'NPM_CONFIG_CACHE': 'cache/npm',
             'PNPM_HOME': 'cache/pnpm', 'COREPACK_HOME': 'cache/corepack'}
    for sub in {*paths.values(), 'workspace', 'logs', 'browser'}:
        path = env / sub
        if path.resolve() != path:
            raise ValueError('Linked runtime directory refused')
        path.mkdir(parents=True, exist_ok=True)
    return {**{k: str(env / v) for k, v in paths.items()},
            'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
            'NPM_CONFIG_USERCONFIG': '/dev/null', 'NPM_CONFIG_GLOBALCONFIG': '/dev/null',
            'NPM_CONFIG_OFFLINE': 'true', 'GIT_CONFIG_NOSYSTEM': '1',
            'GIT_CONFIG_GLOBAL': '/dev/null', 'DO_NOT_TRACK': '1', 'LANG': 'en_US.UTF-8'}


def ps(pid, field):
    if type(pid) is not int or pid < 2:
        raise ValueError('Invalid recorded PID')
    result = subprocess.run(['/bin/ps', '-ww', '-p', str(pid), '-o', field + '='],
                            capture_output=True, text=True, env={'LC_ALL': 'C'})
    return result.stdout.strip() or None


def owned(record):
    pid = record['pid']
    born = ps(pid, 'lstart')
    if born is None or born != record['born']:
        return False
    args = ps(pid, 'command')
    if args is None:
        return False
    if record['anchor'] not in args or ps(pid, 'uid') != str(os.getuid()):
        raise ValueError('Recorded process identity is unknown; no signals sent')
    return True


def listeners(port):
    result = subprocess.run(['/usr/sbin/lsof', '-nP', '-iTCP:' + str(port), '-sTCP:LISTEN', '-Fp'],
                            capture_output=True, text=True)
    return {int(row[1:]) for row in result.stdout.splitlines() if row.startswith('p')}


def free(ports):
    for port in ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((HOST, port))
            except OSError:
                raise ValueError(f'Port {port} is occupied; no takeover') from None
        if listeners(port):
            raise ValueError(f'Port {port} is occupied; no takeover')


def wait_for(predicate, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        result = predicate()
        if result:
            return result
        time.sleep(POLL_SECONDS)
    return None


def private_url(env, ports, pid):
    url = (env / 'admission').read_text().strip()
    parsed = urlsplit(url)
    if (parsed.scheme, parsed.netloc) != ('http', f'{HOST}:{ports[0]}') or listeners(ports[0]) != {pid}:
        raise ValueError('Admission endpoint is not the owned parent listener')
    return url


def request(port, pid, route, cookie='', body=None):
    if listeners(port) != {pid}:
        raise ValueError('Refusing request to unowned listener')
    conn = http.client.HTTPConnection(HOST, port, timeout=3)
    headers = {'Origin': f'http://{HOST}:{port}', 'Cookie': cookie}
    try:
        if body is not None:
            headers['Content-Type'] = 'application/json'
        conn.request('GET' if body is None else 'POST', route, body, headers)
        res = conn.getresponse()
        cookies = '; '.join(value.split(';', 1)[0] for key, value in res.getheaders() if key.lower() == 'set-cookie')
        data = res.read(256 * 1024)
        return res.status, cookies, data
    finally:
        conn.close()


def admit(url, port, pid):
    u = urlsplit(url)
    if (u.scheme, u.netloc) != ('http', f'{HOST}:{port}'):
        raise ValueError('Unexpected admission URL')
    _, auth, _ = request(port, pid, u.path + ('?' + u.query if u.query else ''))
    if not auth:
        raise ValueError('Expected DSH admission cookie')
    return auth


def child_record(env, parent):
    runtime = env / 'dsh-home/fishball/runtime'
    active = runtime / 'active.json'
    if not active.exists():
        return None
    launch_id = json.loads(active.read_text())['instanceId']
    if not re.fullmatch(r'[0-9a-zA-Z-]{1,100}', launch_id):
        raise ValueError('Unexpected child launch ID')
    launch = runtime / 'launches' / launch_id
    record = launch / 'pid.json'
    if not record.exists():
        return None
    pid = json.loads(record.read_text())['pid']
    born = ps(pid, 'lstart')
    anchor = str(launch / 'launch.patch.yml')
    if not born or anchor not in (ps(pid, 'command') or ''):
        return None
    if ps(pid, 'ppid') != str(parent):
        raise ValueError('Found an unowned or orphaned child; no changes made')
    return {'pid': pid, 'born': born, 'anchor': anchor}


def json_api(port, owner, cookie):
    def api(route, body=None):
        status, _, data = request(port, owner, route, cookie, body)
        return json.loads(data) if status == 200 else {}
    return api


def parent_api(env, ports, pid):
    auth = admit(private_url(env, ports, pid), ports[0], pid)
    return json_api(ports[0], pid, auth)


def configure_model(env, ports, pid, provider, model):
    api = parent_api(env, ports, pid)
    base = '/api/dsh-instance'
    initial = api(base + '/onboarding/state')
    for group in (initial.get('catalog') or {}).get('groups', []):
        if group.get('id') == provider and any(m.get('id') == model for m in group.get('models', [])):
            break
    else:
        checked = api(base + '/models/check', '{}').get('result', {})
        if any(e.get('id') == provider for e in checked.get('missing', [])):
            added = api(base + '/models/add', json.dumps({'checkId': checked['checkId'], 'ids': [provider]}))
            if not added.get('ok'):
                return False
        elif not initial.get('completed'):
            return False
    selected = api(base + '/onboarding/model', json.dumps({'provider': provider, 'model': model}))
    return selected.get('ok') is True and api(base + '/onboarding/complete', '{}').get('ok') is True


def readiness(env, ports, pid):
    api = parent_api(env, ports, pid)
    status = api('/api/dsh-instance/status')
    state = status.get('state', 'unavailable')
    if state != 'ready':
        return state
    if listeners(ports[1]) != {pid}:
        return 'approval-not-owned'
    conn = api('/api/dsh-connector/settings/state')
    if not any(e.get('enabled') and e.get('paired') and e.get('connected') for e in conn.get('entries', [])):
        return 'waiting-for-pairing'
    child = child_record(env, pid)
    if not child:
        return 'child-not-owned'
    url = api('/api/dsh-instance/open', '{"lang":"en"}').get('url')
    if not url:
        return 'child-open-unavailable'
    child_port = urlsplit(url).port
    child_pid = child['pid']
    cookie = admit(url, child_port, child_pid)
    targets = json_api(child_port, child_pid, cookie)('/api/fishball/targets')
    parents = [row for row in targets.get('targets', []) if row.get('kind') == 'parent']
    if (len(parents) != 1 or parents[0].get('url') != f'http://{HOST}:{ports[0]}/api/agent/mcp'
            or parents[0].get('link', {}).get('state') != 'connected'
            or parents[0].get('pairing', {}).get('state') != 'paired'):
        return 'waiting-for-reserved-parent'
    return 'ready'


def supervise(env, dsh_args, environment, port, anchor, lock_fd):
    """Keep raw DSH output off disk. The one browser capability is a private config file."""
    child = None

    def shutdown(_signum, _frame):
        nonlocal child
        if child is not None:
            child.terminate()
            child.wait(timeout=STOP_SECONDS)
        raise SystemExit(1)

    # Block cancellation for the spawn/publication window; the exact child is then known.
    old_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM})
    signal.signal(signal.SIGTERM, shutdown)
    child = process = subprocess.Popen(dsh_args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, preexec_fn=lambda: signal.pthread_sigmask(signal.SIG_SETMASK, old_mask), cwd=env / 'workspace', env=environment)
    json_write(env / 'process.json', {'pid': process.pid, 'born': ps(process.pid, 'lstart'), 'anchor': anchor})
    # If the initiating CLI exits, the inherited lock protects the spawn until the PID is recorded.
    os.close(lock_fd)
    signal.pthread_sigmask(signal.SIG_SETMASK, old_mask)
    with (env / 'logs/host.log').open('w') as log:
        for stream in process.stdout:
            line = stream.decode(errors='replace')
            if 'dsh web: http://' in line:
                url = line.split('dsh web: ', 1)[1].strip()
                if urlsplit(url).netloc == f'{HOST}:{port}':
                    with (env / 'admission').open('x') as out:
                        out.write(url)
                    log.write('DSH_WEB_ANNOUNCED\n')
                    log.flush()
            elif any(text in line.lower() for text in ('error', 'fail', 'missing')):
                log.write('DSH_REPORTED_ERROR\n')
                log.flush()
        log.write(f'DSH_EXIT {process.wait()}\n')
