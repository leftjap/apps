# spec-probe — 시안/PWA 정본 ↔ 네이티브 렌더 픽셀 대조 하네스

손으로 옮겨 적은 값이 새는 걸 **사람 눈이 아니라 기계가** 잡는다.
시안은 HTML/CSS 이고 앱은 SwiftUI 라 "그대로 적용"이 불가능하다 → 전사(轉寫) 과정에서
반드시 드리프트가 생긴다. 이 하네스는 그 드리프트를 커밋 단위로 잡는 게이트다.

스크린샷 산출물은 `verify/spec-probe-shots/` (gitignore) 로 나간다.

## 실행

```sh
cd ~/apps/gym
python3 scripts/spec-probe/run.py             # 402pt(iPhone 17) + 375pt(iPhone SE 3rd)
python3 scripts/spec-probe/run.py --device 375
```

- 앱이 두 시뮬에 **설치돼 있어야 한다** (`xcodebuild ... build` + `simctl install`).
- 375pt 기기가 없으면 자동 생성한다 (`GymSE375`).
- 결정적 픽스처를 앱 컨테이너 plist 에 직접 주입한다 — 앱 코드는 건드리지 않는다.
- 실패 1건이라도 있으면 exit 1. 조건 미충족은 `SKIP` 사유를 반드시 출력한다(조용한 통과 금지).

⚠ 시뮬에 검증용 시드가 들어간 상태로 **로그인 금지** — 서버로 push 된다 (2026-07-10 오염 사고).

## 왜 375pt 를 같이 도는가

`.frame(width: 390)` 같은 고정폭 버그는 **390 이상인 시뮬에서 구조적으로 안 보인다**.
iPhone 17(402pt)은 여유만 생기고, 사용자 기기(iPhone 11 Pro, 374.67pt)에서는 좌우 7.5pt 씩 잘린다.
자세한 건 `~/apps/lessons/ios-simulator-e2e-traps.md` §12.

## probes.json 규칙

- 모든 프로브는 `source` 를 갖는다: 시안 파일:행 또는 `mocks/*.html` / `src/features/*.js` 파일:행.
  **근거 없는 기대값 추가 금지.** (기대값을 지어내면 하네스가 거짓말을 고정한다)
- 시안과 PWA 가 충돌하면 시안 우선. 단 시안이 폐기된 값이면(사용자 피드백 등) `source` 에 사유를 남긴다.

## 프로브 종류

| kind | 무엇을 재나 |
|---|---|
| `edge_margin` | 화면 가장자리 대비 요소 여백(pt) — 고정폭/클리핑 검출 |
| `bbox_color` | 토큰 색 덩어리의 폭·높이·좌측 위치(pt) — 칩/배지 치수 |
| `heat_cell` | 캘린더 셀 배경 RGB ↔ `0.14 + 0.82·(vol/max)` 공식 |
| `heat_cell_square` | 셀 정사각(`aspect-ratio:1`) |
| `ring_color` | 오늘 링 스트로크 색 |
| `donut_start` | 도넛 crail 아크가 12시에서 시작하는가 (conic-gradient 정합) |
| `setbar_number_ink` | 진행/완료 세트 숫자의 잉크 색 (위계) |

## 회귀 검출력 실증 (2026-07-10)

빈 게이트가 아님을 확인하려고 실제 결함 4종을 주입해 FAIL 을 재현했다 —
`scripts/spec-probe/REGRESSION-PROOF.md` 참조.
