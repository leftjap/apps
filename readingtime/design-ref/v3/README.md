# Handoff: 리딩타임 (Reading Time) — 독서 시간 기록 앱

> Claude Code 작업지시서. 이 문서 + `SCREENS.md`(화면별 상세) + `MOTION.md`(모션 스펙) + `mockups/`(시안 HTML)로 구성.

## Overview
"리딩타임"은 혼자 쓰는 개인용 독서 시간 기록 모바일 앱이다.
핵심 루프: **책 선택 → 읽기 시작 → 폰을 엎으면 자동 기록 → 들어 올리면 자동 일시정지 → 저장하면 오늘 위에 시간이 쌓임.**
보조 입력: 탭 모드 타이머(대중교통 등 엎을 수 없는 상황), 시간 직접 추가(사후 기록), 밀리의서재 전자책 자동 동기화(PC·모바일).

## About the Design Files
`mockups/리딩타임 시안.dc.html` 은 **HTML로 제작된 디자인 레퍼런스**다(프로덕션 코드 아님).
과제는 이 시안을 **대상 코드베이스의 기존 환경**(React Native / SwiftUI / Flutter 등, 없으면 적절한 프레임워크를 선택)에서 그 환경의 패턴으로 **재구현**하는 것이다. HTML을 그대로 이식하지 말 것.

- 파일 안에는 리뷰 히스토리로 여러 버전이 섹션으로 쌓여 있다. **최종 확정본은 최상단 섹션 `<section id="t5">` (배지 "V8 · 심화", 앵커 `#5a`, 화면 라벨 `data-screen-label="v8 01"~"v8 14"`)이다. t1~t4 섹션은 과거 시안이므로 무시할 것.**
- 모든 스타일은 인라인이다. 정확한 px/색/그림자 값이 필요하면 t5 섹션의 해당 요소 `style`을 그대로 읽으면 된다 — **HTML이 곧 스펙 원본**이다.
- 폰 프레임(`bezel.jsx`), 이미지 슬롯(`image-slot.js`), 런타임(`support.js`)은 시안 뷰어용 보조 파일로, 구현 대상이 아니다.
- 시안 속 사용자 이름("지훈")·연속 일수(12일)는 **데모 값**이다(파일의 Tweaks 프로퍼티로 주입). 실제 값은 데이터에서 온다.
- 웹폰트(Noto Sans KR·IBM Plex Mono)는 Google Fonts에서 로드된다 — 시안 첫 열람 시 인터넷 필요.
- 로컬에서 보려면 `mockups/` 폴더에서 정적 서버 실행 후 열 것: `python3 -m http.server` → `http://localhost:8000/리딩타임 시안.dc.html` (file:// 직접 열기는 fetch 제한으로 일부가 안 뜸).

## Fidelity
**High-fidelity.** 색·타이포·간격·모션까지 확정값이다. 픽셀 수준으로 재현하되, 플랫폼 관례(세이프에어리어, 네이티브 시트, 햅틱)는 플랫폼답게 처리한다.

## Data Model (엄격 — 이 외 데이터를 만들지 말 것)
```
Book {
  id, title, author, publisher, coverUrl, isbn   // 도서 검색 API 메타 (알라딘 API 사용, 단 UI에 "알라딘" 브랜드 노출 금지)
  status: 'reading' | 'finished'
  rating: 1..5 | null                            // 완독 시 별점
  finishedAt: Date | null
}
Session {
  id, bookId
  durationSec: number
  startedAt: DateTime                            // manual 은 사용자가 지정한 일시
  method: 'flip' | 'tap' | 'manual' | 'millie'
  device: 'pc' | 'mobile' | null                 // millie 전용
  pauseCount, pausedSec                          // flip/tap 세션의 일시정지 요약
}
파생값: 오늘/주/월 합계, 연속(streak) 일수, 요일·시간대 분포, 책별 누적/횟수/함께한 일수.
```
**금지(의도적으로 없음):** 페이지 수/진행률, 읽은 장소, 목표 설정. 절대 추가하지 말 것.

## Core UX Rules
1. **엎기 모드(기본):** 시작 후 폰을 뒤집으면(화면 아래) 기록 시작/재개, 들어 올리면 **자동 일시정지**. 따라서 엎기 모드에서 사용자가 실제로 보는 화면은 대부분 "일시정지됨" 화면(v8 04)이다. 일시정지 화면의 원형 엠블럼은 ▶(재생) 글리프 — 탭하면 (엎지 않아도) 재개된다.
2. **탭 모드:** 화면 하단의 큰 점선 존을 탭 = 일시정지/재개, 두 번 탭 = 종료. 화면이 켜진 채 유지.
3. **저장 화면:** 세션 종료 시 "+N분"이 오늘 누적 바 위에 쌓이는 애니메이션이 핵심 보상 모멘트.
4. **문구 최소화:** 혼자 쓰는 앱. 안내/지시문은 시안에 있는 것 외 추가 금지.
5. **밀리의서재는 책 단위 기록:** 시간만이 아니라 어떤 책을 읽었는지가 랭킹·월간 캘린더·동기화 카드에 드러난다.
6. 내비게이션: 하단 탭바 없음. **홈 허브**에서 서재/기록 카드로 진입, 하위 화면은 뒤로가기.
7. **설정 전용 화면 없음:** 계정 관련(이름 수정·밀리 연동·로그아웃)은 홈 아바타 탭 → 심플 시트로. `SCREENS.md` 말미 §설정 노트 참조.

## Design Tokens
| 토큰 | 값 | 용도 |
|---|---|---|
| paper-bg | `#f6f3ea` | 화면 배경 |
| surface | `#fdfbf4` | 카드 |
| sheet | `#faf7ee` | 바텀시트 |
| hairline | `#e9e2cf` (보조 `#eae3d0`,`#e8e1cd`) | 카드 테두리/구분선 |
| ink | `#17150f` | 제목/강조 텍스트 |
| body | `#3f3a2d` | 본문 |
| muted | `#8c8570` / faint `#b5ad97` / ghost `#c6bea8` | 보조 텍스트 |
| green(primary) | `#2c4a3c`, CTA 그라데이션 `linear-gradient(160deg,#3a5c4b,#26413a)`, CTA 텍스트 `#f2eedd` | 주 액션/활성 |
| green-tint | `#e9efe6` | 라이브 칩 배경 |
| amber | `#c9973b` (틴트 `#f6ecd6`, 진한 `#b8862e`) | 별점/밀리 |
| terracotta | `#c2553a` | 연속(streak)/일요일/오늘 |
| dark scene | `linear-gradient(175deg,#15211a,#0e1712 50%,#0a100c)` + 골드 `#e2cf9e`/텍스트 `#f2eedd`/보조 `#8fa393` | 타이머 계열 화면 |
| seg-bg | `#ece7d8` | 세그먼트/보조 버튼 배경 |
| radius | 카드 18–22, CTA 15–16, 시트 상단 26, 칩 99, 표지 3–4 | |
| CTA shadow | `0 16px 28px -12px rgba(38,65,58,.55)` + `inset 0 1.5px 2px rgba(255,255,255,.25)` | |
| 카드 shadow | `0 1px 2px rgba(22,20,15,.03)` (+히어로급 `0 16px 34px -24px rgba(22,20,15,.2)`) | |

## Typography
- 한글/UI: **Noto Sans KR** 400·500·600·700·800·900. `letter-spacing:-.005em`, `word-break:keep-all`.
- 숫자/시간/미니 라벨: **IBM Plex Mono** 400–700, `font-variant-numeric:tabular-nums` — 모든 시간·카운트 숫자는 반드시 모노.
- 명조(세리프) 사용 금지. 이모지 사용 금지.
- 스케일 예: 타이머 대형 56–64px/600(mono), 화면 제목 17–22px/800–900, 책 제목 15–23px/800–900, 본문 12.5–15px/500, 캡션 10–11px/500, 모노 라벨 9–11px.

## Assets
- 책 표지: 실서비스는 도서 API의 표지 이미지를 사용. 시안의 CSS 표지(몰입/작별하지 않는다/돈의 심리학 등)는 **자리표시용 디테일**이므로 이미지로 대체.
- 아이콘: 전부 인라인 SVG 스트로크 아이콘(1.8–2.6 stroke). 시안에서 path를 그대로 추출해 쓰거나 동일 계열(라운드 캡) 아이콘셋 사용.
- 로고: 초록 라운드 사각형(그라데이션 `#3a5c4b→#26413a`) 안에 펼친 책 스트로크 글리프. 책갈피/리본 장식 금지, 글리프는 박스 대비 크게(68px 박스에 46px).

## Files
```
design_handoff_readingtime/
├── README.md          ← 본 문서 (개요·규칙·토큰)
├── SCREENS.md         ← 14개 화면 상세 스펙 (레이아웃·컴포넌트·카피·상태)
├── MOTION.md          ← 애니메이션 스펙 (키프레임·duration·easing·적용처)
└── mockups/
    ├── 리딩타임 시안.dc.html   ← 시안 (최상단 t5 = 최종본 v8)
    ├── support.js / bezel.jsx / image-slot.js  ← 시안 뷰어용 보조 파일
```

## State Management (요약)
- `timerState: idle | armed(flip대기) | recording | paused | done` — 전환 트리거: CTA 탭, 기기 방향(face-down/up), 탭 존, 종료 버튼.
- `mode: flip | tap` — 홈에서 선택, 세션 중 유지. Session.method에 기록.
- 밀리 동기화: 일 1회 자동(오전) + 수동 트리거 없음(시안 기준). 마지막 동기화 시각 표시.
- 스트릭: "그날 세션 1건 이상"이면 유지. 자정 기준.
