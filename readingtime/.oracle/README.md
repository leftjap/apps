# .oracle — 기록 화면 픽셀 오라클

`design-ref/design_handoff_record_onepage/mockups/RTRecordOnePage.dc.html`(목업, 동작하는 HTML)을
Chrome 으로 **390×844 @2x** 렌더해 찍은 스크린샷. 기록 원페이지(월 히트맵·책·지도 카드)와
그 위에 열리는 시트·전체 화면 지도의 SwiftUI 구현이 시안과 일치하는지 대조하는 기준값이다.

| 파일 | 상태 | rtshot |
|---|---|---|
| `ora-onepage.png` | 원페이지 (데모 2026-08) | `rtshot 10` |
| `ora-day.png`     | 8/22 탭 → day 시트 | `--seq login,nav:10,statsDay:22` |
| `ora-list.png`    | "그 외 9권" 탭 → list 시트 | `--seq login,nav:10,statsList` |
| `ora-mapfull.png` | 지도 카드 탭 → 전체 화면(전체 핀 프레이밍) | `--seq login,nav:10,statsMap` |
| `ora-place.png`   | 전체 화면 → 뉴욕 핀 탭 → place 시트 | `--seq login,nav:10,statsMap,statsPlace:뉴욕` |
| `ora-home.png`    | **홈(02) 도킹 카드** — 별도 시안·별도 절차. 아래 "홈 오라클" 참조 |

## 검증

```sh
scripts/record-verify.sh <출력디렉터리>
```

rtshot 으로 같은 5개 상태를 렌더해 오라클과 대조한다. 두 지표를 함께 본다:

1. **픽셀 불일치율** + `<n>-sbs.png`(오라클|렌더|diff) + `<n>-ov.png`(빨강=오라클 / 청록=렌더 오버레이)
2. **구조 랜드마크**(`record-landmark.py`) — 서머리 구분선·셀 경계·표지·스트립·카드 보더·시트 상단·핀 표지의
   좌표를 **동일 탐침**으로 양쪽에서 재서 Δ 비교. **Δ≤1px 이어야 통과.**

## 오라클 재생성 (목업이 바뀌었을 때)

1. `~/.claude/scripts/chrome-debug.sh` 로 디버그 Chrome 기동 → chrome-devtools MCP 로 목업 HTML 열기
2. `emulate` 뷰포트 `390x844x2` → 폰 컨테이너(`[data-screen-label]`)를 `position:fixed; left:0; top:0`,
   `border-radius:0; box-shadow:none` 으로, `body{margin:0; overflow:hidden}`
3. 상태별로 DOM `click()` 으로 조작(날짜 셀 텍스트 "22", "그 외 N권" 버튼, 지도 카드(h150 r20), 핀 라벨 "뉴욕")
   → `take_screenshot` (780×1688)

## 홈 오라클 (`ora-home.png`)

홈(02)은 `design-ref/design_handoff_home_record/` 시안(#14a)의 y≥410 크롭. `scripts/home-verify.py` 로 대조.

## 남은 불일치 (구조 아님)

- **글리프 래스터화**: Chrome 서브픽셀 AA vs CoreText — 획 굵기가 미세하게 다르다. 위치·크기는 일치.
- **지도 지형**: 헤드리스는 목업 플레이스홀더(타원 블롭). 실기기는 MapKit 이라 지형이 다르고 핀 위치는 카메라가 정한다.
