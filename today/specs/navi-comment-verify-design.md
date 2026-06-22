# 오늘의 네비 자동 댓글 — 독립 검증 파이프라인 설계 (2026-06-22)

## 배경 · 목표

현재 `scripts/navi-realtime-daemon.mjs` 의 `runClaude(entry)` 는 글마다 `claude -p` **1회**로
(context → 댓글 작성 → submit) 를 한 번에 처리한다. 같은 에이전트가 자기 글을 검증할 수 없어,
댓글이 ②"최신 연구/학문 연결" 지침을 지키려다 **부정확한 연구를 인용**할 위험이 있다
(실측 사례: 한 댓글이 Piff 연구를 '친사회성'으로 느슨하게 분류).

**지침(`routines/ai-navi.md`, 2가지)은 수정하지 않고**, daemon 에 **독립 검증 단계**를 추가해
submit 전에 사실관계를 거른다. 검증 *기준*은 지침에 두고, 검증을 *실행*하는 것은 daemon 코드.

## 비목표 (YAGNI)

- 지침(ai-navi.md) 내용 변경 — 안 함 (사용자 명시).
- reply(대댓글) 검증 — 범위 아님. 초안(initial 댓글)만.
- 클라우드 cron 경로 — 휴면, 손대지 않음.
- 정적 점수/등급 UI, 검증 로그 영구 저장 — 불필요.

## 아키텍처

`runClaude(entry)` 를 단계로 분리한다. 각 단계는 **임시 작업 디렉토리의 파일**로 주고받는다
(stdout 파싱 회피 → 견고). 작업 디렉토리는 entry 별 `os.tmpdir()/navi-verify-<id>-<ts>`.

1. **DRAFT** — `claude -p`(Read,Bash): ai-navi.md 대로 댓글 작성 → `draft.txt` 기록. **submit 안 함.**
2. **VERIFY** — 2개의 **독립** `claude -p`(새 컨텍스트, entry + draft 만 받음):
   - **fact** (Read,Bash,WebSearch): 인용한 연구·사실을 WebSearch 로 검증 →
     `verdict-fact.json` = `{ ok: bool, problems: string[], fix: string }`. **불확실하면 ok=false.**
   - **tone** (Read,Bash): 유머·②연결이 살았나 → `verdict-tone.json` = 같은 형태.
3. **GATE** — 순수 함수 `gateDecision(verdicts, { revisesLeft })`:
   - `fact.ok === true` → **submit**.
   - `fact.ok === false` 이고 `revisesLeft > 0` → **revise**: problems/fix 를 모아 REVISE 패스
     (`claude -p` 로 draft 를 **사실 교정 재작성**) → 다시 VERIFY. (기본 maxRevise = 2)
   - `fact.ok === false` 이고 `revisesLeft === 0` → **hold**: submit 안 함. catchUp self-heal 이
     다음 스캔에서 재시도 → **부정확한 연구는 절대 게시되지 않음.**
   - tone 은 **권고**: tone.ok=false 여도 submit 차단 안 함(혼자서는 hold 못 시킴). 단 revise 시 fix 반영.
4. **SUBMIT** — daemon 이 edge fn `ai-comment`(action:submit)을 **직접 curl**(결정적). 에이전트 비결정성 제거.

```
DRAFT → VERIFY(fact+tone) → GATE
                              ├ submit → SUBMIT(curl)
                              ├ revise → REVISE → VERIFY ... (max 2)
                              └ hold   → 종료(미게시) → catchUp 재시도
```

## 인터페이스 (격리·테스트 단위)

- `selectPendingInitial(...)` — 기존, 변경 없음.
- `gateDecision(verdicts, opts) -> { action: 'submit'|'revise'|'hold', reason }` — **순수**, 단위 테스트.
- `parseVerdict(text) -> { ok, problems, fix }` — strict JSON 파싱, 실패 시 `ok=false`(보수적). 단위 테스트.
- daemon 오케스트레이션(파일 생성·`claude -p` spawn·정리) — 통합 테스트.
- 기존 보존: settle(1시간), `seen` in-flight, catchUp 회수(self-heal). 검증 실패/예외도 `seen` 해제 → 재시도.

## 실패 · 예외

- 에이전트 timeout/에러 → 해당 단계 실패 → 그 사이클 종료 → `seen` 해제 → self-heal 재시도.
- draft 파일 부재/빈값 → 실패 처리(게시 안 함).
- verdict JSON 파싱 실패 → `ok=false`(보수적) → revise 또는 hold.
- WebSearch 불가(네트워크) → fact 패스가 '불확실' 로 ok=false → hold·재시도(틀린 채 게시 X).
- 작업 디렉토리는 사이클 끝에 정리.

## 테스트 (TDD)

- `gateDecision` 단위: fact.ok→submit / fact 실패+잔여→revise / maxRevise 소진→hold / tone 단독 실패는 비차단.
- `parseVerdict` 단위: 정상 JSON / malformed / 필드 누락 → 모두 보수적 ok=false 기본.
- 통합: 실글 1건으로 draft→verify→(필요 시 revise)→submit 1사이클 + production 화면 검증.

## 비용 · 지연

- `claude -p` 2~5회 × ~60~130초 = **~4~10분/댓글**. 비동기 + settle 1시간이라 사용자 체감 영향 없음.
- 구독 OAuth 토큰 → 금전 비용 ~0.

## 미해결 / 후속

- tone 실패를 더 강하게 다룰지(차단)는 운용 후 재검토.
- reply(대댓글) 검증은 별도 설계.
