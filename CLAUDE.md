# ~/apps

## 프로젝트 구조
- 4앱: Study/Gym/Today (PWA) + Board (Electron, git 미업로드 — `~/apps/board/CLAUDE.md` 별도)
- 앱별 스펙: `~/apps/<app>/specs/<app>-app-spec.md` (현재 study/gym 만, today/board 미작성)
- `~/apps/lessons/` — 환경 함정 (lazy load, 인용 시 직접 Read)
- `~/apps/scripts/` — `claude-wip-snapshot.sh` (Stop hook 자동 호출)
- 커밋: Conventional Commits. 마일스톤은 `git tag`.
- **자동 push**: 의미 커밋 (feat/fix/refactor/chore/docs 등 Conventional Commits) 직후 `git push origin main` 자동 실행. 사용자 별도 지시 불필요. WIP 스냅샷 커밋은 push 금지 (로컬 누적 → 다음 의미 커밋에 squash). 롤백은 `git revert` + push.

---

## 기록 위치 (CLAUDE.md 누적 금지)

- 절차 (5+ 단계) → `~/.claude/skills/<name>/SKILL.md`
- 환경 함정 → `~/apps/lessons/<topic>.md` (`@import` 금지, 텍스트 경로 인용만)
- 앱 spec → `~/apps/<app>/specs/<app>-app-spec.md`

---

## 자격증명·Secret

하드코딩 금지 (환경변수 또는 config 사용). 단 Supabase anon key 는 `VITE_` prefix 환경변수로 클라이언트 번들 포함 허용 — RLS 로 격리, anon key 자체는 공개 가능. service role key 는 절대 번들 금지.

---

## 환경 함정

- **vitest watch**: Study/Gym/Today `pnpm test` = watch 모드 → Bash freeze. 항상 `pnpm vitest run` 직접 호출. Board 만 `pnpm test` 정상.
- **pnpm 10 onlyBuiltDependencies**: 누락 시 esbuild postinstall 차단. PWA 3앱 `["esbuild"]`. Board 는 `~/apps/board/CLAUDE.md` 참조.
