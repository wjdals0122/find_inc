# 결정: 채널 성과 통합 수집 스킬

- 날짜: 2026-11-17
- 결정 내용: `.agents/skills/channel-metrics/`에 Instagram·YouTube·Search Console을 한 번의 요청으로 수집하는 스킬을 만든다. YouTube와 Search Console은 기존 개별 스킬을 활용하고, 저장 요청 시 Supabase 중복 방지 저장과 채널별 검증을 수행한다.
- 이유: 사용자가 세 채널 성과를 한 큐에 수집하고 기존 두 스킬을 활용하도록 요청했다.
