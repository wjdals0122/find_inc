# 결정: Flutter Operation과 공개 성과 조회

- 날짜: 2026-11-20
- 결정 내용: 기존 웹 Operation 디자인·기능을 Flutter에 구현하고, Supabase Flutter 플러그인으로 `Find_performance`의 `channel_metrics`를 직접 읽는다. RLS와 익명 SELECT 정책을 적용하고 익명 쓰기 권한은 제거한다. 기존 Strategy·Contents는 유지한다.
- 이유: 사용자가 기존 Operation의 모바일 네이티브 구현과 성과 데이터 공개 읽기를 요청했다.
