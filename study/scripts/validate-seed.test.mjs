/**
 * validate-seed.test.mjs — 시드 콘텐츠 검증기 (en RealClass) 단위 테스트.
 *
 * 대상: scripts/validate-seed.mjs
 *  - validateSeedContent(payload, { existingSeeds, speakerNames }) — 순수 검증
 *  - evaluateServerGuards({ serverRows, payloadIds }) — 1일 1장면 + completed 게이트 (순수)
 *  - parseSpeakerVoiceNames(src) — speech.js 소스에서 en-US 화자 키 추출
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validateSeedContent,
  evaluateServerGuards,
  parseSpeakerVoiceNames,
  loadSourceEnLines,
} from './validate-seed.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const seedsDir = join(__dir, '..', 'seeds');

const SPEAKERS = new Set(['Leslie', 'Ann', 'Tom']);

/** 최소 유효 payload — 검사 통과 기준선. overrides 로 케이스 변형. */
function makePayload(overrides = {}) {
  const expr = (id, oi, sentence, chunks, drillCount = 5) => ({
    id, sentence, meaning: '뜻', reading: null,
    phonetic_kr: chunks.map((c) => c[1]).join(' '),
    order_index: oi,
    explanation: {
      key: `${sentence} = 뜻.`,
      situation: '장면 · 맥락',
      drills: Array.from({ length: drillCount }, (_, i) => ({ en: `Drill ${i}.`, ko: '뜻', kr: '드릴' })),
      grammar: [{ struct: '구조', body: '설명' }],
      chunks,
      phonemes: [['/ð/', 'that']],
      mistake: '함정',
      similar: '대체 표현',
      category: 'chunk/test',
      frequency: 7,
    },
  });
  const payload = {
    _source: { episode: 's1e1', lines: [1, 20] },
    lang: 'en',
    date: '2026-06-11',
    cards: [
      {
        id: 'en-parks-s1e1-test-scene',
        sentence: '테스트 장면', meaning: "전체 장면을 먼저 듣고 '시작하기'를 누르세요.",
        reading: null, phonetic_kr: null, order_index: 0,
        explanation: {
          sceneTitle: '테스트 장면', sceneSummary: '요약',
          dialogue: [
            { speaker: 'Ann', en: 'Alpha line one.', ko: '한 줄' },
            { speaker: 'Leslie', en: 'Beta line two.', ko: '두 줄' },
            { speaker: 'Ann', en: 'Gamma line three.', ko: '세 줄' },
            { speaker: 'Leslie', en: 'Delta line four.', ko: '네 줄' },
            { speaker: 'Ann', en: 'Epsilon line five.', ko: '다섯 줄' },
            { speaker: 'Leslie', en: 'Zeta line six.', ko: '여섯 줄' },
          ],
        },
      },
      expr('en-parks-s1e1-test-a', 1, 'Alpha line one.', [['Alpha line', '알파 라인'], ['one.', '원.']]),
      expr('en-parks-s1e1-test-b', 2, 'Beta line two.', [['Beta line', '베타 라인'], ['two.', '투.']]),
      expr('en-parks-s1e1-test-c', 3, 'Gamma line three.', [['Gamma line', '감마 라인'], ['three.', '쓰리.']]),
      expr('en-parks-s1e1-test-d', 4, 'Delta line four.', [['Delta line', '델타 라인'], ['four.', '포.']]),
      expr('en-parks-s1e1-test-e', 5, 'Epsilon line five.', [['Epsilon line', '엡실론 라인'], ['five.', '파이브.']]),
    ],
  };
  return { ...payload, ...overrides };
}

const okOpts = { existingSeeds: [], speakerNames: SPEAKERS };

describe('validateSeedContent — 기준선', () => {
  it('유효 payload → ok, errors 0', () => {
    const r = validateSeedContent(makePayload(), okOpts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('현행 적재 시드 en-2026-06-10-2.json → 통과 (기존 시드 2종을 existingSeeds 로)', () => {
    const load = (f) => JSON.parse(readFileSync(join(seedsDir, f), 'utf8'));
    const payload = load('en-2026-06-10-2.json');
    const existing = ['en-parks-s1e1.json', 'en-2026-06-10.json'].map((f) => {
      const p = load(f);
      return { file: f, ids: new Set(p.cards.map((c) => c.id)), source: p._source ?? null };
    });
    const r = validateSeedContent(payload, { existingSeeds: existing, speakerNames: SPEAKERS });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('validateSeedContent — 구조', () => {
  it('scene 카드 부재 → 차단', () => {
    const p = makePayload();
    p.cards = p.cards.slice(1);
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('scene');
  });

  it('dialogue 5줄 (<6) → 차단', () => {
    const p = makePayload();
    p.cards[0].explanation.dialogue = p.cards[0].explanation.dialogue.slice(0, 5);
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
  });

  it('표현 카드 0장 → 차단 (PPP 최소 1장)', () => {
    const p = makePayload();
    p.cards = p.cards.slice(0, 1); // scene 만, 표현 0
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('표현 카드 최소 1장');
  });

  it('표현 카드 1~2장 (PPP 집중) → 통과', () => {
    const p = makePayload();
    p.cards = p.cards.slice(0, 3); // scene + 표현 2 (move on 등 집중)
    const r = validateSeedContent(p, okOpts);
    expect(r.errors.filter((e) => e.includes('표현 카드'))).toEqual([]);
  });

  it('표현 카드 5장 (과다) → 경고 (차단 아님)', () => {
    const r = validateSeedContent(makePayload(), okOpts); // makePayload = 표현 5장
    expect(r.warnings.join(' ')).toContain('과다 추출');
  });

  it('8필드 누락 (mistake 없음) → 차단', () => {
    const p = makePayload();
    delete p.cards[1].explanation.mistake;
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('mistake');
  });
});

describe('validateSeedContent — 발음 정합', () => {
  it('phonetic_kr ≠ chunks kr 이어붙임 → 차단', () => {
    const p = makePayload();
    p.cards[1].phonetic_kr = '다른 음차';
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('phonetic_kr');
  });

  it('chunks 가 본문 전단어 미커버 → 차단', () => {
    const p = makePayload();
    p.cards[1].explanation.chunks = [['Alpha', '알파']]; // 'line one' 누락
    p.cards[1].phonetic_kr = '알파';
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('chunks');
  });
});

describe('validateSeedContent — 다이얼로그 매칭 계약 (deriveDialogue 동일 로직)', () => {
  it('표현 카드 순서가 dialogue 등장 순서와 어긋남 → 차단', () => {
    const p = makePayload();
    const [scene, a, b, ...rest] = p.cards;
    p.cards = [scene, b, a, ...rest]; // a/b 순서 교환 (order_index 도 교환)
    p.cards[1].order_index = 1;
    p.cards[2].order_index = 2;
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('매칭');
  });

  it('sentence 가 어느 줄에도 미포함 → 차단', () => {
    const p = makePayload();
    p.cards[1].sentence = 'Nowhere sentence.';
    p.cards[1].explanation.chunks = [['Nowhere sentence.', '노웨어 센텐스.']];
    p.cards[1].phonetic_kr = '노웨어 센텐스.';
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('매칭');
  });
});

describe('validateSeedContent — drills', () => {
  it('2개 (<3) → 차단 / 9개 (>8) → 차단 / kr 누락 → 차단', () => {
    const low = makePayload();
    low.cards[1].explanation.drills = low.cards[1].explanation.drills.slice(0, 2);
    expect(validateSeedContent(low, okOpts).ok).toBe(false);

    const high = makePayload();
    high.cards[1].explanation.drills = Array.from({ length: 9 }, (_, i) => ({ en: `D${i}.`, ko: '뜻', kr: '드릴' }));
    expect(validateSeedContent(high, okOpts).ok).toBe(false);

    const noKr = makePayload();
    delete noKr.cards[1].explanation.drills[0].kr;
    expect(validateSeedContent(noKr, okOpts).ok).toBe(false);
  });

  it('전 표현 카드 drills ≤4 → 경고 (하한 일괄 깔기)', () => {
    const p = makePayload();
    for (const c of p.cards.slice(1)) c.explanation.drills = c.explanation.drills.slice(0, 4);
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true); // 차단은 아님
    expect(r.warnings.join(' ')).toContain('하한');
  });
});

describe('validateSeedContent — ID·_source', () => {
  it('기존 시드와 ID 중복 → 차단', () => {
    const r = validateSeedContent(makePayload(), {
      existingSeeds: [{ file: 'x.json', ids: new Set(['en-parks-s1e1-test-a']), source: null }],
      speakerNames: SPEAKERS,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('중복');
  });

  it('_source 누락 → 차단 / 기존 시드와 구간 겹침 → 차단', () => {
    const noSrc = makePayload();
    delete noSrc._source;
    expect(validateSeedContent(noSrc, okOpts).ok).toBe(false);

    const overlap = validateSeedContent(makePayload(), {
      existingSeeds: [{ file: 'y.json', ids: new Set(), source: { episode: 's1e1', lines: [15, 30] } }],
      speakerNames: SPEAKERS,
    });
    expect(overlap.ok).toBe(false);
    expect(overlap.errors.join(' ')).toContain('겹침');
  });

  it('다른 에피소드 같은 구간은 겹침 아님', () => {
    const r = validateSeedContent(makePayload(), {
      existingSeeds: [{ file: 'z.json', ids: new Set(), source: { episode: 's1e2', lines: [1, 20] } }],
      speakerNames: SPEAKERS,
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateSeedContent — 화자 등록 (TTS)', () => {
  it('SPEAKER_VOICES 미등록 화자 → 차단', () => {
    const p = makePayload();
    p.cards[0].explanation.dialogue[0].speaker = 'Ron';
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('Ron');
  });
});

describe('validateSeedContent — 비 RealClass payload (generic)', () => {
  it('ja payload 는 RealClass 검사 skip — id 중복만', () => {
    const p = {
      lang: 'ja', date: '2026-06-11',
      cards: [
        { id: 'ja-1', sentence: 'あ', meaning: '아' },
        { id: 'ja-1', sentence: 'い', meaning: '이' },
      ],
    };
    const r = validateSeedContent(p, { existingSeeds: [], speakerNames: SPEAKERS });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('중복');
    const ok = validateSeedContent({ ...p, cards: [p.cards[0]] }, { existingSeeds: [], speakerNames: SPEAKERS });
    expect(ok.ok).toBe(true);
  });
});

describe('evaluateServerGuards — 서버 게이트 (순수)', () => {
  const ids = new Set(['a', 'b']);

  it('서버 빈 상태 → 통과', () => {
    expect(evaluateServerGuards({ serverRows: [], payloadIds: ids }).ok).toBe(true);
  });

  it('같은 (lang,date) 에 payload 외 id 존재 → 차단 (1일 1장면)', () => {
    const r = evaluateServerGuards({ serverRows: [{ id: 'other', completed: false }], payloadIds: ids });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('1일 1장면');
  });

  it('payload id 중 completed=true 존재 → 차단 (학습 시작 후 재INSERT 금지)', () => {
    const r = evaluateServerGuards({ serverRows: [{ id: 'a', completed: true }], payloadIds: ids });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('completed');
  });

  it('같은 id 재적재 (completed=false) → 통과 (학습 전 보강)', () => {
    const r = evaluateServerGuards({ serverRows: [{ id: 'a', completed: false }], payloadIds: ids });
    expect(r.ok).toBe(true);
  });
});

describe('parseSpeakerVoiceNames — speech.js 소스 파싱', () => {
  it('실제 speech.js 에서 Leslie/Ann/Tom 추출', () => {
    const src = readFileSync(join(__dir, '..', 'src', 'services', 'speech.js'), 'utf8');
    const names = parseSpeakerVoiceNames(src);
    expect(names.has('Leslie')).toBe(true);
    expect(names.has('Ann')).toBe(true);
    expect(names.has('Tom')).toBe(true);
  });
});

describe('validateSeedContent — 약점 음소 가중 (_context.weakPhonemes, 2026-06-10 Step 4)', () => {
  it('컨텍스트 있음 + 표현 phonemes 와 교차 0 → 경고 (차단 아님)', () => {
    const p = makePayload({ _context: { weakPhonemes: ['/ŋ/'] } });
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toContain('약점 음소');
  });

  it('컨텍스트 있음 + 교차 존재 → 경고 없음', () => {
    const p = makePayload({ _context: { weakPhonemes: ['/ð/'] } }); // makePayload 표현 phonemes = /ð/
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('약점 음소'))).toEqual([]);
  });

  it('컨텍스트 없음 → 경고 없음 (구 시드 호환)', () => {
    const r = validateSeedContent(makePayload(), okOpts);
    expect(r.warnings.filter((w) => w.includes('약점 음소'))).toEqual([]);
  });
});

describe('validateSeedContent — 충실성 게이트 (소스 대조)', () => {
  // makePayload dialogue = Alpha~Zeta line. sourceEnLines 로 소스 실재 여부 주입.
  const SRC_ALL = ['Alpha line one. And more.', 'Beta line two.', 'Gamma line three.', 'Delta line four.', 'Epsilon line five.', 'Zeta line six.'];

  it('dialogue 줄이 소스에 없음(재구성·둔갑) → 차단', () => {
    const src = [...SRC_ALL.slice(0, 5), 'A totally different fabricated sentence.']; // Zeta 누락
    const r = validateSeedContent(makePayload(), { ...okOpts, sourceEnLines: src });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('충실성 위반');
  });

  it('모든 dialogue 줄 소스 실재(말미 trim 포함) → 충실성 error 없음', () => {
    const r = validateSeedContent(makePayload(), { ...okOpts, sourceEnLines: SRC_ALL });
    expect(r.errors.filter((e) => e.includes('충실성'))).toEqual([]);
  });

  it('sourceEnLines 미제공 → 충실성 미검증 경고 (ok 유지)', () => {
    const r = validateSeedContent(makePayload(), okOpts);
    expect(r.warnings.join(' ')).toContain('충실성 미검증');
    expect(r.errors.filter((e) => e.includes('충실성'))).toEqual([]);
  });

  it('loadSourceEnLines — 소스 부재 episode → null / 존재 시 해당 EN 추출', () => {
    expect(loadSourceEnLines(seedsDir, { episode: 's9e9-nonexistent', lines: [1, 2] })).toBeNull();
    const lines = loadSourceEnLines(seedsDir, { episode: 's1e1', lines: [72, 73] });
    if (lines) expect(lines.join(' ')).toContain('Ann Perkins'); // gitignored 소스 로컬 존재 시
    else expect(lines).toBeNull(); // CI(소스 부재) 그레이스풀
  });
});

describe('validateSeedContent — 기본동사 중심 / 어려운 어휘 차단 (학습 anchor)', () => {
  it('라틴계·추상 어휘(utilize) → 차단', () => {
    const p = makePayload();
    p.cards[1].explanation.key = 'Please utilize the form.';
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('어려운 어휘');
  });

  it('기본동사 비중 <60% → 경고', () => {
    const r = validateSeedContent(makePayload(), okOpts); // Alpha~ 표현엔 기본동사 0
    expect(r.warnings.join(' ')).toContain('기본동사 비중');
  });

  it('기본동사 포함 표현 ≥60% → 기본동사 경고 없음', () => {
    const p = makePayload();
    // 표현 sentence 를 기본동사 포함으로 교체 (dialogue 도 동기화해 매칭 계약 유지)
    const verbs = ['I get it.', 'Take care.', 'Let it go.', 'Make do.', 'Come on.'];
    p.cards[0].explanation.dialogue = verbs.map((en, i) => ({ speaker: i % 2 ? 'Leslie' : 'Ann', en, ko: '뜻' }))
      .concat([{ speaker: 'Leslie', en: 'Zeta line six.', ko: '여섯' }]);
    verbs.forEach((en, i) => {
      p.cards[i + 1].sentence = en;
      p.cards[i + 1].explanation.chunks = [[en, '음차']];
      p.cards[i + 1].phonetic_kr = '음차';
      p.cards[i + 1].explanation.key = `${en} = 뜻.`;
    });
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('기본동사 비중'))).toEqual([]);
  });
});

describe('validateSeedContent — 목표적합 추출 (PPP: 짧은 고빈도 청크)', () => {
  it('타깃 표현이 긴 절(>5단어, 명대사성) → 경고', () => {
    const p = makePayload();
    p.cards[1].explanation.key = "let me show you how it's done = 보여줄게."; // 7단어
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.join(' ')).toContain('긴 절');
  });

  it('타깃 표현이 짧은 청크(≤5단어) → 경고 없음', () => {
    const p = makePayload();
    p.cards[1].explanation.key = 'move on = 넘어가다.'; // 2단어
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('긴 절'))).toEqual([]);
  });
});

describe('validateSeedContent — seed-supabase 필수 필드 정합 (meaning)', () => {
  it('표현 카드 meaning 누락 → 차단 (validate↔seed 갭)', () => {
    const p = makePayload();
    delete p.cards[1].meaning;
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('meaning 누락');
  });
});
