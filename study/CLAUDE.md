# Study: 학습 카드 PWA

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Study 앱 전용.

## 도메인

일본어/영어 학습 카드 + Supabase 동기화. 자연어 트리거("공부하자"·"오늘 영어/일본어") 자동화.

## 스펙·문서

- 앱 스펙: `~/apps/study/specs/study-app-spec.md`
- 1차 정본 (payload 형식·en drift 결정): `~/apps/study/seeds/README.md`
- 2차 정본 (lesson explanation): `~/apps/study/docs/lesson-explanation-guide-{ja,en}.md` + `explanation-schema.md`

## 관련 스킬 (자동 활성화)

`study-content`: 카드 생성·수정·자동화 진입점. 트리거·비트리거 조건은 스킬 본문. **본 스킬 없이 카드 작성 시 체크리스트 (ja=가이드 §10 / en=가이드 §6.3 유일 정본 + `scripts/validate-seed.mjs` 게이트) 통과 거짓 단정 위험.**

`supabase-pattern`: `src/db/sync.js`·`schema.js`·`src/services/auth.js` 수정·RLS·OAuth·Auth 작업 시.

## 자동화 박제

- `study-read-user-context.yml`: 단계 3-4 SELECT (repo root `.github/workflows/`, working-directory: study)
- `study-seed-supabase.yml`: 단계 7 INSERT (repo root `.github/workflows/`, working-directory: study)
- `seeds/.user-defaults.json`: default user_id
- `data-sentinel.yml`: 매일 07:30 KST study_daily_stats 위생 감사(팬텀·폭주 행, 스크립트는 `cue/scripts/audit-study-hygiene.mjs`). deploy-pages.yml 은 study vitest 실패 시 배포 차단 (둘 다 2026-07-04 데이터 정확성 사고 후속)
- `scripts/advance-check.mjs` + launchd `com.gio.study-advance-check`: ⛔ **2026-08-26 중지** (`launchctl bootout gui/$(id -u)/com.gio.study-advance-check`). 사유: en 학습이 코어 100문장(`docs/core100-curriculum.md`)으로 전환돼 모두영어 트랙 종료. 중지 전 이 데몬이 미완료 ep 정리 직후 자동으로 다음 편을 재저작·재적재해(2026-08-26 16:38 ep14 실측) 전환을 되돌렸다. **모두영어 재개 시에만** `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.gio.study-advance-check.plist` 로 복구. 이하 원 동작: 모두영어 전진 **유일 실행기** (5분 폴링 dry-run → 편 완료 시 headless claude 저작·시드. 저작 지침 정본 = `~/.claude/scheduled-tasks/study-moduyeongeo-advance/SKILL.md`: 태스크는 삭제됐지만 파일이 데몬 지침으로 상주). 로그 `~/.local/state/study-advance-check/`. **스터디 스케줄드 태스크는 2026-07-28 전부 삭제** (9am 매일생성 포함. 사용자 지시 "일어·수학도 본격 시작하면 데몬화"). 결과: 매일 math 자동 생성 중단, ep105 소진 후 Parks/Office 폴백 담당 부재 (재개 시 데몬 신설이 정본 방향)
