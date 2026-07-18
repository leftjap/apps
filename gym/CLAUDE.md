# Gym — 운동 기록 iOS 네이티브 앱 (+ 잔존 PWA)

> 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Gym 앱 전용.

## ⚠️ 두 구현 공존 — 실기기는 네이티브

2026-07-07 iOS 네이티브 전환 착수(`ea98b97`). **폰에 설치된 앱 = 네이티브.**

| | 네이티브 (SwiftUI) — **실기기 정본** | PWA (웹) — 잔존 |
|---|---|---|
| 코드 | `Gym.xcodeproj` + `GymKit/Sources/{GymCore,GymViews}` | `index.html` + `src/` + `mocks/*.html` |
| 상태 | 활발 (착수 후 58 커밋) | 저활동 (같은 기간 8건). Pages 배포는 계속됨 |

**화면·디자인 작업은 네이티브가 대상.** PWA 만 고치면 실기기엔 아무 변화가 없다.
두 구현을 함께 맞춘 전례: `db72b61`. 레일 대응표: `mocks/session.html` `.fp-*` ↔ `GymViews/GymFooterRail.swift`.

## 도메인

운동 세션 기록 + Supabase 동기화. (PWA 는 로컬 Dexie 우선)

## 스펙

- 앱 스펙: `~/apps/gym/specs/gym-app-spec.md` — **웹 기준으로 쓰인 문서.** 네이티브는 이를 이식한 것이라
  마크업/CSS 서술은 SwiftUI 대응물로 읽을 것 (레일 `.fp-chip` → `DoneChip`/`CurrentChip`/`UpcomingChip`).

## 네이티브 검증 도구

- `GymKit/test.sh` — swift test (CommandLineTools 환경용 래퍼)
- `.build/debug/gymshot <id> out.png` — 헤드리스 화면 렌더. id: `rail`·`rail-single`·`session-record`·`session` 등 (`GymScreens.snapshotView`)
- `gymshot flow <outdir>` — 전 여정 구동 + 단언 + 단계별 렌더
- `gymshot` 은 ImageRenderer 라 **ScrollView 오프셋을 못 잡는다** — 레일 정렬·스크롤 검증은 시뮬 실앱으로.
- **Xcode 는 설치돼 있다** (`Xcode.app`, 2026-07 기준 26.6). `xcode-select` 가 CommandLineTools 를
  가리켜 `xcodebuild` 가 처음엔 실패해 보여도 **"Xcode 없음" 으로 단정 말 것** — `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
  를 앞에 붙이면 `xcodebuild`·`xcrun simctl`·`xcrun devicectl` 전부 동작 (2026-07-18 "Xcode 없음" 오단정 재발 방지).
- 시뮬레이터: `xcrun simctl` 로 install/launch/screenshot. 로그인 게이트 우회는 앱 런치 인자
  `--fake-signin`(시뮬 전용), 레일 등 세션 화면 데모 데이터는 `--demo-session`.
  reduce-motion 은 `simctl ui` 미지원(appearance/contrast/content_size 만).

## 실기기 배포 (온라인 무선 — 사용자 위임 금지)

네이티브는 PWA 처럼 자동 배포가 안 되지만 **폰이 WiFi 페어링돼 있으면 Claude 가 직접 무선 설치**한다.
"Xcode 로 직접 설치하세요" 위임 금지 (2026-07-18 오위임 재발 방지 — 실제로는 무선 설치 가능했음).

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcrun devicectl list devices                 # 'available (paired)' 인 폰의 Identifier(UUID) 확인
DEV=<UUID>                                    # 예: iPhone 11 Pro
xcodebuild -project Gym.xcodeproj -scheme Gym -destination "id=$DEV" \
  -derivedDataPath <DD> -allowProvisioningUpdates build          # 코드사이닝 Automatic + 팀 FNXM5SF6PX
xcrun devicectl device install app --device $DEV <DD>/Build/Products/Debug-iphoneos/Gym.app
```

폰이 목록에 없거나 페어링 안 됐으면 그때만 사용자 안내. destructive 아님(설치는 데이터 무영향).

## 관련 스킬 (자동 활성화)

`supabase-pattern` — `src/db/sync.js`·`schema.js`·`src/services/auth.js` 수정·RLS·OAuth·Auth 작업 시.
