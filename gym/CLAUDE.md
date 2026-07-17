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
- 시뮬레이터: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 지정 시 `xcodebuild`·`xcrun simctl` 사용 가능
  (`xcode-select` 는 CommandLineTools 를 가리키지만 Xcode.app 은 설치돼 있음)

## 관련 스킬 (자동 활성화)

`supabase-pattern` — `src/db/sync.js`·`schema.js`·`src/services/auth.js` 수정·RLS·OAuth·Auth 작업 시.
