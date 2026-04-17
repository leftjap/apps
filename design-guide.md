# UI 디자인 가이드 — Anthropic Design Principles

> 모든 리빌드 앱(Board, Study, Gym, Today)의 UI/컬러/타이포/레이아웃 공통 기준.
> **이 문서가 유일한 디자인 권위 문서.** 구 `ui-color-reference.md` 대체.

---

## 1. 디자인 철학

Anthropic 공식 브랜드 + Harness Design 블로그 원칙 기반.

### 핵심 원칙
- **One bold element + restraint**: 화면당 시선을 끄는 요소 1개. 나머지는 절제
- **Generous negative space**: 빈 공간은 실수가 아니라 의도. 채우지 말 것
- **Staggered reveal**: 콘텐츠가 순차적으로 나타나는 미묘한 진입 애니메이션 (50ms 딜레이 간격)
- **Asymmetric > Symmetric**: 예측 가능한 좌우 대칭 그리드보다 비대칭 레이아웃
- **Typography-driven hierarchy**: 색상 박스/뱃지 대신 font-size/weight/color 변화로 위계 표현

### 안티패턴 (금지)
- 보라/파랑 그라디언트 배경
- 모든 빈 공간을 콘텐츠로 채우기
- Stock/Generic UI 컴포넌트 (Bootstrap 기본 스타일 등)
- 예측 가능한 대칭 카드 그리드
- 컬러 도트/컬러 박스로 상태 표시 (타이포그래피 방식 우선)
- Inter, Roboto, Arial 등 generic sans-serif를 display 용도로 사용

---

## 2. 컬러 팔레트

### Core Palette (확정, 2026-04-12)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#faf9f5` | 앱 배경 |
| `--bg-card` / `--surface` | `#ffffff` | 카드/모달 상면 |
| `--bg-warm` | `#f5f0ea` | 강조 배경 (히어로 등) |
| `--text` | `#3d3929` | 본문 텍스트 |
| `--text-strong` | `#141413` | 제목/강조 |
| `--text-muted` | `#8a8475` | 보조 텍스트 |
| `--text-faint` | `#b5ad9e` | placeholder/비활성 |
| `--accent` | `#d97757` | Primary CTA/강조 (Crail~Peach 중간) |
| `--accent-hover` | `#c4623f` | hover 상태 |
| `--sage` | `#788c5d` | 성공/Pass |
| `--blue` | `#6a9bcc` | 정보 |
| `--amber` | `#c4973b` | 경고/Threshold |
| `--danger` | `#b44d3b` | 에러/Fail |
| `--border` | `#e8e4dc` | 보더 기본 |
| `--border-light` | `#f0ece4` | 보더 연한 |

### 색상 규칙
- **하드코딩 금지**: 색상값 직접 사용 금지. 반드시 `var(--*)` 토큰 참조
- **차가운 색 금지**: clinical blue (#2563EB), 순수 검정 (#000), sterile white 위 순수 그레이 보더 금지
- **그림자는 웜 톤**: `rgba(0,0,0,...)` 금지. `rgba(20,20,19,...)` 또는 `rgba(55,45,30,...)` 사용
- **Semantic 일관성**: 성공=sage / 경고=amber / 에러=danger / 정보=blue — 전 앱 동일

---

## 3. 타이포그래피

### 폰트 (확정, 2026-04-12)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--font-display` | `'Poppins', system-ui, sans-serif` | 제목/UI 레이블/버튼/숫자 |
| `--font-body` | `'Noto Sans KR', system-ui, sans-serif` | 본문/설명/카드 내용 |
| `--font-mono` | `'SF Mono', 'Fira Code', monospace` | 코드/ID |

Google Fonts 로드: `Poppins:wght@300;400;500;600` + `Noto+Sans+KR:wght@300;400;500`

### 타이포 규칙
- Poppins = 제목/UI 전용. 본문에 쓰지 않음
- Noto Sans KR = 본문/카드 내용. 제목에 쓰지 않음
- **Inter, Roboto, Arial 금지** (generic하고 editorial 느낌 없음)
- Line height: 본문 1.65, 제목 1.25
- Letter spacing: 본문 0, UI 레이블 0.01~0.02em

---

## 4. 레이아웃 토큰

### Spacing (4px base)
`--s-1` (4px) ~ `--s-16` (64px). 주요: `--s-4` (16px) 기본 패딩, `--s-6` (24px) 섹션 간격, `--s-12` (48px) 대구간 분리.

### Radius
| 토큰 | 값 | 용도 |
|---|---|---|
| `--r-sm` | `6px` | 버튼/인풋 |
| `--r-md` | `10px` | 카드/드롭다운 |
| `--r-lg` | `16px` | 모달/큰 패널 |
| `--r-pill` | `999px` | pill 버튼 |

### Shadow (웜 톤)
- xs: `0 1px 2px rgba(20,20,19,0.04)`
- sm: `0 1px 3px rgba(20,20,19,0.04), 0 8px 32px rgba(20,20,19,0.06)`
- 카드 기본: sm. 모달: lg.

### Transition
- `--ease`: `cubic-bezier(0.4, 0, 0.2, 1)`
- 기본 150ms. 과장된 스프링/바운스 금지

---

## 5. 배경 텍스처

모든 앱 `body`에 SVG fractalNoise 텍스처 적용 (1.5% opacity):

```css
background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.015'/%3E%3C/svg%3E");
background-size: 256px 256px;
```

---

## 6. 컴포넌트 패턴

### 버튼
- **Primary**: accent 배경 + 흰 텍스트, border 없음
- **Secondary**: 투명 배경 + accent 텍스트 + accent 20% 보더
- **Ghost**: 배경/보더 없음 + muted 텍스트, hover 시 연한 배경
- **Judge (판정)**: 텍스트 레이블만 (도형/심볼 없음). 각 상태 색상의 25% 보더로 구분. hover 시 보더 강화

### 카드
- 배경 surface, 보더 border, radius r-lg, shadow sm
- 좌측 색상 보더 금지 (사용자 확정)
- hover 시 shadow 승격은 인터랙티브 카드만

### 구분선
- `border-bottom` 보더 대신 **여백(margin)으로 시각 분리** 우선
- 불가피한 경우만 `--border-light` 1px

### 캘린더 (주간)
- Typography-driven: 학습 강도를 font-size/weight/color 변화로 표현
- 오늘: accent 밑줄 마커
- 컬러 박스/도트 금지

### Streak 배지
- 숫자 뒤 radial-gradient glow (accent 20% → transparent)
- 큰 숫자 + 단위 텍스트 조합

---

## 7. 진입 애니메이션 (Staggered Reveal)

```css
.reveal {
  opacity: 0;
  transform: translateY(12px);
  animation: revealUp 0.5s var(--ease) forwards;
}
.reveal-1 { animation-delay: 0ms; }
.reveal-2 { animation-delay: 50ms; }
.reveal-3 { animation-delay: 100ms; }
.reveal-4 { animation-delay: 150ms; }

@keyframes revealUp {
  to { opacity: 1; transform: translateY(0); }
}
```

---

## 8. 변경 이력

- **2026-04-12 v2**: 본문 폰트 Lora(serif) → Noto Sans KR(sans-serif) 교체. 한국어 본문에 명조체 렌더링 방지.
- **2026-04-12**: 초기 작성. Anthropic frontend-design SKILL.md + brand-guidelines SKILL.md + Harness Design 블로그 기반. `ui-color-reference.md` 대체. Study 앱 preview v7 확정 반영. 폰트 Source Serif 4 + Inter → Poppins + Lora 로 교체. 판정 버튼 도형 제거 확정.
