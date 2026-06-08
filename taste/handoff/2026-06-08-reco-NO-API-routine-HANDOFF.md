# taste 추천 — 핸드오프 (2026-06-08)

> 새 세션은 이 문서를 그대로 붙여 시작. 이전 세션이 핵심 제약을 반복해서 놓쳐 사용자가 핸드오프 요청.

## 0. ⛔ 절대 제약 (이전 세션이 계속 어김)
**Anthropic 과금 API(`ANTHROPIC_API_KEY`, `api.anthropic.com/v1/messages`) 절대 사용 금지.**
추천 생성은 **지오의 Claude 구독으로 도는 Routine**(= Today 앱 "클로드 자동 댓글"과 동일 메커니즘)이 해야 한다. 과금 API 아님.

## 1. 목표 (사용자가 원하는 동작)
- **"다시 추천" 버튼을 누르면 즉시** AI가 (신규+기존 별점 기반) 새 추천을 생성해 앱에 뿌린다.
- 스케줄/예약 아님 — **on-demand 즉시**. 단, 생성 주체는 **구독 Routine**.
- 이걸 만족하는 유일한 구조: **버튼 → Routine 을 `/fire` 로 즉시 발사**(Today 버튼과 100% 동일). Routine 은 "스케줄 실행"으로 보이지만 `/fire` 로 **즉시 1회 발사**가 되며, 지오 구독으로 돈다(API 과금 없음).

## 2. 이전 세션(나)의 오류 — ✅ 복구 완료 (2026-06-08, 커밋 7f7be0c)
1. **API 함수를 만들어 버림(제약 위반).** `generate-taste-reco` edge fn 이 `ANTHROPIC_API_KEY` 로 Messages API 를 직접 호출. **삭제 대상.**
2. **버튼을 그 API 함수로 재배선.** `home.js` 버튼이 `generate-taste-reco` 를 호출하게 바뀜. **되돌릴 것.**
3. **config.toml** 을 generate-taste-reco 만 남게 덮어씀. **되돌릴 것.**
4. (앞서) cron 을 "주1회"로 잘못 박았다가 변경감지로 고침 — cron 은 부차적(버튼이 메인). 무시 가능.

### 복구 절차 — ✅ 이미 실행 완료 (재실행 불필요)
- `git revert c21cfd8` → 커밋 **7f7be0c**(push 됨): generate-taste-reco/index.ts 삭제, config.toml 복원(taste-reco+request-taste-reco), home.js 버튼 → request-taste-reco 복원.
- `supabase functions delete generate-taste-reco --project-ref tcbooffrdacfatywdzcm --yes` → 배포본 제거 완료. **현재 배포: taste-reco + request-taste-reco 만**(검증됨).

정확한 구조(§3)가 **코드·배포 양쪽** 다 복원됨. request-taste-reco·taste-reco·routines/taste-reco.md 는 삭제된 적 없음 — 전부 살아있음. **➡ 다음 세션은 §4(지오 1회 셋업)부터 시작.**

## 3. 정확한 아키텍처 (이미 만들어져 있음 — revert 하면 완성형)
- **`taste-reco`** edge fn (DEPLOYED, 검증됨): service_role 격리 DB 게이트. `x-taste-reco-token` 게이트. `context`(평가·기존추천 읽기)/`submit`(추천 교체). 검증결과: 토큰없음 401 / 토큰+owner count 1383 / scan [].
- **`request-taste-reco`** edge fn (DEPLOYED): 버튼이 호출(유저 JWT). owner 확인 → Routine `/fire`. **`TASTE_ROUTINE_ID`·`TASTE_ROUTINE_TRIGGER_TOKEN`** secret 읽음(Today 의 `ROUTINE_ID` 와 충돌 안 나게 taste 전용 이름 — 공유 프로젝트라 중요).
- **`taste/routines/taste-reco.md`** (있음): Routine 프롬프트. Claude 가 `taste-reco context` 로 평가 읽고 → 취향 분석 → 추천 생성 → **WebSearch + 알라딘으로 실재검증·포스터**(과금 API 아님, Routine 의 자체 도구) → `taste-reco submit`. 멱등.
- **home.js** 버튼(revert 후): `request-taste-reco` 호출 → "분석 중" 스켈레톤 → Routine 이 수 초~수십 초 내 생성·기록 → realtime/재pull 로 도착.
- **흐름**: 버튼 → request-taste-reco → `/fire`(지오 routine, 구독) → Routine 이 taste-reco 로 읽고·쓰기 → 앱 표시.

## 4. 지오 1회 셋업 (구독 기반 — 과금 API 아님)
참조: `taste/handoff/2026-06-07-reco-engine-cloud-setup.md` (절차 동일, secret 이름만 TASTE_ROUTINE_*).
1. **Routine 생성** — `/schedule`(이 앱) 또는 web(claude.ai/code/routines). repo `leftjap/apps`, 작업폴더 `taste/`, 프롬프트 "`taste/routines/taste-reco.md` 읽고 수행". **지오 구독 계정**에 생성(API 키 아님).
2. **Routine env + 네트워크 + API 트리거**(web): env `SUPABASE_URL`·`TASTE_RECO_TOKEN`(값은 `~/.config/taste/.env`)·`SUPABASE_ANON_KEY`; 네트워크 `*.supabase.co`; **API 트리거 ON → ROUTINE_ID + bearer token** 확보.
3. **secret 설정**: `supabase secrets set TASTE_ROUTINE_ID="..." TASTE_ROUTINE_TRIGGER_TOKEN="..." --project-ref tcbooffrdacfatywdzcm` (⚠ Today 의 `ROUTINE_ID` 덮어쓰지 말 것).
4. **마이그 0002 적용**(DB 비번 — Dashboard SQL editor 에 `taste/supabase/migrations/0002_taste_reco_branch.sql` 붙여 실행): realtime publication 추가돼야 버튼 결과가 **자동 도착**. 미적용이면 버튼 후 새로고침 필요. (kind/갈래 컬럼도 이때 생김 — Routine submit 이 kind 쓰면 0002 필요. 안 쓰게 하려면 submit 을 0001 컬럼만으로 — taste-reco/index.ts 확인.)
- ⚠ Today 교훈(`today/handoff/ai-navi-session2-HANDOFF.md:37`): Routine **env 주입이 불안정**할 수 있음 → 안 들어오면 프롬프트에 값 리터럴로 박기(routine config, git 아님). `/fire` 는 research-preview(`experimental-cc-routine-2026-04-01`).

## 5. 정직한 한계 (사용자에게 명확히)
- **API 안 쓰고 + 버튼 즉시** 둘 다 만족하는 길은 §1 의 "버튼→구독 Routine /fire" 하나뿐. Routine 자체를 거부하면, 남는 무과금 옵션은 **수동 재생성**(Claude Code 세션에서 사람이 "추천 새로 뽑아줘") 뿐 — 버튼 자동화 불가.
- Routine `/fire` 가 진짜 수 초 내 결과를 주는지는 Today 에서도 **버튼+수동만 검증**, pg_cron 자동발화는 미검증. 버튼 경로부터 실측할 것.

## 6. 유지할 것 (이미 동작·검증 — 건드리지 말 것)
- **홈에 실추천 16건 표시 중**(영화/드라마 9 + 책 7, 포스터·이유). 이번 세션에 service_role 로 수동 생성(알라딘+위키, 무과금). Routine 이 버튼으로 재생성하기 전까지의 시드. `taste_recommendations` 에 있음.
- **앱 버그 수정(전부 배포·검증)**: 별점 확정 버그(rating.js pointerup), 0.5★ 찌그러짐(overflow 클립), 전체/영화/책 탭 제거, **평가한 작품 추천에서 제외**(home.js ratedKeyOf 필터), 홈 빈화면 sync 타이밍(pullRecommendations), recommendations sync 전량교체(sync.js replace).
- `taste-reco/logic.js` + `logic.test.js`(13 통과). 마이그 0002(미적용)/0003(cron, 부차).

## 7. 사실
- Supabase: geo-apps `tcbooffrdacfatywdzcm`. service_role = `~/.config/study/.env`. anon = `taste/.env.local`.
- 지오 owner_id: `7bae5645-61c6-4476-9ff2-4c30a72812ff`. 활성 평가 1383(영화638·드라마429·책316).
- secrets(현재, 검증됨 2026-06-08): `TASTE_RECO_TOKEN` 설정 / `ANTHROPIC_API_KEY` **미설정**(과금 API 흔적 0 ✓) / `TASTE_ROUTINE_ID`·`TASTE_ROUTINE_TRIGGER_TOKEN` 미설정(§4 에서 지오 설정). ⚠ `ROUTINE_ID`·`ROUTINE_TRIGGER_TOKEN` 은 **Today 전용** — 덮어쓰지 말 것(taste 는 `TASTE_` prefix 별도 이름 사용).
- 배포 함수: taste-reco·request-taste-reco 만 (generate-taste-reco 삭제 완료 ✓).
- 앱 배포: push→GitHub Actions(`deploy-pages.yml`). PWA 캐시로 새 코드 1~2회 새로고침 필요.
- 커밋 흐름: `a6aa2c7`(정상 베이스) → `c21cfd8`(API 실수) → `1e07119`(핸드오프) → `7f7be0c`(revert=복구 완료, **현재 HEAD**).
