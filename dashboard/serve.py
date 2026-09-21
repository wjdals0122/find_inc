"""Loopback preview with Firebase-authenticated, read-only metrics endpoint.

SUPABASE_SERVICE_ROLE_KEY enables live DB reads. Without it, reads a private
snapshot exported by the Supabase plugin, labelled explicitly in the response.
"""
import argparse
from datetime import date, datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import threading
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen
import skill_runner

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
SNAPSHOT = ROOT / '.private/operation-metrics.json'
SUPABASE = 'https://jktfoktelryczucpzvcu.supabase.co'
FIREBASE_KEY = re.search(r"apiKey:\s*'([^']+)'", (BASE/'auth-session.js').read_text(encoding='utf-8'))[1]
CSRF = secrets.token_urlsafe(32)
OWNER_LOCK = threading.Lock()


def read_json(url, *, headers=None, body=None):
    request = Request(url, data=json.dumps(body).encode() if body is not None else None,
                      headers={**(headers or {}), **({'Content-Type':'application/json'} if body is not None else {})})
    with urlopen(request, timeout=20) as response:
        return json.load(response)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Do not log tokens, query strings, upstream response bodies.

    def reply(self, status, body):
        output = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(output)))
        self.end_headers()
        self.wfile.write(output)

    def local_request(self):
        host=self.headers.get('Host','')
        if host.split(':')[0] not in {'127.0.0.1','localhost'}:
            return False
        origin=self.headers.get('Origin')
        if origin and origin != 'http://'+host:
            return False
        return self.headers.get('Sec-Fetch-Site') not in {'cross-site','same-site'}

    def identity(self):
        auth=self.headers.get('Authorization','')
        if not auth.startswith('Bearer ') or len(auth)>20000:
            raise ValueError('authentication_required')
        user=read_json('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+FIREBASE_KEY,
                       body={'idToken':auth[7:]})
        found=user.get('users',[])
        if not found or found[0].get('disabled') or not found[0].get('localId'):
            raise ValueError('authentication_required')
        return found[0]['localId']

    def skills_api(self, url, body=None):
        if not self.local_request():return self.reply(403,{'error':'origin_denied'})
        try:owner=self.identity()
        except Exception:return self.reply(401,{'error':'authentication_required'})
        # This localhost bridge is owned by the first signed-in local dashboard
        # account. It cannot be used by every publicly registered Firebase user.
        with OWNER_LOCK:
            path=skill_runner.STATE/'owner.json'
            skill_runner.STATE.mkdir(parents=True,exist_ok=True)
            if not path.exists():
                with path.open('x',encoding='utf-8') as stream:json.dump({'uid':owner},stream)
            allowed=json.loads(path.read_text(encoding='utf-8'))['uid']
        if owner!=allowed:return self.reply(403,{'error':'owner_required'})
        if body is not None and not secrets.compare_digest(self.headers.get('X-Skill-CSRF',''),CSRF):
            return self.reply(403,{'error':'csrf_required'})
        route=url.path.removeprefix('/api/skills/')
        try:
            if body is None:
                if route=='bootstrap':return self.reply(200,{'skills':skill_runner.skills(),'models':skill_runner.models(),'defaults':skill_runner.defaults(),'csrf':CSRF,'project':str(ROOT)})
                if route=='connection':return self.reply(200,skill_runner.connection())
                if route=='history':return self.reply(200,{'runs':skill_runner.history(owner)})
                if route.startswith('runs/'):
                    run=skill_runner.get(route[5:],owner)
                    return self.reply(200,skill_runner.public(run))
            else:
                if route=='runs':return self.reply(202,skill_runner.create(owner,body))
                if route.startswith('retry/'):
                    return self.reply(202,skill_runner.retry(owner,route[6:]))
        except skill_runner.RunnerError as error:
            return self.reply(400,{'error':str(error)})
        except Exception:
            return self.reply(500,{'error':'skill_request_failed'})
        return self.reply(404,{'error':'not_found'})

    def do_GET(self):
        if self.headers.get('Host','').split(':')[0] not in {'127.0.0.1','localhost'}:
            return self.reply(403, {'error':'invalid_host'})
        url = urlsplit(self.path)
        if url.path.startswith('/api/skills/'):
            return self.skills_api(url)
        if url.path == '/api/health':
            return self.reply(200, {'status':'ok'})
        if url.path == '/api/channel-metrics':
            auth = self.headers.get('Authorization','')
            if not auth.startswith('Bearer ') or len(auth)>20000:
                return self.reply(401, {'error':'authentication_required'})
            try:
                user = read_json('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+FIREBASE_KEY,
                                 body={'idToken':auth[7:]})
                if not user.get('users') or user['users'][0].get('disabled'):
                    return self.reply(401, {'error':'authentication_required'})
            except Exception:
                return self.reply(401, {'error':'authentication_required'})
            try:
                query=parse_qs(url.query)
                start=date.fromisoformat(query['start'][0]); end=date.fromisoformat(query['end'][0])
                if not 0 <= (end-start).days <= 365:
                    raise ValueError()
            except (KeyError, ValueError):
                return self.reply(400, {'error':'invalid_period'})
            try:
                key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
                if key:
                    rows=[]; offset=0
                    while True:
                        params=urlencode([('select','channel,account_id,metric_date,metric_name,metric_value,collected_at'),
                                          ('metric_date','gte.'+str(start)),('metric_date','lte.'+str(end)),
                                          ('order','metric_date.asc,id.asc'),('offset',str(offset)),('limit','1000')])
                        page=read_json(SUPABASE+'/rest/v1/channel_metrics?'+params,
                                       headers={'apikey':key,'Authorization':'Bearer '+key})
                        if not isinstance(page,list):raise ValueError()
                        rows.extend(page)
                        if len(page)<1000:break
                        offset+=len(page)
                    payload={'rows':rows,'mode':'live'}
                else:
                    payload=json.loads(SNAPSHOT.read_text(encoding='utf-8'))
                    payload['rows']=[r for r in payload['rows'] if str(start)<=r['metric_date']<=str(end)]
                    payload['mode']='snapshot'
                payload['fetched_at']=datetime.now(timezone.utc).isoformat()
                return self.reply(200,payload)
            except Exception:
                return self.reply(502, {'error':'metrics_unavailable'})
        # Serve only dashboard assets. Never expose the repository or private state.
        name=url.path.removeprefix('/dashboard/') if url.path.startswith('/dashboard/') else url.path[1:]
        if not name:name='dashboard.html'
        target=(BASE/name).resolve()
        if (not target.is_relative_to(BASE) or any(p.startswith('.') for p in Path(name).parts)
            or target.suffix.lower() not in {'.html','.js','.css','.png','.svg','.ico','.webp','.woff','.woff2'}
            or any(p in {'tests','tools'} for p in Path(name).parts) or not target.is_file()):
            return self.reply(404, {'error':'not_found'})
        self.path='/'+name
        super().do_GET()

    def do_HEAD(self):
        self.reply(405, {'error':'method_not_allowed'})

    def do_POST(self):
        url=urlsplit(self.path)
        if not url.path.startswith('/api/skills/'):
            return self.reply(404,{'error':'not_found'})
        if not self.local_request():return self.reply(403,{'error':'origin_denied'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=40000:raise ValueError()
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict):raise ValueError()
        except (ValueError,TypeError):return self.reply(400,{'error':'invalid_json'})
        self.skills_api(url,body)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8000)
    args=parser.parse_args()
    print(f'Local: http://127.0.0.1:{args.port}/dashboard.html',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(BASE))).serve_forever()
