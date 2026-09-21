"""Read channel daily Analytics metrics using the existing protected OAuth connection."""
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
import argparse
import json
import requests
import connect as auth
import publish

BASE = Path(__file__).resolve().parent
ANALYTICS = 'https://www.googleapis.com/auth/yt-analytics.readonly'
READONLY = 'https://www.googleapis.com/auth/youtube.readonly'
REQUIRED = {auth.SCOPE, ANALYTICS, READONLY}


def current_channel(access):
    response = requests.get('https://www.googleapis.com/youtube/v3/channels',
                            params={'part': 'snippet', 'mine': 'true'},
                            headers={'Authorization': 'Bearer ' + access}, timeout=30, allow_redirects=False)
    if response.status_code != 200:
        raise RuntimeError('channel_read_failed')
    channels = response.json().get('items', [])
    if len(channels) != 1:
        raise RuntimeError('channel_selection_unverified')
    return channels[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--end', type=date.fromisoformat)
    parser.add_argument('--days', type=int, default=7)
    args = parser.parse_args()
    if not 1 <= args.days <= 366:
        raise RuntimeError('invalid_date_range')
    kst = timezone(timedelta(hours=9))
    end = args.end or (datetime.now(kst).date() - timedelta(days=1))
    start = end - timedelta(days=args.days-1)
    access = publish.load_credentials()
    channel = current_channel(access)
    stored = json.loads(auth.protect(auth.TOKEN.read_bytes(), decrypt=True))
    if not REQUIRED.issubset(stored.get('scope', '').split()):
        config = json.loads(auth.CLIENT.read_text(encoding='utf-8'))['installed']
        # Preserve the previous token until both permission and channel identity are verified.
        scopes = sorted(REQUIRED | set(stored.get('scope', '').split()))
        extended = auth.authorize(config, scopes=scopes, save=False)
        checked = current_channel(extended['access_token'])
        if checked['id'] != channel['id']:
            raise RuntimeError('authorized_channel_changed_old_credentials_preserved')
        if not extended.get('refresh_token'):
            raise RuntimeError('refresh_token_missing_old_credentials_preserved')
        auth.save_token(extended)
        access = extended['access_token']
        auth.report(status='analytics_read_permission_granted', existing_channel_preserved=True)
    query = {'ids': 'channel==MINE', 'startDate': start.isoformat(), 'endDate': end.isoformat(),
             'metrics': 'views,estimatedMinutesWatched', 'dimensions': 'day', 'sort': 'day'}
    response = requests.get('https://youtubeanalytics.googleapis.com/v2/reports', params=query,
                            headers={'Authorization': 'Bearer '+access}, timeout=45, allow_redirects=False)
    if response.status_code != 200:
        body = response.json()
        reasons = [item.get('reason') for item in body.get('error', {}).get('errors', [])]
        auth.report(success=False, phase='analytics_query', http_status=response.status_code,
                    reasons=[r for r in reasons if r in {'accessNotConfigured', 'forbidden', 'insufficientPermissions',
                                                        'quotaExceeded', 'dailyLimitExceeded'}])
        raise RuntimeError('analytics_query_failed')
    raw = response.json()
    names = [header['name'] for header in raw.get('columnHeaders', [])]
    if not {'day', 'views', 'estimatedMinutesWatched'}.issubset(names):
        raise RuntimeError('unexpected_report_columns')
    rows = [dict(zip(names, row)) for row in raw.get('rows', [])]
    by_day = {row['day']: row for row in rows}
    days = [(start+timedelta(days=n)).isoformat() for n in range(args.days)]
    report_dir = BASE / 'analytics'
    report_dir.mkdir(exist_ok=True)
    today = datetime.now(kst).strftime('%Y%m%d')
    number = 1
    while (report_dir/f'analytics-{today}-{number}.md').exists():
        number += 1
    record = report_dir/f'analytics-{today}-{number}.md'
    lines = ['# YouTube 최근 일별 성과', '',
             '- 조회 시각: '+datetime.now(kst).isoformat(),
             '- 채널: '+channel['snippet']['title'],
             '- 채널 URL: https://www.youtube.com/channel/'+channel['id'],
             '- 요청 기간: '+start.isoformat()+' ~ '+end.isoformat(),
             '- 날짜 집계: YouTube Analytics API의 미국 태평양 시간 기준',
             '- 지표: views (조회수), estimatedMinutesWatched (추정 시청 시간, 분)',
             '- 누락된 날짜는 0으로 채우지 않고 API 미제공으로 표시함', '',
             '| 날짜 | 조회수 | 시청 시간(분) | 시청 시간(시간) |',
             '| --- | ---: | ---: | ---: |']
    for day in days:
        row = by_day.get(day)
        if row is None:
            lines.append(f'| {day} | 미제공 | 미제공 | 미제공 |')
        else:
            minutes = float(row['estimatedMinutesWatched'])
            lines.append(f"| {day} | {row['views']} | {minutes:g} | {minutes/60:.3f} |")
    if rows:
        views = sum(int(row['views']) for row in rows)
        minutes = sum(float(row['estimatedMinutesWatched']) for row in rows)
        lines += ['', f'- 반환된 날짜 합계: 조회수 {views}회, 추정 시청 시간 {minutes:g}분 ({minutes/60:.3f}시간).']
    else:
        lines += ['', '요청은 성공했지만 일별 데이터가 반환되지 않았다. 미집계 또는 데이터가 없는 경우를 구분할 수 없어 0으로 단정하지 않는다.']
    lines += ['', '최신 날짜는 처리 지연으로 반환되지 않을 수 있다.',
              '공식 문서: https://developers.google.com/youtube/analytics/reference/reports/query', '']
    with record.open('x', encoding='utf-8') as stream:
        stream.write('\n'.join(lines))
    (auth.PRIVATE/(record.stem+'.json')).write_text(json.dumps({'query':query,'response':raw},ensure_ascii=False,indent=2),encoding='utf-8')
    auth.report(success=True, channel_name=channel['snippet']['title'], start_date=start.isoformat(),
                end_date=end.isoformat(), returned_rows=rows, missing_dates=[day for day in days if day not in by_day],
                record=str(record.relative_to(BASE)), report_timezone='America/Los_Angeles')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        allowed = {'channel_read_failed', 'channel_selection_unverified', 'invalid_date_range',
                   'authorized_channel_changed_old_credentials_preserved', 'refresh_token_missing_old_credentials_preserved',
                   'analytics_query_failed', 'unexpected_report_columns', 'youtube_permission_not_granted',
                   'consent_denied', 'consent_timeout', 'token_exchange_failed'}
        reason = str(error) if isinstance(error, RuntimeError) and str(error) in allowed else 'analytics_connection_failed'
        auth.report(success=False, reason=reason)
        raise SystemExit(1)
