"""Collect daily metrics with existing OAuth; emit SQL for the Supabase plugin.

No Supabase credentials are needed. Run the generated SQL using execute_sql.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
import sys
import requests

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '03-operation/channels/youtube'))
import analytics
import publish


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--end', type=date.fromisoformat)
    parser.add_argument('--days', type=int, default=7)
    args = parser.parse_args()
    if not 1 <= args.days <= 366:
        raise RuntimeError('invalid_date_range')
    end = args.end or (datetime.now(timezone(timedelta(hours=9))).date() - timedelta(days=1))
    start = end - timedelta(days=args.days - 1)
    access = publish.load_credentials()
    channel = analytics.current_channel(access)
    if channel['id'] != publish.EXPECTED_CHANNEL:
        raise RuntimeError('unexpected_channel')
    response = requests.get('https://youtubeanalytics.googleapis.com/v2/reports',
        params={'ids': 'channel==MINE', 'startDate': start.isoformat(), 'endDate': end.isoformat(),
                'metrics': 'views,estimatedMinutesWatched', 'dimensions': 'day', 'sort': 'day'},
        headers={'Authorization': 'Bearer ' + access}, timeout=45, allow_redirects=False)
    if response.status_code != 200:
        raise RuntimeError('analytics_http_' + str(response.status_code))
    body = response.json()
    names = [col['name'] for col in body.get('columnHeaders', [])]
    if not {'day', 'views', 'estimatedMinutesWatched'}.issubset(names):
        raise RuntimeError('unexpected_columns')
    rows = [dict(zip(names, row)) for row in body.get('rows', [])]
    seen = set()
    values = []
    for row in rows:
        day = date.fromisoformat(row['day'])
        if not start <= day <= end or day in seen:
            raise RuntimeError('invalid_report_dates')
        seen.add(day)
        for metric in ('views', 'estimatedMinutesWatched'):
            value = Decimal(str(row[metric]))
            if not value.is_finite() or value < 0:
                raise RuntimeError('invalid_metric')
            values.append('(' + ','.join([literal('youtube'), literal(channel['id']),
                          literal(day.isoformat())+'::date', literal(metric), str(value)]) + ')')
    sql = None
    if values:
        sql = '''BEGIN;
LOCK TABLE public.channel_metrics IN SHARE ROW EXCLUSIVE MODE;
WITH incoming(channel,account_id,metric_date,metric_name,metric_value) AS (VALUES
''' + ',\n'.join(values) + ''')
INSERT INTO public.channel_metrics(channel,account_id,metric_date,metric_name,metric_value)
SELECT i.* FROM incoming i WHERE NOT EXISTS (
 SELECT 1 FROM public.channel_metrics m WHERE m.channel=i.channel
 AND m.account_id=i.account_id AND m.metric_date=i.metric_date AND m.metric_name=i.metric_name
);
COMMIT;'''
    result = {'channel_id': channel['id'], 'channel_name': channel['snippet']['title'],
              'start_date': str(start), 'end_date': str(end), 'timezone': 'America/Los_Angeles',
              'watch_time_unit': 'minutes', 'rows': rows,
              'missing_dates': [str(start+timedelta(days=i)) for i in range(args.days)
                                if start+timedelta(days=i) not in seen], 'sql': sql}
    target = Path(__file__).parent / 'latest.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"success": false, "reason": "collection_failed_no_credentials_printed"}')
        sys.exit(1)
