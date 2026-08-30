# ~/apps

## 프로젝트 구조
- 앱: Study/Today/Book/Pick/Cue/Best (PWA, GitHub Pages `/apps/<app>/` 배포) + Board (Electron, git 미업로드. `~/apps/board/CLAUDE.md` 별도). `launcher/` 는 디자인 브리프 스텁(앱 아님). `readingtime/` 는 iOS 네이티브 준비 중이며, 웹 프로토타입(`prototype/`)이 픽셀 정본, 시안은 `design-ref/v3`(v8 최종). 기록 화면(주·월·지도)만 별도 정본 `design-ref/design_handoff_record_stats/` + 픽셀 오라클 `.oracle/`(`scripts/record-verify.sh` 로 대조).
- **`gym/` 은 iOS 네이티브 앱** (2026-07-07 전환, `ea98b97`). **실기기에 설치된 건 네이티브**(`Gym.xcodeproj` + `GymKit/Sources/{GymCore,GymViews}`, SwiftUI). 같은 폴더의 PWA(`src/`+`mocks/`)는 잔존이며 Pages 배포는 계속되지만 폰엔 없다. **화면·디자인 작업을 PWA 에만 하면 실기기엔 변화가 0** (2026-07-17 실사고: 웹만 고치고 "실기기 반영됨" 오단정). 상세·검증도구는 `~/apps/gym/CLAUDE.md`.
- 앱별 스펙: `~/apps/<app>/specs/<app>-app-spec.md` (현재 best/gym/pick/study)
- `~/apps/lessons/`: 환경 함정 (lazy load, 인용 시 직접 Read)
- `~/apps/scripts/`: `claude-wip-snapshot.sh` (Stop hook 자동 호출)
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
- **PWA 배포 전 확인**: `pnpm test` → `pnpm build` → `pnpm preview` 순. manifest·서비스워커·오프라인은 dev 모드에서 꺼져 있어 `preview` 단계에서만 확인된다. 홈 화면 추가와 standalone 동작은 자동화가 불가능하므로 iPhone Safari 실기기로 직접 본다.
- **pnpm 10 onlyBuiltDependencies**: 누락 시 esbuild postinstall 차단. PWA 앱(study/gym/today/book/pick/cue/best) `["esbuild"]`. Board 는 `~/apps/board/CLAUDE.md` 참조.
