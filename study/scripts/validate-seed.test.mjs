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
  epFileStem,
  showOfEpisode,
  quotedClipDrill,
} from './validate-seed.mjs';

/* 게이트 보강(2026-07-22: 첫단어 다양성·인용형 차단) 이후의 기준선 픽스처 —
 * 첫 단어·문형이 다양해야 baseline payload 가 게이트를 통과한다. */
const DRILL_POOL = [
  { en: 'Can we begin now?', ko: '뜻', kr: '캔 위 비긴 나우' },
  { en: 'She began without us.', ko: '뜻', kr: '쉬 비갠 위다웃 어스' },
  { en: "Don't begin yet.", ko: '뜻', kr: '돈 비긴 옛' },
  { en: 'When does it begin?', ko: '뜻', kr: '웬 더즈 잇 비긴' },
  { en: 'We did not begin on time.', ko: '뜻', kr: '위 디드 낫 비긴 온 타임' },
  { en: 'It begins at noon.', ko: '뜻', kr: '잇 비긴즈 앳 눈' },
  { en: 'You can begin today.', ko: '뜻', kr: '유 캔 비긴 투데이' },
  { en: 'They began last week.', ko: '뜻', kr: '데이 비갠 라스트 위크' },
  { en: 'Should we begin again?', ko: '뜻', kr: '슈드 위 비긴 어겐' },
  { en: 'I begin work at nine.', ko: '뜻', kr: '아이 비긴 워크 앳 나인' },
];
const poolDrills = (n) => Array.from({ length: n }, (_, i) => ({ ...DRILL_POOL[i % DRILL_POOL.length] }));

const __dir = dirname(fileURLToPath(import.meta.url));
const seedsDir = join(__dir, '..', 'seeds');

describe('epFileStem — 소스 파일명 스템 (show 접두어 벗김, 양 쇼 대칭)', () => {
  it('office 접두어 제거', () => {
    expect(epFileStem('office-s1e2')).toBe('s1e2');
  });
  it('parks 접두어 제거 (기존 버그: parks- 미스트립 → realclass-parks-parks-* ENOENT)', () => {
    expect(epFileStem('parks-s1e2')).toBe('s1e2');
    expect(showOfEpisode('parks-s1e2')).toBe('parks');
  });
  it('bare 스템(parks 시드 _source 규칙)은 그대로', () => {
    expect(epFileStem('s1e2')).toBe('s1e2');
    expect(showOfEpisode('s1e2')).toBe('parks');
  });
});

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
      drills: poolDrills(drillCount),
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

describe('validateSeedContent — ladder (선택 확장 사다리, base→확장)', () => {
  const validLadder = [
    { en: 'A coffee.', ko: '커피.', kr: '어 커피', adds: 'base' },
    { en: 'A coffee, please.', ko: '커피 주세요.', kr: '어 커피 플리즈', adds: 'object' },
    { en: 'Can I get a coffee, please?', ko: '커피 하나 주시겠어요?', kr: '캔 아이 게러 커피 플리즈', adds: 'particle' },
    { en: 'Can I get an iced coffee to go, please?', ko: '아이스커피 포장 주시겠어요?', kr: '캔 아이 게런 아이스 커피 투고 플리즈', adds: 'adverbial' },
  ];
  const withLadder = (ladder) => { const p = makePayload(); p.cards[1].explanation.ladder = ladder; return p; };
  const ladderErrs = (p) => validateSeedContent(p, okOpts).errors.filter((e) => e.includes('ladder'));

  it('유효 ladder → ladder error 0', () => {
    expect(ladderErrs(withLadder(validLadder))).toEqual([]);
  });
  it('ladder 미존재 → 하위호환 (ladder error 0)', () => {
    expect(ladderErrs(makePayload())).toEqual([]);
  });
  it('단수 1 (부족) → 차단', () => {
    expect(ladderErrs(withLadder([validLadder[0]])).some((e) => e.includes('2~6'))).toBe(true);
  });
  it('단수 7 (초과) → 차단', () => {
    expect(ladderErrs(withLadder([...validLadder, ...validLadder.slice(0, 3)])).some((e) => e.includes('2~6'))).toBe(true);
  });
  it('rung kr 음차 누락 → 차단', () => {
    const bad = validLadder.map((x, i) => (i === 1 ? { ...x, kr: '' } : x));
    expect(ladderErrs(withLadder(bad)).some((e) => e.includes('kr'))).toBe(true);
  });
  it('단조 확장 위배 (단어수 감소) → 차단', () => {
    expect(ladderErrs(withLadder([validLadder[0], validLadder[3], validLadder[1]])).some((e) => e.includes('단조'))).toBe(true);
  });

  // back-chaining pass — 최종 단을 끝→처음(tail-anchored) 청크로 재조립 (연결발화 훈련)
  const validBack = [
    ['to go, please?', '투 고 플리즈'],
    ['an iced coffee to go, please?', '언 아이스 커피 투 고 플리즈'],
    ['Can I get an iced coffee to go, please?', '캔 아이 게런 아이스 커피 투 고 플리즈'],
  ];
  const withBack = (back) => {
    const l = validLadder.map((r) => ({ ...r }));
    l[l.length - 1] = { ...l[l.length - 1], back };
    return withLadder(l);
  };
  const backErrs = (p) => ladderErrs(p).filter((e) => e.includes('back'));

  it('유효 back(끝→처음 성장) → back error 0', () => {
    expect(backErrs(withBack(validBack))).toEqual([]);
  });
  it('back 미존재 → 하위호환 (back error 0)', () => {
    expect(backErrs(withLadder(validLadder))).toEqual([]);
  });
  it('back 1개 (부족) → 차단', () => {
    expect(backErrs(withBack([validBack[0]])).some((e) => e.includes('2~4'))).toBe(true);
  });
  it('back 항목이 [en, kr] 쌍 아님 → 차단', () => {
    expect(backErrs(withBack([validBack[0], ['only-en'], validBack[2]])).some((e) => e.includes('en'))).toBe(true);
  });
  it('back tail 성장 위배 (단어수 감소) → 차단', () => {
    expect(backErrs(withBack([validBack[2], validBack[0], validBack[1]])).some((e) => e.includes('tail'))).toBe(true);
  });
});

describe('validateSeedContent — 기준선', () => {
  it('유효 payload → ok, errors 0', () => {
    const r = validateSeedContent(makePayload(), okOpts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('현행 적재 시드 en-2026-06-10-2.json → 구조 통과 (fill in 은 신규 하드차단이나 grandfather)', () => {
    const load = (f) => JSON.parse(readFileSync(join(seedsDir, f), 'utf8'));
    const payload = load('en-2026-06-10-2.json');
    const existing = ['en-parks-s1e1.json', 'en-2026-06-10.json'].map((f) => {
      const p = load(f);
      return { file: f, ids: new Set(p.cards.map((c) => c.id)), source: p._source ?? null };
    });
    const r = validateSeedContent(payload, { existingSeeds: existing, speakerNames: SPEAKERS });
    // 이 시드는 'fill in'(비기본동사 구동사) 타깃 + base 반복 드릴을 씀 — 각각 2026-07-01·2026-07-11
    // 하드 차단 신설로 이제 error. 이미 적재·학습된 grandfather 시드라 재INSERT 안 함(게이트는 신규 payload 용).
    // 그 두 정책 에러를 뺀 나머지 구조 에러는 0이어야 한다.
    // 2026-07-22 게이트 보강(4~10개·인용형·첫단어 다양성)도 신규 payload 정책 — grandfather 필터에 포함.
    const nonPolicyErrors = r.errors.filter((e) => !e.includes('비기본동사 구동사') && !e.includes('영상 원문(base)')
      && !e.includes('4~10개') && !e.includes('인용형') && !e.includes('다양성'));
    expect(nonPolicyErrors).toEqual([]);
    expect(r.errors.some((e) => e.includes('비기본동사 구동사'))).toBe(true); // fill in 이 이제 차단됨(정책 확인)
    expect(r.errors.some((e) => e.includes('영상 원문(base)'))).toBe(true); // base 반복이 이제 차단됨(새 세션 정책 확인)
  });
});

describe('validateSeedContent — moduyeongeo 한시 트랙 (scene·_source 예외)', () => {
  const moduExpr = (id, oi, sentence, chunks) => ({
    id, sentence, meaning: '뜻', reading: null,
    phonetic_kr: chunks.map((c) => c[1]).join(' '),
    order_index: oi,
    explanation: {
      key: `${sentence} = 뜻.`,
      situation: '영상 클립 맥락',
      drills: poolDrills(5),
      grammar: [{ struct: '구조', body: '설명' }],
      chunks,
      phonemes: [['/ð/', 'that']],
      mistake: '함정', similar: '대체', category: 'chunk/test', frequency: 7,
      // sceneless 트랙(moduyeongeo·core100)은 chain 이 의무 — 없으면 세션에서 체이닝 블록이 통째로 사라진다.
      chain: { target: `${sentence.replace(/[.?!]$/, '')} for now, I think`, chunks: [sentence.replace(/[.?!]$/, ''), 'for now,', 'I think'], ko: '지금은 그런 것 같아' },
    },
  });
  const makeModu = (overrides = {}) => ({
    track: 'moduyeongeo', lang: 'en', ep: 1,
    cards: [
      moduExpr('en-moduyeongeo-ep1-a', 1, 'It is no big deal.', [['It is no', '잇츠 노우'], ['big deal.', '빅 디일.']]),
      moduExpr('en-moduyeongeo-ep1-b', 2, 'Let us move on.', [['Let us', '레츠'], ['move on.', '무v 온.']]),
    ],
    ...overrides,
  });

  it('scene·_source 없어도 통과 (트랙 예외)', () => {
    const r = validateSeedContent(makeModu(), okOpts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('표현카드 품질검사는 유지 — phonetic_kr 불일치는 여전히 차단', () => {
    const p = makeModu();
    p.cards[0].phonetic_kr = '틀린 발음';
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('phonetic_kr');
  });

  // core100 (2026-08-26) — 코어 100문장 커리큘럼도 scene 없는 표현 전용 세션.
  it('core100 트랙도 scene·_source 예외', () => {
    const r = validateSeedContent(makeModu({ track: 'core100' }), okOpts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('core100 도 표현카드 품질검사는 유지', () => {
    const p = makeModu({ track: 'core100' });
    p.cards[0].phonetic_kr = '틀린 발음';
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('phonetic_kr');
  });

  /* 2026-08-28 — core100 전환(8447946)이 chain 없는 시드를 게이트 경고 0 으로 통과시켰다.
   * 결과: 세션에서 체이닝 블록이 통째로 사라지고(buildChainSteps 가 빈 배열) 연습 문장이 11→8 로 줄었다.
   * chain 은 선택 필드였다 — scene 이 없는 트랙에서는 체이닝이 유일한 청각 확장 축이므로 의무로 승격한다. */
  it('sceneless 트랙에서 chain 이 없으면 차단한다 (core100 전환 회귀 재발 방지)', () => {
    for (const track of ['moduyeongeo', 'core100']) {
      const p = makeModu({ track });
      p.cards.forEach((c) => { delete c.explanation.chain; });
      const r = validateSeedContent(p, okOpts);
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toContain('chain');
    }
  });

  it('한 장만 빠져도 그 카드가 지목된다', () => {
    const p = makeModu({ track: 'core100' });
    delete p.cards[1].explanation.chain;
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('en-moduyeongeo-ep1-b');
  });

  /* 음차 연음 재분절 (guide-en §7, 2026-07-22 사용자 지시 — "캔 유 → 캐뉴", "왓 이즈 → 워리즈").
   * 의무인데 게이트가 검사하지 않아 코퍼스 40%(드릴 866개 중 343개)가 단어별 표기로 남아 있었다.
   * 판정: 받침 있는 음절 + 공백 + ㅇ으로 시작하는 음절 = 이어 적어야 할 경계. 차단이 아니라 경고 —
   * 기존 시드 다수가 걸리고, 실제 발화가 끊기는 자리(강세·휴지)도 있어 저작자 판단이 필요하다. */
  it('음차가 연음 경계를 안 이으면 경고한다 (캔 유 → 캐뉴)', () => {
    const p = makeModu({ track: 'core100' });
    p.cards[0].explanation.drills[0].kr = '캔 유 두 잇';
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.join(' ')).toContain('연음');
    expect(r.ok).toBe(true); // 경고일 뿐 차단 아님
  });

  it('이어 적었으면 경고하지 않는다', () => {
    const p = makeModu({ track: 'core100' });
    p.cards.forEach((c) => c.explanation.drills.forEach((d) => { d.kr = '캐뉴 두 잇'; }));
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('연음'))).toEqual([]);
  });

  it('받침이 없거나 다음이 자음이면 대상이 아니다', () => {
    const p = makeModu({ track: 'core100' });
    p.cards.forEach((c) => c.explanation.drills.forEach((d) => { d.kr = '쏘리 아이 디든 캐치'; }));
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('연음'))).toEqual([]);
  });

  /* 오탐 제거 (2026-08-31) — 한글 초성 ㅇ 은 음가가 없어 '받침+ㅇ초성'만 보면 영어에서 이어지지
   * 않는 자리까지 잡힌다. 뒤 음절이 이중모음으로 시작하면 원음이 활음 /j/·/w/ 라 앞 받침이 넘어갈
   * 자리가 아니다. 대가로 can you→캐뉴 같은 자리는 놓치지만, 경고의 신뢰도가 먼저다. */
  it('뒤 음절이 활음(이중모음)으로 시작하면 연음 대상이 아니다', () => {
    for (const kr of ['미인 위', '씽 워r크스', 'f럼 예스터r데이', '낫 유어r 잘못']) {
      const p = makeModu({ track: 'core100' });
      p.cards.forEach((c) => c.explanation.drills.forEach((d) => { d.kr = kr; }));
      const r = validateSeedContent(p, okOpts);
      expect(r.warnings.filter((w) => w.includes('연음')), kr).toEqual([]);
    }
  });

  /* chunks 경계 = 저작자가 지정한 호흡 자리 — 그 자리를 넘어 이어 읽지 않는다. phonetic_kr 을
   * 통째로 검사하면 청크와 청크 사이가 전부 미적용으로 잡힌다(오탐). 청크 안에서만 본다. */
  it('청크 경계는 연음 대상이 아니다', () => {
    const p = makeModu({ track: 'core100' });
    p.cards.forEach((c) => c.explanation.drills.forEach((d) => { d.kr = '쏘리 아이 디든 캐치'; }));
    p.cards[0].explanation.chunks = [['How to explain it', '하우 투 익스플레이닛'], ['in English.', '이닝글리쉬']];
    p.cards[0].phonetic_kr = '하우 투 익스플레이닛 이닝글리쉬';
    p.cards[0].sentence = 'How to explain it in English.';
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('연음'))).toEqual([]);
  });

  /* 응용 연습의 목적은 핵심 표현을 여러 맥락에서 다시 만나는 것이고, 시안(§4.4·§6.5)은 그 재사용을
   * 드릴 행 밑줄로 표시한다. 표현이 한 번도 안 들어간 드릴 묶음은 응용이 아니라 유의어 나열이라
   * 밑줄이 하나도 안 그려진다 — 실측: 사용자 대기 카드 6장에서 드릴 30개 중 4개(13%)만 매치.
   * 차단하지 않고 경고만 — 기존 시드 상당수가 걸리고, 패러프레이즈가 의도인 카드도 있다. */
  it('드릴이 핵심 표현을 하나도 안 담으면 경고한다', () => {
    const p = makeModu({ track: 'core100' });
    p.cards[0].explanation.key = 'keep an eye on = 지켜보다.';
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.join(' ')).toContain('핵심 표현');
  });

  it('드릴 하나라도 표현을 담으면 경고하지 않는다', () => {
    const p = makeModu({ track: 'core100' });
    p.cards.forEach((c) => { c.explanation.key = 'keep an eye on = 지켜보다.'; });
    p.cards[0].explanation.drills[0].en = 'Could you keep an eye on my bag?';
    p.cards[1].explanation.drills[0].en = 'She will keep an eye on it.';
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('핵심 표현'))).toEqual([]);
  });

  it('자리표시자 key 도 와일드카드로 인정한다 (렌더와 같은 판정)', () => {
    const p = makeModu({ track: 'core100' });
    p.cards.forEach((c) => { c.explanation.key = 'take care of X = 돌보다.'; });
    p.cards[0].explanation.drills[0].en = "I'll take care of him.";
    p.cards[1].explanation.drills[0].en = 'She will take care of the kids.'; // 굴절형(takes)은 대상 아님 — 자리표시자는 X 자리만
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('핵심 표현'))).toEqual([]);
  });

  // ── chain (무자막 청각 확장, 2026-07-09) — ladder 대체. 앱이 chunks 누적으로 단계를 만든다. ──
  const CHAIN_OK = {
    target: "It's been a while since we caught up. We should grab dinner sometime.",
    chunks: ["It's been a while", 'since we caught up', 'We should grab dinner', 'sometime'],
    ko: '오랜만이야. 언제 저녁이나 먹자.',
  };

  it('chain 미존재는 통과 (선택 필드·하위호환)', () => {
    const r = validateSeedContent(makeModu(), okOpts);
    expect(r.ok).toBe(true);
  });

  it('chain 정상 — chunks 를 이어붙이면 target 과 같으면 통과', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = CHAIN_OK;
    const r = validateSeedContent(p, okOpts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('chain.chunks 를 이어붙여도 target 이 안 되면 차단 (앱 단계 생성이 깨짐)', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = { ...CHAIN_OK, chunks: ["It's been a while", 'and then something else'] };
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('chain.chunks');
  });

  it('chain.ko 누락은 차단 (3회 실패 힌트가 한국어 뜻을 쓴다)', () => {
    const p = makeModu();
    const { ko, ...noKo } = CHAIN_OK;
    p.cards[0].explanation.chain = noKo;
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('chain.ko');
  });

  it('chain.chunks 2개 미만은 차단', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = { target: 'Hello there', chunks: ['Hello there'], ko: '안녕' };
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('chain.chunks');
  });

  /* 2026-07-13 — 단계 세분화(사용자 결정): 증분 기본 1~3단어(분절 불가 절만 4).
   * 목적 = base 다회 발화 + 듣기 집중 → 잘게. 단 끊는 지점은 자연 휴지점만(절 내부 휴지 = 비유창성 지표).
   * 경고만 — 차단하면 경고를 끄려고 기능어 뒤 끊기 같은 작위 분절을 하게 된다. */
  it('chain 증분 과대 — 비첫 chunk 가 4단어를 넘으면 경고 (기본 1~3, 최대 4)', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = {
      target: 'It is no big deal because we can try again.',
      chunks: ['It is no big deal', 'because we can try again.'],
      ko: '별일 아니야, 다시 하면 되니까.',
    };
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true); // 경고지 차단 아님
    expect(r.warnings.join(' ')).toContain('증분');
  });

  it('chain 증분 4단어(분절 불가 절)까지는 경고 없음', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = {
      target: 'It is no big deal. You should not worry about it.',
      chunks: ['It is no big deal.', 'You should not worry', 'about it.'],
      ko: '별일 아니야. 걱정하지 마.',
    };
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('chain'))).toEqual([]);
  });

  /* 2026-07-13 — 단계 수는 규정하지 않는다(사용자 결정): 증분 규칙만 지키면 단계 수는
   * target 길이가 자연 결정. 단계 하한을 경고하면 루틴이 경고를 끄려고 억지 확장·분절을 한다.
   * (BNC 실회화 평균 발화 ~8.8단어 — 모든 target 을 길게 밀면 부자연) */
  it('chain 단계 수는 자유 — 증분만 규칙 내면 3단계·10단어도 경고 없음', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = {
      target: 'It is no big deal. We can try again tomorrow.',
      chunks: ['It is no big deal.', 'We can try', 'again tomorrow.'],
      ko: '별일 아니야. 내일 다시 하면 돼.',
    };
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true);
    expect(r.warnings.filter((w) => w.includes('chain'))).toEqual([]);
  });

  it('chain 가이드 준수(base 시작·증분 ≤4·정상 말끝)는 경고 없음', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = {
      target: 'It is no big deal. You should not worry, okay?',
      chunks: ['It is no big deal.', 'You should not worry,', 'okay?'],
      ko: '별일 아니야. 걱정하지 마, 알았지?',
    };
    const r = validateSeedContent(p, okOpts);
    const chainWarns = r.warnings.filter((w) => w.includes('chain'));
    expect(chainWarns).toEqual([]);
  });

  /* 2026-07-13 — 가이드 규칙 중 기계 판정 가능한 2개를 게이트로 승격 (예시 저작에서 위반이
   * 게이트를 통과한 실증 후속). 둘 다 경고 — 품사 분석 없는 부분 휴리스틱이라 차단은 과함. */
  it('chain 1번째 chunk 가 base(카드 원문)와 다르면 경고', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = {
      target: 'Wait, it is no big deal, okay?',
      chunks: ['Wait, it is no big deal,', 'okay?'],
      ko: '잠깐, 별일 아니야, 알았지?',
    };
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toContain('base');
  });

  it('chain 비마지막 chunk 가 관사·소유격·단음절 전치사로 끝나면 경고 (말끝 불가 지점)', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = {
      target: 'It is no big deal. Look at the bright side.',
      chunks: ['It is no big deal.', 'Look at the', 'bright side.'],
      ko: '별일 아니야. 좋은 면을 봐.',
    };
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toContain('말끝');
  });

  it('chain 구동사 불변화사(hold on 등)로 끝나는 chunk 는 오탐하지 않음', () => {
    const p = makeModu();
    p.cards[0].explanation.chain = {
      target: 'It is no big deal, so hold on, okay?',
      chunks: ['It is no big deal,', 'so', 'hold on,', 'okay?'],
      ko: '별일 아니야, 그러니까 잠깐만, 알았지?',
    };
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('말끝'))).toEqual([]);
  });

  // ── drills 근접중복 (판정 단일 출처 = applied.js nearDupDrills — 거기서 단위 테스트) ──
  /* 2026-07-10 — moduyeongeo 도 차단으로 승격. 렌더 필터는 구 데이터 안전망일 뿐,
   * 저작(생성) 단계에서 막지 않으면 근접중복이 계속 만들어진다(사용자 지시). */
  it('moduyeongeo 도 덧붙인 근접중복은 차단 (호칭·감탄사는 변주가 아니다)', () => {
    const p = makeModu();
    p.cards[0].explanation.drills = [
      { en: 'It is no big deal.', ko: '뜻', kr: '드릴' },        // exact = base → 차단
      { en: 'Honey, it is no big deal.', ko: '뜻', kr: '드릴' }, // added → 차단
      { en: 'Sorry, it is no big deal.', ko: '뜻', kr: '드릴' }, // added → 차단
    ];
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('근접중복');
  });

  it('영상 원문(base) 반복은 1개라도 차단 — 응용에 base 를 넣지 않는다 (2026-07-11, 새 세션 정책)', () => {
    const p = makeModu();
    p.cards[0].explanation.drills = [
      { en: 'It is no big deal.', ko: '뜻', kr: '드릴' },              // exact = base → 차단
      { en: 'Was it a big deal to you?', ko: '뜻', kr: '드릴' },       // 진짜 변주
      { en: 'They said it was no big deal at all.', ko: '뜻', kr: '드릴' },
    ];
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('근접중복');
  });

  it('base 없이 진짜 변주만 있으면 통과 (정상 카드를 막지 않는다)', () => {
    const p = makeModu();
    p.cards[0].explanation.drills = [
      { en: 'Was it a big deal to you?', ko: '뜻', kr: '드릴' },       // 진짜 변주
      { en: 'They said it was no big deal at all.', ko: '뜻', kr: '드릴' },
      { en: 'Why is it such a big deal?', ko: '뜻', kr: '드릴' },
    ];
    const r = validateSeedContent(p, okOpts);
    expect(r.errors.join(' ')).not.toContain('근접중복');
  });

  it('영상 원문 반복이 2개 이상이면 차단 (같은 문장 되풀이)', () => {
    const p = makeModu();
    p.cards[0].explanation.drills = [
      { en: 'It is no big deal.', ko: '뜻', kr: '드릴' },
      { en: 'It is no big deal!', ko: '뜻', kr: '드릴' },  // 구두점만 다름 → exact 2개
      { en: 'Was it a big deal to you?', ko: '뜻', kr: '드릴' },
    ];
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('근접중복');
  });

  it('회귀: track 없는 정상 en 은 여전히 scene 강제 (예외 누수 방지)', () => {
    const p = makeModu();
    delete p.track;
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('scene');
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
  /* 2026-07-28 — 상한 차단 폐지(사용자 지시 "필요한 만큼"): 활용도 높은 프레임이면 10개를
   * 넘어도 좋다. 하한 4 차단은 유지(빈 응용 방지), 14개 초과는 정원 채우기 의심 경고만. */
  it('3개 (<4) → 차단 / 11개 → 통과(상한 폐지) / 15개 → 통과+경고 / kr 누락 → 차단', () => {
    const low = makePayload();
    low.cards[1].explanation.drills = low.cards[1].explanation.drills.slice(0, 3);
    expect(validateSeedContent(low, okOpts).ok).toBe(false);

    const eleven = makePayload();
    eleven.cards[1].explanation.drills = poolDrills(11);
    expect(validateSeedContent(eleven, okOpts).ok).toBe(true);

    const fifteen = makePayload();
    fifteen.cards[1].explanation.drills = poolDrills(15);
    const rf = validateSeedContent(fifteen, okOpts);
    expect(rf.ok).toBe(true); // 차단 아님
    expect(rf.warnings.join(' ')).toContain('정원 채우기 의심');

    const noKr = makePayload();
    delete noKr.cards[1].explanation.drills[0].kr;
    expect(validateSeedContent(noKr, okOpts).ok).toBe(false);
  });

  /* 원문 인용형 — base 앞뒤에 대본 문장·스터터를 붙인 건 변주가 아니라 인용이다(2026-07-22).
   * 오늘 시드 실측: 7카드 중 다수의 1번 드릴이 이 유형으로 게이트를 통과하고 있었다. */
  it('원문 인용형 드릴(다른 문장 + base 그대로) → 차단', () => {
    const p = makePayload();
    const s = p.cards[1].sentence;
    p.cards[1].explanation.drills = [...poolDrills(4), { en: `I know. ${s}`, ko: '뜻', kr: '음차' }];
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('인용형');
  });

  it('첫 단어 다양성 <3종 (드릴 ≥4개) → 차단 (축 다양성 근사 게이트)', () => {
    const p = makePayload();
    p.cards[1].explanation.drills = [
      { en: "I'll call you tonight.", ko: '뜻', kr: '음차' },
      { en: "I'll call her tomorrow.", ko: '뜻', kr: '음차' },
      { en: "I'll call them later.", ko: '뜻', kr: '음차' },
      { en: 'She calls me every day.', ko: '뜻', kr: '음차' },
    ];
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('다양성');
  });

  it('quotedClipDrill — 인용형 판정: 문장 결합·스터터는 잡고, 단일 문장 변주·확장 문장은 안 잡는다', () => {
    expect(quotedClipDrill("I'll be there as soon as I can.", "I know. I'll be there as soon as I can.")).toBe(true);
    expect(quotedClipDrill('What are you doing?', 'What are you doing? Come here.')).toBe(true);
    // 스터터 — 연속 중복어를 접고 base 와 비교
    expect(quotedClipDrill("I don't know what to do.", "I- I don't know what to do. Okay?")).toBe(true);
    // 단일 문장 변주(부사 추가)·다문장이지만 base 그대로인 문장이 없는 경우는 인용형 아님
    expect(quotedClipDrill('What are you doing?', 'What are you doing tonight?')).toBe(false);
    expect(quotedClipDrill("I'll be waiting.", "Come home. I'll be waiting for you.")).toBe(false);
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

describe('validateSeedContent — sentence 가 맨 구문 차단 (복습=문장, 2026-06-30)', () => {
  function bareChunkPayload() {
    const scene = {
      id: 'en-parks-s1e2-bc-scene', sentence: '장면', meaning: "전체 장면을 먼저 듣고 '시작하기'를 누르세요.",
      reading: null, phonetic_kr: null, order_index: 0,
      explanation: { sceneTitle: '장면', sceneSummary: '요약', dialogue: [
        { speaker: 'Leslie', en: 'Nose to the grindstone.', ko: '1' },
        { speaker: 'Ann', en: 'Can we stop, please?', ko: '2' },
        { speaker: 'Ann', en: 'Because it is hot.', ko: '3' },
        { speaker: 'Leslie', en: 'Yeah, I am hot, too.', ko: '4' },
        { speaker: 'Ann', en: 'My house is really close by.', ko: '5' },
        { speaker: 'Ann', en: 'Let us take a break here.', ko: '6' },
      ] },
    };
    const card = {
      id: 'en-parks-s1e2-close-by', sentence: 'close by', meaning: '가까이', reading: null,
      phonetic_kr: '클로우스 바이', order_index: 1,
      explanation: { key: 'close by = 가까이.', situation: '장면',
        drills: Array.from({ length: 5 }, (_, i) => ({ en: `D${i}.`, ko: '뜻', kr: '드릴' })),
        grammar: [{ struct: 'a', body: 'b' }], chunks: [['close', '클로우스'], ['by', '바이']],
        phonemes: [['/k/', 'close']], mistake: 'm', similar: 's', category: 'chunk', frequency: 7 },
    };
    return makePayload({ _source: { episode: 's1e2', lines: [1, 9] }, cards: [scene, card] });
  }

  it('sentence=맨 구문 + 더 긴 원문 라인 존재 → 차단', () => {
    const r = validateSeedContent(bareChunkPayload(), okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('맨 구문');
  });

  it('sentence=전체 원문 라인이면 통과 (구문은 key 에)', () => {
    const p = bareChunkPayload();
    p.cards[1].sentence = 'My house is really close by.';
    p.cards[1].phonetic_kr = '마이 하우스 이즈 리얼리 클로우스 바이';
    p.cards[1].explanation.chunks = [['My', '마이'], ['house', '하우스'], ['is', '이즈'], ['really', '리얼리'], ['close', '클로우스'], ['by', '바이']];
    const r = validateSeedContent(p, okOpts);
    expect(r.errors.filter((e) => e.includes('맨 구문'))).toEqual([]);
  });
});

describe('validateSeedContent — 비기본동사 구동사 차단 (기본동사 우선, 2026-06-30 wrap it up)', () => {
  function withTarget(key, sentence, chunks) {
    const scene = {
      id: 'en-parks-s1e2-bv-scene', sentence: '장면', meaning: "전체 장면을 먼저 듣고 '시작하기'를 누르세요.",
      reading: null, phonetic_kr: null, order_index: 0,
      explanation: { sceneTitle: '장면', sceneSummary: '요약', dialogue: [
        { speaker: 'Ann', en: sentence, ko: '1' },
        { speaker: 'Leslie', en: 'Beta line two.', ko: '2' },
        { speaker: 'Ann', en: 'Gamma line three.', ko: '3' },
        { speaker: 'Leslie', en: 'Delta line four.', ko: '4' },
        { speaker: 'Ann', en: 'Epsilon line five.', ko: '5' },
        { speaker: 'Leslie', en: 'Zeta line six.', ko: '6' },
      ] },
    };
    const card = {
      id: 'en-parks-s1e2-tgt', sentence, meaning: '뜻', reading: null,
      phonetic_kr: chunks.map((c) => c[1]).join(' '), order_index: 1,
      explanation: { key, situation: '장면', drills: Array.from({ length: 5 }, (_, i) => ({ en: `D${i}.`, ko: '뜻', kr: '드릴' })),
        grammar: [{ struct: 'a', body: 'b' }], chunks, phonemes: [['/k/', 'x']], mistake: 'm', similar: 's', category: 'c', frequency: 7 },
    };
    return makePayload({ _source: { episode: 's1e2', lines: [1, 9] }, cards: [scene, card] });
  }

  it('타깃이 비기본동사 구동사("wrap it up") → 차단(error) — 구조적으로 못 들어감', () => {
    const p = withTarget('wrap it up = 마무리하다.', 'Please wrap it up now.',
      [['Please', '플리즈'], ['wrap it', '랩 잇'], ['up now.', '업 나우']]);
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('비기본동사 구동사');
  });

  it('타깃이 기본동사 구동사("call you back") → 통과 (error·경고 없음)', () => {
    const p = withTarget('call you back = 다시 전화하다.', 'I will call you back.',
      [['I will', '아윌'], ['call you', '콜 유'], ['back.', '백']]);
    const r = validateSeedContent(p, okOpts);
    expect(r.errors.filter((e) => e.includes('비기본동사 구동사'))).toEqual([]);
  });

  it('타깃이 비동사 고빈도 청크("close by")는 오탐 없음 (구동사 아님)', () => {
    const p = withTarget('close by = 가까이.', 'My house is close by.',
      [['My', '마이'], ['house', '하우스'], ['is', '이즈'], ['close', '클로우스'], ['by', '바이']]);
    const r = validateSeedContent(p, okOpts);
    expect(r.errors.filter((e) => e.includes('비기본동사 구동사'))).toEqual([]);
  });
});

describe('validateSeedContent — 기본동사 추출 시뮬 고정 (A/B, 2026-07-02 재현)', () => {
  // 삭제됐던 임시 sim 을 영구 테스트로 고정. office-s1e2 기본동사 타깃(go with/come in) vs wrap it up.
  const scene = (dlg) => ({
    id: 'en-office-s1e2-ab-scene', sentence: '장면', meaning: "전체 장면을 먼저 듣고 '시작하기'를 누르세요.",
    reading: null, phonetic_kr: null, order_index: 0,
    explanation: { sceneTitle: '장면', sceneSummary: '요약', dialogue: dlg },
  });
  const card = (id, oi, sentence, key, chunks) => ({
    id, sentence, meaning: '뜻', reading: null, phonetic_kr: chunks.map((c) => c[1]).join(' '), order_index: oi,
    explanation: { key, situation: '장면', drills: Array.from({ length: 5 }, (_, i) => ({ en: `D${i}.`, ko: '뜻', kr: '드릴' })),
      grammar: [{ struct: 'a', body: 'b' }], chunks, phonemes: [['/g/', 'go']], mistake: 'm', similar: 's', category: 'c', frequency: 8 },
  });
  const dlg = [
    { speaker: 'Jim', en: "I'd go with the rows.", ko: '1' },
    { speaker: 'Michael', en: 'That is a good idea.', ko: '2' },
    { speaker: 'Michael', en: 'Today is the day.', ko: '3' },
    { speaker: 'Michael', en: 'Someone will come in soon.', ko: '4' },
    { speaker: 'Michael', en: 'It is a big day.', ko: '5' },
    { speaker: 'Michael', en: 'And it should wrap it up.', ko: '6' },
  ];
  const goWith = card('ab-go-with', 1, "I'd go with the rows.", 'go with = 택하다.',
    [["I'd", '아이드'], ['go with', '고우 위드'], ['the rows.', '더 로우즈']]);
  const comeIn = card('ab-come-in', 2, 'Someone will come in soon.', 'come in = 들어오다.',
    [['Someone', '썸원'], ['will', '윌'], ['come in', '컴 인'], ['soon.', '순']]);

  it('A. 기본동사 타깃 2장(go with/come in) → 기본동사·비기본동사 경고 0 (비중 2/2=100%)', () => {
    const r = validateSeedContent(makePayload({ _source: { episode: 'office-s1e2', lines: [4, 9] }, cards: [scene(dlg), goWith, comeIn] }), okOpts);
    expect(r.warnings.filter((w) => /비중 낮음|비기본동사 구동사/.test(w))).toEqual([]);
  });

  it('B. 비기본동사 wrap it up 섞이면 → 차단(error) + 비중 경고 (구조적으로 못 들어감)', () => {
    const wrapUp = card('ab-wrap-up', 2, 'And it should wrap it up.', 'wrap it up = 마무리하다.',
      [['And it', '앤 잇'], ['should', '슈드'], ['wrap it', '랩 잇'], ['up.', '업']]);
    const r = validateSeedContent(makePayload({ _source: { episode: 'office-s1e2', lines: [4, 9] }, cards: [scene(dlg), goWith, wrapUp] }), okOpts);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('비기본동사 구동사'); // wrap it up 차단
    expect(r.warnings.join(' ')).toContain('비중 낮음'); // 1/2 = 50% (비중은 경고 유지)
  });
});

describe('validateSeedContent — 소스 순서 가드 (finish-parks-first, 2026-07-01 뒤죽박죽 방지)', () => {
  // existingSeeds 는 source.episode 만 쓰므로 최소 스텁으로 사용맵 구성
  const seedsFrom = (eps) => eps.map((ep, i) => ({ file: `en-x${i}.json`, ids: new Set(), source: { episode: ep, lines: [1, 10] } }));
  const optsWith = (eps) => ({ existingSeeds: seedsFrom(eps), speakerNames: SPEAKERS });
  const withSource = (episode) => makePayload({ _source: { episode, lines: [1, 20] } });
  const hasWarn = (r, needle) => r.warnings.some((w) => w.includes(needle));

  it('office 선택 + parks 미착수 화(s1e3~6) 존재 → finish-parks-first 경고', () => {
    const r = validateSeedContent(withSource('office-s1e3'), optsWith(['s1e1', 's1e2', 'office-s1e1', 'office-s1e2']));
    expect(hasWarn(r, 'finish-parks-first')).toBe(true);
  });

  it('parks 선택(우선 쇼) → finish-parks-first 경고 없음', () => {
    const r = validateSeedContent(withSource('s1e3'), optsWith(['s1e1', 's1e2', 'office-s1e1', 'office-s1e2']));
    expect(hasWarn(r, 'finish-parks-first')).toBe(false);
  });

  it('parks 전 6화 착수 완료 후 office 선택 → finish-parks-first 경고 없음', () => {
    const r = validateSeedContent(withSource('office-s1e1'), optsWith(['s1e1', 's1e2', 's1e3', 's1e4', 's1e5', 's1e6']));
    expect(hasWarn(r, 'finish-parks-first')).toBe(false);
  });

  it('낮은 화 전량 미착수인데 높은 화 선택(parks s1e4, s1e3 미착수) → 에피소드 순서 경고', () => {
    const r = validateSeedContent(withSource('s1e4'), optsWith(['s1e1', 's1e2']));
    expect(hasWarn(r, '에피소드 순서')).toBe(true);
  });

  it('가장 이른 미사용 화 선택(parks s1e3, s1e1·s1e2 착수) → 에피소드 순서 경고 없음', () => {
    const r = validateSeedContent(withSource('s1e3'), optsWith(['s1e1', 's1e2']));
    expect(hasWarn(r, '에피소드 순서')).toBe(false);
  });

  it('화 번호 파싱 실패(s2e1 — s1eN 형식 아님) → 순서 검사 skip + 파싱 실패 경고 1줄 (silent skip 가시화)', () => {
    const r = validateSeedContent(withSource('s2e1'), optsWith(['s1e1', 's1e2']));
    expect(hasWarn(r, '에피소드 순서')).toBe(false); // null → 순차 검사 skip (오판 없음)
    expect(hasWarn(r, '파싱 실패')).toBe(true);      // 단 무증상 통과는 금지 — 경고로 가시화
  });

  it('대소문자 episode(OFFICE-S1E3) 도 가드 정상 진입 → finish-parks-first 경고', () => {
    const r = validateSeedContent(withSource('OFFICE-S1E3'), optsWith(['s1e1', 's1e2', 'office-s1e1', 'office-s1e2']));
    expect(hasWarn(r, 'finish-parks-first')).toBe(true);
  });
});

/* 문장 모아보기 v12 (2026-09-03, 작업지시서 §7) — 선택 필드 두 개. 게이트는 경고만 낸다(차단 아님):
 * chunks[i][2] = 조각 뜻(한글, 영어 어순) — 힌트 1단(어순)·정답 조각 정렬에 쓴다.
 * explanation.anchor = meaning 안의 핵심 표현 부분 문자열 — 프롬프트 밑줄. meaning 에 없으면 밑줄이 안 그려진다. */
describe('validateSeedContent — 문장 모아보기 선택 필드 (chunks[i][2]·anchor) 는 경고만', () => {
  it('chunks 에 조각 뜻(세 번째 원소)이 없으면 경고, 차단은 아니다', () => {
    const p = makePayload();
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true);
    expect(r.warnings.filter((w) => w.includes('조각 뜻')).length).toBeGreaterThan(0);
  });

  it('조각 뜻이 전부 있으면 그 경고가 없다', () => {
    const p = makePayload();
    for (const c of p.cards.slice(1)) c.explanation.chunks = c.explanation.chunks.map((x) => [x[0], x[1], '뜻']);
    const r = validateSeedContent(p, okOpts);
    expect(r.warnings.filter((w) => w.includes('조각 뜻'))).toEqual([]);
  });

  it('anchor 가 meaning 의 부분 문자열이 아니면 경고, 있으면 없음', () => {
    const p = makePayload();
    p.cards[1].explanation.anchor = '없는 구절';
    p.cards[2].explanation.anchor = '뜻'; // meaning === '뜻'
    const r = validateSeedContent(p, okOpts);
    expect(r.ok).toBe(true);
    const w = r.warnings.filter((x) => x.includes('meaning 에 없음')); // '(학습 anchor)' 문구의 다른 경고와 구분
    expect(w.length).toBe(1);
    expect(w[0]).toContain('en-parks-s1e1-test-a');
  });
});
