# ~/apps

## 프로젝트 구조
- 4앱: Study/Gym/Today (PWA) + Board (Electron, git 미업로드 — `~/apps/board/CLAUDE.md` 별도)
- 앱별 스펙: `~/apps/<app>/specs/<app>-app-spec.md` (현재 study/gym 만, today/board 미작성)
- `~/apps/lessons/` — 환경 함정 (lazy load, 인용 시 직접 Read)
- `~/apps/scripts/` — `claude-wip-snapshot.sh` (Stop hook 자동 호출)
- 커밋: Conventional Commits. 마일스톤은 `git tag`.
- **자동 commit + push**: Claude 가 본 세션 작업을 (1) 수정·추가 (2) 검증 통과 (3) 사용자 계획 범위 내 완료 시, **본 세션이 직접 편집·추가한 파일만 골라** Conventional Commits 로 commit + `git push origin main` 자동 실행. 사용자 별도 지시 불필요. WIP 에 다른 세션 잔존이 섞여 있으면 `git reset --soft` + `git restore --staged <무관>` 로 본 세션 파일만 분리 (무관 파일은 working tree 에 남겨 다음 세션 처리). 예외: DB 마이그·secret·force push·`reset --hard` 등 destructive 는 사전 확인. push 충돌·hook fail 시 자율 재시도 금지 — 즉시 사용자 보고. 롤백은 `git revert` + push.

---

## 기록 위치 (CLAUDE.md 누적 금지)

- 절차 (5+ 단계) → `~/.claude/skills/<name>/SKILL.md`
- 환경 함정 → `~/apps/lessons/<topic>.md` (`@import` 금지, 텍스트 경로 인용만)
- 앱 spec → `~/apps/<app>/specs/<app>-app-spec.md`

---

## 자격증명·Secret

하드코딩 금지 (환경변수 또는 config 사용). 단 Supabase anon key 는 `VITE_` prefix 환경변수로 클라이언트 번들 포함 허용 — RLS 로 격리, anon key 자체는 공개 가능. service role key 는 절대 번들 금지.

**로컬 저장 위치 (자동 로드, 매 세션 키 재요구 금지)**:
- `~/.config/study/.env` (chmod 600) — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. study 로컬 자동화·sanity check 실행 시 `source ~/.config/study/.env` 또는 dotenv 로드
- repo secret (`leftjap/apps`) — GitHub Actions 워크플로용. `gh secret list --repo leftjap/apps` 로 확인 (`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

---

## 환경 함정

- **vitest watch**: Study/Gym/Today `pnpm test` = watch 모드 → Bash freeze. 항상 `pnpm vitest run` 직접 호출. Board 만 `pnpm test` 정상.
- **pnpm 10 onlyBuiltDependencies**: 누락 시 esbuild postinstall 차단. PWA 3앱 `["esbuild"]`. Board 는 `~/apps/board/CLAUDE.md` 참조.
