---
name: channel-metrics
description: Instagram, YouTube, Google Search Console의 최근 7일 또는 지정 기간 성과를 한 번의 요청으로 수집한다. 기존 youtube-metrics와 google-search-metrics 스킬을 활용하고, 요청에 따라 Supabase channel_metrics에 중복 없이 저장해 채널별 결과를 통합 보고한다.
---

# 채널 성과 통합 수집

프로젝트 루트에서 Instagram·YouTube·Search Console 성과를 한 번의 요청으로 처리한다. 사용자에게 각 채널 스킬을 따로 실행하도록 요구하지 않는다. 수집·저장 요청은 지정 범위의 저장까지 수행하고 조회만 요청하면 저장하지 않는다. 이 스킬을 만드는 요청 자체로 실제 수집이나 저장을 실행하지 않는다.

## 공통 범위

- 채널 미지정 시 세 채널 모두 대상으로 한다. 사용자가 일부만 지정하면 그 범위로 제한한다.
- 기간 미지정 시 한국 날짜 기준 어제까지 최근 7일이다. 시작·종료 날짜를 작업 시작 시 한 번 계산하고 모든 수집기에 동일한 종료 날짜와 일수를 명시한다. 자정을 지나도 채널별 요청 기간이 달라지지 않게 한다.
- 동일 날짜 표기를 사용해도 집계 경계는 서비스마다 다를 수 있다. YouTube·Search Console은 미국 태평양 시간이며 Instagram은 현재 API와 계정의 집계 시간대를 확인해 기록한다. 확인하지 않은 시간대를 가정하거나 서로 다른 집계 경계를 한국 시간으로 단순 재명명하지 않는다.
- 한 채널의 인증 실패·미제공으로 나머지 채널을 중단하지 않는다. 채널별 성공·부분 성공·미제공·실패·확인 필요를 구분한다. 실패는 0이 아니다.
- 기존 인증 연결을 사용한다. 토큰·비밀 키·인증 코드·콜백 URL과 인증이 포함된 요청 URL은 채팅·로그·문서·Git에 출력하지 않는다. 인증 파일을 통째로 읽어 도구 출력에 노출하지 않는다.

## 채널별 수집

### YouTube

[youtube-metrics](../youtube-metrics/SKILL.md)를 읽고 적용한다. 절차를 복제하거나 새 OAuth 연결을 만들지 않는다.

```powershell
python 03-operation/metrics/youtube/collect.py --end YYYY-MM-DD --days 7
```

인증 출처는 `03-operation/channels/youtube/`, 지표는 `views`(회), `estimatedMinutesWatched`(분)다. 저장 시 `channel='youtube'`, `account_id`는 확인된 채널 ID다.

### Google Search Console

[google-search-metrics](../google-search-metrics/SKILL.md)를 읽고 적용한다.

```powershell
python 03-operation/metrics/google-search/collect.py --end YYYY-MM-DD --days 7
```

인증 출처는 `03-operation/channels/landing-page/`다. 기본 대상 페이지는 `https://find-inc.web.app/`, 검색 유형은 `web`이다. 지표는 `impressions`와 `clicks`(회). 저장 시 `channel='google-search'`, `account_id`는 대상 페이지 URL이다. 미확정 날짜를 구분한다.

### Instagram

먼저 `03-operation/channels/instagram/README.md`와 현재 연동 코드를 확인한다. 기존 인증 출처는 해당 폴더 `.env`의 `INSTAGRAM_ACCESS_TOKEN`이다. 값은 프로세스 내부에서만 읽고 환경 파일 전체나 예외 원문을 출력하지 않는다.

2026-11-17의 운영 기록에는 토큰 오류(code 190)가 있지만 이를 현재 인증 상태로 단정하지 않는다. 실제 수집 요청 때 최소한의 계정 조회로 현재 유효성을 확인한다. 토큰 접두사만으로 Instagram Login/Facebook Login 방식을 판정하지 않는다. 기존 설정과 현재 공식 Meta 문서로 로그인 방식, API 호스트·지원 버전·계정 식별 방법·Insights 권한을 확인한다. 임의의 여러 호스트로 토큰을 전송하며 시험하지 않는다.

- 재사용 가능한 수집 코드가 없으면 실제 수집 작업 범위에서 `03-operation/metrics/instagram/`에 만든다. 인증 관리는 기존 채널 폴더에 유지한다.
- 사용자 지정 지표를 우선한다. 미지정 시 현재 API에서 지원하는 계정 단위 일별 `views`와 `reach`를 우선 조회한다. 지원하지 않는 지표는 대체 지표의 의미와 지원 여부를 확인한 뒤 선택하고 원래 지표와 혼동하지 않게 보고한다. 과거 `impressions` 지원을 가정하지 않는다.
- 날짜 차원과 일별 값이 실제 제공되는지 확인한다. 기간 전체 합계, 현재 팔로워 수, 게시물 누적 조회수를 날짜별 계정 성과로 나눠 넣지 않는다. 페이지가 있으면 끝까지 조회하고 중복 날짜·지표를 검사한다.
- API `end_time` 등 날짜 필드의 의미와 집계 시간대를 공식 문서로 확인해 `metric_date`로 매핑한다. 확인할 수 없으면 해당 행을 저장하지 않고 이유를 남긴다.
- 인증 오류·권한 부족이면 해당 채널의 조회를 중단하고 필요한 재연결을 알린다. 유효한 토큰을 채팅으로 요청하지 않는다. 연결 복구를 이유로 다른 채널의 인증 파일을 덮어쓰지 않는다.
- 실제 응답의 0만 사용한다. 미지원·미반환 날짜는 미제공으로 구분한다. 저장 시 `channel='instagram'`, `account_id`는 검증된 Instagram 계정 ID, `metric_name`은 API 지표명, 단위는 API 정의를 사용한다.

## Supabase 저장과 검증

저장이 요청되면 Supabase 스킬과 **Supabase 플러그인**을 사용한다. 기본 대상은 프로젝트 `jktfoktelryczucpzvcu`(`Find_performance`), `public.channel_metrics`다. `list_tables`로 현재 열을 확인하고 대상 채널·계정·기간의 기존 행을 SELECT한다. 스키마를 임의로 변경하지 않는다.

YouTube·Search Console은 각 하위 스킬이 생성한 현재 실행의 SQL을 사용한다. 수집 실패 후 이전 `latest.json`을 사용하지 않는다. `sql=null`이면 삽입할 데이터가 없다.

Instagram 저장도 다음 조건을 동일하게 적용한다.

- 열은 `channel`, `account_id`, `metric_date`, `metric_name`, `metric_value`를 사용하며 `id`와 기본 수집 시각은 DB가 생성한다.
- `(channel, account_id, metric_date, metric_name)` 기준으로 기존 행을 건너뛴다. 고유 제약이 없으므로 단독 `NOT EXISTS`만 쓰지 말고 트랜잭션 안에서 `LOCK TABLE public.channel_metrics IN SHARE ROW EXCLUSIVE MODE` 후 삽입한다. 값은 검증하고 SQL 문자열은 안전하게 인용한다.
- 기존 값이나 중복 행을 수정·삭제하지 않는다. API 최신 값과 기존 값이 다르면 차이를 보고하고 별도 갱신 지시 없이 변경하지 않는다.
- 채널별 저장은 순서대로 실행한다. 한 채널 저장이 실패하면 반영 여부를 SELECT로 확인하고 다른 채널은 계속 처리한다. 전체 작업을 무조건 반복하지 않는다.
- 저장 후 해당 범위를 다시 조회해 API 값과 대조하고 키별 중복 건수를 확인한다. 응답이 비었다는 이유만으로 저장 성공이라고 판단하지 않는다.

## 통합 보고

`03-operation/metrics/reports/channel-metrics-YYYYMMDD-N.md`에 한국 날짜와 미사용 번호로 실행 기록을 만든다. 기존 파일을 덮어쓰지 않는다. 채널별 요청 기간, 계정·페이지, 지표·단위, 집계 시간대, 반환 날짜, 누락·미확정 날짜, 오류 사유와 DB 검증 결과를 기록한다. 비밀값이나 불필요한 개인정보는 포함하지 않는다.

사용자에게는 채널별 수집 상태·신규 저장 건수·기존 데이터로 건너뛴 건수·미제공 날짜를 한 표로 요약하고 일별 결과와 기록을 링크한다. 신규 건수를 검증할 수 없으면 총 저장 건수만 표시한다. 세 채널 모두 성공하지 않았다면 전체 성공으로 표현하지 않는다. 의미·단위가 다른 지표를 합산해 전체 성과 수치를 만들지 않는다.
