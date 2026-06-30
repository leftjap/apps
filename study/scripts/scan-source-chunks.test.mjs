import { describe, it, expect } from 'vitest';
import { extractBasicVerbChunks } from './scan-source-chunks.mjs';

describe('extractBasicVerbChunks — 소스 라인에서 기본동사 청크 후보만 surface', () => {
  it('기본동사 + 전치사/particle 구동사', () => {
    expect(extractBasicVerbChunks("I'd go with the rows.")).toContain('go with');
    expect(extractBasicVerbChunks('Hold on a second.')).toContain('hold on');
  });

  it('기본동사 + 목적대명사 + particle (구동사 lemma 로 정규화)', () => {
    expect(extractBasicVerbChunks('Can you help me out?')).toContain('help out');
    expect(extractBasicVerbChunks("I'll call you back.")).toContain('call back');
  });

  it('기본동사 + a/the + 명사 콜로케이션', () => {
    expect(extractBasicVerbChunks("Let's take a break.")).toContain('take a break');
  });

  it('비기본동사 머리 구동사("wrap it up")는 surface 안 함', () => {
    expect(extractBasicVerbChunks('Please wrap it up now.')).toEqual([]);
  });

  it('빈/비문자 입력 안전', () => {
    expect(extractBasicVerbChunks('')).toEqual([]);
    expect(extractBasicVerbChunks(null)).toEqual([]);
    expect(extractBasicVerbChunks('What? Hello?')).toEqual([]);
  });
});
