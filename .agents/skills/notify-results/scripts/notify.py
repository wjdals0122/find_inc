#!/usr/bin/env python3
"""Render completion payloads; send Kakao/Slack using proxy-injected HTTP secrets."""
import argparse
import html
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

SKILLS = {'brand', 'product', 'competitor', 'customer', 'marketing-brief', 'strategy-dashboard'}


def read_result(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('skill') not in SKILLS or data.get('status') != 'success':
        raise ValueError('Only verified successful strategy results may be sent')
    for key, limit in [('run_id', 120), ('title', 120)]:
        if not isinstance(data.get(key), str) or not 0 < len(data[key]) <= limit:
            raise ValueError('Invalid ' + key)
    points = data.get('highlights')
    if not isinstance(points, list) or not 1 <= len(points) <= 3:
        raise ValueError('Provide one to three highlights')
    if any(not isinstance(p, str) or not 0 < len(p) <= 160 for p in points):
        raise ValueError('Keep each highlight within 160 characters')
    artifacts = data.get('artifacts', [])
    if not isinstance(artifacts, list) or len(artifacts) > 5:
        raise ValueError('Provide at most five artifact links')
    for item in artifacts:
        url = urllib.parse.urlsplit(item['url'])
        if (url.scheme != 'https' or not url.hostname or url.username or url.password
                or url.query or url.fragment):
            raise ValueError('Use durable HTTPS artifact links without credentials or query strings')
        if not isinstance(item.get('name'), str) or not 0 < len(item['name']) <= 80:
            raise ValueError('Invalid artifact name')
    note = data.get('note', '')
    if not isinstance(note, str) or len(note) > 160:
        raise ValueError('Keep the limitation note within 160 characters')
    return data


def render(data, channel):
    title = data['title']
    lines = [title, '', *['- ' + p for p in data['highlights']]]
    if data.get('note'):
        lines += ['', '확인할 점: ' + data['note']]
    lines += ['', *[a['name'] + ': ' + a['url'] for a in data.get('artifacts', [])]]
    text = '\n'.join(lines).strip()
    if channel == 'email':
        escape = html.escape
        body = '<h2>' + escape(title) + '</h2><ul>'
        body += ''.join('<li>' + escape(p) + '</li>' for p in data['highlights']) + '</ul>'
        body += ''.join('<p><a href="' + escape(a['url'], quote=True) + '">' + escape(a['name']) + '</a></p>' for a in data.get('artifacts', []))
        if data.get('note'):
            body += '<p>확인할 점: ' + escape(data['note']) + '</p>'
        return {'channel': 'email', 'subject': title, 'html': body, 'text': text,
                'idempotencyKey': 'strategy/' + data['run_id'] + '/email',
                'metadata': {'skill': data['skill'], 'run_id': data['run_id']}}
    if channel == 'slack':
        elements = [{'type': 'rich_text_section', 'elements': [{'type': 'text', 'text': p}]} for p in data['highlights']]
        if data.get('note'):
            elements.append({'type': 'rich_text_section', 'elements': [{'type': 'text', 'text': '확인할 점: ' + data['note']}]})
        elements += [{'type': 'rich_text_section', 'elements': [{'type': 'link', 'url': a['url'], 'text': a['name']}]} for a in data.get('artifacts', [])]
        return {'text': text, 'blocks': [
            {'type': 'header', 'text': {'type': 'plain_text', 'text': title}},
            {'type': 'rich_text', 'elements': [{'type': 'rich_text_list', 'style': 'bullet', 'elements': elements}]},
            {'type': 'divider'}], 'unfurl_links': False, 'unfurl_media': False}
    # Kakao's text template accepts at most 200 characters; reserve links for the button.
    short = '\n'.join([title, *data['highlights'], *(['확인: ' + data['note']] if data.get('note') else [])])
    if len(short) > 200:
        raise ValueError('Shorten the title and highlights to fit Kakao text within 200 characters')
    if not data.get('artifacts'):
        raise ValueError('Kakao requires a verified result URL for its template link')
    url = data['artifacts'][0]['url']
    return {'object_type': 'text', 'text': short, 'link': {'web_url': url, 'mobile_web_url': url}, 'button_title': '산출물 보기'}


def secret(primary, alias):
    value = os.environ.get(primary) or os.environ.get(alias)
    if not value:
        raise ValueError('Missing HTTP secret binding: ' + primary)
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send(channel, payload):
    headers = {'Content-Type': 'application/json; charset=utf-8'}
    if channel == 'kakao':
        url = 'https://kapi.kakao.com/v2/api/talk/memo/default/send'
        headers = {'Content-Type': 'application/x-www-form-urlencoded',
                   'Authorization': 'Bearer ' + secret('KAKAO_ACCESS_TOKEN', 'KAKAO')}
        body = urllib.parse.urlencode({'template_object': json.dumps(payload, ensure_ascii=False)}).encode()
    elif channel == 'slack':
        path = secret('SLACK_WEBHOOK_PATH', 'SLACK')
        # Never accept a user-supplied destination host or leak credentials via redirects.
        if not re.fullmatch(r'/services/[A-Za-z0-9_./-]+', path) or '..' in path:
            raise ValueError('SLACK_WEBHOOK_PATH must be a /services/... path; check HTTP secret URL-path injection support')
        url = 'https://hooks.slack.com' + path
        body = json.dumps(payload, ensure_ascii=False).encode()
    else:
        raise ValueError('Email must be sent through the SenderKit plugin')
    request = urllib.request.Request(url, data=body, headers=headers, method='POST')
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=20) as response:
            result = response.read(8192).decode('utf-8')
            if channel == 'kakao' and json.loads(result).get('result_code') != 0:
                return {'channel': channel, 'status': 'failed', 'reason': 'provider_rejected'}
            if channel == 'slack' and result.strip() != 'ok':
                return {'channel': channel, 'status': 'failed', 'reason': 'provider_rejected'}
        return {'channel': channel, 'status': 'accepted'}
    except urllib.error.HTTPError as error:
        return {'channel': channel, 'status': 'failed', 'http_status': error.code}
    except (urllib.error.URLError, TimeoutError, OSError):
        return {'channel': channel, 'status': 'unknown', 'reason': 'transport_error_do_not_retry_blindly'}
    except (ValueError, UnicodeError):
        return {'channel': channel, 'status': 'unknown', 'reason': 'invalid_provider_response'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--payload-file', required=True)
    parser.add_argument('--channel', required=True, choices=['kakao', 'slack', 'email'])
    parser.add_argument('--send', action='store_true', help='Send Kakao/Slack; otherwise render only')
    args = parser.parse_args()
    try:
        payload = render(read_result(args.payload_file), args.channel)
        result = send(args.channel, payload) if args.send else payload
        print(json.dumps(result, ensure_ascii=False))
        return int(args.send and result['status'] != 'accepted')
    except Exception:
        # Exception strings and request URLs may contain injected credentials.
        print(json.dumps({'channel': args.channel, 'status': 'failed', 'reason': 'invalid_input_or_configuration'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
