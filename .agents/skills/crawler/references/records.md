# 수집 기록 형식

기존 프로젝트 형식이 없으면 아래 구성을 쓴다. 데이터가 작으면 JSONL 대신 JSON 배열도 가능하다. 빈 디렉터리나 쓰지 않는 파일을 만들 필요는 없다.

```text
research/<topic-slug>/<YYYY-MM-DD>/
  manifest.json       # 범위, 예산, 집계, 재사용 위치
  records.jsonl       # 출처와 연결된 개별 근거
  raw/                # 허용된 원본 응답·본문·영상 보고서
  assets/             # 확인한 PDF·이미지·이미지 구간
  failures.jsonl      # 실패·부분 수집·판독 불가
  summary.md          # 결과 요약과 직접 출처
```

## 공통 근거 필드

| 필드 | 기록할 내용 |
|---|---|
| `id` | 이 수집물의 안정적인 로컬 ID |
| `source_type` | official_page, manual, review, post, comment, reply, video 등 |
| `subject` | 대상과 모델·버전·트림·지역 등 식별 조건 |
| `source_url`, `canonical_url` | 원래 출처 주소와 중복 판별용 주소 |
| `platform`, `platform_id` | 플랫폼과 실제 원본 ID; 미제공 시 null |
| `title`, `language` | 확인된 제목과 원문 언어 |
| `published_at` | 원문의 게시/수정 시각; 확인 불가 시 null |
| `collected_at` | 처음 확보한 시각, 예: 2026-10-30T16:00:00+09:00 |
| `verified_at` | 이번 확인 시각; 재사용해도 collected_at은 유지 |
| `collector` | 실제 도구, Actor/스크레이퍼 ID, run/snapshot/dataset ID |
| `acquisition` | fresh 또는 reused, 재사용한 기존 파일/레코드 위치 |
| `status` | complete, partial, failed, unreadable |
| `raw_path` | 허용된 원본의 상대 경로; 미보존 시 null과 이유 |
| `original_text` | 실제 확보한 원어 텍스트; 미확보 시 null |
| `text_kind` | verbatim, caption, ocr, gemini_report 등; 요약과 구분 |
| `translation`, `summary` | 번역과 요약; 원문을 덮어쓰지 않음 |
| `locator` | 단락/페이지/표/이미지 구간/원본 영상 시각 |
| `limitations` | 누락, 자료 성격, 판독 문제, 원문 보존 제한 |

검색 결과만 확보했으면 본문 근거와 분리해 후보로 남긴다. `complete`는 요청 범위의 실제 본문을 확보했다는 의미이며 사이트 전체를 수집했다는 뜻은 아니다. 본문 원문을 확보하지 못한 자료는 원문 필수 목표에서 완료 건수로 세지 않는다.

## 유형별 추가 필드

**상품:** `facts` 배열에 `name`, `value`, `unit`, `currency`, `tax_included`, `price_type`, `effective_date`, `applicability`, `locator`를 둔다. `price_type`은 list/promotion/transaction 등으로 구분한다. 필드별 출처가 다르면 `source_record_id`도 둔다. 선택 옵션과 기본 사양을 명시하고 미확인 값은 null로 남긴다.

**댓글/답글:** `root_post_id`, `root_post_url`, `parent_id`, `parent_type`, `permalink`, `collection_order`를 둔다. 플랫폼 ID와 로컬 ID를 섞지 않는다. 별도 ID 매핑이 필요하면 명시적으로 남긴다. 삭제된 원글의 내용을 추측하지 않으며 확보한 실제 ID·링크만 보존한다.

**댓글 수집 범위:** 원글 레코드에 `reported_comment_count`, `collected_comment_count`, `collected_reply_count`, `sort_order`, `filters`, `next_cursor`, `has_more`를 남긴다. 알 수 없는 has_more는 false 대신 null이다.

**영상:** `start_seconds`, `end_seconds`, `timestamp_url`, `evidence_kind`, `original_quote`, `screen_text`, `gemini_observation`, `report_path`를 둔다. evidence_kind는 native_caption/spoken_quote/screen_text/gemini_observation 등으로 구분한다. Gemini의 답변은 분석 보고서 원문일 뿐 발언의 축어록을 보장하지 않는다. 직접 확보한 원어 인용이 없으면 original_quote는 null로 둔다.

**이미지/PDF:** `asset_url`, `asset_path`, `page_number`, `image_width`, `image_height`, `segment_index`, `bounds`, `ocr_text`, `visual_checked`, `unreadable_regions`를 남긴다. bounds는 원본 픽셀 좌표 x/y/width/height 또는 문서에 정의한 위치 체계를 사용한다. 겹치는 이미지 구간의 텍스트는 근거 위치를 유지하면서 중복 제거한다.

## Manifest와 비용

- `topic`, `scope`, `requested_new_count`, `count_unit`, `time_window`, `languages`, `regions`, `sources`, `started_at`, `finished_at`, `timezone`, `existing_collection_paths`, `deduplication_status`를 기록한다.
- 결과 집계는 `new_complete`, `reused`, `partial`, `failed`, `unreadable`로 분리한다. 재사용 자료로 신규 건수를 채우지 않는다.
- `budget`에는 `limit`, `currency`, `spent_confirmed`, `spent_estimated`, `reserved_inflight`, `remaining_conservative`, `pricing_checked_at`, `cost_status`를 둔다. 비용 미확인은 0과 구분한다.
- `cost_ledger`의 호출별 항목은 도구·실행 ID, 과금 단위, 예상/확인 비용, 시작·종료 시각, 상태를 담는다. 중복 폴링이 별도 과금인지도 확인한다. 실행 중인 작업을 완료·무료로 기록하지 않는다.
- 출처가 갱신되면 기존 원문을 덮어쓰지 않고 새 버전과 `previous_record_id`를 남긴다. 해시 계산 도구가 있으면 원본 내용 해시로 변경·복제 여부를 확인할 수 있다.

## 실패 및 부분 수집 기록

`failures.jsonl`에는 `source_url`, `source_record_id`, `attempted_at`, `collector`, `run_id`, `status`, `error_code`, `error_message`, `missing_scope`, `retry_count`, `next_condition`을 저장한다. next_condition은 예산 추가, 인증 복구, 읽을 수 있는 이미지, 누락 페이지 접근 등 실제로 필요한 조건이다.

추출 결과가 빈 문자열인지, 접근 차단인지, 로그인 화면인지, 예산 제한인지 구별한다. 부분 수집은 확보한 원문을 보존하고 누락 범위를 명시한다. 실패 로그에 토큰·쿠키·민감한 쿼리 문자열이 있으면 가린다.
