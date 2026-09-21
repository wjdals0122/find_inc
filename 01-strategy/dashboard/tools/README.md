# 링크 공유 썸네일

`share-card.html`은 사이트의 밝은 모드에 맞춰 FIND.INC를 크게 강조하고 수집한 브랜드명을 아래에 나열한 썸네일 원본이다. `build-share-images.cjs`가 Playwright로 원본을 렌더링해 아래 PNG를 만든다.

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| `../assets/share/dashboard-og-light-v2.png` | 1200 × 630 | 기본 Open Graph 이미지, 큰 Twitter 카드 |
| `../assets/share/dashboard-og-square-light-v2.png` | 1200 × 1200 | 정사각형 Open Graph 대체 이미지 |

가로 이미지의 FIND.INC와 브랜드 목록은 중앙 630 × 630 영역 안에 배치된다. 플랫폼이 기본 이미지를 중앙 정사각형으로 자르더라도 핵심 내용이 유지된다. 정사각형 전용 이미지는 같은 구성을 확대해 배치했다. 플랫폼마다 이미지 선택·크롭 정책이 다르므로 두 이미지 중 어떤 것이 표시될지는 해당 플랫폼이 결정한다.

## 구성과 출처

- 중앙: FIND.INC 워드마크, 파란색 점과 스튜디오 이름.
- 하단: 기존에 조사·수집한 BMW, LG전자, 토스, 카카오, 신한은행의 브랜드명.
- 배경: 사이트 밝은 모드의 회색·흰색 배경과 파란색 포인트.
- 글꼴: 대시보드 내장 `studio/ui-font.woff`. 원본 대시보드의 글꼴 라이선스 기록을 유지한다.

이전 제품 사진 중심 썸네일은 사용자 피드백에 따라 이름 중심 구성으로 교체했다. 새 버전은 `light-v2` 이미지 주소를 사용하며 기존 파일은 이전 공유 링크와의 호환을 위해 남겨둔다.

## 다시 만들기

저장소 루트에서 실행한다.

```powershell
npm ci --prefix 01-strategy/dashboard/tests
node 01-strategy/dashboard/tools/build-share-images.cjs
```

Chromium이 없으면 테스트 폴더에서 `npx playwright install chromium`을 먼저 실행한다. 결과 이미지는 `assets/share/`에 저장된다. `tools/`와 `tests/`는 Firebase Hosting 배포에서 제외한다.

공유 제목·설명·이미지 URL은 `dashboard.html`의 정적 `<head>`에 있어 로그인이나 JavaScript 실행 없이 읽을 수 있다. 이미지도 로그인 없이 HTTPS로 제공한다. 이미 공유한 링크의 카드가 갱신되지 않으면 해당 플랫폼의 미리보기 캐시를 갱신해야 할 수 있다.

카카오톡에서 이전 주소의 캐시가 남을 때 사용할 별도 공유 주소는 `https://find-inc.web.app/share/light-v2/`다. 이 페이지는 새 공유 주소를 `og:url`로 사용하고 밝은 썸네일을 정적으로 제공한다. 브라우저에서 열면 기존 대시보드로 이동하고 로그인 절차를 그대로 따른다. 기존 주소의 카카오 캐시를 제거한 것은 아니며, 기존 채팅 메시지의 카드를 소급해서 수정하지 않는다. 원래 주소를 계속 공유하려면 [카카오톡 URL 메타정보 관리](https://developers.kakao.com/tool/debugger/sharing)에 로그인해 해당 주소의 공유 정보를 초기화한다.

## 파비콘

`build-favicon.cjs`는 FIND.INC의 F에 수집한 [BMW 공식 로고 원본](../../brand/BMW/assets/README.md)을 작은 배지로 결합한다. 생성 파일은 `assets/icons/find-bmw-v1.svg`, 32px PNG, 180px 홈 화면용 PNG와 루트의 다중 크기 `favicon.ico`다. 사용한 BMW 상표의 외부 상업적 재사용 권한은 미확인이다. 썸네일 생성과 같은 Playwright 설치 후 `node 01-strategy/dashboard/tools/build-favicon.cjs`로 다시 만든다.
