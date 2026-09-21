# FIND.INC — AI 에이전트가 운영하는 마케팅 전략 시스템

> 마케팅 에이전시 "주식회사 파인드"의 전략 업무를 AI 코딩 에이전트(Codex · Claude Code · Gemini)가 수행하도록 설계한 저장소
> **에이전트 규칙 체계**, **업무 스킬 12종**, **검증 → 커밋 → push → 알림 자동화**, **Firebase로 배포한 전략 대시보드**로 구성

---

## 1. 한눈에 보기

| 영역 | 구현 내용 |
|---|---|
| **에이전트 운영 체계** | `AGENTS.md` 하나를 규칙의 기준으로 두고 `CLAUDE.md`·`GEMINI.md`가 이를 불러오게 해서, 도구가 달라도 같은 규칙으로 동작 |
| **업무 자동화** | 브랜드·상품·경쟁사·고객 조사부터 마케팅 브리프, 대시보드 반영까지 스킬 12종으로 절차화 |
| **운영 자동화** | 스킬 산출물을 검증한 뒤 대상 파일만 커밋·push하고, 원격 반영을 확인한 다음 카카오톡·Slack·이메일로 결과 알림 |
| **배포** | 전략 대시보드를 Firebase Hosting으로 배포하고 Firebase Authentication으로 로그인·회원가입 연결 |
| **테스트** | Playwright로 인증 흐름 E2E 테스트, 알림 스크립트 단위 테스트 8종 (시크릿 유출·호스트 주입 방지 포함) |
| **보안** | 시크릿을 허용된 호스트로만 전달하는 바인딩, 비밀 정보 커밋 차단, 개인정보 확인 절차, 보안 응답 헤더 |
| **협업 이력** | GitHub Issue → 작업 브랜치 → PR 흐름, 결정 기록 13건 |
| **문서화** | 규칙(가이드)과 결정 이력(decisions)을 분리하고, 결정 이유를 확인된 내용만 기록 |

---

## 2. 개발 환경과 기술 스택

### 2.1 개발 환경

| 구분 | 내용 |
|---|---|
| AI 코딩 에이전트 | Codex (클라우드 작업 환경 `/workspace`), Claude Code, Gemini |
| 실행 환경 | Python 3, Node.js |
| 배포 | Firebase CLI (Hosting, Authentication) |
| 버전 관리 | Git, GitHub (Issues, Pull Requests) |
| 편집기 | VS Code |

### 2.2 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 에이전트 규칙·스킬 | `AGENTS.md`, `SKILL.md` 기반 프로젝트 스킬 (`.agents/skills/`) |
| 웹 수집 | Bright Data, Apify, 공식 페이지 직접 확인 |
| 영상 분석 | yt-dlp, ffmpeg, WhisperX·Whisper (자막 대체), Gemini (영상 직접 분석) |
| 알림 | Kakao 나에게 보내기 API, Slack Incoming Webhook (Block Kit), SenderKit 이메일 |
| 대시보드 | 단일 HTML (CSS·JavaScript), Firebase JS SDK |
| 인증·호스팅 | Firebase Authentication (이메일·비밀번호), Firebase Hosting |
| 테스트 | Playwright (Chromium), Python `unittest` |

---

## 3. 배경

### 3.1 출발점
- 마케팅 전략 업무는 매번 비슷한 순서로 반복됨
  - 브랜드 조사 → 상품 조사 → 경쟁사 비교 → 고객 조사 → 마케팅 메시지와 브리프 → 보고
- 이 반복 업무를 AI 에이전트에게 맡기면 속도는 빨라지지만, 그대로 쓰면 운영하기 어려운 문제가 생김
  - 세션이 바뀌면 이전에 합의한 규칙과 맥락을 다시 설명해야 함
  - 출처 없이 그럴듯한 정보를 만들 수 있음
  - 결과물이 에이전트의 작업 환경에만 남고 저장소에 반영되지 않을 수 있음
  - 작업이 끝났는지, 성공했는지를 사람이 계속 확인해야 함
  - Codex, Claude Code, Gemini마다 규칙 파일이 달라 같은 지시를 여러 번 관리해야 함

### 3.2 설계 방향
- 리더십 원칙 중 **Think Systematically**("성공한 경험은 재현될 수 있도록, 결함은 재현되지 않도록 시스템화한다")를 저장소 구조로 구현

| 문제 | 해결 방식 |
|---|---|
| 규칙과 맥락이 세션마다 사라짐 | 규칙을 저장소 문서로 고정하고, 에이전트가 작업 시작 시 읽도록 함 (`AGENTS.md`) |
| 도구마다 규칙 파일이 다름 | `CLAUDE.md`, `GEMINI.md`는 `@AGENTS.md` 한 줄로 같은 규칙을 불러옴 |
| 출처 없는 정보 | 수집 기록에 원문·출처·수집 시각·상태를 필수로 남기고, 해석과 분리 |
| 결과물 누락 | 산출물을 만들면 검증 후 커밋·push하고 원격 반영까지 확인하는 절차를 규칙으로 지정 |
| 완료 확인 부담 | 검증과 push가 끝난 성공 결과만 세 채널로 자동 알림 |
| 같은 실수 반복 | 사용자가 정한 규칙은 `/remember`로 가이드에 저장하고, 결정은 날짜별로 기록 |

---

## 4. 시스템 구조

```mermaid
flowchart LR
    U[대표<br/>목표 설정·최종 결정] -->|요청| A

    subgraph RULES[규칙 계층]
        A[AGENTS.md<br/>짧은 지시 + 링크] --> G[docs/guides<br/>상세 절차]
        A --> D[docs/decisions<br/>결정 이력]
        C1[CLAUDE.md] -.->|@AGENTS.md| A
        C2[GEMINI.md] -.->|@AGENTS.md| A
    end

    A --> S[.agents/skills<br/>업무 스킬]
    S --> R[research<br/>수집 기록]
    S --> O[01-strategy<br/>전략 산출물]
    O --> DB[전략 대시보드]
    O --> V{검증}
    V -->|성공| P[대상 파일만 커밋<br/>GitHub push<br/>원격 반영 확인]
    P --> N[완료 알림<br/>카카오톡 · Slack · 이메일]
    DB --> H[Firebase Hosting<br/>+ Authentication]
```

### 4.1 조직 구조와 폴더 대응

| 조직 | 역할 | 저장소 위치 |
|---|---|---|
| 대표 (사용자) | 목표 설정과 최종 의사결정 | 요청, `/remember`로 규칙 지정 |
| 전략 | 회사·경쟁사·고객 분석과 마케팅 전략 | `01-strategy/` |
| 콘텐츠 | 카피·이미지·영상·랜딩 페이지 제작 | `02-contents/` (예정) |
| 운영 | 채널 운영과 성과 분석 | `03-operation/` (`work` 브랜치에서 YouTube·Google Search Console 연동 진행 중) |

---

## 5. 에이전트 규칙 체계

### 5.1 규칙의 단일 기준
- `AGENTS.md`에는 회사 정보, 조직도, 회사 규칙만 짧게 두고 상세 절차는 가이드 링크로 연결
- `CLAUDE.md`, `GEMINI.md`는 내용 없이 `@AGENTS.md`만 포함 → 규칙을 한 곳에서만 수정
- 규칙 문서와 결정 기록을 분리
  - `docs/guides/`: 지금 지켜야 할 규칙
  - `docs/decisions/`: 그 규칙이 언제, 왜 정해졌는지

### 5.2 가이드 구성

| 가이드 | 내용 |
|---|---|
| `leadership-principles.md` | Aim High and Find a Way, Think Systematically, Company-wide Perspective, Simplify, Dive Deep |
| `rule-memory.md` | 규칙을 기억하라는 요청 처리: 관련 가이드에 정리 → `AGENTS.md`에 링크 → 중복 병합 → 충돌 시 사용자 확인 |
| `decision-recording.md` | 확정된 결정만 `YYYY-MM-DD-주제.md`로 기록. 이유가 확인되지 않으면 지어내지 않고 "확인되지 않음"으로 기록 |
| `privacy-protection.md` | 외부 유출 우려가 있는 개인정보는 공유·공개 전에 사용자 확인. 확인 요청 시 원문을 다시 노출하지 않음 |
| `cloud-workspace.md` | 클라우드에서는 `/workspace/<프로젝트>`를 기준으로 작업. 스킬은 프로젝트의 `.agents/skills/`에서 찾고, 못 찾으면 확인한 경로와 함께 누락을 보고 |
| `skill-output-git-push.md` | 산출물 커밋·push 절차 (7장) |
| `skill-result-notifications.md` | 완료 알림 절차 (7장) |
| `company-updating.md` | 회사 정보·조직 변경이 확정되면 `docs/company/company.md`에 반영 |

### 5.3 규칙이 쌓이는 방식
1. 사용자가 "앞으로 이렇게 해 줘"라고 요청
2. `/remember` 스킬이 관련 가이드를 찾아 규칙을 추가하거나 새 가이드를 만듦
3. `AGENTS.md`의 회사 규칙에 링크와 한 줄 지시를 추가
4. 기존 규칙과 충돌하면 바꾸기 전에 사용자에게 확인
5. 중요한 결정은 `docs/decisions/`에 날짜·결정·이유로 기록

- 예시: 클라우드에서 스킬을 찾지 못한 문제 → `cloud-workspace.md` 규칙 추가 → `2026-11-04-cloud-workspace-skills.md` 기록

---

## 6. 업무 스킬

### 6.1 스킬 구성

| 구분 | 스킬 | 역할 | 주요 산출물 |
|---|---|---|---|
| 전략 | `/brand` | 공식 아이덴티티 자료로 브랜드 리서치, 디자인 시스템 정리 | `brand.md`, `DESIGN.md`, 공식 에셋 |
| 전략 | `/product` | 공식 정보·가격·사용 조건·실사용 후기·장점의 근거 정리 | `product.md`, 상품 이미지 |
| 전략 | `/competitor` | 경쟁 상품과 대체재 탐색, 동등 조건 비교, 추천 고객 정리 | `competitor.md` |
| 전략 | `/customer` | 사용 상황·니즈·사용 경험·구매 전 우려를 실제 발언으로 분석 (하위 스킬 4개) | `customer.md`, `sources.md` |
| 전략 | `/marketing-brief` | 조사 근거를 구매 이유별 메시지로 연결하고 채널별 제작 가이드 작성 | `marketing_messages.md`, `brief.md` |
| 전략 | `/strategy-dashboard` | 전략 문서 다섯 종을 기존 대시보드에 연결, 요청 시 소유자 전용 배포 | `dashboard.html` |
| 조사 도구 | `/crawler` | 웹·공식 정보·게시물·댓글 수집. 기존 자료 재사용, 예산 내 수집 | `research/<주제>/<날짜>/` |
| 조사 도구 | `/watch` | 영상 다운로드, 프레임 추출, 자막·음성 인식 또는 Gemini 영상 분석 | 구간별 근거 리포트 |
| 품질 | `/natural-korean` | 한국어 산출물의 번역투·AI 말투를 찾아 의미를 유지하며 수정 | 교정된 문서 |
| 운영 | `/remember` | 사용자 규칙을 가이드와 `AGENTS.md`에 저장 | 가이드, 결정 기록 |
| 운영 | `/notify-results` | 전략 스킬 성공 결과를 세 채널로 알림 | 채널별 전송 상태 |
| 운영 | `/team-lead` | 독립 작업을 여러 에이전트에 나누고 결과를 검토해 합침 | 통합 결과, 검사 결과 |

- `/natural-korean`은 NomaDamas/k-skill의 `korean-humanizer`를 프로젝트 규칙에 맞게 다시 쓴 스킬이며, 출처와 MIT 라이선스를 `UPSTREAM.md`에 보존

### 6.2 스킬 설계 원칙
- **범위를 넘지 않음**: 사이트 후보만 요청하면 탐색까지만 수행하고, 하지 않은 조사를 완료했다고 보고하지 않음
- **기존 자료 우선**: 작업 전에 `rg`로 기존 문서·수집 기록·에셋을 찾아 재사용하고, 사용자가 수정한 파일은 다시 읽음
- **대상에 종속되지 않음**: 특정 회사·국가·폴더를 가정하지 않고 요청받은 브랜드와 저장 위치를 입력으로 받음
- **근거와 해석 분리**: 원문과 번역·요약을 다른 필드에 저장하고, 모든 주장을 원문 위치까지 추적 가능하게 유지
- **비용 통제**: 수집 건수·예산 상한처럼 실행에 꼭 필요한 사항만 묻고, 답을 기다리는 동안 기존 자료 정리는 계속 진행

### 6.3 병렬 작업 (`/team-lead`)
- 팀장 에이전트가 작업을 나누고, 작업자 에이전트가 정해진 범위의 결과를 만듦
- 업무 유형별로 모델과 추론 수준(effort)을 다르게 배정

| 업무 유형 | 배정 기준 |
|---|---|
| 팀장, 코드 작업, 마케팅 분석 | 상위 모델, 높은 추론 수준 |
| 마케팅 조사, 콘텐츠 생성 | 경량 모델, 낮음~중간 추론 수준 |
| 어느 유형에도 맞지 않음 | 기본값 사용 |

- 진행 규칙
  - 담당 파일이 겹치지 않게 나누고, 코드 충돌 가능성이 있으면 작업 폴더를 분리
  - 독립 작업은 동시에, 선행 결과가 필요한 작업은 결과를 받은 뒤 시작
  - 합치기 전에 실제 결과물과 검사 결과를 원래 요청과 대조

---

## 7. 운영 자동화

### 7.1 산출물 GitHub push
전략 스킬 6종이 산출물을 만들거나 수정하면 검증 후 커밋·push까지 수행

| 단계 | 내용 |
|---|---|
| 1. 상태 확인 | `git status`, 현재 브랜치, upstream, 원격 주소 확인. 기존 변경은 보존 |
| 2. 검증 | 스킬별 산출물 검증 완료. API 키·`.env`·쿠키·임시 파일·사용자 원본은 제외 |
| 3. 대상 파일만 stage | 경로를 명시해 stage. `git add .`, `git add -A` 금지. 기존 staged 변경은 건드리지 않음 |
| 4. 커밋 | 실제 변경을 설명하는 메시지. 변경이 없으면 빈 커밋을 만들지 않음 |
| 5. push 대상 결정 | 기본은 최신 `main`. 작업량이 많을 때만 별도 브랜치. upstream이 없으면 대상 브랜치를 명시 |
| 6. 거절 처리 | fetch 후 통합·검증·재시도. 강제 push, `reset --hard`, 사용자 변경 삭제 금지 |
| 7. 반영 확인 | 원격 커밋을 확인한 뒤 경로·커밋 SHA·브랜치·성공 여부 보고. 로컬 커밋만 끝난 상태를 push 완료로 보고하지 않음 |

### 7.2 완료 알림
- **보내는 조건**: 검증 성공 + push와 원격 확인 완료. 실패·중단·승인 대기·검증 미완료 상태에는 보내지 않음
- **채널별 형식**

| 채널 | 형식 | 인증 |
|---|---|---|
| 카카오톡 나에게 보내기 | 200자 이내 본문 + 산출물 보기 버튼 | `KAKAO_ACCESS_TOKEN`을 `kapi.kakao.com`으로만 전달 |
| Slack | Block Kit 메시지 | `SLACK_WEBHOOK_PATH`를 `hooks.slack.com`으로만 전달 |
| 이메일 | 짧은 HTML + 일반 텍스트 | SenderKit 플러그인이 관리 |

- **링크 규칙**: 실제 push한 커밋에 고정된 GitHub 링크만 사용. 로컬 경로, push 전 파일, 만료되는 서명 URL, 인증 정보가 붙은 링크 금지
- **장애 처리**
  - 채널을 서로 독립 실행해서 한 채널이 실패해도 나머지는 전송
  - 응답 본문·헤더·전체 웹훅 URL·예외 원문을 출력하지 않고 상태 코드와 필요한 설정만 보고
  - 타임아웃처럼 수락 여부가 불명확하면 "확인 불가"로 남기고 무조건 재시도하지 않음
  - 이메일 재시도는 같은 idempotency key를 사용해 중복 발송 방지
  - API 수락, 큐 등록, 최종 배달을 구분해서 실제 확인한 단계까지만 보고
- **중복 방지**: 하위 스킬을 호출한 작업은 최상위에서 한 번만 전송. 같은 실행 ID로 성공한 채널은 다시 보내지 않음

### 7.3 알림 입력 검증 (`notify.py`)
- 전략 스킬 6종의 `status: success` 결과만 허용
- 핵심 결과 1~3개, 항목당 160자 이내
- 산출물 링크 최대 5개, `https`만 허용하고 사용자 정보·쿼리 문자열·프래그먼트가 붙은 URL은 거부
- 잘못된 입력은 전송 전에 예외로 중단

---

## 8. 데이터와 산출물

### 8.1 산출물 구조
```
01-strategy/
├── brand/<브랜드>/                  # brand.md, DESIGN.md, assets/
│   └── <브랜드>/<상품>/             # product.md, collection/, assets/
├── competitor/<브랜드>/<상품>/      # competitor.md, collection.md
├── customer/<브랜드>/<상품>/        # customer.md, sources.md
├── brief/<브랜드>/<상품>/           # marketing_messages.md, brief.md
└── dashboard/                       # 전략 대시보드
research/<주제>/<YYYY-MM-DD>/        # 수집 기록
```
- 브랜드와 상품을 폴더로 구분해서 같은 브랜드의 다른 상품을 추가해도 기존 자료와 섞이지 않음
- `/strategy-dashboard`는 이 다섯 문서(brand, product, competitor, customer, brief)가 같은 브랜드·상품인지 먼저 확인한 뒤 대시보드에 연결

### 8.2 수집 기록 형식
- 한 번의 수집을 날짜별 폴더로 저장

| 파일 | 내용 |
|---|---|
| `manifest.json` | 범위, 예산, 집계, 재사용 위치 |
| `records.jsonl` | 출처와 연결된 개별 근거 |
| `raw/` | 보존이 허용된 원본 응답·본문·영상 리포트 |
| `failures.jsonl` | 실패, 부분 수집, 판독 불가 |
| `summary.md` | 결과 요약과 직접 출처 |

- 근거 레코드의 핵심 필드

| 필드 | 의미 |
|---|---|
| `collected_at` / `verified_at` | 처음 확보한 시각 / 이번에 다시 확인한 시각. 재사용해도 처음 시각은 유지 |
| `acquisition` | `fresh` 또는 `reused`와 재사용한 원래 위치 |
| `status` | `complete` / `partial` / `failed` / `unreadable` |
| `text_kind` | `verbatim` / `caption` / `ocr` / `gemini_report` 등 원문의 성격 |
| `original_text` / `translation` / `summary` | 원문을 덮어쓰지 않고 번역·요약을 별도 저장 |
| `locator` | 단락·페이지·표·이미지 구간·영상 시각 |
| `limitations` | 누락, 판독 문제, 원문 보존 제한 |

- 검색 결과만 얻은 자료는 본문 근거와 분리해 후보로 남기고, 원문을 확보하지 못한 자료는 완료 건수에 넣지 않음

### 8.3 적용 사례
- **상품 전략**: BMW 더 뉴 X5 (G65)
  - 상품 조사, 가격 수집(2026-11-02), 경쟁 분석, 고객 조사와 출처 목록, 마케팅 메시지와 브리프까지 한 상품의 전체 흐름을 수행
- **브랜드 디자인 시스템**: 토스, 카카오, 신한은행
  - 공식 아이덴티티 자료와 에셋으로 `brand.md`, `DESIGN.md` 작성

---

## 9. 전략 대시보드

### 9.1 구성
- 전략 문서를 하나의 HTML 파일로 묶은 보고서 화면 (`01-strategy/dashboard/dashboard.html`)
- 검색, 원문 보기, 다크모드 전환, 브랜드 공식 로고 표시
- 기존 보고서 데이터·디자인·렌더러를 보존한 채 새 상품만 추가하는 방식으로 갱신

### 9.2 인증
- Firebase Authentication 이메일·비밀번호 로그인
- 2단계 회원가입: 1단계 이메일·비밀번호 입력 → 2단계 비밀번호 확인
- 비밀번호 재설정 메일 요청
- 로그인 상태 유지
  - 체크하면 다른 탭과 브라우저 재실행 후에도 유지
  - 체크하지 않으면 해당 탭의 세션 동안만 유지
- 비밀번호는 애플리케이션 코드에서 저장하거나 로그로 출력하지 않고, 세션 저장은 Firebase SDK가 관리
- 로그아웃하면 보고서와 팝업을 닫고 페이지를 다시 불러옴
- 접근 제어 범위
  - 현재 로그인은 화면 접근 제어이며, 보고서 데이터는 HTML에 포함되어 있음
  - 데이터 자체를 보호하려면 서버에서 Firebase ID 토큰을 검증한 뒤 권한 있는 사용자에게만 데이터를 내려주는 구조가 필요함 (`AUTH.md`에 설계 근거 기록)

### 9.3 배포
- Firebase Hosting (`find-inc.web.app`)
  - 공개 폴더: `01-strategy/dashboard`
  - 모든 경로를 `dashboard.html`로 연결 (rewrite)
  - 테스트·도구·인증 문서·템플릿은 배포에서 제외
- 응답 헤더
  - `Cache-Control: no-cache`: 갱신한 보고서가 바로 반영되도록
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- 링크 공유
  - Open Graph·Twitter 카드 태그
  - 가로형(1200 × 630)·정사각형(1200 × 1200) 썸네일을 스크립트로 생성 (`tools/build-share-images.cjs`)
  - 다중 크기 파비콘·모바일 홈 화면 아이콘 생성 (`tools/build-favicon.cjs`)

---

## 10. 테스트와 검증

### 10.1 인증 흐름 E2E 테스트 (`01-strategy/dashboard/tests/auth.cjs`)
- Playwright가 로컬 HTTP 서버를 띄우고 실제 Firebase SDK로 대시보드를 실행
- Firebase 인증 API 응답을 가로채서 실제 사용자 생성이나 메일 발송 없이 검증
- 확인 항목
  - 회원가입과 비밀번호 확인
  - 로그인 성공·실패
  - 새로고침 후 상태 유지, 탭 간 동기화
  - 로그아웃
  - 비밀번호 재설정 화면
- `FIREBASE_AUTH_LIVE=1`이면 실제 Firebase의 잘못된 자격 증명 응답까지 확인
- 스크린샷과 결과 JSON은 시스템 임시 폴더에 저장해 저장소를 오염시키지 않음

### 10.2 알림 스크립트 단위 테스트 (`.agents/skills/notify-results/tests/`)
- 실제 네트워크 호출 없이 `unittest.mock`으로 검증

| 테스트 | 확인 내용 |
|---|---|
| `test_render` | 채널별 메시지 생성 |
| `test_html_escape` | 이메일 HTML의 특수문자 이스케이프 |
| `test_kakao_limit` | 카카오톡 본문 길이 제한 |
| `test_result_validation` | 성공 결과만 허용, 핵심 결과·링크 개수와 형식 검증 |
| `test_success_and_headers` | 정상 전송과 요청 헤더 |
| `test_errors_redacted` | 오류 메시지에서 민감 정보 제거 |
| `test_no_redirect_and_no_email_rest` | 리다이렉트를 따라가지 않음, 이메일을 임의 REST 호출로 보내지 않음 |
| `test_host_injection` | 허용되지 않은 호스트로 시크릿이 전달되지 않음 |

```bash
python -m unittest discover -s .agents/skills/notify-results/tests
```

---

## 11. 협업과 변경 이력

### 11.1 Issue → PR 흐름
| Issue | 내용 | 처리 |
|---|---|---|
| #1 | 검색 버튼 뒤에 다크모드 전환 버튼 추가 | `fix/issues-1-3-header` 브랜치 → PR #4 |
| #2 | BMW 공식 로고를 확보해 빈 로고칸에 넣기 | PR #4 |
| #3 | 상단 메뉴바 디자인 개선 | PR #4 |
| - | ChatGPT Sites 배포본과 대시보드 수정 통합 | `integrate/chatgpt-site-and-issues` → PR #5 |

### 11.2 결정 기록 (`docs/decisions/`)
| 날짜 | 결정 |
|---|---|
| 2026-10-30 | 개인정보 확인 절차, 규칙 기억 방식 |
| 2026-11-03 | GitHub 저장소 운영 시작, 대시보드 Issue 1·2·3 처리 |
| 2026-11-04 | 클라우드 작업 경로와 스킬 탐색 규칙, `main` 우선 작업, 산출물 push 의무화, watch 스킬 프로젝트 포함 |
| 2026-11-05 | 대시보드 로그인, 완료 알림 3채널 |
| 2026-11-06 | 파비콘, 링크 공유 썸네일, 2단계 회원가입 |

- 각 기록은 날짜·결정 내용·이유로 구성하고, 이유가 확인되지 않은 경우 "확인되지 않음"으로 남김
- 권리 상태가 미확인인 에셋(예: 브랜드 로고의 외부 상업적 재사용)은 결정 기록에 그대로 명시

---

## 12. 디렉터리 구조

```
.
├── AGENTS.md                     # 에이전트 공통 규칙 (기준 문서)
├── CLAUDE.md                     # @AGENTS.md
├── GEMINI.md                     # @AGENTS.md
├── .agents/skills/               # 업무 스킬 12종
│   ├── brand/ product/ competitor/ customer/ marketing-brief/ strategy-dashboard/
│   ├── crawler/ watch/ natural-korean/
│   └── remember/ notify-results/ team-lead/
├── docs/
│   ├── company/                  # 회사 소개
│   ├── guides/                   # 규칙 가이드
│   └── decisions/                # 결정 기록
├── 01-strategy/                  # 전략 산출물과 대시보드
│   └── dashboard/
│       ├── dashboard.html
│       ├── AUTH.md               # 인증 설계와 검증 방법
│       ├── tests/                # Playwright 인증 테스트
│       ├── tools/                # 공유 썸네일·파비콘 생성 스크립트
│       └── share/                # 공유용 페이지
├── research/                     # 수집 기록
├── sites/                        # ChatGPT Sites 배포본
├── firebase.json                 # Hosting·Auth 설정
└── .firebaserc
```

---

## 13. 사용 방법

### 13.1 스킬 실행
- Codex, Claude Code, Gemini에서 저장소를 열고 스킬 이름으로 요청

```text
/brand 토스
/product BMW 더 뉴 X5 G65
/competitor BMW 더 뉴 X5 G65
/customer BMW 더 뉴 X5 G65 사용 경험과 구매 전 우려
/marketing-brief BMW 더 뉴 X5 G65 인스타그램·유튜브
/strategy-dashboard BMW 더 뉴 X5 G65
/remember 앞으로 조사 결과는 원화 기준으로 표기해 줘
```

- 전략 스킬 6종은 완료 후 자동으로 push와 알림까지 진행
  - 해당 작업에서 push나 알림을 원하지 않으면 요청에 명시

### 13.2 대시보드 로컬 실행
```bash
python -m http.server 8000 --bind 127.0.0.1
# http://127.0.0.1:8000/01-strategy/dashboard/dashboard.html
```

### 13.3 인증 테스트
```bash
cd 01-strategy/dashboard/tests
npm ci
npx playwright install chromium
npm test
```

### 13.4 배포
```bash
firebase deploy --only hosting
```
