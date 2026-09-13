# 대화 단위 신규 세션 화면 (시안 12a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 세션(`#/session-new`)의 표현 학습 화면을 "카드 1장 = 화면 1장 + 카드 아래 대화 반복" 에서 "대화가 위에 고정되고 선택한 줄이 그 자리에서 열려 연습 화면이 되는" 구조로 바꾼다.

**Architecture:** 데이터 모델 · SRS · 채점 · 이력 저장 · 스냅샷 · 복습 화면은 건드리지 않는다. 표현 카드 목록을 대화 묶음으로 접는 순수 함수(`buildDialogueGroups`)를 만들고, 묶음 하나를 그리는 렌더 헬퍼(`dialogueStageEl`)가 줄과 선택 줄 열림을 담당한다. 기존 녹음·채점 배선(`applyScore`·`paintRing`·`refreshDots`·`finishRecording`·`onMiniScore`·`onDrillScore`)은 조립부에 그대로 두고, 만들어진 컨트롤 노드를 선택 줄 안으로 **주입**한다. 문장 카드(`.vs-card`)와 좌측 레일(`.vs-rail`)은 없어지고, 미니대화 블록(`miniDialogueEl`)은 복습이 계속 쓰므로 코드만 유지한다.

**Tech Stack:** Vanilla JS PWA(Vite), DOM 헬퍼 `h()`(`src/components/d1/dom.js`, null 자식 무시), vitest(jsdom), 색·모션 토큰 `V_VARS`·`V_KEYS`(`src/components/v2/atoms.js`).

**Spec:** `~/Downloads/Study app redesign plan.zip` 의 `handoff/WORK-ORDER.md`(시안 = `handoff/Dialogue Session Final.dc.html` 12a, 설계 이력 = `handoff/handoff-notes.md`) + 아래 §0 결정.

## Global Constraints

- 작업 디렉터리는 `~/apps/study`. 단일 파일 테스트는 `pnpm exec vitest run <파일>`, 전체는 `pnpm test`. `pnpm vitest` 를 `run` 없이 부르지 않는다(watch 로 멈추고 훅이 차단한다).
- **베이스라인: 81파일 1615테스트 통과**(2026-09-13 실측). 매 Task 끝에서 전체가 아니라 해당 파일만 돌리고, Task 8 에서 전체를 돌린다.
- **바꾸지 않는 것**: `.vs-pill` 3상태와 `.vs-cir`(듣기·녹음 버튼)의 마크업·CSS·애니(`v-breatheC`·`v-pulse`), `speakWithFeedback`, `historyCalCard`, `utterRingCard`(인자만 `size:96`), `scoreDot`/`passDot`, `explainPanel` 5섹션, `drillRows` 의 듣기·녹음·채점 로직, `miniDialogueEl`, `applyScore`/`onDrillScore`/`onMiniScore` 저장 경로, `state.step` 기반 진행·스냅샷·수화·`finishSession`·`sessionReviewV2`.
- **`VS_CSS`·`VSM_CSS` 는 복습(`sessionReviewV2`)이 통째로 주입한다.** 기존 규칙의 **값을 바꾸지 않고 새 클래스만 추가**한다. 복습이 쓰는 것: `.vs-cir` · `.vs-lab` · `.vs-labrow` · `.vs-klab` · `.vs-panel` + 공유 컴포넌트가 만드는 `.vs-drow` · `.vs-gscore` · `.vs-kbox` · `.vs-sec` · `.vs-chip` · `.vs-rec` · `.vs-uring` · `.vs-mini-*`. 삭제해도 되는 신규 전용: `.vs-rail` · `.vs-rstep` · `.vs-card` · `.vs-h1` · `.vs-ko` · `.vs-pron` · `.vs-crumb` · `.vs-scene` · `.vs-prog` · `.vs-prog-t` · `.vs-main` · `.vs-mainwrap` · `.m-steps` · `.m-rstep` · `.scene-chip`.
- 토큰만 쓴다(`V_VARS`). 이모지 금지, 좌측 색보더·그라디언트 배경 금지, **새 keyframe 을 만들지 않는다**(`V_KEYS` 재사용: `v-settle` · `v-haloT` · `v-draw` · `v-pulse` · `v-breatheC`). 애니 재트리거는 기존 `popScore` 방식(클래스 제거 → reflow → 추가).
- 주석·문서는 한국어, 날짜는 `2026-09-14`, 기존 파일 관례(§ 번호, "사용자 결정" 인용)를 따른다.
- 커밋은 모노레포 루트 `~/apps` 에서 `git add study/<파일>` 로 이 계획이 만진 파일만. Conventional Commits, 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stop 훅이 `WIP(claude-snapshot)` 로 선점 커밋하면 `git reset --soft HEAD~1` 로 합친다(`--hard` 금지).

## §0 결정 사항 (클로드 디자인, 2026-09-14)

1. **대화가 없는 카드**: 그 카드 문장 한 줄만 "열린 줄" 상태로 그린다(배지 · 영문 · `[발음]` · 뜻 · 듣기/따라 말하기 필 · 링 · 점수 열). 옛 문장 카드로 돌아가지 않는다 — 화면 어휘가 둘이 되면 안 된다. "오늘의 대화" 라벨 · 장면 문장 · 전체 듣기는 숨긴다.
2. **카드마다 대화가 다른 세션**: 대화별로 묶어 위→아래 나열. 묶음 기준은 `miniDialogue` 의 `en` 배열을 join 한 문자열 동일성. 각 묶음은 자기 라벨 · 장면 · 전체 듣기를 갖고, 카드 줄 번호는 **세션 전체 순번**. 대화 없는 카드는 한 줄 묶음으로 같은 열에 끼운다.
3. **혼합 세션도 같은 규칙** — 별도 분기 없음. 선택 이동 시 해당 묶음이 화면에 보이도록 스크롤.
4. **전체 듣기가 선택 줄 차례**: 그 줄의 듣기 필을 재생 중 상태로 바꾼다(필의 기존 듣기↔재생 중 전환 그대로). 줄 배경 블루 소프트는 다른 줄과 동일. 체인(`onEnd`) 연결은 엘리먼트 종류와 무관하게 유지.
5. **선택 줄 듣기 필의 목소리**: 대화 줄 규칙(화자 성별 고정 `MINI_VOICES`, `rate 1.0`). 이 줄은 문장 카드가 아니라 대화의 한 줄이기 때문. **대화가 없는 카드의 단독 줄**은 화자가 없으므로 기존 문장 카드 규칙(`PRACTICE_VOICES` 순환 · rate 미전달 = 0.85) 유지. 응용 행(`drillRows`)은 기존 `pickPracticeVoice` 그대로 — 손대지 않는다.
6. **선택 줄 본 점수 열은 10개**(`MAIN_DOTS_MAX`). 흔적 줄(접힌 카드 줄 · 상대 줄 · 응용 행)은 8개 + `+N`.

## §0-1 화면 규칙 요약 (WORK-ORDER §2 발췌 — 수치 정본)

- **카드 줄** = `line.en.trim() === card.sentence.trim()` 인 줄. **상대 줄** = 나머지. 선택 = `state.step`.
- **데스크톱 3칼럼**: 좌측 사이드바 250 / 대화 메인 flex(padding 28) / 우측 패널 400.
- **폰 단일 칼럼**: 상단 바(sticky, 세그먼트바 포함, **스텝 줄 없음**) / 본문(padding 0 20 24) / 하단 CTA(sticky).
- **줄**: radius 16(폰 14), padding 9 14(폰 9 10), 가로 flex gap 12(폰 9), 세로 가운데.
  배지 20px Outfit 10.5px 800 · 화자 이름 Outfit 12px 700 폭 34px(폰은 문장 위 라벨 10.5px 700 .04em) · 텍스트 블록 세 줄(영문 / `[발음]` / 뜻) + 흔적 줄 · 오른쪽 버튼 열 33px(폰 32px).
- **줄 사이 1px `--line` 헤어라인**(데스크톱 좌우 14px 안쪽, 폰 4px). 첫 줄 위 · 선택 줄 위아래에는 없음. gap 0.
- **선택 줄**: 배경 `--card`, 테두리 1px `--line`, 그림자 `0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.18)`, `v-settle .5s both`. 배지 = `--teal` 채움 흰 숫자 + `v-haloT 2.4s`.
- **색**: 선택 영문 20px 800 `--teal-deep`(폰 17px) / 선택 줄 직전 상대 줄 17px 600 `--ink`(폰 15px) / 카드 줄 17px 700 `--ink` / 나머지 상대 줄 17px 600 `#4a5450`. 화자 이름은 지오(B) `--teal-deep`, 소연(A) `--mut`(코랄 금지).
- **말한 카드 줄**(utter 이력 있고 선택 아님): 배지가 `--teal-soft` 바탕 체크(`v-draw`).
- **발음**: `[` `]` 안에. 괄호 `--faint` 400, 글자 `--teal-deep` 500, 11.5px(폰 11px), lh 1.45, letter-spacing .01em, margin-top 3.
- **뜻**: 13px(폰 12.5px) `#4a5450` 400, lh 1.45, margin-top 4. 접힌 카드 줄은 끝에 ` · 응용 d/총`(`--faint`).
- **움직이는 표식은 대화 줄 선택 배지 헤일로 하나.** 열림 · 패널 교체는 `v-settle` 1회. "다음 표현" 숨쉬기 없음, 좌측 목록 헤일로 없음.

## File Structure

| 파일 | 책임 |
|---|---|
| `src/components/session/applied.js` (수정) | 순수 함수 `buildDialogueGroups(cards)` 추가 |
| `src/components/session/applied.test.js` (수정) | 위 함수 테스트 |
| `src/pages/sessionExprV2.js` (수정) | `VS_STAGE_CSS`·`VSM_STAGE_CSS` 신설, 렌더 헬퍼 `dialogueStageEl`·`sentenceNavEl`·`progressSegEl` 신설, `renderSessionExprV2` 조립부 교체. `miniDialogueEl`·`drillRows`·`explainPanel`·`utterRingCard`·`historyCalCard` 는 그대로 |
| `src/pages/sessionExprV2.test.js` (수정) | 새 구조 계약 + 기존 20개 블록 이관 |
| `src/pages/session-new.js` (수정) | `onJump`/`onNext` 뒤 스크롤, 접힌 줄 녹음 자동 시작 플래그 |
| `src/pages/session-new.test.js` (수정) | 위 두 계약 |
| `specs/study-app-spec.md` (수정) | §8-3 신규 레슨 카드 화면 기술 갱신 |
| `docs/2026-09-14-dialogue-stage-plan.md` | 이 문서 |

---

### Task 1: 대화 묶음 모델 `buildDialogueGroups`

**Files:**
- Modify: `src/components/session/applied.js` (파일 끝, `miniCueLine` 아래)
- Test: `src/components/session/applied.test.js` (파일 끝)

**Interfaces:**
- Consumes: 없음(순수 함수). `miniLinesOf` 와 같은 필터 규칙을 쓰되 import 하지 않는다 — `pronunciationLog.js` 를 의존하면 순환이 생긴다. 필터는 이 파일 안에 지역 함수로 둔다(두 벌이 되는 문제는 09-13 작업지시서 §5 에 이미 적힌 기술 부채이고 이 계획의 범위가 아니다).
- Produces:
  ```js
  buildDialogueGroups(cards) → [{
    key: string,            // 묶음 식별자 (줄 en join, 대화 없으면 'solo:' + card.id)
    hasDialogue: boolean,
    situation: string,      // 묶음 첫 카드의 explanation.situation ('' 가능)
    lines: [{ speaker, name, en, ko, kr }],   // 대화 없으면 카드에서 만든 줄 1개
    cardAt: { [lineIndex]: { card, num } },   // 줄 index → 카드 + 세션 전체 순번(1-based)
  }]
  ```

- [ ] **Step 1: Write the failing test**

`src/components/session/applied.test.js` 끝에 추가:

```js
describe('buildDialogueGroups — 대화 묶음 (2026-09-14 클로드 디자인 결정 §0-2)', () => {
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
    { speaker: 'A', name: '소연', en: 'Take your time.', ko: '천천히 와.', kr: '테이켜r 타임' },
    { speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' },
  ];
  const card = (id, sentence, extra = {}) => ({
    id, sentence, ko: '뜻', pron: '발음',
    explanation: { situation: '장면 ' + id, miniDialogue: MD, ...extra },
  });

  it('같은 대화를 쓰는 카드는 한 묶음 — 줄 index 로 카드를 찾는다', () => {
    const gs = buildDialogueGroups([card('c1', "I'm on my way."), card('c2', "I'm almost there.")]);
    expect(gs).toHaveLength(1);
    expect(gs[0].hasDialogue).toBe(true);
    expect(gs[0].lines).toHaveLength(4);
    expect(gs[0].situation).toBe('장면 c1');
    expect(gs[0].cardAt[1].card.id).toBe('c1');
    expect(gs[0].cardAt[1].num).toBe(1);
    expect(gs[0].cardAt[3].card.id).toBe('c2');
    expect(gs[0].cardAt[3].num).toBe(2);
    expect(gs[0].cardAt[0]).toBeUndefined();
  });

  it('대화가 다르면 묶음이 갈리고, 번호는 세션 전체 순번으로 이어진다', () => {
    const MD2 = [{ speaker: 'A', name: '봉수', en: 'Are you there?', ko: '있어?', kr: '아r 여 데어r' }];
    const c3 = { id: 'c3', sentence: 'Are you there?', ko: '뜻', pron: '발음',
      explanation: { situation: '장면 c3', miniDialogue: MD2 } };
    const gs = buildDialogueGroups([card('c1', "I'm on my way."), c3]);
    expect(gs).toHaveLength(2);
    expect(gs[0].cardAt[1].num).toBe(1);
    expect(gs[1].cardAt[0].num).toBe(2);
    expect(gs[1].situation).toBe('장면 c3');
  });

  it('대화가 없는 카드는 자기 혼자 한 줄 묶음 — 줄은 카드에서 만든다', () => {
    const solo = { id: 's1', sentence: 'Is that a promise?', ko: '약속하는 거예요?', pron: '이즈 대러 프라미스',
      explanation: { situation: '장면 s1' } };
    const gs = buildDialogueGroups([solo]);
    expect(gs).toHaveLength(1);
    expect(gs[0].hasDialogue).toBe(false);
    expect(gs[0].key).toBe('solo:s1');
    expect(gs[0].lines).toEqual([{ speaker: '', name: '', en: 'Is that a promise?', ko: '약속하는 거예요?', kr: '이즈 대러 프라미스' }]);
    expect(gs[0].cardAt[0].num).toBe(1);
  });

  it('혼합 세션도 같은 규칙 — 대화 묶음과 단독 묶음이 순서대로 섞인다', () => {
    const solo = { id: 's1', sentence: 'from scratch', ko: '처음부터', pron: '프럼 스크래치', explanation: {} };
    const gs = buildDialogueGroups([card('c1', "I'm on my way."), solo, card('c2', "I'm almost there.")]);
    expect(gs.map((g) => g.hasDialogue)).toEqual([true, false]);
    expect(gs[0].cardAt[1].num).toBe(1);
    expect(gs[0].cardAt[3].num).toBe(3);
    expect(gs[1].cardAt[0].num).toBe(2);
  });

  it('대화에 없는 문장을 가진 카드는 대화 묶음에 끼지 않고 단독 묶음이 된다', () => {
    const odd = { id: 'x1', sentence: 'Nothing matches.', ko: '뜻', pron: '발음',
      explanation: { situation: '장면', miniDialogue: MD } };
    const gs = buildDialogueGroups([odd]);
    expect(gs).toHaveLength(1);
    expect(gs[0].hasDialogue).toBe(false);
    expect(gs[0].lines[0].en).toBe('Nothing matches.');
  });

  it('카드가 없으면 빈 배열', () => {
    expect(buildDialogueGroups([])).toEqual([]);
    expect(buildDialogueGroups(null)).toEqual([]);
  });
});
```

같은 파일 맨 위 import 에 `buildDialogueGroups` 를 추가한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/session/applied.test.js`
Expected: FAIL — `buildDialogueGroups is not a function`

- [ ] **Step 3: Write minimal implementation**

`src/components/session/applied.js` 끝에 추가:

```js
/* 대화 묶음 (2026-09-14 클로드 디자인 결정) — 신규 세션 화면은 카드 목록이 아니라 대화 목록을 그린다.
 * 같은 대화를 쓰는 카드끼리 한 묶음(기준 = 줄 en 을 join 한 문자열). 대화가 없거나 카드 문장이
 * 그 대화에 없으면 카드 문장 한 줄짜리 단독 묶음이 된다 — 화면 어휘를 하나로 두기 위해서다
 * (옛 문장 카드로 돌아가지 않는다). 번호는 묶음과 무관하게 세션 전체 순번.
 * 줄 필터는 pronunciationLog.miniLinesOf 와 같은 규칙이지만 여기서 다시 쓴다 — 그쪽을 import 하면
 * services → components 순환이 생긴다. */
function dialogueLinesOf(md) {
  return (Array.isArray(md) ? md : []).filter((l) => l && typeof l.en === 'string' && l.en.trim());
}

export function buildDialogueGroups(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const groups = [];
  const byKey = new Map();
  list.forEach((card, i) => {
    const num = i + 1;
    const lines = dialogueLinesOf(card?.explanation?.miniDialogue);
    const target = String(card?.sentence ?? '').trim();
    const at = lines.findIndex((l) => l.en.trim() === target);
    if (at < 0) {
      // 단독 묶음 — 카드에서 줄 하나를 만든다. 화자가 없으므로 speaker·name 은 빈 문자열.
      groups.push({
        key: 'solo:' + card.id,
        hasDialogue: false,
        situation: String(card?.explanation?.situation ?? ''),
        lines: [{ speaker: '', name: '', en: target, ko: String(card?.ko ?? ''), kr: String(card?.pron ?? '') }],
        cardAt: { 0: { card, num } },
      });
      return;
    }
    const key = lines.map((l) => l.en.trim()).join('␟');
    let g = byKey.get(key);
    if (!g) {
      g = { key, hasDialogue: true, situation: String(card?.explanation?.situation ?? ''), lines, cardAt: {} };
      byKey.set(key, g);
      groups.push(g);
    }
    g.cardAt[at] = { card, num };
  });
  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/session/applied.test.js`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: Commit**

```bash
cd ~/apps && git add study/src/components/session/applied.js study/src/components/session/applied.test.js
git commit -m "feat(study): 대화 묶음 순수 함수 buildDialogueGroups — 카드 목록을 대화 단위로 접는다"
```

---

### Task 2: 대화 스테이지 렌더 `dialogueStageEl` + 스테이지 CSS

**Files:**
- Modify: `src/pages/sessionExprV2.js` — `VS_CSS` 끝(`@media (max-width:1100px)` 앞)에 `VS_STAGE_CSS` 문자열을 이어 붙이고, `VSM_CSS` 끝에 `VSM_STAGE_CSS` 를 이어 붙인다. 렌더 헬퍼는 `miniDialogueEl` 아래(약 648행)에 신설.
- Test: `src/pages/sessionExprV2.test.js` (파일 끝에 새 describe)

**Interfaces:**
- Consumes: Task 1 의 `buildDialogueGroups`. 기존 `scoreDot`·`vCheck`·`vIcon`·`VI`·`hlNode`·`normScores`·`DRILL_DOTS_MAX`·`popScore`·`speakWithFeedback`·`MINI_VOICES`.
- Produces:
  ```js
  dialogueStageEl(group, {
    lang, selCardId, expr,          // expr = 선택 카드의 핵심 표현(밑줄용)
    cueIndex,                       // 선택 줄 직전 상대 줄 index (없으면 -1)
    utterOf(cardId) → number[],     // 그 카드의 본 점수 배열
    drillProgOf(cardId) → string,   // '응용 2/6' 또는 ''
    miniScoresOf(lineIndex) → number[],
    onSelect(cardId), onCardRec(cardId), onMiniRec(lineIndex, row, btn),
    selectedSlot,                   // 선택 줄 안에 넣을 노드 배열(컨트롤 행 · 본 점수 열)
    phone,                          // true 면 폰 마크업
  }) → { el, selectedRow, listenPillHost }
  ```
  `selectedRow` 는 스크롤 대상(Task 7), `listenPillHost` 는 전체 듣기가 선택 줄 차례일 때 재생 표시 대상(Task 3)에 쓴다.

- [ ] **Step 1: Write the failing test**

`src/pages/sessionExprV2.test.js` 끝에 추가:

```js
describe('sessionExprV2 — 대화 스테이지 (2026-09-14 시안 12a)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
    { speaker: 'A', name: '소연', en: 'Take your time.', ko: '천천히 와.', kr: '테이켜r 타임' },
    { speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' },
  ];
  const mkCard = (id, sentence) => ({ id, sentence, ko: '뜻', pron: '발음',
    explanation: { situation: '새벽 공항', miniDialogue: MD, key: `${sentence} = 뜻` } });
  const group = () => buildDialogueGroups([mkCard('c1', "I'm on my way."), mkCard('c2', "I'm almost there.")])[0];
  const ctx = (over = {}) => ({
    lang: 'en', selCardId: 'c1', expr: "I'm on my way", cueIndex: 0,
    utterOf: () => [], drillProgOf: () => '', miniScoresOf: () => [],
    onSelect: vi.fn(), onCardRec: vi.fn(), onMiniRec: vi.fn(),
    selectedSlot: [document.createElement('div')], phone: false, ...over,
  });

  it('줄 4개 · 카드 줄에만 번호 · 선택 줄은 열려 있고 원 버튼이 없다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.querySelector('.vs-ln-num').textContent)).toEqual(['', '1', '', '2']);
    expect(rows[1].classList.contains('sel')).toBe(true);
    expect(rows[1].querySelectorAll('.vs-cir')).toHaveLength(0);
    expect(rows[0].querySelectorAll('.vs-cir')).toHaveLength(2);
  });

  it('세 줄 텍스트 — 영문 · [발음] · 뜻', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const row = el.querySelectorAll('.vs-ln')[0];
    expect(row.querySelector('.vs-ln-en').textContent).toBe('We landed early.');
    expect(row.querySelector('.vs-ln-kr').textContent).toBe('[위 랜디더r리]');
    expect(row.querySelector('.vs-ln-ko').textContent).toBe('일찍 내렸어.');
  });

  it('선택 줄에만 핵심 표현 밑줄이 붙는다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows[1].querySelector('.vs-ln-en b').textContent).toBe("I'm on my way");
    expect(rows[3].querySelector('.vs-ln-en b')).toBeNull();
  });

  it('선택 줄 안에 selectedSlot 이 들어간다', () => {
    const slot = document.createElement('div');
    slot.className = 'probe';
    const { el, selectedRow } = dialogueStageEl(group(), ctx({ selectedSlot: [slot] }));
    expect(selectedRow.querySelector('.probe')).toBe(slot);
    expect(el.querySelectorAll('.probe')).toHaveLength(1);
  });

  it('접힌 카드 줄: 말한 이력이 있으면 배지가 체크, 흔적 원 8개 + +N, 뜻 끝에 응용 진행', () => {
    const utter = Array.from({ length: 11 }, (_, i) => 80 + i);
    const { el } = dialogueStageEl(group(), ctx({
      utterOf: (id) => (id === 'c2' ? utter : []), drillProgOf: (id) => (id === 'c2' ? '응용 2/6' : ''),
    }));
    const row = el.querySelectorAll('.vs-ln')[3];
    expect(row.querySelector('.vs-ln-num svg')).not.toBeNull();
    expect(row.querySelectorAll('.vs-ln-trace .v-dot')).toHaveLength(8);
    expect(row.querySelector('.vs-ln-trace .more').textContent).toBe('+3');
    expect(row.querySelector('.vs-ln-ko').textContent).toBe('거의 다 왔어. · 응용 2/6');
  });

  it('선택 줄에는 흔적 줄을 그리지 않는다 (본 점수 열이 대신한다)', () => {
    const { el } = dialogueStageEl(group(), ctx({ utterOf: () => [88, 92] }));
    expect(el.querySelectorAll('.vs-ln')[1].querySelector('.vs-ln-trace')).toBeNull();
  });

  it('상대 줄 흔적은 미니 점수다', () => {
    const { el } = dialogueStageEl(group(), ctx({ miniScoresOf: (i) => (i === 2 ? [77] : []) }));
    const dots = el.querySelectorAll('.vs-ln')[2].querySelectorAll('.vs-ln-trace .v-dot');
    expect(dots).toHaveLength(1);
    expect(dots[0].textContent).toBe('77');
  });

  it('카드 줄 클릭 → onSelect, 상대 줄 클릭 → 아무 일 없음', () => {
    const c = ctx();
    const { el } = dialogueStageEl(group(), c);
    el.querySelectorAll('.vs-ln')[3].click();
    expect(c.onSelect).toHaveBeenCalledWith('c2');
    el.querySelectorAll('.vs-ln')[0].click();
    expect(c.onSelect).toHaveBeenCalledTimes(1);
  });

  it('접힌 카드 줄 녹음 원 → onCardRec, 상대 줄 녹음 원 → onMiniRec (클릭이 줄 선택으로 새지 않는다)', () => {
    const c = ctx();
    const { el } = dialogueStageEl(group(), c);
    el.querySelectorAll('.vs-ln')[3].querySelector('button[aria-label="녹음"]').click();
    expect(c.onCardRec).toHaveBeenCalledWith('c2');
    expect(c.onSelect).not.toHaveBeenCalled();
    el.querySelectorAll('.vs-ln')[0].querySelector('button[aria-label="녹음"]').click();
    expect(c.onMiniRec).toHaveBeenCalled();
    expect(c.onMiniRec.mock.calls[0][0]).toBe(0);
  });

  it('헤어라인 — 첫 줄 위 · 선택 줄 위아래에는 없다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const seps = [...el.querySelectorAll('.vs-ln-sep')].map((s) => s.classList.contains('on'));
    expect(seps).toEqual([false, false, false, true]);
  });

  it('대화 없는 묶음 — 라벨 · 장면 · 전체 듣기가 없고 줄 하나가 열려 있다', () => {
    const solo = { id: 's1', sentence: 'from scratch', ko: '처음부터', pron: '프럼 스크래치', explanation: {} };
    const g = buildDialogueGroups([solo])[0];
    const { el } = dialogueStageEl(g, ctx({ selCardId: 's1', expr: 'from scratch', cueIndex: -1 }));
    expect(el.querySelector('.vs-stage-hd')).toBeNull();
    expect(el.querySelector('[data-role="stage-all"]')).toBeNull();
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows).toHaveLength(1);
    expect(rows[0].classList.contains('sel')).toBe(true);
    expect(rows[0].querySelector('.vs-ln-name').textContent).toBe('');
  });

  it('대화 있는 묶음은 라벨 · 장면 · 전체 듣기를 갖는다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    expect(el.querySelector('.vs-stage-hd .vs-lab').textContent).toBe('오늘의 대화');
    expect(el.querySelector('.vs-stage-scene').textContent).toBe('새벽 공항');
    expect(el.querySelector('[data-role="stage-all"]')).not.toBeNull();
  });
});
```

파일 위 import 에 `dialogueStageEl` 을 추가하고, `buildDialogueGroups` 를 `../components/session/applied.js` 에서 가져온다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '대화 스테이지'`
Expected: FAIL — `dialogueStageEl is not a function`

- [ ] **Step 3: Write the CSS**

`VS_CSS` 의 `@media (max-width:1100px)` 줄 **앞**에 삽입:

```css
/* ── 대화 스테이지 (2026-09-14 시안 12a) — 대화가 곧 연습 화면. 줄 하나가 열려 문장 카드를 대신한다. ── */
.vs-stage + .vs-stage{margin-top:26px}
.vs-stage-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.vs-stage-scene{font-size:13px;line-height:1.55;color:#4a5450;margin-top:6px;text-wrap:pretty}
.vs-stage-all{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border:1.5px solid transparent;border-radius:999px;padding:7px 14px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.vs-stage-all.playing{color:var(--blue-deep);background:var(--blue-soft);border-color:var(--blue-line)}
.vs-stage-lines{margin-top:16px;display:flex;flex-direction:column}
.vs-ln-sep{height:1px;background:transparent;margin:0 14px}
.vs-ln-sep.on{background:var(--line)}
.vs-ln{display:flex;flex-direction:column;border-radius:16px;border:1px solid transparent;padding:9px 14px}
.vs-ln.card{cursor:pointer}
.vs-ln.playing{background:var(--blue-soft)}
.vs-ln.sel{background:var(--card);border-color:var(--line);box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.18);animation:v-settle .5s both}
.vs-ln-top{display:flex;align-items:center;gap:12px}
.vs-ln-num{width:20px;height:20px;border-radius:50%;border:1.5px solid transparent;font-family:Outfit;font-size:10.5px;font-weight:800;display:grid;place-items:center;flex:0 0 auto;color:transparent}
.vs-ln-num.card{border-color:var(--teal-line);color:var(--teal-deep)}
.vs-ln-num.done{border-color:var(--teal-soft);background:var(--teal-soft);color:var(--teal-deep)}
.vs-ln-num.on{border-color:var(--teal);background:var(--teal);color:#fff;animation:v-haloT 2.4s ease-in-out infinite}
.vs-ln-name{font-family:Outfit;font-size:12px;font-weight:700;width:34px;flex:0 0 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--mut)}
.vs-ln-name.me{color:var(--teal-deep)}
.vs-ln-body{min-width:0;flex:1 1 auto}
.vs-ln-en{font-size:17px;font-weight:600;color:#4a5450;letter-spacing:-.005em;line-height:1.4}
.vs-ln-en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2.5px no-repeat;padding-bottom:2px}
.vs-ln.card .vs-ln-en,.vs-ln.cue .vs-ln-en{color:var(--ink)}
.vs-ln.card .vs-ln-en{font-weight:700}
.vs-ln.sel .vs-ln-en{font-size:20px;font-weight:800;color:var(--teal-deep)}
.vs-ln-kr{font-size:11.5px;font-weight:500;line-height:1.45;color:var(--teal-deep);margin-top:3px;letter-spacing:.01em}
.vs-ln-kr i{font-style:normal;color:var(--faint);font-weight:400}
.vs-ln-ko{font-size:13px;color:#4a5450;margin-top:4px;line-height:1.45}
.vs-ln-ko em{font-style:normal;color:var(--faint)}
.vs-ln-trace{display:flex;align-items:center;gap:5px;margin-top:7px;flex-wrap:wrap}
.vs-ln-trace .more{font-family:Outfit;font-size:11px;font-weight:600;color:var(--faint)}
.vs-ln-slot{padding-left:66px}
```

`VSM_CSS` 끝(`${V_DOT_CSS}${V_MINICAL_CSS}` 앞)에 삽입:

```css
/* 대화 스테이지 — 폰 (시안 12a 폰 390) */
.vs-stage + .vs-stage{margin-top:20px}
.vs-stage-hd{display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:10px}
.vs-stage-hdr{display:flex;align-items:center;gap:8px}
.vs-stage-scene{font-size:12.5px;line-height:1.55;color:#4a5450;margin:6px 2px 0;text-wrap:pretty}
.vs-stage-fold{font:inherit;font-size:12px;font-weight:600;color:var(--faint);background:none;border:0;padding:6px 2px;cursor:pointer;white-space:nowrap}
.vs-stage-all{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border:1.5px solid transparent;border-radius:999px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.vs-stage-all.playing{color:var(--blue-deep);background:var(--blue-soft);border-color:var(--blue-line)}
.vs-stage-lines{margin-top:10px;display:flex;flex-direction:column}
.vs-ln-sep{height:1px;background:transparent;margin:0 4px}
.vs-ln-sep.on{background:var(--line)}
.vs-ln{display:flex;flex-direction:column;border-radius:14px;border:1px solid transparent;padding:9px 10px;margin:0 -6px}
.vs-ln.card{cursor:pointer}
.vs-ln.playing{background:var(--blue-soft)}
.vs-ln.sel{background:var(--card);border-color:var(--line);box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.18);animation:v-settle .5s both}
.vs-ln-top{display:flex;align-items:center;gap:9px}
.vs-ln-num{width:20px;height:20px;border-radius:50%;border:1.5px solid transparent;font-family:Outfit;font-size:10.5px;font-weight:800;display:grid;place-items:center;flex:0 0 auto;color:transparent}
.vs-ln-num.card{border-color:var(--teal-line);color:var(--teal-deep)}
.vs-ln-num.done{border-color:var(--teal-soft);background:var(--teal-soft);color:var(--teal-deep)}
.vs-ln-num.on{border-color:var(--teal);background:var(--teal);color:#fff;animation:v-haloT 2.4s ease-in-out infinite}
.vs-ln-body{min-width:0;flex:1 1 auto}
.vs-ln-name{font-family:Outfit;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--mut);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vs-ln-name.me{color:var(--teal-deep)}
.vs-ln-name:empty{display:none}
.vs-ln-en{font-size:15px;font-weight:600;color:#4a5450;letter-spacing:-.005em;line-height:1.35}
.vs-ln-en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2px no-repeat;padding-bottom:2px}
.vs-ln.card .vs-ln-en,.vs-ln.cue .vs-ln-en{color:var(--ink)}
.vs-ln.card .vs-ln-en{font-weight:700}
.vs-ln.sel .vs-ln-en{font-size:17px;font-weight:800;color:var(--teal-deep)}
.vs-ln-kr{font-size:11px;font-weight:500;line-height:1.45;color:var(--teal-deep);margin-top:3px;letter-spacing:.01em}
.vs-ln-kr i{font-style:normal;color:var(--faint);font-weight:400}
.vs-ln-ko{font-size:12.5px;color:#4a5450;margin-top:4px;line-height:1.45}
.vs-ln-ko em{font-style:normal;color:var(--faint)}
.vs-ln-trace{display:flex;align-items:center;gap:5px;margin-top:7px;flex-wrap:wrap}
.vs-ln-trace .more{font-family:Outfit;font-size:11px;font-weight:600;color:var(--faint)}
.vs-ln-slot{padding-left:0}
.vs-ln .vs-cir{width:32px;height:32px}
```

- [ ] **Step 4: Write the renderer**

`miniDialogueEl` 아래에 추가:

```js
/* ── 대화 스테이지 (2026-09-14 시안 12a) ──
 * 묶음 하나(대화 1편 또는 단독 카드 1줄)를 그린다. 선택 줄은 그 자리에서 열려 조립부가 만든
 * 컨트롤(듣기·따라 말하기 필 · 링 · 본 점수 열)을 selectedSlot 으로 받는다 — 녹음·채점 배선은
 * 종전 그대로 조립부에 남는다(외과적 변경).
 * 흔적 줄: 시도마다 26px 원 하나, 최근 8개 + 넘치면 +N. 선택 줄에는 그리지 않는다(.vs-meta 가 대신).
 */
function traceRow(scores) {
  const all = normScores(scores);
  if (!all.length) return null;
  const shown = all.slice(-DRILL_DOTS_MAX);
  const row = h('div', { class: 'vs-ln-trace' }, shown.map((v) => scoreDot(v, { size: 26, fresh: false })));
  if (all.length > DRILL_DOTS_MAX) row.appendChild(h('span', { class: 'more' }, `+${all.length - DRILL_DOTS_MAX}`));
  return row;
}

export function dialogueStageEl(group, ctx = {}) {
  const { lang = 'en', selCardId, expr, cueIndex = -1, phone = false } = ctx;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const voiceOf = (sp) => MINI_VOICES[String(sp ?? '').trim().toUpperCase()] || MINI_VOICES.A;
  const lines = group.lines;
  const selLineIdx = lines.findIndex((_, i) => group.cardAt[i]?.card?.id === selCardId);
  const rows = [];
  let selectedRow = null, listenPillHost = null;

  const body = h('div', { class: 'vs-stage-lines' });
  lines.forEach((ln, i) => {
    const hit = group.cardAt[i];
    const card = hit?.card || null;
    const selected = !!card && card.id === selCardId;
    const utter = card ? normScores(ctx.utterOf?.(card.id)) : [];
    const done = !!card && !selected && utter.length > 0;
    const prog = card && !selected ? String(ctx.drillProgOf?.(card.id) || '') : '';

    // 헤어라인 — 첫 줄 위 · 선택 줄 위 · 선택 줄 바로 다음 줄 위에는 없다(카드 테두리가 경계).
    const sepOn = !(i === 0 || selected || i - 1 === selLineIdx);
    body.appendChild(h('div', { class: 'vs-ln-sep' + (sepOn ? ' on' : '') }));

    const num = h('span', { class: 'vs-ln-num' + (selected ? ' on' : done ? ' done' : card ? ' card' : '') },
      done ? vCheck({ size: 11, sw: 3 }) : (card ? String(hit.num) : ''));
    const gio = String(ln.speaker ?? '').trim().toUpperCase() === 'B';
    const name = h('span', { class: 'vs-ln-name' + (gio ? ' me' : '') }, String(ln.name || ''));
    const enEl = h('div', { class: 'vs-ln-en' }, selected ? hlNode(ln.en, expr) : document.createTextNode(ln.en));
    const textBlock = h('div', { class: 'vs-ln-body' },
      phone ? name : null,
      enEl,
      ln.kr ? h('div', { class: 'vs-ln-kr' }, h('i', {}, '['), ln.kr, h('i', {}, ']')) : null,
      h('div', { class: 'vs-ln-ko' }, ln.ko || '', prog ? h('em', {}, ' · ' + prog) : null),
      selected ? null : traceRow(card ? utter : ctx.miniScoresOf?.(i)));

    const top = h('div', { class: 'vs-ln-top' }, num, phone ? null : name, textBlock);
    const row = h('div', { class: 'vs-ln' + (selected ? ' sel' : card ? ' card' : '') + (i === cueIndex ? ' cue' : '') }, top);

    if (!selected) {
      const play = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
      play.addEventListener('click', (e) => {
        e.stopPropagation();
        speakWithFeedback(play, ln.en, { lang: ttsLang, voice: voiceOf(ln.speaker), rate: 1.0 });
      });
      const rec = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
      rec.addEventListener('click', (e) => {
        e.stopPropagation();
        if (card) ctx.onCardRec?.(card.id);
        else ctx.onMiniRec?.(i, row, rec);
      });
      top.append(play, rec);
      rows.push({ i, line: ln, btn: play });
    } else {
      selectedRow = row;
      row.appendChild(h('div', { class: 'vs-ln-slot' }, ctx.selectedSlot || null));
      rows.push({ i, line: ln, btn: null });
    }
    if (card) row.addEventListener('click', () => ctx.onSelect?.(card.id));
    body.appendChild(row);
  });

  const el = h('div', { class: 'vs-stage' });
  if (group.hasDialogue) {
    const allBtn = h('button', { class: 'vs-stage-all', type: 'button', 'data-role': 'stage-all' },
      vIcon(VI.PLAY, { size: 11, fill: true }), '전체 듣기');
    el.appendChild(h('div', { class: 'vs-stage-hd' },
      phone
        ? h('span', { class: 'vs-lab' }, '오늘의 대화')
        : h('div', {}, h('span', { class: 'vs-lab' }, '오늘의 대화'),
            group.situation ? h('div', { class: 'vs-stage-scene' }, group.situation) : null),
      phone ? h('div', { class: 'vs-stage-hdr' }, allBtn) : allBtn));
    if (phone && group.situation) el.appendChild(h('div', { class: 'vs-stage-scene' }, group.situation));
  }
  el.appendChild(body);
  return { el, selectedRow, rows, listenPillHost };
}
```

`listenPillHost` 는 Task 3 에서 채운다(지금은 `null` 로 반환).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '대화 스테이지'`
Expected: PASS (13개)

- [ ] **Step 6: Commit**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.js study/src/pages/sessionExprV2.test.js
git commit -m "feat(study): 대화 스테이지 렌더러 dialogueStageEl + 스테이지 CSS (시안 12a)"
```

---

### Task 3: 전체 듣기 체인 · 선택 줄 듣기 음성

**Files:**
- Modify: `src/pages/sessionExprV2.js` — `dialogueStageEl` 안(전체 듣기 버튼 배선, `listenPillHost`)
- Test: `src/pages/sessionExprV2.test.js` (같은 describe 에 추가)

**Interfaces:**
- Consumes: Task 2 의 `dialogueStageEl` 반환값 `rows`.
- Produces: `ctx.selectedPlayBtn` 를 받아 선택 줄 차례에 그 버튼으로 `speakWithFeedback` 을 부른다. 조립부는 `listenPill` 을 넘긴다(Task 5·6).

- [ ] **Step 1: Write the failing test**

```js
  it('전체 듣기 — 줄 순서대로, 화자 성별 목소리 · rate 1.0, 선택 줄은 듣기 필이 재생 표시를 받는다', () => {
    const speak = vi.fn((_t, o) => o?.onEnd?.());
    window.studySpeech = { speak, cancel: vi.fn() };
    const pill = h('button', { class: 'vs-pill', type: 'button' }, vIcon(VI.PLAY, { size: 12, fill: true }), '듣기');
    const { el } = dialogueStageEl(group(), ctx({ selectedPlayBtn: pill }));
    el.querySelector('[data-role="stage-all"]').click();
    expect(speak).toHaveBeenCalledTimes(4);
    expect(speak.mock.calls.map((c) => c[0])).toEqual(
      ['We landed early.', "I'm on my way.", 'Take your time.', "I'm almost there."]);
    expect(speak.mock.calls.map((c) => c[1].voice)).toEqual(
      [MINI_VOICES.A, MINI_VOICES.B, MINI_VOICES.A, MINI_VOICES.B]);
    expect(speak.mock.calls.every((c) => c[1].rate === 1.0)).toBe(true);
  });

  it('전체 듣기 중 다시 누르면 중단한다', () => {
    const cancel = vi.fn();
    window.studySpeech = { speak: vi.fn(), cancel };  // onEnd 를 안 부르므로 재생 중에 머문다
    const { el } = dialogueStageEl(group(), ctx());
    const btn = el.querySelector('[data-role="stage-all"]');
    btn.click();
    expect(btn.classList.contains('playing')).toBe(true);
    expect(btn.textContent).toBe('재생 중');
    btn.click();
    expect(cancel).toHaveBeenCalled();
    expect(btn.classList.contains('playing')).toBe(false);
    expect(btn.textContent).toBe('전체 듣기');
  });

  it('재생 중인 줄에 블루 배경이 붙고 다음 줄로 넘어가면 빠진다', () => {
    let chain = null;
    window.studySpeech = { speak: vi.fn((_t, o) => { chain = o?.onEnd; }), cancel: vi.fn() };
    const { el } = dialogueStageEl(group(), ctx());
    el.querySelector('[data-role="stage-all"]').click();
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows[0].classList.contains('playing')).toBe(true);
    chain();
    expect(rows[0].classList.contains('playing')).toBe(false);
    expect(rows[1].classList.contains('playing')).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '전체 듣기'`
Expected: FAIL — 전체 듣기 버튼에 리스너가 없어 `speak` 가 0회

- [ ] **Step 3: Implement**

`dialogueStageEl` 안, `allBtn` 을 만든 직후에 배선을 추가한다. `rows` 는 이미 만들어져 있으므로 `el.appendChild(body)` 앞에 둔다:

```js
    /* 전체 듣기 — 줄마다 onEnd 체인. 재생 중인 줄은 블루 소프트(dialogueV2 .vd-line.playing 어휘).
     * 선택 줄에는 원 버튼이 없으므로 조립부가 넘긴 듣기 필(selectedPlayBtn)이 재생 표시를 받는다
     * (2026-09-14 클로드 디자인 결정 §0-4). speakWithFeedback 은 버튼이 없으면 재생 자체를 건너뛴다. */
    let playing = -1;
    const paintPlaying = (k) => {
      const prev = body.querySelector('.vs-ln.playing');
      if (prev) prev.classList.remove('playing');
      const next = k >= 0 ? body.querySelectorAll('.vs-ln')[k] : null;
      if (next) next.classList.add('playing');
    };
    const stopAll = () => {
      playing = -1;
      paintPlaying(-1);
      allBtn.classList.remove('playing');
      allBtn.lastChild.textContent = '전체 듣기';
    };
    allBtn.addEventListener('click', () => {
      if (playing >= 0) { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } stopAll(); return; }
      allBtn.classList.add('playing');
      allBtn.lastChild.textContent = '재생 중';
      const step = (k) => {
        if (playing < 0) return;            // 중단됨
        if (k >= rows.length) { stopAll(); return; }
        playing = k;
        paintPlaying(k);
        const r = rows[k];
        const btn = r.btn || ctx.selectedPlayBtn;
        speakWithFeedback(btn, r.line.en, {
          lang: ttsLang, voice: voiceOf(r.line.speaker), rate: 1.0, onEnd: () => step(k + 1),
        });
      };
      playing = 0;
      step(0);
    });
```

`listenPillHost` 반환값은 쓰지 않게 됐으므로 반환 객체에서 뺀다(`{ el, selectedRow, rows }`). Task 2 의 테스트에는 `listenPillHost` 를 쓰는 단언이 없다.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '대화 스테이지'`
Expected: PASS (16개)

- [ ] **Step 5: Commit**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.js study/src/pages/sessionExprV2.test.js
git commit -m "feat(study): 대화 전체 듣기 체인 — 선택 줄은 듣기 필이 재생 표시를 받는다"
```

---

### Task 4: 좌측 문장 목록 `sentenceNavEl` · 클릭 세그먼트 `progressSegEl`

**Files:**
- Modify: `src/pages/sessionExprV2.js` (`dialogueStageEl` 아래)
- Test: `src/pages/sessionExprV2.test.js` (새 describe)

**Interfaces:**
- Produces:
  ```js
  progressSegEl(total, idx, onJump) → HTMLElement        // idx = 1-based 현재
  sentenceNavEl(cards, { selCardId, utterOf, drillProgOf, onSelect }) → HTMLElement
  ```

- [ ] **Step 1: Write the failing test**

```js
describe('sessionExprV2 — 좌측 문장 목록 · 클릭 세그먼트 (시안 12a)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('세그먼트바 — 칸 수는 카드 수, 현재까지 채움, 클릭하면 그 번호로 이동', () => {
    const onJump = vi.fn();
    const el = progressSegEl(4, 2, onJump);
    const bars = [...el.querySelectorAll('span')];
    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.querySelector('i').classList.contains('f'))).toEqual([true, true, false, false]);
    expect(bars[3].getAttribute('title')).toBe('4번 표현으로 이동');
    bars[3].click();
    expect(onJump).toHaveBeenCalledWith(4);
  });

  it('문장 목록 — 현재 항목은 번호 채움, 말한 항목은 체크 + 진행 + 마지막 점수 원', () => {
    const cards = [
      { id: 'c1', sentence: "I'm on my way.", ko: '가는 중이야.' },
      { id: 'c2', sentence: "I'm almost there.", ko: '거의 다 왔어.' },
    ];
    const onSelect = vi.fn();
    const el = sentenceNavEl(cards, {
      selCardId: 'c2',
      utterOf: (id) => (id === 'c1' ? [88, 92] : []),
      drillProgOf: (id) => (id === 'c1' ? '응용 2/6' : ''),
      onSelect,
    });
    const items = [...el.querySelectorAll('.vs-nav-it')];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.vs-nav-num svg')).not.toBeNull();
    expect(items[0].querySelector('.vs-nav-prog').textContent).toBe('말하기 2회 · 응용 2/6');
    expect(items[0].querySelector('.v-dot').textContent).toBe('92');
    expect(items[1].classList.contains('on')).toBe(true);
    expect(items[1].querySelector('.vs-nav-num').textContent).toBe('2');
    expect(items[1].querySelector('.vs-nav-prog')).toBeNull();
    items[0].click();
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('목록 배지에는 헤일로 애니를 붙이지 않는다 (움직이는 표식은 대화 줄 배지 하나)', () => {
    const el = sentenceNavEl([{ id: 'c1', sentence: 'x', ko: '뜻' }], { selCardId: 'c1', utterOf: () => [], drillProgOf: () => '', onSelect: () => {} });
    expect(el.querySelector('.vs-nav-num').className).not.toContain('halo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '좌측 문장 목록'`
Expected: FAIL — `progressSegEl is not a function`

- [ ] **Step 3: Implement**

CSS 를 `VS_STAGE_CSS` 에 이어 붙인다:

```css
/* 좌측 사이드바 — 문장 목록 · 세그먼트바 (시안 12a) */
.vs-lside{width:250px;box-sizing:border-box;flex:0 0 auto;border-right:1px solid var(--line);padding:22px 18px 20px;display:flex;flex-direction:column;gap:18px}
.vs-lside .hmrow{display:flex;align-items:center;justify-content:space-between}
.vs-lside .hm{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0;padding:0;cursor:pointer}
.vs-lside .tm{font-family:Outfit;font-size:11px;color:var(--faint);letter-spacing:.08em;white-space:nowrap}
.vs-lside .cnt{font-family:Outfit;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1;color:var(--teal-deep);margin-top:8px}
.vs-lside .cnt em{font-style:normal;color:var(--faint);font-weight:400}
.vs-lside .sp{flex:1}
.vs-lside .endbtn{font:inherit;font-size:12px;color:var(--faint);background:none;border:0;padding:0;cursor:pointer;align-self:flex-start;white-space:nowrap}
.vs-seg{display:flex;gap:5px;margin-top:12px}
.vs-seg > span{flex:1;display:flex;align-items:center;padding:6px 0;margin:-6px 0;cursor:pointer}
.vs-seg i{width:100%;height:4px;border-radius:2px;background:#e7e3d4;transition:background .2s}
.vs-seg i.f{background:var(--teal)}
.vs-nav{display:flex;flex-direction:column;gap:2px;margin:0 -8px}
.vs-nav-it{display:flex;gap:10px;align-items:flex-start;text-align:left;padding:10px;border-radius:12px;background:transparent;border:0;width:100%;cursor:pointer;color:inherit;font:inherit}
.vs-nav-it.on{background:var(--teal-soft)}
.vs-nav-num{width:20px;height:20px;border-radius:50%;border:1.5px solid #d5d1c2;font-family:Outfit;font-size:10.5px;font-weight:800;display:grid;place-items:center;flex:0 0 auto;margin-top:1px;color:var(--faint)}
.vs-nav-num.done{border-color:var(--teal-soft);background:var(--teal-soft);color:var(--teal-deep)}
.vs-nav-num.on{border-color:var(--teal);background:var(--teal);color:#fff}
.vs-nav-tx{min-width:0;flex:1 1 auto}
.vs-nav-en{display:block;font-size:13.5px;font-weight:700;letter-spacing:-.01em;line-height:1.35;color:var(--ink)}
.vs-nav-it.on .vs-nav-en{color:var(--teal-deep)}
.vs-nav-it.done .vs-nav-en{color:var(--mut)}
.vs-nav-ko{display:block;font-size:11.5px;color:var(--faint);margin-top:2px}
.vs-nav-prog{display:block;font-family:Outfit;font-size:10.5px;font-weight:600;color:var(--teal-deep);margin-top:4px}
```

렌더 헬퍼:

```js
/* 진행 세그먼트바 — 클릭으로 카드 이동 (사용자 2026-09-13 요구, 구 makeProgress onStepClick 과 같은 계약). */
export function progressSegEl(total, idx, onJump) {
  return h('div', { class: 'vs-seg' }, Array.from({ length: total }, (_, i) => h('span', {
    role: 'button', title: `${i + 1}번 표현으로 이동`, onClick: () => onJump?.(i + 1),
  }, h('i', { class: i < idx ? 'f' : '' }))));
}

/* 좌측 문장 목록 — 카드마다 영문·뜻·진행·마지막 점수. 헤일로는 붙이지 않는다(움직이는 표식은 대화 줄 배지 하나). */
export function sentenceNavEl(cards, { selCardId, utterOf, drillProgOf, onSelect } = {}) {
  return h('div', { class: 'vs-nav' }, (cards || []).map((c, i) => {
    const utter = normScores(utterOf?.(c.id));
    const cur = c.id === selCardId;
    const done = !cur && utter.length > 0;
    const prog = [utter.length ? `말하기 ${utter.length}회` : '', cur ? '' : String(drillProgOf?.(c.id) || '')]
      .filter(Boolean).join(' · ');
    const last = utter.length ? utter[utter.length - 1] : null;
    return h('button', {
      class: 'vs-nav-it' + (cur ? ' on' : done ? ' done' : ''), type: 'button', onClick: () => onSelect?.(c.id),
    },
      h('span', { class: 'vs-nav-num' + (cur ? ' on' : done ? ' done' : '') },
        done ? vCheck({ size: 11, sw: 3 }) : String(i + 1)),
      h('span', { class: 'vs-nav-tx' },
        h('span', { class: 'vs-nav-en' }, c.sentence || ''),
        h('span', { class: 'vs-nav-ko' }, c.ko || ''),
        cur || !prog ? null : h('span', { class: 'vs-nav-prog' }, prog)),
      last == null ? null : scoreDot(last, { size: 24, fresh: false }));
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '좌측 문장 목록'`
Expected: PASS (3개)

- [ ] **Step 5: Commit**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.js study/src/pages/sessionExprV2.test.js
git commit -m "feat(study): 좌측 문장 목록 sentenceNavEl + 클릭 세그먼트 progressSegEl"
```

---

### Task 5: 데스크톱 조립 교체

**Files:**
- Modify: `src/pages/sessionExprV2.js:1205-1250`(`renderSessionExprV2` 의 데스크톱 분기와 그 앞 조립부)
- Test: `src/pages/sessionExprV2.test.js` (새 describe)

**Interfaces:**
- Consumes: Task 1~4 전부. 기존 `ctrl`(listenPill·recPill·ringHost) · `meta`(dotsEl·totEl) · `drillsBlock` · `foldPanel` · `nextBtn` · `recWidget` · `histCard`.
- Produces: `.vs-lside` / `.vs-stagewrap` / `.vs-side`(400px) 3칼럼. `.vs-card`·`.vs-rail`·`.vs-crumb`·`.vs-scene` 제거.

- [ ] **Step 1: Write the failing test**

```js
describe('sessionExprV2 — 데스크톱 3칼럼 조립 (시안 12a)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
  ];
  function st() {
    const s = makeState();
    s.cards = [
      { id: 'c1', lang: 'en', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '아이몬 마이 웨이',
        explanation: { key: "I'm on my way = 가는 중이야.", situation: '새벽 공항', miniDialogue: MD, drills: [] } },
    ];
    s.sentence = s.cards[0];
    s.step = 1;
    return s;
  }
  const mount = (state, handlers = {}) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, handlers); return host;
  };

  it('문장 카드와 좌측 레일이 사라지고 3칼럼이 된다', () => {
    const host = mount(st());
    expect(host.querySelector('.vs-card')).toBeNull();
    expect(host.querySelector('.vs-rail')).toBeNull();
    expect(host.querySelector('.vs-lside')).not.toBeNull();
    expect(host.querySelector('.vs-stage')).not.toBeNull();
    expect(host.querySelector('.vs-side')).not.toBeNull();
  });

  it('듣기 · 따라 말하기 필과 링 · 본 점수 열이 선택 줄 안에 있다', () => {
    const host = mount(st());
    const sel = host.querySelector('.vs-ln.sel');
    expect(sel.querySelectorAll('.vs-pill')).toHaveLength(2);
    expect(sel.querySelector('.vs-meta')).not.toBeNull();
    expect(host.querySelectorAll('.vs-pill')).toHaveLength(2);
  });

  it('좌측에 진행 N/총 · 세그먼트 · 문장 목록 · 오늘 발화(96) · 공부 이력 · 세션 종료가 있다', () => {
    const onEnd = vi.fn();
    const host = mount(st(), { onEnd });
    const side = host.querySelector('.vs-lside');
    expect(side.querySelector('.cnt').textContent).toBe('1/1');
    expect(side.querySelector('.vs-seg')).not.toBeNull();
    expect(side.querySelector('.vs-nav')).not.toBeNull();
    expect(side.querySelector('.vs-uring').style.width).toBe('96px');
    expect(side.querySelector('.vs-hist')).not.toBeNull();
    side.querySelector('.endbtn').click();
    expect(onEnd).toHaveBeenCalled();
  });

  it('우측 패널은 응용 · 해설 · 다음 표현 순서이고 응용 라벨 아래 표현이 온다', () => {
    const s = st();
    s.cards[0].explanation.drills = [{ en: "I'm on my way to the airport.", ko: '공항 가는 중이야.', kr: '아이몬 마이 웨이 터 디 에어r포어r트' }];
    s.sentence = s.cards[0];
    const host = mount(s);
    const right = host.querySelector('.vs-side');
    expect([...right.children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-drills', 'vs-panel', 'vs-next']);
    expect(right.querySelector('.vs-drills-expr').textContent).toBe("I'm on my way");
  });

  it('본 점수 열은 최근 10개까지 (흔적 줄 8개와 다르다)', () => {
    const s = st();
    s.exLog = { c1: { utter: Array.from({ length: 12 }, (_, i) => 80 + i) } };
    const host = mount(s);
    expect(host.querySelectorAll('.vs-meta .v-dot')).toHaveLength(10);
  });

  it('선택 줄 듣기 필은 화자 목소리 · rate 1.0 으로 읽는다', () => {
    const speak = vi.fn();
    window.studySpeech = { speak, cancel: vi.fn() };
    const host = mount(st());
    host.querySelector('.vs-ln.sel .vs-pill').click();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][1].voice).toBe(MINI_VOICES.B);
    expect(speak.mock.calls[0][1].rate).toBe(1.0);
  });

  it('대화 없는 카드는 단독 줄이 열리고 듣기 필이 기존 화자 순환 규칙을 쓴다', () => {
    const speak = vi.fn();
    window.studySpeech = { speak, cancel: vi.fn() };
    const s = st();
    delete s.cards[0].explanation.miniDialogue;
    s.sentence = s.cards[0];
    const host = mount(s);
    expect(host.querySelector('.vs-stage-hd')).toBeNull();
    expect(host.querySelectorAll('.vs-ln')).toHaveLength(1);
    host.querySelector('.vs-ln.sel .vs-pill').click();
    expect(speak.mock.calls[0][1].rate).toBeUndefined();
    expect(speak.mock.calls[0][1].voice).toBe('en-US-AvaMultilingualNeural');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '데스크톱 3칼럼'`
Expected: FAIL — `.vs-card` 가 여전히 있다

- [ ] **Step 3: Implement**

(a) 조립부 상단에서 묶음과 스테이지 컨텍스트를 만든다. `const cardEl = h('div', { class: 'vs-card' }, ...)` 블록(약 1189행)을 **삭제**하고 그 자리에 다음을 넣는다:

```js
  // ── 대화 스테이지 (2026-09-14) — 카드 목록을 대화 묶음으로 접고, 선택 줄에 컨트롤을 주입한다.
  const groups = buildDialogueGroups(exprCards);
  const utterOf = (cardId) => normScores(state.exLog?.[cardId]?.utter);
  const drillProgOf = (cardId) => {
    const card = exprCards.find((c) => c.id === cardId);
    const ds = filterNearDupDrills(card?.sentence, card?.explanation?.drills, { keepTail: isPersonalCard(cardId) });
    if (!ds.length) return '';
    const done = Object.keys(state.exLog?.[cardId]?.drills || {}).length;
    return done ? `응용 ${Math.min(done, ds.length)}/${ds.length}` : '';
  };
  const selGroupIdx = groups.findIndex((g) => Object.values(g.cardAt).some((x) => x.card.id === s?.id));
  const selGroup = groups[selGroupIdx] || null;
  const selLineIdx = selGroup ? Number(Object.keys(selGroup.cardAt).find((k) => selGroup.cardAt[k].card.id === s?.id)) : -1;
  const isSoloCard = !selGroup?.hasDialogue;
  const selLine = selGroup?.lines?.[selLineIdx] || null;
  const stages = groups.map((g, gi) => dialogueStageEl(g, {
    lang, selCardId: s?.id, expr, phone: state.size !== 'desktop',
    cueIndex: gi === selGroupIdx ? selLineIdx - 1 : -1,
    utterOf, drillProgOf,
    miniScoresOf: (i) => (gi === selGroupIdx ? normScores(cardEx.mini?.[i]) : []),
    onSelect: (cardId) => jumpToCard(cardId),
    onCardRec: (cardId) => { state.autoRec = cardId; jumpToCard(cardId); },
    onMiniRec: (i, row, btn) => miniRec(i, row, btn),
    selectedSlot: gi === selGroupIdx ? [ctrl, meta] : null,
    selectedPlayBtn: gi === selGroupIdx ? listenPill : null,
  }));
  const stageWrap = h('div', { class: 'vs-stagewrap' }, stages.map((x) => x.el));
  const selectedRow = stages[selGroupIdx]?.selectedRow || null;
  function jumpToCard(cardId) {
    const i = state.cards.findIndex((c) => c.id === cardId);
    if (i >= 0) handlers.onJump?.(i + 1);
  }
```

(b) 듣기 필의 음성 규칙(§0-5). `listenPill` 클릭 핸들러의 화자 선택 블록을 다음으로 바꾼다:

```js
    /* 대화 줄이 된 선택 줄은 대화 규칙으로 읽는다 — 화자 성별 고정 · rate 1.0 (2026-09-14 클로드 디자인 결정 §0-5).
     * 대화가 없는 카드의 단독 줄은 화자가 없으므로 기존 문장 카드 규칙(화자 순환 · 기본 속도)을 유지한다. */
    if (!isSoloCard && selLine) {
      const voice = MINI_VOICES[String(selLine.speaker ?? '').trim().toUpperCase()] || MINI_VOICES.A;
      window.studySpeech.speak(s.sentence, { lang: ttsLang, voice, rate: 1.0, onEnd: stopPlaying });
    } else if (lang === 'ja' && s?.speaker) {
      window.studySpeech.speak(s.sentence, { lang: ttsLang, speaker: s.speaker, onEnd: stopPlaying });
    } else {
      const voice = pool[mainPlays % pool.length];
      mainPlays += 1;
      window.studySpeech.speak(s.sentence, { lang: ttsLang, voice, onEnd: stopPlaying });
    }
```

(c) 미니 줄 녹음을 조립부로 옮긴다. 기존 `miniEl` 생성(약 1200행)을 지우고 `onMiniScore` 는 그대로 둔 뒤, 그 아래에 추가:

```js
  /* 상대 줄 녹음 — 기존 miniDialogueEl 의 경로를 그대로 쓴다(#mini#, cardEx.mini). 미니대화 블록 자체는
   * 복습(sessionReviewV2)이 계속 쓰므로 컴포넌트를 남겨 두고, 신규 화면에서는 스테이지가 부른다. */
  let miniCtrl = null, miniRow = null;
  async function finishMini(i, row, btn) {
    if (!(miniCtrl && miniRow === row)) return;
    const ctrlM = miniCtrl; miniCtrl = null; miniRow = null;
    row.classList.remove('recing'); btn.classList.remove('recing');
    const target = miniLines[i]?.en || '';
    const result = await stopAndAnalyze(ctrlM, target, { lang }, { enableMiscue: true });
    if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
    const judged = judgeRecording(result, target);
    if (!judged.record) { showRecordToast(recordGateMessage(judged.reason)); return; }
    onMiniScore(i, scoreForDisplay(result, target, lang));
    handlers.rerender?.();
  }
  async function miniRec(i, row, btn) {
    if (state.demo) {
      if (row.classList.contains('recing')) return;
      row.classList.add('recing'); btn.classList.add('recing');
      setTimeout(() => {
        row.classList.remove('recing'); btn.classList.remove('recing');
        onMiniScore(i, { score: Math.min(84 + i * 4, 99), weakPhonemes: ['ð'] });
        handlers.rerender?.();
      }, 800);
      return;
    }
    if (miniCtrl && miniRow === row) { finishMini(i, row, btn); return; }
    const target = miniLines[i]?.en || '';
    const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: target, card: { lang } }, onAutoStop: () => finishMini(i, row, btn) });
    if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
    miniCtrl = r.controller; miniRow = row;
    row.classList.add('recing'); btn.classList.add('recing');
  }
```

`miniLines` 는 선택 묶음 기준으로 바꾼다: `const miniLines = selGroup?.lines || [];`

(d) 응용 블록에 표현 줄을 넣는다. `drillsBlock` 을 다음으로 바꾼다:

```js
  const drillsBlock = drills.length ? h('div', { class: 'vs-drills' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '응용 연습'), h('span', { class: 'ct' }, '녹음 ', drillCountEl, ' / ' + drills.length)),
    expr ? h('div', { class: 'vs-drills-expr' }, expr) : null,
    drillList, unfoldBtn,
  ) : null;
```

CSS 추가(`VS_STAGE_CSS`):

```css
.vs-stagewrap{flex:1 1 auto;min-width:0}
.vs-drills{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px 16px}
.vs-drills .vs-labrow{margin-top:0}
.vs-drills-expr{font-size:14.5px;font-weight:700;letter-spacing:-.01em;color:var(--teal-deep);margin-top:8px;line-height:1.35}
```

(e) 데스크톱 분기 교체:

```js
  } else {
    // ── 데스크톱 3칼럼 (2026-09-14 시안 12a): 좌측 250 · 대화 · 우측 400 ──
    const foldPanel = explainPanel(ex);
    const fhd2 = foldPanel.querySelector('.ph2d');
    fhd2.replaceChild(h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 })), fhd2.lastChild);
    const inner2 = foldPanel.querySelector('.inner');
    const secs = [...inner2.children].filter((n) => !n.classList.contains('vs-kbox'));
    const secBody = h('div', { class: 'vs-secs', style: 'display:none;' }, secs);
    inner2.appendChild(secBody);
    fhd2.addEventListener('click', () => {
      const open = foldPanel.classList.toggle('open');
      secBody.style.display = open ? '' : 'none';
    });
    const lside = h('aside', { class: 'vs-lside' },
      h('div', { class: 'hmrow' },
        h('button', { class: 'hm', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('span', { class: 'tm' }, state.time || '00:00')),
      h('div', {},
        h('span', { class: 'vs-lab' }, `신규 학습 · ${subjLabel}`),
        h('div', { class: 'cnt' }, String(idx), h('em', {}, '/' + total)),
        progressSegEl(total, idx, (n) => handlers.onJump?.(n + offset))),
      sentenceNavEl(exprCards, { selCardId: s?.id, utterOf, drillProgOf, onSelect: jumpToCard }),
      h('span', { class: 'sp' }),
      recWidget, histCard.el,
      h('button', { class: 'endbtn', type: 'button', onClick: handlers.onEnd }, '세션 종료'));
    const side = h('aside', { class: 'vs-side' }, drillsBlock, foldPanel, nextBtn);
    root = h('div', { class: 'vs' }, v2Style(VS_CSS), lside,
      h('div', { class: 'vs-mainwrap' }, stageWrap, side));
    timeUpdate = (t) => { const el = lside.querySelector('.tm'); if (el) el.textContent = t; };
  }
```

`utterRingCard` 호출을 `{ size: 96 }` 으로 바꾼다: `const ring140 = utterRingCard({ size: state.size === 'desktop' ? 96 : 96 });` → 단순히 `utterRingCard({ size: 96 })`, 변수명은 `ringCard` 로.

`VS_CSS` 의 `.vs-mainwrap` · `.vs-side` 값을 시안에 맞춘다(둘 다 신규 전용이라 안전):

```css
.vs-mainwrap{flex:1;display:flex;gap:24px;padding:28px 28px 32px;min-width:0}
.vs-side{width:400px;flex:0 0 auto;display:flex;flex-direction:column;gap:14px}
```

`.vs-rail` · `.vs-rstep` · `.vs-card` · `.vs-h1` · `.vs-ko` · `.vs-pron` · `.vs-crumb` · `.vs-scene` · `.vs-prog` · `.vs-prog-t` · `.vs-main` 규칙과 `rail` 변수 · `progBars` 변수를 삭제한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '데스크톱 3칼럼'`
Expected: PASS (7개). 이 시점에서 기존 테스트 다수가 깨진다 — Task 8 에서 이관한다.

- [ ] **Step 5: Commit**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.js study/src/pages/sessionExprV2.test.js
git commit -m "feat(study): 신규 세션 데스크톱 3칼럼 — 문장 카드 폐기, 대화 스테이지로 교체"
```

---

### Task 6: 폰 조립 교체 · 대화 접기

**Files:**
- Modify: `src/pages/sessionExprV2.js` (모바일 분기)
- Test: `src/pages/sessionExprV2.test.js` (새 describe)

**Interfaces:**
- Consumes: Task 5 의 `stageWrap`·`stages`·`groups`. 접기 상태는 `state.dlgCollapsed`(세션 state 에 보관 — 카드 이동 재렌더에도 유지).
- Produces: `.m-topb`(세그먼트 포함) · `.m-pad` · `.m-cta`. `.m-steps` 와 `.scene-chip` 제거.

- [ ] **Step 1: Write the failing test**

```js
describe('sessionExprV2 — 폰 단일 칼럼 (시안 12a 폰 390)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
    { speaker: 'A', name: '소연', en: 'Take your time.', ko: '천천히 와.', kr: '테이켜r 타임' },
    { speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' },
  ];
  function st() {
    const s = makeState();
    s.size = 'phone';
    s.cards = [
      { id: 'c1', lang: 'en', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '아이몬 마이 웨이',
        explanation: { key: "I'm on my way = 가는 중이야.", situation: '새벽 공항', miniDialogue: MD, drills: [] } },
      { id: 'c2', lang: 'en', sentence: "I'm almost there.", ko: '거의 다 왔어.', pron: '아이몰모우스 데어r',
        explanation: { key: "I'm almost there = 거의 다 왔어.", situation: '진입로', miniDialogue: MD, drills: [] } },
    ];
    s.sentence = s.cards[0];
    s.step = 1;
    return s;
  }
  const mount = (state, handlers = {}) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, handlers); return host;
  };

  it('상단 바에 진행이 들어가고 스텝 줄과 장면 칩은 없다', () => {
    const host = mount(st());
    expect(host.querySelector('.m-topb-meta').textContent).toBe('신규 학습 · 영어 · 1/2');
    expect(host.querySelector('.m-steps')).toBeNull();
    expect(host.querySelector('.scene-chip')).toBeNull();
    expect(host.querySelector('.m-topb .vs-seg')).not.toBeNull();
  });

  it('본문 순서 — 대화 · 응용 · 해설 · 오늘 발화 · 공부 이력', () => {
    const s = st();
    s.cards[0].explanation.drills = [{ en: 'x', ko: '뜻', kr: '엑스' }];
    s.sentence = s.cards[0];
    const host = mount(s);
    expect([...host.querySelector('.m-pad').children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-stagewrap', 'vs-drills', 'vs-fold', 'vs-rec', 'vs-hist']);
  });

  it('대화 접기 — 직전 상대 줄과 선택 줄만 남고, 다시 누르면 펼쳐진다', () => {
    const s = st();
    const host = mount(s);
    expect(host.querySelectorAll('.vs-ln')).toHaveLength(4);
    host.querySelector('.vs-stage-fold').click();
    expect(s.dlgCollapsed).toBe(true);
    const host2 = mount(st.call(null) && Object.assign(st(), { dlgCollapsed: true }));
    const rows = [...host2.querySelectorAll('.vs-ln')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.vs-ln-en').textContent).toBe('We landed early.');
    expect(rows[1].classList.contains('sel')).toBe(true);
    expect(host2.querySelector('.vs-stage-fold').textContent).toBe('대화 펼치기 ▾');
  });

  it('폰은 화자 이름이 문장 위 라벨이다', () => {
    const host = mount(st());
    const row = host.querySelectorAll('.vs-ln')[0];
    const kids = [...row.querySelector('.vs-ln-body').children].map((n) => n.className);
    expect(kids[0]).toBe('vs-ln-name');
    expect(kids[1]).toBe('vs-ln-en');
  });

  it('하단 CTA 는 마지막 카드에서 학습 완료가 된다', () => {
    const s = st();
    s.step = 2; s.sentence = s.cards[1];
    const host = mount(s);
    expect(host.querySelector('.m-cta .vs-next').textContent).toBe('학습 완료 →');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '폰 단일 칼럼'`
Expected: FAIL — `.m-steps` 가 남아 있다

- [ ] **Step 3: Implement**

(a) 접기 적용 — `stages` 를 만들기 **전에** 묶음 줄을 걸러낸다:

```js
  /* 폰 대화 접기 (시안 12a) — 질문→대답 짝만 남긴다(직전 상대 줄 + 선택 줄). 상태는 세션 state 에
   * 둔다 — 카드 이동은 전체 재렌더라 지역 변수로는 유지되지 않는다. */
  const collapsed = state.size !== 'desktop' && !!state.dlgCollapsed;
  const viewGroups = !collapsed ? groups : groups.map((g, gi) => {
    if (gi !== selGroupIdx) return { ...g, lines: [], cardAt: {} };
    const keep = [selLineIdx - 1, selLineIdx].filter((k) => k >= 0);
    const cardAt = {};
    keep.forEach((k, j) => { if (g.cardAt[k]) cardAt[j] = g.cardAt[k]; });
    return { ...g, lines: keep.map((k) => g.lines[k]), cardAt };
  }).filter((g) => g.lines.length);
```

`groups.map(...)` 를 `viewGroups.map(...)` 으로 바꾸고, `cueIndex` 는 `collapsed ? 0 : selLineIdx - 1`, 스테이지 안의 `selCardId` 판정은 그대로 둔다(`cardAt` 이 재색인됐으므로 자동으로 맞는다). `miniScoresOf` 는 접힘일 때 원래 index 로 되돌린다: `(i) => normScores(cardEx.mini?.[collapsed ? (selLineIdx - 1 + i) : i])`.

(b) 폰 분기 교체:

```js
  if (state.size !== 'desktop') {
    // ── 폰 단일 칼럼 (2026-09-14 시안 12a) ──
    const mTime = h('span', { class: 'm-topb-time' }, state.time || '00:00');
    const mTopb = h('div', { class: 'm-topb' },
      h('div', { class: 'm-topb-row' },
        h('button', { class: 'm-home', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('span', { class: 'm-topb-meta' }, `신규 학습 · ${subjLabel} · ${idx}/${total}`),
        mTime),
      progressSegEl(total, idx, (n) => handlers.onJump?.(n + offset)));
    const foldBd = h('div', { class: 'fbd', style: 'display:none;' }, explainPanel(ex));
    const fhd = h('div', { class: 'fhd' }, h('span', { class: 'ft' }, '표현 해설'), h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 })));
    const fold = h('div', { class: 'vs-fold' }, fhd, foldBd);
    fhd.addEventListener('click', () => { const open = fold.classList.toggle('open'); foldBd.style.display = open ? '' : 'none'; });
    // 대화 접기 토글 — 첫 묶음 헤더에 붙인다(대화가 있는 묶음만 헤더를 갖는다).
    const foldBtn = h('button', { class: 'vs-stage-fold', type: 'button' },
      collapsed ? '대화 펼치기 ▾' : '대화 접기 ▴');
    foldBtn.addEventListener('click', () => { state.dlgCollapsed = !collapsed; handlers.rerender?.(); });
    stageWrap.querySelector('.vs-stage-hdr')?.appendChild(foldBtn);
    root = h('div', { class: 'vs' }, v2Style(VSM_CSS),
      mTopb,
      h('div', { class: 'm-pad' }, stageWrap, drillsBlock, fold, recWidget, histCard.el),
      h('div', { class: 'm-cta' }, nextBtn));
    timeUpdate = (t) => { mTime.textContent = t; };
  } else {
```

`VSM_CSS` 에 세그먼트바 규칙을 추가한다(`.m-prog` 는 지운다):

```css
.m-topb .vs-seg{display:flex;gap:4px;margin-top:9px}
.m-topb .vs-seg > span{flex:1;display:flex;align-items:center;padding:6px 0;margin:-6px 0;cursor:pointer}
.m-topb .vs-seg i{width:100%;height:4px;border-radius:2px;background:#e7e3d4}
.m-topb .vs-seg i.f{background:var(--teal)}
```

`.m-steps`·`.m-rstep`·`.scene-chip`·`.m-prog` 규칙과 `mSteps`·`sceneChip` 변수를 삭제한다.

(c) `renderSessionExprV2` 가 `handlers.rerender` 를 받도록 한다 — 없으면 무시(테스트에서 안 넘길 수 있다).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js -t '폰 단일 칼럼'`
Expected: PASS (5개)

- [ ] **Step 5: Commit**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.js study/src/pages/sessionExprV2.test.js
git commit -m "feat(study): 신규 세션 폰 화면 — 스텝 줄 폐기, 상단 세그먼트 + 대화 접기"
```

---

### Task 7: 선택 이동 스크롤 · 접힌 줄 녹음 자동 시작

**Files:**
- Modify: `src/pages/session-new.js:196-227`(handlers), `src/pages/sessionExprV2.js`(마운트 후 처리)
- Test: `src/pages/session-new.test.js`, `src/pages/sessionExprV2.test.js`

**Interfaces:**
- Consumes: Task 5 의 `selectedRow`, `state.autoRec`.
- Produces: `renderSessionExprV2` 가 마운트 직후 (1) 선택 줄을 화면 안으로 스크롤하고 (2) `state.autoRec` 가 현재 카드면 본 녹음을 시작하고 플래그를 지운다.

- [ ] **Step 1: Write the failing test**

`sessionExprV2.test.js` 의 '데스크톱 3칼럼' describe 에 추가:

```js
  it('접힌 카드 줄 녹음 원 → 그 카드로 이동하고 재렌더 뒤 본 녹음이 자동으로 시작된다', async () => {
    const s = st();
    s.cards.push({ id: 'c2', lang: 'en', sentence: "I'm almost there.", ko: '거의 다 왔어.', pron: '아이몰모우스 데어r',
      explanation: { key: "I'm almost there = 거의 다 왔어.", situation: '진입로', miniDialogue: MD2, drills: [] } });
    const onJump = vi.fn();
    const host = mount(s, { onJump });
    // 이 세션의 대화에는 c2 줄이 없으므로 단독 묶음이 뒤에 온다 — 그 줄의 녹음 원을 누른다.
    const recBtns = [...host.querySelectorAll('.vs-ln:not(.sel) button[aria-label="녹음"]')];
    recBtns[recBtns.length - 1].click();
    expect(s.autoRec).toBe('c2');
    expect(onJump).toHaveBeenCalledWith(2);

    // 재렌더 — 이동한 카드에서 자동 녹음이 걸린다
    document.body.innerHTML = '';
    s.step = 2; s.sentence = s.cards[1];
    const host2 = mount(s, { onJump });
    await tick();
    expect(startMicRecording).toHaveBeenCalled();
    expect(s.autoRec).toBeUndefined();
    expect(host2.querySelector('.vs-ln.sel .vs-pill.recing')).not.toBeNull();
  });
```

`MD2` 는 이 describe 위에 둔다: `const MD2 = [{ speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' }];`
파일 위 mock 에 `startMicRecording` 을 import 한다.

`session-new.test.js` 에 추가:

```js
describe('session-new — 카드 이동 뒤 열린 줄 스크롤 (2026-09-14)', () => {
  it('onJump 는 렌더 뒤 선택 줄을 화면 안으로 올린다', () => {
    const calls = [];
    const row = { getBoundingClientRect: () => ({ top: 900, bottom: 1100 }) };
    const win = { innerHeight: 800, scrollY: 0, scrollTo: (o) => calls.push(o) };
    scrollSelectedIntoView(row, win, 64);
    expect(calls).toHaveLength(1);
    expect(calls[0].top).toBe(900 - 64 - 24);
  });

  it('이미 보이면 스크롤하지 않는다', () => {
    const calls = [];
    const row = { getBoundingClientRect: () => ({ top: 200, bottom: 400 }) };
    scrollSelectedIntoView(row, { innerHeight: 800, scrollY: 0, scrollTo: (o) => calls.push(o) }, 64);
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/pages/session-new.test.js -t '열린 줄 스크롤'`
Expected: FAIL — `scrollSelectedIntoView is not a function`

- [ ] **Step 3: Implement**

`sessionExprV2.js` 에 순수 헬퍼를 추가하고 export 한다:

```js
/* 선택 줄을 화면 안으로 (2026-09-14 시안 12a 구현 메모) — scrollIntoView 는 sticky 상단 바 아래로
 * 줄을 밀어 넣어 가려지므로 좌표를 직접 계산한다. 이미 보이면 움직이지 않는다. */
export function scrollSelectedIntoView(row, win = window, stickyTop = 0) {
  if (!row?.getBoundingClientRect) return;
  const r = row.getBoundingClientRect();
  const top = stickyTop;
  const bottom = win.innerHeight;
  if (r.top >= top && r.bottom <= bottom) return;
  win.scrollTo({ top: win.scrollY + r.top - top - 24, behavior: 'smooth' });
}
```

`renderSessionExprV2` 의 `host.appendChild(root)` 뒤에 추가:

```js
  // 선택 줄을 보이게 + 접힌 줄 녹음에서 넘어온 자동 본 녹음 (2026-09-14)
  const stickyTop = state.size !== 'desktop' ? (root.querySelector('.m-topb')?.offsetHeight || 0) : 0;
  if (selectedRow) scrollSelectedIntoView(selectedRow, window, stickyTop);
  if (state.autoRec && state.autoRec === s?.id) {
    delete state.autoRec;
    recPill.click();
  }
```

`session-new.js` 는 바꾸지 않는다 — `onJump` 가 이미 `rerender()` 를 부르고, 스크롤·자동 녹음은 렌더러 안에서 끝난다. 다만 `handlers.rerender` 를 넘겨 준다(Task 6 의 접기 토글·미니 녹음이 쓴다):

```js
  const handlers = {
    ...
    rerender: () => rerender(),
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/pages/session-new.test.js src/pages/sessionExprV2.test.js -t '스크롤'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.js study/src/pages/session-new.js study/src/pages/sessionExprV2.test.js study/src/pages/session-new.test.js
git commit -m "feat(study): 선택 줄 스크롤 + 접힌 카드 줄 녹음이 이동 후 본 녹음으로 이어진다"
```

---

### Task 8: 기존 테스트 이관 · 전체 통과 · 문서 동기화

**Files:**
- Modify: `src/pages/sessionExprV2.test.js` (구조 의존 20블록)
- Modify: `specs/study-app-spec.md` §8-3

**Interfaces:**
- Consumes: Task 1~7 전부.
- Produces: `pnpm test` 전체 통과.

- [ ] **Step 1: 깨진 테스트 목록을 뽑는다**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js 2>&1 | grep -E '^\s+(×|FAIL)' | head -40`
Expected: 20개 안팎의 실패. 아래 이관 규칙대로 고친다.

| 기존 블록 | 이관 |
|---|---|
| `.vs-card` 를 찾는 2개(미니대화 순서·모바일 순서) | 삭제 — 새 구조에 카드가 없다. 대신 Task 5·6 의 조립 테스트가 자리를 대신한다 |
| 미니대화 블록 describe 11개(`.vs-mini*`) | `miniDialogueEl` 직접 호출로 바꾼다(복습이 쓰는 계약이므로 유지). `renderSessionExprV2` 로 마운트하던 부분만 교체 |
| 장면 칩 describe 4개(`.vs-scene`·`.scene-chip`) | 삭제 — 칩이 없어졌다. 좌측 라벨·상단 바 텍스트는 Task 5·6 이 검증한다 |
| 사이드바 4단 1개 | Task 5 의 우측 패널 3단 테스트로 대체(이미 작성) |
| 본문 패딩 34px 1개 | `28px 28px 32px` 로 값 갱신 |
| 밑줄 그라디언트 1개 | `.vs-h1 b` → `.vs-ln-en b` 로 셀렉터 갱신 |
| 섹션 라벨 1개 | `.vs-lab` 목록에서 사라진 라벨 정리 |

- [ ] **Step 2: 이관을 적용하고 파일 테스트를 돌린다**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js`
Expected: PASS

- [ ] **Step 3: 전체 테스트**

Run: `pnpm test`
Expected: 81파일 전부 통과(테스트 수는 이관으로 달라질 수 있다). **복습 테스트(`sessionReviewV2.test.js`)가 하나도 깨지지 않아야 한다** — 깨지면 `VS_CSS` 값을 건드린 것이므로 되돌린다.

- [ ] **Step 4: 빌드**

Run: `pnpm build`
Expected: 성공

- [ ] **Step 5: 문서 동기화**

`specs/study-app-spec.md` §8-3 의 첫 두 항목을 다음으로 바꾼다:

```markdown
- **대화 스테이지 (2026-09-14 시안 12a)**: 신규 세션 화면은 문장 카드를 그리지 않는다. 표현 카드를 `explanation.miniDialogue` 기준으로 묶어(`buildDialogueGroups`, `components/session/applied.js`) 대화를 위에 고정하고, 선택한 카드의 줄이 그 자리에서 열려 듣기·따라 말하기 필·점수 링·본 점수 열을 품는다. 카드 줄 판정은 `line.en.trim() === card.sentence.trim()`, 선택은 `state.step`. 대화가 없거나 카드 문장이 그 대화에 없는 카드는 카드 문장 한 줄짜리 단독 묶음이 되고(라벨·장면·전체 듣기 없음), 카드마다 대화가 다르면 묶음이 위→아래로 나열된다. 번호는 세션 전체 순번. 데스크톱은 좌측 사이드바 250(진행·문장 목록·오늘 발화·공부 이력·세션 종료) / 대화 / 우측 400(응용·해설·다음 표현), 폰은 상단 바(세그먼트바 클릭 이동, 스텝 줄 폐기) / 대화(접기 토글) / 응용 / 해설 / 위젯 / 하단 CTA.
- **점수 표시**: 선택 줄 본 점수 열은 최근 10개(`MAIN_DOTS_MAX`), 접힌 카드 줄·상대 줄·응용 행의 흔적 줄은 최근 8개 + `+N`(`DRILL_DOTS_MAX`). 접힌 카드 줄은 뜻 끝에 `· 응용 d/총`, 말한 카드는 배지가 체크.
- **듣기 음성**: 대화 줄과 선택 줄 듣기 필은 화자 성별 고정(`MINI_VOICES` A 여성 · B 남성)에 `rate 1.0`. 대화가 없는 단독 줄만 기존 문장 카드 규칙(`PRACTICE_VOICES` 순환 · 기본 속도)을 쓴다. 응용 행은 기존 `pickPracticeVoice` 그대로.
- **미니대화 블록 (2026-09-08 신설 · 2026-09-12 녹음 추가)**: `miniDialogueEl` 은 **복습 세션 전용**이 됐다(신규는 대화 스테이지가 대신한다). 복습은 타깃 줄이 정답이라 정답 공개 뒤에만 생성해 카드 아래 슬롯에 붙인다. 정본 `docs/explanation-schema.md §miniDialogue`.
```

- [ ] **Step 6: Commit**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.test.js study/specs/study-app-spec.md study/docs/2026-09-14-dialogue-stage-plan.md
git commit -m "test(study): 대화 스테이지 구조로 기존 테스트 이관 + spec §8-3 동기화"
```

- [ ] **Step 7: 라이브 확인 (사용자 보고 전)**

`preview_start` 로 개발 서버를 띄우고 `?demo=1&view=session` 에서 데스크톱·폰 폭을 각각 확인한다. 시안과 대조할 것: 선택 줄 열림·헤어라인·배지 헤일로·흔적 원·전체 듣기 하이라이트·좌측 목록 상태·폰 접기. 데모 카드는 5장 중 1장만 대화를 가지므로 **혼합 세션 렌더**가 바로 보인다.

실기기 확인은 사용자 몫으로 남긴다(§5 기기 확인 항목: 폰 발음 11px 크기, 폰 줄 네 줄 높이, sticky 상단 바 + 스크롤).

---

## Self-Review

**스펙 커버리지** — WORK-ORDER §2-2(데스크톱) → Task 5, §2-3(폰) → Task 6, §2-1(줄·선택·스크롤) → Task 1·2·7, §3 동작표 4행 → Task 2(접힌 줄·상대 줄)·5(선택 줄)·무변경(응용 행), §3 전체 듣기 → Task 3, §4 코드 지점 → Task 1·2·4·5·6, §4 테스트 목록 9종 → Task 2·3·4·5·6·7 에 분산, §7 수용 기준 1~5 → Task 5·6·8. §5 기기 확인 3항목은 사용자 몫(Task 8 Step 7 에 명시).

**미해결로 남긴 것** — 묶음이 둘 이상일 때 라벨이 "오늘의 대화" 로 반복된다. 실 데이터(personal)는 묶음이 하나뿐이고 core100 은 미적재·보류이므로 이번에는 그대로 두고, 실제로 여러 묶음이 화면에 뜨는 시점에 라벨 규칙을 정한다.

**타입 일관성** — `buildDialogueGroups` 의 `cardAt[i] = { card, num }` 를 Task 2·5·6 이 같은 이름으로 읽는다. `dialogueStageEl` 반환은 `{ el, selectedRow, rows }`(Task 3 에서 `listenPillHost` 제거). `utterOf(cardId)`·`drillProgOf(cardId)`·`miniScoresOf(lineIndex)` 는 Task 2·4·5 에서 같은 시그니처.


---

## 이행 결과 (2026-09-14 완료)

전체 테스트 **81파일 1667개 통과**(착수 시 1615개), `pnpm build` 성공. 커밋 6개.

계획과 달라진 곳만 적는다.

- **`drillRows` 의 세 줄 옵션이 계획의 작업 분해에서 빠져 있었다.** File Structure 에는 적었지만 Task 로 내려오지 않아 라이브 확인에서 발견했다. `threeLine` 옵션으로 뒤늦게 구현했고(영문 / `[발음]` / 뜻 + 문장 아래 흔적 줄 8개 + `+N`), 복습은 옵션 없이 부르므로 기존 한 줄 부제를 그대로 쓴다.
- **화자 칸 폴백을 빠뜨렸다.** 시안은 `name` 만 읽지만 데모 픽스처와 옛 시드에는 `speaker` 만 있다. `miniDialogueEl` 과 같은 `name || speaker` 계약으로 맞췄다.
- **`session-new.js` 의 `handlers.rerender` 배선을 빠뜨려 폰 대화 접기가 멈춰 있었다.** 라이브에서 잡아 배선 테스트를 함께 넣었다.
- **본 점수 열을 이력 있을 때만 그리도록 했다.** 종전 코드는 항상 그렸고 작업지시서 §2-2 는 "이력 있을 때만" 이다.
- **연속한 단독 묶음은 헤어라인으로 잇고 간격을 0 으로 했다.** 클로드 디자인 §0-2 의 "같은 열에 끼운다" 를 따르면 묶음 간 26px 간격이 어긋난다.
- **캘린더 테스트가 날짜 경과로 깨져 있었다**(고정 날짜 8/22 가 9/14 기준 4주 창 밖). 이 작업과 무관한 기존 결함이라 오늘 기준 역산으로 고쳤다.
- `utterRingCard` 의 '직전 N회' 는 시안처럼 카드 윗줄로 올리지 않고 링 안에 두었다 — §1 의 "컴포넌트 그대로" 가 §2-2 의 배치 설명보다 강한 지시라고 보았다.

### 남은 것

- 실기기 확인(§5): 폰 발음 11px 가 말하면서 읽기에 작은지, 줄 네 줄이 길게 느껴지는지, PWA 에서 sticky 상단 바 + 프로그램 스크롤이 어떻게 동작하는지.
- 묶음이 둘 이상일 때 라벨이 "오늘의 대화" 로 반복된다. 실 데이터(personal)는 묶음이 하나뿐이고 core100 은 미적재·보류라 그대로 두었다.


---

## 시안 실측 대조 (2026-09-14, 사용자 배포 화면 지적 후속)

배포 화면에서 비율이 시안과 달랐다. 원인은 기존 `.vs-main{width:760px}` 를 없애면서 대화 영역에 상한을 두지 않은 것이다 — 시안의 1280 기준 비율이 화면 폭만큼 늘어났다. 시안(`design.html` 12a)과 앱을 같은 뷰포트에서 `getBoundingClientRect`·`getComputedStyle` 로 재서 맞췄다.

| 항목 | 시안 12a | 고치기 전 | 고친 뒤 |
|---|---|---|---|
| 좌측 사이드바 | 250 | 250 | 250 |
| 대화 스테이지 | 548 | 화면 폭만큼 (1280 에서 597) | 548 (상한, 가운데 정렬) |
| 우측 패널 | 400 | 324 | 400 |
| 본문 padding | 28 28 32 | 34 34 40 | 28 28 32 |
| 본문 gap | 24 | 26 | 24 |
| 응용 행 | pad 10 2 · gap 11 · 번호 12 | gap 14 · 번호 16 | pad 10 2 · gap 11 · 번호 12 |
| 오늘 발화 카드 | 213×173, 직전 기록 **윗줄**, 링 숫자 24 | 직전 기록이 링 안, 숫자 36 | 213×180, 윗줄, 24 (`prevTop` 옵션) |
| 접힌 줄 | 548×86 · pad 9 14 | 동일 | 동일 |
| 선택 줄 | 548×203 | 동일 | 동일 |
| 문장 목록 항목 | 229 · pad 10 · gap 10 | 동일 | 동일 |
| 폰 줄 | 360×97 · pad 9 10 · m 0 -6 · 원 32 | 동일 | 동일 |
| 폰 선택 줄 | 206 | — | 209 |

남은 차이는 셋이고 전부 의도한 것이다.

- 폰 상단 바 53 vs 시안 57, 하단 CTA 77 vs 83 — 앱은 `env(safe-area-inset-*)` 를 더하고 시안 목업에는 그 개념이 없다. 실기기 노치 대응이라 앱 값을 유지했다.
- 폰 줄 폭 362 vs 360 — 시안 폰 목업의 1px 테두리 때문이고 실제 앱과 무관하다.
- 접힌 줄 높이 100 vs 97, 폰 선택 줄 209 vs 206 — 3px. 폰트 렌더링 차이.

### 실제 배포에서 드러난 결함 두 개

- **좌측 문장 목록의 뜻이 비어 있었다.** `state.cards` 는 Dexie 원본 행이라 뜻이 `ko` 가 아니라 `meaning` 이다(`pickCardFields` 는 `state.sentence` 에만 적용된다). 데모 픽스처는 `ko` 를 직접 갖고 있어 테스트·데모에서 드러나지 않았다. `sentenceNavEl` 과 `buildDialogueGroups` 단독 묶음에 폴백을 넣었다.
- **선택 줄에도 클릭 리스너가 붙어 있었다.** 안에 든 필·버튼 클릭이 버블링돼 `onSelect → onJump` 를 불렀다. `session-new.js` 의 같은-step 가드 덕분에 실제 앱은 무해했지만, 가드 없는 호출부가 생기면 재렌더로 녹음이 끊긴다. 선택 줄에는 리스너를 붙이지 않는다.

### 버튼 실행 확인 (dev 서버, personal 시드, demo 채점)

데스크톱: 세그먼트 4칸 → step 1~4 · 문장 목록 4개 → step 1~4 · 줄 듣기 원 7개(A/B 음성, rate 1.0) · 선택 줄 듣기 필(지오 = Andrew, 1.0) · 전체 듣기 8줄 순서 · 따라 말하기 2회(링 '방금 점수' → 점수 열 2개 → 라벨 '다시 말하기' → 오늘 발화 9→11) · 상대 줄 녹음(`#mini#` 0번) · 접힌 2번 줄 녹음 원(→ step 2 이동 + 자동 본 녹음) · 이전 카드 줄에 체크·흔적 2개·목록 '말하기 2회'+91 · 응용 듣기 6개(길이별 속도)·녹음 2개(카운터 2/6) · 1번 복귀 시 링 '지난 점수' 91·점수 열 2개 · 해설 펼치기 · 다음 표현 · 세션 종료.

폰: 상단 세그먼트 · 전체 듣기 8줄 · 대화 접기(2줄: 직전 상대 줄 + 선택 줄) ↔ 펼치기(8줄) · **접힘 상태에서 상대 줄 녹음이 원래 줄 index(2)로 기록** · 응용 녹음 · 해설 · 하단 CTA.

전체 테스트 81파일 **1675개** 통과, `pnpm build` 성공.
