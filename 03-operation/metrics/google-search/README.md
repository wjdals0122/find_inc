# Google Search Console 일별 성과

```powershell
python 03-operation/metrics/google-search/collect.py --days 7
```

`--end YYYY-MM-DD`로 종료일을 지정한다. 기본은 한국 날짜 기준 어제까지 최근 7일이며 Search Console의 일별 집계는 미국 태평양 시간이다.

기존 `03-operation/channels/landing-page/search_console.py`와 해당 폴더의 보호된 OAuth 연결을 그대로 활용한다. Python requests와 기존 토큰을 복호화할 수 있는 Windows 사용자 환경이 필요하다. 인증 정보는 출력하지 않는다.

- 대상 페이지: `https://find-inc.web.app/`. 접근 가능한 Search Console 속성을 조회한 뒤 이 페이지와 정확히 일치하는 필터로 검색 유형 `web`을 요청한다.
- 지표: `impressions`(노출수, 회), `clicks`(클릭수, 회).
- 데이터 상태: `all`. `first_incomplete_date`가 반환되면 해당 날짜부터 미확정 데이터로 구분한다.
- API가 반환하지 않은 날짜는 0으로 보완하지 않는다.
- 결과와 저장 SQL은 `latest.json`에 저장한다. 매 실행 덮어쓰므로 실패 후 이전 결과를 저장에 사용하지 않는다.
- 기존 수집기의 상세 보고서는 `03-operation/channels/landing-page/analytics/`에 생성된다.

## Supabase 저장

수집 코드는 DB에 직접 접속하지 않는다. 저장이 요청되면 Supabase 플러그인의 `execute_sql`로 현재 결과의 `sql`을 프로젝트 `jktfoktelryczucpzvcu`에 실행한다. null이면 저장할 행이 없다. 실행 전에 `list_tables`로 스키마를 확인하고 대상 기간의 기존 데이터를 조회한다.

테이블은 `public.channel_metrics`, `channel`은 `google-search`, `account_id`는 대상 페이지 URL이다. 페이지 필터를 바꾸면 같은 계정 식별자로 혼합 저장하지 않는다. `(channel, account_id, metric_date, metric_name)`가 같은 행은 건너뛰며 기존 값을 변경하지 않는다. 트랜잭션 안의 테이블 쓰기 잠금으로 동시 저장 중복을 방지한다. 저장 후 SELECT로 실제 값과 키별 중복을 확인한다. 미확정 수치가 나중에 바뀌더라도 이 코드는 기존 수치를 갱신하지 않으므로 차이가 있으면 보고한다.

2026-11-17 실행 결과: 2026-11-10~16 요청 성공, API 반환 행 0개. 모든 날짜 미제공. 실제 수치가 0인지 판단할 수 없으므로 삽입하지 않았다. Supabase의 해당 채널·계정·기간 기존 행도 0개였다.
