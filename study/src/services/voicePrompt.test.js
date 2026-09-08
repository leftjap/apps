import { describe, it, expect } from 'vitest';
import { buildVoicePrompt, normalizeVoiceItems } from './voicePrompt.js';

describe('buildVoicePrompt — ChatGPT 음성 모드 회화 연습 프롬프트 (연구 기반)', () => {
  it('오늘 학습한 표현을 목표로 포함', () => {
    const p = buildVoicePrompt(['close by', 'take a break']);
    expect(p).toContain('close by');
    expect(p).toContain('take a break');
  });

  it('연구 핵심 규칙을 명시', () => {
    const p = buildVoicePrompt(['x']);
    expect(p).toMatch(/ENGLISH ONLY/i); // 영어 몰입
    expect(p).toMatch(/2 short|two short|MAX 2|max two/i); // 턴 ≤2문장
    expect(p).toMatch(/\bquestion\b/i); // 질문 주도
    expect(p).toMatch(/one more time|try .* again|self-correct|yourself/i); // 자가수정(prompt) 우선
    expect(p).toMatch(/\bKorean\b/i); // L1 최소·전략적
    expect(p).toMatch(/wait/i); // 발화 대기(끼어들기 금지)
  });

  it('역할극 시나리오(여행·일상)와 자가수정 후 명시 교정 지시', () => {
    const p = buildVoicePrompt(['x']);
    expect(p).toMatch(/hotel|order|directions|travel|daily/i);
    expect(p).toMatch(/slow/i); // 천천히·또렷이 (듣기 약점)
  });

  it('표현 비어도 안전한 문자열 반환', () => {
    const p = buildVoicePrompt([]);
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(200);
  });

  it('비배열 입력 안전', () => {
    expect(typeof buildVoicePrompt(null)).toBe('string');
    expect(typeof buildVoicePrompt(undefined)).toBe('string');
  });

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
});
