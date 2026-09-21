"""Reuse the landing-page connection and prepare deduplicated Supabase SQL."""
from datetime import date
from decimal import Decimal
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    process = subprocess.run([sys.executable, str(ROOT / '03-operation/channels/landing-page/search_console.py'),
                              *sys.argv[1:]], capture_output=True, text=True, encoding='utf-8')
    if '--help' in sys.argv[1:] or '-h' in sys.argv[1:]:
        print(process.stdout, end='')
        return process.returncode
    messages = [json.loads(line) for line in process.stdout.splitlines() if line.strip()]
    if process.returncode or not messages or messages[-1].get('success') is not True:
        print(json.dumps({'success': False, 'reason': 'search_console_collection_failed'}))
        return 1
    result = messages[-1]
    start, end = date.fromisoformat(result['start_date']), date.fromisoformat(result['end_date'])
    values, seen = [], set()
    for row in result['rows']:
        day = date.fromisoformat(row['keys'][0])
        if not start <= day <= end or day in seen:
            raise ValueError('invalid_report_dates')
        seen.add(day)
        for metric in ('impressions', 'clicks'):
            number = Decimal(str(row[metric]))
            if not number.is_finite() or number < 0 or number != number.to_integral_value():
                raise ValueError('invalid_count')
            values.append('(' + ','.join([literal('google-search'), literal(result['landing_page']),
                          literal(str(day))+'::date', literal(metric), str(number)]) + ')')
    result['sql'] = None
    if values:
        result['sql'] = '''BEGIN;
LOCK TABLE public.channel_metrics IN SHARE ROW EXCLUSIVE MODE;
WITH incoming(channel,account_id,metric_date,metric_name,metric_value) AS (VALUES
''' + ',\n'.join(values) + ''')
INSERT INTO public.channel_metrics(channel,account_id,metric_date,metric_name,metric_value)
SELECT i.* FROM incoming i WHERE NOT EXISTS (
 SELECT 1 FROM public.channel_metrics m WHERE m.channel=i.channel
 AND m.account_id=i.account_id AND m.metric_date=i.metric_date AND m.metric_name=i.metric_name
) RETURNING metric_date,metric_name,metric_value;
COMMIT;'''
    result['timezone'] = 'America/Los_Angeles'
    result['channel'] = 'google-search'
    result['account_id'] = result['landing_page']
    target = Path(__file__).parent / 'latest.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('{"success": false, "reason": "collection_failed_no_credentials_printed"}')
        sys.exit(1)
