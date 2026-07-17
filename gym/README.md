# Gym — iOS 네이티브 앱 (+ 잔존 PWA)

운동 트래커. 2026-04-18 Electron → iPhone PWA, **2026-07-07 iOS 네이티브 전환 착수**(`ea98b97`).

> ## ⚠️ 실기기에서 도는 것은 **네이티브 앱**이다
>
> 저장소에 **두 구현이 공존**한다. 어느 쪽을 고칠지 먼저 정할 것:
>
> | | 네이티브 (SwiftUI) | PWA (웹) |
> |---|---|---|
> | 위치 | `Gym.xcodeproj` + `GymKit/Sources/{GymCore,GymViews}` | `index.html` + `src/` + `mocks/*.html` |
> | 위상 | **실기기 정본** — 폰에 설치된 앱 | 잔존. GitHub Pages 로 계속 배포되나 폰엔 없음 |
> | 활동량 | 네이티브 착수 후 커밋 58건 | 같은 기간 8건 |
>
> **PWA 만 고치면 실기기엔 아무 변화가 없다.** 화면·디자인 변경은 네이티브가 대상이며,
> 두 구현을 함께 맞추던 전례가 있다(`db72b61` — PWA·네이티브 동시 수정).
> 세션 하단 레일 대응: `mocks/session.html` `.fp-*` ↔ `GymKit/Sources/GymViews/GymFooterRail.swift`.

## 참조 문서

- **기능 명세**: `~/apps/gym/specs/gym-app-spec.md` (v2, 2026-04-17 재설계)
- **디자인 토큰**: `src/styles/paper.css` `:root` (토큰 정본) + spec §14 — 네이티브는 `GY.*`/`Color(oklch:)` 로 대응 이식
- **진행 상태**: git log + Conventional Commits

## 기술 스택

### 네이티브 (실기기 정본)

- SwiftUI. `GymKit` SPM 패키지 — `GymCore`(로직·모델·Supabase) + `GymViews`(화면)
- 앱 타깃: `Gym.xcodeproj` (타깃 `Gym`, `GymUITests`)
- 검증: `GymKit/test.sh`(swift test) · `gymshot <id> out.png`(ImageRenderer 헤드리스 렌더) · `gymshot flow <dir>`(전 여정 단언)
- Xcode 는 `xcode-select` 가 CommandLineTools 를 가리켜도 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 로 `xcodebuild`·`simctl` 사용 가능

### PWA (잔존)

- 바닐라 HTML/CSS/JS, Vite + `vite-plugin-pwa`
- 로컬 저장: IndexedDB (`dexie`) / 클라우드: Supabase (Study 프로젝트 공유), Google OAuth
- 배포: GitHub Pages (`leftjap.github.io/apps/gym/`) — main push 시 `.github/workflows/deploy-pages.yml` 자동 배포

## 참조 소스

명세서 + 디자인 가이드 + Mocks (`~/apps/gym/mocks/*.html`) 만 참조.

## 폴더 구조 (계획 — Wave 11.1 scaffold 후 확정)

```
~/apps/gym/
├── README.md             이 파일
├── package.json
├── vite.config.js
├── index.html
├── public/
│   ├── manifest.webmanifest
│   └── icons/            180 / 192 / 512 / 512-maskable
├── src/
│   ├── main.js           엔트리
│   ├── app.js            라우터
│   ├── features/         기능별 폴더 (1 폴더 = 1 기능)
│   │   ├── home/
│   │   ├── session/
│   │   ├── stats/
│   │   └── settings/
│   ├── shared/           2곳 이상에서 쓰는 것만 승격
│   │   ├── ui/           bottom-sheet, confirm, context-menu 등
│   │   ├── storage/      Dexie 스키마·쿼리 래퍼
│   │   ├── supabase/     Auth + 동기화 클라이언트
│   │   ├── tokens/       디자인 토큰
│   │   └── gestures/     long-press, swipe
│   └── styles/
├── mocks/                Wave 11.2 — 정적 HTML 프로토타입
└── tests/
    ├── unit/             vitest
    └── e2e/              playwright
```

## 명령어 (Wave 11.1 scaffold 후 확정)

```bash
pnpm dev         # Vite dev server (localhost HTTPS 자동)
pnpm build       # dist/ 정적 파일 (manifest, SW, 해시 에셋)
pnpm preview     # 빌드 결과 로컬 확인
pnpm test        # vitest unit
pnpm e2e         # playwright
pnpm lint        # eslint
```

## Wave 로드맵

- [x] Wave 11.0 — 문서 정비 (2026-04-18)
- [ ] Wave 11.1 — Vite 스캐폴드 + 의존성 설치 + 기본 라우팅
- [ ] Wave 11.2 — `mocks/*.html` 주요 5화면 + Claude_Preview 시각 검증
- [ ] Wave 11.3 — Home 화면 구현
- [ ] Wave 11.4 — Session 화면 구현 (핵심 UX: long-press, swipe, 에디터 모달)
- [ ] Wave 11.5 — Stats 화면 구현
- [ ] Wave 11.6 — Settings 화면 구현
- [ ] Wave 11.7 — Supabase Auth (Google OAuth) + RLS 연동
- [ ] Wave 11.8 — 데이터 동기화 (local ↔ Supabase)
- [ ] Wave 11.9 — PWA 마감 (manifest, icons, Service Worker, 오프라인 동작)
- [ ] Wave 11.10 — GitHub Pages 배포 (구 Electron Gym 은 ~/code 폐기와 함께 archive 됨)

## 다음 작업

**Wave 11.1 Scaffold** — Plan Mode 로 아래를 제출 후 사용자 승인:
1. `package.json` 의존성 목록 (vite, dexie, @supabase/supabase-js, vite-plugin-pwa, vitest, playwright, eslint)
2. 폴더 구조 실제 스캐폴딩
3. 기본 `index.html` + `src/main.js` + `src/app.js` 빈 골격
