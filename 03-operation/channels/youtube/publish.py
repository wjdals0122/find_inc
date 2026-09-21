"""Upload an approved local publish record. Never print OAuth or session secrets."""
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone, timedelta
import requests
import connect as auth

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
EXPECTED_CHANNEL = 'UC4mosYdnj9qwBjSgU8zev3w'


def check_draft(record):
    text = record.read_text(encoding='utf-8')
    if '승인 상태: 승인 (공개 업로드)' not in text or '공개 범위: 공개 (`public`)' not in text:
        raise RuntimeError('public_upload_approval_missing')
    blocks = re.findall(r'```text\n(.*?)\n```', text, re.S)
    if len(blocks) != 2 or not 0 < len(blocks[0]) <= 100 or not 0 < len(blocks[1]) <= 5000:
        raise RuntimeError('invalid_title_or_description')
    source = re.search(r'^- 파일: \[.*?\]\((.*?)\)$', text, re.M)
    expected = re.search(r'SHA-256: `([a-f0-9]{64})`', text)
    if not source or not expected:
        raise RuntimeError('source_identity_missing')
    video = (record.parent / source[1]).resolve()
    if not video.is_relative_to(ROOT / '02-contents') or not video.is_file():
        raise RuntimeError('source_video_missing')
    with video.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != expected[1]:
        raise RuntimeError('source_video_changed')
    if EXPECTED_CHANNEL not in text:
        raise RuntimeError('unexpected_destination_channel')
    body = {'snippet': {'title': blocks[0], 'description': blocks[1], 'categoryId': '2',
                        'defaultLanguage': 'ko'},
            'status': {'privacyStatus': 'public', 'selfDeclaredMadeForKids': False,
                       'containsSyntheticMedia': True}}
    return video, digest, body


def load_credentials():
    auth.secure_directory()
    data = json.loads(auth.protect(auth.TOKEN.read_bytes(), decrypt=True))
    if auth.SCOPE not in data.get('scope', '').split():
        raise RuntimeError('upload_permission_missing')
    if data.get('expires_at', 0) <= time.time() + 90:
        config = json.loads(auth.CLIENT.read_text(encoding='utf-8'))['installed']
        if not data.get('refresh_token'):
            raise RuntimeError('oauth_reconnection_required')
        data.update(auth.exchange({'client_id': config['client_id'], 'client_secret': config['client_secret'],
                                   'refresh_token': data['refresh_token'], 'grant_type': 'refresh_token'}))
        auth.save_token(data)
    return data['access_token']


def save_state(path, state):
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(auth.protect(json.dumps(state).encode()))
    temporary.replace(path)


def api_error(response, phase):
    reasons = []
    try:
        for item in response.json().get('error', {}).get('errors', []):
            reason = item.get('reason', '')
            if re.fullmatch(r'[A-Za-z0-9_-]{1,80}', reason):
                reasons.append(reason)
    except (ValueError, AttributeError, TypeError):
        pass
    auth.report(success=False, phase=phase, http_status=response.status_code, reasons=reasons)
    raise RuntimeError('youtube_api_request_failed')


def record_status(record, item):
    text = record.read_text(encoding='utf-8')
    status = item.get('status', {})
    processing = item.get('processingDetails', {}).get('processingStatus', 'unknown')
    privacy = status.get('privacyStatus', 'unknown')
    now = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M:%S')
    complete = status.get('uploadStatus') == 'processed' and processing == 'succeeded' and privacy == 'public'
    summary = '공개 업로드 및 처리 완료' if complete else '업로드 접수됨; 공개·처리 상태 확인 중'
    replacements = {
        '상태': summary,
        '업로드 상태': status.get('uploadStatus', 'unknown'),
        '영상 ID': item['id'],
        '영상 링크': 'https://www.youtube.com/watch?v=' + item['id'],
        '업로드 완료 시각': now + ' (한국 시간, 업로드 결과 확인)',
        'API에서 확인한 공개 범위': privacy,
        '처리 상태': processing,
    }
    for label, value in replacements.items():
        text = re.sub(r'^- ' + re.escape(label) + r': .*$', '- ' + label + ': ' + value,
                      text, count=1, flags=re.M)
    record.write_text(text, encoding='utf-8')
    return complete


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--record', type=Path, required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    record = args.record.resolve()
    if record.parent != BASE:
        raise RuntimeError('record_outside_channel_folder')
    video, digest, body = check_draft(record)
    binding = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    if not args.execute:
        auth.report(dry_run=True, source_hash_verified=True, requested_privacy='public',
                    title=body['snippet']['title'], bytes=video.stat().st_size)
        return
    session = requests.Session()
    session.headers['Authorization'] = 'Bearer ' + load_credentials()
    result = session.get('https://www.googleapis.com/youtube/v3/channels',
                         params={'mine': 'true', 'part': 'snippet'}, timeout=30, allow_redirects=False)
    if result.status_code != 200:
        api_error(result, 'destination_channel_check')
    channels = result.json().get('items', [])
    if len(channels) != 1 or channels[0]['id'] != EXPECTED_CHANNEL:
        raise RuntimeError('destination_channel_mismatch')
    state_path = auth.PRIVATE / (record.stem + '.upload.dpapi')
    state = json.loads(auth.protect(state_path.read_bytes(), decrypt=True)) if state_path.exists() else {}
    if state and (state.get('sha256') != digest or state.get('metadata_sha256') != binding):
        raise RuntimeError('existing_upload_differs')
    size = video.stat().st_size
    if not state:
        started = session.post('https://www.googleapis.com/upload/youtube/v3/videos',
                               params={'uploadType': 'resumable', 'part': 'snippet,status',
                                       'notifySubscribers': 'false'}, json=body,
                               headers={'X-Upload-Content-Type': 'video/mp4',
                                        'X-Upload-Content-Length': str(size)},
                               timeout=60, allow_redirects=False)
        if started.status_code not in (200, 201):
            api_error(started, 'upload_initiation')
        location = started.headers.get('Location', '')
        parsed = urlsplit(location)
        if parsed.scheme != 'https' or parsed.hostname != 'www.googleapis.com':
            raise RuntimeError('unexpected_upload_host')
        state = {'sha256': digest, 'metadata_sha256': binding, 'session_url': location}
        save_state(state_path, state)
        offset = 0
        auth.report(status='upload_session_ready', channel_name=channels[0]['snippet']['title'])
    elif not state.get('video_id'):
        resumed = session.put(state['session_url'], data=b'',
                              headers={'Content-Range': f'bytes */{size}'}, timeout=60, allow_redirects=False)
        if resumed.status_code in (200, 201):
            state['video_id'] = resumed.json()['id']
            save_state(state_path, state)
        elif resumed.status_code == 308:
            last = re.search(r'bytes=0-(\d+)', resumed.headers.get('Range', ''))
            offset = int(last[1]) + 1 if last else 0
        else:
            api_error(resumed, 'resume_status')
    if not state.get('video_id'):
        with video.open('rb') as stream:
            stream.seek(offset)
            uploaded = session.put(state['session_url'], data=stream,
                                   headers={'Content-Type': 'video/mp4', 'Content-Length': str(size-offset),
                                            'Content-Range': f'bytes {offset}-{size-1}/{size}'},
                                   timeout=(30, 180), allow_redirects=False)
        if uploaded.status_code not in (200, 201):
            api_error(uploaded, 'upload_transfer')
        item = uploaded.json()
        state['video_id'] = item['id']
        save_state(state_path, state)
        record_status(record, item)
        auth.report(status='video_uploaded', video_url='https://www.youtube.com/watch?v=' + item['id'])
    for attempt in range(24):
        checked = session.get('https://www.googleapis.com/youtube/v3/videos',
                              params={'id': state['video_id'], 'part': 'snippet,status,processingDetails'},
                              timeout=30, allow_redirects=False)
        if checked.status_code != 200:
            api_error(checked, 'verify_uploaded_video')
        items = checked.json().get('items', [])
        if not items or items[0].get('snippet', {}).get('channelId') != EXPECTED_CHANNEL:
            raise RuntimeError('uploaded_video_verification_failed')
        item = items[0]
        complete = record_status(record, item)
        status = item.get('status', {})
        processing = item.get('processingDetails', {}).get('processingStatus', 'unknown')
        if complete or status.get('uploadStatus') in ('failed', 'rejected', 'deleted') or processing in ('failed', 'terminated'):
            break
        if attempt < 23:
            time.sleep(5)
    auth.report(success=complete, video_url='https://www.youtube.com/watch?v=' + state['video_id'],
                privacy=status.get('privacyStatus'), upload_status=status.get('uploadStatus'),
                processing_status=processing, title=item['snippet']['title'],
                metadata_matches_approval=item['snippet']['title'] == body['snippet']['title']
                and item['snippet']['description'] == body['snippet']['description'])


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        allowed = {'public_upload_approval_missing', 'invalid_title_or_description', 'source_identity_missing',
                   'source_video_missing', 'source_video_changed', 'unexpected_destination_channel',
                   'upload_permission_missing', 'oauth_reconnection_required', 'youtube_api_request_failed',
                   'record_outside_channel_folder', 'destination_channel_mismatch', 'existing_upload_differs',
                   'unexpected_upload_host', 'uploaded_video_verification_failed'}
        label = str(error) if isinstance(error, RuntimeError) and str(error) in allowed else 'upload_interrupted_check_saved_session'
        auth.report(success=False, reason=label)
        raise SystemExit(1)
