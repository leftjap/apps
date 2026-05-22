# 오늘의 네비 클로드 자동 댓글 — 배선 현황 & 남은 단계

## 0. 이미 완료 (Claude 자동 실행)
- 클로드 봇 계정: `CLAUDE_USER_ID = f74a3d8a-f449-4c25-82d1-509dc70a9988` (auth.users, `claude-bot@today.local`).
- 코드: 클라이언트(아바타/라벨/엔터피드백/버튼), 워커 `scripts/ai-navi-comment.mjs`, 지침 `routines/ai-navi.md`, 마이그 `0024_ai_comment_cron.sql`.
- **edge fn `request-ai-comment` 배포됨**(ACTIVE). **로컬 스케줄 작업 `navi-claude-comment` 생성됨**(매시간, 이 앱 열려 있을 때 워커 실행 → 자동 댓글). → 핵심 자동 댓글은 로컬 작업으로 이미 동작.
- 라이브 검증: 워커가 실제 글(AYO)에 클로드 댓글 1건 생성 확인.

## 동작 두 가지 — 차이
- **로컬 작업(완료)**: 이 Claude 앱 열려 있을 때 매시간 실행. 추가 설정 불필요(로컬 .env.local·네트워크 사용). 앱 꺼지면 다음 실행 시 보충.
- **클라우드 Routine(선택·아래)**: 앱 꺼져도 클라우드에서 항상 실행 + "즉시 버튼" 가능. 단 클라우드 env/네트워크/토큰 설정 필요.

## 1. 클라우드 Routine 생성 (선택 — 항상 켜짐 + 즉시 버튼 원할 때)
- 생성 수단: **CLI `/schedule`**(이 앱에서) 또는 web(claude.ai/code/routines) 또는 Desktop — 셋 다 같은 클라우드 계정에 기록됨.
- 설정: 레포 `leftjap/apps`, 스케줄 **매시간**, 모델 **Opus 4.7**, 프롬프트 "`today/routines/ai-navi.md` 읽고 수행"(작업 디렉터리 `today/`).
- env: `SUPABASE_URL`(=https://tcbooffrdacfatywdzcm.supabase.co), `SUPABASE_SERVICE_ROLE_KEY`, `CLAUDE_USER_ID`. 네트워크: Custom → `tcbooffrdacfatywdzcm.supabase.co` 화이트리스트.
  - ※ env/네트워크/「API 트리거」는 **web(claude.ai/code/routines)** 에서 설정해야 함(`/schedule` 은 스케줄만 만듦).
- "API 트리거" 켜고 → **ROUTINE_ID + bearer token** 확보(즉시 버튼·pg_cron 용).
- ⚠️ 일일 routine 실행 상한 확인.

## 2. 즉시 버튼용 secret (Routine + API 트리거 확보 후)
```
supabase secrets set ROUTINE_ID="<routine uuid>" ROUTINE_TRIGGER_TOKEN="<bearer token>" --project-ref tcbooffrdacfatywdzcm
```
edge fn 은 문서화된 형식으로 호출: `POST https://api.anthropic.com/v1/claude_code/routines/$ROUTINE_ID/fire`
헤더 `Authorization: Bearer …` + `anthropic-version: 2023-06-01` + `anthropic-beta: experimental-cc-routine-2026-04-01`. (research preview — 변경 가능)

## 3. pg_cron 폴백 (선택 — 클라우드 Routine 무료 효율 탐지)
1. Vault (SQL editor):
   ```sql
   select vault.create_secret('https://api.anthropic.com/v1/claude_code/routines/<ROUTINE_ID>/fire', 'routine_fire_url');
   select vault.create_secret('<bearer token>', 'routine_trigger_token');
   ```
2. 마이그 적용: `supabase db push` (**DB 비밀번호 필요** — 없으면 Dashboard SQL editor 에 `0024_ai_comment_cron.sql` 붙여 실행). pg_cron/pg_net 권한 막히면 Dashboard → Database → Extensions 수동 활성.

## 4. 검증
- 워커: `node scripts/ai-navi-comment.mjs fetch` → 대상 JSON. `... insert --entry <id> --body "x"`.
- 버튼: 네비 글 "클로드 댓글" → edge fn 200 → Routine 발사 → 수 초~수십 초 내 댓글.
- 멱등성: 같은 글 2회 → 클로드 댓글 1건만.

## 롤백
- 로컬 작업: 사이드바 "Scheduled" → `navi-claude-comment` 비활성/삭제.
- cron: `select cron.unschedule('ai-navi-comment-hourly');`
- edge fn: `supabase functions delete request-ai-comment`
- 계정: Dashboard → Auth → `claude-bot@today.local` 삭제 (댓글 cascade).
