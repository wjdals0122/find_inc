# YouTube 일별 성과 수집

기존 `03-operation/channels/youtube/`의 DPAPI OAuth 연결을 사용한다. 인증 정보는 출력하지 않는다.

```powershell
python 03-operation/metrics/youtube/collect.py --days 7
```

기본 요청 기간은 한국 날짜 기준 어제까지 7일이다. `--end YYYY-MM-DD`로 종료일을 지정할 수 있다. 각 날짜의 집계 경계는 YouTube Analytics의 미국 태평양 시간이다.

- `views`: 조회수(회).
- `estimatedMinutesWatched`: 추정 시청 시간(분).
- API 미제공 날짜는 0으로 보완하거나 저장하지 않는다.
- `latest.json`에 날짜별 응답, 누락 날짜와 저장 SQL을 기록한다. 인증 정보는 포함하지 않는다.
- 생성한 SQL은 Supabase 플러그인의 `execute_sql`로 프로젝트 `jktfoktelryczucpzvcu`에 실행한다. 수집 코드 자체는 DB에 접속하지 않는다.
- 저장 대상은 `public.channel_metrics`. 채널·계정·날짜·지표가 같은 행은 건너뛴다. 트랜잭션의 테이블 쓰기 잠금으로 동시 실행 시 중복 삽입도 막는다. 기존 수치는 덮어쓰지 않는다.
- 저장 후 같은 기간을 조회해 행 수와 키별 중복 여부를 확인한다.

2026-11-17 실행: 2026-11-10~16 요청. 10~14일은 두 지표 모두 0으로 반환되어 10행 저장. 15~16일은 API 미제공으로 저장하지 않음. 같은 저장 SQL 재실행 후에도 총 10행이며 중복 없음 확인.
