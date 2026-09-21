# 결정: Operation 대시보드 Firebase Hosting 배포

- 날짜: 2026-11-17
- 결정 내용: 기존 Firebase 프로젝트 `find-inc`의 Hosting 사이트 `find-inc`에 현재 `dashboard/`를 배포한다. 기존 메뉴와 Firebase 로그인을 유지하고 Operation 화면을 포함한다. Python 서버·인증 파일·로컬 스냅샷·테스트는 배포하지 않는다.
- 이유: 사용자가 기존 Firebase Hosting으로 대시보드를 배포하고 배포 주소를 알려달라고 요청했다.
- 대시보드 주소: https://find-inc.web.app/dashboard.html
- 배포 버전: `projects/find-inc/sites/find-inc/versions/733cec49320e9677`.
- 검증: 로그인·기존 콘텐츠·Operation UI 회귀 검사 통과. Hosting 배포 성공 확인.
- 제한: 로컬 Python 성과 조회 API는 정적 Hosting에서 실행되지 않는다. 별도 백엔드가 연결되기 전에는 Operation에 연결 미완료 안내를 표시하며 성과 데이터 조회는 제공되지 않는다.
