# ~/apps

## 프로젝트 구조
- 앱: Study/Today/Book/Pick/Cue/Best (PWA, GitHub Pages `/apps/<app>/` 배포). `launcher/` 는 디자인 브리프 스텁(앱 아님). `lietome/` 는 라이투미(표정 판독 게임 시제품, 의존성 없는 `node build.mjs`, `/apps/lietome/` 배포, 설계는 `lietome/docs/design.md`, 탐색용 임시 화면은 `lietome/lab/<이름>/index.html` 한 파일로 두면 빌드가 `/apps/lietome/lab/<이름>/` 으로 그대로 올린다. 앱의 미리보기 창이 옆 파일을 읽지 못하고 500KB 넘는 HTML 을 열지 못하므로 사진은 파일 안에 넣는다(`lietome/tools/lab-like/build.py`, `test/lab.test.js` 가 검사)). `mapo/` 는 마포 라이브 3D(홍대·마포 일대 3D 지도 웹 토이, Vite+TypeScript+three, `/apps/mapo/` 배포). 작업 전에 `mapo/CLAUDE.md`(일하는 규칙, 낭비 없이 일하는 법, Sol 돌리는 법)와 `mapo/docs/redraw-orders/README.md` 의 「지금 상태」 절부터 읽는다. 2026-11-22 부터 수치지형도·정밀도로지도를 원본으로 다시 그리고 있고(새 코드 `mapo/tools/v2/`·`mapo/src/aerial/`, 코드 지도 `mapo/docs/code-map.md`), 예전 판의 설계와 자료 설명은 `mapo/docs/design.md` 에 있다. `notes/` 는 빌드 없는 정적 안내 페이지(`notes/<이름>/index.html` 한 파일 → `/apps/notes/<이름>/`, 배포 워크플로가 그대로 복사. 공개 저장소이므로 실명·카드번호·개인 기록은 넣지 않는다). `dongne/` 는 동네(가제, 켜 두고 보는 서울 동네 키워드 지도, 설계는 `dongne/docs/design.md`. 지금은 측정 단계로 화면 없음: `node probe/measure.mjs`, 키는 `~/.config/dongne/.env`, 동네 목록은 `node probe/gazetteer.mjs` 가 행정동 경계를 `dongne/data-raw/`(커밋 안 함)에 받아 만든다). `hiddenword/` 는 히든 워드(가제, 첫 단서가 있는 단어 추리 웹게임, 꼬맨틀과 데블스 플랜의 〈히든 워드〉를 참고. 지금은 조사 단계로 코드 없음: 조사 결과와 측정 계획은 `hiddenword/docs/research.md`). `readingtime/` 는 iOS 네이티브 준비 중이며, 웹 프로토타입(`prototype/`)이 픽셀 정본, 시안은 `design-ref/v3`(v8 최종). 기록 화면(원페이지: 월 히트맵·책·지도)은 별도 정본 `design-ref/design_handoff_record_onepage/` + 픽셀 오라클 `.oracle/`(`scripts/record-verify.sh` 로 대조), 탭 모드(05)도 별도 정본 `design-ref/design_handoff_tap_mode/`(시안 J).
- **`gym/` 은 iOS 네이티브 앱** (2026-07-07 전환, `ea98b97`). **실기기에 설치된 건 네이티브**(`Gym.xcodeproj` + `GymKit/Sources/{GymCore,GymViews}`, SwiftUI). 같은 폴더의 PWA(`src/`+`mocks/`)는 잔존이며 Pages 배포는 계속되지만 폰엔 없다. **화면·디자인 작업을 PWA 에만 하면 실기기엔 변화가 0** (2026-07-17 실사고: 웹만 고치고 "실기기 반영됨" 오단정). 상세·검증도구는 `~/apps/gym/CLAUDE.md`.
- 앱별 스펙: `~/apps/<app>/specs/<app>-app-spec.md` (현재 best/gym/pick/study)
- `~/apps/lessons/`: 환경 함정 (lazy load, 인용 시 직접 Read)
- `~/apps/scripts/`: `claude-wip-snapshot.sh` (Stop hook 자동 호출), `heavy.sh` (여러 세션이 무거운 측정·굽기·전체 테스트를 한 번에 하나만 돌리게 하는 잠금: `heavy.sh <제한 초> <명령>`)
- 커밋: Conventional Commits. 마일스톤은 `git tag`.
- **자동 commit + push**: Claude 가 본 세션 작업을 (1) 수정·추가 (2) 검증 통과 (3) 사용자 계획 범위 내 완료 시, **본 세션이 직접 편집·추가한 파일만 골라** Conventional Commits 로 commit + `git push origin main` 자동 실행. 사용자 별도 지시 불필요. WIP 에 다른 세션 잔존이 섞여 있으면 `git reset --soft` + `git restore --staged <무관>` 로 본 세션 파일만 분리 (무관 파일은 working tree 에 남겨 다음 세션 처리). 예외: DB 마이그·secret·force push·`reset --hard` 등 destructive 는 사전 확인. push 충돌·hook fail 시 자율 재시도 금지. 즉시 사용자 보고. 롤백은 `git revert` + push.

---

## 기록 위치 (CLAUDE.md 누적 금지)

- 절차 (5+ 단계) → `~/.claude/skills/<name>/SKILL.md`
- 환경 함정 → `~/apps/lessons/<topic>.md` (`@import` 금지, 텍스트 경로 인용만)
- 앱 spec → `~/apps/<app>/specs/<app>-app-spec.md`
- 세션 간 연속성 → auto memory (`~/.claude/projects/<project>/memory/`). handoff 디렉터리 운영은 2026-08-30 폐기 (기존 파일은 `**/handoff/` gitignore 로 남겨 둠, 신규 작성 금지).

---

## 자격증명·Secret

**`leftjap/apps` 는 PUBLIC repo.** 2026-06-10 에 가계부 스크린샷이 공개된 사고가 있었다. 스크린샷·스크랩 데이터·개인 기록은 커밋하지 않는다 (`**/handoff/`, `best/fixtures/`, `best/data/` 는 .gitignore 로 봉인됨).

하드코딩 금지 (환경변수 또는 config 사용). 단 Supabase anon key 는 `VITE_` prefix 환경변수로 클라이언트 번들 포함 허용. RLS 로 격리, anon key 자체는 공개 가능. service role key 는 절대 번들 금지.

**로컬 저장 위치 (자동 로드, 매 세션 키 재요구 금지)**:
- `~/.config/study/.env` (chmod 600): `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. study 로컬 자동화·sanity check 실행 시 `source ~/.config/study/.env` 또는 dotenv 로드
- `~/.config/best/.env` (chmod 600): best 전용 Supabase 프로젝트 자격증명. best 수집 파이프라인이 사용
- repo secret (`leftjap/apps`): GitHub Actions 워크플로용. `gh secret list --repo leftjap/apps` 로 확인 (`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

---

## 환경 함정

- **테스트 실행**: 2026-08-30 부로 6개 PWA 의 `test` 스크립트를 `vitest run` 으로 바꾸고 watch 는 `test:watch` 로 분리했으므로 `pnpm test` 는 안전합니다. 다만 `run` 없이 `pnpm vitest` 로 직접 부르면 여전히 watch 에 걸려 Bash 가 멈추므로, PreToolUse hook 이 그 경우만 차단합니다.
- **앱 미리보기 도구 금지**: `preview_start`·`mcp__Claude_Browser__*` 는 권한 묻지 않는 모드에서도 지오에게 승인 창을 띄워 세션을 멈춘다(2026-11-17 마포 하위 세션 사고, 지오 「앞으로는 허용 승인 물으면 절대 안 됨」). 지금은 `~/.claude/settings.json` 의 `permissions.deny` 로 막혀 도구 목록에 없다. 화면 확인은 디버그 크롬(`~/.claude/scripts/chrome-debug.sh`, 9333, chrome-devtools MCP `new_page` 에 `background: true`)으로 빌드 결과나 배포본을 연다. 하위 작업 지시문에도 이 줄을 넣는다.
- **PWA 배포 전 확인**: `pnpm test` → `pnpm build` → `pnpm preview` 순. manifest·서비스워커·오프라인은 dev 모드에서 꺼져 있어 `preview` 단계에서만 확인된다. 홈 화면 추가와 standalone 동작은 자동화가 불가능하므로 iPhone Safari 실기기로 직접 본다.
- **pnpm 10 onlyBuiltDependencies**: 누락 시 esbuild postinstall 차단. PWA 앱(study/gym/today/book/pick/cue/best) `["esbuild"]`.
