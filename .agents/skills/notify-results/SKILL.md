---
name: notify-results
description: 검증과 GitHub push를 마친 여섯 전략 스킬의 핵심 결과와 산출물 링크를 카카오톡 나에게 보내기, 슬랙, SenderKit 이메일로 보낸다.
---

# 완료 알림

[완료 알림 가이드](../../../docs/guides/skill-result-notifications.md)를 읽는다. 이 스킬은 상위 여섯 스킬의 마지막 단계이며 조사나 push를 대신하지 않는다.

## 준비

- 상위 작업의 검증 성공과 필요한 원격 반영을 확인한다.
- 최신 환경 상태와 HTTP 시크릿의 이름, 대상 도메인, readiness를 확인한다.
- `KAKAO_ACCESS_TOKEN`, `SLACK_WEBHOOK_PATH`를 우선하며 기존 `KAKAO`, `SLACK` 바인딩은 용도가 일치할 때만 사용한다.
- `config.json`의 이메일은 사용자가 완료 알림 수신처로 직접 지정한 주소이며 이번 대화에서 다른 주소를 지정하면 최신 지시를 우선한다.
- 실행별로 고유하고 재시도에는 유지되는 `run_id`를 정하고 임시 입력과 채널별 전송 기록은 Git 추적에서 제외된 `work/`에 둔다.
- 민감한 원문, 불필요한 개인정보, 키, 토큰, 웹훅 경로를 메시지와 기록에서 제외한다.

입력은 다음 구조로 직접 작성한다. 실제 결과와 주소로 바꾸며 예시를 그대로 보내지 않는다. `artifacts`는 최대 다섯 개이며 카카오 버튼에는 첫 링크를 쓴다. 카카오 본문이 200자를 넘으면 의미를 보존해 입력을 줄이고 다시 미리 본다.

```json
{
  "status": "success",
  "run_id": "product-example-commit-run",
  "skill": "product",
  "title": "상품명 상품 조사 완료",
  "highlights": ["가격과 사용 조건을 확인했습니다.", "후기에서 반복된 장단점을 정리했습니다."],
  "artifacts": [{"name": "상품 보고서", "url": "https://github.com/OWNER/REPO/blob/COMMIT/PATH/product.md"}],
  "note": "장기 사용 후기는 확인하지 못했습니다."
}
```

## 카카오톡과 슬랙

프로젝트 루트에서 각 채널을 따로 실행한다. 비밀값을 명령 인수에 넣지 않는다. 스크립트는 Python 표준 라이브러리를 사용하며 HTTP 프록시와 CA 설정을 유지하고 리다이렉트를 차단한다.

```bash
python .agents/skills/notify-results/scripts/notify.py --payload-file work/result.json --channel kakao
python .agents/skills/notify-results/scripts/notify.py --payload-file work/result.json --channel slack
```

미리보기에서 사실, 링크, 문장과 길이를 확인한 뒤 각 명령에 `--send`를 붙여 전송한다. 카카오톡은 `/v2/api/talk/memo/default/send`로 나에게 보내기만 수행한다. 슬랙은 고정된 `hooks.slack.com` 호스트와 HTTP 시크릿 경로만 사용한다. 다른 채널 API나 수신자 검색을 사용하지 않는다.

채널별 `accepted`, `failed`, `unknown` 결과를 기록하고 성공한 채널은 다시 보내지 않는다. 전송 직전에 기록을 `sending`으로 저장하고 프로세스가 중단됐다면 해당 채널은 수락 여부를 확인하기 전 재시도하지 않는다. 스크립트의 미리보기는 전송하지 않으며 상태 기록과 중복 방지는 호출한 에이전트가 맡는다.

## SenderKit 이메일

현재 제공되는 SenderKit 메시징 스킬과 도구 스키마를 읽고 `senderkit_context`로 workspace와 `live`/`test`를 확인한다. 사용자가 요청한 향후 자동 완료 알림과 지정한 수신처는 이미 전송을 승인한 범위이므로 매번 승인을 다시 묻지 않는다. 다른 수신처, 별도 테스트 메일이나 추가 첨부는 이 승인에 포함되지 않는다.

```bash
python .agents/skills/notify-results/scripts/notify.py --payload-file work/result.json --channel email
```

출력한 `channel`, `subject`, `html`, `text`, `idempotencyKey`, `metadata`를 실제 `senderkit_send_raw` 도구의 해당 인자로 전달한다. `to`에는 사용자가 지정한 `config.json`의 수신처를 넣고 도구 스키마가 요구하는 분석용 `context`도 작성한다. 셸에서 이메일 REST API를 호출하거나 플러그인 인증을 추출하지 않는다. `from`, `replyTo`, `cc`, `bcc`, `attachments`는 지정하지 않는다.

반환된 mode, 상태와 메시지 ID를 기록한다. `test`는 실제 배달이 없으므로 전송 완료라고 쓰지 않는다. `queued`는 접수로 보고하고 배달 확인이 필요하면 `senderkit_messages_get`으로 확인한다. 플러그인이 없거나 수신 주소를 알 수 없으면 이메일만 미전송으로 보고하며 다른 제공자로 우회하지 않는다.

## 최종 보고

산출물 링크와 함께 카카오톡, 슬랙, 이메일을 각각 `접수`, `배달 확인`, `미전송`, `실패`, `확인 불가` 중 실제 확인한 상태로 짧게 알린다. 슬랙 화면을 보지 못했다면 payload만 검증했다고 밝힌다.
