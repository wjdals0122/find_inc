"""Run the approved YouTube reply skill locally without exposing agent transcripts."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import argparse
import json
import msvcrt
import os
import shutil
import subprocess
import sys

BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[2]
PRIVATE = BASE / '.private'
CONFIG = BASE / 'schedule-runtime.json'


def stamp():
    return datetime.now(timezone(timedelta(hours=9))).isoformat()


def resolve_cli(config):
    command = shutil.which('codex')
    if command:
        return command
    known = Path(config['codex_executable'])
    if known.is_file():
        return str(known)
    candidates = list((Path.home()/'.antigravity-ide/extensions').glob('openai.chatgpt-*/bin/windows-x86_64/codex.exe'))
    if candidates:
        return str(max(candidates, key=lambda path: path.stat().st_mtime))
    raise RuntimeError('codex_cli_missing')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    PRIVATE.mkdir(exist_ok=True)
    lock = (PRIVATE/'scheduled-reply.lock').open('a+b')
    lock.seek(0)
    if not lock.read(1):
        lock.write(b'0'); lock.flush()
    lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return 0  # Another run still owns the lock; never overlap reply posting.
    status_file = PRIVATE / ('schedule-check.json' if args.check else 'schedule-last-run.json')
    state = {'started_at': stamp(), 'mode': 'read_only_check' if args.check else 'scheduled_reply'}
    summary = PRIVATE / ('schedule-check-summary.txt' if args.check else 'schedule-last-summary.txt')
    try:
        config = json.loads(CONFIG.read_text(encoding='utf-8'))
        cli = resolve_cli(config)
        if args.check:
            prompt = (
                'This is a read-only readiness check for a scheduled YouTube task. '
                'Read .agents/skills/youtube-reply/SKILL.md and confirm it exists. '
                'Use the existing local OAuth helper to GET channels.list(mine=true) only. '
                'Never print or return client credentials, tokens or request headers. '
                'Do not read comments, post replies, change files, run git or open login prompts. '
                'If authentication is unavailable, report that safely and stop. '
                'Return exactly READY only if the skill is readable and the authenticated '
                'YouTube channel ID equals UC4mosYdnj9qwBjSgU8zev3w; otherwise return NOT_READY.'
            )
        else:
            prompt = (BASE/'scheduled-reply.md').read_text(encoding='utf-8')
        command = [cli, '--no-daemon', '--ask-for-approval', 'never', 'exec',
                   '--sandbox', 'danger-full-access', '--ephemeral', '--color', 'never',
                   '--cd', str(PROJECT), '--output-last-message', str(summary), '-']
        # Same Windows user is needed for local DPAPI credentials and direct API access.
        # Do not use bypass flags or expose model/tool events in files or a console.
        if summary.exists():
            summary.write_text('', encoding='utf-8')
        status_file.write_text(json.dumps(state, indent=2), encoding='utf-8')
        result = subprocess.run(command, input=prompt, text=True, encoding='utf-8',
                                cwd=PROJECT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                creationflags=subprocess.CREATE_NO_WINDOW, timeout=2400)
        state['exit_code'] = result.returncode
        if args.check:
            state['ready'] = result.returncode == 0 and summary.is_file() and summary.read_text(encoding='utf-8').strip() == 'READY'
        state['finished_at'] = stamp()
        status_file.write_text(json.dumps(state, indent=2), encoding='utf-8')
        return 0 if result.returncode == 0 and (not args.check or state['ready']) else 1
    except subprocess.TimeoutExpired:
        state.update(finished_at=stamp(), error='run_timeout_no_automatic_retry')
    except Exception:
        state.update(finished_at=stamp(), error='runtime_error_no_automatic_retry')
    finally:
        status_file.write_text(json.dumps(state, indent=2), encoding='utf-8')
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        lock.close()
    return 1


if __name__ == '__main__':
    sys.exit(main())
