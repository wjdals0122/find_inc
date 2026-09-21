"""Read Search Console performance with a private copy of the existing OAuth client."""
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from urllib.parse import quote, urlsplit
import argparse
import json
import sys
import time
import requests

BASE = Path(__file__).resolve().parent
YOUTUBE = BASE.parent / 'youtube'
sys.path.insert(0, str(YOUTUBE))
import connect as auth

SOURCE_CLIENT = YOUTUBE / '.private/client_secret.json'
SOURCE_TOKEN = YOUTUBE / '.private/token.dpapi'
auth.PRIVATE = BASE / '.private'
auth.CLIENT = auth.PRIVATE / 'client_secret.json'
auth.TOKEN = auth.PRIVATE / 'token.dpapi'
SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
LANDING = 'https://find-inc.web.app/'


def get_session():
    auth.secure_directory()
    if not auth.CLIENT.exists():
        auth.CLIENT.write_bytes(SOURCE_CLIENT.read_bytes())
    if auth.CLIENT.read_bytes() != SOURCE_CLIENT.read_bytes():
        raise RuntimeError('existing_client_differs_preserved')
    if not auth.TOKEN.exists() and SOURCE_TOKEN.exists():
        auth.TOKEN.write_bytes(SOURCE_TOKEN.read_bytes())
    auth.secure_directory()
    config = json.loads(auth.CLIENT.read_text(encoding='utf-8'))['installed']
    data = json.loads(auth.protect(auth.TOKEN.read_bytes(), decrypt=True)) if auth.TOKEN.exists() else {}
    if SCOPE not in data.get('scope', '').split():
        extended = auth.authorize(config, scopes=[SCOPE], save=False)
        if not extended.get('refresh_token'):
            raise RuntimeError('refresh_token_missing')
        auth.save_token(extended)
        data = extended
    elif data.get('expires_at', 0) <= time.time() + 60:
        if not data.get('refresh_token'):
            raise RuntimeError('oauth_reconnection_required')
        data.update(auth.exchange({'client_id':config['client_id'], 'client_secret':config['client_secret'],
                                   'refresh_token':data['refresh_token'], 'grant_type':'refresh_token'}))
        auth.save_token(data)
    session = requests.Session()
    session.headers['Authorization'] = 'Bearer ' + data['access_token']
    return session


def checked(response, phase):
    try:
        data = response.json()
    except ValueError:
        raise RuntimeError('unexpected_api_response') from None
    if response.status_code != 200:
        error = data.get('error', {})
        safe = {'accessNotConfigured','forbidden','insufficientPermissions','quotaExceeded',
                'dailyLimitExceeded','SERVICE_DISABLED','ACCESS_TOKEN_SCOPE_INSUFFICIENT'}
        reasons = [item.get('reason') for item in error.get('errors', [])]
        reasons += [item.get('reason') for item in error.get('details', [])]
        auth.report(success=False, phase=phase, http_status=response.status_code,
                    reasons=sorted({r for r in reasons if r in safe}))
        raise RuntimeError('search_console_api_failed')
    return data


def select_property(entries):
    candidates=[]
    host=urlsplit(LANDING).hostname
    for entry in entries:
        site=entry.get('siteUrl','')
        if entry.get('permissionLevel') not in {'siteOwner','siteFullUser','siteRestrictedUser'}:
            continue
        if site==LANDING:
            candidates.append((3,len(site),site))
        elif site.startswith('sc-domain:') and host==site[len('sc-domain:'):]:
            candidates.append((2,len(site),site))
        elif site.startswith('https://') and LANDING.startswith(site):
            candidates.append((1,len(site),site))
    if not candidates:
        raise RuntimeError('landing_property_access_not_found')
    return max(candidates)[2]


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--end',type=date.fromisoformat)
    parser.add_argument('--days',type=int,default=7)
    args=parser.parse_args()
    if not 1<=args.days<=366:
        raise RuntimeError('invalid_date_range')
    kst=timezone(timedelta(hours=9))
    end=args.end or datetime.now(kst).date()-timedelta(days=1)
    start=end-timedelta(days=args.days-1)
    session=get_session()
    properties=checked(session.get('https://www.googleapis.com/webmasters/v3/sites',timeout=30,
                                    allow_redirects=False),'list_properties')
    property_url=select_property(properties.get('siteEntry',[]))
    query={'startDate':start.isoformat(),'endDate':end.isoformat(),'dimensions':['date'],
           'type':'web','dataState':'all','rowLimit':1000,
           'dimensionFilterGroups':[{'filters':[{'dimension':'page','operator':'equals','expression':LANDING}]}]}
    endpoint='https://www.googleapis.com/webmasters/v3/sites/'+quote(property_url,safe='')+'/searchAnalytics/query'
    raw=checked(session.post(endpoint,json=query,timeout=45,allow_redirects=False),'query_performance')
    rows=sorted(raw.get('rows',[]),key=lambda r:r['keys'][0])
    by_day={row['keys'][0]:row for row in rows}
    incomplete=raw.get('metadata',{}).get('first_incomplete_date')
    days=[(start+timedelta(days=i)).isoformat() for i in range(args.days)]
    folder=BASE/'analytics';folder.mkdir(exist_ok=True)
    today=datetime.now(kst).strftime('%Y%m%d');n=1
    while (folder/f'search-console-{today}-{n}.md').exists():n+=1
    record=folder/f'search-console-{today}-{n}.md'
    lines=['# Google Search Console 일별 검색 성과', '',
           '- 조회 시각: '+datetime.now(kst).isoformat(),'- 대상 페이지: '+LANDING,
           '- Search Console 속성: '+property_url,'- 요청 기간: '+start.isoformat()+' ~ '+end.isoformat(),
           '- 날짜 집계: 미국 태평양 시간 (Search Console API 기준)',
           '- 검색 유형: web','- 데이터 상태: all (최신 미확정 데이터 포함)',
           '- 인증: YouTube OAuth 클라이언트의 별도 로컬 복사본과 Search Console 읽기 권한', '',
           '| 날짜 | 노출수 | 클릭수 | 데이터 상태 |','| --- | ---: | ---: | --- |']
    for day in days:
        row=by_day.get(day)
        if row is None:
            lines.append(f'| {day} | 미제공 | 미제공 | API 행 없음 |')
        else:
            state='미확정' if incomplete and day>=incomplete else '미확정 표시 없음'
            lines.append(f"| {day} | {row['impressions']:g} | {row['clicks']:g} | {state} |")
    if rows:
        lines+=['',f"- 반환된 날짜 합계: 노출 {sum(r['impressions'] for r in rows):g}회, 클릭 {sum(r['clicks'] for r in rows):g}회."]
    else:
        lines+=['','API 요청은 성공했지만 해당 페이지의 일별 데이터가 반환되지 않았다. 검색 성과가 없거나 아직 처리되지 않은 경우를 구분할 수 없어 실제 수치를 0으로 단정하지 않는다.']
    lines+=['','인증 정보와 토큰은 이 보고서에 포함하지 않는다.',
            '공식 문서: https://developers.google.com/webmaster-tools/v1/searchanalytics/query','']
    with record.open('x',encoding='utf-8') as stream:stream.write('\n'.join(lines))
    (auth.PRIVATE/(record.stem+'.json')).write_text(json.dumps({'property':property_url,'query':query,'response':raw},ensure_ascii=False,indent=2),encoding='utf-8')
    auth.report(success=True, landing_page=LANDING, property_url=property_url,start_date=start.isoformat(),
                end_date=end.isoformat(), rows=rows, first_incomplete_date=incomplete,
                missing_dates=[day for day in days if day not in by_day],record=str(record.relative_to(BASE)))


if __name__=='__main__':
    try:main()
    except Exception as error:
        allowed={'existing_client_differs_preserved','refresh_token_missing','oauth_reconnection_required',
                 'unexpected_api_response','search_console_api_failed','landing_property_access_not_found',
                 'invalid_date_range','youtube_permission_not_granted','consent_denied','consent_timeout',
                 'token_exchange_failed'}
        reason=str(error) if isinstance(error,RuntimeError) and str(error) in allowed else 'search_console_connection_failed'
        auth.report(success=False,reason=reason)
        raise SystemExit(1)
