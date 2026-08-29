import { describe, it, expect } from 'vitest';
import { judgeCoverage, judgeProduction, judgeMisread, judgeRecording, isTooUnclear } from './coverageJudge.js';

describe('judgeCoverage — 전사 vs 기대문 커버리지 (체이닝 통과 판정, 엔진 무관)', () => {
  it('완전 일치 → pass, missing 없음, coverage 1', () => {
    const r = judgeCoverage('I got it', 'I got it');
    expect(r.pass).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.coverage).toBe(1);
  });

  it('단어 누락 → pass false, missing 에 해당 단어', () => {
    const r = judgeCoverage('I got', 'I got it');
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['it']);
  });

  it('덧붙인 말(insertion)은 허용 → pass true, extra 에 실림', () => {
    const r = judgeCoverage('I got it man', 'I got it');
    expect(r.pass).toBe(true);
    expect(r.extra).toEqual(['man']);
    expect(r.missing).toEqual([]);
  });

  it('축약형 동치 처리 (양방향)', () => {
    expect(judgeCoverage("it's", 'it is').pass).toBe(true);
    expect(judgeCoverage('it is', "it's").pass).toBe(true);
    expect(judgeCoverage("I'm going", 'I am going').pass).toBe(true);
  });

  it('대소문자·구두점 무시', () => {
    const r = judgeCoverage('I GOT IT.', 'i got it');
    expect(r.pass).toBe(true);
  });

  it('다른 단어로 오인(got→hate)은 누락+추가로 잡힘 → pass false', () => {
    const r = judgeCoverage('I hate it', 'I got it');
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['got']);
    expect(r.extra).toEqual(['hate']);
  });

  it('빈 전사 → 전부 누락, pass false', () => {
    const r = judgeCoverage('', 'I got it');
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['i', 'got', 'it']);
    expect(r.coverage).toBe(0);
  });

  it('Azure 실패 재현 케이스: 끝 잘린 전사 → 남은 단어 누락으로 잡힘', () => {
    // 실측: "I was thinking about going to the" (beach this weekend 잘림)
    const r = judgeCoverage(
      'I was thinking about going to the',
      'I was thinking about going to the beach this weekend',
    );
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['beach', 'this', 'weekend']);
  });

  it('기대문이 비면 pass false (판정 대상 없음)', () => {
    expect(judgeCoverage('anything', '').pass).toBe(false);
  });

  // 2026-07-12 실DB 실측: Azure Display 는 아포스트로피를 생략한다 ("Lets keep in touch.",
  // "I cant believe its been a year."). 기대문은 축약형(Let's) → 불일치 → 완주해도 false fail.
  it('Azure 아포스트로피 생략 전사 ↔ 축약형 기대문 동치 (실DB 재현)', () => {
    expect(judgeCoverage('Lets keep in touch.', "Let's keep in touch").pass).toBe(true);
    expect(judgeCoverage('I cant believe its been a year.', "I can't believe it's been a year").pass).toBe(true);
  });

  it('아포스트로피 생략 전사 ↔ 펼친 기대문 동치', () => {
    expect(judgeCoverage('dont do it', 'do not do it').pass).toBe(true);
    expect(judgeCoverage('lets go', 'let us go').pass).toBe(true);
  });
});

/* judgeProduction (2026-07-23) — 생산 연습 통과 3중 기준: 커버리지 + 문장 정확도 + 단어 하한.
 * 실측(합성음성 → Azure PA, 2026-07-23): 정확 발화는 단어 최저 91, 엉뚱 단어는 0~21 —
 * 단어 하한 40 이 "일부 단어만 엉뚱한데 문장 평균은 65+" 인 취약 창을 봉쇄한다. */
describe('judgeProduction — 커버리지 + 문장 정확도 + 단어 하한', () => {
  const EXP = "It'll just take a minute.";

  it('완전 엉뚱 발화 (실측: score 5, 누락 3) → fail', () => {
    const r = judgeProduction({
      score: 5, recognizedText: 'Just a take.',
      wordScores: [{ word: "It'll", score: 0 }, { word: 'just', score: 21 }, { word: 'a', score: 82 }, { word: 'take', score: 2 }, { word: 'a', score: 0 }, { word: 'minute', score: 0 }],
    }, EXP);
    expect(r.pass).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it('정확 발화 (실측: score 96, 단어 최저 91) → pass', () => {
    const r = judgeProduction({
      score: 96, recognizedText: "I'll be there in a minute.",
      wordScores: [{ word: "i'll", score: 91 }, { word: 'be', score: 100 }, { word: 'there', score: 97 }, { word: 'in', score: 100 }, { word: 'a', score: 100 }, { word: 'minute', score: 91 }],
    }, "I'll be there in a minute.");
    expect(r.pass).toBe(true);
    expect(r.badWords).toEqual([]);
  });

  it('취약 창: 커버리지 통과 + 문장 79점인데 한 단어가 10점 → 단어 하한이 차단', () => {
    const r = judgeProduction({
      score: 79, recognizedText: EXP,
      wordScores: [{ word: "it'll", score: 95 }, { word: 'just', score: 92 }, { word: 'take', score: 10 }, { word: 'a', score: 96 }, { word: 'minute', score: 94 }],
    }, EXP);
    expect(r.pass).toBe(false);
    expect(r.badWords).toEqual(['take']);
  });

  it('wordScores 없는 응답(하위호환)·문장 80 + 커버리지 통과 → pass', () => {
    const r = judgeProduction({ score: 80, recognizedText: EXP }, EXP);
    expect(r.pass).toBe(true);
  });

  it('문장 정확도 하한(기본 65) 미달 → fail', () => {
    const r = judgeProduction({ score: 40, recognizedText: EXP }, EXP);
    expect(r.pass).toBe(false);
    expect(r.accuracy).toBe(40);
  });
});

/* judgeMisread (2026-08-29) — '이 문장을 말한 게 아니다' 판정. 사용자 보고: "다른 문장을 말했는데도
 * 50점대". 아래 수치는 전부 라이브 Azure 실측(2026-08-29, enableMiscue:true, 합성음성 22케이스)
 * + 지오 실기록 391건에서 뽑은 실제 값이다 — 임의 임계값이 아니다.
 *   · 커버리지 단독은 못 쓴다: 정상 발화 0.800(Azure 가 Im→In 오인) vs 다른 문장 0.625 로 겹친다.
 *   · 일본어는 공백 분절이 없어 정답 발화도 커버리지 0 이다.
 *   · 정확도 단독도 못 쓴다: 지오 실기록 391건 중 44건이 50점 미만인데 전사는 정상이었다.
 * → 두 신호가 **모두** 바닥일 때만 버린다. */
describe('judgeMisread — 두 신호가 모두 바닥일 때만 오발화', () => {
  const EXP12 = 'I know what I mean but I cant put it into words';

  it('정답 발화(전사 일치·96점) → 오발화 아님', () => {
    const r = judgeMisread({ score: 96, recognizedText: 'I know what I mean but I cant put it into words.' }, EXP12);
    expect(r.misread).toBe(false);
  });

  it('단어는 다 말했고 발음만 나쁨(21점) → 오발화 아님 (실기록 <50점 44건을 지키는 조항)', () => {
    const r = judgeMisread({ score: 21, recognizedText: 'I know what I mean but I cant put it into words.' }, EXP12);
    expect(r.misread).toBe(false);
    expect(r.coverage).toBe(1);
  });

  it("Azure 가 Im 을 In 으로 오인한 정답 발화(커버리지 0.80·86점) → 오발화 아님", () => {
    const r = judgeMisread(
      { score: 86, recognizedText: 'In not sure how to explain it in English.' },
      'Im not sure how to explain it in English',
    );
    expect(r.misread).toBe(false);
  });

  it('앞부분만 말하고 끊김(커버리지 0.67·65점) → 오발화 아님 (정확도가 살아 있다)', () => {
    const r = judgeMisread({ score: 65, recognizedText: 'I know what I mean but I cant.' }, EXP12);
    expect(r.misread).toBe(false);
  });

  it('다음 문장을 말함(커버리지 0.50·22점) → 오발화', () => {
    const r = judgeMisread({ score: 22, recognizedText: 'It mean I it I I put.' }, EXP12);
    expect(r.misread).toBe(true);
  });

  it('아무 발음(커버리지 0.14·2점) → 오발화', () => {
    const r = judgeMisread({ score: 2, recognizedText: 'What?' }, 'What do you mean by that exactly');
    expect(r.misread).toBe(true);
  });

  it('일본어 정답 발화 — 오발화 아님 (전각 구두점 제거 후 커버리지 1 · 1토큰 퇴화 가드도 겹으로)', () => {
    const r = judgeMisread({ score: 98, recognizedText: 'そうなんだ。' }, 'そうなんだ');
    expect(r.coverage).toBe(1);   // 2026-08-29 전각 구두점 제거로 0 → 1
    expect(r.misread).toBe(false);
  });

  it('일본어 다른 문장(커버리지 0·11점) — misread 는 판정하지 않고(1토큰 퇴화 가드) 음질 게이트가 잡는다', () => {
    // 2026-08-29 계약 변경: ja 는 coverage 가 항상 0 이라 misread 가 acc 단독 판정으로 퇴화했었다.
    // 실측상 ja 오발화는 음소 원시 점수도 바닥이므로 judgeRecording 의 unclear 로 걸러진다.
    expect(judgeMisread({ score: 11, recognizedText: 'だ。そう。' }, 'そうなんだ').misread).toBe(false);
    const ph = Array.from({ length: 8 }, () => ({ symbol: 'x', word: 'w', score: 11 }));
    const r = judgeRecording({ score: 11, recognizedText: 'だ。そう。', phonemeScores: ph }, 'そうなんだ');
    expect(r.record).toBe(false);
    expect(r.reason).toBe('unclear');
  });

  it('전사가 비어 있어도 점수가 살아 있으면 버리지 않는다 (판정 근거 부족)', () => {
    const r = judgeMisread({ score: 92 }, EXP12);
    expect(r.misread).toBe(false);
  });

  it('mock 폴백은 판정 대상이 아니다 — 호출부가 먼저 거르므로 오발화 아님으로 통과', () => {
    expect(judgeMisread({ mockFallback: true, score: 60 }, EXP12).misread).toBe(false);
  });
});

/* 녹음 품질 판정 (2026-08-29) — 사용자 지적: "엉뚱한 문장인데 50점이 말이 되냐".
 * 뿌리는 Azure AccuracyScore 가 저점 구간에서 실제 음향 일치도보다 크게 부풀려지는 것이다.
 * 공식 문서: "word and full text accuracy scores are aggregated from the phoneme-level accuracy
 * score, **and refined with assessment objectives**" — 그 refine 이 바닥을 다진다.
 *
 * 지오 실기록(rms 기록 있는 26건) 실측:
 *   정상 19건 — 음소 0점 0개 · 음소평균 65.2~97.7 · 표시 acc 75~98   (acc 가 실체와 일치)
 *   문제  7건 — 음소 0점 15~100% · 음소평균 0~28.8 · 표시 acc 23~63  (acc 가 실체와 괴리)
 * 라이브 재현(신호를 잡음에 묻음): 음소평균 42.7 인데 표시 acc 82 — enableMiscue:true 로도 안 걸린다.
 * 상한 확인: 원어민 90~96 · 강한 한국어 액센트 67~85 · 극단 끊어읽기 82 → 임계 50 은 정상 발화에 여유. */
describe('judgeRecording — 오발화 + 녹음 품질 통합 판정', () => {
  const EXP = 'Sorry could you say that again more slowly';
  const ph = (mean, n = 26) => Array.from({ length: n }, () => ({ symbol: 'x', word: 'w', score: mean }));

  it('정상 발화는 기록한다 (음소평균 95)', () => {
    const r = judgeRecording({ score: 96, recognizedText: EXP, phonemeScores: ph(95) }, EXP);
    expect(r.record).toBe(true);
    expect(r.reason).toBe(null);
  });

  it('강한 한국어 액센트 하한(음소평균 67)도 기록한다', () => {
    expect(judgeRecording({ score: 77, recognizedText: EXP, phonemeScores: ph(67) }, EXP).record).toBe(true);
  });

  it('지오 정상 발화 최저(음소평균 65.2·acc 83)도 기록한다', () => {
    expect(judgeRecording({ score: 83, recognizedText: EXP, phonemeScores: ph(65.2) }, EXP).record).toBe(true);
  });

  it('표시 acc 82 여도 음소 원시 평균이 42.7 이면 버린다', () => {
    const r = judgeRecording({ score: 82, recognizedText: EXP, phonemeScores: ph(42.7) }, EXP);
    expect(r.record).toBe(false);
    expect(r.reason).toBe('unclear');
  });

  it('실기록 문제 케이스(acc 58·음소평균 10.4)를 버린다', () => {
    expect(judgeRecording({ score: 58, recognizedText: EXP, phonemeScores: ph(10.4) }, EXP).reason).toBe('unclear');
  });

  it('다른 문장은 오발화로 구분한다 (음질은 멀쩡)', () => {
    const r = judgeRecording({ score: 6, recognizedText: 'How long will it take', phonemeScores: ph(90) }, EXP);
    expect(r.record).toBe(false);
    expect(r.reason).toBe('misread');
  });

  it('소리와 내용이 함께 바닥이면 원인을 단정하지 않는다 — garbled (약한 신호인지 다른 문장인지 가를 근거가 없다)', () => {
    const r = judgeRecording({ score: 6, recognizedText: 'How long', phonemeScores: ph(12) }, EXP);
    expect(r.record).toBe(false);
    expect(r.reason).toBe('garbled');
  });

  it('또렷한 오발화도 garbled — 라이브 실측(2026-08-29): 원어민 TTS 가 다른 문장을 말해도 acc 2·음소평균 31 로 unclear 에 오인되던 사례', () => {
    // "The weather is really nice today." 를 EXP 레퍼런스에 넣은 라이브 캡처 축약 픽스처.
    // 오발화는 음소 정렬도 함께 무너지므로 unclear 단독 판정이 "또렷하게 안 들렸어요"로 오안내했다.
    const r = judgeRecording({ score: 2, recognizedText: 'That say.', phonemeScores: ph(31.2, 5) }, EXP);
    expect(r.record).toBe(false);
    expect(r.reason).toBe('garbled');
  });

  it('음소 데이터가 없으면 음질을 묻지 않는다 (판정 근거 부족 — 기존 계약 보존)', () => {
    expect(judgeRecording({ score: 92, recognizedText: EXP }, EXP).record).toBe(true);
    expect(judgeRecording({ score: 92, recognizedText: EXP, phonemeScores: [] }, EXP).record).toBe(true);
  });

  it('단어를 다 말한 저점(발음만 나쁨)은 음질만 받쳐주면 기록한다', () => {
    expect(judgeRecording({ score: 21, recognizedText: EXP, phonemeScores: ph(66) }, EXP).record).toBe(true);
  });

  it('ja 문중 구두점 문장의 오발화도 misread 를 세우지 않는다 — 가드는 토큰 수가 아니라 원문 공백 기준', () => {
    // 전각 구두점(、)이 공백으로 치환돼 expTokens 2 가 되면서 1토큰 가드가 무력화되던 결함
    // (2026-08-29 오후 적대 감사 확증 — 예: 'はい、持ち帰りです。' 가 절 2개로 쪼개져 비교됨).
    expect(judgeMisread({ score: 11, recognizedText: 'いいえ。' }, 'はい、持ち帰りです。').misread).toBe(false);
    const r = judgeRecording({ score: 11, recognizedText: 'いいえ。', phonemeScores: ph(11) }, 'はい、持ち帰りです。');
    expect(r.reason).toBe('unclear');   // garbled 아님 — 내용 비교 불가 언어는 음질만 지목한다
  });
});

/* 음질 판정을 단독으로도 쓸 수 있어야 한다 (2026-08-29) — 체이닝·생산 연습은 통과 판정이 따로
 * 있으므로(judgeCoverage / judgeProduction) 오발화 판정은 필요 없고 음질만 물어야 한다. */
describe('isTooUnclear — 음질 단독 판정', () => {
  const ph = (mean, n = 26) => Array.from({ length: n }, () => ({ symbol: 'x', word: 'w', score: mean }));
  it('음소평균 40.8(합성 취약 구간)이면 참', () => {
    expect(isTooUnclear({ score: 82, phonemeScores: ph(40.8) })).toBe(true);
  });
  it('음소평균 65.2(실기록 정상 최저)이면 거짓', () => {
    expect(isTooUnclear({ score: 83, phonemeScores: ph(65.2) })).toBe(false);
  });
  it('음소 데이터가 없으면 묻지 않는다 (기존 계약 보존)', () => {
    expect(isTooUnclear({ score: 90 })).toBe(false);
    expect(isTooUnclear({ score: 90, phonemeScores: [] })).toBe(false);
  });
  it('judgeRecording 의 unclear 판정과 같은 기준을 쓴다', () => {
    const r = { score: 82, recognizedText: 'x', phonemeScores: ph(40.8) };
    expect(judgeRecording(r, 'x').reason).toBe('unclear');
    expect(isTooUnclear(r)).toBe(true);
  });
});

/* 판정 견고화 (2026-08-29 전면 재감사 발견 반영) */
describe('judgeRecording 견고화 — 결측 음소·초소형 표본·ja 퇴화', () => {
  const ph = (mean, n = 26) => Array.from({ length: n }, () => ({ symbol: 'x', word: 'w', score: mean }));

  it('score 가 결측·비수치인 음소 항목은 0(최악값)이 아니라 제외하고 평균한다', () => {
    // 종전엔 결측 → 0 으로 계산돼 '근거 없으면 판정 안 한다' 계약이 항목 단위에서 뒤집혔다.
    const scores = [...ph(80, 10), { symbol: 'y', word: 'w' }, { symbol: 'z', word: 'w', score: 'bad' }];
    const r = judgeRecording({ score: 85, recognizedText: 'x y', phonemeScores: scores }, 'x y');
    expect(r.phonemeMean).toBe(80);   // 결측 2개 제외 — 0 포함이면 66.7
    expect(r.record).toBe(true);
  });

  it('유효 음소가 하나도 없으면 음질을 판정하지 않는다', () => {
    const r = judgeRecording({ score: 85, recognizedText: 'x', phonemeScores: [{ symbol: 'a' }] }, 'x');
    expect(r.phonemeMean).toBe(null);
    expect(r.record).toBe(true);
  });

  it('음소 4개 미만이면 통계 불안정 — 음질로 버리지 않는다', () => {
    const r = judgeRecording({ score: 80, recognizedText: 'hi', phonemeScores: ph(20, 3) }, 'hi');
    expect(r.record).toBe(true);      // 3개 표본의 낮은 평균으로는 안 버린다
  });

  it('ja 처럼 기대문이 1토큰이면 오발화(misread)를 판정하지 않는다 — coverage 가 항상 0이라 무의미', () => {
    // 종전엔 acc<40 단독으로 misread 가 떠서, 정답을 발음만 나쁘게 말한 ja 발화에
    // "다른 문장을 말한 것 같아요" 가 나갈 수 있었다. ja 는 음질 게이트(unclear)만 묻는다.
    const r = judgeMisread({ score: 30, recognizedText: 'そうなんだ。' }, 'そうなんだ');
    expect(r.misread).toBe(false);
  });

  it('기대문 2토큰 이상이면 misread 판정은 종전대로다 (en 회귀 방지)', () => {
    expect(judgeMisread({ score: 22, recognizedText: 'It mean I it I I put.' },
      'I know what I mean but I cant put it into words').misread).toBe(true);
  });
});

/* 전각 구두점 (2026-08-29 재감사 확증) — toTokens 의 구두점 클래스에 、。！？ 가 없어
 * ja 전사('そうなんだ。')와 기대문('そうなんだ')이 토큰 불일치했다. ja 는 어차피 1토큰이라
 * misread 퇴화 가드가 덮지만, 혼용 문장·향후 소비자를 위해 normalizeReferenceText 와 맞춘다. */
describe('judgeCoverage — 전각 구두점 제거', () => {
  it('ja 구두점만 다른 전사는 같은 토큰이 된다', () => {
    const r = judgeCoverage('そうなんだ。', 'そうなんだ');
    expect(r.missing).toEqual([]);
    expect(r.coverage).toBe(1);
  });
  it('전각 물음표·느낌표도 제거된다', () => {
    expect(judgeCoverage('お昼、食べる？', 'お昼、食べる').pass).toBe(true);
  });
});
