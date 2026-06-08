# taste 추천 엔진 — 로컬 데몬 아키텍처 (구현·검증 완료 2026-06-08)

> Today `navi-realtime-daemon` 방식 미러. **Anthropic 과금 API 안 씀** — 로컬 데몬이 `claude -p`(구독 OAuth)로 생성.
> (이전엔 클라우드 루틴(`/fire`) 방식을 검토했으나 **폐기** — 로컬 데몬으로 대체.)

## 흐름
```
"다시 추천" 버튼 / 새 평가
   → taste_reco_requests insert (버튼) · taste_ratings insert (평가, 디바운스 90s)
   → [Supabase Realtime] 로컬 데몬이 즉시 감지
   → claude -p 헤드리스 (구독 OAuth, 비용 0) — routines/taste-reco.md 지침대로 홈 추천 생성
       (평가 분석 → 후보 → WebSearch 실재검증 → 포스터 → taste-reco submit)
   → taste_recommendations 전량 교체
   → [Realtime] 앱 홈이 자동 갱신 (home.js)
```

## 구성요소
- **데몬** `scripts/taste-reco-daemon.mjs` — service role 로 `taste_reco_requests`·`taste_ratings` INSERT 구독.
  코얼레싱(동시실행 방지·연타 흡수)은 `scripts/reco-scheduler.js`(단위테스트 `reco-scheduler.test.js`). 재연결 내장.
  `claude -p` 옵션: `--allowedTools Read,Bash,WebSearch --permission-mode bypassPermissions --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources project` (MCP·user플러그인 미로드 = 빠르고 집중). 타임아웃 12분.
- **launchd** `scripts/com.gio.taste-reco-daemon.plist` (KeepAlive). 설치: `cp ... ~/Library/LaunchAgents/ && launchctl load ...`. 재시작: `launchctl kickstart -k gui/$(id -u)/com.gio.taste-reco-daemon`.
- **`taste-reco`** edge fn (DEPLOYED) — DB 게이트(`x-taste-reco-token`). context/submit. service role 은 함수 안에만.
- **`taste_reco_requests`** 테이블 (마이그 0004) — 버튼/평가 트리거 큐. RLS 본인만. realtime publication.
- **home.js** 버튼 → `supabase.from('taste_reco_requests').insert({owner_id, source:'button'})` → 스켈레톤 → realtime 도착 시 교체.

## env (데몬이 파일에서 자동 로드)
- `~/.config/study/.env` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (공유 프로젝트)
- `~/.config/taste/.env` — `TASTE_RECO_TOKEN`
- `taste/.env.local` — `VITE_SUPABASE_ANON_KEY`
- `~/.config/navi-daemon/oauth-token` — `CLAUDE_CODE_OAUTH_TOKEN` (구독 인증, Today 와 공유)

## 운영
- 로그: `~/.local/state/taste-reco-daemon/stdout.log` (start/SUBSCRIBED/request/run/done|ERROR), `last-run.log` (claude 출력 전문).
- 마이그 적용: DB 비번 없이 Management API — `curl -X POST https://api.supabase.com/v1/projects/tcbooffrdacfatywdzcm/database/query -H "Authorization: Bearer <sbp_token>" -d '{"query":"..."}'`. 토큰은 keychain `security find-generic-password -s 'Supabase CLI' -w` → `go-keyring-base64:` 떼고 base64 디코드.
- 마이그 적용됨: 0002(kind/source_work/basis + recommendations realtime), 0004(taste_reco_requests).

## 검증됨 (2026-06-08, 도구 출력 근거)
- 버튼 클릭 → `source=button` 행 insert → 데몬 `request…button`/`run 시작` 로그 → claude 생성 `done` → DB 10건 교체(새 batch) → 앱 화면 자동 갱신(스크린샷). owner 7bae5645, 평가 1386.
- 추천 품질: 실제 작품 + 근거 평가작 연결(예: 파친코←소년이 온다★5). 취향 회피(에바·국뽕·자기계발 낙관론 배제) 반영.
- 단위테스트 35/35 통과.

## 알려진 한계 / 후속
- **생성 ~8–9분** (WebSearch 실재검증 10건). 버튼 누르면 그만큼 "분석 중" 스켈레톤. 더 빠르게: 후보 수↓ 또는 검증 병렬화.
- **포스터 적중률 편차** — claude 가 WebSearch 로 가져온 poster_url 이 일부 안 열림(앱이 플레이스홀더 폴백). 깨지진 않음.
- 평가 트리거(taste_ratings 디바운스)는 코드상 동작하나 라이브 미실측 — 실평가로 1회 확인 권장.
- 데몬 realtime 재연결 내장 + launchd KeepAlive 이중 안전망. (Today 처럼 채널 끊김 시 자동 복구.)

## 사실
- Supabase geo-apps `tcbooffrdacfatywdzcm`. 배포 함수: `taste-reco` 만(클라우드 루틴 트리거 `request-taste-reco` 는 폐기·삭제됨).
- secrets: `TASTE_RECO_TOKEN` 만 필요. `ANTHROPIC_API_KEY`·`TASTE_ROUTINE_*` 불필요(미설정).
