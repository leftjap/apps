# Study — 학습 카드 PWA

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Study 앱 전용.

## 도메인

일본어/영어 학습 카드 + Supabase 동기화. 자연어 트리거("공부하자"·"오늘 영어/일본어") 자동화.

## 스펙·문서

- 앱 스펙: `~/apps/study/specs/study-app-spec.md`
- 1차 정본 (payload 형식·en drift 결정): `~/apps/study/seeds/README.md`
- 2차 정본 (lesson explanation): `~/apps/study/docs/lesson-explanation-guide-{ja,en}.md` + `explanation-schema.md`

## 관련 스킬 (자동 활성화)

`study-content` — 카드 생성·수정·자동화 진입점. 트리거·비트리거 조건은 스킬 본문. **본 스킬 없이 카드 작성 시 체크리스트 (ja=가이드 §10 / en=가이드 §6.3 유일 정본 + `scripts/validate-seed.mjs` 게이트) 통과 거짓 단정 위험.**

`supabase-pattern` — `src/db/sync.js`·`schema.js`·`auth.js` 수정·RLS·OAuth·Auth 작업 시.

## 자동화 박제

- `study-read-user-context.yml` — 단계 3-4 SELECT (repo root `.github/workflows/`, working-directory: study)
- `study-seed-supabase.yml` — 단계 7 INSERT (repo root `.github/workflows/`, working-directory: study)
- `seeds/.user-defaults.json` — default user_id
