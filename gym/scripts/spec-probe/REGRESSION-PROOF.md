# spec-probe 회귀 검출력 실증 (2026-07-10)

"전부 PASS" 가 **빈 게이트가 아님**을 확인한 기록. 하네스를 만들면 반드시 이걸 해야 한다 —
아무것도 못 잡는 하네스는 초록불로 거짓 안심만 준다.

## 방법

이번 세션에서 실제로 고쳤던 결함 4종을 코드에 다시 주입하고, 하네스만 돌렸다.

| # | 주입한 회귀 | 원래 결함 |
|---|---|---|
| 1 | `HomeScreen`: `.frame(maxWidth:.infinity)` → `.frame(width: 390)` | 375pt 기기에서 좌우 7.5pt 잘림 (사용자 실기기 보고) |
| 2 | `StatsScreen`: 히트맵을 평면 `GY.crailTint` 로 | 캘린더 볼륨 농도 미반영 (사용자 보고) |
| 3 | `StatsScreen`: 도넛 `.rotationEffect(.degrees(-90))` 제거 | conic-gradient 12시 시작 위반 |
| 4 | `PrevRecordBars`: 진행 세트 숫자를 `GY.ink1` 로 | 세트 완료 전후 위계 소실 (사용자 보고) |

## 결과 — 26개 프로브 중 14개 FAIL (두 폭 모두)

```
402  home.cta.margin                  FAIL  좌 30.00pt · 우 30.00pt (기대 24.0)
402  home.lastWorkout.iconBadge       FAIL  left_pt=30.00(기대 24.0)
402  home.cardioRow.iconBadge         FAIL  left_pt=32.00(기대 26.0)
402  stats.cal.heatMax                FAIL  alpha 0.96 → 기대 (195,105,71) 실측 (250,235,227)
402  stats.cal.heatZeroVolumeDay      FAIL  alpha 0.14 → 기대 (245,231,226) 실측 (250,235,227)
402  stats.donut.startsAt12           FAIL  crail 아크 최상단이 중심에서 58.3pt (12시면 ~0)
402  session.setbar.nowNumberColor    FAIL  숫자 잉크 (29,26,23) (기대 crail_deep (153,63,0))
375  home.cta.margin                  FAIL  좌 16.50pt · 우 16.50pt (기대 24.0)
375  home.lastWorkout.iconBadge       FAIL  left_pt=16.50(기대 24.0)
375  home.cardioRow.iconBadge         FAIL  left_pt=18.50(기대 26.0)
375  stats.cal.heatMax                FAIL  (동일)
375  stats.cal.heatZeroVolumeDay      FAIL  (동일)
375  stats.donut.startsAt12           FAIL  crail 아크 최상단이 중심에서 58.5pt
375  session.setbar.nowNumberColor    FAIL  숫자 잉크 (29,26,23)
26개 프로브 · 실패 14
```

주목할 점: 고정폭 390 회귀가 **402pt 에서도 FAIL** 로 잡힌다 (여백 24 → 30pt).
사람 눈으로는 402pt 에서 이 버그가 안 보였고, 그래서 사용자가 실기기에서 먼저 발견했다.

## 복원 후

주입을 되돌리고 (`git diff` 로 3파일이 커밋 상태와 동일함 확인) 재실행 → **26개 프로브 · 실패 0, exit 0**.

## 하네스 자체의 오탐도 이때 잡혔다

첫 실행에서 4건이 FAIL 이었는데, 스크린샷을 확인하니 **앱은 정상이고 프로브가 틀렸다**:

- `setbar_number_ink`: 막대 폭 상한을 80pt 로 뒀는데 슬롯 수가 적으면 83pt → 미검출
- `donut_start`: 탐색 밴드에 도넛 아래 **비율 stacked 막대**가 들어와 중심 x 가 어긋남

→ 프로브 실패를 앱 결함으로 단정하지 말 것. **FAIL 은 반드시 스크린샷으로 1차 확인**한다.
(같은 세션에서 "예정 칩이 채워져 보인다"고 눈으로 오진했다가 픽셀 재측정으로 뒤집힌 사례도 있음)
