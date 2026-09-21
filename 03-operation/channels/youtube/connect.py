"""Local desktop OAuth; output only connection status and channel information."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlencode, urlsplit, parse_qs
import argparse
import base64
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
import secrets
import subprocess
import time
import webbrowser
import requests

PRIVATE = Path(__file__).resolve().parent / '.private'
CLIENT = PRIVATE / 'client_secret.json'
TOKEN = PRIVATE / 'token.dpapi'
SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'


def report(**data):
    print(json.dumps(data, ensure_ascii=True), flush=True)


def secure_directory():
    if os.name != 'nt':
        raise RuntimeError('windows_required')
    PRIVATE.mkdir(exist_ok=True)
    sid = subprocess.run(['whoami', '/user', '/fo', 'csv', '/nh'], capture_output=True,
                         text=True, check=True).stdout.strip().split(',')[-1].strip('"')
    result = subprocess.run(['icacls', str(PRIVATE), '/inheritance:r', '/grant:r',
                             f'*{sid}:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '/Q'], capture_output=True)
    if result.returncode:
        raise RuntimeError('permissions_failed')
    # Files need explicit non-inheritable grants. Do not recursively strip
    # inherited file access while only granting inheritable directory rights.
    for file in PRIVATE.iterdir():
        if file.is_file():
            result = subprocess.run(['icacls', str(file), '/inheritance:r', '/grant:r',
                                     f'*{sid}:F', '*S-1-5-18:F', '/Q'], capture_output=True)
            if result.returncode:
                raise RuntimeError('permissions_failed')


class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def protect(value, decrypt=False):
    raw = ctypes.create_string_buffer(value)
    incoming = Blob(len(value), ctypes.cast(raw, ctypes.POINTER(ctypes.c_ubyte)))
    outgoing = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    if decrypt:
        ok = crypt.CryptUnprotectData(ctypes.byref(incoming), None, None, None, None, 1, ctypes.byref(outgoing))
    else:
        ok = crypt.CryptProtectData(ctypes.byref(incoming), 'YouTube OAuth', None, None, None, 1, ctypes.byref(outgoing))
    if not ok:
        raise RuntimeError('encryption_failed')
    try:
        return ctypes.string_at(outgoing.data, outgoing.size)
    finally:
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree(ctypes.cast(outgoing.data, ctypes.c_void_p))


def save_token(data):
    temporary = TOKEN.with_suffix('.tmp')
    temporary.write_bytes(protect(json.dumps(data).encode()))
    temporary.replace(TOKEN)


def exchange(payload):
    response = requests.post('https://oauth2.googleapis.com/token', data=payload,
                             timeout=30, allow_redirects=False)
    data = response.json()
    if response.status_code != 200 or not isinstance(data, dict) or not data.get('access_token'):
        raise RuntimeError('token_exchange_failed')
    data['expires_at'] = time.time() + int(data.get('expires_in', 3600))
    return data


def authorize(config, scopes=None, save=True):
    requested_scopes = list(dict.fromkeys(scopes or [SCOPE]))
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    state = secrets.token_urlsafe(32)
    callback = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Callback URLs contain authorization codes. Never log them.

        def reply(self, status, body):
            self.send_response(status)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.end_headers()
            self.wfile.write(body.encode())

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == '/start':
                self.send_response(302)
                self.send_header('Location', auth_url)
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                return
            if url.path != '/callback':
                self.reply(404, 'Not found')
                return
            values = parse_qs(url.query)
            if not secrets.compare_digest(values.get('state', [''])[0], state):
                self.reply(400, 'Authorization state mismatch. Close this tab.')
                return
            if values.get('error'):
                callback['denied'] = True
                self.reply(400, 'YouTube authorization was not completed. Close this tab.')
            elif values.get('code'):
                callback['code'] = values['code'][0]
                self.reply(200, '<!doctype html><meta charset="utf-8"><title>YouTube 연결</title>'
                           '<h1>Google 인증 응답을 받았습니다.</h1><p>채널 연결을 확인하고 있습니다. 채팅으로 돌아가주세요.</p>'
                           '<script>history.replaceState(null,"","/complete");</script>')
            else:
                self.reply(400, 'Missing authorization code.')

    server = HTTPServer(('127.0.0.1', 0), Handler)
    server.timeout = 1
    redirect = f'http://127.0.0.1:{server.server_port}/callback'
    auth_url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode({
        'client_id': config['client_id'], 'redirect_uri': redirect, 'response_type': 'code',
        'scope': ' '.join(requested_scopes), 'state': state, 'code_challenge': challenge,
        'code_challenge_method': 'S256', 'access_type': 'offline', 'prompt': 'consent select_account'})
    # This loopback link contains no credential values.
    local = f'http://127.0.0.1:{server.server_port}/start'
    report(status='awaiting_google_consent', local_authorization_page=local)
    webbrowser.open(local)
    deadline = time.monotonic() + 1200
    try:
        while not callback and time.monotonic() < deadline:
            server.handle_request()
    finally:
        server.server_close()
    if callback.get('denied'):
        raise RuntimeError('consent_denied')
    if not callback.get('code'):
        raise RuntimeError('consent_timeout')
    data = exchange({'client_id': config['client_id'], 'client_secret': config['client_secret'],
                     'code': callback.pop('code'), 'code_verifier': verifier,
                     'redirect_uri': redirect, 'grant_type': 'authorization_code'})
    if not set(requested_scopes).issubset(data.get('scope', '').split()):
        raise RuntimeError('youtube_permission_not_granted')
    if save:
        save_token(data)
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--client-json', type=Path)
    args = parser.parse_args()
    secure_directory()
    if args.client_json:
        incoming = json.loads(args.client_json.read_text(encoding='utf-8-sig'))
        config = incoming.get('installed', {})
        if (not config.get('client_id') or not config.get('client_secret')
                or config.get('auth_uri') != 'https://accounts.google.com/o/oauth2/auth'
                or config.get('token_uri') != 'https://oauth2.googleapis.com/token'):
            raise RuntimeError('expected_google_desktop_client')
        if CLIENT.exists() and CLIENT.read_text(encoding='utf-8') != json.dumps(incoming) and TOKEN.exists():
            raise RuntimeError('existing_client_differs')
        CLIENT.write_text(json.dumps(incoming), encoding='utf-8')
    config = json.loads(CLIENT.read_text(encoding='utf-8'))['installed']
    data = None
    if TOKEN.exists():
        try:
            data = json.loads(protect(TOKEN.read_bytes(), decrypt=True))
            if SCOPE not in data.get('scope', '').split():
                data = None
            elif data.get('expires_at', 0) <= time.time() + 60:
                if data.get('refresh_token'):
                    data.update(exchange({'client_id': config['client_id'], 'client_secret': config['client_secret'],
                                          'refresh_token': data['refresh_token'], 'grant_type': 'refresh_token'}))
                    save_token(data)
                else:
                    data = None
        except Exception:
            data = None
    if data is None:
        data = authorize(config)
    headers = {'Authorization': 'Bearer ' + data['access_token']}
    response = requests.get('https://www.googleapis.com/youtube/v3/channels',
                            params={'part': 'snippet', 'mine': 'true'}, headers=headers,
                            timeout=30, allow_redirects=False)
    body = response.json()
    if response.status_code != 200:
        reasons = [e.get('reason') for e in body.get('error', {}).get('errors', [])]
        report(success=False, phase='channels_list', http_status=response.status_code,
               reasons=[r for r in reasons if r in {'accessNotConfigured', 'forbidden', 'insufficientPermissions',
                                                   'quotaExceeded', 'youtubeSignupRequired'}])
        return
    channels = body.get('items', [])
    if not channels:
        report(success=False, reason='no_channel_for_selected_account')
        return
    result = []
    for channel in channels:
        comments = requests.get('https://www.googleapis.com/youtube/v3/commentThreads',
                                params={'part': 'id', 'allThreadsRelatedToChannelId': channel['id'],
                                        'maxResults': '1'}, headers=headers,
                                timeout=30, allow_redirects=False)
        result.append({'channel_name': channel['snippet']['title'],
                       'channel_url': 'https://www.youtube.com/channel/' + channel['id'],
                       'channel_http_status': response.status_code, 'comments_http_status': comments.status_code})
    report(success=True, channel_permission_granted=True, comment_permission_granted=True,
           token_encrypted=True, channels=result)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        report(success=False, reason='cancelled')
    except Exception as error:
        allowed = {'windows_required', 'permissions_failed', 'encryption_failed', 'token_exchange_failed',
                   'consent_denied', 'consent_timeout', 'youtube_permission_not_granted',
                   'expected_google_desktop_client', 'existing_client_differs'}
        label = str(error) if isinstance(error, RuntimeError) and str(error) in allowed else 'connection_failed'
        report(success=False, reason=label)
