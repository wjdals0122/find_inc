# 결정: 전략 대시보드 Firebase Hosting 배포

- 날짜: 2026-11-06
- 결정 내용: 현재 `01-strategy/dashboard/dashboard.html`을 Firebase 프로젝트 `find-inc`의 Hosting 사이트 `find-inc`에 배포한다. 기본 접속 주소는 `https://find-inc.web.app`이다. 테스트 파일·안내 문서·템플릿은 배포에서 제외한다.
- 이유: 사용자가 현재 Firebase 프로젝트의 Hosting으로 대시보드를 배포하고 접속 링크를 알려달라고 요청했다.
- 배포 버전: `projects/find-inc/sites/find-inc/versions/6c7fe72cf2b98593`.
- 접근 범위: 이메일·비밀번호 로그인으로 화면을 전환한다. HTML에 내장된 자료의 서버 측 비공개 보호는 적용되지 않는다.
