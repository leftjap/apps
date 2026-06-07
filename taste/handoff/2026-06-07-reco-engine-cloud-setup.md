# taste 추천 엔진 — 클라우드 셋업 & 현황 (2026-06-07)

> Today ai-comment 시스템을 taste 추천에 미러. 생성·실재검증·포스터는 **Routine(클라우드 Claude)** 이 WebSearch 로 수행, service_role 은 edge fn 안에만. 참조 정본: `today/handoff/ai-navi-comment-setup.md`.

## 0. 이번 세션 완료 (Claude 자동 — 검증됨)
- **코드**(커밋 `e61db57`,`1aabbf6`, 빌드+테스트30 통과): `supabase/functions/taste-reco`(logic.js+테스트13, index.ts), `request-taste-reco`, `config.toml`, 마이그 `0002`/`0003`, `routines/taste-reco.md`, `src/features/home.js`(§7), `src/db/sync.js`, `src/db/schema.js`(v2).
- **edge fn 배포(ACTIVE)**: `taste-reco`, `request-taste-reco`. **`TASTE_RECO_TOKEN` secret 설정**(값은 `~/.config/taste/.env` chmod 600 — git·문서 미기재).
- **라이브 검증**: taste-reco context — 토큰없음 `401` / 토큰+owner `count 1383` / scan `[]`(pendingOwners 정상).
- **첫 실추천 16건 기록**(수동 13건 교체, 지오 owner): 책 7(알라딘 표지+ISBN13)·영화/드라마 9(위키 포스터 15/16). service_role 직접(0001 컬럼, kind 없이 전부 home).
- 앱 배포: push→GH Actions. 홈에 16건 + '다시 추천' 버튼.

## 1. 동작 경로 (3단, 리스크 순)
1. **버튼**(가장 검증된 길): 홈 '다시 추천' → `request-taste-reco`(JWT) → Routine `/fire`(owner_id=본인) → 생성·submit → realtime 도착.
2. **주1회 cron**(0003 `taste-weekly-reco`).
3. **변경감지 cron**(0003 내 주석 = staged): 별점 변경 settle 후 자동(§7 완전자동). ①②검증 후 해제.

## 2. 지오 1회 셋업 (남은 것 — 클라우드/DB 권한 필요, 내 권한 밖)

### 2a. 마이그 0002 적용 ⚠선행 (DDL — DB 비번 필요)
- 효과: 갈래 컬럼(kind/source_work/basis) + **realtime publication**(§7 라이브 도착). 미적용이면 홈 추천 표시는 되지만 ① 버튼후 자동도착·갈래 ② **Routine submit 이 실패**(kind/basis 컬럼 없음).
- 방법: Dashboard → SQL editor 에 `taste/supabase/migrations/0002_taste_reco_branch.sql` 붙여 실행. (또는 `cd ~/apps/taste && supabase db push` + DB 비밀번호.)

### 2b. Routine 생성
- `/schedule`(이 앱) 또는 web(claude.ai/code/routines). repo `leftjap/apps`, 작업 디렉터리 `taste/`, 모델 `opus`, 스케줄 주1회(예: 일 10시), 프롬프트 **"`taste/routines/taste-reco.md` 읽고 수행"**.

### 2c. Routine env + 네트워크 + API 트리거 (web 에서)
- env: `SUPABASE_URL`=https://tcbooffrdacfatywdzcm.supabase.co · `TASTE_RECO_TOKEN`=(`~/.config/taste/.env` 값) · `SUPABASE_ANON_KEY`=(`taste/.env.local` 값).
- 네트워크: Custom → `*.supabase.co`(또는 `tcbooffrdacfatywdzcm.supabase.co`) 화이트리스트. 누락 시 `403 host_not_allowed`.
- **API 트리거 ON** → `ROUTINE_ID` + bearer token 확보.
- ⚠ Today 교훈(`ai-navi-session2-HANDOFF.md:37`): env 주입이 불안정할 수 있음 → 안 들어오면 프롬프트에 값 리터럴로 박기(routine config, git 아님).

### 2d. 버튼용 secret  ⚠ taste 전용 이름 (Today 의 ROUTINE_ID 덮어쓰면 Today 버튼 깨짐!)
```
supabase secrets set TASTE_ROUTINE_ID="<routine uuid>" TASTE_ROUTINE_TRIGGER_TOKEN="<bearer token>" --project-ref tcbooffrdacfatywdzcm
```
(공유 프로젝트라 edge fn secret 은 전역 — `ROUTINE_ID`/`ROUTINE_TRIGGER_TOKEN` 은 Today ai-navi 전용이므로 절대 사용 금지.)

### 2e. cron (선택 — 0003)
```
select vault.create_secret('https://api.anthropic.com/v1/claude_code/routines/<ROUTINE_ID>/fire','taste_routine_fire_url');
select vault.create_secret('<bearer token>','taste_routine_trigger_token');
```
- 0003 적용(db push 또는 Dashboard). 변경감지 cron 은 0003 주석 — 주1회·버튼 검증 후 해제.
- ⚠ Today 에서도 cron 자동발화(0025)는 **미적용/미검증**으로 남았음(`session2-HANDOFF:65`). 버튼 + 수동 `/fire` 가 검증된 경로.

## 3. 검증 절차
- **버튼**: 홈 '다시 추천' → 분석중 스켈레톤 → 수십초 내 새 추천 realtime 도착.
- **수동 fire**: `POST https://api.anthropic.com/v1/claude_code/routines/<ID>/fire` (헤더 `Authorization: Bearer <token>` + `anthropic-version: 2023-06-01` + `anthropic-beta: experimental-cc-routine-2026-04-01`), body `{"text":"taste 추천 재생성 요청: owner_id=7bae5645-61c6-4476-9ff2-4c30a72812ff"}`.
- **DB**: `taste_recommendations` owner별 교체 + 환각 0(검증 통과분만).

## 4. 주의/리스크
- research-preview `/fire`(`experimental-cc-routine-2026-04-01`) — 변경 가능.
- 포스터: Routine 은 WebSearch. (이번 첫 배치는 알라딘[책]+위키백과[영화] 사용 — Routine 도 동일 철학.)
- 소연 owner: 평가가 쌓이면 scan context 의 pendingOwners 가 자동 포함. 현재는 지오만.
- per-run 토큰: Routine 이 평가 전량을 읽고 후보를 검증 → Today 단문 댓글보다 run당 토큰 큼. settle(15분)·주1회로 빈도 제한.
