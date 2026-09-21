# 결정: Happier Cloud에서 기존 Codex 사용

- 날짜: 2026-11-18
- 결정 내용: 이 Windows 컴퓨터에 공식 설치기로 Happier 안정 버전 0.2.21을 설치하고 공용 Happier Cloud(`https://api.happier.dev`, 앱 `https://cloud.happier.dev`)에 등록한다. 자체 relay나 추가 터널은 사용하지 않는다.
- 이유: 사용자가 공식 agent-setup 안내에 따라 설치와 daemon 자동 실행을 요청하고 기존 ChatGPT 로그인·프로젝트·스킬 사용을 지정했다.
- 인증: 기존 Codex의 ChatGPT 로그인을 유지한다. Happier 계정의 기기 연결은 사용자가 직접 승인했다. 인증 정보와 일회용 연결 링크는 기록하지 않는다.
- 자동 실행: 공식 `happier service install`로 Windows 사용자 로그인 시 시작하는 `Happier\happier-daemon.default` 작업을 설치했다. daemon 실행과 로그인 트리거를 확인했다. 컴퓨터가 꺼져 있거나 절전 중이면 사용할 수 없다.
- Codex 경로: 기존 IDE 확장에 포함된 Codex 실행 파일의 폴더를 사용자 PATH에 추가했다. 기존 Codex 설정·인증·스킬은 변경하지 않았다.
- 프로젝트: `C:\Users\M123\Desktop\find-inc`. 새 세션에서 Codex와 로컬 인증(Native / Machine-local), 기본 App Server를 선택한다. 프로젝트의 `AGENTS.md`와 `.agents/skills/`를 그대로 사용한다.
- 상태 확인: `C:\Users\M123\.happier\bin\happier.exe status`. CLI와 백그라운드 서비스 버전 일치 및 정상 상태를 확인했다.
- 실제 앱 세션의 응답과 화면 재진입 검증은 사용자 확인 대기 중이다.
