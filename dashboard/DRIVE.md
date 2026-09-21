# Contents와 Google Drive

Contents는 지정한 루트 폴더의 모든 하위 폴더와 파일을 Drive API v3로 읽는다. 폴더 이동, 전체 이름 검색, 새로고침과 이미지·영상 미리보기를 제공한다. 페이지네이션과 재귀 조회를 수행하며, Drive 바로가기는 파일로 표시하고 Drive에서 연다.

- 루트: https://drive.google.com/drive/folders/1rRp5lRjKKM3KSQo3JqfHZq1J54EpovDO
- 클라이언트: `613731739866-6ff2vv89q9v1djvphh2682jdp15u9u15.apps.googleusercontent.com`
- 권한: `https://www.googleapis.com/auth/drive`. 요청한 권한을 사용하며 구현된 API 호출은 읽기만 수행한다.

## 실행과 Google 설정

저장소 루트에서 `python -m http.server 8000 --bind 127.0.0.1`을 실행하고 http://localhost:8000/dashboard/ 에서 로그인한다. Contents의 Google Drive 연결을 누르고 폴더 접근 권한이 있는 Google 계정으로 승인한다. Firebase 로그인과 Drive 연결은 별개다.

Google Cloud에서 클라이언트를 웹 애플리케이션으로 설정하고 승인된 JavaScript 원본에 `http://localhost:8000`을 등록해야 한다. `127.0.0.1`로 접속하면 `http://127.0.0.1:8000`도 필요하다. 배포 시에는 `https://find-inc.web.app`와 실제 사용하는 다른 Hosting 원본을 등록한다. 같은 프로젝트의 Drive API 활성화와 OAuth 동의 화면 설정이 필요하다. 테스트 모드라면 사용할 계정을 테스트 사용자로 등록한다. 클라이언트 ID는 사용자가 제공한 값을 그대로 적용했으며 Cloud Console 설정은 변경하지 않았다.

## 토큰과 미리보기

Google Identity Services 토큰 모델을 사용한다. 액세스 토큰은 JavaScript 클로저의 메모리에만 보관한다. localStorage, sessionStorage, IndexedDB, URL 또는 파일에 저장하지 않는다. 요청은 Authorization 헤더로 직접 전송하며 별도 백엔드나 서버 키를 사용하지 않는다. 만료 직전 또는 401 응답 시 토큰과 자료를 지우고 사용자의 버튼 클릭으로 다시 연결한다. 페이지 새로고침 후에도 재연결이 필요하다. 화면의 새로고침 버튼은 유효한 토큰으로 전체 목록을 다시 조회한다. Firebase 로그아웃과 페이지 종료에서도 토큰을 비운다.

이미지와 영상은 인증된 요청으로 받아 메모리의 Blob URL로 표시하고 닫을 때 해제한다. 영상은 파일 수신 후 재생하므로 용량에 따라 대기 시간이 생긴다. 250 MB를 넘는 미디어 또는 브라우저가 지원하지 않는 형식은 Drive에서 열어 확인한다. 다른 파일 형식도 Drive에서 연다. 연결 해제는 앱의 메모리를 비우는 동작이며 Google 계정의 OAuth 동의 자체를 철회하지는 않는다.

## 검증

`npm test --prefix dashboard/tests`는 Firebase 인증 응답과 GIS·Drive 응답을 가로채 목록 페이지네이션·재귀 조회·폴더 이동·검색·인증 미리보기·갱신·401·연결 해제·모바일 표시를 확인한다. 실제 Google 동의와 폴더 권한은 실제 계정으로 연결해 확인해야 한다. 테스트는 실제 Drive 파일을 읽거나 쓰지 않는다.

공식 문서: [GIS 토큰 모델](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list).
