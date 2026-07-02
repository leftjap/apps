# MOTION — 애니메이션 스펙

원칙: 모션은 장식이 아니라 **상태 전달**(기록 중/일시정지/쌓임/재개 몸짓). 정지 상태에서는 "살아있는" 모션(물결·점멸)을 반드시 멈춘다. 플랫폼 구현 시 CSS 키프레임을 네이티브 애니메이션(예: Reanimated, Core Animation)으로 치환하되 duration·easing·순서를 유지할 것. `prefers-reduced-motion` 시 무한 반복 모션은 정적 상태로 대체.

## 키프레임 카탈로그 (시안 helmet `<style>`에 원본 정의)

| 이름 | 정의 요약 | 용도 · 적용처 | duration/easing |
|---|---|---|---|
| `v4Float` | translateY 0→-6→0 | 로고(01)·홈 표지(02)·빈 표지(14) 부유 | 6–8s ease-in-out ∞ |
| `v4Blink` | opacity 1→.25→1 | 라이브 점(읽는 중/기록 중), 스트릭 마지막 점, 검색 캐럿 | 1.1–2.2s ∞ |
| `v5Fade` | opacity 0→1 + translateY 8→0 | 진입 스태거(로그인·홈·완독 그리드·캘린더), 완료 화면 텍스트 체인 | .45–.6s ease + delay |
| `v5Pop` | scale .6→1.1→1 | 체크 원(06), 표지(09), 스테퍼 숫자(07), 추가됨 ✓(13) | .35–.6s cubic-bezier(.2,1.2~1.3,.4,1) |
| `v5Sweep` | scaleX 0→1 (origin left) | 로그인 밑줄, 완료 화면 신규 바 구간, 책별 진행 바 | .9–1.1s cubic-bezier(.2,.8,.2,1) |
| `v5Stack` | scaleY 0→1.06→1 (origin bottom) | 주간 차트 바 스프링 등장 (delay ×.06s 스태거) | .6s cubic-bezier(.2,.8,.2,1) |
| `v5Drop` | translateY -16→2→0 + fade | `+26분` 칩 낙하(06) | .6s cubic-bezier(.2,1.2,.4,1), delay 1.9s |
| `v5Draw` | stroke-dashoffset 30→0 | 체크 패스 드로우(06) | .7s, delay .35s |
| `v5Ripple` | scale .5→1.65 + fade out (중심 고정) | 기록 중 동심원 물결(05), 완료·완독 원 둘레 | 2.8–4.2s ease-out ∞ (1.4s 위상차 3겹) |
| `v5RippleBtn` | 보더 링 scale 1→1.22 + fade | 홈/빈홈 CTA "무장됨" 링 | 2.6–3s ease-out ∞ |
| `v5Tick` | opacity 1↔.15 step | **라이브 타이머 콜론 점멸**(05) — 일시정지 시 정지 | 1s steps ∞ |
| `v6Flip` | rotateX 0→180(hold)→360 | 대기 화면 폰 텀블(03), 04 미니 플립 힌트 | 3.2–3.6s cubic-bezier(.45,0,.25,1) ∞, perspective 200–520 |
| `v7Shadow` | 그림자 scale 1→1.28 + opacity .32→.6 | 03 폰 텀블 바닥 그림자(플립과 동일 타이밍 동기) | 3.6s 동일 easing ∞ |
| `v6Pulse` | scale 1→1.012 + 보더 밝기 | 탭 존 호흡(05) | 2.4s ease-in-out ∞ |
| `v7Tap` | 링 scale .55→1.9 + fade | 탭 존 아이콘 파동(05) | 2.4s ease-out ∞ |
| `v6Spin` | rotate 360 | 04 점선 링 서행 회전(26s), 밀리 동기화 아이콘(5s) | linear ∞ |
| `v6Breath` | opacity .45↔1 | 대기 00:00:00(03), 시간대 하이라이트(10) | 2.6–3s ease-in-out ∞ |
| `v8Dim` | opacity .85↔.58 | **일시정지된 시간 숫자 디밍**(04) | 3.4s ease-in-out ∞ |
| `v7Star` | scale .4→1.14→1 + rotate -18°→4°→0 | 별점 팝(09), .08s 스태거 | .6s cubic-bezier(.2,1.4,.5,1) |
| `v7TipPop` | translateX(-50%) 유지 + scale .55→1 | 주간 팝오버 등장(10), delay 1.05s | .5s cubic-bezier(.2,1.2,.4,1) |
| `v8Up` | translateY 46→0 + fade | 바텀시트 3종 슬라이드-업(07·09·13) | .55s cubic-bezier(.2,.9,.3,1) |

## 상태 전환 시퀀스 (구현 필수)

### 기록 중 → 일시정지 (엎기: 들어 올림 / 탭: 존 탭)
- 물결(`v5Ripple`) 정지·페이드아웃, 콜론 점멸 정지, 시간 숫자는 `v8Dim` 디밍 시작.
- 05→04 형태로 UI 교체: 라이브 필 → 앰버 "일시정지됨" 필, 엠블럼 ⏸→▶.

### 일시정지 → 재개 (다시 엎기 / ▶ 탭)
- 역순: 디밍 해제, 콜론 점멸·물결 재시작. 재개 순간 엠블럼 1회 `v5Pop`.

### 세션 종료 → 완료 화면 (06) 타임라인
| t | 이벤트 |
|---|---|
| 0s | 체크 원 `v5Pop` + 둘레 `v5Ripple` 시작 |
| .35s | 체크 패스 `v5Draw` |
| .5 / .65 / .8s | "기록됐어요" → `26:14` → 칩 2개 `v5Fade` |
| 1.2s | 오늘 바 신규 구간 `v5Sweep` 성장 |
| 1.9s | `+26분` 칩 `v5Drop` 낙하 |
| 2.2s | 우측 합계 `58분` 그린 페이드인 |

### 진입 스태거 지연값
- 로그인: 제목 .05 / 카피 .15 / 버튼 .25s
- 홈: 히어로 0 / 스탯 .08 / 최근 .16s
- 완독 그리드(12): 표지별 .05~.3s (+.05s 간격)
- 주간 차트(10): 바별 ×.06s, 팝오버 1.05s
