# 미니대화(contextual input) 구현 계획 — 19~24번 프로토타입

> **상태 (2026-09-08)**: Task 1~4 완료. 커밋 `5306596`(검사기) · `634553a`(블록) · `9a75562`(콘텐츠·문서). 전체 테스트 79파일 1,548개 통과, 빌드·배포 성공, 시드 워크플로 성공(서버 19~24번 행 turns 3·3·3·4·3·2). 다음: 사용자가 실제 신규 세션에서 4가지 기준으로 검토 → 승인 시 25~100 확장.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코어100 표현 카드에 2~4턴짜리 짧은 대화(`explanation.miniDialogue`)를 붙여, 신규 세션 첫 화면에서 타깃 표현이 어떤 상대 발화와 상황 뒤에 나오는지 듣게 한다. 미완료 첫 묶음 19~24번(시드 `en-core100-2026-09-06.json`)에만 먼저 적용하고 실제 신규 세션에서 검토한다.

**Architecture:** 시드 필드는 optional(`[{speaker, en, ko?}]`). 신규 세션 렌더러 `sessionExprV2.js` 가 카드 상단에 블록(전체 듣기·한 줄 듣기·타깃 줄 강조)을 그린다. 복습 렌더러·공유 해설 패널은 건드리지 않는다. 시드 검사기 `validate-seed.mjs` 에 형식 검사를 얹는다(학습자 화면과 무관).

**Tech Stack:** 바닐라 JS + `h()`, `speakWithFeedback`(atoms.js, onEnd 지원), vitest(jsdom), Supabase 재적재 워크플로.

**Spec:** 2026-09-08 작업지시서 §1~§4 + 사용자 확정 보강(`docs/2026-09-08-speak-loop-plan.md` "후속 계획" 1항).

## Global Constraints

- **학습 게이트 금지**: 대화문 암기·통과 판정·다음 버튼 잠금·대화문 SRS·대화 전체 발음 점수를 붙이지 않는다. (2026-09-08 사용자 결정으로 변경: 블록은 문장 카드 **아래**, 줄마다 **선택 녹음** 추가 — 응용 행과 같은 채점·배지·집계이며 진행 조건은 아님.)
- 필드 없는 카드는 블록을 그리지 않는다(과거 카드·다른 트랙 호환).
- 타깃 줄의 `en` 은 카드 `sentence` 와 문자열 완전 일치, 정확히 1회.
- 턴 2~4, 평균 3 목표. `A 질문 → B 타깃 → A Okay` 획일화 금지.
- 시드 검사 등급: 차단 = 턴 수 밖·타깃 불일치/1회 아님·**안 배운 뒤쪽 묶음** 핵심 표현 삽입·타깃 외 줄 13단어 이상 / 경고 = 타깃 외 줄 11~12단어·이미 배운 표현 등장 / 사람 검수 = 난도·유발.
- 두 화자 음성: A = `en-US-AvaMultilingualNeural`, B = `en-US-AndrewMultilingualNeural`, rate 1.0.
- 완료된 1~18번은 재적재가 막히므로 대상이 아니다. 19~24번 행이 완료되기 전에 재적재해야 한다.

---

### Task 1: 시드 검사기 — `miniDialogue` 형식 검사

**Files:**
- Modify: `scripts/validate-seed.mjs` (chain 루프 뒤에 miniDialogue 루프, `loadCore100Keys(dir)` 신설, CLI 에서 `core100Keys` 전달)
- Test: `scripts/validate-seed.test.mjs`

**Interfaces:**
- Produces: `validateSeedContent(payload, { ..., core100Keys })` — `core100Keys: [{ num, id, expr }]`. `loadCore100Keys(seedsDir)` → 같은 배열(`en-core100-*.json` 전부, `explanation.key` 의 `=` 앞·괄호 제거).

- [x] Step 1: 실패 테스트 — 유효 2~4턴 통과 / 5턴 차단 / 타깃 불일치 차단 / 타깃 2회 차단 / 타깃 외 줄 13단어 차단·11단어 경고 / 뒤쪽 묶음 표현 차단·앞쪽 묶음 표현 경고.
- [x] Step 2: 실패 확인 `pnpm test scripts/validate-seed.test.mjs`
- [x] Step 3: 구현
- [x] Step 4: 통과 확인
- [x] Step 5: 커밋 `feat(study): 시드 검사 — miniDialogue 형식 검사(턴 2~4·타깃 1회 일치·주변 줄 길이·미학습 표현 차단)`

### Task 2: 신규 세션 블록 — 전체 듣기·한 줄 듣기·타깃 강조

**Files:**
- Modify: `src/pages/sessionExprV2.js` (`miniDialogueEl(ex, s, lang, expr)` 신설, 모바일·데스크톱 레이아웃에서 `cardEl` 앞에 삽입, CSS `.vs-mini*`)
- Modify: `src/pages/sessionNewDemo.js` (데모 표현 카드 1장에 miniDialogue 추가 — 시각 검증용)
- Test: `src/pages/sessionExprV2.test.js`

**Interfaces:**
- Consumes: `speakWithFeedback(btn, text, { lang, voice, rate, onEnd })`, `hlNode(text, expr)`.
- Produces: DOM `.vs-mini` > `.vs-mini-line[data-speaker]` (타깃 줄 `.tgt`), 버튼 `[data-role="mini-all"]`, 줄마다 `button[aria-label="듣기"]`.

- [x] Step 1: 실패 테스트 — 필드 있으면 블록·줄 수·타깃 줄 강조·ko 표시 / 필드 없으면 블록 없음 / 줄 듣기 → speak(해당 줄, 화자별 voice) / 전체 듣기 → onEnd 로 순차 재생 / 진행 조건 없음(다음 버튼 상태 불변).
- [x] Step 2: 실패 확인 `pnpm test src/pages/sessionExprV2.test.js`
- [x] Step 3: 구현
- [x] Step 4: 통과 확인 + `pnpm test` 전체 + `pnpm build`
- [x] Step 5: 브라우저 `/mocks/session-new.html?demo=1&view=session` 에서 블록 확인(스크린샷)
- [x] Step 6: 커밋 `feat(study): 신규 세션 미니대화 블록 — 전체/한 줄 듣기·타깃 강조, 진행 조건 없음`

### Task 3: 콘텐츠 — 19~24번 대화 6개 + 문서

**Files:**
- Modify: `seeds/en-core100-2026-09-06.json` (카드마다 `explanation.miniDialogue`)
- Modify: `docs/explanation-schema.md` (## miniDialogue 절), `docs/lesson-explanation-guide-en.md` §6.3 체크리스트, `specs/study-app-spec.md` §8-3
- Verify: `node scripts/validate-seed.mjs --payload seeds/en-core100-2026-09-06.json` OK(경고 확인)

- [x] Step 1: 대화 저작(턴 3·3·3·4·3·2, 타깃 위치 2·1·2·2·2·2)
- [x] Step 2: 검사기 통과
- [x] Step 3: 커밋 `content(study): 코어100 19~24번 미니대화 6개 + 스키마·가이드 문서`

### Task 4: 배포·재적재·검토 요청

- [x] Step 1: `git push` → deploy-pages 성공 확인
- [x] Step 2: `gh workflow run study-seed-supabase.yml --field payload=seeds/en-core100-2026-09-06.json --field user_id=<uuid> --field dry_run=false` → 서버 행 6개의 `explanation.miniDialogue` 존재 확인(curl)
- [x] Step 3: 사용자에게 검토 기준 4가지와 함께 보고. 진행 중 세션은 닫고 다시 열어야 새 데이터가 보임(스냅샷은 옛 카드).

## 후속

- 승인되면 25~100번 76장 저작(묶음별 시드 파일 수정 → 검사 → 재적재).
- 복습 정답 공개 뒤 해설 안 재생(선택), 복습 단서 다양화(별도 계획).
