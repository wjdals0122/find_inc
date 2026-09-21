# 결정: Happier 승인 흐름 간소화와 Firebase Hosting 배포

- 날짜: 2026-11-18
- 요청: 기존 Firebase Hosting에 대시보드를 배포하고, 별도 서버 없이 브라우저와 Happier Cloud의 암호화된 socket.io 연결로 Codex를 원격 실행한다. 승인이 필요할 때만 `Happier 웹에서 승인` 버튼을 보여주고, 승인 후에는 PC·폴더를 고르지 않고 실행한다.
- 결정:
  - 별도 `Cloud 연결` 단계를 없앴다. 승인되지 않은 브라우저에서 `스킬 실행`을 누르면 승인 요청을 만들고 `Happier 웹에서 승인 ↗` 버튼을 보여준다. 이미 승인한 브라우저는 이 단계를 건너뛴다.
  - 승인이 확인되면 연결 상태를 다시 확인하고, 대기 중이던 같은 요청을 자동으로 실행한다. 기기 연결이 준비되지 않았으면 실행하지 않고 안내한다.
  - 실행 기기와 폴더는 클라이언트에 고정된 대상(Codex 실행 PC의 `find-inc` 프로젝트 폴더)을 쓴다. 실행 요청에 기기나 폴더 선택값을 담지 않는다.
  - Hosting 제외 목록에 `VIRTUAL-OFFICE.md`를 추가했다.
- 배포: `find-inc` 사이트, https://find-inc.web.app/dashboard.html
- 검증: `dashboard/tests/auth.cjs` 승인 흐름 4개 검사 추가 후 전체 통과(승인 전 링크 없음, 실행 시 승인 버튼, 승인 후 자동 실행·기기/폴더 미전송, 기승인 시 생략). `virtual-office.cjs`, `office-design.cjs`, Happier 프로토콜 단위 테스트 11개 통과. 배포 후 HTTP로 주요 파일 200과 Python 서버·테스트·문서 404를 확인했다. Computer Use는 사용하지 않았다.
- 제한: 자동화 테스트는 Happier 전송을 모의한다. 실제 Happier 계정 승인과 원격 Codex 실행은 이번에 다시 실행하지 않았다. 실행 PC와 Happier 데몬이 켜져 있어야 한다.

## 재배포 (2026-11-18)

AI 회의실 추가 후 같은 사이트에 다시 배포했다. 배포 후 HTTP로 대시보드·스킬 패널·Happier 모듈·AI 회의 파일 200, Python 서버·테스트·문서 404, 배포본의 `Happier 웹에서 승인` 문구와 `ai-meeting.js` 로드를 확인했다.
