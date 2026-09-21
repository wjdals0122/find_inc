# 링크 공유 썸네일

`share-card.html`은 수집한 실제 상품·브랜드 이미지로 구성한 썸네일 원본이다. `build-share-images.cjs`가 Playwright로 원본을 렌더링해 아래 PNG를 만든다. 제품 형태나 로고를 생성형 이미지로 재작성하지 않는다.

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| `../assets/share/dashboard-og-20261106.png` | 1200 × 630 | 기본 Open Graph 이미지, 큰 Twitter 카드 |
| `../assets/share/dashboard-og-square-20261106.png` | 1200 × 1200 | 정사각형 Open Graph 대체 이미지 |

가로 이미지의 핵심 문구와 두 상품은 중앙 630 × 630 영역 안에 배치된다. 플랫폼이 기본 이미지를 중앙 정사각형으로 자르더라도 핵심 내용이 유지된다. 정사각형 전용 이미지는 같은 구성을 확대해 배치했다. 플랫폼마다 이미지 선택·크롭 정책이 다르므로 두 이미지 중 어떤 것이 표시될지는 해당 플랫폼이 결정한다.

## 이미지 출처

- BMW X5 G65: 대시보드 내장 `01-strategy/brand/BMW/더뉴 BMW X5 G65/assets/bmw-g65-exterior.webp`. 공식 출처와 권리 상태는 [수집 기록](../../brand/BMW/더뉴%20BMW%20X5%20G65/assets/sources.json)에 따른다.
- BMW 로고: `01-strategy/brand/BMW/assets/BMW_dark.svg`. [브랜드 에셋 안내](../../brand/BMW/assets/README.md) 참조.
- LG 퓨리케어: 대시보드 내장 `01-strategy/brand/LG전자/퓨리케어 공기청정기/assets/thumb-03.webp`.
- LG 로고: 대시보드 내장 `01-strategy/brand/LG전자/assets/lg-logo-en-light.webp`.
- 글꼴: 대시보드 내장 `studio/ui-font.woff`. 원본 대시보드의 글꼴 라이선스 기록을 유지한다.

상품 이미지와 로고의 권리는 각 권리자에게 있다. 기존 수집 기록의 상업적 재사용 권한 미확인 상태를 그대로 유지하며, 이번 썸네일 생성으로 별도 이용 허가를 확보한 것으로 간주하지 않는다.

## 다시 만들기

저장소 루트에서 실행한다.

```powershell
npm ci --prefix 01-strategy/dashboard/tests
node 01-strategy/dashboard/tools/build-share-images.cjs
```

Chromium이 없으면 테스트 폴더에서 `npx playwright install chromium`을 먼저 실행한다. 결과 이미지는 `assets/share/`에 저장된다. `tools/`와 `tests/`는 Firebase Hosting 배포에서 제외한다.

공유 제목·설명·이미지 URL은 `dashboard.html`의 정적 `<head>`에 있어 로그인이나 JavaScript 실행 없이 읽을 수 있다. 이미지도 로그인 없이 HTTPS로 제공한다. 이미 공유한 링크의 카드가 갱신되지 않으면 해당 플랫폼의 미리보기 캐시를 갱신해야 할 수 있다.
