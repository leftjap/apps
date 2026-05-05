# ~/apps — PWA 리빌드 단일 트리

@memory.md

이 폴더는 리빌드 Clean Room. Study, Gym, Today (PWA) + Board (Electron 유지) 4앱.

## 역할 분담
- **CLAUDE.md (이 파일)**: 프로젝트가 **무엇** — 구조, 명령어, 기술 결정
- **memory.md**: Claude 가 **어떻게** — 규칙, 편향 방지, 보고 형식
- 변경 이력은 git log + Conventional Commits + 필요시 `git tag` (STATUS 체계 폐기)

---

## 프로젝트 개요
- 4앱: Study/Gym/Today (PWA) + Board (Electron, git 미업로드)
- 앱별 스펙: `~/apps/<app>/specs/<app>-app-spec.md`
- 공통 디자인 토큰: `~/apps/DESIGN.md`

## 폴더 구조
- `~/apps/` — 메타 (`CLAUDE.md`, `memory.md`, `DESIGN.md`, `lessons/`, `scripts/`, `.claude/`) + 4앱 (`study/`, `gym/`, `today/`, `board/`)
- `~/apps/lessons/` — 환경 함정 박제 (lazy load, 인용 시 직접 Read)
- `~/apps/scripts/` — `claude-wip-snapshot.sh` (Stop hook), `regenerate-lesson-index.sh`

---

## Git 안전장치 (GH 접근 금지 해제 — 2026-05-04)

**해제 내용:** `gh` CLI · `git push` · `git pull` 차단 제거 (PreToolUse hook 에서 GH 분기 삭제). `CLAUDE_ALLOW_GH` 환경변수도 무효화.

**유지되는 안전장치 (PreToolUse hook 차단):** `--no-verify` · `git push --force` · `git reset --hard` · `git clean -f` · `rm -rf` (node_modules 한정 제외). 이들은 destructive·우회 불가.

**한계:** 정규식 hook 이라 백틱·`bash -c` substitution 으로 위 안전장치 우회 가능 (lesson `~/apps/lessons/hooks-supplementary-2026-05-04.md` 박제). git fetch 통과.

---

## 커밋 타이밍

1. **의미 단위 (Claude 수동)**: 파일 수정 완결 직후 `git commit`. Conventional Commits. `git add <path>` 명시 (`git add -A` 금지 — 민감 파일 우발 포함 방지)
2. **WIP 스냅샷 (Stop hook 자동)**: `~/apps/scripts/claude-wip-snapshot.sh` 가 응답 종료 시 변경분을 `WIP(claude-snapshot): YYYY-MM-DD-HHMM` 로 백업. 다음 의미 커밋에 `git reset --soft HEAD~N` 으로 squash 가능
3. **롤백**: `git checkout <path>` 또는 `git checkout -b temp-branch`. `git reset --hard` 금지 (PreToolUse hook 차단 중)
4. **마일스톤**: 안정 지점은 `git tag` 박제

---

## Clean Room 원칙
1. **명세서 기반 구현**: 앱별 스펙 + `~/apps/DESIGN.md` 만 참조. 구현 전 해당 명세서 섹션 인용·근거 보고
2. **파일 트리 사전 선언**: 구현 시작 전 전체 파일 구조 선언 후 사용자 확인
3. **1 spec = 1 Wave 이내**: Task Breakdown 5건 초과 시 Wave 분할

---

## 디자인 가이드

`design-guide` 스킬 자동 활성화 → `~/apps/DESIGN.md` 로드. 트리거·범위는 스킬 본문.

---

## 코드 품질 기준 (모든 신규 코드)

1. **전역 변수 범람 금지** → ES 모듈 스코프
2. **단일 파일 1,000줄 초과 금지** → 기능별 200~400줄 모듈 분할
3. **빌드 파이프라인 필수** → electron-vite (Electron) 또는 Vite (PWA)
4. **하드코딩된 자격증명 금지** → 환경변수 또는 config (Supabase anon key 는 `VITE_` prefix 번들 포함 허용)
5. **모듈 시스템 없는 스크립트 태그 나열 금지** → `import/export`
6. **상태 관리는 reducer(action) 패턴으로 격리**

**Electron 전용 (Board):** `src/shared/` 에 Node 전용 모듈(`path`/`fs` 등) import 금지 → renderer 빌드 실패. Node API는 `src/main/` 에서만.

---

## 빌드 검증 파이프라인

`wave-build-verify` 스킬 자동 활성화 — PWA 7-step (lint→typecheck→test→e2e→build→preview→iPhone 실기) + Board 별도 + 둠 루프 탈출. 상세는 스킬 본문.

**도구 메모 (2026-04):** Playwright = 2026 표준 (대체재 없음) / Claude_in_Chrome MCP = 수동 디버깅 (Wave 자동 부적합) / iPhone 자동화 (computer-use) = 비용·정확도상 수동 권장 / Playwright MCP 도입은 MCP 3~5개 스윗스팟상 기존 1개 제거 조건.

---

## PWA 앱 빌드 가이드 (Gym/Study/Today)

**기술 스택 (확정):** 바닐라 JS/HTML/CSS + Vite + `vite-plugin-pwa` (Workbox 래퍼) + Dexie (IndexedDB) + Supabase (Auth + 동기화, Study 프로젝트 공유) + Google OAuth + GitHub Pages (`leftjap.github.io`) → iPhone PWA standalone

**폴더:** `~/apps/<app>/` (앱별 스펙 `specs/` 포함)

**프로토타입 우선 (Gym/Study 한정, Today 는 착수 시 재결정):**
- 화면 구현 전 `mocks/*.html` → 사용자 승인 후 실 코드 착수
- 범위: 시각 시안 + 네비게이션·터치 반응 (상태/영속화 불포함)
- 도출 출처: 앱 스펙 + `~/apps/DESIGN.md` 만
- 검증: Claude_Preview MCP (라이브 DOM · 3뷰포트)

**빌드 흐름:** `pnpm dev` (Vite dev, localhost = PWA 보안 컨텍스트) / `pnpm build` (`dist/` 정적 — manifest, SW, 해시 에셋) / `pnpm preview` (빌드 결과 미리보기) / GitHub Pages 배포 — `dist/` 를 `leftjap.github.io` 로 푸시 (스크립트는 각 앱 배포 Wave 에서)

**PWA 필수 파일:**
- `public/manifest.webmanifest` — name, `display: standalone`, icons, `start_url`, `scope`
- `public/icons/` — 180 (apple-touch), 192, 512, 512-maskable
- `index.html` — `<link rel="manifest">`, viewport `viewport-fit=cover`, `<meta name="mobile-web-app-capable" content="yes">` + `<meta name="apple-mobile-web-app-capable" content="yes">` (후자는 표준상 deprecated 지만 Safari splash·legacy 호환 위해 병행 유지)

**저장 정책:** 로컬 Dexie 스키마 버전 관리 (`db.version(N).stores(...)`, 마이그레이션 체인) / Supabase RLS 로 user_id 격리 / 오프라인 우선 (SW 가 앱 쉘 캐싱, 네트워크 복귀 시 Supabase 동기화)

**iPhone Safari PWA 제약 (2026-04 기준):**
- File System Access API 미지원 → 데이터 export 는 `URL.createObjectURL(Blob)` JSON 다운로드
- SW 캐시 갱신: 버전 bump + `skipWaiting()` + 사용자 리로드 안내
- Supabase anon key 는 `.env.local` + `VITE_` prefix 번들 (anon key 는 공개 가능, service role key 는 절대 번들 금지)
- Web Push: iOS 16.4+ 홈스크린 PWA 한정 (EU 지역 불가 — iOS 17.4+ DMA), 브라우저 탭 상태 불가. Safari 18.4+ Declarative Web Push (SW 없이) · Badge API iOS 16.4+
- iOS 26+ 는 "홈 화면에 추가" 시 기본이 web app 모드
- storage pressure 시 IndexedDB 삭제 가능 → 중요 데이터는 Supabase 동기화로 영속성 확보

---

## 개발 안전장치
1. **Pre-commit hook**: husky + `pnpm test || exit 1`. **현재 미설치** — 커밋 전 `pnpm test` 수동 실행으로 대체
2. **Sentry**: 각 앱 Phase 후반 추가. PII scrubbing. `captureConsoleIntegration` 이 catch 블록 `console.error`/`console.warn` 자동 에러 승격

---

## MCP 서버 관리

- **3~5개 스윗스팟** (토큰 오버헤드 균형). 신규 추가 시 기존 1개 명시적 제거
- 공식·검증된 MCP 만 사용
- **현재 사용자 등록 (1개):** `chrome-devtools` (autoConnect)
- **Claude Code 빌트인 (관리 대상 아님):** preview · computer-use · claude-in-chrome · ccd_* — deferred 로 ToolSearch 호출

**chrome-devtools MCP 활용:** 단위/e2e 통과해도 사용자 환경 재현 결함 / OAuth 세션 의존 / SW 캐시 / Supabase Realtime 구독 / 통합 클릭 흐름 디버깅 시. 셋업·계정·격리·토큰 효율: `~/apps/lessons/chrome-devtools-mcp-autoconnect.md`

---

## AI 코딩 워크플로우 (글로벌 0~8번 + 프로젝트 보강)

글로벌 `~/.claude/CLAUDE.md` 의 0~8번 규칙은 자동 적용. 프로젝트 차이만 명시:

- **4번 보강**: catch 블록 `console.error`/`console.warn` 은 유지 (Sentry `captureConsoleIntegration` 자동 에러 승격)
- **6번 보강**: `npm test` → Board 는 `pnpm test`, **Study/Gym/Today 는 `pnpm vitest run` 직접 호출** (해당 3개 앱 `pnpm test` = `vitest` watch 모드 → Claude Bash 환경에서 무한 대기·세션 freeze). 단일 파일은 `pnpm vitest run path/to/file.test.js`, 출력 최소화는 `--reporter=dot` (vitest 2.x default 가 비-TTY 자동 감지하므로 `--reporter=basic` 불필요·deprecated). Wave 마감 시엔 빌드 검증 파이프라인 전체
- **7번 보강**: `pnpm add <새 패키지>` 전 사용자에게 이유와 패키지명 설명. `pnpm install` (lockfile 재설치) 은 확인 불필요
- **9번 (2026-04-27 보강)**: 스펙 기반·분석 작업 시 출처 검증 + Plan Mode 필수
  - **트리거**: `specs/<app>/<work>.md`, `mocks/*.html`, N섹션 분석, N개 파일 매핑, 라인 번호·함수명 인용 요구
  - **Phase 0 (출처 검증)**: 분석 대상 파일을 Read 툴로 직접 호출 → 라인·함수명 인용 시 직전 Read 결과의 line range 명시. Read 호출 없이 라인 번호 인용 시 즉시 "Read 안 함, 모름" 시인.
  - **Phase 0b (외부 분석 수용)**: `verify-spec` 스킬 본문 "외부 분석 수용" 항목 참조 (트리거·절차 통합)
  - **Phase 1 (Plan Mode, Shift+Tab)**: (a) 수정 파일 목록 (절대 경로) (b) Task Breakdown (5건 이내, 초과 시 Wave 분할) (c) Acceptance Checklist (binary pass/fail) (d) 각 Step 검증 게이트 (e) 리스크 + mitigation
  - **Phase 2**: 사용자 승인 후 Edit/Write
  - **압축 (compaction) 후 첫 응답**: Plan 전체 재출력 의무 — 압축으로 detail 손실 방지 (issue #20051 90+% 패턴)
  - **금지 메타 라벨**: 글로벌 `~/.claude/CLAUDE.md` "거짓말 방지 출력 규칙" 5줄 참조.

---

## pnpm 10 `onlyBuiltDependencies` 필수

pnpm 10 은 네이티브 의존성(electron/sharp/esbuild) postinstall 기본 차단. `package.json > pnpm.onlyBuiltDependencies` 배열 누락 시 `node_modules/electron/dist/Electron.app` 미다운로드 → Playwright `_electron.launch` "Electron failed to install correctly" 실패. **Board: `["electron","esbuild","sharp"]` / PWA: `["esbuild"]`** (sharp 는 이미지 전처리 도입 Wave 에서 추가). Board Wave 1 교훈.
