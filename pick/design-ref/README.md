# 작업지시서 — taste (책·영화 평가→추천 PWA)

> **이 문서 하나로 구현 가능하도록 작성되었습니다.** 시안(HTML 프로토타입)을 그대로 배포하지 말고, 대상 코드베이스의 환경·패턴에 맞게 **재구현**하세요. 환경이 없다면 React + TypeScript 등 적합한 스택을 선택해 구현합니다.

---

## 0. 시안(디자인 레퍼런스)

| 항목 | 위치 |
|---|---|
| **단일 파일 시안 (바로 열기)** | 이 폴더의 `시안 — taste 프로토타입.html` — 더블클릭하면 브라우저에서 바로 동작 |
| **실행형 소스 (직접 편집 가능)** | 이 폴더의 `source/taste.html` + `source/app/*.jsx` |
| **임시 라이브 URL (~1시간 유효)** | https://71ba8f22-71d8-4d66-934e-9359b87a9da4.claudeusercontent.com/v1/design/projects/71ba8f22-71d8-4d66-934e-9359b87a9da4/serve/design_handoff_taste/%EC%8B%9C%EC%95%88%20%E2%80%94%20taste%20%ED%94%84%EB%A1%9C%ED%86%A0%ED%83%80%EC%9E%85.html?t=a3a71ca1e1b4a4c2aa1649cd76d7452917def0239bc52f542b24f653a0957eb2.77efd719-6301-42fe-9ef6-7fb85da0cfac.fcb3f812-6bb4-409e-a1c0-d9cfce470079.1780654026.fp&direct=1 |

> ⚠️ 라이브 URL은 약 1시간 후 만료됩니다. **기준 시안은 이 폴더의 `시안 — taste 프로토타입.html` 파일**입니다.

**Fidelity: 하이파이(hifi).** 색·타이포·간격·인터랙션이 확정된 픽셀 단위 목업입니다. 코드베이스의 기존 라이브러리/패턴으로 **픽셀 충실도 있게** 재현하세요.

> 참고: 시안의 포스터·표지는 모두 **저채도 줄무늬 플레이스홀더**입니다. 실제 제품에서는 외부 메타데이터(TMDB/도서 API 등)의 실제 이미지로 교체합니다. 단, **외부 사이트로 내보내는 링크는 없습니다**(§9 참조).

---

## 1. 제품 개요

**taste** — 책과 영화를 평가하면, 그 평가를 AI가 분석해 “다음에 볼·읽을 작품”을 **이유와 함께** 추천하는 개인용 PWA. 데스크톱 주력 + 모바일 대응.

사용자는 단 두 가지만 한다:
- **평가** — 본 작품을 검색해 별점을 매긴다. (검색이 평가의 입구)
- **소비** — 추천을 받아 그 작품의 정보를 앱 안에서 본다.

`평가 → 추천 → 소비 → 평가`로 순환한다.

**핵심 화면은 둘:** ① 홈(메인 추천 피드) ② 작품 상세(허브). 그 외(검색 오버레이, 계정 메뉴)는 부수.

---

## 2. 디자인 토큰 (그대로 사용)

```css
:root{
  /* 색 — 웜그레이 베이스, 코랄은 "점" 단위 액센트만 */
  --bg:#ffffff; --paper:#f6f4ee; --paper-2:#efece4;
  --line:#ececea; --hover:#f4f2ec;
  --ink-1:#15140f; --ink-2:#4a473f; --ink-3:#8a877d; --ink-4:#b8b5aa;
  --accent:#d97757; --accent-deep:#c2553a; --accent-soft:#f4d9cc;
  /* 점수색 */
  --gold:#c4973b; --sage:#788c5d; --danger:#b44d3b;
  /* 폰트 */
  --sans:"Pretendard",system-ui,sans-serif;   /* 기본 UI·본문 */
  --serif:"Noto Serif KR",serif;              /* (옵션) 읽는 본문 명조 토글용 */
  --mono:"JetBrains Mono",monospace;          /* 숫자·별점값·연도·라벨 */
  --read-font:var(--sans);                    /* 읽는 본문 기본 = 고딕(Pretendard) */
  /* radius */
  --r-sm:8px; --r-md:12px; --r-lg:18px; --r-xl:24px;  /* 칩·pill = 999px */
  /* 그림자 (웜블랙 3-stack) */
  --shadow-float:0 1px 0 rgba(20,18,14,.02),0 6px 14px -8px rgba(20,18,14,.08),0 24px 48px -24px rgba(20,18,14,.18);
  --shadow-pop:0 1px 0 rgba(20,18,14,.03),0 10px 24px -10px rgba(20,18,14,.14),0 40px 80px -32px rgba(20,18,14,.28);
  --shadow-inset-soft:inset 0 2px 6px -4px rgba(20,18,14,.10);
  --u:16px; /* 밀도 단위. compact=12 / regular=16 / comfy=21 */
}
```

**전역 본문 규칙**
- `font-family:var(--sans); font-size:15px; line-height:1.5; letter-spacing:-.012em; word-break:keep-all; -webkit-font-smoothing:antialiased;`
- 숫자·별점값·연도·러닝타임·미니 라벨 = `var(--mono)` + `font-feature-settings:"tnum"`(tabular-nums).
- **읽는 본문(줄거리·추천 이유)** = `var(--read-font)`(기본 고딕). 명조는 Tweak 옵션으로만 전환.

**불변 원칙 (위배 금지)**
- 그라디언트 배경 금지. 액센트(코랄)는 **점 단위**만 — 큰 면 채우기 금지.
- 위계는 색이 아니라 **타이포·여백**으로. 카드 좌측 컬러보더 금지.
- 폰트 3종(Pretendard / Noto Serif KR / JetBrains Mono)만 사용.

폰트 로드:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" />
```

---

## 3. 공통 컴포넌트

### 3.1 별점 StarRating ★ (제품 정체성 — 정확히 재현)
- 별 5개, **0.5단위**. 절반 채움은 별 위에 `clip-path` 별 폴리곤 2겹(빈 트랙 + 채움 레이어, 채움 width %로 제어).
  - 별 폴리곤: `polygon(50% 2%,61% 35%,97% 35%,68% 57%,79% 92%,50% 71%,21% 92%,32% 57%,3% 35%,39% 35%)`
- 채움색 = `--gold`. 값 라벨 = `--mono` `tnum`.
- **0.5★ = “비추”** (앱 정체성): 값이 `>0 && ≤0.5`이면 채움·값을 `--danger`로, 옆에 빨강 `비추` 칩(흰 글씨, pill) 표시. 다른 점수와 시각적으로 분명히 분리.
- 편집 모드: 각 별을 좌/우 절반 히트영역으로 나눠 좌=`x.5`, 우=`x.0`. 호버 시 미리보기. 같은 값 재클릭 = 0(해제).
- props: `value, editable, onChange, size(기본 28 in 상세), showValue`.

### 3.2 포스터/표지 Poster
- 저채도 줄무늬 플레이스홀더(실제 이미지로 교체 예정). 작품마다 결정적 `hue`로 색 한 점.
  - bg: `repeating-linear-gradient(135deg, oklch(0.86 0.045 H) 0 11px, oklch(0.81 0.05 H) 11px 22px)`, 글자 `oklch(0.34 0.06 H)`.
  - 모서리 위 `FILM`/`BOOK` (mono 9px), 아래 연도(mono 9px).
- **책 구분**: `type==='book'`이면 좌측에 **책등(spine)** — 표지 왼쪽 안쪽 세로선(`oklch(0.74 0.06 H)`, 2px, left:5px), 좌패딩 14px. 영화는 책등 없음. (색이 아니라 형태로 책/영화 구분)
- `box-shadow:var(--shadow-float)`.

### 3.3 칩 Chip / 점 Dot
- 칩: `height 28px; padding 0 12px; border 1px var(--line); radius 999; font 12.5px; color ink-2`. 활성 = `bg accent-soft; color ink-1; border transparent`.
- Dot: 코랄 원(액센트 점). 기본 6px.

### 3.4 스켈레톤 sk / 펄스 pulse
- `sk`: `linear-gradient(90deg,var(--paper),var(--paper-2),var(--paper))` 200% 배경 + `shimmer 1.4s` 무한.
- `pulse`: 8px 코랄 원, `pulse 1.1s`(투명도/스케일).
- AI “분석 중” 상태 표시에 사용(§7).

---

## 4. 전역 셸 (상단바 · 컨테이너)

- **컨테이너**: 콘텐츠 `max-width:1060px; margin:0 auto;` padding `clamp(24,4vw,48)px clamp(20,5vw,56)px 120px`.
- **상단바(sticky, z40)**: `bg color-mix(in oklab,var(--bg) 86%,transparent)` + `backdrop-filter:saturate(1.2) blur(14px)` + 하단 `1px var(--line)`. 내부(`.topbar__inner`)는 `max-width:1060` 중앙정렬, `padding:15px clamp(20,5vw,56)px`, `display:flex; align-items:center; gap:18px`.
  - **좌: 브랜드** `taste` (27px/700/-.045em) + 코랄 점(7px). 클릭=홈.
  - **중앙: 검색 큐** `flex:1; max-width:520px; height40; bg paper; border line; radius999;` — 돋보기 + “작품을 검색해 평가하기” + `⌘K` kbd. 클릭=검색 오버레이.
  - **우: 아바타** 38px 원(`bg paper-2; border line`, 글자 “나”). 클릭=계정 드롭다운(§6.3).
- 모바일(≤880): 검색 큐는 44px 아이콘만, 라벨 숨김.

---

## 5. 화면 — 홈 (메인 추천 피드)

세로 구성(`.home`, gap `calc(var(--u)*2.4)`):

1. **인트로(중앙정렬)** `.home__intro` — `align-items:center; text-align:center`.
   - 인사 `다음에 무엇을 볼까요` (clamp 30–46px / 700 / -.04em).
   - 노트 `지금까지 평가한 N편을 취합해 골랐습니다.` (15px ink-3, 숫자=mono, `white-space:nowrap`).
   - **세그먼트 필터** `전체 / 영화 / 책` (pill, `bg paper; border line`, 활성 칸 `bg bg + shadow-inset-soft`). 책·영화를 1급으로 구분하는 진입점.

2. **오늘의 추천 Featured** `.feat` — **영역 전체가 클릭(호버 시 `bg paper`)**. 별도 “열기” 버튼 없음.
   - eyebrow: `● 오늘의 추천` + 종류 태그(mono pill `영화`/`책`).
   - body(flex): 포스터(108w) + 텍스트(제목 clamp 21–27/700, 메타 mono, **이유**=read-font 16.5px/1.68 max-width 60ch).
   - 하단 **근거 표시 Basis**: 단어 “근거” 없이 옅은 `↳` 뒤에 출처 작품을 옅은 링크(호버 시 코랄 밑줄)로. 칩 클릭은 `stopPropagation` 후 해당 작품으로 이동.
   - 필터가 `책`이면 Featured는 대표 **책** 추천으로 교체.

3. **트랙 2분할** `.tracks` (grid `1fr 1fr`, gap clamp 28–52). 책·영화를 **물리적으로 분리**.
   - `다음에 볼 영화` / `다음에 읽을 책` — 트랙 헤더는 조용한 라벨(13px/700, ink-3, letter-spacing .06em) + `N편` 카운트(mono). **굵은 구분선 쓰지 말 것.**
   - 각 항목 `.rec`: **행 전체 클릭**(호버 `bg paper`). 포스터(76w) + 제목(17px/700) + 이유(read-font 15px/1.66) + Basis.
   - 필터가 `영화`/`책`이면 해당 트랙만, `tracks`는 1열 `max-width 680`.

4. **최근 평가** `.recent` (상단 `1px line`) — 포스터(60w) 스트립 + 제목 + 별점값(mono, `★ 4.5` / 비추는 `비추 0.5` 빨강). 필터에 따라 종류별로 거름.

---

## 6. 화면 — 작품 상세 (허브) ★ 최우선

**엄격한 2열 그리드.** `.detail__body{display:grid; grid-template-columns:200px minmax(0,660px); gap:60px; align-items:start;}` — 좌우 끝선이 정확히 정렬되어야 함(시안 DOM 검증값: 사이드바 159→359, 본문 419→1079 공유).

상단에 경로(브레드크럼) `.trail` — 가지를 타고 온 작품들 `제목 가지 → 제목 …`(현재=굵게, 이전=링크, `가지 →` 구분 mono 코랄). 경로 길이>1일 때만 표시.

### 6.1 좌측 사이드바 `.rail` (sticky, `top:92px`, `width:200px`)
- **포스터** — `width 200`(컬럼 폭에 꽉 차게) → 아래 정보·별점과 좌우 끝선 일치.
- **정보 dl** `.info` — 행마다 상단 `1px line`(첫 행 제외). 그리드 `48px 1fr`.
  - 영화: `감독 / 출연 / 극본`. 책: `저자 / 옮김 / 출판`.
  - 키 12px ink-3, 값 14px ink-1.
- **내 평가 ratebox** — `bg paper; border line; radius-md; padding 18`. 라벨 `내 평가` + StarRating(size 28, editable, 세로 배치). 평가됨이면 `평가 지우기`(밑줄, 호버 danger).

### 6.2 우측 본문 `.detail__main` (flex column, gap `calc(--u*2)`)
1. **헤더** `.detail__head`
   - kind 줄: `● 영화` (또는 책) + `|` 구분 후 measure(`138분`/`636쪽`, mono ink-4, 좌측 `1px line` 구분).
   - 제목 `.detail__title` (clamp 30–46px / 700 / -.04em / line-height 1.06).
   - 서브 `.detail__sub` (mono 13.5px ink-3) — 원제·감독/저자·연도.
   - 태그 칩들.
2. **줄거리** `.reading`
   - 라벨 `줄거리`(13px ink-3 tracking).
   - 본문 `.reading__body` — **read-font(고딕) 19px / line-height 1.92 / ink-1 / text-wrap:pretty**, 컬럼 폭(660)을 채움(`max-width:none`). 묵직하게 읽히는 본문.
3. **갈래(브랜치)** `.branches` — *이 한 작품에서 이어지는 다른 작품.* **인덱스 카탈로그**(절대 홈 행 복제 금지, 연결선/노드 도표 금지).
   - 헤더: `이 작품에서 이어지는 갈래`(13px ink-3 tracking) + `N갈래`(mono). 분석 중이면 상태문구로 교체(§7).
   - 각 행 `.branch` — grid `26px 48px 1fr`, `align-items:start`, 행마다 상단 `1px line`(첫 행 제외), **행 전체 클릭**.
     - `① 인덱스` `01/02/03` mono 12px ink-4(호버 시 코랄).
     - 포스터 48w.
     - 본문: 제목(16px/700, 호버 코랄) + 종류 태그(mono pill) / **이유**(read-font 14.5px/1.62 ink-2).
   - 호버: 인덱스+제목에 코랄. (행 배경 강조 없음 — 정렬축 유지)
   - **클릭하면 해당 작품 상세로 가지치며 이동**(경로에 push, 스크롤 top).

> 갈래는 **이 작품 한 편에서 뻗는** 추천. 홈의 메인 추천(전체 평가 취합)과 층위가 다르다.

---

## 7. AI 분석 연출 (즉시 아님 — 핵심 UX)

평가가 바뀌면 AI 추천은 **즉시가 아니라 잠시 뒤** 도착한다.
- `setRating(id, value)` 시 → `analyzing` 상태를 설정:
  - 상세에서 평가 → `analyzing = 작품id`(그 작품의 **갈래**가 분석 중).
  - 홈 맥락 → `analyzing = 'home'`(홈 피드 갱신 중).
- **약 2300ms 후** `analyzing=null`로 해제.
- 분석 중 표시:
  - 갈래/트랙: 항목 자리를 **스켈레톤**으로 채우고, 헤더 상태를 `● 평가를 반영해 다시 고르는 중…`(코랄 펄스 + accent-deep)로.
  - Featured: 이유 자리에 `펄스 + 새 평가를 반영해 추천을 다시 고르는 중입니다.`
- 프로토타입은 setTimeout 더미. **실제 구현은 백엔드 추천 API 호출**로 대체하되, “분석 중 → 곧 도착” 상태 전이는 그대로 유지(낙관적 즉시 반영 금지 — 의도된 지연 연출).

---

## 8. 검색 (1급 시민)

- 진입: 상단 검색 큐 클릭 / `⌘K`(또는 Ctrl+K) / 입력 포커스 아닐 때 `/`. 닫기: `Esc` 또는 스크림 클릭.
- 오버레이: 스크림(`rgba(20,18,14,.30)` + blur) + 모달(`width min(640,92vw); radius-lg; shadow-pop`, `rise` 애니메이션).
  - 입력 바: 돋보기 + 인풋(17px, placeholder `제목 · 감독 · 저자 · 출연으로 검색해 평가하기`). **`esc` 힌트 표기는 두지 않음.**
  - **타입 필터**: `전체 / 영화 / 책` 세그먼트(sm) + `N건` 카운트.
  - 결과 행 `.sresult`: 포스터(36w) + 제목/서브 + 종류 배지(`영화`/`책`). 호버 `bg hover`. 클릭 → 해당 작품 상세로 이동(새 경로 시작), 오버레이 닫힘.
  - 빈 질의는 상위 10개 노출. 질의는 `제목+서브+태그+감독+저자+출연` 부분일치(대소문자 무시).

---

## 9. 제외 범위 (시안에서 의도적으로 뺀 것 — 추가하지 말 것)

- **외부 OTT/구매 링크 없음** (왓챠/알라딘 등으로 내보내지 않음). 모든 정보를 앱 안에서 소비.
- 예상 별점 수치, 통계 대시보드, 추천 dismiss, 별도 설정 화면, 소셜/팔로우 — 없음.
- 더미 채움용 슬롯·의미 없는 숫자/아이콘 금지. 미니멀 유지(“이유”가 주인공).

---

## 10. 상태 / 데이터

### 10.1 화면 상태 (프로토타입)
- `view`: `{ name:'home'|'detail', path:string[] }` — 상세는 가지치기 경로 스택.
- `ratings`: `{ [workId]: number(0~5, 0.5단위) }`. 평가 0 = 해제.
- `analyzing`: `null | workId | 'home'`.
- `searchOpen`, `menuOpen`.
- **영속화(프로토타입)**: `localStorage['taste.view']`, `localStorage['taste.ratings']`. **실제 구현은 사용자 계정 + 백엔드 저장**으로 대체.

### 10.2 작품 데이터 스키마
```ts
type Work = {
  id: string;
  type: 'film' | 'book';
  title: string;
  sub: string;            // "박찬욱 · 2022" / "유발 하라리 · 김영사"
  year: number;
  hue: number;            // 포스터 플레이스홀더 색조(실이미지 도입 시 불필요)
  runtime?: number;       // 영화(분)
  pages?: number;         // 책(쪽)
  meta:                   // 영화: {director, cast[], writer}
    | { director:string; cast:string[]; writer:string }
    | { author:string; translator?:string; publisher:string };  // 책
  tags: string[];
  summary: string;        // 줄거리 본문(읽는 본문)
  rating?: number;        // 사용자 평가 시드(0.5단위)
  branches: { to:string; reason:string }[];  // 이 작품 → 다른 작품(이유 포함)
};
```
- **메인 추천(홈)**: 평가 전체 취합 결과. `{ heroFilm, heroBook, films[], books[] }` 형태로, 각 추천은 `{ to, reason, basis:string[] }`(basis=추천 근거가 된, 사용자가 평가한 작품들).
- 시안의 더미 그래프는 `source/app/data.js` 참고(헤어질 결심·패스트 라이브즈·기생충·버닝·화양연화·콜 미 바이 유어 네임·어느 가족·드라이브 마이 카·추락의 해부·가여운 것들 / 사피엔스·데미안·노르웨이의 숲·1984·호모 데우스·코스모스·아몬드 — 서로 branches로 연결).
- **추천 “이유”가 주인공**: 짧아도 사람이 쓴 듯한 한국어 한두 문장. 포스터보다 이유가 읽혀야 함. (실 서비스에서는 LLM이 사용자의 별점·작품 메타로 생성)

### 10.3 추천 엔진(서버) 계약 — 권고
- 입력: 사용자 평가 집합. 출력: ① 홈 메인 추천(영화/책 트랙) ② 각 작품 상세의 갈래. 각 추천은 `{ workId, reason(자연어), basis:workId[] }`.
- 평가 변경 → 비동기 재생성. 클라이언트는 “분석 중”을 보이고, 완료 시 교체(§7).

---

## 11. 반응형 / 접근성

- **데스크톱 주력**, 모바일 대응. 브레이크포인트 880 / 560.
  - ≤880: 상단바 검색 큐 아이콘화; 홈 트랙 1열; **상세 2열→1열**(사이드바 static), 갈래 그대로 세로.
  - ≤560: rec/feat 간격 축소, feat 하단 세로 적층.
- `prefers-reduced-motion: reduce` → 애니메이션 사실상 제거(시안에 처리됨). 슬라이드 등장 애니메이션은 base가 보이는 상태여야(접힘 상태로 고정되지 않게).
- 모바일 히트 타깃 ≥44px. 별점 별 히트영역은 충분히 크게.
- 키보드: 검색 `⌘K`/`/`/`Esc`, 메뉴 `Esc`+바깥클릭 닫힘. 클릭 가능한 행에 적절한 역할/포커스 부여(시안은 `<a>`/`<button>` 사용).
- 색 위계가 정보를 단독 전달하지 않게(비추는 색+`비추` 텍스트 칩 병행).

---

## 12. Tweaks(시안 전용 토글) — 제품엔 불필요

시안에는 디자인 탐색용 토글이 있음(액센트색 / 읽는 본문 serif·sans / 이유 강조 / 밀도). **제품 기본값**만 채택:
- 액센트 `#d97757`, 읽는 본문 **gothic(sans)**, 이유 강조 regular, 밀도 regular.

---

## 13. PWA / 비기능

- 설치형 PWA(매니페스트 + 서비스워커, 오프라인 시 최근 데이터 캐시).
- 폰트 3종 로딩 전략(FOUT 최소화). 한국어 본문 `word-break:keep-all; text-wrap:pretty`.
- 다크모드는 시안 범위 밖(요청 시 추후).

---

## 14. 파일 안내 (이 패키지)

```
design_handoff_taste/
├─ README.md                     ← 이 작업지시서
├─ 시안 — taste 프로토타입.html   ← 단일 파일 시안(바로 열기)
└─ source/                       ← 실행형 소스(레퍼런스)
   ├─ taste.html                 ← 진입 HTML + 전체 스타일(<style>)
   └─ app/
      ├─ data.js                 ← 더미 작품 + 브랜치 그래프 (스키마 참조)
      ├─ ui.jsx                  ← Poster, StarRating(★비추), Chip, Dot
      ├─ home.jsx                ← 홈: Segmented, Featured, Track, RecRow, Basis
      ├─ detail.jsx              ← 상세: 사이드바 + 줄거리 + 갈래 카탈로그
      ├─ main.jsx                ← 셸: 라우팅, 검색 오버레이, 계정 메뉴, AI 연출
      └─ tweaks-panel.jsx        ← 시안 전용 Tweaks(제품 불필요)
```
> 소스는 인-브라우저 Babel + 전역 window 등록 방식의 **프로토타입**입니다. 제품에서는 모듈 번들러/컴포넌트 체계로 재구성하세요. CSS 변수 토큰과 클래스별 수치는 그대로 이식 가능합니다.

---

## 15. 구현 우선순위

1. 토큰·전역 스타일·폰트.
2. 공통 컴포넌트(특히 **StarRating 0.5/비추**, Poster+책등).
3. **작품 상세(허브)** — 2열 그리드 정렬 + 갈래 인덱스 카탈로그.
4. 홈(중앙 인트로 + 세그먼트 + 영화/책 트랙 + Featured).
5. 검색 오버레이(1급, 타입 필터).
6. AI 분석중→도착 연출 + 추천 API 연동.
7. 반응형·PWA·접근성.
