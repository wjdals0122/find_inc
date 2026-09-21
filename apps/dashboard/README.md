# dashboard

프로젝트 루트의 `apps/dashboard`에 있는 Flutter 앱입니다. iOS, Android, Web 플랫폼이 활성화되어 있습니다.

## 실행

- 저장소 루트를 VS Code로 열고 F5를 누르면 `dashboard` 구성으로 Android 에뮬레이터 안에서 실행됩니다.
- 사전 작업이 `Medium_Phone` AVD를 포트 5554에서 시작하고, 부팅을 기다린 뒤 `emulator-5554`에 앱을 설치합니다. 해당 포트의 에뮬레이터가 이미 켜져 있으면 재사용합니다.
- Android 실행에는 Android SDK와 기기 또는 에뮬레이터가 필요합니다. 현재 Windows 환경은 `flutter doctor` 기준으로 Android SDK Command-line Tools 설치와 SDK 라이선스 확인이 추가로 필요합니다.
- iOS 빌드·실행은 macOS와 Xcode가 설치된 환경에서 진행합니다.
- 이 Windows 환경의 Flutter SDK 경로는 `.vscode/settings.json`의 `C:/flutter`입니다. 다른 환경에서는 해당 설정을 로컬 SDK 경로로 변경합니다.

터미널에서는 이 폴더에서 `flutter pub get` 후 `flutter run -d chrome`으로 Web 앱을 실행할 수 있습니다. Flutter가 PATH에 없다면 `C:\flutter\bin\flutter.bat`을 사용합니다.

## Firebase

- 기존 웹 대시보드와 같은 `find-inc` 프로젝트를 사용합니다.
- Android·iOS 식별자는 현재 `com.example.dashboard`이며 두 앱을 Firebase에 등록했습니다.
- Web은 기존 `Find-inc Web` 앱을 재사용합니다.
- `lib/firebase_options.dart`로 플랫폼별 설정을 선택하고 `main()`에서 Firebase를 초기화합니다.
- `dashboard/login.html`의 모바일 디자인을 반영한 로그인 화면에서 기존 Firebase 이메일·비밀번호 인증을 사용합니다. 비밀번호 표시, 재설정 메일, 한국어 오류 안내를 지원합니다.
- 인증 상태를 복원하는 동안 로딩 화면을 표시하며 로그인하면 Strategy 화면이 열립니다. 로그아웃하면 로그인 화면으로 돌아갑니다.
- `AuthService`에서 현재 사용자·인증 상태·이메일 로그인·비밀번호 재설정·로그아웃을 사용할 수 있습니다.
- Android 설정은 `android/app/google-services.json`, iOS 설정 원본은 `ios/Runner/GoogleService-Info.plist`에 있습니다. iOS는 Dart 옵션을 명시해 초기화하며, Xcode 빌드 검증은 macOS에서 진행해야 합니다.
- 이 Windows PC는 데스크톱 플러그인 심볼릭 링크 생성에 필요한 개발자 모드가 꺼져 있습니다. Android 검증 명령에는 패키지 설치 후 `--no-pub`를 사용했습니다.

## Strategy

- `dashboard/dashboard.html`의 Strategy 데이터·구성을 모바일 네이티브 위젯으로 구현합니다. Contents와 Operation은 별도 화면입니다.
- 브랜드·상품 선택, 브랜드/상품/경쟁/고객/브리프 탭, 가이드라인 펼치기, 원문 검색·열람, 외부 출처 열기, 이미지 확대, 파일 내보내기를 지원합니다.
- 프로젝트의 `emil-design-eng`·`impeccable` 지침을 적용해 브랜드·상품 선택 하단 시트, 밑줄형 네이티브 탭, 탭별 스크롤 위치 복원, 갤러리 위치 표시·이전/다음 이동을 제공합니다. 큰 글자·좁은 화면·키보드·동작 줄이기 설정에 대응합니다.
- 브랜드 로고 배경 전환, 컬러 복사, 서체 문구·굵기 미리보기, 예시 오디오 재생·탐색, 이미지 갤러리와 브리프 메시지 선택·카피 복사를 제공합니다.
- 자료는 앱에 포함된 스냅샷입니다. 웹 대시보드의 프로필·에셋을 추출하고 `01-strategy/`에 실제 파일이 있으면 원문을 현재 파일로 갱신합니다. 현재 대시보드에 등록된 LG전자·BMW의 상품 자료를 포함합니다.
- 원본 갱신: 저장소 루트에서 `python apps/dashboard/tools/sync_strategy.py`를 실행합니다. 서체 변환에는 Python `fonttools`가 필요합니다. 생성물은 `assets/strategy/`에 저장됩니다. 자동 서버 동기화는 하지 않습니다.
- 에셋·문서 내보내기는 기기의 공유/저장 메뉴를 사용합니다. 오디오는 기존 웹과 같은 3초 예시이며 공식 음원이 아닙니다. BMW의 서체·캐릭터 미확인 표기도 유지합니다.
- 이번 Strategy 작업은 빌드·에뮬레이터 실행 없이 정적 분석과 자료 참조 검증으로 확인했습니다. 설치된 앱 화면은 F5로 새 코드를 실행한 뒤 바뀝니다.

## Contents / Google Drive

- 하단 Contents 메뉴에서 기존 웹과 같은 루트 폴더 `1rRp5lRjKKM3KSQo3JqfHZq1J54EpovDO`를 Drive API v3로 조회합니다. 모든 하위 폴더·페이지를 읽어 폴더 이동, 경로 이동, 전체 파일명 검색, 새로고침을 제공합니다. 파일 수정·업로드·삭제 호출은 없습니다.
- Firebase 이메일 로그인과 Google Drive 연결은 별개입니다. Contents에서 Google Drive 연결을 누르고 폴더에 접근할 수 있는 계정으로 승인합니다. 앱은 `drive.readonly` 권한만 요청합니다. Web에서는 Google의 공식 계정 버튼으로 먼저 연결한 뒤 Drive 권한 허용을 누릅니다.
- 제공받은 Marketing Dashboard 클라이언트의 공개 ID를 `lib/drive_config.dart`에 설정했습니다. iOS는 `…u9lbe3jnjah719ep2lqgkqspvnmu2bip`, Android 등록은 `…ntv1a7fm56hoddakrpgd1fqeo6thebvd`입니다. Android SDK는 패키지 ID·서명 SHA-1로 네이티브 등록을 선택하며, `serverClientId`에는 기존 웹 클라이언트 `…6ff2vv89q9v1djvphh2682jdp15u9u15`를 사용합니다. 네이티브 ID를 웹 서버 클라이언트 ID 자리에 넣지 않습니다.
- iOS의 `GIDClientID`, `GIDServerClientID`, URL 스킴은 `ios/Runner/Info.plist`에 반영했습니다. 제공받은 OAuth 원본 JSON/plist 및 클라이언트 보안 비밀은 앱에 복사하지 않았습니다.
- 토큰과 파일 목록은 메모리에만 보관합니다. 연결 해제·Firebase 로그아웃·토큰 만료/401 응답 시 목록과 미리보기를 비우고 재연결을 안내합니다. 연결 해제는 Google 계정의 동의 자체를 철회하지 않습니다.
- 이미지 확대, 영상 재생·탐색을 지원합니다. 250 MB를 넘는 파일과 문서·바로가기는 Drive에서 엽니다. 영상은 인증된 응답을 받은 뒤 앱 전용 임시 파일 또는 Web Blob으로 재생하고 닫을 때 정리합니다.
- 이번 작업에서는 빌드·에뮬레이터 실행 없이 정적 분석과 설정 파일 검증을 진행합니다. 실제 OAuth 동의, Google Cloud의 Android 패키지/SHA-1 등록, Drive API 활성화·테스트 사용자·폴더 권한은 계정 연결 후 확인이 필요합니다. 앱 화면 갱신은 다음 F5 실행 때 적용됩니다.

## Operation / Supabase

- 하단 Operation에서 YouTube·Instagram·Search Console 성과를 조회합니다. 기존 웹의 녹색 히어로, 채널 카드, 기간·계정 필터, 지표 합계와 날짜별 그래프, 수집 커버리지·시각, 원본 지표 표를 모바일 위젯으로 구성했습니다.
- `supabase_flutter` 안정 버전 `2.18.3`을 고정하고 `operation_repository.dart`에서 `channel_metrics`를 직접 SELECT합니다. 웹 API·스냅샷 파일을 경유하지 않습니다. 날짜 필터·명시적 정렬·exact count·범위 페이지네이션을 사용합니다.
- 프로젝트: `https://jktfoktelryczucpzvcu.supabase.co` (`Find_performance`). 클라이언트에는 publishable 키만 포함합니다. Firebase 로그인과 분리된 공개 조회 전용 클라이언트이며 Supabase 로그인·세션 복원·토큰 전달은 하지 않습니다.
- 원격 migration `channel_metrics_public_read_only`로 테이블의 RLS를 유지하고 `anon` SELECT 정책을 추가했습니다. `anon`의 쓰기·TRUNCATE 등 기존 권한은 제거했습니다. 다른 테이블과 수집용 서버 권한은 변경하지 않았습니다.
- 기본 기간은 한국 시간 기준 어제까지 최근 7일입니다. 7/14/30일·최대 366일 사용자 기간을 지원합니다. 서비스별 날짜 집계 기준은 유지하고 수집 시각은 KST로 표시합니다.
- 미제공은 `null`·`미제공`으로 남기고 그래프 선을 끊습니다. 저장된 0은 정상 수치로 계산합니다. 모든 계정 선택 시 날짜별로 합산하며 Instagram 도달 합계는 기간 순도달이 아님을 표시합니다. 새로고침은 DB 재조회이며 채널 API 수집을 실행하지 않습니다.
- 현재 공개 API 조회에서 YouTube 10개 행(2026-11-10~14)을 확인했습니다. Instagram·Search Console은 데이터가 없어 빈 상태를 표시합니다.
- 검증: 공개 REST와 Supabase SDK로 실제 SELECT·count·페이지네이션 확인, 익명 SELECT 허용/INSERT·UPDATE·DELETE·TRUNCATE 차단 확인, Supabase 보안 advisor 이상 없음. 집계 경계 검증은 저장소 루트에서 `C:\flutter\bin\dart.bat apps/dashboard/tools/check_operation_data.dart`로 실행할 수 있습니다. 앱 빌드·에뮬레이터 실행 검증은 하지 않았습니다.
- 공식 API 참고: [Flutter SELECT](https://supabase.com/docs/reference/dart/select), [범위 조회](https://supabase.com/docs/reference/dart/range), [Data API 권한과 RLS](https://supabase.com/docs/guides/api/securing-your-api).

## 스킬 실행 / Happier

- 대시보드 상단 **스킬 실행**을 눌러 사용합니다. 좁은 화면이나 큰 글꼴에서는 번개 아이콘으로 표시됩니다. 기존 Strategy·Contents·Operation 메뉴는 유지합니다.
- 연결 방법:
  1. 실행 PC와 같은 계정으로 로그인
  2. Accept Connection 누르기
  3. 앱으로 돌아오기
- 승인 화면은 외부 브라우저에서 열리며 앱 복귀와 주기 조회로 승인을 확인합니다. 승인 요청은 10분 이내에 만료됩니다. 승인 링크의 민감 값은 URL fragment에만 넣고, 임시 승인 키는 저장하지 않습니다.
- 기존 웹 어댑터와 동일한 인증 요청·claim, HPV3 HMAC 검증, NaCl 키 봉투 복호화, AES-256-GCM 데이터 암호화와 Socket.IO RPC를 Dart로 구현했습니다. 평문 세션과 토큰만 제공하는 승인은 거부합니다. 기기의 capabilities·Codex 로그인·실제 모델 목록을 확인해야 실행 버튼이 활성화됩니다.
- Android는 플러그인의 암호화 저장소, iOS는 이 기기에서 잠금 해제했을 때만 접근하는 Keychain을 사용합니다. Firebase UID별로 승인·폴더·최근 50개 실행 내역을 분리합니다. Web은 메모리에만 저장하므로 새로고침하면 재연결이 필요합니다. Firebase 계정 변경·화면 종료 시 런타임 키와 소켓을 닫고, Happier 연결 해제·401 응답 시 해당 연결과 내역을 비웁니다. 앱에서 연결 해제하는 것은 Happier 서버의 기기 등록 자체를 삭제하는 동작은 아닙니다.
- 이전에 선택한 온라인 PC를 우선하고, 없으면 복호화한 최근 세션 사용 시각, 기기 활성 시각 순으로 선택합니다. 폴더는 PC별 이전 선택, 최근 세션 경로, 홈 폴더 순으로 고릅니다. **PC·폴더 변경**에서 다른 온라인 PC·최근 폴더·직접 입력한 전체 경로로 바꿀 수 있습니다. 각 실행은 시작 시의 PC와 폴더를 고정합니다.
- 스킬·모델·추론 강도·요청과 대시보드 반영 여부를 지정할 수 있습니다. 원격 실행은 기존 PC의 Codex 네이티브 인증과 기본 승인 모드를 사용합니다. 별도 승인이 필요하면 Happier 세션을 열어 처리합니다. 세션 생성 전 실행 ID를 보관하며 응답이 끊기면 같은 nonce로 기존 세션을 조회합니다. 불확실한 요청을 자동으로 다시 실행하지 않습니다. 앱 화면을 닫아도 PC 작업은 계속될 수 있습니다.
- 스킬 목록은 `dashboard/skills-catalog.json`의 앱 에셋 사본입니다. 원본 변경 후 저장소 루트에서 `Copy-Item dashboard/skills-catalog.json apps/dashboard/assets/happier/skills-catalog.json`로 갱신합니다.
- 빌드 없는 검증: 이 앱 폴더에서 `C:\flutter\bin\dart.bat run tools/check_happier.dart`를 실행합니다. 공식 TypeScript로 만든 합성 키·승인·암호문과 Dart의 호환성, 변조·만료·평문 거부, 자동 선택, 암호화 RPC, 중복 전송 방지, 승인 대기, 내역 복원·401 처리를 검증합니다. 반대 방향 AES 검증은 `dashboard/tools/happier`에서 `node .generated/flutter-fixtures.mjs --verify`로 수행합니다. 해당 파일이 없으면 `npx esbuild flutter-fixtures.mjs --bundle --platform=node --format=esm --packages=external --outfile=.generated/flutter-fixtures.mjs` 후 `node .generated/flutter-fixtures.mjs`로 합성 fixture를 생성합니다.
- 이번 작업에서는 앱 빌드·에뮬레이터 실행·실제 스킬 실행을 하지 않습니다. 설치된 앱 화면은 다음 F5 실행 후 바뀝니다. 실제 계정 승인은 앱에서 위 세 단계를 거쳐야 완료됩니다.
- 공식 자료: [Happier 프로토콜 소스](https://github.com/happier-dev/happier/tree/e992e049ffa7a98ab60740ac60f94918f022ff24), [PineNaCl](https://pub.dev/packages/pinenacl), [cryptography](https://pub.dev/packages/cryptography), [Socket.IO Dart](https://pub.dev/packages/socket_io_client), [보안 저장소](https://pub.dev/packages/flutter_secure_storage).

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
