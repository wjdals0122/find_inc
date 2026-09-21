"""Authenticated localhost adapter for the official Happier Cloud CLI.

All CLI processes use argv arrays, native Codex auth and the existing project.
Session creation is durable/idempotent. A timeout is an unknown outcome, never
permission to blindly spawn another session.
"""
from datetime import datetime, timezone
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import tomllib
import uuid

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / '.private/happier-dashboard'
CLI = Path.home() / '.happier/bin/happier.exe'
CLOUD = 'https://api.happier.dev'
LOCK = threading.RLock()
ACTIVE = set()
CHECK_LOCK = threading.Lock()
CHECK_CACHE = None
TERMINAL = {'completed', 'failed'}


def now():
    return datetime.now(timezone.utc).isoformat()


class RunnerError(Exception):
    pass


def cli(args, timeout=25):
    try:
        p = subprocess.run([str(CLI), '--server', 'cloud', *args], cwd=ROOT,
                           capture_output=True, text=True, encoding='utf-8', errors='replace',
                           timeout=timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except subprocess.TimeoutExpired:
        raise RunnerError('command_timeout') from None
    except OSError:
        raise RunnerError('cli_unavailable') from None
    for line in [p.stdout.strip(), *reversed(p.stdout.splitlines())]:
        try:
            data = json.loads(line)
        except ValueError:
            continue
        if isinstance(data, dict):
            if data.get('ok') is False:
                raise RunnerError('happier_' + str(data.get('error', {}).get('code', 'request_failed')))
            if p.returncode:
                raise RunnerError('happier_request_failed')
            return data
    raise RunnerError('invalid_cli_response')


def connection(force=False):
    global CHECK_CACHE
    with CHECK_LOCK:
        if not force and CHECK_CACHE and time.monotonic() - CHECK_CACHE[0] < 15:
            return CHECK_CACHE[1]
        try:
            d = cli(['doctor', 'repair', '--report-only', '--json'], timeout=40)
            runtime = d.get('daemonStatus', {})
            auth, daemon, convergence = (runtime.get(k, {}) for k in ['auth', 'daemon', 'runtimeConvergence'])
            profile = next((p for p in d.get('report', {}).get('authProfiles', []) if p.get('serverUrl') == CLOUD and p.get('isActive')), {})
            checks = {
                'cloud': runtime.get('server', {}).get('serverUrl') == CLOUD and profile.get('reachability') == 'verified',
                'authenticated': auth.get('authenticated') is True and auth.get('credentialState') == 'valid',
                'registered': auth.get('machineRegistered') is True and bool(auth.get('machineId')),
                'daemonReady': daemon.get('running') is True and convergence.get('controlReachable') is True
                    and convergence.get('machineIdMatches') is True and convergence.get('cliVersionMatches') is True,
            }
            codex = shutil.which('codex')
            if codex:
                p = subprocess.run([codex, 'login', 'status'], capture_output=True, text=True, timeout=8,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                checks['codex'] = p.returncode == 0 and 'ChatGPT' in (p.stdout + p.stderr)
            else:
                checks['codex'] = False
            result = {'ready': all(checks.values()), 'checks': checks, 'checkedAt': now(),
                      'machineId': auth.get('machineId'), 'machine': os.environ.get('COMPUTERNAME', 'Local computer'),
                      'cloud': 'https://cloud.happier.dev', 'version': d.get('report', {}).get('currentCli', {}).get('version')}
        except (RunnerError, subprocess.TimeoutExpired):
            result = {'ready': False, 'checks': {}, 'checkedAt': now(), 'error': 'connection_check_failed'}
        CHECK_CACHE = time.monotonic(), result
        return result


LABELS = {'brand':'브랜드 조사','product':'상품 조사','competitor':'경쟁 분석','customer':'고객 조사',
          'marketing-brief':'마케팅 브리프','strategy-dashboard':'전략 대시보드','competitive-ads-extractor':'경쟁 광고 분석',
          'crawler':'자료 수집','natural-korean':'한국어 글 교정','product-shot':'제품 연출 컷',
          'product-shot-grid':'제품 컷 그리드','product-shot-reference':'연출 레퍼런스 컷','channel-metrics':'채널 성과 통합',
          'youtube-metrics':'YouTube 성과','google-search-metrics':'검색 성과','youtube-publish':'YouTube 발행',
          'youtube-reply':'YouTube 댓글 답글','customer-needs':'고객 니즈','purchase-concerns':'구매 우려',
          'use-context':'사용 상황','user-experience':'사용 경험','remember':'프로젝트 규칙 기록','watch':'영상 분석'}


def skills():
    items = []
    for path in sorted((ROOT / '.agents/skills').rglob('SKILL.md')):
        if not path.resolve().is_relative_to((ROOT / '.agents/skills').resolve()):
            continue
        text = path.read_text(encoding='utf-8-sig')
        name = re.search(r'^name:\s*["\']?([a-z0-9-]+)', text, re.M)
        if not name or name[1] == 'team-lead':
            continue
        description = re.search(r'^description:\s*(.+)', text, re.M)
        items.append({'id':name[1], 'label':LABELS.get(name[1], name[1]),
                      'description':description[1].strip('"\'') if description else '',
                      'path':path.relative_to(ROOT).as_posix()})
    return items


def models():
    # This is the account/runtime cache maintained by Codex; no model names are invented.
    home = Path(os.environ.get('CODEX_HOME', str(Path.home()/'.codex')))
    try:
        raw = json.loads((home/'models_cache.json').read_text(encoding='utf-8'))
        return [{'id':m['slug'], 'label':m.get('display_name',m['slug']),
                 'efforts':[x['effort'] for x in m.get('supported_reasoning_levels',[])],
                 'defaultEffort':m.get('default_reasoning_level','medium')}
                for m in raw['models'] if m.get('visibility') == 'list']
    except (OSError, ValueError, KeyError):
        return []


@contextmanager
def database():
    STATE.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(STATE/'runs.sqlite', timeout=10)
    try:
        db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL)')
        yield db
        db.commit()
    finally:
        db.close()


def defaults():
    try:
        home=Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex')))
        config=tomllib.loads((home/'config.toml').read_text(encoding='utf-8'))
        return {'model':config.get('model'),'effort':config.get('model_reasoning_effort')}
    except (OSError,ValueError):return {}


def save(run):
    with LOCK, database() as db:
        db.execute('INSERT OR REPLACE INTO runs VALUES (?,?,?)', (run['id'],run['owner'],json.dumps(run,ensure_ascii=False)))


def get(run_id, owner):
    with LOCK, database() as db:
        row = db.execute('SELECT payload FROM runs WHERE id=? AND owner=?',(run_id,owner)).fetchone()
    if not row:
        raise RunnerError('run_not_found')
    return json.loads(row[0])


def history(owner):
    with LOCK, database() as db:
        return [public(json.loads(r[0])) for r in db.execute('SELECT payload FROM runs WHERE owner=? ORDER BY rowid DESC LIMIT 100',(owner,))]


def public(run):
    return {k:v for k,v in run.items() if k not in {'owner','prompt','dashboardHash','attempts'}}


def fingerprint():
    return hashlib.sha256((ROOT/'dashboard/dashboard.html').read_bytes()).hexdigest()


def create(owner, body):
    try:
        run_id = str(uuid.UUID(body.get('requestId','')))
    except (ValueError, AttributeError):
        raise RunnerError('invalid_request_id')
    with LOCK:
        try:
            old = get(run_id, owner)
            if any(old[k] != body.get(k) for k in ['skill','model','effort','instruction','apply']):
                raise RunnerError('request_id_conflict')
            return public(old)
        except RunnerError as e:
            if str(e) != 'run_not_found':raise
        catalog = {s['id']:s for s in skills()}
        model = next((m for m in models() if m['id'] == body.get('model')),None)
        if body.get('skill') not in catalog or not model or body.get('effort') not in model['efforts']:
            raise RunnerError('invalid_selection')
        instruction = body.get('instruction','')
        if not isinstance(instruction,str) or not 1 <= len(instruction.strip()) <= 8000 or type(body.get('apply')) is not bool:
            raise RunnerError('invalid_instruction')
        run = {'id':run_id,'owner':owner, 'skill':body['skill'], 'label':catalog[body['skill']]['label'],
               'model':model['id'],'effort':body['effort'],'instruction':instruction,'apply':body['apply'],
               'state':'checking','createdAt':now(),'updatedAt':now(),'sessionId':None,
               'result':'','progress':'기기 등록과 daemon 준비 상태 확인 중','attempts':0,'dashboardHash':fingerprint()}
        run['prompt'] = (
            f"프로젝트: {ROOT}\n프로젝트 AGENTS.md와 {catalog[body['skill']]['path']}를 읽고 ${body['skill']} 스킬을 적용하세요.\n"
            f"사용자 요청:\n{instruction}\n\n기존 ChatGPT 인증과 프로젝트 스킬을 유지하고 인증 정보는 출력하지 마세요. "
            "필요한 사용자 확인과 외부 작업의 승인 범위는 해당 스킬에 따라 처리하세요. "
            "작업 결과의 파일 경로와 성공·실패·확인 필요 사항을 마지막 응답에 명시하세요.\n"
            + ("산출물이 대시보드 자료에 영향을 주면 strategy-dashboard 스킬로 기존 디자인·로그인·자료·스킬 실행 UI를 보존하며 반영하세요. "
               "필요한 경우 기존 Firebase Hosting find-inc에 hosting만 배포하고 실제 배포 결과를 확인하세요. "
               "이번 localhost 프리뷰 UI 자체를 임의로 제거하지 마세요.\n" if body['apply'] else
               "이번 실행에서는 대시보드 재생성·배포를 수행하지 마세요.\n"))
        save(run)
        launch(run_id,owner)
        return public(run)


def launch(run_id,owner):
    with LOCK:
        if run_id in ACTIVE:return
        ACTIVE.add(run_id)
    threading.Thread(target=worker,args=(run_id,owner),daemon=True).start()


def reconcile(run):
    # Resolve our exact durable tag through official CLI. It also recovers sessions
    # created after the CLI timed out; never scan or display unrelated transcripts.
    try:
        response = cli(['session','status','dashboard-'+run['id'],'--json'],timeout=18)
        session = response.get('data',{}).get('session',{})
        if session.get('id') and session.get('machineId') == run.get('machineId') and Path(session.get('path','')).resolve() == ROOT:
            return session['id']
    except RunnerError:
        pass
    return None


def worker(run_id,owner):
    try:
        run = get(run_id,owner)
        if run.get('sessionId'):
            monitor(run)
            return
        status = connection(force=True)
        if not status['ready']:
            run.update(state='failed',progress='Happier 연결 확인 실패. 연결 상태를 다시 확인해주세요.',error='connection_not_ready',updatedAt=now())
            save(run);return
        run['machineId'] = status['machineId']
        # Every resumed create checks for the already-created session first.
        if run['attempts']:
            session_id = reconcile(run)
            if session_id:
                run.update(sessionId=session_id,state='running',progress='기존 세션을 찾아 연결했습니다.',updatedAt=now())
                save(run);monitor(run);return
        run.update(state='creating',progress='Happier Cloud에 Codex 세션 생성 요청 중',updatedAt=now())
        save(run)
        args=['session','create','--backend','codex','--path',str(ROOT),'--machine-id',run['machineId'],
              '--auth','native','--codex-backend-mode','appServer','--permission-mode','default',
              '--model',run['model'],'--reasoning-effort',run['effort'],'--title',run['label']+' · Dashboard',
              '--tag','dashboard-'+run_id,'--spawn-attempt-id',run_id,'--prompt',run['prompt'],'--json']
        if run['attempts']:args.append('--resume-spawn-attempt')
        run['attempts']+=1;save(run)
        try:
            reply=cli(args,timeout=90)
            d=reply.get('data',{})
            session_id=d.get('sessionId') or d.get('session',{}).get('id') or reply.get('sessionId')
            if not session_id:
                raise RunnerError('session_id_missing')
        except RunnerError:
            session_id=reconcile(run)
            if not session_id:
                run.update(state='uncertain',progress='세션 생성 결과를 확인할 수 없습니다. 기존 세션 확인 후 같은 요청으로 재개하세요.',error='creation_unconfirmed',updatedAt=now())
                save(run);return
        run.update(sessionId=session_id,state='running',progress='Codex 실행 중',updatedAt=now())
        run.pop('error',None);save(run);monitor(run)
    except Exception:
        try:
            run=get(run_id,owner)
            run.update(state='uncertain' if not run.get('sessionId') else 'disconnected',
                       progress='진행 상태를 확인하지 못했습니다. Happier 세션에서 상태를 확인할 수 있습니다.',updatedAt=now())
            save(run)
        except Exception:pass
    finally:
        with LOCK:ACTIVE.discard(run_id)


def content_events(messages):
    result='';ready=False;failure=False;progress='Codex 실행 중'
    for m in messages:
        content=m.get('raw',{}).get('content',{})
        kind=content.get('type');d=content.get('data',{})
        if not isinstance(d,dict):continue
        if kind=='acp' and d.get('type')=='message' and isinstance(d.get('message'),str):
            result=d['message'];ready=False
        if kind=='event' and d.get('type') in {'ready','task_complete','turn_complete'}:
            ready=True
        if d.get('type') in {'turn_aborted','task_failed','error'}:
            failure=True
        if d.get('type') in {'tool-call','tool_call','tool-call-result'}:
            progress='도구 실행 및 산출물 생성 중'
    return result,ready,failure,progress


def monitor(run):
    misses=0
    # Session lifetime is not inferred from daemon ports, active flags, or silence.
    # Completed requires a final agent response AND a ready/turn-complete event.
    for _ in range(1440):
        try:
            status=cli(['session','status',run['sessionId'],'--live','--json'],timeout=18).get('data',{})
            raw=cli(['session','history',run['sessionId'],'--format','raw','--include-meta','--limit','80','--json'],timeout=18)
            result,ready,failed,progress=content_events(raw.get('data',{}).get('messages',[]))
            misses=0
            pending=status.get('agentState',{}).get('pendingRequestsCount',0)
            run.update(updatedAt=now(),progress='Happier에서 사용자 승인이 필요합니다.' if pending else progress)
            run['state']='awaiting_approval' if pending else 'running'
            if result:run['result']=result[-50000:]
            if failed:run.update(state='failed',progress='Codex가 오류 또는 중단을 보고했습니다.')
            elif ready and result and not pending:
                run.update(state='completed',progress='Codex 응답 완료',finishedAt=now(),
                           dashboardChanged=fingerprint()!=run['dashboardHash'])
            save(run)
            if run['state'] in TERMINAL:return
        except RunnerError:
            misses+=1
            if misses>=3:
                run.update(state='disconnected',progress='세션 진행 조회가 중단되었습니다. 같은 세션으로 다시 연결하세요.',updatedAt=now())
                save(run);return
        time.sleep(4)
    run.update(state='disconnected',progress='장시간 실행의 추적을 일시 중단했습니다. 기존 세션으로 다시 연결하세요.',updatedAt=now())
    save(run)


def retry(owner, run_id):
    with LOCK:
        run=get(run_id,owner)
        if run['state'] in TERMINAL:return public(run)
        if run_id not in ACTIVE:
            # Same spawn-attempt identity; never generate a new request ID here.
            launch(run_id,owner)
        return public(run)
