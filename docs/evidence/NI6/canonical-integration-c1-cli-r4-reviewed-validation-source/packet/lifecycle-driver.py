"""Source-only proposed original CLI case driver; one shared family deadline; root GO required."""
import time
STARTED = time.monotonic()
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys

ROOT=Path('/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball')
NAME='.runtime/ni6-canonical-integration-c1/validation/cli-r4'
CAPSULE=ROOT/NAME
HOST=ROOT/'.runtime/dsh-web'
NODE='/opt/homebrew/opt/node@22/bin/node'
PYTHON='/opt/homebrew/bin/python3'
NODE_REAL='/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node'
PYTHON_REAL='/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14'
BINARY_HASHES={NODE_REAL:'463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de',
 PYTHON_REAL:'2477b47fa3ae65b9574eb18a15edb364e96948eaa1875ad3f1c80d780efc9c12'}
PLAN_NAME='.runtime/root-ni6-canonical-integration-c1-cli-r4-plan.json'
GRAPH_NAME='.runtime/ni3-native-runtime/public-graph-pins.json'
STOP_REQUESTED=False
FIRST_REASON=None
COMMAND_BOOKKEEPING=1.0
STREAM_CAP=65536
AGGREGATE_CAP=131072
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()


class Stop(Exception):
    pass


def need(condition, code):
    global FIRST_REASON
    if not condition:
        FIRST_REASON = FIRST_REASON or code
        raise Stop()


def latch_interruption(_signum, _frame):
    global STOP_REQUESTED
    STOP_REQUESTED = True  # Repeated catchable signals cannot interrupt cleanup.


def guard(deadline, code='EXECUTOR_AGGREGATE_DEADLINE', *, cleanup=False):
    need(cleanup or not STOP_REQUESTED, 'EXECUTOR_INTERRUPTED')
    need(time.monotonic() < deadline, code)


def strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            need(key not in value, 'EXECUTOR_DUPLICATE_JSON_MEMBER')
            value[key] = item
        return value
    def constant(_value):
        need(False, 'EXECUTOR_JSON_CONSTANT')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


def contained(name, *, absent=False):
    need(isinstance(name, str) and not name.startswith('/') and name != ''
         and all(part not in ('', '.', '..') for part in name.split('/')), 'EXECUTOR_PATH')
    path = ROOT / name
    need(path.resolve() == path and path.is_relative_to(ROOT), 'EXECUTOR_CONTAINMENT')
    if not absent:
        need(path.is_file() and not path.is_symlink(), 'EXECUTOR_REGULAR_FILE')
    return path


def pin_path(name):
    if name in BINARY_HASHES:
        path = Path(name)
        need(path.resolve() == path and path.is_file() and not path.is_symlink(), 'EXECUTOR_BINARY_FILE')
        return path
    return contained(name)


def read_json(path, maximum=8388608):
    raw = path.read_bytes()
    need(len(raw) <= maximum, 'EXECUTOR_JSON_BOUND')
    return strict_json(raw)


def owned_directory(path):
    s = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid()
         and stat.S_IMODE(s.st_mode) == 0o700, 'EXECUTOR_PRIVATE_DIRECTORY')


def owned_file(path):
    s = path.lstat()
    need(path.resolve() == path and stat.S_ISREG(s.st_mode) and not path.is_symlink()
         and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o600,
         'EXECUTOR_PRIVATE_FILE')
    return s


def private_directory(path):
    path.mkdir(mode=0o700)
    os.chmod(path, 0o700)  # This newly created component only; no ambient parent.
    owned_directory(path)


def copy_parents(base, parent, created):
    owned_directory(base)
    need(parent.is_relative_to(base), 'EXECUTOR_COPY_CONTAINMENT')
    current = base
    for part in parent.relative_to(base).parts:
        current = current / part
        if current not in created:
            private_directory(current)
            created.add(current)
        owned_directory(current)


def exclusive(path):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
             and stat.S_IMODE(s.st_mode) == 0o600 and path.resolve() == path,
             'EXECUTOR_PRIVATE_FILE')
        need(identity(path) == (s.st_dev,s.st_ino), 'EXECUTOR_FILE_IDENTITY')
        return os.fdopen(fd, 'wb')
    except BaseException:
        os.close(fd)
        raise


def owned_handle(path, handle, expected_identity=None):
    actual = os.fstat(handle.fileno())
    observed = owned_file(path)
    stamp = (actual.st_dev,actual.st_ino)
    need(stat.S_ISREG(actual.st_mode) and actual.st_uid == os.getuid()
         and stat.S_IMODE(actual.st_mode) == 0o600
         and stamp == (observed.st_dev,observed.st_ino)
         and (expected_identity is None or stamp == expected_identity), 'EXECUTOR_FILE_IDENTITY')
    return stamp


def bounded_owned_bytes(path, maximum, *, expected_length=None, expected_identity=None):
    observed = owned_file(path)
    stamp = (observed.st_dev,observed.st_ino)
    need(0 <= observed.st_size <= maximum
         and (expected_length is None or observed.st_size == expected_length), 'EXECUTOR_OWNED_READ_BOUND')
    need(expected_identity is None or stamp == expected_identity, 'EXECUTOR_FILE_IDENTITY')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as handle:
        owned_handle(path,handle,stamp)
        need(os.fstat(handle.fileno()).st_size == observed.st_size, 'EXECUTOR_OWNED_READ_BOUND')
        raw = handle.read(maximum + 1)
        owned_handle(path,handle,stamp)
        need(os.fstat(handle.fileno()).st_size == observed.st_size
             and len(raw) == observed.st_size and len(raw) <= maximum, 'EXECUTOR_OWNED_READ_BOUND')
    return raw


def save(path, value, *, fresh=False, expected_identity=None):
    raw = (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()
    if fresh:
        with exclusive(path) as handle:
            stamp = owned_handle(path,handle)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
            owned_handle(path,handle,stamp)
            return stamp
    else:
        s = path.lstat()
        need(stat.S_ISREG(s.st_mode) and not path.is_symlink() and s.st_uid == os.getuid()
             and stat.S_IMODE(s.st_mode) == 0o600, 'EXECUTOR_OWNED_RECORD')
        need(expected_identity is None or (s.st_dev,s.st_ino) == expected_identity, 'EXECUTOR_OWNED_RECORD')
        fd = os.open(path, os.O_WRONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'wb') as handle:
            actual = os.fstat(handle.fileno())
            need(actual.st_ino == s.st_ino and actual.st_dev == s.st_dev
                 and actual.st_uid == os.getuid() and stat.S_IMODE(actual.st_mode) == 0o600,
                 'EXECUTOR_OWNED_RECORD')
            stamp = owned_handle(path,handle,expected_identity)
            os.ftruncate(handle.fileno(),0)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
            owned_handle(path,handle,stamp)
            return stamp


def identity(path):
    s = path.lstat()
    return (s.st_dev,s.st_ino)


import http.client
from contextlib import contextmanager
import socket
from urllib.parse import urlsplit
CASES={'positive':(120,2,32),'disabled':(25,1,8),'invalid':(25,1,8)}
CLI=HOST/'node_modules/@deepseek-ai/dsh/lib/bin.js'

def checked_pins(pins,deadline):
    for name,digest in pins.items():
        guard(deadline)
        need(type(digest) is str and re.fullmatch('[a-f0-9]{64}',digest),'EXECUTOR_DIGEST')
        need(sha(pin_path(name).read_bytes())==digest,'EXECUTOR_PIN_DRIFT')
        guard(deadline)
    return {'inputCount':len(pins),'complete':True,'unchanged':True}

def group_exists(pgid):
    try:os.killpg(pgid,0);return True
    except ProcessLookupError:return False
    except (PermissionError,OSError):return None

class Child:
    def __init__(self,argv,cwd,env,private,boot,end):
        self.end=end;self.proc=None;self.absent=False;self.blocked=False;self.term=False
        self.streams={};self.selector=selectors.DefaultSelector();self.handles={};self.pipes=[]
        self.row={'boot':boot,'exitCode':None,'signalAttempts':[],'signalOutcomes':[],'processGroupState':'NOT_STARTED','overflow':False,'eof':False,'captureComplete':False,'forcedCleanup':False,'failureCode':None}
        try:
            for name in ('stdout','stderr'):
                path=private/f'cli-{boot}.{name}.bin';handle=exclusive(path);stamp=owned_handle(path,handle)
                self.handles[name]=handle;self.streams[name]={'path':path,'identity':stamp,'hash':hashlib.sha256(),'received':0,'stored':0,'eof':False}
            guard(end)
            self.proc=subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,shell=False,start_new_session=True)
            self.row['childPid']=self.row['ownedProcessGroup']=self.proc.pid
            self.row['processGroupState']='OWNED_NEW_SESSION'
            for name,pipe in [('stdout',self.proc.stdout),('stderr',self.proc.stderr)]:
                os.set_blocking(pipe.fileno(),False);self.selector.register(pipe,selectors.EVENT_READ,name);self.pipes.append(pipe)
        except Exception:
            # A partly admitted child remains retained for the caller's cleanup.
            self.row['failureCode']='EXECUTOR_SPAWN_OR_CAPTURE_FAILED'
    def observe_group(self):
        if self.absent:return False
        if self.proc is None:return False
        state=group_exists(self.proc.pid)
        if state is False:self.absent=True
        if state is None:self.blocked=True;self.row['failureCode']=self.row['failureCode'] or 'EXECUTOR_SIGNAL_OWNERSHIP_UNKNOWN'
        return state
    def pump(self,end,cleanup=False):
        guard(end,cleanup=cleanup)
        for key,_ in self.selector.select(timeout=min(.02,max(0,end-time.monotonic()))):
            chunk=os.read(key.fileobj.fileno(),65536);name=key.data;item=self.streams[name]
            if not chunk:
                item['eof']=True;self.selector.unregister(key.fileobj);continue
            item['received']+=len(chunk);amount=min(len(chunk),STREAM_CAP-item['stored'])
            if amount:
                owned_handle(item['path'],self.handles[name],item['identity'])
                self.handles[name].write(chunk[:amount]);item['hash'].update(chunk[:amount]);item['stored']+=amount
            if amount<len(chunk):
                self.row['overflow']=True;self.row['failureCode']='EXECUTOR_OUTPUT_BOUND'
                need(False,'EXECUTOR_OUTPUT_BOUND')
        if self.proc is not None:self.proc.poll()
    def signal(self,sig,end):
        guard(end,cleanup=True);need(not self.blocked,'EXECUTOR_SIGNAL_BLOCKED');state=self.observe_group()
        if state is False:return
        if state is not True:self.blocked=True;need(False,'EXECUTOR_SIGNAL_OWNERSHIP_UNKNOWN')
        need(sig.name not in self.row['signalAttempts'],'EXECUTOR_SIGNAL_REPEAT')
        self.row['signalAttempts'].append(sig.name)
        try:os.killpg(self.proc.pid,sig);self.row['signalOutcomes'].append('SUBMITTED')
        except ProcessLookupError:self.absent=True;self.row['signalOutcomes'].append('ALREADY_ABSENT')
        except (PermissionError,OSError):
            self.blocked=True;self.row['signalOutcomes'].append('DENIED_UNKNOWN')
            need(False,'EXECUTOR_SIGNAL_DENIED_UNKNOWN')
    def stop(self,end):
        need(self.proc is not None and self.proc.poll() is None and self.observe_group() is True,'EXECUTOR_CLI_NOT_ALIVE_BEFORE_STOP')
        self.signal(signal.SIGTERM,end);self.term=True
        need(self.row['signalOutcomes'][-1]=='SUBMITTED','EXECUTOR_SELECTED_SIGTERM_NOT_SUBMITTED')
        while time.monotonic()<end and (self.selector.get_map() or self.proc.poll() is None or self.observe_group() is True):
            self.pump(end)
        self.proc.poll()
        need(self.proc.returncode==0 and self.observe_group() is False,'EXECUTOR_CLI_STOP_NOT_ESTABLISHED')
        need(all(v['eof'] for v in self.streams.values()),'EXECUTOR_EOF_NOT_ESTABLISHED')
    def finish(self,end):
        try:
            if self.proc is not None:
                self.proc.poll();state=self.observe_group()
                if state is not False and not self.blocked and time.monotonic()<end:
                    self.row['forcedCleanup']=True;self.row['failureCode']=self.row['failureCode'] or 'EXECUTOR_FORCED_CLEANUP'
                    if not self.term:self.signal(signal.SIGTERM,end);self.term=True
                    while time.monotonic()<end-.5 and self.proc.poll() is None:
                        try:self.pump(end-.5,cleanup=True)
                        except Exception:break
                    if self.observe_group() is True and not self.blocked and time.monotonic()<end:self.signal(signal.SIGKILL,end)
                while time.monotonic()<end and (self.selector.get_map() or self.proc.poll() is None):
                    try:self.pump(end,cleanup=True)
                    except Exception:break
                self.proc.poll();self.row['exitCode']=self.proc.returncode
                self.row['processGroupState']='ABSENT_OBSERVED' if self.observe_group() is False else 'UNKNOWN_OR_REMAINS'
        except Exception:self.row['failureCode']=self.row['failureCode'] or 'EXECUTOR_CLEANUP_UNKNOWN'
        self.row['privateStreams']={}
        for name,item in self.streams.items():
            row={'bytes':item['stored'],'sha256':None,'eofObserved':item['eof'],'complete':False,'truncated':True if item['received']>item['stored'] else False if item['eof'] else 'UNKNOWN'}
            self.row['privateStreams'][name]=row
            try:
                self.handles[name].flush();os.fsync(self.handles[name].fileno())
                raw=bounded_owned_bytes(item['path'],STREAM_CAP,expected_length=item['stored'],expected_identity=item['identity'])
                need(sha(raw)==item['hash'].hexdigest(),'EXECUTOR_CAPTURE_READBACK')
                row['sha256']=sha(raw);row['complete']=item['eof'] and item['received']==item['stored']
            except Exception:self.row['failureCode']=self.row['failureCode'] or 'EXECUTOR_CAPTURE_READBACK_UNKNOWN'
        for handle in [self.selector,*self.pipes,*self.handles.values()]:
            try:handle.close()
            except Exception:self.row['failureCode']=self.row['failureCode'] or 'EXECUTOR_CAPTURE_CLOSE_UNKNOWN'
        self.row['eof']=len(self.streams)==2 and all(x['eof'] for x in self.streams.values())
        self.row['captureComplete']=self.row['eof'] and not self.row['overflow'] and all(x['complete'] for x in self.row['privateStreams'].values())
        return self.row

def wait_owned(path,child,end,maximum):
    while not path.exists():
        child.pump(end);need(child.proc is not None and child.proc.poll() is None,'EXECUTOR_CLI_EARLY_EXIT')
    return strict_json(bounded_owned_bytes(path,maximum))

def listener_absent(port,end):
    # One retained endpoint probe after group absence; no readiness polling.
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as sock:
        guard(end);sock.settimeout(max(.001,min(.5,end-time.monotonic())))
        return sock.connect_ex(('127.0.0.1',port)) in (61,111)

class HTTPDeadline(Stop):
    code='EXECUTOR_HTTP_TOTAL_DEADLINE'

@contextmanager
def total_http_deadline(deadline):
    # This owning main process admits one retained exchange and one-shot alarm.
    # The previous timer must be inactive; cleanup never inherits this alarm.
    old_handler=signal.getsignal(signal.SIGALRM)
    old_timer=signal.getitimer(signal.ITIMER_REAL)
    old_mask=signal.pthread_sigmask(signal.SIG_BLOCK,set())
    need(old_handler==signal.SIG_DFL and old_timer==(0.0,0.0)
         and signal.SIGALRM not in old_mask,'EXECUTOR_HTTP_TIMER_NOT_AVAILABLE')
    enabled=True;fired=False
    def expired(_signum,_frame):
        nonlocal fired
        if not enabled or fired:return
        fired=True
        raise HTTPDeadline()
    try:
        signal.signal(signal.SIGALRM,expired)
        remaining=deadline-time.monotonic()
        if remaining<=0:raise HTTPDeadline()
        signal.setitimer(signal.ITIMER_REAL,remaining,0.0)
        yield
        if time.monotonic()>=deadline:raise HTTPDeadline()
    finally:
        # A first one-shot delivery during cancellation still reaches the outer
        # restoration. Its latch cannot interrupt the restoration a second time.
        try:
            enabled=False
            signal.setitimer(signal.ITIMER_REAL,0.0,0.0)
        finally:
            enabled=False
            signal.setitimer(signal.ITIMER_REAL,0.0,0.0)
            signal.signal(signal.SIGALRM,old_handler)
            signal.setitimer(signal.ITIMER_REAL,*old_timer)

def http_deadline_contract(end):
    # One positive-case pure in-process regression; no listener/host request.
    started=time.monotonic();probe_end=min(end,started+.2)
    initial_handler=signal.getsignal(signal.SIGALRM)
    initial_timer=signal.getitimer(signal.ITIMER_REAL)
    initial_reason=FIRST_REASON
    header=b'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nConnection: close\r\n\r\n'
    need(len(header)<=128,'EXECUTOR_HTTP_CONTROL_BOUND')
    waiting=timed_out=False;left=right=response=None
    try:
        guard(probe_end)
        left,right=socket.socketpair()
        with total_http_deadline(min(probe_end,time.monotonic()+.03)):
            left.sendall(header)  # Literal complete headers; body is withheld.
            response=http.client.HTTPResponse(right)
            response.begin()
            need(response.status==200 and response.length==1,'EXECUTOR_HTTP_CONTROL_HEADER')
            waiting=True
            response.read(1)
    except HTTPDeadline:
        timed_out=True  # Only this source-owned exception is expected here.
    finally:
        if response is not None:response.close()
        if left is not None:left.close()
        if right is not None:right.close()
    need(waiting and timed_out and left is not None and right is not None
         and left.fileno()==-1 and right.fileno()==-1,'EXECUTOR_HTTP_CONTROL_TIMEOUT')
    need(signal.getsignal(signal.SIGALRM)==initial_handler and signal.getitimer(signal.ITIMER_REAL)==initial_timer
         and FIRST_REASON is initial_reason,'EXECUTOR_HTTP_CONTROL_RESTORATION')
    guard(probe_end)
    left=right=response=None;completed=False
    try:
        left,right=socket.socketpair()
        with total_http_deadline(min(probe_end,time.monotonic()+.03)):
            left.sendall(header+b'x')
            response=http.client.HTTPResponse(right)
            response.begin()
            need(response.status==200 and response.length==1,'EXECUTOR_HTTP_CONTROL_HEADER')
            need(response.read(1)==b'x' and response.isclosed(),'EXECUTOR_HTTP_CONTROL_SUCCESS')
            completed=True
    finally:
        if response is not None:response.close()
        if left is not None:left.close()
        if right is not None:right.close()
    need(completed and left is not None and right is not None and left.fileno()==-1 and right.fileno()==-1,
         'EXECUTOR_HTTP_CONTROL_SOCKET_CLEANUP')
    need(signal.getsignal(signal.SIGALRM)==initial_handler and signal.getitimer(signal.ITIMER_REAL)==initial_timer
         and FIRST_REASON is initial_reason,'EXECUTOR_HTTP_CONTROL_RESTORATION')
    guard(probe_end)

class Transport:
    def __init__(self,access,child,end,maximum):
        u=urlsplit(access['url'])
        need(u.scheme=='http' and u.hostname=='127.0.0.1' and u.port==access['port'] and u.path=='/' and u.port!=3080 and not u.fragment and not u.username,'EXECUTOR_PRIVATE_ENDPOINT')
        self.port=u.port;self.target=u.path+'?'+u.query;self.child=child;self.end=end;self.maximum=maximum;self.total=0;self.cookie=None
    def send(self,method,path,body=None,auth=True,origin=None,forged=False):
        self.child.pump(self.end);self.total+=1;need(self.total<=self.maximum,'EXECUTOR_HTTP_BOUND')
        headers={'Host':f'127.0.0.1:{self.port}','Origin':origin or f'http://127.0.0.1:{self.port}'}
        if forged:headers['Cookie']='dsh-auth-invalid=forged'
        elif auth:need(self.cookie is not None,'EXECUTOR_AUTH_ORDER');headers['Cookie']=self.cookie
        raw=None if body is None else json.dumps(body,separators=(',',':')).encode()
        need(raw is None or len(raw)<=2048,'EXECUTOR_REQUEST_BOUND')
        if raw is not None:headers['Content-Type']='application/json'
        exchange_end=min(self.end,time.monotonic()+2)
        guard(exchange_end,'EXECUTOR_HTTP_TOTAL_DEADLINE')
        connection=http.client.HTTPConnection('127.0.0.1',self.port,timeout=max(.001,exchange_end-time.monotonic()))
        try:
            # A byte limit/inactivity timeout alone cannot bound slow progress.
            # The one-shot deadline spans request, headers and complete body.
            with total_http_deadline(exchange_end):
                connection.request(method,path,body=raw,headers=headers);res=connection.getresponse()
                data=res.read(65537);need(len(data)<=65536,'EXECUTOR_RESPONSE_BOUND');status=res.status;response_headers=res.getheaders()
        except (HTTPDeadline,TimeoutError):
            # The socket timeout and process alarm share the same absolute end.
            need(False,'EXECUTOR_HTTP_TOTAL_DEADLINE')
        finally:connection.close()  # Timer/handler restored before owned cleanup.
        self.child.pump(self.end);return status,data,response_headers
    def authenticate(self):
        status,data,headers=self.send('GET',self.target,auth=False)
        need(status==303 and data==b'','EXECUTOR_AUTH_EXCHANGE')
        cookies=[v for k,v in headers if k.lower()=='set-cookie'];need(len(cookies)==1,'EXECUTOR_AUTH_COOKIE')
        self.cookie=cookies[0].split(';',1)[0]
        need(0<len(self.cookie)<=4096 and '\r' not in self.cookie and '\n' not in self.cookie,'EXECUTOR_AUTH_COOKIE')
    def rpc(self,channel,name,payload):
        rid='c1-cli-'+str(self.total+1)
        status,data,_=self.send('POST',channel+'/v1/'+name,{'type':'client-request','rpcId':rid,'method':'v1/'+name,'payload':payload})
        need(status==200,'EXECUTOR_RPC_STATUS');value=strict_json(data)
        need(set(value)=={'type','rpcId','result'} and value['type']=='server-response' and value['rpcId']==rid and value['result'].get('ok') is True and set(value['result'])=={'ok','value'},'EXECUTOR_RPC_REFUSAL')
        return value['result']['value']

def leaves(db):
    return [db,Path(str(db)+'-wal'),Path(str(db)+'-shm'),Path(str(db)+'-journal'),Path(str(db)+'.df-setup')]
def absent(paths):
    return all(not p.exists() and not p.is_symlink() for p in paths)
def setup_facts(db):
    # Exact named metadata only; no private DB/key/state/history bytes.
    rows=[]
    for path in [db,Path(str(db)+'.df-setup'),Path(str(db)+'.df-setup/key.bin'),Path(str(db)+'.df-setup/state.json')]:
        s=path.lstat();need(not path.is_symlink() and s.st_uid==os.getuid(),'EXECUTOR_SETUP_METADATA')
        rows.append((s.st_dev,s.st_ino,s.st_uid,stat.S_IMODE(s.st_mode)))
    return rows

def setup_case(case,manifest):
    cases=CAPSULE/'cases'
    if not cases.exists():private_directory(cases)
    owned_directory(cases);root=cases/case
    need(not root.exists() and not root.is_symlink(),'EXECUTOR_CASE_CONSUMED');private_directory(root)
    for name in ('home','agents','workspace','private','public'):private_directory(root/name)
    home=root/'home';private_directory(home/'profiles');private_directory(home/'profiles/web')
    profile=home/'profiles/web';private_directory(profile/'node_modules');product=profile/'node_modules/dsh-fishball';private_directory(product)
    created=set()
    for row in manifest['canonicalRecords']:
        source=contained(row['path']);need(sha(source.read_bytes())==row['sha256'],'EXECUTOR_COPY_PIN')
        target=product/row['path'];copy_parents(product,target.parent,created)
        with exclusive(target) as handle:handle.write(source.read_bytes())
        need(sha(target.read_bytes())==row['sha256'],'EXECUTOR_COPY_READBACK')
    save(profile/'package.json',{'name':'dsh-profile-web','private':True,'dependencies':{},'dsh':{'profile':{'bundles':['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}},fresh=True)
    db=profile/('df-invalid.sqlite' if case=='invalid' else 'df-data/runtime.sqlite')
    return root,profile,db

def physical_product(profile,manifest):
    product=profile/'node_modules/dsh-fishball'
    owned_directory(product)
    for row in manifest['canonicalRecords']:
        path=product/row['path'];s=owned_file(path);raw=bounded_owned_bytes(path,row['bytes'],expected_length=row['bytes'],expected_identity=(s.st_dev,s.st_ino))
        need(sha(raw)==row['sha256'],'EXECUTOR_PHYSICAL_PRODUCT_DRIFT')

READINESS_STAGES=('REP', 'ENT', 'ENA', 'FIB', 'SRV', 'PHA', 'DIS', 'INV', 'ABS', 'LAF', 'HST', 'PRT', 'ATT', 'AGR', 'SSR', 'LPR', 'AUT', 'WRT', 'PUB')

def validate_ready(value,case,boot):
    if type(value) is dict and set(value)=={'contractVersion','caseName','boot','ready','readinessStage'}:
        need(value['contractVersion']=='df.c1.cli-ready/v1' and value['caseName']==case
             and type(value['boot']) is int and value['boot']==boot and value['ready'] is False
             and type(value['readinessStage']) is str and value['readinessStage'] in READINESS_STAGES,
             'EXECUTOR_READY_FAILURE_PROTOCOL')
        need(False,'EXECUTOR_READY_STAGE_'+value['readinessStage'])
    need(set(value)=={'contractVersion','caseName','boot','ready','disabled','entryState','servicesAbsent','routesAbsent','leavesAbsent','zeroAttempts','refusalCode'},'EXECUTOR_READY_FIELDS')
    need(value['contractVersion']=='df.c1.cli-ready/v1' and value['caseName']==case and value['boot']==boot
        and value['ready'] is True and value['zeroAttempts'] is True and value['refusalCode']=='NOT_OBSERVED','EXECUTOR_OBSERVER_READY')
    need(all(type(value[k]) is bool for k in ('ready','disabled','servicesAbsent','routesAbsent','leavesAbsent','zeroAttempts')),'EXECUTOR_READY_TYPES')

def make_patch(root,profile,db,case,boot,manifest):
    patches=[{'id':x,'disabled':True} for x in manifest['disabledOriginalEntryIds']]
    patches += [{'id':'web-runtime','config':{'openBrowser':False,'printUrl':False,'surfaceContext':False,'trustedHosts':[]}},
        {'id':'credentials','config':{'path':str(root/'home/.credentials.yaml'),'dshHome':str(root/'home'),'watch':False,'debounceMs':100}},
        {'id':'session-persistence-jsonl','config':{'root':str(root/'agents/sessions'),'compression':'none'}},
        {'id':'agent-loop','config':{'agents':[],'maxParallelToolCalls':1}},
        {'id':'approval','config':{'policy':'never'}}]
    config={'databasePath':str(db),'limits':{'queueCapacity':4,'maxActive':1,'maxAttempts':1,'maxTasks':4,'maxActionsPerTask':8,'maxEventsPerTask':128,'maxMetadataBytes':4096},
        'memory':{'enabled':False},'worker':{'enabled':False},'audit':{'enabled':False},'automation':{'enabled':False},'results':{'enabled':False}}
    patches.append({'insert':[{'id':'df-c1-observer','name':str(CAPSULE/'observer.mjs'),'config':{'caseRoot':str(root),'caseName':case,'boot':boot}},
        {'id':'df-c1-installed','name':'dsh-fishball/installed','disabled':case=='disabled','inject':['dfC1Observer'],'config':config}]})
    path=profile/'cordis.patch.yml'
    if boot==1:save(path,patches,fresh=True)
    else:save(path,patches,expected_identity=identity(path))

def validate_termination(value,case,boot):
    need(set(value)=={'contractVersion','caseName','boot','observerComplete','originalDfTerminal','originalDfServicesAbsent','admissionFenced','zeroAttempts','ownedNativeChildren','refusalCode'},'EXECUTOR_TERMINATION_FIELDS')
    need(value['contractVersion']=='df.c1.cli-termination/v1' and value['caseName']==case and value['boot']==boot
        and all(value[k] is True for k in ('observerComplete','originalDfTerminal','originalDfServicesAbsent','admissionFenced','zeroAttempts')),'EXECUTOR_ORIGINAL_TEARDOWN_NOT_ESTABLISHED')
    need(value['ownedNativeChildren']==(1 if case=='positive' else 0) and value['refusalCode']=='NOT_OBSERVED','EXECUTOR_TERMINATION_COUNTS')

def enc_public(value,maximum):
    raw=(json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+'\n').encode()
    need(len(raw)<=maximum,'EXECUTOR_PUBLIC_BOUND')
    return raw

def main():
    global FIRST_REASON
    need(len(sys.argv)==3 and sys.argv[1]==PLAN_NAME and sys.argv[2] in CASES,'EXECUTOR_ARGUMENTS')
    case=sys.argv[2];seconds,boots,http_max=CASES[case]
    end=STARTED+seconds;work_end=end-10
    marker=CAPSULE/('invocation-'+case+'.json');marker_id=None;marker_owned=False
    root=child=transport=None;rows=[];done=False;total_http=0;before=after=None
    transport_accounted=False
    same_store=paused=duplicate=False;factual=[];plan_digest=None
    result={'contractVersion':'df.canonical-c1.cli-case/v1','case':case,'result':'FAILED_HOLD','failureCode':None,
        'starts':0,'httpRequests':0,'zeroAttempts':False,'pausedDurableTask':False,'duplicateIntake':False,
        'sameStoreReconciled':False,'originalTeardown':False,'listenerAbsent':False,'refusalCode':'NOT_OBSERVED',
        'sourceExpectedRefusalCode':'SETUP_UNAVAILABLE' if case=='invalid' else 'NONE','directDriverReturnRequired':True}
    try:
        need(Path.cwd()==ROOT and Path(__file__).resolve()==CAPSULE/'lifecycle-driver.py'
            and str(Path(sys.executable).resolve())==PYTHON_REAL,'EXECUTOR_IDENTITY')
        owned_directory(CAPSULE);marker_id=save(marker,{'state':'IN_PROGRESS'},fresh=True);marker_owned=True
        proposal=read_json(CAPSULE/'execution-plan.proposed.json',65536)
        manifest=read_json(CAPSULE/'source-manifest.json')
        plan_path=contained(PLAN_NAME);owned_file(plan_path);plan_raw=plan_path.read_bytes()
        need(len(plan_raw)<=65536,'EXECUTOR_PLAN_BOUND');plan=strict_json(plan_raw);plan_digest=sha(plan_raw)
        need(set(plan)==set(proposal),'EXECUTOR_PLAN_FIELDS')
        for key in proposal:
            if key not in ('pins','rootReviewedExecutionGO','rootSupportedExecutionApprovalGranted','rootReviewedFinalAffectedReports','rootFamilyDeadlineMonotonic'):
                need(plan[key]==proposal[key],'EXECUTOR_PLAN_SELECTION')
        need(all(plan[key] is True for key in ('rootReviewedExecutionGO','rootSupportedExecutionApprovalGranted','rootReviewedFinalAffectedReports')),'EXECUTOR_ROOT_GO')
        # All three case drivers consume the SAME owning controller deadline.
        family_end=plan['rootFamilyDeadlineMonotonic']
        need(type(family_end) in (int,float) and STARTED<family_end<=STARTED+180,'EXECUTOR_FAMILY_DEADLINE')
        end=min(end,family_end-10);work_end=end-10  # Original family reserve remains for root publication.
        expected={row['path']:row['sha256'] for row in manifest['inputFiles']+manifest['ownedFiles']}
        expected[NAME+'/source-manifest.json']=sha((CAPSULE/'source-manifest.json').read_bytes())
        need(set(plan['pins'])==set(expected)|set(manifest['requiredAffectedReviews'])|{manifest['actualBuildReturn']}
            and all(plan['pins'][p]==h for p,h in expected.items()),'EXECUTOR_PIN_UNION')
        for key in manifest['environmentMustBeAbsent']:need(key not in os.environ,'EXECUTOR_ENVIRONMENT')
        for row in manifest['topology']:
            path=Path(row['path']);need(path.is_symlink() and os.readlink(path)==row['target'] and str(path.resolve())==row['resolved'],'EXECUTOR_TOPOLOGY')
        before=checked_pins(plan['pins'],work_end)
        proof=read_json(contained(manifest['actualBuildReturn']))
        need(proof['schema']=='df.canonical-c1.build-actual-return/v1' and proof['result']=='PASS'
            and proof['directDriverReturn']['exitCode']==0 and proof['directDriverReturn']['outputBytes']==0
            and proof['directDriverReturn']['complete'] is True and proof['actualBuildCommands']==4,'EXECUTOR_BUILD_PROOF')
        need(len(proof['generated'])==2 and {row['path'] for row in proof['generated']}=={'lib/client.js','native-source-manifest.json'}
            and len(proof['recordPins'])==4,'EXECUTOR_BUILD_PROOF_SHAPE')
        for row in proof['generated']+proof['recordPins']+[proof['rootPlan']]:
            b=contained(row['path']).read_bytes();need((len(b),sha(b))==(row['bytes'],row['sha256']),'EXECUTOR_BUILD_PIN')
        if case=='positive':http_deadline_contract(work_end)
        root,profile,db=setup_case(case,manifest)
        root_id=identity(root);public_id=identity(root/'public');private_id=identity(root/'private')
        intake={'taskId':'c1-cli-task','provider':'synthetic-local','source':'c1-cli','eventId':'c1-cli-event-1',
            'commandRef':sha(b'c1-cli-intake'),'goal':'Synthetic paused CLI lifecycle task.'}
        persisted=facts=None
        for boot in range(1,boots+1):
            guard(work_end);checked_pins(plan['pins'],work_end)
            need(sha(plan_path.read_bytes())==plan_digest,'EXECUTOR_PLAN_DRIFT')
            physical_product(profile,manifest)
            make_patch(root,profile,db,case,boot,manifest)
            transport=None;transport_accounted=False
            env={'PATH':'/usr/bin:/bin','HOME':str(root/'home'),'DSH_HOME':str(root/'home'),
                'DSH_AGENTS_HOME':str(root/'agents'),'XDG_CONFIG_HOME':str(root/'home'),
                'DSH_TELEMETRY_DISABLED':'1','LANG':'C','LC_ALL':'C'}
            argv=[NODE,str(CLI),'--profile','web','--host','127.0.0.1','--port','0','--no-open']
            child=Child(argv,root/'workspace',env,root/'private',boot,end-2)
            need(child.proc is not None and child.row['failureCode'] is None,'EXECUTOR_CLI_SPAWN')
            ready=wait_owned(root/f'private/ready-{boot}.json',child,min(work_end,time.monotonic()+15),4096)
            validate_ready(ready,case,boot)
            access=wait_owned(root/f'private/access-{boot}.json',child,work_end,8192)
            need(set(access)=={'url','port'} and type(access['url']) is str and type(access['port']) is int,'EXECUTOR_ACCESS_FIELDS')
            rpc_end=min(work_end,time.monotonic()+20) if case=='positive' else work_end
            transport=Transport(access,child,rpc_end,20 if case=='positive' and boot==1 else 12 if case=='positive' else 8)
            if case!='positive':
                need(ready['servicesAbsent'] and ready['leavesAbsent']
                    and ready['disabled']==(case=='disabled') and ready['entryState']==('ABSENT' if case=='disabled' else 3),'EXECUTOR_NEGATIVE_ORIGINAL_ENTRY')
                need(absent(leaves(db)),'EXECUTOR_NEGATIVE_LEAVES')
            transport.authenticate()
            if case=='positive':
                for forged in (False,True):
                    need(transport.send('POST','/df-setup/v1/status',{},auth=False,forged=forged)[0]==401,'EXECUTOR_UNAUTHENTICATED_ADMISSION')
                need(transport.send('POST','/df-setup/v1/status',{},origin='http://foreign.invalid')[0]==403,'EXECUTOR_FOREIGN_ORIGIN')
                setup=transport.rpc('/df-setup','status',{})
                need(setup['phase']==('setup_required' if boot==1 else 'ready') and setup['storage']['location']==str(db),'EXECUTOR_SETUP_PHASE')
                if boot==1:
                    need(setup['executionEnabled'] is False and absent(leaves(db)),'EXECUTOR_BEFORE_CONSENT')
                    preview=transport.rpc('/df-setup','prepare',{})
                    need(absent(leaves(db)),'EXECUTOR_PREVIEW_NO_WRITES')
                    confirmed=transport.rpc('/df-setup','confirm',{'previewRef':preview['previewRef'],'planDigest':preview['planDigest'],'accept':True})
                    need(confirmed['phase']=='ready','EXECUTOR_SETUP_CONFIRM')
                    need(transport.rpc('/df-setup','status',{})['phase']=='ready','EXECUTOR_SETUP_READY')
                    facts=setup_facts(db);need(transport.rpc('/df-rpc','list',{})==[],'EXECUTOR_INITIAL_TASKS')
                    first=transport.rpc('/df-rpc','intake',intake)
                    need(first['deduplicated'] is False,'EXECUTOR_FIRST_INTAKE');task=first['task']
                    repeat=transport.rpc('/df-rpc','intake',intake)
                    need(repeat['deduplicated'] is True and repeat['task']==task,'EXECUTOR_DUPLICATE_INTAKE');duplicate=True
                    control=transport.rpc('/df-rpc','control',{'taskRef':task['taskRef'],'kind':'pause','commandRef':sha(b'c1-cli-pause'),
                        'expectedTaskVersion':task['version'],'expectedAuthEpoch':task['authEpoch']})
                    need(control['workers']==[],'EXECUTOR_PAUSE_WORKERS')
                    status=transport.rpc('/df-rpc','status',{'taskRef':task['taskRef']})
                    need(status['control']=='paused' and all(status[key]==[] for key in ('workers','executions','artifacts','actions')),'EXECUTOR_PAUSED_STATE')
                    persisted=status['task'];paused=True
                    listing=transport.rpc('/df-rpc','list',{})
                    need(len(listing)==1 and listing[0]['taskRef']==task['taskRef'],'EXECUTOR_SINGLE_TASK')
                else:
                    need(setup_facts(db)==facts,'EXECUTOR_SAME_STORE_METADATA')
                    listing=transport.rpc('/df-rpc','list',{})
                    need(len(listing)==1 and listing[0]==persisted,'EXECUTOR_RESTART_TASK')
                    status=transport.rpc('/df-rpc','status',{'taskRef':persisted['taskRef']})
                    need(status['task']==persisted and status['control']=='paused'
                        and all(status[key]==[] for key in ('workers','executions','artifacts','actions')),'EXECUTOR_RECONCILED_NO_REPLAY')
                    repeat=transport.rpc('/df-rpc','intake',intake)
                    need(repeat['deduplicated'] is True and repeat['task']==persisted,'EXECUTOR_RESTART_DEDUP');same_store=True
            else:
                for channel in ('/df-setup','/df-rpc'):
                    need(transport.send('POST',channel+'/v1/status',{})[0]==405,'EXECUTOR_NEGATIVE_NATIVE_FALLBACK')
                need(absent(leaves(db)),'EXECUTOR_NEGATIVE_NO_WRITES')
            total_http+=transport.total;transport_accounted=True;need(total_http<=http_max,'EXECUTOR_CASE_HTTP_BOUND')
            transport.cookie=None;del access
            child.stop(min(end-2,time.monotonic()+8))
            termination=wait_owned(root/f'private/termination-{boot}.json',child,end-2,4096)
            validate_termination(termination,case,boot)
            need(listener_absent(transport.port,end-2),'EXECUTOR_LISTENER_NOT_ABSENT')
            row=child.finish(end-2);rows.append(row);child=None
            need(row['exitCode']==0 and row['captureComplete'] and row['processGroupState']=='ABSENT_OBSERVED'
                and not row['forcedCleanup'] and row['failureCode'] is None,'EXECUTOR_ORIGINAL_RETURN_NOT_ESTABLISHED')
            factual.append(True)
        physical_product(profile,manifest)
        after=checked_pins(plan['pins'],end-2)
        need(sha(plan_path.read_bytes())==plan_digest,'EXECUTOR_PLAN_DRIFT');done=True
    except Exception:
        FIRST_REASON=FIRST_REASON or 'EXECUTOR_CLI_GATE_FAILED';done=False
    finally:
        if transport is not None and not transport_accounted:total_http+=transport.total
        if child is not None:rows.append(child.finish(end-2));done=False
        try:
            guard(end,cleanup=True)
            if root is not None:
                owned_directory(root);owned_directory(root/'public');owned_directory(root/'private')
                need(identity(root)==root_id and identity(root/'public')==public_id and identity(root/'private')==private_id,'EXECUTOR_CASE_REPLACED')
                result.update({'result':'PASS' if done and not STOP_REQUESTED else 'FAILED_HOLD','failureCode':FIRST_REASON,
                    'starts':sum('childPid' in row for row in rows),'httpRequests':total_http,'zeroAttempts':done,'pausedDurableTask':paused,
                    'duplicateIntake':duplicate,'sameStoreReconciled':same_store,
                    'originalTeardown':bool(factual) and len(factual)==boots,'listenerAbsent':bool(factual) and len(factual)==boots,
                    'durationSeconds':round(time.monotonic()-STARTED,6)})
                enc_public(result,4096);save(root/'public/case-result.json',result,fresh=True)
                commands={'commands':rows,'rawDecodedOrCopied':False};enc_public(commands,16384)
                save(root/'public/command-results.json',commands,fresh=True)
                boundary={'before':before,'after':after};enc_public(boundary,4096)
                save(root/'public/before-after.json',boundary,fresh=True)
            else:done=False
            if marker_owned:save(marker,{'state':'PASS' if done and not STOP_REQUESTED else 'FAILED_HOLD','failureCode':FIRST_REASON},expected_identity=marker_id)
            guard(end);done=done and not STOP_REQUESTED
        except Exception:done=False
    return 0 if done and not STOP_REQUESTED and time.monotonic()<end else 1

if __name__=='__main__':
    signal.signal(signal.SIGTERM,latch_interruption);signal.signal(signal.SIGINT,latch_interruption)
    try: terminal_code=main()
    except BaseException: terminal_code=1
    sys.exit(terminal_code)


