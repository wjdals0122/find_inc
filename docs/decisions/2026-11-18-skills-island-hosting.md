# 결정: 스킬 아일랜드 배포와 검증 방식

- 날짜: 2026-11-18
- 결정 내용: 스킬 아일랜드와 기존 실행 팝업을 기존 Firebase Hosting `find-inc`에 배포한다. 대시보드 검증은 Computer Use 없이 소스·자동화 테스트·HTTP 응답으로 수행하며 `docs/guides/dashboard-verification.md`와 `AGENTS.md`에 반영한다.
- 이유: 사용자가 기존 Firebase Hosting 배포와 검증 방식 변경을 요청했다.
- 주소: https://find-inc.web.app/dashboard.html
- 배포 버전: `projects/find-inc/sites/find-inc/versions/0399409eb0b36e6a`.
- 검증: 아일랜드 호버·클릭·키보드·모바일·팝업·로그인 회귀 검사, 실행 중복 방지 등 백엔드 검사 8개 통과. 배포 성공 확인.
- 배포 범위: UI와 공개 스킬 목록 23개. 인증 정보·실행 기록·Python 서버·테스트는 배포에서 제외한다.
- 제한: 정적 Hosting에 실행 API가 없으므로 원격 스킬 실행은 아직 제공되지 않는다. 목록과 팝업은 표시하되 실행 서버 연결 전에는 정상 연결로 표시하거나 실행을 허용하지 않는다. 현재 실제 Happier CLI 연결은 localhost 서버에서 제공한다.
