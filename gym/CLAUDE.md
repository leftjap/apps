# Gym: 운동 기록 iOS 네이티브 앱 (+ 잔존 PWA)

> 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Gym 앱 전용.

## ⚠️ 두 구현 공존: 실기기는 네이티브

2026-07-07 iOS 네이티브 전환 착수(`ea98b97`). **폰에 설치된 앱 = 네이티브.**

| | 네이티브 (SwiftUI): **실기기 정본** | PWA (웹): 잔존 |
|---|---|---|
| 코드 | `Gym.xcodeproj` + `GymKit/Sources/{GymCore,GymViews}` | `index.html` + `src/` + `mocks/*.html` |
| 상태 | 활발 (착수 후 58 커밋) | 저활동 (같은 기간 8건). Pages 배포는 계속됨 |

**화면·디자인 작업은 네이티브가 대상.** PWA 만 고치면 실기기엔 아무 변화가 없다.
두 구현을 함께 맞춘 전례: `db72b61`. 레일 대응표: `mocks/session.html` `.fp-*` ↔ `GymViews/GymFooterRail.swift`.

## 도메인

운동 세션 기록 + Supabase 동기화. (PWA 는 로컬 Dexie 우선)

## 스펙

- 앱 스펙: `~/apps/gym/specs/gym-app-spec.md`: **웹 기준으로 쓰인 문서.** 네이티브는 이를 이식한 것이라
  마크업/CSS 서술은 SwiftUI 대응물로 읽을 것 (레일 `.fp-chip` → `DoneChip`/`CurrentChip`/`UpcomingChip`).

## 네이티브 검증 도구

- `GymKit/test.sh`: swift test (CommandLineTools 환경용 래퍼)
- `.build/debug/gymshot <id> out.png`: 헤드리스 화면 렌더. id: `rail`·`rail-single`·`session-record`·`session` 등 (`GymScreens.snapshotView`)
- `gymshot flow <outdir>`: 전 여정 구동 + 단언 + 단계별 렌더
- `gymshot` 은 ImageRenderer 라 **ScrollView 오프셋을 못 잡는다**: 레일 정렬·스크롤 검증은 시뮬 실앱으로.
- `gymshot` 에는 **세이프에어리어가 없다.** 375×812 프레임을 통째로 쓰므로 실기기(11 Pro — 노치 44 +
  홈 인디케이터 34)보다 세로가 78pt 넉넉하고, 히어로 위아래 여백이 각 28pt 쯤 후하게 나온다.
  **세로 예산 판단은 반드시 시뮬 실앱 스크린샷으로** (2026-09-17 히스토리 카드에서 이 차이로
  "여유 있다" 고 오판했다. `xcrun simctl io <DEV> screenshot` 은 3x 라 pt 로 환산할 때 3 으로 나눈다).
- **Xcode 는 설치돼 있다** (`Xcode.app`, 2026-07 기준 26.6). `xcode-select` 가 CommandLineTools 를
  가리켜 `xcodebuild` 가 처음엔 실패해 보여도 **"Xcode 없음" 으로 단정 말 것**: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
  를 앞에 붙이면 `xcodebuild`·`xcrun simctl`·`xcrun devicectl` 전부 동작 (2026-07-18 "Xcode 없음" 오단정 재발 방지).
- 시뮬레이터: `xcrun simctl` 로 install/launch/screenshot. 로그인 게이트 우회는 앱 런치 인자
  `--fake-signin`(시뮬 전용), 레일 등 세션 화면 데모 데이터는 `--demo-session`.
  reduce-motion 은 `simctl ui` 로는 못 켜지만(appearance/contrast/content_size 만) **defaults 로는 켜진다**:
  `xcrun simctl spawn <DEV> defaults write com.apple.Accessibility ReduceMotionEnabled -bool true`.
  2026-09-17 실측 — 히스토리 카드 커밋 전환을 연속 스크린샷으로 찍어 비교하니 끄면 중간색
  `(211,140,101)`, 켜면 곧바로 최종색 `(207,126,78)` 이었다.
- UI 테스트 스크린샷 회수: `-resultBundlePath <out.xcresult>` 로 돌린 뒤
  `xcrun xcresulttool export attachments --path <out.xcresult> --output-path <dir>`.
  `manifest.json` 의 `suggestedHumanReadableName` 이 `XCTAttachment.name` 이다.

## 실기기 배포 (온라인 무선, 사용자 위임 금지)

네이티브는 PWA 처럼 자동 배포가 안 되지만 **폰이 WiFi 페어링돼 있으면 Claude 가 직접 무선 설치**한다.
"Xcode 로 직접 설치하세요" 위임 금지 (2026-07-18 오위임 재발 방지, 실제로는 무선 설치 가능했음).

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcrun devicectl list devices                 # 'available (paired)' 인 폰의 Identifier(UUID) 확인
DEV=<UUID>                                    # 예: iPhone 11 Pro
xcodebuild -project Gym.xcodeproj -scheme Gym -destination "id=$DEV" \
  -derivedDataPath <DD> -allowProvisioningUpdates build          # 코드사이닝 Automatic + 팀 FNXM5SF6PX
xcrun devicectl device install app --device $DEV <DD>/Build/Products/Debug-iphoneos/Gym.app
```

폰이 목록에 없거나 페어링 안 됐으면 그때만 사용자 안내. destructive 아님(설치는 데이터 무영향).

**페어링된 기기가 둘 이상이다** (2026-09-17 기준 iPhone 11 Pro + iPhone XR). `list devices` 출력을
`tail` 로 자르면 엉뚱한 기기에 설치한다 — 실제로 그렇게 XR 에 설치한 사고가 있었다. 전체를 보고
`Marketing Name` 으로 고를 것. 사용자 기기는 **iPhone 11 Pro** (`00008030-…`, 375×812).

**실기록 회수** — 실데이터로 검증하려면 폰에서 앱 데이터를 통째로 꺼낸다. 개인 기록이므로
저장소(PUBLIC)에 넣지 말 것.
```bash
xcrun devicectl device copy from --device $DEV --domain-type appDataContainer \
  --domain-identifier com.leftjap.gym --source Library --destination <dir>
# <dir>/Preferences/com.leftjap.gym.plist 의 gym.sessions.v1 등이 JSON(Data)
```
`GymViewsTests/RealDeviceHistoryAuditTests` 가 이 JSON 을 환경변수로 받아 전수 조사한다.

**화면 캡처**: `xcrun devicectl device capture screenshot --device $DEV --destination <png>`.
백라이트가 꺼져 있으면 검정 이미지가 나온다 — `devicectl device info lockState` /
`info displays`(backlight state)로 판정하고, 켜는 명령은 devicectl 에 없으므로 사용자에게 요청한다.

## 관련 스킬 (자동 활성화)

`supabase-pattern`: `src/db/sync.js`·`schema.js`·`src/services/auth.js` 수정·RLS·OAuth·Auth 작업 시.
