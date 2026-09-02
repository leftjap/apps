# Handoff: 리딩타임 · 기록(통계) 원페이지 리디자인

## Overview
기록 화면의 3탭(주 `Screen10Stats` · 월 `Screen11Month` · 지도 `Screen15Map`)을 **단일 스크롤 원페이지**로 통합한다.
위→아래: ① 월 헤더+이동 ② 서머리 1줄 ③ 월 히트맵 캘린더(홈 2주 캘린더 문법) ④ 그 달 많이 읽은 책(상위 3행 + 나머지 표지 스트립) ⑤ 독서 지도 카드(탭 → 전체 화면).
날짜 탭 → 바텀시트(그날 읽은 책) → 행 탭 → 기존 책 상세(08).

대상 코드베이스: `leftjap/apps@main` `readingtime/` (SwiftUI, `ReadingTimeKit`). 모든 수치는 **기존 토큰(`RTTokens.swift`)·폰트(`RTFont.swift`)·컴포넌트(`RTRecordViews.swift`, `Screen02Home.swift`)** 기준. 새 토큰·새 폰트 없음. 토큰 밖 색은 앱이 이미 쓰는 값만(§Design Tokens).

## About the Design Files
`mockups/RTRecordOnePage.dc.html`은 **HTML로 만든 디자인 레퍼런스(인터랙티브 프로토타입)**다. 프로덕션 코드가 아니며 그대로 이식하지 않는다.
할 일은 이 목업을 **기존 SwiftUI 환경의 패턴으로 재현**하는 것 — `RT.*` 토큰, `.sans/.mono` 폰트 헬퍼, `RTScrollArea`·`RTRankRow`·`RTFillCover`/`RTRemoteCover`·`RTMapPin`·`RecordSheets` 등 이미 있는 뷰를 재사용/개조한다.
목업은 같은 폴더의 `support.js`와 함께 브라우저에서 바로 열린다(월 이동·날짜 탭·시트 3종·지도 팬/줌·핀 탭·08 push 스텁 전부 동작). 파일 하단 `<script data-dc-script>`의 로직 클래스에 데모 데이터·집계·클러스터·상태 분기가 그대로 있다. `data-props`의 `topCount`(상위 행 3–5, 기본 3) · `finishedMark`(완독 필, 기본 true) · `fixedSixRows`(캘린더 6행 고정, 기본 false)는 옵션 스위치.

## Fidelity
**High-fidelity.** 색·타이포·간격·상태가 최종값이다. 자리표시자 3가지:
- 표지: 목업은 색면+짧은 제목(`RTFillCover` 문법). 실앱은 `RTRemoteCover`(실표지) + `RTFillCover` 폴백.
- 지도 지형(타원 블롭 + 격자)은 **MapKit 자리표시자** — 실앱은 기존 `Screen15Map`의 MapKit 뷰.
- "책 상세 · 08 기존 화면" 패널은 **push 목적지 표시용 스텁** — 실앱은 기존 `Screen08Detail` 그대로(변경 없음).

---

## Screens / Views

### 0. 프레임
- 390×844. 배경 `RT.paper`. 스크롤바 숨김. 로딩/에러 상태 없음(로컬 데이터).
- 헤더: 기존 `StatsHeader`에서 **세그먼트([주|월|지도]) 제거**. HStack spacing 4: back 38×38(`RTIconPath.back` 17, viewBox 20, stroke `RT.body` 2.2) + "기록" sans 17/800 `RT.ink`. 파트너 모드("N의 기록", 아바타 26) 분기 유지. padding top 52, 좌우 18.
- 스크롤 영역: `RTScrollArea` 그대로 — top 102, padding 0 22 28, 콘텐츠 폭 346. 헤드리스(rtshot) 경로는 상단 클립 그대로.
- 첫 화면 레이아웃(6행 달 · 4권 이상 · 목업 실측, y = 프레임 상단 기준): 월 헤더 102(h31) · 서머리 139(h32) · 요일 182(h13) · 그리드 200–428 · 책 섹션 제목 444(h20) · 상위 3행 468–633 · 스트립 637–688 · 지도 제목 706(h20) · 지도 카드 734–884. 스크롤 콘텐츠 총 높이 810(뷰포트 742) → 지도 카드 상단 110pt가 첫 화면에 보인다. 5행 달은 아래 전부 39pt 위로.

### 1. 월 헤더 + 이동
- 좌(HStack baseline 정렬, gap 8): `"8월"` sans 26/900, tracking -.04em, line-height 1.2 → 라인박스 `RTLB.n26`(32.7) · `"2026"` mono 13/600, tracking +.02em, `RT.ghost`. 줄바꿈 금지.
- 우(HStack gap 8, 세로 중앙): [이번 달] [‹] [›]
  - 화살표 30×30, r9, bg `RT.segBg`, chevron 13(viewBox 20: `M12 4 6 10l6 6` / `M8 4l6 6-6 6`) stroke `RT.muted` 2.2.
  - ‹ : 첫 기록이 있는 달(종이·밀리 중 가장 이른 기록의 달)까지. 경계에서 opacity .35 + 탭 무시. › : 현재 달에서 opacity .35 + 탭 무시. 기록이 전혀 없으면 현재 달만, 양쪽 비활성.
  - **"이번 달" 칩**: 과거 달을 보고 있을 때만 렌더. sans 11/700 `RT.green` on `RT.greenTint`, 높이 30, padding 0 11, r99. 탭 → 현재 달.
- 월 전환 시 열린 시트는 닫는다. (선택) 캘린더 영역 좌우 스와이프 = 같은 동작.
- 데이터: `Screen11Month.buildLive(data:now:)`의 now 하드코딩 대신 "표시 중인 달(year, month)" 매개변수. 오늘 = `model.now()`.

### 2. 서머리 (1줄, 줄바꿈 금지)
`{H:MM}` mono 17/700 tracking -.02em `RT.ink` · `총 시간` sans 12/500 `RT.muted` · dot 3×3 원 #D5CDB8 · `{N}` mono 12/700 `RT.green` ` / {M}일 읽음` sans 12/500 `RT.muted`
- HStack gap 10, margin-top 6, padding-bottom 9, border-bottom 1px `RT.hair3`.
- H:MM = `RTAppModel.hmString` 포맷(예 `14:52`, `0:45`). N = 그 달 기록(종이+밀리)이 있는 날 수. M = 현재 달이면 오늘 일자, 과거 달이면 말일.
- 기록 없는 달: `0:00 · 0 / 31일 읽음`. 다른 수치 추가 금지.

### 3. 월 히트맵 캘린더 — `Screen02Home.calCell / calFG / calBG / todayHalo` 문법 그대로
- 요일 헤더: `월 화 수 목 금 토 일` mono 10/500, 일요일만 `RT.terra`, 나머지 `RT.faint`. 7열 gap 6, margin 11 0 5. 접근성 숨김.
- 그리드: 7열 gap 6, 행 gap 6. 셀 높이 33, r10. 숫자 mono 11.5, tracking +.01em, 라인박스 `RTLB.m11_5`, 오늘 700 / 그 외 500. **월요일 시작**(firstWeekday 2). 전달 오프셋은 빈 칸(아무것도 그리지 않음).
- 셀 상태 (분기 순서 준수 — ① 오늘·읽음 → ② 미래 → ③ 미기록 → ④ 읽음). 목업 실측값 병기:

| 상태 | bg | 숫자 색 | 링/테두리 |
|---|---|---|---|
| 오늘 · 읽음 | `RT.terra` | #FFFFFF | 바깥 헤일로 3pt `RT.terra` @.13 |
| 오늘 · 미기록 | 없음 | `RT.terra` | 안쪽 strokeBorder 1.5pt `RT.terra` **+ 바깥 헤일로 3pt @.13** (홈 `todayHalo`는 오늘이면 항상) |
| 과거 · 읽음 | `RT.terra.opacity(alpha(min))` (예 63분 → .72) | #2E1C15 | 안쪽 1pt `Color(hex:0x7A3C28, alpha:.05)` |
| 과거 · 미기록 | 없음 | `RT.faint` (일요일은 `RT.terra`) | — |
| 미래(현재 달만) | 없음 | #D3CBB6 | — · 탭 불가 · 접근성 트리 제외 |

- **alpha(min) = `RTHomeCal.alpha(min)` = min(0.72, 0.14 + 0.58·min/60)** — 기존 함수 호출. 새 공식 금지.
- 색면이 깔린 셀 위 일요일 숫자에 terra 금지(대비, 홈 규칙).
- 일 분량 = 종이 세션 + 밀리 `ebookSeconds(on:)` 합산 (`Screen11Month.buildLive` 집계 방식).
- 탭: min>0 && !future 인 날만 → day 시트(§6). 히트 영역은 셀 33 + 상하 gap 절반씩 = 39(셀 크기는 홈과 동일 유지). VoiceOver: label "N월 D일", value "N분" / "기록 없음", 오늘 `.isSelected`(홈과 동일).
- 등장: 그리드 fade + 8pt 상승 .5s ease, 지연 .05s (정적 렌더는 최종 상태).
- 옵션 `fixedSixRows`(기본 false): true면 뒤를 빈 칸으로 채워 항상 6행 — 월마다 아래 섹션이 39pt 흔들리지 않게.

### 4. 많이 읽은 책 — 권수와 무관한 고정 높이
- 섹션 제목: 현재 달 `이달 많이 읽은 책` / 과거 달 `N월에 많이 읽은 책`. sans 14/800 `RT.ink`, margin 16 2 4.
- 정렬 = 그 달 총 분 내림차순(종이+밀리). **상위 3행** (`RTRankRow` 개조: 진행바 제거, 메타 라인 추가):
  - HStack gap 12, padding 6 2 → 행 55.
  - 표지 30×43 r3, 그림자 `0 3 7 -2 rgba(58,44,28,.3)` (`rtBoxShadow` blur 7, y 3, spread -2 — 기존 RTRankRow와 동일).
  - 제목 sans 13/700 `RT.ink`, 1줄 말줄임. 제목 오른쪽 gap 6에 필(§4-1) — 밀리·완독 둘 다 가능.
  - 메타 `N일 읽음` sans 11/500 `RT.muted`, margin-top 3. N = 그 책을 읽은 날 수(그 달).
  - 우측 총시간 `H:MM` mono 12.5/700 `RT.ink`.
  - 순위 숫자 없음. 탭 → 책 상세(08).
- **"그 외" 스트립** (4위 이하가 있을 때만): margin 4 2 0, 상단 1px `RT.hair2`, padding-top 6, 행 높이 44 → 블록 51. HStack gap 4.
  - 라벨 `그 외 N권` sans 11/600 `RT.muted`, 높이 44, 오른쪽 margin 5. 탭 → 전체 목록 시트(§6 list).
  - 표지 28×40 r2.5, 그림자 `0 2 5 -1 rgba(58,44,28,.32)`, 히트 영역 34×44(표지 중앙). 최대 6개(4~9위). 탭 → 책 상세(08). VoiceOver label = 책 제목.
  - 밀리 책: 표지 우상단(-3,-3) 9×9 원 `RT.amber`, 테두리 1.5 `RT.paper`.
  - 6개 초과분: `+N` 칩 28×40 r5 bg `RT.segBg`, mono 10/700 `RT.muted`, 히트 34×44 (예 12권 → 표지 6 + `+3`). 탭 → 전체 목록 시트.
  - → 섹션 높이 = 제목 40 + 165 + 스트립 55(margin 4 + 51) = 260 고정. 3권 이하면 스트립 없음(205), 1~2권이면 행 수만큼.
- 기록 없는 달: 행·스트립 대신 `N월에는 기록이 없어요`(현재 달 `이달엔 아직 기록이 없어요`) sans 12/500 `RT.faint` 중앙, padding 20 0 12.
- 탭 → `model.openBookDetail(isbn:)`. isbn 없는 밀리 책은 기존 규칙.

#### 4-1. 출처·완독 필 (sans 9/700, padding 1.5 6, r99, line-height 1.5)
- **밀리**: 텍스트 `RT.amberDeep`, bg `RT.amberTint`. (홈 캐러셀 amber 배지·08 밀리 타일과 같은 amber 문법.) 리딩타임 책은 무표기 — 앱 자체가 리딩타임이라 기본값. day 시트에서는 서브라인이 추가 구분(리딩타임 = 핀+장소, 밀리 = "밀리에서 자동 기록").
- **완독**: 텍스트 `RT.green`, bg `RT.greenTint`. **표시 중인 달에 완독한 책만.** 옵션 `finishedMark`(기본 true). 순서: 밀리 → 완독.

### 5. 독서 지도 (전체 기간 — 월과 무관)
- 섹션 제목 `독서 지도` sans 14/800 `RT.ink` + 우측 `전체 기간` mono 9.5 `RT.ghost`. margin 18 2 8, baseline 정렬.
- **카드** 346×150, r20, border 1px `RT.hair`, clip. 내부 = `Screen15Map`의 MapKit 뷰(제스처 비활성, 프리뷰). 기본 카메라 = 기존 동네 프레이밍(latestReadCoord ~1.3km) → 최근 읽은 곳 핀 1~2개(`RTMapPin` 축소판: 표지 22×31 r3, 프레임 padding 3 r6, 배지 17(mono 9.5), 라벨 mono 8.5/600).
  - 칩 좌하(12,12): 핀 아이콘 12 stroke #3A5C4B 2 + `N개 도시 · N개 대륙` mono 10.5/600 #6F6752. padding 6 11, r99, bg white@.86, border 1px #E5DFCD, 그림자 `0 4 12 -6 rgba(0,0,0,.3)`. 0곳이면 숨김(`mapChipText`).
  - 확대 버튼 우하(12,12): 34×34 r11, bg white@.92, border 1px #E5DFCD, 그림자 `0 6 14 -6 rgba(0,0,0,.4)`, 아이콘 15(대각 화살표 2개 `M14.5 4H20v5.5M9.5 20H4v-5.5M20 4l-6.8 6.8M4 20l6.8-6.8`) stroke #6F6752 2.2.
  - 카드 전체 탭(확대 버튼 포함) → 전체 화면 지도(push 또는 fullScreenCover).
- **전체 화면** = 기존 `Screen15Map` 본체: 팬/줌 제스처, 52pt 체인 클러스터, `RTMapPin`(목업 근사: 표지 30×42 r4, 프레임 padding 3 r7, 배지 19(mono 10), 라벨 mono 9.5/600, 등장 `rtPinDrop` .4s), 칩 좌상(14, 58) mono 11 · 닫기 우상(14, 54) 38×38 r12 · 우하(14, bottom 28) 줌+/줌−/리셋 38×38 r12 gap 8. 컨트롤 스킨 = 카드 확대 버튼과 동일.
  - 핀 규칙(목업 로직 `clusters` 참조): 앵커 = 클러스터 중 총 분이 가장 큰 장소, 라벨 = `앵커명` / `앵커명 외 N`(N = 나머지 장소 수), 표지 = 클러스터 내 가장 많이 읽은 책, 2권 이상이면 표지 팬(뒤 2장) + terra 배지 = 책 수.
  - **기본 카메라(변경)**: 카드가 이미 동네를 보여주므로 전체 화면은 **모든 핀이 들어오는 프레이밍**으로 연다 — 핀 범위를 폭 300·높이 520 안에 두고 중심 (195, 422), 배율 클램프. 리셋 버튼 = 같은 프레이밍. 핀 1곳이면 그 곳 ~1.3km.
  - 핀 탭: 클러스터 = 줌투핏(목업은 핀 기준 ×2.4), 단일 = place 시트(§6). 닫기 → 원페이지 복귀(카메라 리셋, 열린 시트 닫힘).

### 6. 바텀시트 — 공용 1종, 내용 3가지 (`RecordSheets` 장소 시트 문법)
- 컨테이너: scrim `Color(hex:0x17120C, alpha:.42)` · 시트 bg `RT.sheet`, 상단 r26 · padding 12 24 34 · 핸들 40×4 r99 #E2DCCB(margin 0 auto 14) · 닫기 32×32 r9 `RT.segBg`, X 14 stroke `RT.muted` 2.4 · 등장 .45s cubic-bezier(.2,.9,.3,1) translateY 46→0 + fade · max-height 74%, 내부 스크롤 · 그림자 `0 -20 48 -14 rgba(20,16,10,.4)`.
- 헤더(HStack gap 12, top 정렬): 타일 40×40 r12 `RT.greenTint` + 아이콘 18 stroke `RT.green` 1.9 (day=캘린더 / list=펼친 책 / place=핀) · 제목 sans 20/900 tracking -.02em `RT.ink` · 서브 sans 12/500 `RT.muted` margin-top 3.
- 행 목록 margin-top 12. 행(HStack gap 13, padding 10 2, 하단 1px `RT.hair2`, 눌림 scale .985): [순위 mono 12/700 폭 14, 1위 `RT.ink` 그 외 `RT.ghost` — list만] 표지 36×52 r4 그림자 `0 5 10 -4 rgba(58,44,28,.38)` · 제목 sans 13.5/700 `RT.ink` 1줄 말줄임 + 필(§4-1) · 서브라인 sans 11/500, margin-top 3 · 우측 mono 12.5/700 `RT.ink`.
- 시간 포맷: `H:MM` = hmString · `korMin` = `1시간 3분` / `45분` / `2시간`(0분이면 분 생략).

| 종류 | 열리는 곳 | 제목 / 서브 | 행 서브라인 | 우측 | 정렬 |
|---|---|---|---|---|---|
| day | 캘린더 날짜 탭 | `8월 22일 토요일` (오늘이면 + ` · 오늘`) / `N권 · {korMin} 읽음` | 리딩타임: 핀 9 stroke `RT.faint` 2.2 + 장소명 `RT.muted` · 밀리: `밀리에서 자동 기록` `RT.amberDeep` | `N분` | 분 내림차순 |
| list | 스트립 라벨 · +N | `이달 읽은 책` / 과거 `N월에 읽은 책` · `N권 · H:MM` | `N일 읽음` `RT.muted` (+밀리·완독 필) | `H:MM` | 총시간 |
| place | 전체 화면 지도 단일 핀 | 장소명 / `N권 · {korMin} 읽음` | `N회 읽음` (세션 수) | `H:MM` | 장소 내 총시간 |

- 행 탭 → 시트 닫고 **책 상세(08) push**. scrim 탭·X → 닫기.

### 7. 책 상세
- 기존 `Screen08Detail` 그대로. 목업의 "책 상세 · 08 기존 화면" 패널은 push 목적지 표시용 스텁이며 구현 대상이 아니다.

---

## Interactions & Behavior
- 월 이동: ‹/› 탭, "이번 달" 칩. 경계 비활성 opacity .35. 전환 시 시트 닫힘. 캘린더 그리드 fade-in .5s.
- 날짜 탭(읽은 과거·오늘) → day 시트. 미래·미기록·빈 칸 탭 무시.
- 상위 행/스트립 표지 탭 → 08 push. 라벨/+N 탭 → list 시트.
- 지도 카드 탭 → 전체 화면. 팬(드래그), 줌 ±(×1.45, 화면 중심 195,422 기준), 리셋(전체 핀 프레이밍), 닫기(원페이지 복귀 + 카메라 리셋). 클러스터 핀 탭 → 줌투핏, 단일 핀 탭 → place 시트. 드래그(이동 4pt 초과) 후 손을 떼는 순간의 탭은 무시.
- 시트: 등장 .45s, scrim/X로 닫기, 행 탭 → 시트 닫힘 + 08 push. 전체 화면 지도 위에서 place 시트 → 08 push → back 하면 지도로 복귀.
- 정적 렌더(rtshot·모션 off): 모든 애니메이션 최종 상태.

## State Management
- `displayedMonth: (year, month)` — 초기 = 현재 달. 범위: 첫 기록 달 … 현재 달.
- `sheet: nil | .day(Date) | .list | .place(placeId)`
- `mapFullscreen: Bool`, 지도 카메라(전체 화면 내부 상태)
- 파생값(월 단위): 일별 분(종이+밀리), 총 분, 읽은 날 수, 책별 {총 분, 읽은 날 수, 그 달 완독 여부}, 정렬. 전체 기간: 장소별 {총 분, 책별 {분, 세션 수}} → 클러스터/칩(도시 수 = 기록 있는 장소 수, 대륙 수 = 그 장소들의 대륙 집합).
- 세션 모델(목업): `[책, 분, 장소]` — 밀리 세션은 장소 null(지도·장소 시트에 포함되지 않음).

### 데모 경로 (userData nil) — 픽셀 오라클
- 오늘 = 2026-08-27(목). 달 범위 2026-05 … 2026-08. 5~7월은 목업 `gen(seed…)` 시드 생성(5월 20일 시드니 세션 1건 고정 추가), 8월은 아래 고정값. 8월 17–27 일별 분 = 홈 `demoCal14`(0,0,34,52,41,63,28,12,47,39,46) — 홈과 오라클 공유.
- 8월 세션 `일: 책·분·장소` (밀리 = 장소 없음):
  1: 몰입 52 서울 · 3: 작별하지 않는다 38 서울, 아몬드 20 서울 · 4: 도둑맞은 집중력 21 밀리 · 6: 몰입 64 서울 · 8: 사피엔스 45 밀리, 불편한 편의점 17 밀리 · 9: 도둑맞은 집중력 30 밀리 · 11: 돈의 심리학 58 서울, 1984 14 서울 · 13: 페스트 26 서울, 파친코 19 서울 · 15: 몰입 44 제주, 사피엔스 28 밀리 · 16: 도둑맞은 집중력 18 밀리, 노르웨이의 숲 15 제주, 미드나잇 라이브러리 21 밀리 · 19: 몰입 22 서울, 도둑맞은 집중력 12 밀리 · 20: 몰입 52 서울 · 21: 돈의 심리학 41 서울 · 22: 몰입 40 서울, 사피엔스 23 밀리 · 23: 작별하지 않는다 28 서울 · 24: 도둑맞은 집중력 12 밀리 · 25: 돈의 심리학 47 서울 · 26: 사피엔스 39 밀리 · 27: 몰입 24 서울, 도둑맞은 집중력 22 밀리
- 8월 기대값: 서머리 `14:52 · 19 / 27일` · 상위 3 = 몰입 7일 4:58 / 돈의 심리학(완독) 3일 2:26 / 사피엔스(밀리) 4일 2:15 · 그 외 9권(스트립 6 + `+3`) · 밀리 = 도둑맞은 집중력·미드나잇 라이브러리·사피엔스·불편한 편의점 · 8월 완독 = 돈의 심리학 · 지도 칩 `10개 도시 · 4개 대륙` · 카드 핀 `서울 외 2`(배지 8)와 `도쿄`.
- 장소 10곳: 서울 제주 도쿄 부산 방콕 두바이(아시아) · 파리 런던(유럽) · 뉴욕(북미) · 시드니(오세아니아).

## Design Tokens (전부 기존 `RT.*` — 새 토큰 없음)
- paper #F6F3EA · surface #FDFBF4 · sheet #FAF7EE · hair #E9E2CF · hair2 #EAE3D0 · hair3 #E8E1CD
- ink #17150F · body #3F3A2D · muted #8C8570 · faint #B5AD97 · ghost #C6BEA8
- green #2C4A3C · greenTint #E9EFE6 · amber #C9973B · amberTint #F6ECD6 · amberDeep #B8862E · terra #C2553A · segBg #ECE7D8
- 앱이 이미 쓰는 비토큰 값(그대로): 셀 숫자 #2E1C15 · 미래 #D3CBB6 · 셀 안쪽 링 0x7A3C28@.05 · 컨트롤 border #E5DFCD · 지도 칩 텍스트 #6F6752 · 칩 핀 #3A5C4B · 서머리 dot #D5CDB8 · 시트 핸들 #E2DCCB · scrim 0x17120C@.42 · 표지 그림자색 0x3A2C1C
- 폰트: `.sans(size, weight)` = NotoSansKR · `.mono(size, weight)` = IBMPlexMono. 라인박스는 `RTLB` 재사용(n26 32.7 · m17 22 · m11_5 15 · n13 18.5 · m12_5 16.5 · n20 29 …). 모노 숫자는 tabular.
- 반지름: 셀 10 · 화살표/X 9 · 타일 12 · 카드 20 · 시트 26 · 표지 2.5/3/4 · 컨트롤 11/12 · 필/칩/이번 달 99
- 그림자: 표지 30×43 `0 3 7 -2 rgba(58,44,28,.3)` · 표지 36×52 `0 5 10 -4 rgba(58,44,28,.38)` · 표지 28×40 `0 2 5 -1 rgba(58,44,28,.32)` · 컨트롤 `0 6 14 -6 rgba(0,0,0,.4)` · 칩 `0 4 12 -6 rgba(0,0,0,.3)` · 시트 `0 -20 48 -14 rgba(20,16,10,.4)` · 핀 프레임 `0 9 16 -7 rgba(40,30,15,.5)`

## 접근성 식별자 (제안 — 기존 `home.*` 관례)
`stats.back` · `stats.monthTitle` · `stats.prev` · `stats.next` · `stats.thisMonth` · `stats.summary` · `stats.cell.YYYY-MM-DD` · `stats.rankRow.{1..3}` · `stats.strip.{n}` · `stats.stripMore` · `stats.mapCard` · `stats.sheet` · `stats.sheet.row.{n}`

## 삭제·라우팅
- 삭제: `Screen10Stats`(주간 전체: 막대차트·팝오버·vs 지난주·연속/시간대 카드·랭킹 진행바), `Screen11Month`의 이달 요약 3카드·주차별 시간·`RTDuoRow`, `Screen15Map` 전면 탭 진입, `StatsHeader` 세그먼트.
- 라우트 `.statsWeek/.statsMonth/.statsMap` → 단일 `.stats`. 홈 "전체 통계" 버튼(`Screen02Home.statsButton`)·아바타 메뉴 "통계"(`RTHomeMenu`)·파트너 통계(`openPartnerStats`) 목적지 = `.stats`.
- 삭제되는 정보의 대체: 연속(스트릭)·이번 주 시간 = 홈 도킹 카드에 이미 있음 · 최고의 날 = 히트맵 최진한 셀 · 완독 = 책 행 필.

## 확인 필요 (구현 전 결정)
1. 파트너 모드(`statsSubject == .partner`): 같은 원페이지에 partnerData로 채운다. 파트너 책 행 탭의 목적지(내 서재에 없는 책)는 기존 파트너 통계 규칙을 따른다 — 규칙이 없으면 탭 비활성.
2. 지도 카드 프리뷰 카메라: 동네 프레이밍에 핀이 0개면(최근 기록이 밀리만) 전체 핀 프레이밍으로 대체.
3. `fixedSixRows` 기본값(false) — 실기기에서 5행↔6행 전환의 39pt 이동이 거슬리면 true.

## Acceptance Criteria
1. 세그먼트 없음. 단일 스크롤로 ①~⑤ 도달. 4권 이상·6행 달에서 지도 카드 상단이 첫 화면 안(y≈734)에 보인다.
2. ‹ › 월 이동, 현재 달에서 › 비활성(.35), 첫 기록 달에서 ‹ 비활성. 과거 달에서만 "이번 달" 칩. 전환 시 시트 닫힘.
3. 셀 5상태가 §3 표와 일치. alpha = `RTHomeCal.alpha`. 오늘 미기록 = 안쪽 1.5 테두리 + 헤일로.
4. 읽은 날만 탭 → day 시트(분 내림차순, 리딩타임=핀+장소 / 밀리=자동 기록 라인). 행 탭 → 시트 닫힘 + 08.
5. 책 섹션 높이는 권수와 무관(상위 3 + 스트립 6 + `+N`). 3권 이하면 스트립 없음. 0권이면 빈 문구. 스트립 표지 히트 영역 ≥ 34×44.
6. 밀리: 행 amber 필, 스트립 amber 도트, 시트 "밀리에서 자동 기록". 완독: 그 달 완독 책만 green 필.
7. 지도 카드 = MapKit 프리뷰(동네) + 칩 + 확대 버튼, 탭 → 전체 화면(전체 핀 프레이밍, 팬·줌·리셋·닫기·핀 탭 분기: 클러스터=줌투핏 / 단일=place 시트).
8. 서머리 분모: 현재 달 = 오늘 일자, 과거 달 = 말일. 서머리·월 헤더 1줄 고정.
9. 데모(userData nil) 경로: §데모 경로의 8월 기대값 전부 일치(서머리·상위 3·그 외 9·칩·카드 핀).
10. VoiceOver: 셀 label/value, 미래 셀 트리 제외, 스트립 표지 label = 책 제목, 요일 헤더 숨김.

## Files
- `mockups/RTRecordOnePage.dc.html` — 인터랙티브 목업(정본 시안). 같은 폴더의 `support.js`와 함께 브라우저에서 열기. 하단 `<script data-dc-script>` 로직 클래스에 데모 데이터(`books`·`places`·`aug`·`gen`)·집계·`clusters`·상태 분기가 그대로 있다.
- `mockups/support.js` — 목업 런타임(프로덕션과 무관).
- 참조(레포 내): `ReadingTimeKit/Sources/RTViews/RTTokens.swift`, `RTFont.swift`, `RTRecordViews.swift`(StatsHeader·RTScrollArea·RTRankRow·RTFillCover·RTLB·rtBoxShadow·rtRing), `Screens/Screen02Home.swift`(calCell·calFG·calBG·todayHalo·demoCal14·statsButton), `Screens/Screen11Month.swift`(buildLive), `Screens/Screen15Map.swift`(클러스터·RTMapPin·mapChipText·카메라), `Screens/RecordSheets.swift`(시트 문법), `RTAppModel.swift`(RTHomeCal.alpha·hmString·now·openBookDetail), `.oracle/ora-home.png`.


---

## 구현 변경 이력 (사용자 결정 — 목업·구현 동시 반영)

- **2026-09-02 최근 4주**: 현재 달의 "많이 읽은 책"·list 시트는 이달이 아니라 **오늘 포함 28일 창**(달 경계를 넘음) 기준.
  제목 `최근 4주 많이 읽은 책` / `최근 4주 읽은 책`, 빈 문구 `최근 4주 기록이 없어요`. 완독 필은 §4-1 그대로 현재 달 완독만.
  과거 달은 그 달 기준 유지. (월초에 목록이 비는 문제.)
- **2026-09-02 지도 카드 346×200**: 150 은 동네 맥락이 안 보여 200 으로. 첫 화면 y 는 734 그대로(카드 하단만 아래로).
- **2026-09-02 카드 카메라 앵커**: 최근 위치 세션이 아니라 **가장 많이 읽은 장소**(동률 = 더 최근). 한 달 전 출장지가
  동네로 뜨는 문제(실기기 실측).
- MapKit 표준 스타일 `emphasis: .muted`, 카드 하단 안전 영역 42(애플 지도 고지가 칩에 가리지 않게).
