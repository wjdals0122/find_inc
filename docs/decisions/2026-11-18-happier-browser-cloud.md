# Happier Cloud 브라우저 직접 연결

- 날짜: 2026-11-18
- 요청: 별도 서버 없이 기존 Firebase Hosting 대시보드에서 로컬 Codex를 원격 실행한다.
- 결정: 정적 브라우저 클라이언트가 Happier Cloud의 Socket.IO에 연결하고 기기별 키로 RPC와 세션 내용을 암호화한다. 인증과 암호문 조회에는 Cloud HTTPS API도 사용한다.
- 브라우저는 최초 한 번 Happier 계정에서 연결 승인을 받아야 한다. 승인 정보는 Firebase 사용자별로 분리하고 비추출 CryptoKey로 암호화해 IndexedDB에 저장한다. Firebase 토큰을 Happier에 전달하지 않는다.
- 등록 기기, 최신 데몬 응답, 기존 로컬 Codex 로그인 확인이 모두 성공해야 실행을 허용한다. 모델과 Effort는 실제 기기에서 조회한다.
- 세션 ID를 받은 뒤 실행 중으로 표시한다. 생성 시간 초과 시 동일 nonce로 기존 세션을 확인하며 확인되지 않은 상태에서 중복 생성하지 않는다.
- 검증: 프로토콜 단위 테스트 11개 통과. 실제 Cloud를 통한 암호화 RPC, Codex 테스트 세션 생성 및 응답 복호화 확인. 헤드리스 브라우저에서 WebSocket 연결, 기기 준비 상태, 모델 8개 조회, 암호화 저장 및 키 추출 차단 확인. 컴퓨터 유즈는 사용하지 않았다.
- 테스트 세션은 파일을 수정하지 않았으며 산출물 생성 성공을 검증한 것은 아니다.

## 사용과 빌드

대시보드 로그인 → 우측 하단 스킬 아이콘 → Cloud 연결 → 승인 링크에서 연결 승인 → 기기 확인 → 스킬 실행. 로컬 컴퓨터와 Happier 데몬은 켜져 있어야 한다.

`dashboard/tools/happier/`에서 `npm ci`, `npm test`, `npm run build`를 실행한다. 생성한 `dashboard/happier-cloud.js`를 기존 Firebase Hosting과 함께 배포한다. 빌드 도구, 테스트, Python 로컬 서버는 Hosting에서 제외한다.
