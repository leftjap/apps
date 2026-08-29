import { describe, it, expect } from 'vitest';
import { computeDeductionScore, DEDUCTION_RATES, KO_WEAK_PHONEMES } from './deductionScore.js';

/* 감점제 점수 엔진 (2026-08-29 사용자 설계 확정) — 100에서 항목별 차감, 인위적 문턱 없음.
 * 축별 상한 합 = 50 → 단어를 다 말했으면 50점 바닥이 산수로 보장된다.
 * 단가(DEDUCTION_RATES)는 초안 — 1~2주 실측 분포로 보정 후 화면 전환(3단계).
 * 실측 근거: 원어민 TTS(acc96·flu99·pros91.1) 는 ~98, 끊어읽기(flu63·단조8단어) 는 ~76 이 나와야
 * "원어민만 90점대" 가 자연 성립한다 — 아래 테스트가 그 두 앵커를 고정한다. */

const W = (word, score) => ({ word, score });
const PH = (word, ...symbols) => symbols.map((s) => ({ symbol: s, word, score: 80 }));

describe('computeDeductionScore — 축별 감점', () => {
  const EXP = 'sorry could you say';   // 4단어 → 단어당 예산 30/4 = 7.5

  it('완벽 발화(원어민 앵커) → 98점대, 감점 내역이 근거와 함께 나온다', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say',
      wordScores: [W('sorry', 100), W('could', 100), W('you', 100), W('say', 100)],
      fluencyScore: 99, prosodyScore: 91.1,
      prosodyIssues: { monotoneWords: [], unexpectedBreaks: [], missingBreaks: [] },
    }, EXP);
    expect(r.score).toBe(98);          // 100 − 유창 0.25 − 억양 1.34
    expect(r.floor).toBe(50);
    expect(r.deductions.every((d) => d.points >= 0)).toBe(true);
  });

  it('한 단어 60점(비취약) → 단어 예산 비례 감점 7.5×0.4=3', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say',
      wordScores: [W('sorry', 60), W('could', 100), W('you', 100), W('say', 100)],
      fluencyScore: 100, prosodyScore: 100,
    }, EXP);
    expect(r.score).toBe(97);
    expect(r.deductions.find((d) => d.axis === 'words').points).toBe(3);
  });

  it('취약 음소(f) 단어는 같은 결손도 1.5배 깎인다', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say',
      wordScores: [W('sorry', 60), W('could', 100), W('you', 100), W('say', 100)],
      phonemeScores: [{ symbol: 'f', word: 'sorry', score: 40 }],   // sorry 에 f 포함(합성 예)
      fluencyScore: 100, prosodyScore: 100,
    }, EXP);
    expect(r.deductions.find((d) => d.axis === 'words').points).toBe(4.5);  // 3 × 1.5
    expect(r.score).toBe(96);  // round(100 − 4.5)
  });

  it('개인 실측 약점(personalWeak)도 취약 세트에 합쳐진다', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say',
      wordScores: [W('sorry', 60), W('could', 100), W('you', 100), W('say', 100)],
      phonemeScores: [{ symbol: 'eh', word: 'sorry', score: 40 }],  // eh 는 기본 세트엔 없음
      fluencyScore: 100, prosodyScore: 100,
    }, EXP, { personalWeak: ['eh'] });
    expect(r.deductions.find((d) => d.axis === 'words').points).toBe(4.5);
  });

  it('끊어읽기 앵커(실측 flu 63·단조 8/8·pros 86.5) → 70점대 중반', () => {
    const words = 'sorry could you say that again more slowly'.split(' ');
    const r = computeDeductionScore({
      recognizedText: words.join(' '),
      wordScores: words.map((w) => W(w, 85)),
      fluencyScore: 63, prosodyScore: 86.5,
      prosodyIssues: { monotoneWords: words, unexpectedBreaks: [], missingBreaks: [] },
    }, words.join(' '));
    // 단어 30×0.15=4.5 + 유창 min(10, 37×0.25)=9.25 + 억양 min(10, 8×1+13.5×0.15)=10
    expect(r.score).toBe(76);
  });

  it('전 축 바닥이어도 단어를 다 말했으면 50점 (축 상한 합 = 50)', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say',
      wordScores: [W('sorry', 0), W('could', 0), W('you', 0), W('say', 0)],
      fluencyScore: 0, prosodyScore: 0,
      prosodyIssues: { monotoneWords: ['sorry', 'could', 'you', 'say'], unexpectedBreaks: [], missingBreaks: [] },
    }, EXP);
    expect(r.score).toBe(50);
    expect(r.floor).toBe(50);
  });

  it('단어 누락 — 지분만큼 감점 + 바닥이 비례로 내려간다', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could',                       // 4단어 중 2개만
      wordScores: [W('sorry', 100), W('could', 100)],
      fluencyScore: 100, prosodyScore: 100,
    }, EXP);
    expect(r.floor).toBe(25);                              // 50 × 0.5
    expect(r.deductions.find((d) => d.axis === 'missing').points).toBe(50);  // 100×(2/4)
    expect(r.score).toBe(50);
  });

  it('프로소디 미측정(값 없음)이면 그 축은 깎지 않는다 — 근거 없으면 감점 없음', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say',
      wordScores: [W('sorry', 100), W('could', 100), W('you', 100), W('say', 100)],
    }, EXP);
    expect(r.score).toBe(100);
  });

  it('감점 내역은 큰 순서로 정렬되고 라벨이 있다', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say',
      wordScores: [W('sorry', 40), W('could', 100), W('you', 100), W('say', 100)],
      fluencyScore: 80, prosodyScore: 100,
    }, EXP);
    const pts = r.deductions.map((d) => d.points);
    expect([...pts].sort((a, b) => b - a)).toEqual(pts);
    expect(r.deductions.every((d) => typeof d.label === 'string' && d.label.length > 0)).toBe(true);
  });
});

describe('상수 계약', () => {
  it('축 상한 합 = 50 (바닥 보장의 근거)', () => {
    expect(DEDUCTION_RATES.words.max + DEDUCTION_RATES.fluency.max + DEDUCTION_RATES.intonation.max).toBe(50);
  });
  it('한국인 공통 취약 세트에 f·v·r·l·th·dh 포함', () => {
    for (const p of ['f', 'v', 'r', 'l', 'th', 'dh']) expect(KO_WEAK_PHONEMES).toContain(p);
  });
});

/* 적대 검증(prosody-engine-review)이 확증한 결함 4건 고정 (2026-08-29) */
describe('computeDeductionScore — 검증 발견 반영', () => {
  const W = (word, score) => ({ word, score });

  it('ja(1토큰 기대문) — 전사가 달라도 0점으로 붕괴하지 않는다 (missing 축 미적용·바닥 50)', () => {
    const r = computeDeductionScore({
      recognizedText: 'ちょっと待って',                     // 기대문과 다름 → 종전엔 missing 100 + floor 0
      wordScores: [W('ちょっと', 90), W('待って', 80)],
      fluencyScore: 100, prosodyScore: 100,
    }, 'ちょっと待ってください');
    expect(r.floor).toBe(50);
    expect(r.deductions.find((d) => d.axis === 'missing')).toBeUndefined();
    expect(r.score).toBeGreaterThanOrEqual(50);
  });

  it('누락 단어는 missing 축에서만 깎인다 — wordScores 의 Omission 0점 항목과 이중 감점 금지', () => {
    // 실경로(enableMiscue:true)에서 Azure 는 누락 단어를 wordScores 에 0점으로 싣는다.
    const r = computeDeductionScore({
      recognizedText: 'sorry could you',
      wordScores: [W('sorry', 100), W('could', 100), W('you', 100), W('say', 0)],  // say = Omission 0점
      omissions: ['say'],
      fluencyScore: 100, prosodyScore: 100,
    }, 'sorry could you say');
    expect(r.deductions.find((d) => d.axis === 'words')).toBeUndefined();          // 말한 단어들은 만점
    expect(r.deductions.find((d) => d.axis === 'missing').points).toBe(25);        // 1/4 지분만
    expect(r.score).toBe(75);
  });

  it('ja 취약 판정 — 비ASCII 단어가 전부 취약으로 오염되지 않는다 (유니코드 norm)', () => {
    const r = computeDeductionScore({
      recognizedText: 'ちょっと 待って',
      wordScores: [W('ちょっと', 60), W('待って', 60)],
      phonemeScores: [{ symbol: 'r', word: 'ちょっと', score: 40 }],   // ちょっと 만 취약
      fluencyScore: 100, prosodyScore: 100,
    }, 'ちょっと 待って');
    // 예산 15씩 · 결손 0.4 → ちょっと 15×0.4×1.5=9, 待って 15×0.4×1=6 → 15 (오염 시 18)
    expect(r.deductions.find((d) => d.axis === 'words').points).toBe(15);
  });

  it('rates 를 바꿔도 바닥이 축 상한 합에서 유도된다 (하드코딩 50 아님)', () => {
    const rates = { words: { max: 20, weakMultiplier: 1.5 }, fluency: { max: 10, perPoint: 0.25 },
      intonation: { max: 10, perMonotoneWord: 1, perProsodyPoint: 0.15 }, missing: { share: 100 } };
    const r = computeDeductionScore({
      recognizedText: 'a b', wordScores: [W('a', 0), W('b', 0)], fluencyScore: 0, prosodyScore: 0,
      prosodyIssues: { monotoneWords: ['a', 'b'], unexpectedBreaks: [], missingBreaks: [] },
    }, 'a b', { rates });
    expect(r.floor).toBe(60);       // 100 − (20+10+10)
    expect(r.score).toBe(60);
  });
});

/* 반복·덧붙임 감점 (2026-08-29 실사용 보고 "버벅댔는데 90점대") — 라이브 실측:
 * 버벅임(단어 반복·문장 재시작)은 AccuracyScore 를 거의 안 깎고(98·99) FluencyScore 만 내려간다
 * (62·61). 그런데 Azure 유창성은 지오 실발화("again. Again." 꼬리 반복)에 92 를 줄 만큼 관대한
 * 경우가 있어, 반복의 직접 증거인 Insertion 을 유창 축에서 함께 깎는다. 정상 발화 실측 ins 0. */
describe('computeDeductionScore — 반복·덧붙임(Insertion)', () => {
  const EXP = 'I had to ask him to say it again';
  const words = EXP.toLowerCase().split(' ');

  it('삽입 단어는 유창 축에서 깎는다 — 지오 실발화형(flu 92·꼬리 "Again." 반복)', () => {
    const r = computeDeductionScore({
      recognizedText: 'I had to ask him to say it again. Again.',
      wordScores: [...words.map((w) => W(w, 100)), W('again', 100)],
      fluencyScore: 92,
      insertions: ['again'],
    }, EXP);
    const flu = r.deductions.find((d) => d.axis === 'fluency');
    expect(flu.points).toBe(4);                       // (100−92)×0.25 = 2 + 1단어×2
    expect(flu.label).toMatch(/반복|덧붙임/);
  });

  it('삽입 없으면 유창 감점은 연속 점수 결손만 — 기존 계약 불변', () => {
    const r = computeDeductionScore({
      recognizedText: EXP,
      wordScores: words.map((w) => W(w, 100)),
      fluencyScore: 92,
    }, EXP);
    expect(r.deductions.find((d) => d.axis === 'fluency').points).toBe(2);
  });

  it('유창 미측정이어도 삽입 증거가 있으면 깎는다 — 삽입은 miscue 응답의 실측값', () => {
    const r = computeDeductionScore({
      recognizedText: 'I had to I had to ask him to say it again',
      wordScores: words.map((w) => W(w, 100)),
      insertions: ['i', 'had', 'to'],
    }, EXP);
    expect(r.deductions.find((d) => d.axis === 'fluency').points).toBe(6);   // 3단어×2
  });

  it('유창 축 상한(10)은 삽입을 더해도 넘지 않는다 — 버벅임 실측 앵커(flu 62·ins 1)', () => {
    const r = computeDeductionScore({
      recognizedText: 'I had to ask him to say it again. Again.',
      wordScores: [...words.map((w) => W(w, 100)), W('again', 100)],
      fluencyScore: 62,
      insertions: ['again'],
    }, EXP);
    expect(r.deductions.find((d) => d.axis === 'fluency').points).toBe(10);  // min(10, 9.5+2)
  });

  it('ja(1토큰 기대문)에는 삽입 감점을 적용하지 않는다 — 실측 없는 언어로 확대 금지', () => {
    const r = computeDeductionScore({
      recognizedText: 'そうなんだよ',
      wordScores: [W('そうなんだ', 100)],
      insertions: ['よ'],
    }, 'そうなんだ');
    expect(r.deductions.find((d) => d.axis === 'fluency')).toBeUndefined();
  });
});

/* 2026-08-29 오후 적대 감사 확증분 — 축 입력의 결측·오염 회귀 방지.
 * ① null 저장 형태(pronunciationLog 가 미측정을 ?? null 로 영속화)가 0점으로 강제 변환돼 만점 감점
 * ② ja 문중 구두점(、) 문장이 절 2토큰이 되어 missing 축이 절 단위 50~100점을 깎음
 * ③ 이름 전체 Omission 제외가 같은 철자의 실발화 항목까지 지움 (라이브 G1: that 21점 증발)
 * ④ 삽입 단어가 words 예산 분모를 희석해 깨끗한 반복이 점수를 올림 (방향 역전 실측 재현) */
describe('computeDeductionScore — 적대 감사 확증 회귀 방지', () => {
  const EXP4 = 'sorry could you say';
  const words4 = EXP4.split(' ');

  it('fluencyScore·prosodyScore 가 null(저장 형태)이면 미측정 — 깎지 않는다', () => {
    const r = computeDeductionScore({
      recognizedText: EXP4,
      wordScores: words4.map((w) => W(w, 100)),
      fluencyScore: null, prosodyScore: null,
    }, EXP4);
    expect(r.score).toBe(100);
    expect(r.deductions).toHaveLength(0);
  });

  it('fluency null + 삽입 증거 → 삽입분만 깎인다', () => {
    const r = computeDeductionScore({
      recognizedText: 'sorry could you say say',
      wordScores: [...words4.map((w) => W(w, 100)), W('say', 100)],
      fluencyScore: null, insertions: ['say'],
    }, EXP4);
    expect(r.deductions.find((d) => d.axis === 'fluency').points).toBe(2);
  });

  it('ja 문중 구두점 정발화(Display 변형)가 절 단위 missing 으로 붕괴하지 않는다', () => {
    const r = computeDeductionScore({
      recognizedText: 'はい持ち帰りです',                       // Azure Display 가 쉼표를 안 붙인 경우
      wordScores: [W('はい', 96), W('持ち帰りです', 98)],
      fluencyScore: 98,
    }, 'はい、持ち帰りです。');
    expect(r.floor).toBe(50);
    expect(r.deductions.find((d) => d.axis === 'missing')).toBeUndefined();
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('버벅임(깨끗한 반복 삽입)이 점수를 올리지 못한다 — 삽입 단어는 words 예산 분모에서 빠진다', () => {
    const a = computeDeductionScore({
      recognizedText: EXP4,
      wordScores: words4.map((w) => W(w, 50)),
    }, EXP4);
    const b = computeDeductionScore({
      recognizedText: 'sorry could you say say',
      wordScores: [...words4.map((w) => W(w, 50)), W('say', 100)],
      insertions: ['say'],
    }, EXP4);
    expect(b.score).toBeLessThan(a.score);   // 종전엔 분모 희석(30/5)이 삽입 감점 2 를 넘겨 역전했다
  });

  it('같은 철자의 실발화는 Omission 제외에 휩쓸리지 않는다 — 개수 단위·낮은 점수부터 (라이브 G1)', () => {
    const r = computeDeductionScore({
      recognizedText: 'That say.',
      wordScores: [W('that', 21), W('Sorry', 0), W('could', 0), W('you', 0), W('say', 12),
        W('that', 0), W('again', 0), W('more', 0), W('slowly', 0)],
      omissions: ['Sorry', 'could', 'you', 'that', 'again', 'more', 'slowly'],
    }, 'Sorry could you say that again more slowly');
    // omission 'that' 1건은 0점 항목만 걷어낸다 — 실발화 that(21)은 words 축에 남는다
    const wordsDed = r.deductions.find((d) => d.axis === 'words');
    expect(wordsDed.detail.some((w) => w.word === 'that' && w.score === 21)).toBe(true);
  });
});
