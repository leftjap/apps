# .oracle — 기록 화면 픽셀 오라클

`design-ref/design_handoff_record_stats/mockups/RTRecord.dc.html`(목업, 동작하는 HTML)을
Chrome 으로 **390×844 @2x** 렌더해 찍은 스크린샷. 기록 화면(주·월·지도·장소시트·책상세)의
SwiftUI 구현이 시안과 일치하는지 대조하는 기준값이다.

| 파일 | 상태 |
|---|---|
| `ora-week.png`  | 주간 탭 |
| `ora-month.png` | 월간 탭 |
| `ora-map.png`   | 지도 탭 (기본 뷰) |
| `ora-sheet.png` | 지도 → 뉴욕 핀 탭 → 장소 시트 |
| `ora-book.png`  | 장소 시트 → 파친코 표지 탭 → 책 상세 (시트 위에 겹침) |
| `ora-home.png`  | **홈(02) 도킹 카드** — 별도 시안·별도 절차. 아래 "홈 오라클" 참조 |

## 검증

```sh
scripts/record-verify.sh <출력디렉터리>
```

rtshot 으로 같은 5개 상태를 렌더해 오라클과 대조한다. 두 지표를 함께 본다:

1. **픽셀 불일치율** + `<n>-sbs.png`(오라클|렌더|diff) + `<n>-ov.png`(빨강=오라클 / 청록=렌더 오버레이)
2. **구조 랜드마크**(`record-landmark.py`) — 카드 경계·막대·표지·시트 상단의 y 좌표를 **동일 탐침**으로
   양쪽에서 재서 Δ 비교. 불일치율만 보면 글리프 안티에일리어싱이 대부분을 차지해 1~3px 구조 어긋남이
   묻힌다(실제로 이 검사가 카드 보더 희석 결함을 잡았다). **Δ≤1px 이어야 통과.**

## 오라클 재생성 (목업이 바뀌었을 때)

1. `chrome-debug.sh` 로 디버그 Chrome 기동 → 목업 HTML 열기
2. 폰 컨테이너를 `(0,0)` 에 붙이고 `box-shadow`/`border-radius` 제거, 스크롤바 숨김
   (데스크톱 스크롤바 15px 이 월간 탭 콘텐츠 폭을 346→331 로 줄여 오라클이 틀어진다)
3. 뷰포트 390×844 로 리사이즈 → 각 상태에서 스크린샷

## 남은 불일치 (구조 아님)

- **글리프 래스터화**: Chrome 서브픽셀 AA vs CoreText — 획 굵기가 미세하게 다르다. 위치·크기는 일치.
- **책 상세 하단 5px**: 목업은 시트(z82)가 홈 인디케이터(z80)를 덮지만, iOS 는 홈 인디케이터를
  시스템이 항상 앱 위에 그린다 → 의도적 불일치.

---

## 홈(02) 오라클 — 별도 규칙

출처가 다르다. 위 5개는 `RTRecord.dc.html` 목업이지만 홈은
`design-ref/design_handoff_home_record/home-14a-v11@2x.png`(시안 `#14a`, 390×844 @2x)를
**y=410pt 아래(도킹 카드 상단~화면 하단)만 크롭**한 것이다.

**히어로(y < 410)는 픽셀 오라클 대상이 아니다.** 시안의 책은 평면 CSS
`transform: perspective(800px) rotateY(-15deg)` 근사이고 앱 `RTBook3D` 는 6면을 수동 투영하는
전혀 다른 렌더라 원래 일치할 수 없다(작업지시서 v3 §3.1, 클로드디자인 회신 A-1·A-2).
히어로는 실기기 눈 검증으로 대체한다.

### 검증

```sh
cd ReadingTimeKit && swift build --product rtshot
.build/debug/rtshot 02 /tmp/home.png
cd .. && python3 scripts/home-verify.py /tmp/home.png
```

`record-verify.sh` 에는 넣지 않았다 — 그 스크립트는 절대 좌표 Δ≤1px 을 요구하는데
홈은 아래 계통 오차 때문에 그 기준으로 잴 수 없다. `home-verify.py` 는 **CTA 상단을 기준점**으로
상대 좌표를 대조한다.

### 계통 오차 (구조 결함이 아님 — Δ ≈ −2.5pt 로 균일하게 나타난다)

| 원인 | 크기 |
|---|---|
| 카드 상단·⑥·⑦ hairline 을 CSS 는 `border-top: 1px`(레이아웃 1pt 점유), 앱은 높이 0 `overlay` 로 그림 | 카드 총높이 시안 430 / 앱 425 |
| `tapStart` 버튼 border 가 CSS 에선 박스 밖 → CTA 행 시안 62 / 앱 60 | −2.0 |
| `9일 연속` 라인박스 `RTLB.m13`=17 / 시안 17.5 (한글 혼용 폰트 폴백) | −0.5 |
| ⑥ 마지막 기록·⑦ 파트너 행은 작업지시서 v3 §8-2 에 따라 `rtLB` 미사용(SwiftUI 기본 행높이) | 이 두 행만 허용 오차 4pt |

시안 목업은 카드 **위에도** 비네트를 덮어 카드 배경이 가장자리에서 (235,232,223) 까지 어두워진다
(앱은 비네트를 카드 아래에 깔아 그런 일이 없다). 그래서 `home-verify.py` 의 구분선 검출은
절대색이 아니라 **국소 대비**를 쓴다.
