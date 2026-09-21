# 결정: Contents의 Google Drive 연결

- 날짜: 2026-11-13
- 결정 내용: 기존 대시보드의 Contents를 활성화하고 지정한 Google Drive 폴더의 하위 폴더·파일 탐색, 새로고침, 이미지·영상 미리보기와 Drive 원본 열기를 제공한다. Google Identity Services 토큰 모델과 drive 권한으로 브라우저에서 API를 직접 호출한다. 토큰은 메모리에만 보관하며 만료 후 사용자가 다시 연결한다. 별도 서버, 서비스 계정 키, Cloud Functions와 GitHub Actions는 사용하지 않는다. 포트 8000에서 미리보기를 제공한다.
- 이유: 사용자가 Drive로 관리하는 콘텐츠를 기존 디자인과 로그인 기능을 유지한 대시보드에서 확인하도록 요청했다.
