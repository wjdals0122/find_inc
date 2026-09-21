# 대시보드 로그인

`dashboard.html`은 Firebase 프로젝트 `find-inc`의 웹 앱 `Find-inc Web`에 연결된다. 이메일·비밀번호 로그인에 성공한 뒤 기존 대시보드 실행 코드를 시작하며, 로그아웃하면 보고서와 팝업을 닫고 페이지를 다시 불러온다.

## 실행과 계정

저장소 루트에서 `python -m http.server 8000 --bind 127.0.0.1`을 실행한 뒤 다음 주소를 연다.

`http://127.0.0.1:8000/01-strategy/dashboard/dashboard.html`

로그인에는 [Firebase Authentication에 등록된 사용자 계정](https://console.firebase.google.com/project/find-inc/authentication/users)이 필요하다. Firebase 프로젝트 관리용 Google 로그인과 웹 앱의 이메일·비밀번호 계정은 별개다. 회원가입 화면은 제공하지 않는다. 등록된 사용자는 로그인 화면에서 비밀번호 재설정 메일을 요청할 수 있다.

로그인 상태 유지에 체크하면 같은 브라우저의 다른 탭과 재실행 후에도 로그인 상태를 복원한다. 체크하지 않으면 해당 탭의 세션 동안 유지한다. 비밀번호는 애플리케이션 코드에서 저장하거나 로그로 출력하지 않는다. 세션 저장은 Firebase SDK가 관리한다.

## 구현 범위

- 첨부된 React 예시의 원형 궤도, 배경 파동, 폼 등장 효과를 단일 HTML의 CSS·JavaScript로 적용했다.
- BMW·LG전자·토스·카카오·신한 로고는 기존 수집 파일 또는 내장 에셋에서 가져왔다. 로고 원본의 사용 조건은 각 브랜드 에셋 문서에 따른다. 이번 수정은 로컬 대시보드 수정이며 웹 공개 배포를 포함하지 않는다.
- 모바일에서는 예시와 같이 로고 영역을 접고 로그인 폼을 표시한다. 시스템의 동작 줄이기 설정에서는 로고가 정지한 상태로 배치된다.
- Firebase JS SDK 13.2.0의 공식 CDN을 사용하므로 로그인에는 인터넷 연결이 필요하다. HTML의 Firebase 설정은 브라우저용 공개 앱 식별 정보이며 관리자 자격 증명이 아니다.
- 기존 보고서 데이터, 프로필, CSS, 렌더러를 보존했다. 로그아웃 상태에서는 보고서가 렌더링되지 않으며 검색·원문 보기 단축키도 초기화되지 않는다.

이 로그인은 **화면 접근 제어**다. 보고서 데이터가 HTML에 내장되어 있으므로 파일을 전달받은 사람은 원본 내용을 추출할 수 있다. 자료 자체를 비공개로 보호하려면 서버에서 Firebase ID 토큰을 검증하고 권한이 있는 사용자에게만 데이터를 제공해야 한다. 회원가입 UI가 없다는 사실만으로 조직 구성원 접근을 보장하지 않으며, 조직 전용 서비스에서는 서버 측 사용자 권한 검사도 필요하다.

## 검증

`tests/`에서 `npm ci`, 필요한 경우 `npx playwright install chromium`, `npm test`를 실행한다. 테스트가 자체 로컬 HTTP 서버를 열고 종료한다. 스크린샷과 결과 JSON은 시스템 임시 디렉터리에 기록된다.

기본 테스트는 실제 Firebase SDK를 사용하되 인증 API 응답을 가로채 로그인 성공·실패, 새로고침, 탭 동기화, 로그아웃, 비밀번호 재설정 화면을 확인한다. 실제 사용자를 생성하거나 메일을 발송하지 않는다. 실제 Firebase의 잘못된 자격 증명 응답도 확인하려면 환경 변수 `FIREBASE_AUTH_LIVE=1`을 설정한다. 실제 계정의 비밀번호를 이용한 로그인 검증은 포함하지 않는다.

공식 참고: [웹 SDK CDN 설정](https://firebase.google.com/docs/web/alt-setup), [Firebase Authentication 웹 시작하기](https://firebase.google.com/docs/auth/web/start).
