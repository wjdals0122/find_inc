# 결정: Google Search Console 성과 수집 스킬

- 날짜: 2026-11-17
- 결정 내용: 프로젝트 `.agents/skills/google-search-metrics/`에 날짜별 노출수·클릭수 수집과 Supabase 중복 방지 저장·검증 절차를 스킬로 만든다. 기존 랜딩 페이지 인증과 `03-operation/metrics/google-search/collect.py`를 활용한다.
- 이유: 사용자가 방금 수행한 Google Search Console 수집 과정을 `google-search-metrics` 스킬로 만들도록 요청했다.
