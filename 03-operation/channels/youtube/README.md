# YouTube 채널

YouTube 연동 기능과 운영 자료를 이 폴더에서 관리한다.

- 연동 기능: API 연동 코드, 설정 예시와 사용 안내.
- 운영 자료: 게시 계획, 운영 기록과 성과 분석.

공통 저장 규칙은 [채널 관리 가이드](../../../docs/guides/channel-management.md)를 따른다.

## YouTube Data API 연결

- 데스크톱 OAuth 클라이언트 JSON과 토큰은 Git에서 제외한 `.private/`에 보관한다.
- `.private/client_secret.json`은 현재 Windows 사용자와 SYSTEM만 접근할 수 있다.
- `.private/token.dpapi`는 Windows DPAPI로 암호화한다. 동일 Windows 사용자 환경에서만 복호화할 수 있다.
- 인증 정보, 토큰, 인증 코드와 콜백 URL은 채팅·로그·Git에 노출하지 않는다.
- `youtube.force-ssl` 권한으로 채널과 댓글에 접근한다. Google 동의 화면에는 영상·댓글 등의 수정·삭제 권한도 표시될 수 있다.
- 연결 검증은 채널과 댓글의 GET 요청만 수행한다. 게시·수정·삭제는 별도 요청이 있을 때만 수행한다.

최초 연결은 저장소 루트에서 `python 03-operation/channels/youtube/connect.py --client-json "다운로드한 JSON의 로컬 경로"`를 실행한다. 기본 브라우저의 Google 동의 화면에서 채널 계정을 선택하고 승인한다. 이후에는 `python 03-operation/channels/youtube/connect.py`로 연결을 재확인한다. Python의 `requests` 패키지가 필요하다.

공식 참고: [데스크톱 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube API 인증과 권한](https://developers.google.com/youtube/data/guides/authentication).

## YouTube Analytics 조회

같은 OAuth 연결에 `yt-analytics.readonly`와 `youtube.readonly` 읽기 권한을 추가했다. 기존 채널과 `youtube.force-ssl` 권한은 유지한다. 새 동의 화면에서 다른 채널을 선택하면 기존 인증 파일을 교체하지 않는다.

`python 03-operation/channels/youtube/analytics.py --days 7`로 오늘을 제외한 최근 7일의 일별 조회수와 추정 시청 시간을 조회한다. 특정 종료 날짜는 `--end YYYY-MM-DD`로 지정한다. 결과는 `analytics/analytics-YYYYMMDD-N.md`에 저장하고 API 원본은 Git 제외 경로인 `.private/`에 보관한다.

보고서 날짜는 YouTube Analytics의 미국 태평양 시간 기준이며 시청 시간 원본 단위는 분이다. API가 반환하지 않은 날짜는 집계 지연이나 데이터 부재를 구분할 수 없으므로 0으로 채우지 않는다.

## 매시간 댓글 답글 예약

- Windows 작업 이름: `FIND.INC-YouTube-Reply-Hourly`
- 실행 주기: 한국 시간 매시간 정각.
- 최초 실행: 2026-11-17 10:00.
- 실행 방식: 현재 Windows 사용자로 Codex CLI를 실행하고 프로젝트의 `youtube-reply` 스킬을 적용한다.
- 실행 조건: PC가 켜져 있고 절전 상태가 아니며 현재 사용자가 Windows에 로그인해 있어야 한다.
- 실행 환경: 인터넷 연결과 유효한 Codex 로그인, YouTube OAuth 인증을 사용한다.
- 작업 지시: [scheduled-reply.md](scheduled-reply.md).
- 실행 파일: [run_scheduled_reply.py](run_scheduled_reply.py).
- 결과 기록: `reply/reply-YYYYMMDD-N.md`.
- 실행 상태: Git에서 제외한 `.private/schedule-last-run.json`.
- 실행 중복: 작업 스케줄러의 `IgnoreNew`와 파일 잠금으로 겹치는 실행을 방지한다.
- 시간 제한: 실행 스크립트는 40분, 작업 스케줄러는 45분으로 제한한다.
- 누락된 시간의 작업은 몰아서 실행하지 않고 다음 예약 시간을 따른다.

읽기 전용 사전 점검에서 스킬 경로와 인증 채널 접근을 확인했다. 실제 예약 작업은 Windows 작업 스케줄러에서 확인하거나 중지할 수 있다. 새 OAuth 로그인이 필요해지면 무인 실행에서 로그인 창을 반복해 열지 않고 실패를 기록한다.

중지할 때는 PowerShell에서 `Disable-ScheduledTask -TaskName 'FIND.INC-YouTube-Reply-Hourly'`를 실행한다. 재개할 때는 `Enable-ScheduledTask -TaskName 'FIND.INC-YouTube-Reply-Hourly'`를 실행한다.
