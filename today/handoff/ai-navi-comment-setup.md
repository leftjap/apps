# 오늘의 네비 클로드 자동 댓글 — 외부 배선 (수동 단계)

코드는 레포에 완료. 아래는 Claude가 자율로 못 하는 클라우드/프로덕션 배선이다.

## 0. 이미 완료 (Claude 자동)
- 클로드 봇 계정 생성: `CLAUDE_USER_ID = f74a3d8a-f449-4c25-82d1-509dc70a9988` (auth.users, email `claude-bot@today.local`).
- 클라이언트(아바타/라벨/엔터피드백/버튼), 워커 `scripts/ai-navi-comment.mjs`, edge fn `request-ai-comment`, 지침 `routines/ai-navi.md`, 마이그 `0024_ai_comment_cron.sql`.

## 1. Routine 생성 (claude.ai/code/routines)
- 레포: `leftjap/apps`, 스케줄: **매시간**, 모델: **Opus 4.7**.
- 표준 프롬프트: "`today/routines/ai-navi.md` 를 읽고 그대로 수행한다." (작업 디렉터리 `today/`)
- 환경변수: `SUPABASE_URL`(=https://tcbooffrdacfatywdzcm.supabase.co), `SUPABASE_SERVICE_ROLE_KEY`, `CLAUDE_USER_ID`(위 값).
- 네트워크: Custom → `tcbooffrdacfatywdzcm.supabase.co` 화이트리스트.
- 생성 후: **routines-fire URL + 트리거 토큰** 확보(즉시 버튼·pg_cron 용).
- ⚠️ 일일 routine 실행 상한 확인. pg_cron(무료 탐지)이 대상 있을 때만 발사하므로 보통 글 수만큼만 실행됨.

## 2. Edge fn 배포 + secret (즉시 버튼)
```
cd today
supabase functions deploy request-ai-comment --project-ref tcbooffrdacfatywdzcm
supabase secrets set ROUTINE_FIRE_URL="<routines-fire URL>" ROUTINE_TRIGGER_TOKEN="<토큰>" --project-ref tcbooffrdacfatywdzcm
```
(config.toml 에 `[functions.request-ai-comment] verify_jwt=true` 이미 있음. Anthropic 키 불필요.)

## 3. pg_cron 폴백 (매시간 무료 탐지 → 발사)
1. Vault 시크릿 등록 (SQL editor):
   ```sql
   select vault.create_secret('<routines-fire URL>',   'routine_fire_url');
   select vault.create_secret('<트리거 토큰>',          'routine_trigger_token');
   ```
2. 마이그 적용: `supabase db push` (또는 `0024_ai_comment_cron.sql` 을 SQL editor 실행).
   - pg_cron/pg_net 확장은 마이그가 `create extension if not exists` 시도. 권한 막히면 Dashboard → Database → Extensions 에서 수동 활성.
3. ⚠️ **routines-fire 페이로드/헤더 shape 은 research preview** — 실제 API 와 다르면 edge fn `index.ts` 의 fetch body + `0024` 의 `net.http_post` body 만 조정.

## 4. 검증 (배선 후)
- 워커: `node scripts/ai-navi-comment.mjs fetch` → 대상 JSON. `... insert --entry <id> --body "x"` → today_comments insert + 앱 realtime 표시.
- 버튼: 네비 글에서 "클로드 댓글" 클릭 → edge fn 200 → Routine 실행 → 수 초~수십 초 내 댓글.
- pg_cron: `select today_ai_has_pending();` → 대상 유무. Routine one-off 강제 실행으로 자동 댓글 확인.
- 멱등성: 같은 글 2회 → 클로드 댓글 1건만.

## 롤백
- cron: `select cron.unschedule('ai-navi-comment-hourly');`
- edge fn: `supabase functions delete request-ai-comment`
- 계정: Dashboard → Auth → claude-bot@today.local 삭제 (댓글 cascade).
