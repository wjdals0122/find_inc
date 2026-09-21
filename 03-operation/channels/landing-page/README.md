# 랜딩 페이지 채널

랜딩 페이지 채널의 연동 기능과 운영 자료를 이 폴더에서 관리한다.

- 연동 기능: 게시·분석 도구 연동 코드, 설정 예시와 사용 안내.
- 운영 자료: 배포·수정 기록, 실험 계획과 성과 분석.

공통 저장 규칙은 [채널 관리 가이드](../../../docs/guides/channel-management.md)를 따른다.

## Search Console 검색 성과

YouTube 채널의 데스크톱 OAuth 클라이언트와 암호화한 기존 토큰을 이 폴더의 `.private/`에 복제해 사용한다. 원본 YouTube 인증 파일은 변경하지 않으며 Search Console 추가 인증 결과는 이 폴더에만 저장한다. `.private/`와 인증 JSON은 Git에서 제외하고 현재 Windows 사용자와 SYSTEM으로 접근을 제한한다. 토큰은 기존과 동일한 Windows DPAPI 방식으로 암호화한다.

`python 03-operation/channels/landing-page/search_console.py --days 7`로 오늘을 제외한 최근 7일의 일별 노출수와 클릭수를 조회한다. 종료 날짜는 `--end YYYY-MM-DD`로 지정한다. 최초 사용 시 같은 OAuth 클라이언트에 `webmasters.readonly` 권한을 승인해야 한다.

조회 대상은 `https://find-inc.web.app/`이며 Search Console의 접근 가능한 속성을 확인한 뒤 해당 페이지로 필터링한다. 검색 유형은 `web`, 날짜는 미국 태평양 시간 기준이다. 최신 데이터를 포함해 요청하고 API가 미확정으로 표시한 날짜는 보고서에서 구분한다. 반환되지 않은 날짜를 실제 0회로 단정하지 않는다.

보고서는 `analytics/search-console-YYYYMMDD-N.md`에, API 원본 응답은 Git 제외 경로인 `.private/`에 저장한다. 인증 정보, 토큰과 인증 코드는 채팅, 로그, 명령 인자나 보고서에 출력하지 않는다.
