# Study 앱 학습 사이클 구현 — 세션 핸드오프

**날짜**: 2026-05-08
**상태**: Wave A.1 ~ A.11 완료, **A.12 (듣기 TTS) / A.13 (해설) 미착수 — 핵심 stub**

---

## 현재 위치 (즉시 알아야 할 것)

### 완료된 학습 사이클
홈 (언어 토글 / 카드 카운트 / "이어서 하기" 표시) → 신규/복습 세션 (카드 로드 → 발음 평가 [Azure 통합 + mock 폴백] → 판정 [review SRS] → 종료 모달 → DB 영속) → 학습 완료 화면 (실 데이터). 이탈 1시간 이내 자동 복원.

### 남아있는 핵심 stub (사용자가 명시적으로 지적)
| 기능 | 상태 | 위치 |
|---|---|---|
| **듣기 (TTS)** | ✗ stub | session-new.js:188 / session-review.js:201 — `createListenButton({ large })` 가 `onPlay` 미전달 |
| **해설 (explanation)** | ✗ stub | session-new.js:297 / session-review.js:318 — `console.warn('[explain] stub — Wave N')` |
| 녹음 + Azure 분석 | ✓ wired | Wave A.7 |

### 사용자의 마지막 지시 (그대로 인용)
> "순서대로 진행하되, 기존에 수파베이스에 저장되어 있는 학습 및 복습 데이터를 적용시켜서 실제 듣기/녹음/해설 등이 제대로 구현되는지 검증해야 함"

→ A.12/A.13 구현 + **실 Supabase 데이터로 E2E 검증** (mock 한계 넘어서서)

---

## 다음 Wave 계획

### A.12 — 듣기 (TTS) wire-up
- session-new/review 의 `createListenButton` 호출에 `onPlay` 콜백 전달
- 콜백: `window.studySpeech.speak(state.sentence.sentence, { lang: card.lang === 'ja' ? 'ja-JP' : 'en-US' })`
- speech.js 의 Speech.speak 는 이미 구현됨 (Azure SSML + Web Speech 폴백)

### A.13 — 해설 (explanation) wire-up
- card.explanation 은 JSONB (spec §5 explanation-schema 참조: ja=4 필드 / en=8 필드)
- "해설 보기" 버튼 클릭 → 펼침 패널에 explanation 필드 렌더
- DOM 구조: spec §8-3 신규 카드 해설 패널 (핵심 포인트 / 이런 상황 / 문법 / 발음 팁 / 자주 하는 실수 / 비슷한 표현 / 품사 변형 / 애니 장면)
- 1차 정본: `~/apps/study/seeds/README.md` + `docs/lesson-explanation-guide-{ja,en}.md`

### A.14 — 자유 복습 모드 (이전 잔여, spec §8-4)
### A.15 — stats / login / settings 페이지 module 마이그 (현재 mocks IIFE 로 동작 중, 일관성)

---

## 실 Supabase 데이터 E2E 검증 전략 (사용자 합의 필요)

**제안**: `chrome-devtools` MCP (autoConnect) 로 사용자의 실 Chrome 의 `leftjap.github.io/apps/study/` 탭 (OAuth 인증됨) 조작.
- 실 IndexedDB + 실 Supabase pull 데이터 + 실 Azure 토큰 + 실 마이크 권한 + 실 TTS 재생 통합 검증
- mock 검증 (지금까지) 의 한계: Dexie API 시그니처 흉내만, 실제 Supabase pull / Azure / 마이크 / TTS 미경유

**진행 흐름**:
1. A.12 구현 → 빌드 → push (GH Actions 자동 배포)
2. 사용자 Chrome 에서 leftjap.github.io/apps/study/ 새로고침 (인증 유지)
3. chrome-devtools MCP 로 click / snapshot / console 캡처

핸드오프 후 첫 turn 에서 사용자에게 이 전략 확인 요청.

---

## 작업 규칙 (이 세션에서 박제됨)

### 검증 룰
1. **실패 시 거짓말 금지**: 검증 통과 못하면 그대로 보고 + 중단. "통과"·"동작"·"검증 완료" 같은 vague 라벨 금지 — stdout/snapshot 직접 인용
2. **단계별 진행 후 검증**: 단위 테스트 → 통합 테스트 (실 Dexie + fake-indexeddb) → 빌드 → preview 자동 검증 (4단)
3. **mock vs 실**: mock 으로 검증된 것은 "mock 검증" 으로 표기. 실 데이터 통합은 별도 명시
4. **scope 외 발견 시 보고**: 작업 중 다른 버그 발견 시 별 wave 분리 또는 동시 처리 사용자 승인 필요. 묶어서 자동 처리 금지

### 둠 루프 자동 탈출
- 같은 에러 2회 → 수정 멈추고 원인 진단만 보고
- 3회 → 컨텍스트 오염 가능성, 새 세션 권고

### Hook (강제 차단)
- **scope-gate**: Edit > 100줄 또는 4500b / Write > 100줄 또는 5000b 시 차단. 우회 = 사용자 발화에 키워드 ("scope ok", "범위 승인" 등) → `~/.claude/.scope-approved` 자동 set. 본 세션에서 50→100 줄로 완화 조정 (data: ESLint default 50 + Graphite max-velocity 80 + Cisco 200-400 review 범위 기준)
- **block-vitest-watch**: `pnpm test` 차단 (study/gym/today 는 `pnpm vitest run` 사용)

### preview 검증 도구 (정확)
- `mcp__Claude_Preview__preview_start` (`study-preview` config: `pnpm preview --port 4174`) — Vite preview 서버 + 내장 Chromium
- `mcp__Claude_Preview__preview_eval` — JS 주입 (mock studyDB 등)
- `mcp__Claude_Preview__preview_snapshot` — accessibility tree
- `mcp__Claude_Preview__preview_console_logs` (level='error')

### 알려진 검증 false-positive
- 페이지 hard reload 안 하면 이전 SPA 상태 누적 → state 변화 false 양성. 큰 변경 후 `window.location.reload()` 권장
- preview 의 home loadStats 에러 6+건 — 테스트 mock 의 sessionLogs.where() 미구현. session/summary 페이지와 무관

---

## 신규 파일 (커밋 안 됨)

```
src/pages/
  cardLoader.js + .test.js + .integration.test.js
  summary.js
src/services/
  sessionAnalyze.js + .test.js
  sessionFinish.js + .test.js + .integration.test.js
  pronunciationLog.js + .test.js + .integration.test.js
  weakPhonemes.js + .test.js + .integration.test.js
  summaryData.js + .test.js
  activeSession.js + .test.js + .integration.test.js
  langMeta.js + .test.js + .integration.test.js
  srs.js + .test.js + .integration.test.js
src/utils/
  elapsed.js + .test.js
src/components/session/
  endConfirm.js
```

수정 (push 안 됨):
```
src/app.js  (PAGE_MOUNTS + script 제거 패턴 + host 폴백)
src/main.js (tokens.css/session.css import)
src/pages/home.js (lang 토글 + activeSession resume + sessionCard isResume)
src/pages/session-new.js (Wave A.1~A.11 통합)
src/pages/session-review.js (Wave A.1~A.11 통합)
src/services/speech.js (normalizeReferenceText 풀-와이드 패치)
```

push 된 마지막 커밋: `4f71d62 fix(study): mount SPA pages directly to fix prod home/session render` (Wave 0). 그 이후 작업은 모두 WIP claude-snapshot 만 됨, **의미 커밋 + push 미수행**.

→ 새 세션에서 진행 전 결정 필요: A.1~A.11 묶어 1개 커밋? 아니면 wave 별 분리?

---

## 테스트 카운트
- 28 test files / 399 tests passing (`pnpm vitest run`)
- 통합 테스트 (실 Dexie + fake-indexeddb): cardLoader / srs / sessionFinish / pronunciationLog / weakPhonemes / activeSession / langMeta — 7 모듈

---

## 핵심 spec 참조

`/Users/gio_c/apps/study/specs/study-app-spec.md`:
- §6 SRS 간격 [1,3,7,21,60] / kind no/hmm/got
- §7-2 언어 토글
- §7-7 세션 시작 버튼 ("이어서 하기" 우선)
- §8-2 ~ 8-7 학습 세션 흐름
- §9 발음 평가 (Azure)
- §10 학습 완료 요약
- §4 LANG_META JSONB 스키마
- §5-0 콘텐츠 자연어 트리거

`/Users/gio_c/apps/study/seeds/README.md` — payload 형식 (1차 정본)
