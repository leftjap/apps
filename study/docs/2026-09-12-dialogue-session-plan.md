# 대화 단위 세션 1차 (미니대화 녹음 복원 · 체이닝 숨김 · 복습 상대 줄 단서 · personal 트랙) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문장 단위 SRS 는 그대로 두고 신규·복습 화면의 제시·연습·단서 단위를 미니대화로 옮긴다(줄마다 녹음되는 최대 8턴 대화 + 복습에서 상대 줄 단서). 체이닝·생산 연습 블록은 숨기고, 일기 소재 `personal` 트랙 시드가 게이트를 통과해 봇 계정 화면에 뜨게 한다.

**Architecture:** 데이터 모델은 바꾸지 않는다. 카드(`sentence`)가 SRS·채점·이력 단위이고 `explanation.miniDialogue` 가 대화 컨테이너다. 화면은 (1) 2026-09-08 커밋 `9aa85e7` 에서 제거한 미니대화 줄 녹음을 그 직전 상태에서 복원하고, (2) 체이닝·생산 블록을 모듈 플래그 `SESSION_BLOCKS.chainProd=false` 로 숨기며(코드·게이트·이력 키 유지), (3) 복습 회상 모드에 타깃 직전 상대 줄을 단서로 붙인다. 시드 게이트는 `track: 'personal'` 을 sceneless 면제 + chain 비의무로 받고 miniDialogue 턴 한도를 2~8 로 올린다.

**Tech Stack:** Vanilla JS PWA(Vite), DOM 헬퍼 `h()`(`src/components/d1/dom.js`, null 자식 무시), vitest(jsdom), Node ESM 스크립트(`scripts/validate-seed.mjs`, `scripts/seed-supabase.mjs`), Supabase(자격증명 `~/.config/study/.env`).

**Spec:** 이 문서 §0(2026-09-12 사용자 확정 결정) + 시안 `~/apps/tmp/2026-09-12-study-personalized-draft-v2.md`(미추적, 개인 소재).

## Global Constraints

- 작업 디렉터리는 `~/apps/study`. 단일 파일 테스트는 `pnpm exec vitest run <파일>`, 전체는 `pnpm test`(= `vitest run`). `pnpm vitest` 를 `run` 없이 부르지 않는다(watch 로 멈추고 훅이 차단한다).
- 커밋은 모노레포 루트 `~/apps` 에서 `git add study/<파일>` 로 본 계획이 만든 파일만 올린다. Conventional Commits, 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. push 는 Task 5 뒤 사용자 확인 후에만.
- Stop 훅이 추적 파일 편집분을 `WIP(claude-snapshot)` 로 선점 커밋할 수 있다. 그러면 `git reset --soft HEAD~1` 로 풀어 의미 커밋에 합친다(`--hard` 금지).
- 기존 체이닝·생산 테스트는 삭제하지 않는다. 테스트에서 플래그를 켜 계속 검증한다(코드를 되살릴지 없앨지는 추후 결정).
- 공개 저장소(`leftjap/apps`)에 개인 소재 시드를 올리지 않는다. personal 시드는 `study/seeds/personal/` 에 두고 `.gitignore` 로 제외한다.
- 주석·문서는 한국어, 날짜는 `2026-09-12`, 기존 파일 관례(§ 번호, "사용자 결정" 인용)를 따른다.

## §0 결정 사항 (사용자, 2026-09-12)

1. SRS·채점·기록 단위 = 문장(카드). 제시·연습·단서 단위 = 대화(`miniDialogue`).
2. 체이닝(`chainBlockEl`)·생산 연습(`productionBlockEl`) 블록은 신규·복습 화면에서 숨긴다. 코드·시드 필드·이력 키(`#chain#`·`#prod#`)·게이트는 유지한다.
3. 미니대화 줄마다 녹음 버튼. 줄 구성은 응용 행과 똑같다(사용자 2026-09-13): 영문 · 한글 뜻 · 한글 발음(`kr`) · 듣기 · 녹음. 채점·점수 원·오늘 발화 집계·`#mini#` 이력 저장은 응용 행과 같고, 진행 조건·SRS 영향은 없다. 복습에서도 정답 공개 뒤 같은 블록을 쓴다. TTS 는 화자 성별로만 나눈다(A 여성·B 남성).
4. 응용(drills)은 그대로 두고 복습 큐에 넣지 않는다(현행과 같으므로 코드 변경 없음).
5. 복습 회상 모드: 정답 공개 전부터 타깃 직전 상대 줄(`miniDialogue[t-1]`)을 텍스트+듣기로 보여준다. 2026-07-10 "힌트 없음" 결정과의 관계: 단어 수·첫 글자처럼 답을 좁히는 힌트가 아니라 그 문장을 말하게 만드는 상황(상대의 말)이다. 정답 텍스트는 담지 않는다.
6. 시드 게이트: `track: 'personal'` = sceneless 면제 + chain 비의무. miniDialogue 는 전 트랙 2~8턴. 코어100 순서 검사는 core100 트랙에만. 줄에 선택 필드 `name`(화면 화자 칸 표시)·`kr`(한글 발음). personal 트랙 줄은 `ko`·`kr` 의무(응용 행의 en/ko/kr 의무와 같음). 음성은 A 여성·B 남성 둘이면 된다(사용자 2026-09-13 "성별만 나누면 될 듯") — C/D 는 추가하지 않는다.
7. 장면 한 줄 = `explanation.situation` 을 미니대화 라벨 아래에 표시한다(새 필드 없음).
8. 파일럿 시드 = 시안 2(공항 픽업) 카드 4장. 다른 시드처럼 `seeds/` 에 두고 커밋한다(사용자 2026-09-13: 대한항공·소연·병원 같은 내용은 공개돼도 상관없음). 봇 계정에서 화면을 확인한 뒤(Task 5) 사용자 계정에 적재한다(Task 6).
9. 영어 트랙 리셋(사용자 2026-09-13 "기존 세션과 복습 전부 없애고 신규 세션 생성하고 세션 공부 완료시 복습도 신규 세션분으로"): 사용자 계정(`7bae5645-61c6-4476-9ff2-4c30a72812ff`)의 영어(`lang=en`) `study_today_lessons` 행 삭제 + `study_review_queue` 영어 행 tombstone(`explanation._deleted=true` — 2026-07-22 서버 정본 규약, 행 삭제는 reconcile 이 되살리므로 금지). 기기 쪽은 다음 sync 의 pull 이 지운다(todayLessons 는 serverOwned 삭제 전파 `staleIdsToDelete`, reviewQueue 는 tombstone 제거). 삭제 전 JSON 백업. **일본어·수학·발음 이력(`study_pronunciation_log`)·세션 로그·일별 통계는 건드리지 않는다.** 새 세션을 완료하면 기존 `sessionFinish` 가 그 카드만 복습 큐에 넣으므로 복습은 새 세션분에서 시작된다(코드 변경 없음). 리셋은 사용자가 앱을 열지 않은 상태에서 한다(진행 중 스냅샷 `activeSession` 은 TTL 1시간).

## File Structure

| 파일 | 책임 |
|---|---|
| `src/pages/sessionExprV2.js` (수정) | `SESSION_BLOCKS` 플래그, `MINI_VOICES` export(C/D 추가), `miniDialogueEl` 녹음·이름·장면 옵션, 조립부 chain/prod 분기 |
| `src/pages/sessionReviewV2.js` (수정) | chain 분기, 미니대화 녹음 옵션 배선, 상대 줄 단서 블록 `.vr-cue` |
| `src/services/pronunciationLog.js` (수정) | `miniLogId`·`miniLinesOf` export, `loadScoreHistoryState` 의 `mini` 수화 |
| `src/components/session/applied.js` (수정) | 순수 헬퍼 `miniCueLine(md, sentence)` |
| `scripts/validate-seed.mjs` (수정) | personal 트랙·턴 한도·chain 의무 범위·core100 검사 범위 |
| 테스트 | `src/pages/sessionExprV2.test.js`, `src/pages/sessionReviewV2.test.js`, `src/services/pronunciationLog.test.js`, `src/components/session/applied.test.js`, `scripts/validate-seed.test.mjs` |
| `scripts/reset-en-track.mjs` (신규) + `scripts/reset-en-track.test.mjs` | 영어 트랙 리셋: 백업 → review tombstone → lessons 삭제. 순수 헬퍼 `withTombstone`·`splitTargets` 만 단위 테스트 |
| 문서 | `docs/explanation-schema.md`, `specs/study-app-spec.md`, `seeds/README.md` |
| 신규 시드 | `seeds/en-personal-2026-09-13.json` (다른 시드처럼 커밋) |

---

### Task 1: 시드 게이트 — personal 트랙, miniDialogue 2~8턴, chain 의무 범위

**Files:**
- Modify: `scripts/validate-seed.mjs:175` (isScenelessTrack), `scripts/validate-seed.mjs:369-376` (chain 의무), `scripts/validate-seed.mjs:545-556` (턴 한도 주석·검사), `scripts/validate-seed.mjs:551,577` (core100 순서 검사 범위)
- Modify: `docs/explanation-schema.md` §miniDialogue 규칙(약 186행), §chain 머리(141행)
- Test: `scripts/validate-seed.test.mjs` (파일 끝에 describe 추가)

**Interfaces:**
- Consumes: `validateSeedContent(payload, opts)`; 테스트 파일의 모듈 상수 `okOpts`(109행), 헬퍼 `poolDrills(n)`.
- Produces: `payload.track === 'personal'` 을 받는 게이트. Task 5 의 시드가 이 게이트를 통과해야 한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `scripts/validate-seed.test.mjs` 맨 끝에 추가

```js
/* personal 트랙 (2026-09-12 사용자 결정) — 일기 소재 개인화 세션. sceneless 면제 + chain 비의무(화면에서 체이닝을 숨겼다),
 * miniDialogue 는 전 트랙 2~8턴, 코어100 순서 검사는 core100 트랙에만. */
describe('validateSeedContent — personal 트랙 (2026-09-12)', () => {
  const S = "I'm on my way.";
  const CH = [["I'm", '아임', '나는'], ['on my way.', '온 마이 웨이', '가는 중']];
  const line = (speaker, en) => ({ speaker, en, ko: '뜻', kr: '음차' });
  const md8 = [
    line('A', "We landed early. It's 4:20."), line('B', S), line('A', "Take your time. It's freezing outside."),
    line('B', "I'll be there in forty minutes."), line('A', 'Did you sleep?'), line('B', "I didn't sleep at all."),
    line('A', 'You must be tired.'), line('B', "I'm almost there."),
  ];
  const card = (extra = {}) => ({
    id: 'en-personal-airport-01', sentence: S, meaning: '가는 중이야.', reading: null,
    phonetic_kr: CH.map((c) => c[1]).join(' '), order_index: 1,
    explanation: {
      key: "I'm on my way = 가는 중이야.", situation: '새벽 공항 픽업', drills: poolDrills(5),
      grammar: [{ struct: '구조', body: '설명' }], chunks: CH, phonemes: [['/w/', 'way']],
      mistake: '함정', similar: '대체', category: 'chunk/test', frequency: 8,
      miniDialogue: md8, ...extra,
    },
  });
  const payload = (c, track = 'personal') => ({ track, lang: 'en', date: '2026-09-14', cards: [c] });
  // 'You must be tired' 는 7번째 줄에 있다 — core100 검사가 personal 에도 돌면 '이미 배운/안 배운' 메시지가 샌다.
  const keys = [{ num: 99, id: 'en-core100-099', expr: 'you must be tired' }];

  it('personal: chain 없이 8턴 미니대화 → 통과', () => {
    const r = validateSeedContent(payload(card()), { ...okOpts, core100Keys: keys });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('9턴 → 차단 (2~8턴)', () => {
    const r = validateSeedContent(payload(card({ miniDialogue: [...md8, line('A', 'Okay.')] })), okOpts);
    expect(r.errors.some((e) => e.includes('2~8턴'))).toBe(true);
  });

  it('personal 줄에 ko 또는 kr 이 없으면 차단 (응용 행과 같은 en/ko/kr 의무)', () => {
    const noKr = md8.map((l, i) => (i === 2 ? { speaker: l.speaker, en: l.en, ko: l.ko } : l));
    const r = validateSeedContent(payload(card({ miniDialogue: noKr })), okOpts);
    expect(r.errors.some((e) => e.includes('miniDialogue 3줄 kr'))).toBe(true);
  });

  it('personal 카드에는 코어100 순서 검사를 하지 않는다 (경고·차단 없음)', () => {
    const r = validateSeedContent(payload(card()), { ...okOpts, core100Keys: keys });
    expect([...r.errors, ...r.warnings].some((m) => m.includes('코어100'))).toBe(false);
  });

  it('core100 트랙은 여전히 chain 의무', () => {
    const c = card(); c.id = 'en-core100-101-x';
    const r = validateSeedContent(payload(c, 'core100'), okOpts);
    expect(r.errors.some((e) => e.includes('chain 누락'))).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run scripts/validate-seed.test.mjs -t "personal 트랙"`
Expected: 4개 중 3개 FAIL — 첫 테스트는 `chain 누락` 과 `2~4턴` 에러로, 둘째는 메시지가 `2~4턴` 이라 `2~8턴` 미포함으로, 셋째는 `이미 배운 코어100 #99` 경고로 실패. 넷째만 PASS.

- [ ] **Step 3: 구현** — `scripts/validate-seed.mjs`

175행을 다음으로 교체:

```js
  // personal (2026-09-12): 일기 소재 개인화 트랙. 화면에서 체이닝·생산 블록을 숨겼으므로(sessionExprV2 SESSION_BLOCKS)
  // chain 은 비의무. sceneless 면제 경로는 moduyeongeo/core100 과 같다.
  const SCENELESS_TRACKS = ['moduyeongeo', 'core100', 'personal'];
  const CHAIN_REQUIRED_TRACKS = ['moduyeongeo', 'core100'];
  const isScenelessTrack = SCENELESS_TRACKS.includes(payload?.track);
  const chainRequired = CHAIN_REQUIRED_TRACKS.includes(payload?.track);
```

chain 의무 분기(373행 근처) `if (isScenelessTrack) {` → `if (chainRequired) {` 로 바꾼다(메시지는 그대로).

miniDialogue 검사(555행 근처):

```js
    if (!Array.isArray(md) || md.length < 2 || md.length > 8) {
      errors.push(`${c.id}: miniDialogue 는 2~8턴 배열 (현재 ${Array.isArray(md) ? `${md.length}턴` : typeof md})`);
      continue;
    }
```

그 위 주석의 `차단 = 턴 2~4 밖` 을 `차단 = 턴 2~8 밖 (2026-09-12: 대화 단위 세션으로 4→8)` 로 고친다.

같은 루프에서 `if (broken) continue;` 바로 뒤에 추가한다(personal 트랙은 줄 구성이 응용 행과 같아야 한다 — 사용자 2026-09-13):

```js
    // personal 트랙 (2026-09-13): 줄마다 영문·한글 뜻·한글 발음이 응용 행과 같은 의무 — 화면 줄 구성이 응용 행과 동일하다.
    if (payload?.track === 'personal') {
      md.forEach((l, i) => {
        if (typeof l.ko !== 'string' || !l.ko.trim()) errors.push(`${c.id}: miniDialogue ${i + 1}줄 ko(한글 뜻) 누락 — personal 트랙은 줄마다 en/ko/kr 의무`);
        if (typeof l.kr !== 'string' || !l.kr.trim()) errors.push(`${c.id}: miniDialogue ${i + 1}줄 kr(한글 발음) 누락 — personal 트랙은 줄마다 en/ko/kr 의무`);
      });
    }
```

`const wc = (str) => ...` 바로 아래에 추가하고, `for (const k of core100Keys) {` 를 `for (const k of orderKeys) {` 로 바꾼다:

```js
  // 코어100 순서 검사(안 배운 뒤쪽 묶음 표현 삽입 차단)는 core100 트랙 전용 (2026-09-12) — personal 카드는 번호가
  // 없어 NaN 비교가 전부 '이미 배운' 경고로 새는 것을 막는다.
  const orderKeys = payload?.track === 'core100' ? core100Keys : [];
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run scripts/validate-seed.test.mjs`
Expected: 전부 PASS (기존 miniDialogue 테스트 `5턴 → 차단` 은 9턴이 아니라 5턴이므로 이제 통과하는 쪽이 맞다 — 그 테스트가 FAIL 하면 제목과 픽스처를 `9턴 → 차단` 으로 바꾼다).

- [ ] **Step 5: 문서** — `docs/explanation-schema.md`

§miniDialogue 규칙 문단의 `차단: 2~4턴 밖` 을 `차단: 2~8턴 밖(2026-09-12, 종전 2~4)` 로 바꾸고, 같은 문단 끝에 한 줄 추가:

```
- `track: personal`(2026-09-12): 일기 소재 개인화 세션. sceneless 면제 경로(core100 과 동일)이되 **chain 비의무**(화면에서 체이닝을 숨김). 코어100 순서 검사(뒤쪽 묶음 표현 차단)는 core100 트랙에만 돈다. 줄마다 `ko`·`kr` 의무(응용 행과 같은 영문·뜻·발음 구성).
```

§chain 제목(`## chain — 무자막 체이닝 ...`) 바로 아래에 인용 한 줄 추가:

```
> **2026-09-12 화면에서 숨김** — 신규·복습 모두 `SESSION_BLOCKS.chainProd=false`(`sessionExprV2.js`). 데이터·게이트·이력 키(`#chain#`)는 유지한다(core100·moduyeongeo 는 chain 의무 유지, personal 은 비의무). 되살릴지 없앨지는 추후 결정.
```

- [ ] **Step 6: 커밋**

```bash
cd ~/apps && git add study/scripts/validate-seed.mjs study/scripts/validate-seed.test.mjs study/docs/explanation-schema.md
git commit -m "feat(study): 시드 게이트에 personal 트랙 추가 — sceneless 면제·chain 비의무, miniDialogue 2~8턴, 코어100 순서 검사는 core100 전용

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 체이닝·생산 연습 블록 숨김 (플래그, 코드 유지)

**Files:**
- Modify: `src/pages/sessionExprV2.js:23` (상수 추가), `src/pages/sessionExprV2.js:1104-1116` (조립 분기)
- Modify: `src/pages/sessionReviewV2.js:29` (import), `src/pages/sessionReviewV2.js:505` (chain 분기)
- Modify: `specs/study-app-spec.md` §8-2 (494행 근처)·§8-3 (516행 근처)
- Test: `src/pages/sessionExprV2.test.js`, `src/pages/sessionReviewV2.test.js`

**Interfaces:**
- Produces: `export const SESSION_BLOCKS = { chainProd: false }` (`sessionExprV2.js`). 테스트와 복습 화면이 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성 (신규 세션)** — `src/pages/sessionExprV2.test.js`

(a) `./sessionExprV2.js` import 에 `SESSION_BLOCKS` 를 추가한다(`grep -n "from './sessionExprV2.js'" src/pages/sessionExprV2.test.js` 로 줄을 찾는다). vitest import 에 `afterEach` 가 없으면 추가한다.

(b) import 들 바로 아래(첫 describe 위)에 추가:

```js
// 2026-09-12: 체이닝·생산 블록은 화면에서 숨김이 기본값. 아래 기존 테스트들은 두 블록의 계약을 계속 검증하므로 켜고 돈다.
beforeEach(() => { SESSION_BLOCKS.chainProd = true; });
```

(c) 파일 끝에 추가:

```js
describe('sessionExprV2 — 체이닝·생산 블록 숨김 (2026-09-12 사용자 결정, 기본값 chainProd=false)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });
  afterEach(() => { SESSION_BLOCKS.chainProd = true; });
  const CHAIN = { target: 'Is that a promise? I need to know.', chunks: ['Is that a promise?', 'I need to know.'], ko: '약속이야? 알아야겠어.' };
  const mountWithChain = () => {
    const st = makeStateWithDrills();
    st.sentence.explanation.chain = CHAIN;
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, st, {});
    return host;
  };

  it('chain·drills 가 있어도 .vs-chain·.vs-prodblock 은 렌더되지 않고 응용 목록은 남는다', () => {
    const host = mountWithChain();
    expect(host.querySelector('.vs-chain')).toBeNull();
    expect(host.querySelector('.vs-prodblock')).toBeNull();
    expect(host.querySelector('.vs-drills-list')).not.toBeNull();
  });

  it('플래그를 켜면 두 블록이 다시 렌더된다 (코드 유지 계약)', () => {
    SESSION_BLOCKS.chainProd = true;
    const host = mountWithChain();
    expect(host.querySelector('.vs-chain')).not.toBeNull();
    expect(host.querySelector('.vs-prodblock')).not.toBeNull();
  });
});
```

- [ ] **Step 2: 실패하는 테스트 작성 (복습)** — `src/pages/sessionReviewV2.test.js`

(a) import 추가: `import { SESSION_BLOCKS } from './sessionExprV2.js';` (vitest import 에 `afterEach` 추가).

(b) import 아래에 `beforeEach(() => { SESSION_BLOCKS.chainProd = true; });` 추가(기존 체이닝 테스트 유지).

(c) 파일 끝에 추가:

```js
describe('renderSessionReviewV2 — 체이닝 숨김 (2026-09-12 기본값 chainProd=false)', () => {
  beforeEach(() => { SESSION_BLOCKS.chainProd = false; });
  afterEach(() => { SESSION_BLOCKS.chainProd = true; });
  it('chain 이 있어도 .vs-chain 을 만들지 않는다 (공개 전·후 모두 DOM 에 없음)', () => {
    vi.useFakeTimers();
    try {
      const chain = { target: `${EN} I mean it.`, chunks: [EN, 'I mean it.'], ko: '진심이야' };
      const sentence = { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation: { key: `${EN} = ${KO}`, chunks: CHUNKS, chain } };
      const host = mountCard({ interval: 1, demo: true, state: { sentence } });
      expect(host.querySelector('.vs-chain')).toBeNull();
      host.querySelector('.vr-pill.pri').click();
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vs-chain')).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js src/pages/sessionReviewV2.test.js`
Expected: import 실패(`SESSION_BLOCKS` 미정의)로 두 파일 모두 FAIL.

- [ ] **Step 4: 구현** — `src/pages/sessionExprV2.js`

`const DRILL_DOTS_MAX = 8; ...` 줄 바로 아래에 추가:

```js
/* 블록 표시 스위치 (2026-09-12 사용자 결정) — 체이닝·생산 연습은 화면에서 숨긴다. 코드·시드 필드·게이트·이력 키(#chain#·#prod#)는
 * 유지하고, 되살릴지 없앨지는 추후 결정. 테스트는 이 값을 켜서 두 블록의 계약을 계속 검증한다. */
export const SESSION_BLOCKS = { chainProd: false };
```

`renderSessionExprV2` 안 조립부(1104행·1111행)를 다음으로 바꾼다:

```js
  const chainBlock = SESSION_BLOCKS.chainProd ? chainBlockEl(ex.chain, lang, s, state.demo, onChainScore, {
    saved: cardEx.chain,
    scores: cardEx.chainScores,
    onSave: (v) => { cardEx.chain = v; handlers.saveSnapshot?.(); },
  }) : null;

  // 생산 연습(한→영) — 응용 아래·체이닝 위. 발화 집계는 체이닝과 동일 경로(onChainScore) 재사용. 2026-09-12 숨김(SESSION_BLOCKS).
  const prodBlock = SESSION_BLOCKS.chainProd ? productionBlockEl(drills, lang, s, state.demo, onChainScore, {
    onStart: collapseDrills,
    saved: cardEx.prod,
    scores: cardEx.prodScores,
    onSave: (v) => { cardEx.prod = v; handlers.saveSnapshot?.(); },
  }) : null;
```

`src/pages/sessionReviewV2.js`: 29행 import 목록에 `SESSION_BLOCKS` 를 추가하고 505행을 바꾼다:

```js
  // 체이닝 — 신규 세션과 동일 컴포넌트 (무자막, 단계 누적). 2026-09-12 화면에서 숨김(SESSION_BLOCKS, 코드 유지).
  const chainBlock = SESSION_BLOCKS.chainProd ? chainBlockEl(ex.chain, lang, s, state.demo, onAppliedScore, {
    saved: cardEx.chain,
    scores: cardEx.chainScores,
    onSave: (v) => { cardEx.chain = v; handlers.saveSnapshot?.(); },
  }) : null;
```

(`reveal()` 의 `if (chainBlock) chainBlock.style.display = ''` 와 `h()` 의 null 자식 무시 덕에 다른 배선은 그대로 둔다.)

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js src/pages/sessionReviewV2.test.js`
Expected: 전부 PASS (기존 체이닝·생산 테스트는 최상위 beforeEach 가 플래그를 켜므로 그대로 통과).

- [ ] **Step 6: 문서** — `specs/study-app-spec.md`

§8-3(신규 레슨 카드) 목록에 한 줄 추가, §8-2 목록에도 같은 한 줄 추가:

```
- **체이닝·생산 연습 숨김 (2026-09-12 사용자 결정)**: `SESSION_BLOCKS.chainProd=false`(`sessionExprV2.js`) 로 두 블록을 렌더하지 않는다(신규·복습 동일). 코드·시드 필드·이력 키·게이트는 유지, 되살릴지 없앨지는 추후 결정. 응용 연습은 그대로이고 복습 큐에는 넣지 않는다(현행).
```

- [ ] **Step 7: 커밋**

```bash
cd ~/apps && git add study/src/pages/sessionExprV2.js study/src/pages/sessionReviewV2.js study/src/pages/sessionExprV2.test.js study/src/pages/sessionReviewV2.test.js study/specs/study-app-spec.md
git commit -m "feat(study): 체이닝·생산 연습 블록 숨김 — SESSION_BLOCKS 플래그(코드·게이트·이력 유지), 신규·복습 동일

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 미니대화 녹음 복원 + 화자 C/D·이름 표시·장면 한 줄

**Files:**
- Modify: `src/services/pronunciationLog.js:85-87` (헬퍼 추가), `src/services/pronunciationLog.js:117-131` (수화)
- Modify: `src/pages/sessionExprV2.js:13` (import), `:547-580` (`MINI_VOICES`·`MINI_CSS`·`miniDialogueEl`), `:1125` (배선)
- Modify: `src/pages/sessionReviewV2.js` (pronunciationLog import 줄, 649-657행 `mountMini`)
- Modify: `docs/explanation-schema.md` §miniDialogue 본문·표, `specs/study-app-spec.md` §8-2·§8-3 미니대화 불릿
- Test: `src/services/pronunciationLog.test.js`, `src/pages/sessionExprV2.test.js`, `src/pages/sessionReviewV2.test.js`

**Interfaces:**
- Produces: `miniLogId(cardId, lineEn)` → `` `${cardId}#mini#${en}` ``, `miniLinesOf(md)` (둘 다 `pronunciationLog.js` export). `MINI_VOICES` export(A 여성·B 남성 — 성별만 구분, C/D 없음). 줄 아래 부제는 응용 행과 같이 `kr · ko`. `miniDialogueEl(md, s, lang, expr, { demo = false, onScore, saved, scene } = {})` — `onScore(i, result)` 는 줄 index 와 채점 결과, `saved` 는 `{ [index]: number[] }`, `scene` 은 라벨 아래 한 줄. `loadScoreHistoryState` 결과 `exLog[id].mini = { [index]: number[] }`.
- Consumes: Task 2 의 `SESSION_BLOCKS` 는 건드리지 않는다.

- [ ] **Step 1: 실패하는 테스트 (이력 헬퍼)** — `src/services/pronunciationLog.test.js`

import 목록에 `miniLogId` 를 추가하고 파일 끝에 추가:

```js
/* 미니대화 줄 녹음 (2026-09-12 사용자 결정 "미니대화에도 녹음 버튼" — 2026-09-08 제거분 복원) — 진행 조건은 아니지만
 * 발화 점수는 빠뜨리지 않는다(2026-09-03 계약). 키는 카드 id#mini#줄 영어, 수화는 줄 순서(index)로 exLog.mini 에 담는다. */
describe('miniLogId + loadScoreHistoryState — 미니대화 줄 이력', () => {
  it('키는 카드 id + #mini# + 줄 영어 (앞뒤 공백 제거)', () => {
    expect(miniLogId('c1', ' Hi there. ')).toBe('c1#mini#Hi there.');
  });

  it('줄 점수를 줄 순서로 exLog.mini 에 담고 recLog 카운트에도 넣는다', async () => {
    const card = {
      id: 'c1', sentence: 'Is that a promise?',
      explanation: { miniDialogue: [{ speaker: 'A', en: 'Sure?' }, { speaker: 'B', en: 'Is that a promise?' }], drills: [] },
    };
    const rows = [
      { sentenceId: 'c1#mini#Is that a promise?', lang: 'en', overallScore: 85, createdAt: '2026-09-08T00:00:00Z' },
      { sentenceId: 'c1#mini#Is that a promise?', lang: 'en', overallScore: 90, createdAt: '2026-09-08T00:01:00Z' },
    ];
    const db = { pronunciationLog: { where: () => ({ equals: () => ({ toArray: async () => rows }) }) } };
    const out = await loadScoreHistoryState(db, [card], 'en', (c) => c.explanation.drills);
    expect(out.exLog.c1.mini).toEqual({ 1: [85, 90] });
    expect(out.recLog.c1).toEqual({ count: 2, best: 90 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run src/services/pronunciationLog.test.js`
Expected: FAIL — `miniLogId is not a function` / `exLog.c1` undefined.

- [ ] **Step 3: 구현 (이력)** — `src/services/pronunciationLog.js`

`prodLogId` 바로 아래에 추가:

```js
/* 미니대화 줄 녹음 (2026-09-12 사용자 결정 "미니대화에도 녹음 버튼" — 2026-09-08 제거분 복원) — 진행 조건은 아니지만
 * 발화 점수는 남긴다(2026-09-03 계약). 키는 카드 id#mini#줄 영어. */
export function miniLogId(cardId, lineEn) {
  return `${cardId}#mini#${String(lineEn ?? '').trim()}`;
}
/** 렌더(miniDialogueEl)·수화가 같은 줄 순서를 쓰도록 하나로 — en 이 비거나 문자열이 아닌 줄은 뺀다. */
export function miniLinesOf(md) {
  return (Array.isArray(md) ? md : []).filter((l) => l && typeof l.en === 'string' && l.en.trim());
}
```

`loadScoreHistoryState` 안, `prodScores` 계산 블록 다음의 `const all = [...]` 와 `exLog[c.id] = {...}` 를 다음으로 바꾼다:

```js
      // 미니대화 줄 이력 (2026-09-12 복원) — 줄 순서(index)로 담는다. 렌더(miniDialogueEl)와 같은 필터(miniLinesOf).
      const mini = {};
      miniLinesOf(c.explanation?.miniDialogue).forEach((l, i) => {
        const ms = rows.filter((r) => r.sentenceId === miniLogId(c.id, l.en)).map((r) => Math.round(Number(r.overallScore) || 0));
        if (ms.length) mini[i] = ms;
      });
      const all = [...main, ...Object.values(dScores).flat(), ...Object.values(chainScores).flat(), ...Object.values(prodScores).flat(), ...Object.values(mini).flat()];
      if (!all.length) continue;
      exLog[c.id] = {
        ...(main.length ? { utter: main } : {}),
        ...(Object.keys(dScores).length ? { drills: dScores } : {}),
        ...(Object.keys(chainScores).length ? { chainScores } : {}),
        ...(Object.keys(prodScores).length ? { prodScores } : {}),
        ...(Object.keys(mini).length ? { mini } : {}),
      };
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run src/services/pronunciationLog.test.js`
Expected: PASS.

- [ ] **Step 5: 실패하는 테스트 (신규 세션 화면)** — `src/pages/sessionExprV2.test.js`, describe `'sessionExprV2 — 미니대화(miniDialogue) 블록'` 안

(a) `./sessionExprV2.js` import 에 `MINI_VOICES` 추가. `tick` 헬퍼는 파일에 이미 있다(`grep -n "const tick" src/pages/sessionExprV2.test.js` 로 확인).

(b) 기존 테스트 `'줄마다 듣기 버튼만 — 녹음 버튼·판정 없음'` 을 아래로 **교체**하고, 그 뒤에 나머지 4개를 추가한다:

```js
  /* 녹음 (2026-09-12 사용자 결정 "미니대화에도 녹음 버튼" — 2026-09-08 '듣기 전용' 결정을 뒤집음) — 줄마다 선택 녹음.
   * 응용 행과 같은 채점·배지·집계이고 진행 조건(게이트·판정·잠금)은 없다. */
  it('줄마다 녹음 버튼 — 녹음 1회 → tried/passed/pronScores 반영 · 줄 점수 배지 · #mini# 로그 저장', async () => {
    const host = mount(mdState());
    const state = host._state;
    const mini = host.querySelector('.vs-mini');
    const recs = [...mini.querySelectorAll('button[aria-label="녹음"]')];
    expect(recs).toHaveLength(3);
    recs[1].click(); await tick();                 // 타깃 줄 녹음 시작
    recs[1].click(); await tick(); await tick();   // 멈춤 + 채점 (mock: 완전 발화 → 100)
    expect(state.tried).toBe(1);
    expect(state.passed).toBe(1);
    expect(state.pronScores).toEqual([100]);
    expect(savePronunciationLog).toHaveBeenCalledTimes(1);
    expect(savePronunciationLog.mock.calls[0][1].sentenceId).toBe('e1#mini#Is that a promise?');
    const badge = recs[1].closest('.vs-mini-line').querySelector('.vs-gscore');
    expect(badge.textContent).toContain('100');
  });

  it('스냅샷에 남은 줄 점수(exLog.mini)를 재렌더 때 배지로 복원한다', () => {
    const st = mdState();
    st.exLog = { e1: { mini: { 0: [77] } } };
    const host = mount(st);
    const lines = host.querySelectorAll('.vs-mini-line');
    expect(lines[0].querySelector('.vs-gscore').textContent).toContain('77');
    expect(lines[1].querySelector('.vs-gscore').textContent).toBe('');
  });

  it('데모(마이크 없음)에서는 녹음 클릭 → 시뮬 점수 배지', async () => {
    const st = mdState(); st.demo = true;
    const host = mount(st);
    const rec = host.querySelector('.vs-mini button[aria-label="녹음"]');
    rec.click();
    await new Promise((r) => setTimeout(r, 900));
    expect(host.querySelector('.vs-mini-line .vs-gscore').textContent).not.toBe('');
  });

  it('줄의 name 이 있으면 화자 칸에 이름을, 없으면 speaker 글자를 보여준다 (2026-09-12)', () => {
    const st = mdState();
    st.sentence.explanation.miniDialogue = [{ ...MD[0], name: '소연' }, MD[1], MD[2]];
    const host = mount(st);
    const ix = [...host.querySelectorAll('.vs-mini-line .ix')].map((e) => e.textContent);
    expect(ix).toEqual(['소연', 'B', 'A']);
  });

  it('explanation.situation 이 있으면 라벨 아래 장면 한 줄(.vs-mini-scene)을 보여준다', () => {
    const st = mdState();
    st.sentence.explanation.situation = '새벽 4시, 공항 픽업';
    const host = mount(st);
    expect(host.querySelector('.vs-mini .vs-mini-scene').textContent).toBe('새벽 4시, 공항 픽업');
  });

  it('줄 부제는 응용 행과 같이 한글 발음(kr) · 뜻(ko) — kr 이 없으면 뜻만 (2026-09-13)', () => {
    const st = mdState();
    st.sentence.explanation.miniDialogue = [{ ...MD[0], kr: '아일 f피니쉬 잇 바이 f라이데이' }, MD[1], MD[2]];
    const host = mount(st);
    const subs = [...host.querySelectorAll('.vs-mini-line .sub')].map((e) => e.textContent);
    expect(subs[0]).toBe('아일 f피니쉬 잇 바이 f라이데이 · 금요일까지 끝낼게.');
    expect(subs[1]).toBe('약속하는 거예요?');
    expect(MINI_VOICES.A).toMatch(/Neural$/);
    expect(MINI_VOICES.B).toMatch(/Neural$/);
  });
```

- [ ] **Step 6: 실패하는 테스트 (복습 화면)** — `src/pages/sessionReviewV2.test.js` 파일 끝에 추가

```js
describe('renderSessionReviewV2 — 미니대화 녹음 (2026-09-12)', () => {
  const MD = [
    { speaker: 'A', en: 'Did you sleep?', ko: '잠은 잤어?' },
    { speaker: 'B', en: EN, ko: KO },
    { speaker: 'A', en: 'Good.', ko: '다행이다.' },
  ];
  const sentenceWithMd = () => ({ id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation: { key: `${EN} = ${KO}`, chunks: CHUNKS, miniDialogue: MD } });

  it('정답 공개 뒤 미니대화 줄마다 녹음 버튼 — 데모 녹음이면 점수 배지가 붙는다', () => {
    vi.useFakeTimers();
    try {
      const host = mountCard({ interval: 1, demo: true, state: { sentence: sentenceWithMd() } });
      expect(host.querySelector('.vs-mini')).toBeNull();      // 공개 전 미생성(정답 유출 방지)
      host.querySelector('.vr-pill.pri').click();
      vi.advanceTimersByTime(1100);
      const recs = [...host.querySelectorAll('.vs-mini button[aria-label="녹음"]')];
      expect(recs).toHaveLength(3);
      recs[0].click();
      vi.advanceTimersByTime(900);
      expect(host.querySelector('.vs-mini-line .vs-gscore').textContent).not.toBe('');
    } finally { vi.useRealTimers(); }
  });
});
```

- [ ] **Step 7: 실패 확인**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js src/pages/sessionReviewV2.test.js`
Expected: 새 테스트 FAIL — 녹음 버튼 0개, `MINI_VOICES` 미export, `.vs-mini-scene` 없음.

- [ ] **Step 8: 구현 (신규 세션)** — `src/pages/sessionExprV2.js`

13행 import 를 `import { savePronunciationLog, drillLogId, chainLogId, prodLogId, miniLogId, miniLinesOf } from '../services/pronunciationLog.js';` 로 바꾸고, 파일 안의 로컬 `const miniLinesOf = ...` 줄(556행)을 삭제한다.

547~580행(`MINI_VOICES` 부터 `miniDialogueEl` 끝까지)을 다음으로 교체:

```js
/* 미니대화 (2026-09-08 작업지시서 §1~§4, 2026-09-12 대화 단위 세션 1차) — 타깃 표현이 어떤 상대 발화·상황 뒤에 나오는지 듣고 말한다.
 * 위치는 문장 카드 **아래**. 줄마다 듣기 + **녹음**(2026-09-12 사용자 결정 — 2026-09-08 '듣기 전용'을 뒤집음). 녹음은 응용 행과 같은
 * 채점·점수 원·세션 집계(onScore)·이력(#mini#)이고, 진행 조건(게이트·판정·잠금)·SRS 영향은 없다.
 * 신규 세션은 카드 아래에 바로, 복습 세션(sessionReviewV2)은 정답 공개 뒤에만 쓴다(타깃 줄이 정답을 품는다).
 * 행 구조는 응용 행(.vs-drow)과 같아 버튼 열이 같은 자리에 온다. 필드가 없으면 null. 화자 칸은 name 이 있으면 이름, 없으면 speaker 글자.
 * scene(= explanation.situation) 이 있으면 라벨 아래 장면 한 줄. demo 는 마이크 없이 시뮬. */
export const MINI_VOICES = {
  A: 'en-US-AvaMultilingualNeural',    // 여성 (소연 등)
  B: 'en-US-AndrewMultilingualNeural', // 남성 (학습자 지오 등) — 성별로만 나눈다 (사용자 2026-09-13)
};
const MINI_CSS = `
.vs-mini-all{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border:0;border-radius:999px;padding:6px 12px;cursor:pointer;white-space:nowrap}
.vs-mini-scene{font-size:12.5px;line-height:1.5;color:var(--faint);margin:6px 2px 0}
.vs-mini-line{position:relative;isolation:isolate}
.vs-mini-line .ix{width:auto;min-width:16px;max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vs-mini-line.tgt{border-bottom-color:transparent}
.vs-mini-line.tgt::before{content:"";position:absolute;inset:2px -10px;background:var(--teal-soft);border-radius:12px;z-index:-1}
.vs-mini-line.tgt .en,.vs-mini-line.tgt .ix{color:var(--teal-deep)}
.vs-mini-line.tgt .en{font-weight:800}`;
export function miniDialogueEl(md, s, lang, expr, { demo = false, onScore, saved, scene } = {}) {
  const lines = miniLinesOf(md);
  if (!lines.length) return null;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const target = String(s?.sentence ?? '').trim();
  const voiceOf = (sp) => MINI_VOICES[String(sp ?? '').trim().toUpperCase()] || MINI_VOICES.A;
  let recCtrl = null, recRow = null;
  const rows = lines.map((l, i) => {
    const isT = l.en.trim() === target;
    const hist = normScores(saved?.[i]);
    const scoreEl = h('span', { class: 'vs-gscore', style: hist.length ? '' : 'display:none;' },
      hist.slice(-DRILL_DOTS_MAX).map((v) => scoreDot(v, { size: 26, fresh: false })));
    const play = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    play.addEventListener('click', () => speakWithFeedback(play, l.en, { lang: ttsLang, voice: voiceOf(l.speaker), rate: 1.0 }));
    const rec = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const row = h('div', { class: 'vs-drow vs-mini-line' + (isT ? ' tgt' : ''), 'data-speaker': String(l.speaker ?? '') },
      h('span', { class: 'ix' }, String(l.name || l.speaker || '')),
      // 부제 = 응용 행(drillRows)과 같은 구성: 한글 발음(kr) · 뜻(ko). 둘 다 없으면 부제 없음.
      h('div', {}, h('div', { class: 'en' }, isT ? hlNode(l.en, expr) : l.en),
        [l.kr, l.ko].filter(Boolean).length ? h('div', { class: 'sub ko' }, [l.kr, l.ko].filter(Boolean).join(' · ')) : null),
      h('span', { class: 'grow' }), scoreEl, play, rec);
    const pushScore = (raw) => {
      hist.push(Math.round(Number(raw) || 0));
      const shown = hist.slice(-DRILL_DOTS_MAX);
      scoreEl.replaceChildren(...shown.map((v, k) => scoreDot(v, { size: 26, fresh: k === shown.length - 1 })));
      scoreEl.style.display = '';
      popScore(scoreEl);
    };
    // 녹음 종료·채점 — 수동 멈추기와 무음 자동종료 공유 (응용 행과 같은 계약). recRow 가드로 오행 방지.
    async function finishRec() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); rec.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, l.en, { lang }, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      const judged = judgeRecording(result, l.en);
      if (!judged.record) { showRecordToast(recordGateMessage(judged.reason)); return; }
      const scored = scoreForDisplay(result, l.en, lang);
      pushScore(scored.score);
      onScore?.(i, scored);
    }
    rec.addEventListener('click', async () => {
      if (demo) {
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); rec.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); rec.classList.remove('recing');
          const result = { score: Math.min(84 + i * 4, 99), weakPhonemes: ['ð'] };
          pushScore(result.score);
          onScore?.(i, result);
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finishRec(); return; }
      const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: l.en, card: { lang } }, onAutoStop: () => finishRec() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); rec.classList.add('recing');
    });
    return { l, play, el: row };
  });
  const allBtn = h('button', { class: 'vs-mini-all', type: 'button', 'data-role': 'mini-all' }, vIcon(VI.PLAY, { size: 11, fill: true }), '전체 듣기');
  allBtn.addEventListener('click', () => {
    const playAt = (k) => {
      if (k >= rows.length) return;
      const r = rows[k];
      speakWithFeedback(r.play, r.l.en, { lang: ttsLang, voice: voiceOf(r.l.speaker), rate: 1.0, onEnd: () => playAt(k + 1) });
    };
    playAt(0);
  });
  return h('div', { class: 'vs-mini' }, v2Style(MINI_CSS),
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '이런 대화에서'), allBtn),
    scene ? h('div', { class: 'vs-mini-scene' }, String(scene)) : null,
    h('div', { style: 'margin-top:4px;' }, rows.map((r) => r.el)));
}
```

`renderSessionExprV2` 안 1125행 `const miniEl = miniDialogueEl(ex?.miniDialogue, s, lang, expr);` 을 다음으로 교체:

```js
  // 미니대화 줄 녹음 점수 (2026-09-12 복원) — 응용 행(onDrillScore)과 같은 집계·스냅샷·영속. 진행 조건은 아니다.
  const miniLines = miniLinesOf(ex?.miniDialogue);
  const onMiniScore = (i, result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    const rows = ((cardEx.mini ??= {}));
    rows[i] = [...normScores(rows[i]), score];
    if (!state.demo) {
      savePronunciationLog(window.studyDB, { result, sentenceId: miniLogId(s?.id, miniLines[i]?.en || ''), lang, date: getTodayISO() })
        .catch((e) => console.error('[sessionExprV2] mini pron persist', e));
    }
    refreshDots();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  const miniEl = miniDialogueEl(ex?.miniDialogue, s, lang, expr, { demo: state.demo, onScore: onMiniScore, saved: cardEx.mini, scene: ex?.situation });
```

- [ ] **Step 9: 구현 (복습)** — `src/pages/sessionReviewV2.js`

`'../services/pronunciationLog.js'` import 줄(`grep -n "pronunciationLog.js" src/pages/sessionReviewV2.js`)에 `miniLogId, miniLinesOf` 를 추가하고, 649~657행의 `miniSlot`·`mountMini` 를 다음으로 교체:

```js
  // 미니대화 (2026-09-08 "복습 세션에도", 2026-09-12 줄 녹음) — 카드 아래. 타깃 줄이 정답을 품으므로 공개 전에는 DOM 에도
  // 두지 않는다(숨김이 아니라 미생성 — 텍스트 유출 방지). 녹음은 신규 세션과 같은 집계·이력(#mini#), 진행 조건·SRS 영향 없음.
  const miniSlot = h('div', { class: 'vr-mini-slot' });
  const miniLines = miniLinesOf(ex?.miniDialogue);
  const onMiniScore = (i, result) => {
    const store = (cardEx.mini ??= {});
    store[i] = [...normScores(store[i]), Math.round(Number(result?.score) || 0)];
    if (!state.demo) {
      savePronunciationLog(window.studyDB, { result, sentenceId: miniLogId(s?.id, miniLines[i]?.en || ''), lang, date: getTodayISO() })
        .catch((e) => console.error('[sessionReviewV2] mini pron persist', e));
    }
    onAppliedScore(result);
  };
  const mountMini = () => {
    if (miniSlot.childElementCount) return;
    const el = miniDialogueEl(ex?.miniDialogue, s, lang, expr, { demo: state.demo, onScore: onMiniScore, saved: cardEx.mini, scene: ex?.situation });
    if (el) miniSlot.appendChild(el);
  };
  if (revealed) mountMini();
```

- [ ] **Step 10: 통과 확인**

Run: `pnpm exec vitest run src/pages/sessionExprV2.test.js src/pages/sessionReviewV2.test.js src/services/pronunciationLog.test.js src/pages/sessionExprV2.recordMatrix.test.js`
Expected: 전부 PASS.

- [ ] **Step 11: 문서**

`docs/explanation-schema.md` §miniDialogue 첫 문단에서 `(**듣기 전용** — 2026-09-08 사용자 최종 결정, 녹음 버튼 없음)` 을 다음으로 바꾼다:

```
(줄마다 듣기 + **녹음** — 2026-09-12 사용자 결정으로 2026-09-08 의 '듣기 전용'을 뒤집음. 녹음은 응용 행과 같은 채점·점수 원·오늘 발화 집계·`#mini#` 이력이고 진행 조건·SRS 영향은 없다. `situation` 이 있으면 라벨 아래 장면 한 줄로 보여준다)
```

같은 절의 표 행을 다음으로 바꾼다:

```
| miniDialogue | `[{speaker, en, ko?, kr?, name?}]` 2~8턴 | `speaker` 는 `A`(여성 Ava)/`B`(남성 Andrew) — 성별로만 나눈다. `name` 은 화면 화자 칸에 표시할 이름(선택, 없으면 글자). `kr` 은 한글 발음(줄 부제 `kr · ko`, 응용 행과 같은 구성). 타깃 줄의 `en` 은 카드 `sentence` 와 **문자열 완전 일치**, 정확히 1회. `ko`·`kr` 은 일반 트랙 선택, **personal 트랙 의무** |
```

`specs/study-app-spec.md` §8-3 의 `**미니대화 블록 (2026-09-08, 카드 아래, 듣기 전용)**` 불릿과 §8-2 의 `**미니대화 (2026-09-08)**` 불릿 각각 끝에 문장을 덧붙인다:

```
**2026-09-12**: 줄마다 녹음 버튼 추가(사용자 결정 — '듣기 버튼만' 을 뒤집음). 줄 구성은 응용 행과 동일(영문 · `kr` 발음 · `ko` 뜻 · 듣기 · 녹음). 채점·점수 원·오늘 발화·`#mini#` 이력은 응용 행과 같고 진행 조건·SRS 영향 없음. 턴 한도 2~8, 음성은 화자 성별(A/B)로만 구분, `name` 표시, `situation` 을 장면 한 줄로 표시.
```

- [ ] **Step 12: 커밋**

```bash
cd ~/apps && git add study/src/services/pronunciationLog.js study/src/services/pronunciationLog.test.js study/src/pages/sessionExprV2.js study/src/pages/sessionExprV2.test.js study/src/pages/sessionReviewV2.js study/src/pages/sessionReviewV2.test.js study/docs/explanation-schema.md study/specs/study-app-spec.md
git commit -m "feat(study): 미니대화 줄 녹음 복원(#mini# 이력·집계) + 화자 C/D·이름 표시·장면 한 줄 — 신규·복습 동일

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 복습 회상 모드에 상대 줄 단서

**Files:**
- Modify: `src/components/session/applied.js` (파일 끝에 헬퍼 추가)
- Modify: `src/pages/sessionReviewV2.js:22` (applied import), `:29` (sessionExprV2 import), 카드 조립(646행 근처 `const cardEl = ...`)
- Modify: `specs/study-app-spec.md` §8-2
- Test: `src/components/session/applied.test.js`, `src/pages/sessionReviewV2.test.js`

**Interfaces:**
- Consumes: Task 3 의 `MINI_VOICES` export.
- Produces: `miniCueLine(md, sentence)` → 타깃 직전 줄 객체 또는 `null` (`applied.js` export). 복습 카드 위 `.vr-cue`.

- [ ] **Step 1: 실패하는 테스트 (헬퍼)** — `src/components/session/applied.test.js`

import 에 `miniCueLine` 을 추가하고 파일 끝에:

```js
/* 복습 단서 (2026-09-12 사용자 결정) — 타깃 직전 상대 줄. 답을 좁히는 힌트(단어 수·첫 글자)가 아니라 그 문장을 말하게 만드는
 * 상황이다(음성교사 작업지시서 "질문·대답 짝"). 정답 텍스트는 담지 않는다. */
describe('miniCueLine — 복습 단서: 타깃 직전 상대 줄', () => {
  const md = [{ speaker: 'A', en: 'Did you sleep?' }, { speaker: 'B', en: "I didn't sleep at all." }, { speaker: 'A', en: 'You must be tired.' }];
  it('타깃 직전 줄을 돌려준다', () => {
    expect(miniCueLine(md, "I didn't sleep at all.")).toEqual(md[0]);
  });
  it('타깃이 첫 줄이면 null', () => {
    expect(miniCueLine(md, 'Did you sleep?')).toBeNull();
  });
  it('타깃이 없거나 miniDialogue 가 없으면 null', () => {
    expect(miniCueLine(md, 'Hello.')).toBeNull();
    expect(miniCueLine(undefined, 'Did you sleep?')).toBeNull();
  });
  it('en 이 비거나 문자열이 아닌 줄은 건너뛴다', () => {
    expect(miniCueLine([{ speaker: 'A', en: '' }, { speaker: 'A', en: 'Hi.' }, { speaker: 'B', en: 'Hey.' }], 'Hey.')).toEqual({ speaker: 'A', en: 'Hi.' });
  });
});
```

- [ ] **Step 2: 실패하는 테스트 (복습 화면)** — `src/pages/sessionReviewV2.test.js` 파일 끝에

```js
describe('renderSessionReviewV2 — 상대 줄 단서 (2026-09-12)', () => {
  const MD = [
    { speaker: 'A', name: '소연', en: 'Did you sleep?', ko: '잠은 잤어?' },
    { speaker: 'B', en: EN, ko: KO },
  ];
  const withMd = (md) => ({ id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation: { key: `${EN} = ${KO}`, chunks: CHUNKS, miniDialogue: md } });

  it('회상 모드에서 정답 공개 전에 타깃 직전 상대 줄을 보여준다 — 정답 텍스트는 없다', () => {
    const host = mountCard({ interval: 1, state: { sentence: withMd(MD) } });
    const cue = host.querySelector('.vr-cue');
    expect(cue).not.toBeNull();
    expect(cue.textContent).toContain('Did you sleep?');
    expect(cue.textContent).toContain('소연');
    expect(host.querySelector('.vr-card').textContent).not.toContain(EN);
    expect(host.querySelector('.vs-mini')).toBeNull();   // 대화 블록 자체는 공개 뒤에만
  });

  it('miniDialogue 가 없거나 타깃이 첫 줄이면 단서가 없다', () => {
    expect(mountCard({ interval: 1 }).querySelector('.vr-cue')).toBeNull();
    expect(mountCard({ interval: 1, state: { sentence: withMd([MD[1], MD[0]]) } }).querySelector('.vr-cue')).toBeNull();
  });

  it('단서 듣기 버튼은 공개 전에도 눌린다 (정답 오디오가 아니다)', () => {
    const host = mountCard({ interval: 1, state: { sentence: withMd(MD) } });
    expect(host.querySelector('.vr-cue button').disabled).toBe(false);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec vitest run src/components/session/applied.test.js src/pages/sessionReviewV2.test.js`
Expected: FAIL — `miniCueLine` 미export, `.vr-cue` 없음.

- [ ] **Step 4: 구현 (헬퍼)** — `src/components/session/applied.js` 파일 끝에

```js
/* 복습 단서 (2026-09-12 사용자 결정) — 미니대화에서 타깃 줄 직전의 상대 발화. 정답(타깃) 자체는 담지 않는다.
 * 타깃이 첫 줄이거나 miniDialogue 가 없으면 null. 줄 필터는 pronunciationLog.miniLinesOf 와 같다. */
export function miniCueLine(md, sentence) {
  const lines = (Array.isArray(md) ? md : []).filter((l) => l && typeof l.en === 'string' && l.en.trim());
  const target = String(sentence ?? '').trim();
  const t = lines.findIndex((l) => l.en.trim() === target);
  return t > 0 ? lines[t - 1] : null;
}
```

- [ ] **Step 5: 구현 (복습 화면)** — `src/pages/sessionReviewV2.js`

import 수정: 22행을 `import { filterNearDupDrills, miniCueLine } from '../components/session/applied.js';` 로, 29행 목록에 `MINI_VOICES` 를 추가하고, `import { speakWithFeedback } from '../components/session/atoms.js';` 를 21행(`createJudgeRow` import) 옆에 추가한다(이미 있으면 생략).

`const cardEl = h('div', { class: 'vr-card' }, h1El, koEl, pronEl, srsRow, ctrl, meta);` 를 다음으로 교체:

```js
  // 상대 줄 단서 (2026-09-12 사용자 결정) — 회상 모드에서 정답 공개 전부터 타깃 직전 상대 발화를 보여주고 들려준다.
  // 인출을 일으키는 것은 상대의 말이라는 설계(음성교사 작업지시서 "질문·대답 짝"). 2026-07-10 '힌트 없음' 과의 관계:
  // 단어 수·첫 글자처럼 답을 좁히는 힌트가 아니라 그 문장이 쓰이는 상황이다. 정답 텍스트는 담지 않는다(miniCueLine).
  const CUE_CSS = `
.vr-cue{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:14px;border-radius:12px;background:var(--teal-soft)}
.vr-cue-who{font-family:Outfit;font-size:11px;color:var(--teal-deep);flex:0 0 auto;max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vr-cue-body{flex:1;min-width:0}
.vr-cue .en{font-size:14px;font-weight:700;letter-spacing:-.01em}
.vr-cue .sub{font-size:11.5px;color:var(--faint);margin-top:2px}`;
  const cue = recallMode ? miniCueLine(ex?.miniDialogue, s?.sentence) : null;
  let cueEl = null;
  if (cue) {
    const cuePlay = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '상대 줄 듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    const cueVoice = MINI_VOICES[String(cue.speaker ?? '').trim().toUpperCase()] || MINI_VOICES.A;
    cuePlay.addEventListener('click', () => speakWithFeedback(cuePlay, cue.en, { lang: ttsLang, voice: cueVoice, rate: 1.0 }));
    cueEl = h('div', { class: 'vr-cue' }, v2Style(CUE_CSS),
      h('span', { class: 'vr-cue-who' }, String(cue.name || cue.speaker || '')),
      h('div', { class: 'vr-cue-body' }, h('div', { class: 'en' }, cue.en), cue.ko ? h('div', { class: 'sub' }, cue.ko) : null),
      cuePlay);
  }
  const cardEl = h('div', { class: 'vr-card' }, cueEl, h1El, koEl, pronEl, srsRow, ctrl, meta);
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm exec vitest run src/components/session/applied.test.js src/pages/sessionReviewV2.test.js`
Expected: 전부 PASS. 이어서 `pnpm test` 전체 PASS.

- [ ] **Step 7: 문서** — `specs/study-app-spec.md` §8-2 목록에 추가

```
- **상대 줄 단서 (2026-09-12 사용자 결정)**: 회상 모드(en)에서 정답 공개 전부터 카드 위 `.vr-cue` 에 미니대화의 타깃 직전 상대 줄(화자 이름·영어·한글·듣기)을 보여준다(`applied.miniCueLine`). 2026-07-10 '힌트 없음' 과의 관계: 답을 좁히는 힌트가 아니라 그 문장을 말하게 만드는 상황(질문·대답 짝). 타깃이 첫 줄이거나 미니대화가 없으면 없음. 정답 텍스트·오디오는 여전히 공개 뒤에만.
```

`src/pages/sessionReviewV2.test.js` 62~67행 주석 끝에 한 줄 추가: `* 2026-09-12: 상대 줄 단서(.vr-cue)는 이 '힌트' 에 해당하지 않는다 — 답이 아니라 상황을 준다(아래 describe 참조).`

같은 파일 §8-2-0(단계화 복습 Rung 1/2/3)은 코드와 다르다(`sessionReviewV2.js` 36~40행: 2026-07-10 폐기, en 은 단일 회상 모드). 절 제목 아래에 한 줄을 넣어 바로잡는다: `> **폐기(2026-07-10)** — 코드는 Rung 없이 단일 회상 모드다(`isRecallMode`: en 항상 회상, ja 는 interval ≥ 3). 아래 내용은 이력으로만 남긴다. (2026-09-13 문서 정정)`

- [ ] **Step 8: 커밋**

```bash
cd ~/apps && git add study/src/components/session/applied.js study/src/components/session/applied.test.js study/src/pages/sessionReviewV2.js study/src/pages/sessionReviewV2.test.js study/specs/study-app-spec.md
git commit -m "feat(study): 복습 회상 모드에 상대 줄 단서 — 미니대화 타깃 직전 줄을 공개 전 텍스트·듣기로 제시

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: personal 파일럿 시드(시안 2 공항 픽업, 4장) + 봇 계정 화면 검증 + push

**Files:**
- Modify: `seeds/README.md` (형식 절에 불릿 추가)
- Create: `seeds/en-personal-2026-09-13.json` (다른 시드처럼 커밋)
- Test: `node scripts/validate-seed.mjs --payload ...`, 봇 계정 화면(`~/.claude/skills/study-fake-mic-e2e/SKILL.md` §2·§4·§5 절차)

**Interfaces:**
- Consumes: Task 1 게이트(`track: personal`), Task 2~4 화면.
- Produces: 봇 계정에서 8턴 미니대화·줄 녹음·`kr · ko` 부제·장면 한 줄·체이닝 없음이 보이는 스크린샷. 커밋·push 된 코드(배포 워크플로가 Pages 에 올린다). 사용자 계정 적재는 Task 6.

- [ ] **Step 1: 없음** (gitignore 제외 결정은 2026-09-13 사용자 지시로 철회 — 시드는 그대로 커밋한다)

- [ ] **Step 2: seeds/README.md** — `## 형식` 절의 `- en (⭐ RealClass-mining) ...` 불릿 아래에 추가

```
- en `track: "personal"` (2026-09-12): 일기 소재 개인화 세션(`docs/2026-09-12-dialogue-session-plan.md`). sceneless 면제·chain 비의무·miniDialogue 2~8턴, 줄마다 `en/ko/kr` 의무(응용 행과 같은 구성)·`name` 선택. 다른 시드처럼 커밋하고 로컬 `scripts/seed-supabase.mjs` 로 적재한다.
```

- [ ] **Step 3: 시드 작성** — `seeds/en-personal-2026-09-13.json` (`date` 는 적재일로 맞춘다 — 로더는 그날 날짜의 묶음을 연다)

```json
{
  "lang": "en",
  "track": "personal",
  "date": "2026-09-13",
  "_note": "personal 트랙 파일럿 (2026-09-12 시안 2 '가는 중이야', docs/2026-09-12-dialogue-session-plan.md). 일기 2026-01-02: 라스베가스 비행이 한 시간 일찍 4시 20분 착륙, 지오는 못 일어날까 봐 한숨도 못 잠, 한파주의보. miniDialogue 는 8턴, 줄마다 en/ko/kr(응용 행과 같은 구성). date 는 적재일.",
  "cards": [
    {
      "id": "en-personal-airport-01-on-my-way",
      "sentence": "I'm on my way.",
      "meaning": "가는 중이야.",
      "reading": null,
      "phonetic_kr": "아임 온 마이 웨이",
      "order_index": 1,
      "explanation": {
        "key": "I'm on my way = 가는 중이야. 출발했다고 알리는 첫마디.",
        "anchor": "가는 중",
        "situation": "1월 2일 새벽. 라스베가스에서 오는 대한항공 비행이 예정보다 한 시간 빠른 4시 20분에 내렸다. 지오는 못 일어날까 봐 한숨도 못 잤다. 한파주의보. (문자 대화)",
        "miniDialogue": [
          { "speaker": "A", "name": "소연", "en": "We landed early. It's 4:20.", "ko": "일찍 내렸어. 4시 20분이야.", "kr": "위 랜디드 어r리 잇츠 f포어r 트웨니" },
          { "speaker": "B", "name": "지오", "en": "I'm on my way.", "ko": "가는 중이야.", "kr": "아임 온 마이 웨이" },
          { "speaker": "A", "name": "소연", "en": "Take your time. It's freezing outside.", "ko": "천천히 와. 밖에 엄청 추워.", "kr": "테익 여r 타임 잇츠 f리이징 아웃싸이드" },
          { "speaker": "B", "name": "지오", "en": "I'll be there in forty minutes.", "ko": "40분이면 가.", "kr": "아일 비 데어r 인 f포어r리 미닛츠" },
          { "speaker": "A", "name": "소연", "en": "Did you sleep?", "ko": "잠은 잤어?", "kr": "디저 슬리입" },
          { "speaker": "B", "name": "지오", "en": "I didn't sleep at all.", "ko": "한숨도 못 잤어.", "kr": "아이 디든 슬리입 어롤" },
          { "speaker": "A", "name": "소연", "en": "You must be tired.", "ko": "피곤하겠다.", "kr": "유 머스 비 타이어r드" },
          { "speaker": "B", "name": "지오", "en": "I'm almost there.", "ko": "거의 다 왔어.", "kr": "아임 올모우스 데어r" }
        ],
        "drills": [
          { "en": "I'm on my way to the airport.", "ko": "공항 가는 중이야.", "kr": "아임 온 마이 웨이 터 디 에어r포어r트" },
          { "en": "Are you on your way?", "ko": "오는 중이야?", "kr": "아r 여 온 여r 웨이" },
          { "en": "Soyeon is on her way home from the airport.", "ko": "소연은 공항에서 집으로 오는 중이야.", "kr": "소연 이z 온 허r 웨이 호움 f럼 디 에어r포어r트" },
          { "en": "I'm not on my way yet. I'm still at home.", "ko": "아직 출발 안 했어. 아직 집이야.", "kr": "아임 낫 온 마이 웨이 옛 아임 스틸 엇 호움" },
          { "en": "Nani is on her way to the kitchen.", "ko": "나니가 주방으로 가는 중이야.", "kr": "나니 이z 온 허r 웨이 터 더 키친" },
          { "en": "I'm on my way to the airport to pick you up in this cold.", "ko": "이 추위에 너 데리러 공항 가는 중이야.", "kr": "아임 온 마이 웨이 터 디 에어r포어r트 터 피켜 업 인 디스 코울드" }
        ],
        "grammar": [
          { "struct": "be on one's way (to + 장소)", "body": "지금 이동 중이라는 뜻. to 뒤에 목적지가 오고 집은 home 만 쓴다(to home 아님). 동사는 be 라서 I'm / Are you / Soyeon is 로 주어만 바꾸면 된다." }
        ],
        "chunks": [["I'm", "아임", "나는"], ["on my way.", "온 마이 웨이", "가는 중"]],
        "phonemes": [["/w/ way", "way 의 w 는 입술을 둥글게 내밀며 '웨이' — '우에이' 로 늘이지 않는다"]],
        "mistake": "'가는 중' 을 I'm going 이라고만 하면 '갈 거야' 로 들린다. 이미 출발했다는 뜻은 I'm on my way.",
        "similar": "I'm coming. / I'm heading there now.",
        "category": "일상/이동",
        "frequency": 9
      }
    },
    {
      "id": "en-personal-airport-02-forty-minutes",
      "sentence": "I'll be there in forty minutes.",
      "meaning": "40분이면 가.",
      "reading": null,
      "phonetic_kr": "아일 비 데어r 인 f포어r리 미닛츠",
      "order_index": 2,
      "explanation": {
        "key": "I'll be there in forty minutes = 40분이면 가. in + 시간 = 그만큼 뒤에.",
        "anchor": "40분이면",
        "situation": "소연이 안에서 기다리겠다고 한다. 지오가 도착 시간을 알린다. 서둘러도 줄어드는 건 1~2분뿐이라 넉넉히 말한다.",
        "miniDialogue": [
          { "speaker": "A", "name": "소연", "en": "We landed early. It's 4:20.", "ko": "일찍 내렸어. 4시 20분이야.", "kr": "위 랜디드 어r리 잇츠 f포어r 트웨니" },
          { "speaker": "B", "name": "지오", "en": "I'm on my way.", "ko": "가는 중이야.", "kr": "아임 온 마이 웨이" },
          { "speaker": "A", "name": "소연", "en": "Take your time. It's freezing outside.", "ko": "천천히 와. 밖에 엄청 추워.", "kr": "테익 여r 타임 잇츠 f리이징 아웃싸이드" },
          { "speaker": "B", "name": "지오", "en": "I'll be there in forty minutes.", "ko": "40분이면 가.", "kr": "아일 비 데어r 인 f포어r리 미닛츠" },
          { "speaker": "A", "name": "소연", "en": "Did you sleep?", "ko": "잠은 잤어?", "kr": "디저 슬리입" },
          { "speaker": "B", "name": "지오", "en": "I didn't sleep at all.", "ko": "한숨도 못 잤어.", "kr": "아이 디든 슬리입 어롤" },
          { "speaker": "A", "name": "소연", "en": "You must be tired.", "ko": "피곤하겠다.", "kr": "유 머스 비 타이어r드" },
          { "speaker": "B", "name": "지오", "en": "I'm almost there.", "ko": "거의 다 왔어.", "kr": "아임 올모우스 데어r" }
        ],
        "drills": [
          { "en": "I'll be there in a minute.", "ko": "금방 갈게.", "kr": "아일 비 데어r 이너 미닛" },
          { "en": "I'll be there in ten minutes.", "ko": "10분이면 가.", "kr": "아일 비 데어r 인 텐 미닛츠" },
          { "en": "Bongsu will be there at five.", "ko": "봉수는 5시에 올 거야.", "kr": "봉수 윌 비 데어r 엇 f파이v" },
          { "en": "When will you be there?", "ko": "언제 도착해?", "kr": "웬 윌 여 비 데어r" },
          { "en": "I'll be there in forty minutes with a warm car.", "ko": "40분 뒤에 따뜻한 차 가지고 갈게.", "kr": "아일 비 데어r 인 f포어r리 미닛츠 위더 워r엄 카r" },
          { "en": "I won't be there before five.", "ko": "5시 전엔 못 가.", "kr": "아이 워운 비 데어r 비f포어r f파이v" }
        ],
        "grammar": [
          { "struct": "I'll be there in + 시간", "body": "in 은 '~안에' 가 아니라 '~뒤에'. in forty minutes = 40분 뒤에. 시각은 at(at five), 걸리는 시간은 in." }
        ],
        "chunks": [["I'll be there", "아일 비 데어r", "거기 갈게"], ["in forty minutes.", "인 f포어r리 미닛츠", "40분 뒤에"]],
        "phonemes": [["/t/ forty → 포어r리", "forty 의 t 는 모음 사이라 굴러서 ㄹ — '포r티'(X)"], ["I'll → 아일", "어두운 L: 혀끝을 윗잇몸에 대고 끝낸다 (gold 보류 항목, 임시 표기)"]],
        "mistake": "'40분 안에' 로 생각해 within 을 쓰지 않는다. 도착 예고는 in.",
        "similar": "I'll be there soon. / Give me forty minutes.",
        "category": "약속/시간",
        "frequency": 8
      }
    },
    {
      "id": "en-personal-airport-03-no-sleep",
      "sentence": "I didn't sleep at all.",
      "meaning": "한숨도 못 잤어.",
      "reading": null,
      "phonetic_kr": "아이 디든 슬리입 어롤",
      "order_index": 3,
      "explanation": {
        "key": "I didn't sleep at all = 한숨도 못 잤어. not ... at all = 전혀.",
        "anchor": "한숨도",
        "situation": "소연이 잠은 잤냐고 묻는다. 지오는 못 일어날까 봐 한숨도 못 잤다.",
        "miniDialogue": [
          { "speaker": "A", "name": "소연", "en": "We landed early. It's 4:20.", "ko": "일찍 내렸어. 4시 20분이야.", "kr": "위 랜디드 어r리 잇츠 f포어r 트웨니" },
          { "speaker": "B", "name": "지오", "en": "I'm on my way.", "ko": "가는 중이야.", "kr": "아임 온 마이 웨이" },
          { "speaker": "A", "name": "소연", "en": "Take your time. It's freezing outside.", "ko": "천천히 와. 밖에 엄청 추워.", "kr": "테익 여r 타임 잇츠 f리이징 아웃싸이드" },
          { "speaker": "B", "name": "지오", "en": "I'll be there in forty minutes.", "ko": "40분이면 가.", "kr": "아일 비 데어r 인 f포어r리 미닛츠" },
          { "speaker": "A", "name": "소연", "en": "Did you sleep?", "ko": "잠은 잤어?", "kr": "디저 슬리입" },
          { "speaker": "B", "name": "지오", "en": "I didn't sleep at all.", "ko": "한숨도 못 잤어.", "kr": "아이 디든 슬리입 어롤" },
          { "speaker": "A", "name": "소연", "en": "You must be tired.", "ko": "피곤하겠다.", "kr": "유 머스 비 타이어r드" },
          { "speaker": "B", "name": "지오", "en": "I'm almost there.", "ko": "거의 다 왔어.", "kr": "아임 올모우스 데어r" }
        ],
        "drills": [
          { "en": "I didn't eat at all.", "ko": "아무것도 안 먹었어.", "kr": "아이 디든 이잇 어롤" },
          { "en": "Did you sleep at all?", "ko": "잠은 좀 잤어?", "kr": "디저 슬리입 어롤" },
          { "en": "Nani didn't sleep at all last night.", "ko": "나니가 어젯밤 한숨도 안 잤어.", "kr": "나니 디든 슬리입 어롤 라스 나잇" },
          { "en": "I slept for two hours.", "ko": "두 시간 잤어.", "kr": "아이 슬렙트 f퍼r 투우 아워r즈" },
          { "en": "I was afraid I'd oversleep.", "ko": "늦잠 잘까 봐 겁났어.", "kr": "아이 워z 어f레이다이드 오우버r슬리입" },
          { "en": "Soyeon didn't sleep at all on the plane.", "ko": "소연은 비행기에서 한숨도 못 잤어.", "kr": "소연 디든 슬리입 어롤 온 더 플레인" }
        ],
        "grammar": [
          { "struct": "didn't + 동사원형 + at all", "body": "과거 부정은 didn't 뒤에 원형(sleep, slept 아님). at all 은 부정문 끝에 붙어 '전혀'." }
        ],
        "chunks": [["I didn't sleep", "아이 디든 슬리입", "안 잤어"], ["at all.", "어롤", "전혀"]],
        "phonemes": [["at all → 어롤", "at 의 t 가 all 로 굴러 이어진다 — '앳 올'(X)"], ["didn't → 디든", "끝 t 는 거의 안 들린다"]],
        "mistake": "I didn't slept (X). didn't 뒤는 원형.",
        "similar": "I got no sleep. / I was up all night.",
        "category": "건강/수면",
        "frequency": 8
      }
    },
    {
      "id": "en-personal-airport-04-almost-there",
      "sentence": "I'm almost there.",
      "meaning": "거의 다 왔어.",
      "reading": null,
      "phonetic_kr": "아임 올모우스 데어r",
      "order_index": 4,
      "explanation": {
        "key": "I'm almost there = 거의 다 왔어. 도착 직전에.",
        "anchor": "거의",
        "situation": "공항 진입로. 지오가 소연에게 거의 다 왔다고 알린다. 차는 따뜻하게 데워 놨다.",
        "miniDialogue": [
          { "speaker": "A", "name": "소연", "en": "We landed early. It's 4:20.", "ko": "일찍 내렸어. 4시 20분이야.", "kr": "위 랜디드 어r리 잇츠 f포어r 트웨니" },
          { "speaker": "B", "name": "지오", "en": "I'm on my way.", "ko": "가는 중이야.", "kr": "아임 온 마이 웨이" },
          { "speaker": "A", "name": "소연", "en": "Take your time. It's freezing outside.", "ko": "천천히 와. 밖에 엄청 추워.", "kr": "테익 여r 타임 잇츠 f리이징 아웃싸이드" },
          { "speaker": "B", "name": "지오", "en": "I'll be there in forty minutes.", "ko": "40분이면 가.", "kr": "아일 비 데어r 인 f포어r리 미닛츠" },
          { "speaker": "A", "name": "소연", "en": "Did you sleep?", "ko": "잠은 잤어?", "kr": "디저 슬리입" },
          { "speaker": "B", "name": "지오", "en": "I didn't sleep at all.", "ko": "한숨도 못 잤어.", "kr": "아이 디든 슬리입 어롤" },
          { "speaker": "A", "name": "소연", "en": "You must be tired.", "ko": "피곤하겠다.", "kr": "유 머스 비 타이어r드" },
          { "speaker": "B", "name": "지오", "en": "I'm almost there.", "ko": "거의 다 왔어.", "kr": "아임 올모우스 데어r" }
        ],
        "drills": [
          { "en": "We're almost there.", "ko": "거의 다 왔어.", "kr": "위어r 올모우스 데어r" },
          { "en": "Are you almost there?", "ko": "거의 다 왔어?", "kr": "아r 여 올모우스 데어r" },
          { "en": "I'm almost done.", "ko": "거의 다 했어.", "kr": "아임 올모우스 던" },
          { "en": "Soyeon is almost home.", "ko": "소연은 거의 집에 다 왔어.", "kr": "소연 이z 올모우스 호움" },
          { "en": "I'm almost at the Terminal 2 exit.", "ko": "2터미널 출구에 거의 다 왔어.", "kr": "아임 올모우스 엇 더 터r미널 투우 엑씻" },
          { "en": "It's almost five.", "ko": "거의 5시야.", "kr": "잇츠 올모우스 f파이v" }
        ],
        "grammar": [
          { "struct": "be almost + 장소/상태", "body": "almost 는 be 동사 뒤. there(거기), home(집), done(끝) 처럼 짧은 말이 온다." }
        ],
        "chunks": [["I'm almost", "아임 올모우스", "거의"], ["there.", "데어r", "거기"]],
        "phonemes": [["almost → 올모우스", "끝 t 가 there 앞에서 빠진다 — '올모스트'(X)"]],
        "mistake": "'거의 다 왔어' 를 I almost arrived 로 하지 않는다. 회화는 I'm almost there.",
        "similar": "I'm nearly there. / Two minutes away.",
        "category": "일상/이동",
        "frequency": 9
      }
    }
  ]
}
```

- [ ] **Step 4: 게이트 통과**

Run: `node scripts/validate-seed.mjs --payload seeds/en-personal-2026-09-13.json`
Expected: 에러 0(경고는 허용 — 기본동사 비중·chunks 조각 뜻 등). 에러가 나면 메시지가 지목한 카드·필드만 고치고 다시 돌린다(문장·표기는 시안 2판을 벗어나지 않는다).

- [ ] **Step 5: 봇 계정 적재**

봇 uuid 는 `~/.claude/skills/study-fake-mic-e2e/SKILL.md` §2 에서 읽는다. `date` 를 실행일로 맞춘 뒤:

```bash
cd ~/apps/study && source ~/.config/study/.env && node scripts/seed-supabase.mjs --payload seeds/en-personal-2026-09-13.json --user-id <봇 uuid> --dry-run
node scripts/seed-supabase.mjs --payload seeds/en-personal-2026-09-13.json --user-id <봇 uuid>
```

Expected: dry-run 에서 서버 게이트(1일 1장면·completed) 통과, 실적재 후 `INSERT 4 / SELECT 4` 일치.

- [ ] **Step 6: 화면 검증** — 스킬 §4 절차(`preview_start` 로 `study-dev` 5183, 봇 로그인) 뒤 신규 세션 진입. `read_page`/`javascript_tool` 로 확인하고 `computer{screenshot}` 을 남긴다.

확인 항목:
- `.vs-mini .vs-mini-line` 8개, 각 줄에 `button[aria-label="녹음"]`, `.ix` 텍스트가 `소연`/`지오`.
- `.vs-mini-scene` 텍스트가 카드 1 의 `situation`.
- `.vs-chain`·`.vs-prodblock` 없음, `.vs-drills-list` 있음(6행).
- 타깃 줄(카드 1 은 2번째 줄)만 `.tgt`.
- (선택) 스킬 §3 가짜 마이크로 미니대화 2번째 줄 녹음 → 점수 원 표시, Dexie `pronunciationLog` 에 `en-personal-airport-01-on-my-way#mini#I'm on my way.` 행.

- [ ] **Step 7: 정리** — 스킬 §5 대로 봇의 `study_today_lessons`·`pronunciation_log` 행 삭제, `preview_stop`.

- [ ] **Step 8: 커밋 (시드 포함)**

```bash
cd ~/apps && git add study/seeds/en-personal-2026-09-13.json study/seeds/README.md
git commit -m "seed(study): personal 트랙 파일럿 — 공항 픽업 대화 8턴, 카드 4장 (시안 2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 9: 전체 테스트 + push** — `cd ~/apps/study && pnpm test` 전부 PASS 확인 뒤 `cd ~/apps && git push origin main` (apps CLAUDE.md 자동 commit+push 정책; 실패·충돌 시 재시도하지 말고 보고). push 가 `deploy-pages.yml` 을 돌려 Pages 에 올린다 — `gh run list --workflow=deploy-pages.yml --limit 1` 로 성공을 확인한다.

- [ ] **Step 10: 보고** — 스크린샷과 확인 항목 결과, 배포 결과를 오케스트레이터에 보고한다.

---

### Task 6: 영어 트랙 리셋 + 사용자 계정 신규 세션 적재 + 확인

**Files:**
- Create: `scripts/reset-en-track.mjs`, `scripts/reset-en-track.test.mjs`
- Data: Supabase `study_today_lessons`(삭제)·`study_review_queue`(tombstone) — user `7bae5645-61c6-4476-9ff2-4c30a72812ff`, `lang=en` 만
- Backup: `~/apps/tmp/reset-backup-en-<YYYYMMDD>.json`

**Interfaces:**
- Consumes: Task 5 시드(봇 검증·push 완료본), `~/.config/study/.env`(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Produces: 사용자 계정 영어 세션 = 파일럿 4장만, 영어 복습 큐 = 전부 tombstone. 순수 헬퍼 `withTombstone(explanation)`, `splitTargets(rows, lang)`.

- [ ] **Step 1: 실패하는 테스트** — `scripts/reset-en-track.test.mjs`

```js
import { describe, it, expect } from 'vitest';
import { withTombstone, splitTargets } from './reset-en-track.mjs';

/* 영어 트랙 리셋 (2026-09-13 사용자 지시). review 는 행 삭제가 아니라 tombstone(explanation._deleted) — 2026-07-22 규약. */
describe('reset-en-track — 순수 헬퍼', () => {
  it('withTombstone: explanation 에 _deleted=true 를 합치고 나머지는 보존한다 (null 도 처리)', () => {
    expect(withTombstone({ key: 'k', drills: [] })).toEqual({ key: 'k', drills: [], _deleted: true });
    expect(withTombstone(null)).toEqual({ _deleted: true });
  });
  it('splitTargets: 해당 lang 행만 고르고 이미 tombstone 된 행은 뺀다', () => {
    const rows = [
      { id: 'en-1', lang: 'en', explanation: {} },
      { id: 'en-2', lang: 'en', explanation: { _deleted: true } },
      { id: 'ja-1', lang: 'ja', explanation: {} },
    ];
    expect(splitTargets(rows, 'en').map((r) => r.id)).toEqual(['en-1']);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run scripts/reset-en-track.test.mjs`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `scripts/reset-en-track.mjs`

```js
#!/usr/bin/env node
/**
 * reset-en-track.mjs — 영어 트랙 리셋 (2026-09-13 사용자 지시 "기존 세션과 복습 전부 없애고 신규 세션 생성").
 *
 * 1) 백업: 사용자·lang 의 study_today_lessons 전체 + study_review_queue 전체 행을 JSON 으로 저장.
 * 2) review tombstone: study_review_queue 의 해당 행 explanation 에 _deleted=true 를 합쳐 PATCH. 행 삭제는 금지 —
 *    push 가 upsert-only 이고 reconcileTable 이 '서버에 없는 로컬 행'을 되살리므로 2026-07-22 규약대로 tombstone 이 정본이다.
 * 3) lessons 삭제: study_today_lessons 의 해당 행 DELETE (serverOwned — pull 의 staleIdsToDelete 가 기기에서 지운다).
 * 발음 이력·세션 로그·일별 통계·다른 언어는 건드리지 않는다. 사용자가 앱을 열지 않은 상태에서 돌린다.
 *
 * 사용: node scripts/reset-en-track.mjs --user-id <uuid> [--lang en] [--backup <path>] [--dry-run]
 * env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { argv, env, exit } from 'node:process';

export function withTombstone(explanation) {
  const base = (explanation && typeof explanation === 'object' && !Array.isArray(explanation)) ? explanation : {};
  return { ...base, _deleted: true };
}

export function splitTargets(rows, lang) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.lang === lang && !(r.explanation && r.explanation._deleted === true));
}

function parseArgs(a) {
  const o = { lang: 'en', dryRun: false, backup: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--user-id') o.userId = a[++i];
    else if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--backup') o.backup = a[++i];
    else if (a[i] === '--dry-run') o.dryRun = true;
  }
  return o;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(argv.slice(2));
  if (!args.userId) { console.error('usage: --user-id <uuid> [--lang en] [--backup <path>] [--dry-run]'); exit(1); }
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); exit(1); }
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const q = (table, extra = '') => `${base}/${table}?user_id=eq.${args.userId}&lang=eq.${args.lang}${extra}`;

  const lessons = await (await fetch(q('study_today_lessons', '&select=*'), { headers: H })).json();
  const reviews = await (await fetch(q('study_review_queue', '&select=*'), { headers: H })).json();
  if (!Array.isArray(lessons) || !Array.isArray(reviews)) { console.error('[reset] 조회 실패', lessons, reviews); exit(1); }
  const reviewTargets = splitTargets(reviews, args.lang);
  console.log(`[reset] lessons ${lessons.length}건 삭제 대상 · review ${reviews.length}건 중 tombstone 대상 ${reviewTargets.length}건`);

  const backupPath = args.backup || `${env.HOME}/apps/tmp/reset-backup-${args.lang}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
  writeFileSync(backupPath, JSON.stringify({ userId: args.userId, lang: args.lang, at: new Date().toISOString(), lessons, reviews }, null, 2));
  console.log(`[reset] 백업 저장: ${backupPath}`);
  if (args.dryRun) { console.log('[reset] dry-run — 변경 안 함'); exit(0); }

  let patched = 0;
  for (const r of reviewTargets) {
    const res = await fetch(`${base}/study_review_queue?user_id=eq.${args.userId}&id=eq.${encodeURIComponent(r.id)}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ explanation: withTombstone(r.explanation) }),
    });
    if (!res.ok) { console.error(`[reset] tombstone 실패 ${r.id}: ${res.status} ${await res.text()}`); exit(1); }
    patched += 1;
  }
  console.log(`[reset] review tombstone ${patched}건`);

  const del = await fetch(q('study_today_lessons'), { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  if (!del.ok) { console.error(`[reset] lessons 삭제 실패 ${del.status} ${await del.text()}`); exit(1); }
  const left = await (await fetch(q('study_today_lessons', '&select=id'), { headers: H })).json();
  const leftRv = await (await fetch(q('study_review_queue', '&select=id,lang,explanation'), { headers: H })).json();
  console.log(`[reset] 확인: lessons 남은 행 ${Array.isArray(left) ? left.length : '?'} · review 미tombstone ${splitTargets(leftRv, args.lang).length}`);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run scripts/reset-en-track.test.mjs`
Expected: PASS.

- [ ] **Step 5: dry-run** — 건수와 백업 경로를 오케스트레이터가 확인한다(영어 lessons 는 코어100 100장 안팎, review 는 영어 복습 큐 전부).

```bash
cd ~/apps/study && source ~/.config/study/.env && node scripts/reset-en-track.mjs --user-id 7bae5645-61c6-4476-9ff2-4c30a72812ff --dry-run
```

- [ ] **Step 6: 실행** — 같은 명령에서 `--dry-run` 을 뺀다. Expected: 마지막 줄 `확인: lessons 남은 행 0 · review 미tombstone 0`.

- [ ] **Step 7: 사용자 계정에 신규 세션 적재** — 시드 `date` 가 오늘인지 확인한 뒤

```bash
cd ~/apps/study && source ~/.config/study/.env && node scripts/seed-supabase.mjs --payload seeds/en-personal-2026-09-13.json --user-id 7bae5645-61c6-4476-9ff2-4c30a72812ff --dry-run
node scripts/seed-supabase.mjs --payload seeds/en-personal-2026-09-13.json --user-id 7bae5645-61c6-4476-9ff2-4c30a72812ff
```

Expected: `INSERT 4 / SELECT 4` 일치.

- [ ] **Step 8: 화면 확인** — `bash ~/.claude/scripts/chrome-debug.sh` 로 디버그 Chrome(9333, 로그인 유지 프로필)을 띄우고 chrome-devtools MCP(`--browserUrl`)로 배포본 `https://leftjap.github.io/apps/study/` 를 연다. 홈에서 영어 신규 세션 4장·복습 0 을 확인하고, 신규 세션에 들어가 `.vs-mini-line` 8개·줄마다 녹음 버튼·부제 `kr · ko`·`.vs-mini-scene`·`.vs-chain` 없음을 `take_snapshot` 으로 확인, 스크린샷을 남긴다. 디버그 Chrome 이 로그인돼 있지 않으면 그 사실을 보고하고 사용자 휴대폰 확인으로 넘긴다.

- [ ] **Step 9: 커밋 + push**

```bash
cd ~/apps && git add study/scripts/reset-en-track.mjs study/scripts/reset-en-track.test.mjs
git commit -m "chore(study): 영어 트랙 리셋 스크립트 — lessons 삭제·review tombstone·백업 (2026-09-13 사용자 지시)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

- **Spec coverage**: §0-1 (Task 3·4 구조), §0-2 (Task 2), §0-3 (Task 3, 줄 구성 `kr · ko`), §0-4 (변경 없음, Task 2 문서에 명시), §0-5 (Task 4), §0-6 (Task 1·3), §0-7 (Task 3 `scene`), §0-8 (Task 5), §0-9 (Task 6). 누락 없음.
- **Placeholder scan**: 코드 블록은 전부 실제 내용. Task 5 Step 4 의 "메시지가 지목한 필드만 고친다" 는 검증 루프이지 미정 사항이 아니다.
- **Type consistency**: `SESSION_BLOCKS.chainProd`(Task 2 정의 → Task 2 복습·테스트 사용), `MINI_VOICES` A~D(Task 3 정의 → Task 4 사용), `miniDialogueEl(md, s, lang, expr, { demo, onScore, saved, scene })`(Task 3 정의 → 신규·복습 호출 일치), `miniLogId`/`miniLinesOf`(Task 3 정의 → 신규·복습·수화 사용), `miniCueLine`(Task 4 정의·사용), `exLog[id].mini`(Task 3 수화 ↔ `saved: cardEx.mini`). 일치.
