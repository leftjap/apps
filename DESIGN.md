# DESIGN.md

> 정적이고 따뜻한 웜그레이 톤의 글쓰기 인터페이스 디자인 시스템.
> 미니멀·모노톤·이모지 없음. 색은 위계 강조 목적으로만 — 그레이 8~10단계 + 액센트는 점 단위 (Crail/Cloudy).
> Light only — 다크 모드는 별 spec.
> **토큰 + 원칙 + 안티패턴만.** 컴포넌트 구현 코드는 각 앱 spec 자체 정의.

**목차:** [원칙](#1-디자인-원칙) · [컬러](#2-컬러) · [타이포](#3-타이포) · [레이아웃](#4-레이아웃) · [깊이](#5-깊이-depth) · [컴포넌트](#6-컴포넌트-원칙)

---

## 1. 디자인 원칙

**무드:** 차분함 / 종이 같음 / 따뜻한 회색. 콘텐츠 자체는 움직이지 않음 — 인터랙션 피드백만 150-250ms.

**시그니처:** 떠 있는 라운드 사이드바 / 2/255 톤 차이 (sidebar↔shell) / Crail orange 액센트 (한 화면 1-2회).

**공통 원칙:**
- **One bold element + restraint** — 시선 끄는 요소 1개, 나머지 절제
- **Generous negative space** — 빈 공간은 의도. 채우지 말 것
- **Asymmetric > Symmetric** — 비대칭 레이아웃, 대칭 그리드 회피
- **Typography-driven hierarchy** — font-size/weight/color 변화로 위계, 컬러 박스 회피

**금지:** 그라디언트 배경 (AI slop) / Inter·Roboto·Arial 본문 / Emoji UI 라벨 / SVG 일러스트로 빈 공간 채우기.

---

## 2. 컬러

```css
:root {
  /* Surfaces */
  --tone-255: rgb(255, 255, 255);
  --tone-253: rgb(253, 253, 253);
  --tone-243: rgb(243, 243, 243);
  --shell:    var(--tone-253);
  --sidebar:  var(--tone-255);
  --hover-bg: var(--tone-243);
  --sunken:   oklch(97.6% 0.006 60);
  --line:     oklch(92.0% 0.006 60);
  --line-soft:oklch(94.5% 0.006 60);

  /* Ink — 4단 lightness + 순검정 (CTA 한정) */
  --ink-1: oklch(22% 0.008 60);
  --ink-2: oklch(38% 0.008 60);
  --ink-3: oklch(56% 0.008 60);
  --ink-4: oklch(72% 0.006 60);
  --black: #000;

  /* Accents — 2 family × 3 shade (점 단위만) */
  --crail-soft: oklch(85% 0.05 50);
  --crail-base: oklch(67% 0.12 50);   /* #d97757 */
  --crail-deep: oklch(48% 0.14 50);
  --cloudy-soft: oklch(88% 0.04 240);
  --cloudy-base: oklch(65% 0.08 240); /* #6a9bcc */
  --cloudy-deep: oklch(42% 0.12 240);

  /* Semantic */
  --warning: #c98a3f;
  --danger:  #c5544a;
}
```

**규칙:**
- 회색·액센트 hue/chroma 라인 고정. 신규 hex 추가 금지.
- 액센트는 점 단위 (단어·기호) — 큰 면 채움 금지. family 2 한정. `*-soft` 변형은 배지·칩 활성·hover 배경 등 작은 면 허용.
- 검정: 본문·면=`--ink-1`, 포인트 CTA=`--black`, 그림자=`rgba(20,18,14,…)`.

---

## 3. 타이포

```html
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

```css
:root {
  --font-sans: "Pretendard", "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

| 용도 | size / weight / line-height |
|---|---|
| h1 문서 제목 | 28 / 600 / 1.3 |
| h2 섹션 | 20 / 600 / 1.35 |
| h3 그룹 | 16 / 600 / 1.4 |
| **body 본문** | **15 / 400 / 1.85** |
| ui (네비·버튼·라벨) | 14 / 500 / 1.3 |
| meta | 12 / 500 / 1.5 |
| micro (mono) | 11 / 500 / 1.4 (letter-spacing 0.02em) |
| label (한글) | 12 / 500 / 1.3 |
| label (영문·숫자 mono UPPER) | 11 / 500 / 1.3 (letter-spacing 0.08em) |

**규칙:** 한글 본문 무조건 Pretendard. 모노는 메타 정보 (날짜/시간/금액/ID) 전용 — 정렬·자릿수 의미 가질 때만. 본문에 `text-wrap: pretty`.

---

## 4. 레이아웃

```css
:root {
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;

  --r-sm: 8px;  --r-md: 12px; --r-lg: 18px; --r-xl: 24px;
}
```

- **읽기 칼럼** `max-width: 720px` 가운데 정렬 (60-75자 폭)
- **사이드바 폭** 244-252px (기본) + 토글 collapse 60px (icon-only) + 16px 마진 + 18px 라운드
- **그리드 금지** — 단일 칼럼 + 카드 스택. 카드 그리드 필요 시: 큰 카드 `repeat(auto-fit, minmax(280px, 1fr))`, 작은 카드 (선택형 칩-카드) `repeat(auto-fit, minmax(110px, 1fr))`
- **단일 폼 카드** (로그인·온보딩) = 폭 320-400 + 중앙 정렬 + r-lg + shadow-float
- **spacing** 4의 배수 토큰만. 13/17/21px 같은 임의값 금지
- **반응형** 768px↓ 모바일 (사이드바 drawer 슬라이드) / 1024px↓ 태블릿 (collapse 60px) / 1025px↑ 데스크톱 (244-252 expanded)
- **사이드바 변형** 모바일 drawer = 좌측 슬라이드 + 마진 X + 좌상/좌하 r-lg / 태블릿 collapse = nav padding 6px + 라벨 hide + 아이콘만
- **터치 타겟** 최소 44×44px (모바일)

---

## 5. 깊이 (Depth)

**원칙:** 색 차이 최소 + 그림자로 입체. 박스 분리 (사이드바=255 / shell=253 + `--shadow-float`), 흰 위 흰 박스(255+255)도 그림자만으로 세련됨 (Apple Liquid Glass). 박스 외 변주: 버튼·토글·드롭다운·세그먼트 active 등 인터랙티브 요소도 동일 원리 + hover lift / focus 강화 / pressed 감소 — 그림자 변화로 인터랙션 시그널.

```css
:root {
  --shadow-float:                  /* 사이드바, 강조 카드, 모달 */
    0 1px 0 rgba(20,18,14,0.02),
    0 6px 14px -8px rgba(20,18,14,0.08),
    0 24px 48px -24px rgba(20,18,14,0.18);
  --shadow-pop:                    /* popover, dropdown */
    0 1px 0 rgba(20,18,14,0.03),
    0 8px 16px -10px rgba(20,18,14,0.18),
    0 24px 48px -24px rgba(20,18,14,0.24);
  --shadow-inset-soft:             /* 살짝 떠 있는 입력창 */
    0 4px 12px -8px rgba(20,18,14,0.08);
}
```

**Surface 위계 (낮은→높은):** shell → sunken → surface(`--sidebar`+line) → float → pop. 같은 layer 위에 같은 layer 쌓기 금지. outer 그림자 = 3-stack (`float`/`pop`), inset = 1-stack (`inset-soft`). outer 단겹 금지.

---

## 6. 컴포넌트 원칙

코드는 각 앱 spec 자체 정의. 가이드는 원칙만:

- **사이드바**: 떠 있는 카드 (margin 16, r-lg 18, shadow-float). nav 항목 hover/active = `--hover-bg`. 활성 아이콘 = `--crail-base`. 내부 카드·그림자 추가 금지 (같은 layer 중첩 §5)
- **카드**: `--sidebar` 배경 + line + r-md. 좌측 컬러 보더 금지. variants = 기본 / float / sunken (`--sunken`) / 선택 (`--crail-soft` + `--crail-base` 보더 + hover lift). 내부 typography: 제목 16/600 / 본문 14/400 / 메타 mono 11
- **모달**: `--sidebar` + r-lg 18 + shadow-pop. backdrop = `oklch(22% 0.008 60 / 0.32)` + blur(4px)
- **버튼**: Primary 일반 = `--ink-1` 배경 + 흰 텍스트 / Primary 포인트 = `--black` 배경 (페이지당 1-2개) / Secondary = `--sidebar` + line / Ghost = 투명, hover `--hover-bg`
- **입력**: `--sidebar` 배경 + `--line` 1px 보더 + r-sm + shadow-inset-soft. focus = `--crail-base` 2px 보더 + 3px alpha 16% ring (밑줄 변형 금지). placeholder = `--ink-4`. 본문 contenteditable 예외: 보더·배경 X, placeholder = `--ink-3` (UI 최소)
- **필수 표시**: 라벨 옆 `*` (`--ink-3` 회색, weight 600). screen-reader 텍스트 `(필수)` 추가 (`.sr-only` 클래스 또는 `aria-required="true"`). 색만 의존 금지 (WCAG 1.4.1)
- **폼 구분**: 필드 간 = spacing 우선 (8-12px). divider 는 섹션 구분 한정 (입력 영역 ↔ 액션 영역). 매 필드 구분선 금지
- **칩 (chip)**: r-pill (999px) + 12px sans + padding 4-10px. 기본 = `--hover-bg` 배경 / 활성 = `--crail-soft` + `--crail-base` 보더 + `--ink-1` 텍스트 (가독성)
- **링크**: 인라인 텍스트 = `--cloudy-deep` (가독성)
- **인용**: 좌측 2px `--crail-base` border
- **알림 dot**: 6×6 + `--crail-base` + 1.5px `--sidebar` 보더 (donut)
- **툴바 (toolbar)**: sticky + 본 화면 동일 배경 (UI 최소). 항목 = 32×32 ghost 버튼. 활성 = `--crail-base` 텍스트/아이콘. 하단 1px `--line-soft` 보더
- **toast**: r-md + shadow-pop + `--sidebar` 배경 + 12-13px 본문. 자동 사라짐 3-4초. `role="status"` (정보) 또는 `role="alert"` (오류)
- **popover/dropdown**: r-md + shadow-pop + `--sidebar` 배경 + line. max-h 320 scroll. 항목 hover/`aria-selected` = `--hover-bg`

**상태:** hover = `--hover-bg` 또는 살짝 lift / focus = `--crail-base` 2px + 16% alpha ring / pressed = 그림자 감소 / disabled = `--ink-3` + 그림자 제거 / loading = skeleton·spinner + `aria-busy` / error = `--danger` plain text + `role="alert"`.

**원칙:** 모든 컴포넌트는 4 surface (shell/sidebar/hover-bg/sunken) + 4 ink + Crail/Cloudy 2 family 액센트 조합으로 표현. 신규 hex/액센트 추가 전 토큰 조합으로 표현 가능 검증.
