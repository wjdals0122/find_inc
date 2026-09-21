# 인증과 API 작업

## 기존 연동

프로젝트의 `03-operation/channels/youtube/README.md`, `connect.py`, `publish.py`를 확인한다. 아래 경로는 프로젝트 기준이며 스킬 폴더 기준이 아니다.

- `connect.py`: 데스크톱 OAuth와 Windows DPAPI 저장 구현.
- `.private/`: 클라이언트 JSON, 암호화한 토큰과 세션 보관 위치.
- `publish.py`: 최초 발행 당시의 채널, 공개 범위, 자동차 카테고리와 합성 표시가 고정된 기존 업로더.

현재 코드를 확인하지 않고 기존 업로더를 실행하지 않는다. 다른 채널, 비공개 영상과 다른 콘텐츠 유형에는 고정값을 자동 적용하지 말고 요청에 맞는 실행 경로를 준비한다. 과거 공개 발행은 새 영상의 공개 승인이나 기본값이 아니다.

## 인증 보호

파일을 만들기 전에 Git 제외와 추적 여부를 확인한다. 인증값은 프로세스 안에서 읽어 사용하고 파일 내용, 셸 인자, 요청 헤더, 인증 URL이나 예외 전문으로 출력하지 않는다. 다른 OS나 Windows 사용자 계정에서 DPAPI 복호화가 안 된다고 평문 토큰으로 바꾸거나 Git으로 전달하지 않는다. 권한이 부족하거나 갱신에 실패하면 로컬 Google 동의 화면으로 재연결하며 토큰이나 인증 코드를 채팅으로 입력받지 않는다.

현재 연결의 `youtube.force-ssl`은 업로드와 메타데이터 수정에 사용할 수 있다. 실제 승인된 권한을 확인하고 새 연결에는 필요한 범위만 요청한다. API 요청은 Authorization 헤더를 사용하고 HTTP 디버그 로그를 켜지 않는다.

## 업로드와 재개

`GET https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`로 채널을 확인한다. 승인한 채널과 다르거나 대상이 불명확하면 업로드하지 않는다. 기록에 영상 ID가 있으면 `videos.list`로 먼저 조회한다.

1. `POST https://www.googleapis.com/upload/youtube/v3/videos`에 `uploadType=resumable`, `part=snippet,status`를 전달한다.
2. `snippet`에 승인한 문안, 카테고리와 필요한 언어 설정을 넣고 `status.privacyStatus`에 승인한 `private`, `unlisted`, `public` 값을 명시한다.
3. 구독자 알림은 사용자 선택을 따르고 별도 요청이 없으면 `notifySubscribers=false`를 사용한다.
4. `X-Upload-Content-Type`, `X-Upload-Content-Length`로 형식과 원본 크기를 전달한다.
5. 반환된 `Location`은 민감한 세션 URL이므로 암호화한 로컬 상태에 저장하고 채팅이나 Markdown에는 쓰지 않는다.
6. 세션으로 파일을 `PUT`하고 완료 응답의 영상 ID를 즉시 저장한다.

세션 상태에는 원본 해시와 승인한 메타데이터의 식별값을 함께 묶는다. 중단 후 같은 세션에 `Content-Range: bytes */전체크기`로 상태를 조회한다. `308`이면 받은 범위 다음부터 이어 보내고 `200` 또는 `201`이면 영상 ID를 복구한다. 결과가 모호할 때 새 업로드를 만들지 않는다. 공식 Google OAuth와 API 호스트에만 인증 정보를 보내고 반환된 업로드 URL의 HTTPS와 Google API 호스트를 확인한다.

## 결과 검증

`videos.list`에 영상 ID와 `part=snippet,status,processingDetails`를 전달한다. 채널, 제목과 설명을 승인한 값과 비교하고 `status.privacyStatus`는 실제 응답값을 기록한다. `uploadStatus=processed`, `processingStatus=succeeded`이면 처리 완료다. 처리 중이면 링크와 처리 중 상태를 기록하고 실패나 거절이면 안전한 상태 코드를 남긴다.

한 번의 확인 루프는 2분 이내로 제한하고 이후 필요하면 읽기 조회만 수행한다. 채널이나 공개 상태를 확인하지 못한 결과를 공개 발행 완료로 표현하지 않는다.

## 제목과 설명 수정

기존 영상 ID로 `snippet,status`를 읽고 채널을 확인한다. 현재 제목, 설명, 태그, 카테고리와 언어 등 수정 가능한 속성을 보존한 뒤 `PUT https://www.googleapis.com/youtube/v3/videos?part=snippet`으로 요청한 변경을 반영한다. 제목이나 설명만 바꿀 때는 `status`를 요청 범위에 넣지 않는다.

`videos.update`는 전달한 부분의 생략된 속성을 지울 수 있다. 필수 제목과 카테고리, 보존할 속성을 확인한 뒤 요청하고 재조회로 설명과 공개 상태를 확인한다. 반영이 지연되면 재등록하지 않고 발급된 영상 ID로 다시 조회한다.

## 공식 문서

- [데스크톱 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
- [YouTube 인증](https://developers.google.com/youtube/data/guides/authentication)
- [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [재개 가능한 업로드](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol)
- [videos.update](https://developers.google.com/youtube/v3/docs/videos/update)
- [영상 상태와 합성 표시](https://developers.google.com/youtube/v3/docs/videos)

필드나 권한이 불확실하면 공식 문서를 확인하고 과거 할당량이나 공개 제한을 현재 사실로 단정하지 않는다.
