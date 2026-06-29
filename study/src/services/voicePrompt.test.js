import { describe, it, expect } from 'vitest';
import { buildVoicePrompt } from './voicePrompt.js';

describe('buildVoicePrompt — Haiku 음성모드 회화 연습 프롬프트 (연구 기반)', () => {
  it('오늘 학습한 표현을 목표로 포함', () => {
    const p = buildVoicePrompt(['close by', 'take a break']);
    expect(p).toContain('close by');
    expect(p).toContain('take a break');
  });

  it('연구 핵심 규칙을 명시 (Haiku 는 초명시 필요)', () => {
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
});
