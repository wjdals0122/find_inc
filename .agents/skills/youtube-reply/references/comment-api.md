# OAuth와 댓글 API

## 기존 인증 연결

프로젝트의 `03-operation/channels/youtube/README.md`, `connect.py`와 `publish.py`를 확인한다. 경로는 프로젝트 기준이며 스킬 폴더 기준이 아니다.

`connect.py`는 데스크톱 OAuth와 Windows DPAPI 저장을 구현하고 `publish.py`의 `load_credentials()`는 저장된 인증을 읽고 필요하면 갱신한다. 이를 재사용할 때 업로드용 `main()`이나 `--execute`는 호출하지 않는다. 기존 업로드 스크립트의 고정 채널 ID를 새 댓글 작업의 대상으로 자동 채택하지 않는다.

인증 정보는 Git에서 제외한 `.private/`에 두고 기존 파일 접근 제한과 암호화를 유지한다. 다른 환경에서 복호화할 수 없으면 평문 파일로 바꾸거나 Git으로 옮기지 말고 로컬 인증을 진행한다. `youtube.force-ssl` 권한이 있는지 확인하며 필요한 경우 사용자에게 Google 동의 화면을 안내한다. 토큰과 인증 코드를 채팅에 붙여 넣도록 요청하지 않는다.

## 조회

모든 요청은 HTTPS와 Authorization 헤더를 사용하고 HTTP 디버그 로그와 원본 예외 출력은 끈다.

- `GET /youtube/v3/channels?part=snippet&mine=true`: 실제 인증 채널 확인.
- `GET /youtube/v3/commentThreads`: `part=snippet`, `allThreadsRelatedToChannelId` 또는 사용자가 지정한 `videoId`, `textFormat=plainText`로 조회.
- `GET /youtube/v3/videos?part=snippet&id=영상ID`: 영상 소유 채널과 콘텐츠 확인.
- `GET /youtube/v3/comments?part=snippet&parentId=원문댓글ID`: 답글 조회.

기본 호스트는 `https://www.googleapis.com`이다. 목록 요청은 `maxResults=100`으로 조회하고 `nextPageToken`이 있으면 이어 읽는다. 사용자 범위가 따로 없으면 공개된 댓글을 대상으로 하며 비공개 검토 대기나 스팸 댓글을 임의로 승인하거나 처리하지 않는다.

`commentThreads`의 `replies.comments`에는 전체 답글이 포함되지 않을 수 있다. `totalReplyCount`가 누락되거나 목록과 모순되면 확인 불가로 처리한다. 답글 없는 후보는 게시 직전 `comments.list(parentId=...)`로 확인하고 어느 페이지에서든 답글이 발견되면 제외한다. 페이지를 끝까지 확인하지 못한 결과를 답글 없음으로 판정하지 않는다.

## 게시 직전 확인

`commentThreads.list(id=스레드ID,part=snippet)`로 다시 읽는다. 원문 댓글 ID, 영상 ID, 원문 내용, 작성 채널, `canReply`, `totalReplyCount`를 비교한다. 원문이 바뀌었으면 작성한 답글을 그대로 등록하지 않는다.

본인 댓글은 `topLevelComment.snippet.authorChannelId.value`로 판단한다. 최상위 스레드의 소속 채널 값이나 표시 이름으로 본인 여부를 판정하지 않는다. 새 답글 여부도 마지막으로 다시 확인한다. API에는 이 확인과 게시를 하나의 원자적 작업으로 처리하는 조건부 등록이 없으므로 두 요청 사이에도 답글이 생길 수 있다는 한계는 남는다.

## 답글 등록

`POST https://www.googleapis.com/youtube/v3/comments?part=snippet`에 아래 구조를 전달한다.

```json
{
  "snippet": {
    "parentId": "원문 최상위 댓글 ID",
    "textOriginal": "검토와 교정을 마친 답글"
  }
}
```

답글에는 `comments.insert`를 사용한다. `commentThreads.insert`는 새 최상위 댓글 등록이므로 이 작업에 쓰지 않는다. 성공 응답의 `id`를 기록하고 `comments.list(id=답글ID,part=snippet,textFormat=plainText)`로 `parentId`, 작성 채널과 `textOriginal`을 확인한다.

## 반영 지연과 불명확한 결과

등록 직후 조회에 아직 보이지 않을 수 있다. 발급된 ID로 최대 3회, 전체 30초 이내에서 읽기 조회를 하고 계속 확인되지 않으면 확인 필요로 남긴다. 원문 텍스트와 ID, 등록 응답을 보존하며 같은 POST를 반복하지 않는다.

등록 응답을 잃었으면 부모 댓글의 전체 답글을 조회해 본인 채널, 부모 ID, 정확한 답글 문구가 모두 일치하는지 확인한다. 일치가 확인되면 복구된 답글 ID를 기록한다. 비슷한 문구만으로 본인 답글이라고 확정하지 않는다. API 권한 오류나 댓글 비활성화는 확인한 안전한 오류 코드만 기록한다.

## 공식 문서

- [commentThreads.list](https://developers.google.com/youtube/v3/docs/commentThreads/list)
- [comments.list](https://developers.google.com/youtube/v3/docs/comments/list)
- [comments.insert](https://developers.google.com/youtube/v3/docs/comments/insert)
- [YouTube 인증](https://developers.google.com/youtube/data/guides/authentication)

API 동작이나 필요한 필드가 불확실하면 공식 문서를 확인한다. 과거 할당량이나 댓글 반영 시간을 보장값으로 사용하지 않는다.
