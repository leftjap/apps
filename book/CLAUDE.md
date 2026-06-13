# Book — 독서 기록 PWA

> 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Book 앱 전용.

## 도메인

독서 기록 — 책(알라딘 메타)·인용 하이라이트·독서 시간 + 큐레이션 피드·리스트·통계. 밀리의서재 reading import.

## 스택

바닐라 JS (ES Modules) + Vite 6 + vite-plugin-pwa. `@supabase/supabase-js` + Dexie. (React 아님 — `cue` 만 React.) dev 5176 / preview 4176 (strictPort). 배포 `/apps/book/`.

## 스펙·문서

- 스택 이식 명세: `~/apps/book/specs/book-port-spec.md` (today/study/gym 동일 스택 실측 근거)
- 피드 큐레이션 루틴: `~/apps/book/specs/feed-curation-routine.md`
- `book-handoff.md`·`millie-reading-handoff.md` 는 핸드오프 — 코드가 정본

## 데이터·인증

- 공유 geo-apps Supabase, 테이블 prefix `book_*` (`supabase/migrations/0001~0004`: init·realtime·reading·quote_highlights)
- 알라딘 책 메타: `src/db/aladin.js`. 인증: `src/services/auth.js` (ALLOWED_EMAILS + Supabase Google OAuth)

## 관련 스킬

`supabase-pattern` 스킬은 현재 study/gym/today 만 자동발동 — book 의 `src/db/`·`src/services/auth.js` 작업은 같은 패턴이나 스킬 미발동.
