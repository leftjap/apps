# 말하기 연습 화면 + ChatGPT 프롬프트 구현 계획

> **상태 (2026-09-08)**: Task 1~5 완료. 커밋 `7c4a527`(프롬프트) · `af2c4f6`(선별) · `a9d546a`(화면·라우트) · 홈·요약 진입 · 문서. 전체 테스트 79파일 1,535개 통과, 빌드 통과, `/mocks/speak.html?demo=1` 브라우저 확인(범위 전환·체크 해제·복사). 후속은 문서 끝 "후속 계획".

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 요약에서만 나오던 음성 대화 프롬프트를 홈에서 언제든 다시 만들 수 있는 독립 화면(`#/speak`)으로 옮기고, 프롬프트를 ChatGPT 음성 모드 기준으로 바꾸며 각 표현의 상황(`explanation.situation`)과 맥락 전이 규칙을 넣는다.

**Architecture:** 표현 선별은 순수 함수 서비스(`services/speakPicks.js`)로 두어 DOM 없이 테스트하고, 화면(`pages/speak.js`)은 연속 듣기(`pages/listen.js`)와 같은 마운트 구조를 따른다. 프롬프트 빌더(`services/voicePrompt.js`)는 문자열 배열(기존 요약 화면)과 `{expr, situation, sentence}` 객체 배열(새 화면)을 모두 받는다. 저장된 프롬프트는 없고 매번 Dexie 에서 다시 읽는다.

**Tech Stack:** 바닐라 JS + `components/d1/dom.js` 의 `h()` + `components/v2/atoms.js`, Dexie(`window.studyDB`), vitest(jsdom), vite 멀티페이지 mocks.

**Spec:** 2026-09-08 작업지시서(대화 원문, §5~§9) + 검토 결정: 범위 3개(오늘/어려웠던/랜덤), 상한 5(어려웠던 순 → 나중에 배운 순), ChatGPT 단일 경로, 표현마다 `situation` 동봉, 회피 대비 첫 단어 힌트 규칙 유지. 미니대화(작업지시서 §1~§4)와 복습 단서 다양화는 **별도 계획**으로 뒤에 쓴다.

## Global Constraints

- 새 필드·화면은 optional: 과거 카드·기존 화면이 깨지지 않게 한다(작업지시서 "구현 시 지켜야 할 것").
- 기존 drill·생산 연습·chain·복습 회상 모드·SRS 자기평가·게이트 폐지 상태는 건드리지 않는다.
- 말하기 연습은 영어 전용(프롬프트가 영어 코칭 전용). 수학·일본어 홈에는 진입점을 두지 않는다.
- 표현 상한 `SPEAK_MAX = 5`. 우선순위: 오늘 판정 X > △ > 나머지, 같으면 신규 > 복습, 같으면 나중에 배운 순.
- 클로드/Haiku 문구 제거. ChatGPT 한 경로만 유지(토글 없음).
- 테스트는 `pnpm test`(= `vitest run`)로만 실행한다. `pnpm vitest` 단독 호출 금지(watch).
- 커밋은 Conventional Commits, 본 세션이 만든 파일만 골라서. Stop 훅의 WIP 스냅샷이 먼저 커밋됐으면 `git reset --soft` 로 합친다.

---

### Task 1: 프롬프트 빌더를 ChatGPT 기준·객체 입력·맥락 전이 규칙으로 바꾼다

**Files:**
- Modify: `src/services/voicePrompt.js`
- Test: `src/services/voicePrompt.test.js`

**Interfaces:**
- Produces: `buildVoicePrompt(items)` — `items` 는 `string[]` 또는 `{ expr: string, situation?: string, sentence?: string }[]`. 반환 `string`. `normalizeVoiceItems(items)` → `{expr, situation, sentence}[]`. 상수 `VOICE_PROMPT_INTRO`.

- [x] **Step 1: 실패하는 테스트 추가** (`src/services/voicePrompt.test.js` 의 describe 이름을 'buildVoicePrompt — ChatGPT 음성 모드 회화 연습 프롬프트' 로 바꾸고 아래 it 들을 추가)

```js
  it('첫 줄이 ChatGPT 안내이고 클로드·Haiku 문구가 없다', () => {
    const p = buildVoicePrompt(['x']);
    expect(p.split('\n')[0]).toContain('ChatGPT');
    expect(p).not.toMatch(/클로드|Claude|Haiku/i);
  });

  it('객체 입력 — 표현·예문·상황을 함께 넣는다', () => {
    const p = buildVoicePrompt([{ expr: "I've been meaning to ask", sentence: "I've been meaning to ask you something.", situation: '미뤄 둔 질문을 꺼낼 때' }]);
    expect(p).toContain("I've been meaning to ask");
    expect(p).toContain("I've been meaning to ask you something.");
    expect(p).toContain('미뤄 둔 질문을 꺼낼 때');
  });

  it('맥락 전이 규칙 — 타깃을 먼저 말하지 않기, 비슷하지만 다른 상황, 두 번째 사용, 퀴즈 금지, 첫 단어 힌트', () => {
    const p = buildVoicePrompt([{ expr: 'x', situation: 's' }]);
    expect(p).toMatch(/do not say .*target|never say .*target|before I do/i);
    expect(p).toMatch(/similar .* (but )?not the same|different (place|person|reason)/i);
    expect(p).toMatch(/second time|a different situation/i);
    expect(p).toMatch(/not a quiz/i);
    expect(p).toMatch(/first word/i);
  });

  it('normalizeVoiceItems — 문자열·객체 혼합, 빈 값 제거', () => {
    expect(normalizeVoiceItems(['a', { expr: ' b ', situation: 's' }, { expr: '' }, null])).toEqual([
      { expr: 'a', situation: '', sentence: '' },
      { expr: 'b', situation: 's', sentence: '' },
    ]);
  });
```

import 줄을 `import { buildVoicePrompt, normalizeVoiceItems } from './voicePrompt.js';` 로 바꾼다.

- [x] **Step 2: 실패 확인**

Run: `pnpm test -- src/services/voicePrompt.test.js`
Expected: FAIL — `normalizeVoiceItems` 미정의, 첫 줄에 'ChatGPT' 없음.

- [x] **Step 3: 구현** — `src/services/voicePrompt.js` 전체를 아래로 교체

```js
/**
 * voicePrompt.js — ChatGPT 음성 모드 영어 회화 연습 프롬프트 빌더 (2026-09-08 ChatGPT 기준으로 전환).
 *
 * 세션 요약(summaryV2)과 말하기 연습 화면(#/speak)이 같이 쓴다. 표현은 문자열 또는 { expr, situation, sentence }.
 * 규칙 근거(2026-06-30 voice-practice-research): 입력·정서는 SLA(Krashen i+1·affective filter, Long interaction),
 * 교정은 prompt(자가수정 유도) 우선 — 저숙련엔 recast 보다 효과(Ammar&Spada 2006, SSLA 28(4):543-574).
 * 맥락 전이 규칙(2026-09-08 작업지시서 §8): 타깃을 먼저 말하지 않고, 원래 상황과 비슷하지만 다른 상황을 만들어
 * 표현이 필요해지게 하며, 성공하면 다른 상황에서 한 번 더 쓰게 한다. 회피 대비로 두 턴 뒤 첫 단어 힌트는 남긴다.
 */
export const VOICE_PROMPT_INTRO = '[아래 내용을 ChatGPT 새 대화에 붙여 넣어 보낸 뒤, 같은 대화에서 음성 모드를 시작하세요]';

const str = (v) => String(v ?? '').trim();

/** 문자열·객체 혼합 배열 → { expr, situation, sentence } 배열. expr 이 비면 뺀다. */
export function normalizeVoiceItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => (typeof it === 'string' ? { expr: it } : it))
    .filter((it) => it && str(it.expr))
    .map((it) => ({ expr: str(it.expr), situation: str(it.situation), sentence: str(it.sentence) }));
}

/** items → ChatGPT 붙여넣기용 프롬프트 문자열. */
export function buildVoicePrompt(items) {
  const list = normalizeVoiceItems(items);
  const exprBlock = list.length
    ? list.map((it) => {
      const lines = [`- "${it.expr}"`];
      if (it.sentence && it.sentence !== it.expr) lines.push(`  example: ${it.sentence}`);
      if (it.situation) lines.push(`  original situation (Korean, for you only): ${it.situation}`);
      return lines.join('\n');
    }).join('\n')
    : '- (use simple everyday expressions for travel and daily life)';

  return `${VOICE_PROMPT_INTRO}

You are my personal English speaking coach. We talk ONLY by voice. The rules below are strict — follow every one, exactly.

# Who I am
- A Korean adult. I read English OK, but my LISTENING and SPEAKING are weak, and linked/connected speech (gonna, wanna, didja, "a lot of") is hard for me. Treat me as low-intermediate (about A2–B1).
- My goals: (1) understand movies/dramas without subtitles, (2) handle simple travel situations in English.

# Today's target expressions (for you only — do NOT read this list to me)
${exprBlock}

# How you talk (STRICT)
1. ENGLISH ONLY. Every turn = MAX 2 short, simple sentences. No lists, no lectures, no long explanations. I should speak about 3x more than you.
2. Open each turn with ONE real question (something you don't know — about my day, my trip, my plans), then STOP and WAIT for me. Not quiz questions.
3. Pick ONE real-life scene and stay in it for a while: hotel check-in, ordering food, asking directions, or daily life (work, travel, family, pets).
4. Speak SLOWLY and clearly (my listening is weak). If I don't understand, do NOT repeat the same words — say it slower, then in easier words. For one key sentence per scene, say it 3 ways: normal speed → word-by-word → normal speed (so I catch the linked sounds).
5. WAIT for me. Never finish my sentence or answer for me. If I'm stuck a few seconds, give a tiny hint (just the first word) or ask again as an easy yes/no. Silence is OK.

# Context transfer (IMPORTANT — this is the point of today's practice)
6. Do NOT say a target expression before I do. Never list them, never ask me to translate them.
7. For each target, build a real situation that is SIMILAR to its original situation but NOT the same one — a different place, person, or reason — so that I naturally need that expression.
8. If I have not used the target after two turns, give a tiny hint (the first word only) and let me try again.
9. When I use a target expression well, bring it back later in a DIFFERENT situation so I use it a second time.
10. This is a conversation, not a quiz. Never ask "How do you say ~ in English?".

# When I make a mistake (you MUST correct — but gently)
11. First react to my MEANING ("Nice!", "I see!"). Never criticize.
12. Fix only ONE thing per turn — the one that most blocks meaning. Let small article/preposition slips go if I'm understandable.
13. Make me self-correct FIRST: say "Try that one more time" or a small hint ("check the tense"). Only if I still can't, say the correct sentence clearly and give the reason in ONE short Korean line (e.g., "her cat 이 맞아요, his 아니라"). Never leave a correction vague.
14. While I'm talking freely, do NOT interrupt — wait until I finish, then fix 1–2 things. While we are working on a target expression, you may correct right away, briefly.

# Korean (한국어) — emergency only
15. Use Korean only as a last resort, after you've simplified TWICE and I still don't get it. One short Korean word, then straight back to English.

# Each round
(1) You: one short question inside the scene → (2) I answer → (3) you react to meaning + fix one thing → (4) you steer the scene so I need a target expression → (5) repeat. After about 8–10 minutes, finish in simple English: which target expressions I used on my own, which I needed a hint for, and one thing to practice next time.

Start now: greet me in ONE short sentence, set the scene in ONE short sentence, then ask your first question. English only.`;
}
```

- [x] **Step 4: 통과 확인**

Run: `pnpm test -- src/services/voicePrompt.test.js`
Expected: PASS (기존 5개 + 신규 4개)

- [x] **Step 5: 커밋**

```bash
git add src/services/voicePrompt.js src/services/voicePrompt.test.js
git commit -m "feat(study): 음성 대화 프롬프트를 ChatGPT 기준으로 — 표현별 상황 동봉, 맥락 전이 규칙(타깃 선공개 금지·유사 상황·2회 사용)"
```

---

### Task 2: 표현 선별 서비스 `speakPicks.js`

**Files:**
- Create: `src/services/speakPicks.js`
- Test: `src/services/speakPicks.test.js`

**Interfaces:**
- Consumes: `exprOf(card)` from `src/components/d1/sessionShell.js`(`explanation.key` 의 `=` 앞 청크), `todayPlusDays(iso, days)` from `src/services/srs.js`.
- Produces: `SPEAK_MAX = 5`, `SPEAK_SCOPES = ['today','hard','random']`, `toSpeakItem(card)` → `{ id, expr, sentence, situation, ko }`, `pickToday(cards, logs, todayISO)`, `pickHard(cards, todayISO)`, `pickRandom(cards, rng)`, `loadSpeakItems(db, lang, scope, todayISO, rng)` → `Promise<item[]>`.

- [x] **Step 1: 실패하는 테스트** — `src/services/speakPicks.test.js`

```js
import { describe, it, expect } from 'vitest';
import { toSpeakItem, pickToday, pickHard, pickRandom, loadSpeakItems, SPEAK_MAX } from './speakPicks.js';

const T = '2026-09-08';
const card = (id, over = {}) => ({
  id, lang: 'en', sentence: `${id} sentence.`, meaning: `${id} 뜻`,
  explanation: { key: `${id} key = 뜻`, situation: `${id} 상황` }, promotedAt: `2026-09-0${id.length % 9 + 1}T00:00:00Z`, ...over,
});

describe('toSpeakItem', () => {
  it('key 의 = 앞이 표현, 없으면 문장', () => {
    expect(toSpeakItem(card('a'))).toEqual({ id: 'a', expr: 'a key', sentence: 'a sentence.', situation: 'a 상황', ko: 'a 뜻' });
    expect(toSpeakItem({ id: 'b', sentence: 'Hi.', meaning: '안녕' }).expr).toBe('Hi.');
  });
});

describe('pickToday — 오늘 세션 로그의 카드, 어려웠던 순 → 신규 우선 → 나중에 배운 순, 상한 5', () => {
  const cards = ['n1', 'n2', 'n3', 'r1', 'r2', 'r3', 'r4'].map((id) => card(id));
  cards[3].resultHistory = [{ date: T, result: 'X', source: 'review' }];
  cards[4].resultHistory = [{ date: T, result: '△', source: 'review' }];
  cards[5].resultHistory = [{ date: '2026-09-01', result: 'X', source: 'review' }]; // 오늘 아님 → 가중치 없음
  cards[1].promotedAt = '2026-09-08T10:00:00Z'; cards[0].promotedAt = '2026-09-08T09:00:00Z'; cards[2].promotedAt = '2026-09-08T08:00:00Z';
  const logs = [
    { date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1', 'n2', 'n3'], sentenceIds: ['n1', 'n2', 'n3'] },
    { date: T, lang: 'en', mode: 'review', newSentenceIds: [], sentenceIds: ['r1', 'r2', 'r3', 'r4'] },
    { date: '2026-09-07', lang: 'en', mode: 'new', newSentenceIds: ['old'], sentenceIds: ['old'] },
  ];
  it('7장 중 5장 — X, △, 신규 3장(나중에 배운 순)', () => {
    expect(pickToday(cards, logs, T).map((i) => i.id)).toEqual(['r1', 'r2', 'n2', 'n1', 'n3']);
  });
  it('오늘 로그가 없으면 빈 배열', () => {
    expect(pickToday(cards, [logs[2]], T)).toEqual([]);
  });
  it('soft-delete·장면 카드는 뺀다', () => {
    const c = [card('n1', { explanation: { _deleted: true } }), card('n2', { explanation: { dialogue: [] } }), card('n3')];
    expect(pickToday(c, [logs[0]], T).map((i) => i.id)).toEqual(['n3']);
  });
});

describe('pickHard — 최근 14일 안에 X 판정, 최근 실패 순', () => {
  it('resultHistory 의 X 날짜 최신순, lastResult=X(날짜 없음)는 맨 뒤, 14일 밖은 제외', () => {
    const cards = [
      card('a', { resultHistory: [{ date: '2026-09-01', result: 'X' }] }),
      card('b', { resultHistory: [{ date: '2026-09-06', result: 'X' }, { date: '2026-09-07', result: 'O' }] }),
      card('c', { lastResult: 'X' }),
      card('d', { resultHistory: [{ date: '2026-08-01', result: 'X' }] }),
      card('e', { resultHistory: [{ date: '2026-09-07', result: '△' }] }),
    ];
    expect(pickHard(cards, T).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('pickRandom — 상한 5, 주입한 난수로 결정적', () => {
  it('6장 → 5장, rng 가 0 이면 앞에서부터 섞임이 고정된다', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => card(id));
    const out = pickRandom(cards, () => 0);
    expect(out).toHaveLength(SPEAK_MAX);
    expect(new Set(out.map((i) => i.id)).size).toBe(SPEAK_MAX);
  });
});

describe('loadSpeakItems — Dexie 에서 매번 다시 읽는다', () => {
  const cards = [card('n1'), card('h1', { lastResult: 'X' })];
  const logs = [{ date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1'], sentenceIds: ['n1'] }];
  const db = {
    reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => cards }) }) },
    sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => logs }) }) },
  };
  it('today / hard / random 범위별로 고른다', async () => {
    expect((await loadSpeakItems(db, 'en', 'today', T)).map((i) => i.id)).toEqual(['n1']);
    expect((await loadSpeakItems(db, 'en', 'hard', T)).map((i) => i.id)).toEqual(['h1']);
    expect((await loadSpeakItems(db, 'en', 'random', T, () => 0))).toHaveLength(2);
  });
  it('db 없으면 빈 배열', async () => {
    expect(await loadSpeakItems(null, 'en', 'today', T)).toEqual([]);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test -- src/services/speakPicks.test.js`
Expected: FAIL — 모듈 없음.

- [x] **Step 3: 구현** — `src/services/speakPicks.js`

```js
/* speakPicks.js — 말하기 연습(#/speak) 표현 선별 (2026-09-08 작업지시서 §6).
 * 저장된 프롬프트를 쓰지 않고 매번 Dexie 에서 다시 읽는다. 범위 3개:
 *   today  = 오늘 세션 로그(newSentenceIds ∪ sentenceIds)에 있는 카드
 *   hard   = 최근 HARD_WINDOW_DAYS 안에 X 판정(resultHistory) 또는 lastResult X 인 카드, 최근 실패 순
 *   random = 활성 카드에서 무작위
 * 상한 SPEAK_MAX — 오늘 카드가 6~7장이면 오늘 판정 X > △ > 나머지, 같으면 신규 > 복습, 같으면 나중에 배운 순으로 남긴다
 * (2026-09-08 사용자 확정 권장안). soft-delete(explanation._deleted)·장면 카드(explanation.dialogue)는 뺀다. */
import { exprOf } from '../components/d1/sessionShell.js';
import { todayPlusDays } from './srs.js';

export const SPEAK_MAX = 5;
export const HARD_WINDOW_DAYS = 14;
export const SPEAK_SCOPES = ['today', 'hard', 'random'];

const RESULT_RANK = { X: 3, '△': 2, O: 1 };
const str = (v) => String(v ?? '');
const isActive = (c) => Boolean(c && str(c.sentence).trim() && !c.explanation?._deleted && !Array.isArray(c.explanation?.dialogue));
const learnedAt = (c) => str(c?.promotedAt || c?.createdAt);

export function toSpeakItem(card) {
  const expr = exprOf(card) || str(card?.sentence).trim();
  return {
    id: card.id,
    expr,
    sentence: str(card?.sentence).trim(),
    situation: str(card?.explanation?.situation).trim(),
    ko: str(card?.meaning ?? card?.ko).trim(),
  };
}

/* 오늘 판정 — resultHistory 의 오늘 항목(마지막) 우선, 없으면 lastResultAt 이 오늘인 lastResult. */
function todayResult(card, todayISO) {
  const hist = Array.isArray(card?.resultHistory) ? card.resultHistory : [];
  const t = hist.filter((x) => x?.date === todayISO).pop();
  if (t?.result) return t.result;
  if (card?.lastResultAt && str(card.lastResultAt).slice(0, 10) === todayISO) return card.lastResult ?? null;
  return null;
}

export function pickToday(cards, logs, todayISO) {
  const todayLogs = (Array.isArray(logs) ? logs : []).filter((l) => l?.date === todayISO);
  const newIds = new Set(todayLogs.flatMap((l) => (Array.isArray(l.newSentenceIds) ? l.newSentenceIds : [])));
  const ids = new Set([...newIds, ...todayLogs.flatMap((l) => (Array.isArray(l.sentenceIds) ? l.sentenceIds : []))]);
  const pool = (Array.isArray(cards) ? cards : []).filter((c) => isActive(c) && ids.has(c.id));
  const key = (c) => [RESULT_RANK[todayResult(c, todayISO)] || 0, newIds.has(c.id) ? 1 : 0, learnedAt(c)];
  pool.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (kb[0] - ka[0]) || (kb[1] - ka[1]) || kb[2].localeCompare(ka[2]);
  });
  return pool.slice(0, SPEAK_MAX).map(toSpeakItem);
}

export function pickHard(cards, todayISO) {
  const cutoff = todayPlusDays(todayISO, -HARD_WINDOW_DAYS);
  const lastFail = (c) => {
    const hist = Array.isArray(c?.resultHistory) ? c.resultHistory : [];
    const fails = hist.filter((x) => x?.result === 'X' && str(x?.date) >= cutoff).map((x) => str(x.date)).sort();
    if (fails.length) return fails[fails.length - 1];
    if (c?.lastResult === 'X') return str(c.lastResultAt).slice(0, 10) || cutoff;
    return null;
  };
  const pool = (Array.isArray(cards) ? cards : []).filter(isActive)
    .map((c) => ({ c, d: lastFail(c) })).filter((x) => x.d);
  pool.sort((a, b) => b.d.localeCompare(a.d) || learnedAt(b.c).localeCompare(learnedAt(a.c)));
  return pool.slice(0, SPEAK_MAX).map((x) => toSpeakItem(x.c));
}

export function pickRandom(cards, rng = Math.random) {
  const pool = (Array.isArray(cards) ? cards : []).filter(isActive);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, SPEAK_MAX).map(toSpeakItem);
}

export async function loadSpeakItems(db, lang, scope, todayISO, rng = Math.random) {
  if (!db?.reviewQueue?.where) return [];
  const cards = await db.reviewQueue.where('lang').equals(lang).toArray();
  if (scope === 'random') return pickRandom(cards, rng);
  if (scope === 'hard') return pickHard(cards, todayISO);
  const logs = db.sessionLogs?.where ? await db.sessionLogs.where('date').equals(todayISO).toArray() : [];
  return pickToday(cards, logs.filter((l) => !l?.lang || l.lang === lang), todayISO);
}
```

- [x] **Step 4: 통과 확인**

Run: `pnpm test -- src/services/speakPicks.test.js`
Expected: PASS

- [x] **Step 5: 커밋**

```bash
git add src/services/speakPicks.js src/services/speakPicks.test.js
git commit -m "feat(study): 말하기 연습 표현 선별 — 오늘/어려웠던/랜덤 3범위, 상한 5, 매번 DB 에서 다시 읽음"
```

---

### Task 3: 말하기 연습 화면 `#/speak` + mocks 스텁 + 라우트

**Files:**
- Create: `src/pages/speak.js`, `mocks/speak.html`
- Modify: `src/app.js` (import 2줄, `ROUTES.speak`, `PAGE_MOUNTS.speak`)
- Test: `src/pages/speak.test.js`

**Interfaces:**
- Consumes: `loadSpeakItems`, `SPEAK_SCOPES` (Task 2), `buildVoicePrompt` (Task 1), `h`, `V_VARS`, `VI`, `vIcon`, `v2Style`, `ensureV2Fonts`, `localISODate`.
- Produces: `mountSpeak(host)`, `SCOPE_LABELS`.

- [x] **Step 1: 실패하는 테스트** — `src/pages/speak.test.js`

```js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountSpeak } from './speak.js';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const T = '2026-09-08';
const CARDS = [
  { id: 'n1', lang: 'en', sentence: 'It depends on what you want to do.', meaning: '네가 뭘 하고 싶은지에 따라 달라.', explanation: { key: 'it depends on = ~에 따라 다르다', situation: '결정을 미룰 때' }, promotedAt: '2026-09-08T09:00:00Z' },
  { id: 'n2', lang: 'en', sentence: "I'd love to, but I already have plans.", meaning: '정말 그러고 싶은데 이미 약속이 있어.', explanation: { key: "I'd love to, but = 그러고 싶지만", situation: '제안을 거절할 때' }, promotedAt: '2026-09-08T10:00:00Z' },
  { id: 'h1', lang: 'en', sentence: 'Sorry, could you say that again more slowly?', meaning: '미안한데 다시 천천히 말해줄래요?', explanation: { key: 'could you say that again = 다시 말해 줄래요', situation: '못 알아들었을 때' }, lastResult: 'X', promotedAt: '2026-09-03T00:00:00Z' },
];
const LOGS = [{ date: T, lang: 'en', mode: 'new', newSentenceIds: ['n1', 'n2'], sentenceIds: ['n1', 'n2'] }];

describe('mountSpeak — 범위 선택 → 표현 체크 → 프롬프트 복사', () => {
  let host, write;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    sessionStorage.setItem('studyLang', 'en');
    window.studyDay = { TODAY_ISO: T };
    window.studyDB = {
      reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => CARDS }) }) },
      sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => LOGS }) }) },
    };
    write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
  });
  afterEach(() => { host.remove(); delete window.studyDay; vi.restoreAllMocks(); });

  it('진입 시 오늘 범위 — 표현 2개, 프롬프트에 표현·상황·ChatGPT 안내', async () => {
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="today"]').classList.contains('on')).toBe(true);
    const labels = [...host.querySelectorAll('[data-role="item"] .ex')].map((n) => n.textContent);
    expect(labels).toEqual(["I'd love to, but", 'it depends on']);
    const ta = host.querySelector('textarea');
    expect(ta.value.split('\n')[0]).toContain('ChatGPT');
    expect(ta.value).toContain('it depends on');
    expect(ta.value).toContain('결정을 미룰 때');
  });

  it('체크를 풀면 프롬프트에서 빠진다', async () => {
    mountSpeak(host); await flush();
    const box = host.querySelector('[data-role="item"] input[type="checkbox"]');
    box.click(); await flush();
    expect(host.querySelector('textarea').value).not.toContain("I'd love to, but");
    expect(host.querySelector('textarea').value).toContain('it depends on');
  });

  it('최근 어려웠던 표현 범위 → X 카드', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-scope="hard"]').click(); await flush();
    const labels = [...host.querySelectorAll('[data-role="item"] .ex')].map((n) => n.textContent);
    expect(labels).toEqual(['could you say that again']);
  });

  it('복사 버튼 → 클립보드에 프롬프트', async () => {
    mountSpeak(host); await flush();
    host.querySelector('[data-role="copy"]').click(); await flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(host.querySelector('textarea').value);
    expect(host.querySelector('[data-role="copy"]').textContent).toContain('복사됨');
  });

  it('오늘 표현이 없으면 어려웠던 표현으로 자동 전환', async () => {
    window.studyDB.sessionLogs = { where: () => ({ equals: () => ({ toArray: async () => [] }) }) };
    mountSpeak(host); await flush();
    expect(host.querySelector('[data-scope="hard"]').classList.contains('on')).toBe(true);
    expect(host.textContent).toContain('오늘 학습한 표현이 없어');
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test -- src/pages/speak.test.js`
Expected: FAIL — 모듈 없음.

- [x] **Step 3: 화면 구현** — `src/pages/speak.js`

```js
/* 말하기 연습 — 배운 표현으로 ChatGPT 음성 대화 프롬프트를 만든다 (2026-09-08 작업지시서 §5~§9).
 * 종전엔 세션 요약(summaryV2)에서만 나와 화면을 닫으면 다시 만들 수 없었다. 여기서는 저장된 프롬프트 없이
 * 매번 Dexie 에서 표현을 다시 고른다(services/speakPicks.js). 영어 전용. 마운트 구조는 listen.js 와 같다. */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { loadSpeakItems, SPEAK_SCOPES, SPEAK_MAX } from '../services/speakPicks.js';
import { buildVoicePrompt } from '../services/voicePrompt.js';
import { localISODate } from '../utils/today.js';

export const SCOPE_LABELS = { today: '오늘 배운 표현', hard: '최근 어려웠던 표현', random: '랜덤 복습' };
const EMPTY_TEXT = { today: '오늘 학습한 표현이 없어요', hard: '최근 어려웠다고 판정한 표현이 없어요', random: '복습 카드가 없어요' };
const getTodayISO = () => window.studyDay?.TODAY_ISO || localISODate();

const CSS = `
.sp{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.sp *{box-sizing:border-box;margin:0}
.sp button{font-family:inherit;cursor:pointer}
.sp-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.sp-top-in{width:100%;max-width:560px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.sp-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0}
.sp-wrap{width:100%;max-width:560px;margin:0 auto;padding:36px 20px 56px;display:flex;flex-direction:column;gap:16px}
.sp-h1{font-family:Outfit,Pretendard,sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.sp-sub{font-size:14px;color:var(--mut);line-height:1.5}
.sp-scopes{display:flex;gap:8px;flex-wrap:wrap}
.sp-scope{font-size:13px;font-weight:700;padding:9px 14px;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink)}
.sp-scope.on{background:var(--teal);border-color:var(--teal);color:var(--card)}
.sp-list{display:flex;flex-direction:column;gap:6px}
.sp-item{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line)}
.sp-item input{width:18px;height:18px;margin-top:2px;accent-color:var(--teal)}
.sp-item .ex{display:block;font-size:16px;font-weight:700;line-height:1.35}
.sp-item .si{display:block;font-size:12.5px;color:var(--mut);margin-top:2px}
.sp-empty{font-size:14px;color:var(--mut);padding:18px 0}
.sp-steps{font-size:13px;color:var(--mut);line-height:1.6;padding:12px 14px;border-radius:12px;background:var(--teal-soft)}
.sp-ta{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-size:12.5px;line-height:1.5;resize:vertical;font-family:inherit}
.sp-copy{font-size:15px;font-weight:800;padding:14px 18px;border-radius:12px;border:0;background:var(--teal);color:var(--card)}
.sp-copy:disabled{opacity:.45;cursor:default}`;

function getLang() { try { return sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } }

export function mountSpeak(host) {
  ensureV2Fonts();
  host.innerHTML = '';
  const lang = getLang();
  const todayISO = getTodayISO();
  let scope = 'today';
  let items = [];
  const checked = new Set();

  const scopeBtns = SPEAK_SCOPES.map((s) => h('button', { class: 'sp-scope', type: 'button', 'data-scope': s, onClick: () => load(s, false) }, SCOPE_LABELS[s]));
  const listEl = h('div', { class: 'sp-list', 'data-role': 'list' });
  const ta = h('textarea', { class: 'sp-ta', readonly: 'readonly', rows: '10' });
  const COPY_LABEL = '프롬프트 복사';
  const copyBtn = h('button', { class: 'sp-copy', type: 'button', 'data-role': 'copy' }, COPY_LABEL);
  copyBtn.addEventListener('click', async () => {
    const text = ta.value;
    try { await navigator.clipboard.writeText(text); }
    catch { try { ta.focus(); ta.select(); document.execCommand('copy'); } catch { /* noop */ } }
    copyBtn.textContent = '복사됨 ✓';
    setTimeout(() => { copyBtn.textContent = COPY_LABEL; }, 1500);
  });

  const paintScopes = () => scopeBtns.forEach((b) => b.classList.toggle('on', b.getAttribute('data-scope') === scope));
  const paintPrompt = () => {
    const sel = items.filter((it) => checked.has(it.id));
    ta.value = buildVoicePrompt(sel);
    copyBtn.disabled = sel.length === 0;
  };
  const paintList = () => {
    listEl.replaceChildren(...(items.length ? items.map((it) => {
      const box = h('input', { type: 'checkbox', checked: checked.has(it.id) });
      box.addEventListener('change', () => { if (box.checked) checked.add(it.id); else checked.delete(it.id); paintPrompt(); });
      return h('label', { class: 'sp-item', 'data-role': 'item' }, box,
        h('span', {}, h('span', { class: 'ex' }, it.expr), it.situation ? h('span', { class: 'si' }, it.situation) : null));
    }) : [h('div', { class: 'sp-empty' }, `${EMPTY_TEXT[scope]} · 다른 범위를 골라 보세요`)]));
    paintPrompt();
  };

  /* fallback=true(진입 시): 오늘 → 어려웠던 → 랜덤 순으로 비어 있지 않은 첫 범위를 연다. */
  async function load(s, fallback) {
    scope = s; paintScopes();
    let got = [];
    try { got = await loadSpeakItems(window.studyDB, lang, s, todayISO); } catch (e) { console.error('[speak] load', e); got = []; }
    if (!got.length && fallback) {
      const next = SPEAK_SCOPES[SPEAK_SCOPES.indexOf(s) + 1];
      if (next) return load(next, true);
    }
    items = got; checked.clear(); items.forEach((it) => checked.add(it.id));
    paintList();
  }

  const root = h('div', { class: 'sp' }, v2Style(CSS),
    h('div', { class: 'sp-top' }, h('div', { class: 'sp-top-in' },
      h('button', { class: 'sp-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'sp-sub' }, '영어'))),
    h('div', { class: 'sp-wrap' },
      h('h1', { class: 'sp-h1' }, '말하기 연습'),
      h('div', { class: 'sp-sub' }, `배운 표현 최대 ${SPEAK_MAX}개로 ChatGPT 음성 대화 프롬프트를 만듭니다. 상대가 표현을 먼저 말하지 않고, 비슷하지만 다른 상황을 만들어 그 표현이 필요해지게 이끕니다.`),
      h('div', { class: 'sp-scopes' }, scopeBtns),
      listEl,
      h('div', { class: 'sp-steps' }, '1 복사 → 2 ChatGPT 새 대화에 붙여 넣어 보내기 → 3 같은 대화에서 음성 모드 시작 → 4 약 10분 대화 → 5 끝나면 못 한 표현을 문장 모아보기에서 확인'),
      ta, copyBtn));
  host.appendChild(root);
  load('today', true);
}
```

`mocks/speak.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#faf9f5">
<title>Study · 말하기 연습</title>
<link rel="stylesheet" href="/src/styles/tokens.css">
<style>
  body { margin: 0; }
  #root { min-height: 100vh; min-height: 100dvh; }
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
  import { mountSpeak } from '/src/pages/speak.js';
  /* ?demo=1 — 시드 카드로 가짜 DB 를 채운다 (브라우저 화면 검증용, 로그인 불필요). */
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  if (demo) {
    const seed = (await import('/seeds/en-core100-2026-08-26.json')).default;
    const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const cards = seed.cards.map((c, i) => ({ ...c, lang: 'en', promotedAt: `${iso}T0${i}:00:00Z`, ...(i === 0 ? { lastResult: 'X' } : {}) }));
    const logs = [{ date: iso, lang: 'en', mode: 'new', newSentenceIds: cards.map((c) => c.id), sentenceIds: cards.map((c) => c.id) }];
    const table = (rows) => ({ where: () => ({ equals: () => ({ toArray: async () => rows }) }) });
    window.studyDB = { reviewQueue: table(cards), sessionLogs: table(logs) };
    sessionStorage.setItem('studyLang', 'en');
  }
  mountSpeak(document.getElementById('root'));
</script>
</body>
</html>
```

`src/app.js` — import 두 줄 추가(`listenHtml` 줄 뒤에 `import speakHtml from '../mocks/speak.html?raw';`, `mountListen` 줄 뒤에 `import { mountSpeak } from './pages/speak.js';`), `ROUTES` 에 `speak: speakHtml,`, `PAGE_MOUNTS` 에 `speak: mountSpeak,`.

- [x] **Step 4: 통과 확인**

Run: `pnpm test -- src/pages/speak.test.js`
Expected: PASS (5개)

- [x] **Step 5: 커밋**

```bash
git add src/pages/speak.js src/pages/speak.test.js mocks/speak.html src/app.js
git commit -m "feat(study): 말하기 연습 화면 #/speak — 오늘/어려웠던/랜덤 표현 고르고 ChatGPT 프롬프트 복사"
```

---

### Task 4: 홈 진입점 + 요약 화면 연결

**Files:**
- Modify: `src/pages/homeDesktopV2.js:347-350` (ctaCard 의 연속 듣기 버튼 뒤)
- Modify: `src/pages/summaryV2.js:13-31` (buildVoiceEl 문구·링크)
- Test: `src/pages/homeDesktopV2.test.js:121-125`

**Interfaces:**
- Consumes: 없음(라우트 `#/speak`).

- [x] **Step 1: 실패하는 테스트** — `homeDesktopV2.test.js` 의 'CTA 3개 — 학습 시작은 하나뿐' 기대값을 확인해 `state.lang === 'en'` 인 경우 `['학습 시작', '복습 시작', '문장 모아보기', '연속 듣기', '말하기 연습']` 로 바꾸고, 아래 it 을 추가한다.

```js
  it('말하기 연습 CTA 는 영어에만 있다', () => {
    const en = renderHomeDesktopV2(demoState({ lang: 'en' }));
    const ja = renderHomeDesktopV2(demoState({ lang: 'ja' }));
    expect([...en.querySelectorAll('.vh-cta .t1')].map((n) => n.textContent)).toContain('말하기 연습');
    expect([...ja.querySelectorAll('.vh-cta .t1')].map((n) => n.textContent)).not.toContain('말하기 연습');
  });
```

(`demoState` 는 그 테스트 파일이 이미 쓰는 상태 빌더 이름을 그대로 쓴다. 이름이 다르면 파일 상단의 것을 따른다.)

- [x] **Step 2: 실패 확인**

Run: `pnpm test -- src/pages/homeDesktopV2.test.js`
Expected: FAIL — '말하기 연습' 없음.

- [x] **Step 3: 구현**

`homeDesktopV2.js` ctaCard 의 연속 듣기 버튼 바로 뒤에:

```js
    /* 말하기 연습 (2026-09-08 작업지시서 §5) — 배운 표현으로 ChatGPT 음성 대화 프롬프트. 프롬프트가 영어 코칭 전용이라 영어에만. */
    state.lang === 'en' ? h('button', { class: 'vh-cta sec', type: 'button', onClick: () => { window.location.hash = '#/speak'; } },
      h('span', {}, h('span', { class: 't1' }, '말하기 연습'), h('span', { class: 't2' }, 'ChatGPT 음성 모드 · 오늘 표현 · 약 10분')),
      h('span', { class: 'go' }, '열기')) : null,
```

`summaryV2.js` buildVoiceEl: 주석을 `// ChatGPT 음성 모드 말하기 연습 프롬프트 블록 — 세션 끝에서 복사 → 붙여넣기. 나중에는 #/speak 에서 다시 만든다.` 로, 제목을 `'🎙 ChatGPT 음성 모드로 말하기 연습'` 으로, 설명을 `'ChatGPT 새 대화에 붙여 넣어 보낸 뒤 같은 대화에서 음성 모드를 시작하세요. 나중에 다시 만들려면 홈의 말하기 연습.'` 으로 바꾸고, copyBtn 뒤에 아래 버튼을 추가한다.

```js
  const laterBtn = h('button', { type: 'button', onClick: () => { window.location.hash = '#/speak'; },
    style: 'margin:10px 0 0 8px;padding:10px 18px;border:1px solid var(--line,#cfc8b8);border-radius:10px;background:transparent;color:var(--mut,#8a8170);font-size:14px;font-weight:700;cursor:pointer;' }, '말하기 연습 열기');
```

반환 `h('div', …, ta, copyBtn)` 을 `h('div', …, ta, copyBtn, laterBtn)` 으로.

- [x] **Step 4: 전체 테스트·빌드**

Run: `pnpm test` 그리고 `pnpm build`
Expected: 모두 PASS, 빌드 성공.

- [x] **Step 5: 브라우저 확인** — `study-dev`(포트 5183) 미리보기에서 `/mocks/speak.html?demo=1` 열어 범위 전환·체크 해제·복사 동작과 스크린샷. 콘솔 오류 0.

- [x] **Step 6: 커밋**

```bash
git add src/pages/homeDesktopV2.js src/pages/homeDesktopV2.test.js src/pages/summaryV2.js
git commit -m "feat(study): 홈 CTA·세션 요약에서 말하기 연습(#/speak) 진입 — 요약 프롬프트 문구 ChatGPT 기준"
```

---

### Task 5: 문서 동기화

**Files:**
- Modify: `specs/study-app-spec.md` (§9-8 뒤에 §9-9 추가, §10 요약에 한 줄)
- Modify: `docs/2026-09-08-speak-loop-plan.md` (이 문서: 완료 표시·후속 계획 링크)

- [x] **Step 1: 스펙 §9-9 추가**

```markdown
### 9-9. 말하기 연습 (2026-09-08 작업지시서 §5~§9 — 기획 정본)

**목적**: 배운 표현을 ChatGPT 음성 모드에서 실제 대화로 꺼내 쓰게 한다(즉석 인출·턴 교대·예측 못 한 후속 질문·맥락 전이). 세션 요약에서만 나오던 프롬프트를 홈에서 언제든 다시 만든다.

**진입**: 영어 홈 CTA 카드의 보조 버튼 "말하기 연습"(연속 듣기 옆) → `#/speak`. 세션 요약의 프롬프트 블록에도 "말하기 연습 열기".

**범위 3개**(`services/speakPicks.js`): 오늘 배운 표현(오늘 세션 로그의 카드) / 최근 어려웠던 표현(14일 안 X 판정, 최근 실패 순) / 랜덤 복습. 상한 5. 오늘 카드가 넘치면 오늘 판정 X > △ > 나머지, 같으면 신규 > 복습, 같으면 나중에 배운 순. 진입 시 비어 있으면 다음 범위로 자동 전환. 표현은 체크로 뺄 수 있다. 저장된 프롬프트는 없고 매번 Dexie 에서 다시 읽는다.

**프롬프트**(`services/voicePrompt.js`): 표현마다 핵심 표현·예문·`explanation.situation` 을 동봉. 규칙: 타깃을 먼저 말하지 않기, 원래 상황과 비슷하지만 다른 상황 만들기, 두 턴 뒤 첫 단어 힌트, 성공하면 다른 상황에서 한 번 더, 퀴즈 금지. 나머지 코칭 규칙(짧은 턴·질문 주도·자가수정 유도·한국어 최후 수단)은 2026-06-30 조사 그대로. ChatGPT 한 경로(클로드 토글 없음).

**사용 절차**: 복사 → ChatGPT 새 대화에 붙여 넣어 보내기 → 같은 대화에서 음성 모드 시작 → 약 10분.
```

- [x] **Step 2: 커밋 + 푸시** (본 세션 파일만)

```bash
git add specs/study-app-spec.md docs/2026-09-08-speak-loop-plan.md
git commit -m "docs(study): 말하기 연습 §9-9 스펙 + 구현 계획 문서"
git push origin main
```

---

## 후속 계획 (별도 문서로 작성)

1. **미니대화**(작업지시서 §1~§4, 2026-09-08 사용자 확정 보강):
   - 목적은 **맥락 입력**이지 수행 평가가 아니다. 화면은 전체 듣기·한 줄 듣기·타깃 줄 강조(두 화자 음성 교대)만 둔다. **학습 게이트 금지** — 녹음 횟수·대화문 암기·통과 판정·다음 버튼 잠금·대화문 SRS·대화 전체 발음 점수를 붙이지 않는다.
   - 필드 `explanation.miniDialogue = [{speaker, en, ko}]` optional. 신규 세션 렌더러(`sessionExprV2.js`) 카드 상단 블록. 공유 해설 패널에는 넣지 않는다(복습에서 정답 유출).
   - 턴 수는 표현에 따라 2~4턴, 평균 3턴 목표. 100장에 기계적으로 3턴을 붙여 `A 질문 → B 타깃 → A Okay` 로 획일화하지 않는다.
   - 시드 저작 검사(`validate-seed.mjs`, 기존 errors/warnings 구분에 얹는다. 학습자 화면과 무관) — 2026-09-08 사용자 확정 등급:
     · 차단: 2~4턴 밖 / 타깃 줄 영어가 카드 `sentence` 와 완전 일치하지 않거나 1회가 아님 / 타깃 외 줄에 **아직 안 배운 뒤쪽 묶음**의 코어100 핵심 표현이 들어감(새 학습 부담).
     · 경고: 타깃 외 줄 11~12단어(10단어 이하가 기본 기준. 짧게 자르느라 `A 질문 → B 타깃 → A Okay` 로 수렴하면 목적과 충돌하므로 하드 조건으로 두지 않는다) / 이미 배운 앞쪽 묶음의 핵심 표현이 상대 발화에 나옴(복습 효과라 허용).
     · 사람이 최종 검수: 대화 전체 난도가 타깃보다 높아지는지, 상대 발화가 타깃을 유발하는지.
   - **순서**: 먼저 `#/speak` 를 실제 ChatGPT Voice 로 2~3회 써 본 뒤(프롬프트 작동 확인 → 미니대화가 줄 맥락의 종류가 분명해짐) 계획을 쓴다. 사용 시 관찰 항목 5개: 타깃을 먼저 말하는가 / 턴이 짧고 기다리는가 / 교정이 한 번에 하나인가 / 프롬프트가 너무 긴가 / **표현을 노골적으로 유도하는가**("You've wanted to ask me something for a while. What can you say?" 처럼 뜻을 풀어 답을 암시하면 회상 퀴즈가 된다. 관찰되면 voicePrompt 에 "상황만 만들고 표현 선택은 나에게 맡긴다, 타깃의 뜻을 풀어 말하지 않는다" 규칙 추가). 구현은 **미완료 첫 묶음 6장(19~24번, 시드 `en-core100-2026-09-06.json`)에만** 콘텐츠와 UI 를 붙여 실제 신규 세션에서 검토한다. 1~18번은 완료 카드라 재적재가 막히고 신규 세션에 다시 나오지 않으므로 샘플 대상이 아니다. 나머지 76장 저작은 검토 뒤.
   - 검토 기준 4가지: 타깃 문장이 대화에서 자연스럽게 나오는가 / 앞뒤 문장이 타깃보다 어려워 새 부담을 만들지 않는가 / `situation` 을 영어로 옮긴 수준이 아니라 상대 발화가 타깃 표현을 유발하는가 / 카드마다 패턴이 획일적이지 않은가.
2. **복습 단서 다양화**: 2회차부터 `drills[].ko`·`situation` 을 돌려 가며 단서로. 정답이 여러 개가 되므로 판정은 자기평가만, 녹음 게이트는 핵심 표현 포함 여부로 완화.

## Self-review 기록

- 스펙 대조: §5(상시 접근·홈 진입) → Task 3·4, §6(범위 3·상한 5·매번 DB) → Task 2·3, §7(ChatGPT 단일) → Task 1·4, §8(situation·맥락 전이) → Task 1, §9(정식 단계) → 스펙 §9-9. §1~§4·4차는 후속 계획으로 명시.
- 타입 일관성: `loadSpeakItems(db, lang, scope, todayISO, rng)` 와 화면 호출 일치, `buildVoicePrompt(items)` 객체 필드 `expr/situation/sentence` 와 `toSpeakItem` 반환 필드 일치.
