import { describe, it, expect } from 'vitest';
import { validateJaCard, validateJaPayload, STUDY_KANJI } from './validate-ja-core100.mjs';

/* ja-core100 게이트 — validate-seed.mjs 는 lang==='en' 에서만 상세 검사를 돌아서
 * ja 는 구조 검증만 통과하면 무사통과였다. 초보 학습자용이라 reading·음차·drills 4필드가
 * 빠지면 카드가 통째로 못 읽히는 물건이 되므로 guide-ja §14-5 를 기계화한다. */

const okCard = () => ({
  id: 'ja-core100-001-x',
  sentence: 'そっか。',
  meaning: '그렇구나',
  reading: null,
  phonetic_kr: '솟카',
  order_index: 1,
  explanation: {
    key: 'そっか = 그렇구나.',
    whenToUse: '가볍게 납득할 때.',
    grammar: { structure: 'そうか → そっか', explanation: '촉음 축약.', korean_parallel: "'그렇구나'를 '그렇군'으로 줄인 느낌." },
    chunks: [['そっか', '솟카']],
    drills: [
      { ja: 'そっか、わかった。', kana: 'そっか、わかった', ko: '그렇구나, 알겠어', kr: '솟카, 와캇타' },
      { ja: 'そうですか。', kana: 'そうですか', ko: '그렇군요', kr: '소- 데스카' },
      { ja: 'あ、そっか！', kana: 'あ、そっか', ko: '아, 맞다!', kr: '아, 솟카' },
      { ja: 'なるほどね。', kana: 'なるほどね', ko: '과연 그렇네', kr: '나루호도네' },
    ],
    kanji_breakdown: [],
    katakana_gloss: [],
    mistake: "촉음을 흘려 '소카'(X).",
    similar: [{ expression: 'なるほど。', politeness: 'casual', nuance: '이해 쪽' }],
    politeness: 'casual',
    category: '맞장구',
    frequency: 9,
  },
});

describe('validateJaCard — 기본', () => {
  it('정상 카드는 에러 0', () => {
    expect(validateJaCard(okCard())).toEqual([]);
  });
});

describe('reading — 한자를 못 읽는 학습자 보호', () => {
  it('한자가 있는데 reading 이 없으면 차단', () => {
    const c = okCard();
    c.sentence = '確かに。'; c.reading = null;
    c.explanation.chunks = [['確かに', '타시카니']];
    c.phonetic_kr = '타시카니';
    expect(validateJaCard(c).join(' ')).toContain('reading 누락');
  });

  it('한자가 0개인데 reading 이 있으면 차단 (같은 줄이 두 번 뜬다)', () => {
    const c = okCard();
    c.reading = 'そっか';
    expect(validateJaCard(c).join(' ')).toContain('null 이어야');
  });

  it('reading 에 한자가 남아 있으면 차단', () => {
    const c = okCard();
    c.sentence = '確かに。'; c.reading = '確かに。';
    c.explanation.chunks = [['確かに', '타시카니']];
    c.phonetic_kr = '타시카니';
    expect(validateJaCard(c).join(' ')).toContain('reading 에 한자');
  });
});

describe('chunks · phonetic_kr 정합', () => {
  it('chunks 이어붙임이 phonetic_kr 과 다르면 차단', () => {
    const c = okCard();
    c.phonetic_kr = '솟까';
    expect(validateJaCard(c).join(' ')).toContain('phonetic_kr 불일치');
  });

  it('chunks 가 문장을 다 덮지 않으면 차단', () => {
    const c = okCard();
    c.sentence = 'そっか、わかった。';
    expect(validateJaCard(c).join(' ')).toContain('문장 전체를 덮지 않음');
  });
});

describe('drills — ja 는 kana 포함 4필드', () => {
  it('kana 누락을 차단한다 (초보는 한자를 못 읽는다)', () => {
    const c = okCard();
    delete c.explanation.drills[0].kana;
    expect(validateJaCard(c).join(' ')).toContain('drills[0].kana 누락');
  });

  it('4개 미만이면 차단', () => {
    const c = okCard();
    c.explanation.drills = c.explanation.drills.slice(0, 3);
    expect(validateJaCard(c).join(' ')).toContain('drills 는 4~8개');
  });

  it('원문을 그대로 베낀 드릴은 차단 (변주가 아니다)', () => {
    const c = okCard();
    c.explanation.drills[0] = { ja: 'そっか。', kana: 'そっか', ko: '그렇구나', kr: '솟카' };
    expect(validateJaCard(c).join(' ')).toContain('원문과 동일');
  });

  it('서로 중복된 드릴을 차단', () => {
    const c = okCard();
    c.explanation.drills[1] = { ...c.explanation.drills[0] };
    expect(validateJaCard(c).join(' ')).toContain('drills[1] 중복');
  });
});

describe('kanji_breakdown — 학습 한자 26자', () => {
  it('학습 한자가 있는데 분해가 없으면 차단', () => {
    const c = okCard();
    c.sentence = '水をください。'; c.reading = 'みずをください。';
    c.explanation.chunks = [['水を', '미즈오'], ['ください。', '쿠다사이']];
    c.phonetic_kr = '미즈오 쿠다사이';
    // '水' 는 학습 한자가 아니므로 통과해야 한다
    expect(validateJaCard(c).filter((x) => x.includes('kanji_breakdown'))).toEqual([]);
  });

  it('학습 한자(食)는 분해 의무', () => {
    const c = okCard();
    c.sentence = '食べる。'; c.reading = 'たべる。';
    c.explanation.chunks = [['食べる。', '타베루']];
    c.phonetic_kr = '타베루';
    expect(validateJaCard(c).join(' ')).toContain("학습 한자 '食'");
  });

  it('STUDY_KANJI 는 커리큘럼 §7-1 의 26자', () => {
    expect(STUDY_KANJI.size).toBe(26);
    expect(STUDY_KANJI.has('願')).toBe(true);
    expect(STUDY_KANJI.has('嘘')).toBe(false); // 1회 등장 = 인식 전용
  });
});

describe('katakana_gloss — 가타카나를 자꾸 잊는 학습자', () => {
  it('가타카나가 있는데 gloss 가 없으면 차단', () => {
    const c = okCard();
    c.sentence = 'コーヒー。'; c.reading = null;
    c.explanation.chunks = [['コーヒー。', '코-히-']];
    c.phonetic_kr = '코-히-';
    expect(validateJaCard(c).join(' ')).toContain('katakana_gloss 누락');
  });

  it('히라가나 표기의 장음 ー 는 허용한다 (こーひー 는 정상)', () => {
    const c = okCard();
    c.sentence = 'コーヒー。'; c.reading = null;
    c.explanation.chunks = [['コーヒー。', '코-히-']];
    c.phonetic_kr = '코-히-';
    c.explanation.katakana_gloss = [{ word: 'コーヒー', origin: 'coffee', hiragana: 'こーひー', kr: '코-히-' }];
    expect(validateJaCard(c).filter((x) => x.includes('hiragana'))).toEqual([]);
  });

  it('gloss 의 hiragana 칸에 가타카나가 있으면 차단', () => {
    const c = okCard();
    c.sentence = 'コーヒー。'; c.reading = null;
    c.explanation.chunks = [['コーヒー。', '코-히-']];
    c.phonetic_kr = '코-히-';
    c.explanation.katakana_gloss = [{ word: 'コーヒー', origin: 'coffee', hiragana: 'コーヒー', kr: '코-히-' }];
    expect(validateJaCard(c).join(' ')).toContain('hiragana 가 가타카나');
  });
});

describe('금지 필드', () => {
  it('chain 을 차단한다 (사용자 지시)', () => {
    const c = okCard();
    c.explanation.chain = { target: 'x' };
    expect(validateJaCard(c).join(' ')).toContain('chain');
  });

  it('콩트 메타를 차단한다', () => {
    const c = okCard();
    c.explanation.scene_id = 'x';
    expect(validateJaCard(c).join(' ')).toContain('콩트 메타');
  });
});

describe('validateJaPayload', () => {
  it('track 이 ja-core100 이 아니면 차단', () => {
    const errs = validateJaPayload({ lang: 'ja', track: 'moduyeongeo', date: '2026-08-28', cards: [okCard()] });
    expect(errs.join(' ')).toContain("track 은 'ja-core100'");
  });

  it('ID 중복을 차단', () => {
    const errs = validateJaPayload({ lang: 'ja', track: 'ja-core100', date: '2026-08-28', cards: [okCard(), okCard()] });
    expect(errs.join(' ')).toContain('ID 중복');
  });

  it('정상 payload 는 에러 0', () => {
    expect(validateJaPayload({ lang: 'ja', track: 'ja-core100', date: '2026-08-28', cards: [okCard()] })).toEqual([]);
  });
});
